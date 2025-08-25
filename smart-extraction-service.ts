import { requestUrl } from 'obsidian';
import { Readability } from '@mozilla/readability';
import { OpenAIService, TaskAnalysis } from './openai-service';
import { TaskExtractionService } from './task-extraction-service';
import { TodoAIService, TodoAISummaryResult } from './todo-ai-service';
import { ExtractedTask, ResearchUrl, TodoItem, Board, Card, AISummary } from './types';
import CrystalBoardsPlugin from './main';

export interface SmartExtractApproval {
	approved: boolean;
	selectedCards: SmartCard[];
	modifications: Record<string, {
		title?: string;
		description?: string;
		context?: string;
		nextSteps?: string[];
	}>;
}

export interface SmartCard {
	id: string;
	title: string;
	description: string;
	tags: string[];
	noteLinks: string[];
	todos: TodoItem[];
	researchUrls: ResearchUrl[];
	created: number;
	modified: number;
	// AI-generated fields
	aiAnalysis?: TaskAnalysis;
	aiSummary?: AISummary;
	linkedNote?: {
		path: string;
		name: string;
		created: number;
	};
	originalTask: ExtractedTask;
	confidence: number;
}

export interface SmartExtractionResult {
	success: boolean;
	tasksAnalyzed: number;
	smartCards: SmartCard[];
	boardsCreated: string[];
	boardsUpdated: string[];
	errors: string[];
	processingTime: number;
}

export interface SmartExtractionPreview {
	smartCards: SmartCard[];
	totalTasks: number;
	estimatedCost: number;
	averageConfidence: number;
}

export class SmartExtractionService {
	private plugin: CrystalBoardsPlugin;
	private openAIService: OpenAIService;
	private todoAIService: TodoAIService;
	private baseExtractionService: TaskExtractionService;
	private urlCache = new Map<string, { content: string; timestamp: number }>();

	constructor(plugin: CrystalBoardsPlugin) {
		this.plugin = plugin;
		this.baseExtractionService = plugin.taskExtractionService;
		this.todoAIService = new TodoAIService(plugin);
		this.initializeOpenAI();
	}

	private initializeOpenAI(): void {
		const settings = this.plugin.settings;
		this.openAIService = new OpenAIService({
			apiKey: settings.openAIApiKey || '',
			model: settings.openAIModel || 'gpt-4.1-mini',
			maxTokens: settings.smartExtractMaxTokens || 500,
			temperature: settings.smartExtractTemperature || 0.7
		});
	}

	/**
	 * Find appropriate board name for a given tag (using same logic as regular task extraction)
	 */
	private findBoardNameForTag(tag: string): string {
		const settings = this.plugin.settings;
		
		// Check for custom tag mappings first
		if (settings.tagMappingOverrides && settings.tagMappingOverrides[tag]) {
			return settings.tagMappingOverrides[tag];
		}

		// Try to find existing board with matching name (case-insensitive)
		const boards = this.plugin.dataManager.getBoards();
		const matchingBoard = boards.find(board => 
			board.name.toLowerCase() === tag.toLowerCase()
		);

		if (matchingBoard) {
			return matchingBoard.name;
		}

		// Return the tag as board name (will create new board if needed)
		return tag;
	}

	/**
	 * Main Smart Extract workflow - now shows preview first
	 */
	async performSmartExtraction(): Promise<SmartExtractionResult> {
		// Generate preview and show modal
		const preview = await this.generateFullPreview();
		
		// Return early if no tasks found
		if (preview.totalTasks === 0) {
			return {
				success: false,
				tasksAnalyzed: 0,
				smartCards: [],
				boardsCreated: [],
				boardsUpdated: [],
				errors: ['No tasks found to extract'],
				processingTime: 0
			};
		}

		// Show preview modal with callback for approval
		const { SmartExtractPreviewModal } = require('./smart-extract-preview-modal');
		const previewModal = new SmartExtractPreviewModal(this.plugin, preview);
		
		// Set up the callback for when extraction is approved
		previewModal.onApprovalCallback = async (approval: SmartExtractApproval) => {
			return await this.executeApprovedExtraction(approval);
		};

		previewModal.open();

		// Return a default result - the actual result will be handled by the callback
		return {
			success: true,
			tasksAnalyzed: preview.smartCards.length,
			smartCards: [],
			boardsCreated: [],
			boardsUpdated: [],
			errors: [],
			processingTime: 0
		};
	}

	/**
	 * Execute extraction based on user approval
	 */
	async executeApprovedExtraction(approval: any): Promise<SmartExtractionResult> {
		const startTime = Date.now();
		const result: SmartExtractionResult = {
			success: false,
			tasksAnalyzed: approval.selectedCards.length,
			smartCards: [],
			boardsCreated: [],
			boardsUpdated: [],
			errors: [],
			processingTime: 0
		};

		try {
			// Step 1: Create cards from approved smart cards
			const dataManager = this.plugin.dataManager;
			const selectedCards = approval.selectedCards;

			for (const smartCard of selectedCards) {
				try {
					// Apply any modifications from user edits
					const cardId = smartCard.id;
					if (approval.modifications[cardId]) {
						const modifications = approval.modifications[cardId];
						if (modifications.title) smartCard.title = modifications.title;
						if (modifications.description) smartCard.description = modifications.description;
						if (modifications.context && smartCard.aiAnalysis) {
							smartCard.aiAnalysis.context = modifications.context;
						}
						if (modifications.nextSteps) {
							smartCard.todos = modifications.nextSteps.map((step: string) => ({
								id: `todo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
								text: step,
								completed: false,
								created: Date.now()
							}));
						}
					}

					// Determine target board using hashtag-to-board mapping logic
					let boardName: string;
					if (smartCard.originalTask.tags.length > 0) {
						// Use the same logic as regular task extraction - find board for first tag
						const firstTag = smartCard.originalTask.tags[0];
						boardName = this.findBoardNameForTag(firstTag);
					} else {
						// No tags, use default board
						boardName = this.plugin.settings.defaultExtractionBoard || 'Tasks';
					}
					
					// Find or create board and add card to first column
					const boards = dataManager.getBoards();
					let targetBoard = boards.find((b: Board) => b.name === boardName);
					
					if (!targetBoard) {
						// Create new board if it doesn't exist
						const newBoard: Board = {
							id: `board-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
							name: boardName,
							folderPath: this.plugin.settings.kanbanFolderPath,
							position: boards.length,
							columns: [{
								id: `column-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
								name: this.plugin.settings.extractionColumnName || 'To Do',
								color: this.plugin.settings.defaultColumnColors[0] || '#3b82f6',
								position: 0,
								cards: []
							}],
							created: Date.now(),
							modified: Date.now()
						};
						await dataManager.addBoard(newBoard);
						targetBoard = newBoard;
						result.boardsCreated.push(boardName);
					} else {
						result.boardsUpdated.push(boardName);
					}
					
					// Add card to the first column of the target board
					const targetColumn = targetBoard.columns[0];
					if (targetColumn) {
						await dataManager.addCardToColumn(targetBoard.id, targetColumn.id, smartCard as Card);
					}

					result.smartCards.push(smartCard);

				} catch (error) {
					console.error(`Failed to create card for task: ${smartCard.title}`, error);
					result.errors.push(`Failed to create card "${smartCard.title}": ${error.message}`);
				}
			}

			result.success = result.errors.length === 0 || result.smartCards.length > 0;
			result.processingTime = Date.now() - startTime;

		} catch (error) {
			console.error('Smart extraction execution failed:', error);
			result.errors.push(`Smart extraction execution failed: ${error.message}`);
		}

		return result;
	}

	/**
	 * Extract clean content using Mozilla Readability
	 */
	private async extractWithReadability(url: string, html: string): Promise<{
		title?: string | null;
		content?: string | null;
		textContent?: string | null;
		excerpt?: string | null;
		byline?: string | null;
		siteName?: string | null;
		publishedTime?: string | null;
		length?: number | null;
		lang?: string | null;
	} | null> {
		try {
			console.log(`[DEBUG] extractWithReadability called for: ${url}`);
			console.log(`[DEBUG] HTML content length: ${html?.length || 0} chars`);
			
			// Create browser-compatible document using DOMParser
			console.log(`[DEBUG] Creating DOMParser and parsing HTML...`);
			const parser = new DOMParser();
			const doc = parser.parseFromString(html, 'text/html');
			console.log(`[DEBUG] Document parsed, title found: ${doc.title || 'none'}`);
			
			// Set the URL for relative link resolution
			if (doc.head && !doc.querySelector('base')) {
				const baseElement = doc.createElement('base');
				baseElement.href = url;
				doc.head.insertBefore(baseElement, doc.head.firstChild);
			}
			
			// Note: Skipping isProbablyReaderable check due to Electron compatibility issues
			console.log('Attempting Readability parsing...');
			
			// Parse with Readability
			console.log(`[DEBUG] Creating Readability instance with options...`);
			const reader = new Readability(doc, {
				charThreshold: 200, // Lower threshold for shorter articles
				debug: true, // Enable Readability debug mode
				keepClasses: false
			});
			console.log(`[DEBUG] Readability instance created, calling parse()...`);
			
			const article = reader.parse();
			
			console.log(`[DEBUG] Parse completed, result:`, {
				hasArticle: !!article,
				title: article?.title || 'none',
				contentLength: article?.content?.length || 0,
				textContentLength: article?.textContent?.length || 0,
				excerpt: article?.excerpt?.substring(0, 100) + '...' || 'none'
			});
			
			if (article) {
				console.log(`[DEBUG] Readability extracted article: ${article.title} (${article.length} chars)`);
				return {
					title: article.title || null,
					content: article.content || null,
					textContent: article.textContent || null,
					excerpt: article.excerpt || null,
					byline: article.byline || null,
					siteName: article.siteName || null,
					publishedTime: article.publishedTime || null,
					length: article.length || null,
					lang: article.lang || null
				};
			}
			
			console.log(`[DEBUG] Readability parsing failed - no article extracted`);
			return null;
		} catch (error) {
			console.error('[DEBUG] Mozilla Readability extraction failed:', error);
			console.error('[DEBUG] Error details:', {
				message: error.message,
				stack: error.stack?.substring(0, 500)
			});
			return null;
		}
	}

	/**
	 * Try to scrape URL content using specialized scrapers and Mozilla Readability
	 */
	async tryMCPScraping(url: string): Promise<string | null> {
		console.log(`[DEBUG] Starting tryMCPScraping for URL: ${url}`);
		console.log(`[DEBUG] URL includes reddit.com: ${url.includes('reddit.com')}`);
		try {
			// For Reddit URLs, try the JSON API approach
			if (url.includes('reddit.com')) {
				console.log('[DEBUG] Reddit URL detected, attempting JSON API scraping for:', url);
				console.log(`[DEBUG] URL analysis:`, {
					isShareUrl: url.includes('/s/'),
					isDirectPost: url.includes('/comments/'),
					urlFormat: url.includes('/s/') ? 'share-url' : url.includes('/comments/') ? 'direct-post' : 'other'
				});
				
				// Handle Reddit share URLs by expanding them first
				let actualUrl = url;
				if (url.includes('/s/')) {
					console.log('[DEBUG] Reddit share URL detected, attempting to expand...');
					try {
						// First, get the actual post URL by following redirect
						const expandResponse = await requestUrl({
							url: url,
							method: 'GET',
							headers: {
								'User-Agent': 'Crystal Boards Smart Extract v1.0'
							}
						});
						
						// Look for canonical URL in the response
						if (expandResponse.text) {
							const canonicalMatch = expandResponse.text.match(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"[^>]*>/i);
							if (canonicalMatch && canonicalMatch[1]) {
								actualUrl = canonicalMatch[1];
								console.log(`[DEBUG] Expanded Reddit URL via canonical: ${actualUrl}`);
							} else {
								console.log(`[DEBUG] No canonical URL found, trying alternative methods...`);
								// Try Reddit's special canonical-url-updater div first
								const canonicalUpdaterMatch = expandResponse.text.match(/<div[^>]*id="canonical-url-updater"[^>]*value="([^"]*)"/i);
								if (canonicalUpdaterMatch && canonicalUpdaterMatch[1] && canonicalUpdaterMatch[1] !== url) {
									actualUrl = canonicalUpdaterMatch[1];
									console.log(`[DEBUG] Expanded Reddit URL via canonical-url-updater div: ${actualUrl}`);
								} else {
									// Try og:url meta tag
									const ogUrlMatch = expandResponse.text.match(/<meta[^>]*property="og:url"[^>]*content="([^"]*)"/i);
									if (ogUrlMatch && ogUrlMatch[1] && ogUrlMatch[1] !== url) {
										actualUrl = ogUrlMatch[1];
										console.log(`[DEBUG] Expanded Reddit URL via og:url: ${actualUrl}`);
									} else {
										console.log(`[DEBUG] No canonical URL found via any method, will proceed with original URL`);
									}
								}
							}
						}
					} catch (expandError) {
						console.log(`[DEBUG] Failed to expand Reddit share URL: ${expandError.message}`);
					}
				}
				
				// Convert to JSON API URL
				let jsonUrl = actualUrl;
				if (!jsonUrl.endsWith('.json')) {
					jsonUrl = actualUrl.replace(/\/$/, '') + '.json';
				}
				console.log(`[DEBUG] Reddit JSON URL: ${jsonUrl}`);
				
				try {
					const jsonResponse = await requestUrl({
						url: jsonUrl,
						method: 'GET',
						headers: {
							'User-Agent': 'Crystal Boards Smart Extract v1.0'
						}
					});
					
					if (jsonResponse.status === 200) {
						const data = jsonResponse.json;
						console.log('[DEBUG] Reddit JSON API successful, data structure:', typeof data);
						console.log('Reddit JSON API successful');
						
						// Extract post data
						console.log(`[DEBUG] Checking data structure:`, {
							hasData: !!data,
							isArray: Array.isArray(data),
							firstElement: data?.[0] ? 'present' : 'missing',
							hasChildren: data?.[0]?.data?.children ? 'present' : 'missing'
						});
						
						if (data && data[0] && data[0].data && data[0].data.children) {
							const post = data[0].data.children[0].data;
							console.log(`[DEBUG] Reddit post found:`, {
								title: post.title?.substring(0, 100),
								author: post.author,
								subreddit: post.subreddit,
								hasContent: !!post.selftext
							});
							let content = '';
							
							if (post.title) content += `Title: ${post.title}

`;
							if (post.selftext) content += `Post Content: ${post.selftext}

`;
							if (post.url && post.url !== url) content += `External Link: ${post.url}

`;
							if (post.author) content += `Posted by: u/${post.author}
`;
							if (post.subreddit) content += `Subreddit: r/${post.subreddit}
`;
							if (post.score !== undefined) content += `Score: ${post.score} points
`;
							if (post.num_comments) content += `Comments: ${post.num_comments}
`;
							
							// Get top comments if available
							if (data[1] && data[1].data && data[1].data.children) {
								const comments = data[1].data.children.slice(0, 5).filter((c: any) => c.data && c.data.body);
								if (comments.length > 0) {
									content += '\nTop Comments:\n';
									comments.forEach((comment: any, index: number) => {
										if (comment.data.body) {
											const commentText = comment.data.body.substring(0, 300);
											content += `${index + 1}. u/${comment.data.author}: ${commentText}${commentText.length >= 300 ? '...' : ''}\n\n`;
										}
									});
								}
							}
							
							if (content.length > 100) {
								console.log(`[DEBUG] Reddit JSON extracted ${content.length} characters of content`);
								console.log(`[DEBUG] Content preview:`, content.substring(0, 200) + '...');
								console.log(`Reddit JSON extracted ${content.length} characters of content`);
								return content;
							} else {
								console.log(`[DEBUG] Reddit content too short (${content.length} chars), falling back`);
							}
						}
					}
				} catch (jsonError) {
					console.log(`[DEBUG] Reddit JSON API failed:`, {
						status: jsonError.status || 'unknown',
						message: jsonError.message,
						url: jsonUrl
					});
					console.log('Reddit JSON API failed, falling back to HTML scraping:', jsonError.message);
				}
			}

			// Step 2: Try Mozilla Readability for all URLs (including Reddit if JSON failed)
			console.log('Attempting Mozilla Readability extraction for:', url);
			
			let response;
			try {
				response = await requestUrl({
					url: url,
					method: 'GET',
					headers: {
						'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
					}
				});
			} catch (requestError) {
				// Handle network errors and HTTP errors gracefully
				if (requestError.status === 404) {
					console.log(`[DEBUG] URL returned 404 Not Found: ${url}`);
					return null;  // Return null instead of throwing
				} else if (requestError.status >= 400 && requestError.status < 500) {
					console.log(`[DEBUG] Client error ${requestError.status} for URL: ${url}`);
					return null;  // Return null instead of throwing
				} else if (requestError.status >= 500) {
					console.log(`[DEBUG] Server error ${requestError.status} for URL: ${url}`);
					return null;  // Return null instead of throwing
				} else {
					console.log(`[DEBUG] Network error for URL: ${url}`, requestError);
					return null;  // Return null instead of throwing
				}
			}

			if (response.status !== 200) {
				console.log(`[DEBUG] Unexpected status ${response.status} for URL: ${url}`);
				throw new Error(`HTTP ${response.status}`)
			}

			console.log(`[DEBUG] Response received (${response.status}), content length: ${response.text?.length || 0} chars`);
			
			// Use Mozilla Readability for content extraction
			console.log(`[DEBUG] Calling extractWithReadability for URL: ${url}`);
			const readabilityResult = await this.extractWithReadability(url, response.text);
			
			console.log(`[DEBUG] Readability result:`, {
				hasResult: !!readabilityResult,
				hasTextContent: !!(readabilityResult?.textContent),
				title: readabilityResult?.title,
				contentLength: readabilityResult?.textContent?.length || 0,
				excerptLength: readabilityResult?.excerpt?.length || 0
			});
			
			if (readabilityResult && readabilityResult.textContent) {
				// Build comprehensive content string
				let content = '';
				
				if (readabilityResult.title) {
					content += `Title: ${readabilityResult.title}\n\n`;
				}
				
				if (readabilityResult.byline) {
					content += `Author: ${readabilityResult.byline}\n`;
				}
				
				if (readabilityResult.siteName) {
					content += `Site: ${readabilityResult.siteName}\n`;
				}
				
				if (readabilityResult.publishedTime) {
					content += `Published: ${readabilityResult.publishedTime}\n`;
				}
				
				if (content !== '') content += '\n';
				
				// Add excerpt if available and different from main content start
				if (readabilityResult.excerpt && 
					!readabilityResult.textContent.toLowerCase().startsWith(readabilityResult.excerpt.toLowerCase().substring(0, 50))) {
					content += `Summary: ${readabilityResult.excerpt}\n\n`;
				}
				
				// Add main content
				content += `Content: ${readabilityResult.textContent}`;
				
				console.log(`[DEBUG] Content built successfully, total length: ${content.length} chars`);
				console.log(`[DEBUG] Content preview:`, content.substring(0, 300) + '...');
				
				// Limit content size for API efficiency
			if (content.length > 4000) {
				content = content.substring(0, 4000) + '\n\n[Content truncated for length]';
					console.log(`[DEBUG] Content truncated to ${content.length} chars`);
				}
				
				console.log(`[DEBUG] Mozilla Readability extracted ${content.length} characters of clean content`);
				return content;
			}
			
			console.log(`[DEBUG] Mozilla Readability failed - no usable content extracted`);
			return null;
			
		} catch (error) {
			console.error('Advanced content scraping failed:', error);
			return null;
		}
	}

	/**
	 * Analyze a single task with AI
	 */
	private async analyzeTaskWithAI(task: ExtractedTask): Promise<SmartCard> {
		// Step 1: Fetch and summarize URLs if present
		let urlSummaries: string[] = [];
		const enhancedUrls: Array<{ url: string; title: string; summary?: string }> = [...task.urls];

		for (const urlInfo of task.urls) {
			try {
				const summary = await this.fetchAndSummarizeURL(urlInfo.url);
				if (summary) {
					urlSummaries.push(summary);
					// Update the URL info with summary
					const urlIndex = enhancedUrls.findIndex(u => u.url === urlInfo.url);
					if (urlIndex !== -1) {
						enhancedUrls[urlIndex] = { ...urlInfo, summary };
					}
				}
			} catch (error) {
				console.warn(`Failed to summarize URL ${urlInfo.url}:`, error);
			}
		}

		// Step 2: Analyze task with OpenAI
		const urlContext = urlSummaries.length > 0 ? urlSummaries.join('\n\n') : undefined;
		const aiAnalysis = await this.openAIService.analyzeTask(task, urlContext);

		// Step 3: Build comprehensive card description combining AI analysis and URL summaries
		let cardDescription = aiAnalysis.description;
		
		// Add URL summaries to the main card description if they exist
		if (urlSummaries.length > 0) {
			cardDescription += '\n\n📚 **Research Summary:**\n';
			urlSummaries.forEach((summary, index) => {
				const urlTitle = enhancedUrls[index]?.title || `URL ${index + 1}`;
				cardDescription += `\n**${urlTitle}:**\n${summary}\n`;
			});
		}

		// Step 4: Create enhanced smart card
		const smartCard: SmartCard = {
			id: `smart-card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
			title: `${this.plugin.settings.smartExtractPrefix || '🤖 '}${task.cleanText}`,
			description: cardDescription, // ← Now includes AI analysis + URL summaries
			tags: task.tags,
			noteLinks: [],
			todos: aiAnalysis.nextSteps.map(step => ({
				id: `todo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
				text: step,
				completed: false,
				created: Date.now()
			})),
			researchUrls: enhancedUrls.map(url => ({
				id: `url-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
				url: url.url,
				title: url.title,
				// Use the actual summary if available, otherwise a default message
				description: url.summary || `🔗 Reference link for research`,
				created: Date.now(),
				status: 'unread' as const,
				importance: 'medium' as const
			})),
			created: Date.now(),
			modified: Date.now(),
			aiAnalysis,
			originalTask: task,
			confidence: aiAnalysis.confidence
		};

		return smartCard;
	}

	/**
	 * Enhanced task analysis that includes automatic note creation
	 */
	private async analyzeTaskWithAIEnhanced(task: ExtractedTask): Promise<SmartCard> {
		// Get the basic smart card
		const smartCard = await this.analyzeTaskWithAI(task);
		
		// Convert to TodoItem format for TodoAIService processing
		const todoItem: TodoItem = {
			id: smartCard.id,
			text: task.cleanText,
			completed: false,
			created: Date.now(),
			urls: task.urls.map(url => ({
				id: `url-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
				url: url.url,
				title: url.title,
				description: '',
				created: Date.now(),
				status: 'unread' as const,
				importance: 'medium' as const
			}))
		};

		// Process with TodoAIService to get automatic note creation
		try {
			const todoResult = await this.todoAIService.processTodoWithAI(todoItem, {
				createNote: true,
				linkToCard: true,
				notePath: 'AI Notes/',
				noteTemplate: ''
			});

			if (todoResult.success && todoResult.summary) {
				// Enhance the smart card with AI summary information
				smartCard.aiSummary = todoResult.summary;
				
				// Add linked note information if a note was created
				if (todoResult.note) {
					smartCard.linkedNote = {
						path: todoResult.note.path,
						name: todoResult.note.basename,
						created: Date.now()
					};
				}
			}
		} catch (error) {
			console.warn('TodoAI enhancement failed:', error);
		}

		return smartCard;
	}

	/**
	 * Fetch and summarize URL content
	 */
	private async fetchAndSummarizeURL(url: string): Promise<string> {
		console.log(`[DEBUG] ==== fetchAndSummarizeURL called for: ${url} ====`);
		try {
			// Check cache first
			const cacheKey = url;
			const cached = this.urlCache.get(cacheKey);
			const cacheExpiry = (this.plugin.settings.cacheDurationHours || 24) * 60 * 60 * 1000;
			
			if (cached && (Date.now() - cached.timestamp) < cacheExpiry) {
				console.log('[DEBUG] Using cached URL content for:', url);
				return cached.content;
			}
			
			console.log(`[DEBUG] No valid cache found, proceeding with fresh extraction`);

			// Try MCP-based scraping first for better content extraction
			console.log(`[DEBUG] Step 1: Attempting MCP-based scraping...`);
			const mcpContent = await this.tryMCPScraping(url);
			if (mcpContent) {
				console.log(`[DEBUG] Step 1 SUCCESS: MCP scraping extracted ${mcpContent.length} chars`);
				console.log(`Successfully scraped ${url} using MCP servers`);
				const summary = await this.openAIService.summarizeURL(url, mcpContent);
				
				// Cache the summary
				if (this.plugin.settings.cacheAIResponses !== false) {
					this.urlCache.set(cacheKey, { content: summary, timestamp: Date.now() });
				}
				
				return summary;
		}

		console.log(`[DEBUG] Step 1 FAILED: MCP scraping returned null, trying fallback methods`);
		console.log(`[DEBUG] Step 2: Fetching URL content directly...`);
		console.log('Fetching URL content:', url);
			
			// Fetch URL content
			const response = await requestUrl({
				url: url,
				method: 'GET',
				headers: {
					'User-Agent': 'Crystal Boards Smart Extract'
				}
			});

			if (response.status !== 200) {
				throw new Error(`HTTP ${response.status}`);
			}

			// Try Mozilla Readability as final fallback
			console.log(`[DEBUG] Step 3: Attempting Mozilla Readability as fallback...`);
			console.log('Attempting fallback Mozilla Readability extraction for:', url);
			const readabilityResult = await this.extractWithReadability(url, response.text);
			
			let content = '';
			if (readabilityResult && readabilityResult.textContent) {
				// Use clean readability content
				content = readabilityResult.textContent;
				console.log(`Fallback Readability extracted ${content.length} characters`);
			} else {
				// Ultimate fallback: basic HTML stripping
				console.log(`[DEBUG] Step 3 FAILED: Mozilla Readability returned null`);
				console.log(`[DEBUG] Step 4: Using basic HTML stripping as ultimate fallback`);
				console.log('Using basic HTML stripping as ultimate fallback');
				content = response.text;
				content = content.replace(/<script[^>]*>.*?<\/script>/gi, '');
				content = content.replace(/<style[^>]*>.*?<\/style>/gi, '');
				content = content.replace(/<[^>]*>/g, ' ');
				content = content.replace(/\s+/g, ' ').trim();
			}

			// Limit content size for API
			if (content.length > 3000) {
				content = content.substring(0, 3000) + '...';
			}

			// Summarize with OpenAI
			const summary = await this.openAIService.summarizeURL(url, content);
			
			// Cache the summary
			if (this.plugin.settings.cacheAIResponses !== false) {
				this.urlCache.set(cacheKey, { content: summary, timestamp: Date.now() });
			}

			return summary;

		} catch (error) {
			console.error(`Failed to fetch/summarize URL ${url}:`, error);
			return '';
		}
	}

	/**
	 * Get extracted tasks from the base extraction service
	 */
	private async getExtractedTasks(): Promise<ExtractedTask[]> {
		// We need to extract tasks from the source again since the base service
		// doesn't expose the parsed tasks directly
		const extractor = this.baseExtractionService['extractor']; // Access private field
		return await extractor.extractTasksFromSource();
	}

	/**
	 * Generate preview without actually creating cards (quick preview with limited AI analysis)
	 */
	async generatePreview(): Promise<SmartExtractionPreview> {
		try {
			const extractedTasks = await this.getExtractedTasks();
			
			if (extractedTasks.length === 0) {
				return {
					smartCards: [],
					totalTasks: 0,
					estimatedCost: 0,
					averageConfidence: 0
				};
			}

			// Analyze a subset for preview (max 3 tasks to save costs)
			const previewTasks = extractedTasks.slice(0, Math.min(3, extractedTasks.length));
			const smartCards: SmartCard[] = [];

			for (const task of previewTasks) {
				try {
					const smartCard = await this.analyzeTaskWithAIEnhanced(task);
					smartCards.push(smartCard);
				} catch (error) {
					console.error('Preview analysis failed for task:', error);
				}
			}

			// Calculate metrics
			const avgConfidence = smartCards.length > 0 
				? smartCards.reduce((sum, card) => sum + card.confidence, 0) / smartCards.length 
				: 0;

			// Rough cost estimation (tokens * model cost)
			const estimatedTokensPerTask = 300; // rough estimate
			const totalEstimatedTokens = extractedTasks.length * estimatedTokensPerTask;
			const costPerMillion = 0.50; // rough estimate for gpt-4.1-mini
			const estimatedCost = (totalEstimatedTokens / 1000000) * costPerMillion;

			return {
				smartCards,
				totalTasks: extractedTasks.length,
				estimatedCost,
				averageConfidence: avgConfidence
			};

		} catch (error) {
			console.error('Failed to generate preview:', error);
			throw error;
		}
	}

	/**
	 * Generate full preview with all tasks analyzed (used for actual smart extraction workflow)
	 */
	async generateFullPreview(): Promise<SmartExtractionPreview> {
		try {
			// Step 1: Validate settings
			if (!this.validateSmartExtractSettings()) {
				throw new Error('Smart Extract is not properly configured. Please check your settings.');
			}

			// Step 2: Get extracted tasks
			const extractedTasks = await this.getExtractedTasks();
			
			if (extractedTasks.length === 0) {
				return {
					smartCards: [],
					totalTasks: 0,
					estimatedCost: 0,
					averageConfidence: 0
				};
			}

			// Step 3: Analyze all tasks with AI
			console.log(`Generating full preview for ${extractedTasks.length} tasks...`);
			const smartCards: SmartCard[] = [];
			const errors: string[] = [];

			for (const task of extractedTasks) {
				try {
					const smartCard = await this.analyzeTaskWithAI(task);
					smartCards.push(smartCard);
				} catch (error) {
					console.error(`Failed to analyze task: ${task.cleanText}`, error);
					errors.push(`Failed to analyze task "${task.cleanText}": ${error.message}`);
				}
			}

			// Calculate metrics
			const avgConfidence = smartCards.length > 0 
				? smartCards.reduce((sum, card) => sum + card.confidence, 0) / smartCards.length 
				: 0;

			// Rough cost estimation (tokens * model cost)
			const estimatedTokensPerTask = 350; // slightly higher for full analysis
			const totalEstimatedTokens = extractedTasks.length * estimatedTokensPerTask;
			const costPerMillion = this.getCostPerMillion();
			const estimatedCost = (totalEstimatedTokens / 1000000) * costPerMillion;

			const preview: SmartExtractionPreview = {
				smartCards,
				totalTasks: extractedTasks.length,
				estimatedCost,
				averageConfidence: avgConfidence
			};

			// Add errors to preview if needed
			if (errors.length > 0) {
				(preview as any).errors = errors;
			}

			return preview;

		} catch (error) {
			console.error('Failed to generate full preview:', error);
			throw error;
		}
	}

	/**
	 * Get cost per million tokens based on current model
	 */
	private getCostPerMillion(): number {
		const model = this.plugin.settings.openAIModel || 'gpt-4.1-mini';
		
		// Cost estimates (approximate, as of 2024)
		const costs = {
			'gpt-3.5-turbo': 0.50,
			'gpt-4': 30.00,
			'gpt-4-turbo': 10.00,
			'gpt-4o': 5.00,
			'gpt-4o-mini': 0.15,
			'gpt-4.1': 25.00,
			'gpt-4.1-mini': 0.20,
			'gpt-4.1-nano': 0.10,
			'gpt-5': 50.00,
			'gpt-5-mini': 1.00,
			'gpt-5-nano': 0.25,
			'o3': 60.00,
			'o3-mini': 3.00,
			'o1': 15.00,
			'o1-mini': 3.00
		};

		return costs[model] || 1.00; // Default fallback
	}

	/**
	 * Validate Smart Extract settings
	 */
	private validateSmartExtractSettings(): boolean {
		const settings = this.plugin.settings;
		
		if (!settings.useSmartExtract) {
			return false;
		}

		if (!settings.openAIApiKey) {
			return false;
		}

		if (!settings.taskSourcePath) {
			return false;
		}

		return true;
	}

	/**
	 * Update OpenAI configuration when settings change
	 */
	updateConfiguration(): void {
		this.initializeOpenAI();
	}

	/**
	 * Clear URL cache
	 */
	clearCache(): void {
		this.urlCache.clear();
	}

	/**
	 * Get cache statistics
	 */
	getCacheStats(): { size: number; oldestEntry: number | null } {
		const entries = Array.from(this.urlCache.values());
		const oldestEntry = entries.length > 0 
			? Math.min(...entries.map(e => e.timestamp))
			: null;
		
		return {
			size: this.urlCache.size,
			oldestEntry
		};
	}
}