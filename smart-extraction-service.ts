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
	 * Check if URL is a YouTube URL
	 */
	private isYouTubeURL(url: string): boolean {
		return url.includes('youtube.com/watch') || url.includes('youtu.be/') || 
		       url.includes('youtube.com/v/') || url.includes('youtube.com/embed/');
	}

	/**
	 * Extract video ID from YouTube URL
	 */
	private extractVideoId(url: string): string | null {
		const youtubeRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/v\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/;
		const match = url.match(youtubeRegex);
		return match ? match[1] : null;
	}

	/**
	 * Process YouTube video using enhanced Innertube API
	 */
	private async processYouTubeVideo(url: string): Promise<string> {
		console.log(`[DEBUG] Processing YouTube video with Enhanced Innertube approach: ${url}`);
		try {
			const videoId = this.extractVideoId(url);
			if (!videoId) {
				throw new Error('Could not extract video ID from URL');
			}

			const result = await this.openAIService.analyzeYouTubeVideoWithInnertube({
				videoId,
				metadata: { title: `YouTube Video ${videoId}`, channel: 'Unknown', duration: 'Unknown' },
				task: 'Analyze this video content'
			});
			
			// Build enhanced, precise summary with tool URLs
			let summary = this.buildEnhancedYouTubeSummary(result, videoId, url);
			
			// Add tool-specific URLs if available (temporarily disabled for compilation)
			// TODO: Re-implement tool URL functionality
			
			if (this.plugin.settings.cacheAIResponses !== false) {
				this.urlCache.set(url, { content: summary, timestamp: Date.now() });
			}
			
			console.log(`[DEBUG] Analysis completed with enhanced formatting`);
			console.log(`Successfully processed YouTube video: ${url}`);
			return summary;
		} catch (error) {
			console.error(`[DEBUG] YouTube processing failed for ${url}:`, error);
			console.log(`YouTube processing failed for ${url}, falling back to generic extraction`);
			return '';
		}
	}

	/**
	 * Build enhanced, precise YouTube summary with better formatting and structure
	 */
	private buildEnhancedYouTubeSummary(result: any, videoId: string, url: string): string {
		let summary = '';
		
		// Add video title if available
		if ('title' in result && (result as any).title) {
			const title = (result as any).title;
			summary += `# 📺 ${title}\n\n`;
		} else {
			summary += `# 📺 YouTube Video Analysis\n\n`;
		}
		
		// Add analysis method indicator
		const analysisMethod = result.analysisMethod || 'analysis';
		const methodEmoji = analysisMethod === 'innertube_transcript' ? '🎯' : 
							analysisMethod === 'fallback' ? '📝' : '🔍';
		summary += `${methodEmoji} **Analysis Method**: ${analysisMethod.replace('_', ' ').toUpperCase()}\n\n`;
		
		// Add main description with enhanced formatting
		const description = result.description || 'Analysis completed';
		if (description && description.length > 0) {
			// Check if description already has markdown structure
			if (description.includes('##') || description.includes('**')) {
				summary += description;
			} else {
				// Add basic structure to plain text
				summary += `## 📋 Overview\n${description}`;
			}
		}
		
		// Add key takeaways if available
		if (result.keyTakeaways && Array.isArray(result.keyTakeaways) && result.keyTakeaways.length > 0) {
			summary += '\n\n## 🎯 Key Takeaways\n';
			result.keyTakeaways.forEach((takeaway: string, index: number) => {
				summary += `${index + 1}. ${takeaway}\n`;
			});
		}
		
		// Add next steps if available
		if (result.nextSteps && Array.isArray(result.nextSteps) && result.nextSteps.length > 0) {
			summary += '\n\n## 🚀 Next Steps\n';
			result.nextSteps.forEach((step: string) => {
				summary += `• ${step}\n`;
			});
		}
		
		// Add suggested search queries
		if (result.suggestedSearchQueries && Array.isArray(result.suggestedSearchQueries) && result.suggestedSearchQueries.length > 0) {
			summary += '\n\n## 🔎 Research Topics\n';
			result.suggestedSearchQueries.forEach((query: string) => {
				summary += `• ${query}\n`;
			});
		}
		
		// Add commands if available (for technical tutorials)
		if (result.commands && Array.isArray(result.commands) && result.commands.length > 0) {
			summary += '\n\n## ⚡ Commands & Code\n';
			result.commands.forEach((command: string) => {
				summary += `• \`${command}\`\n`;
			});
		}
		
		// Add troubleshooting if available
		if (result.troubleshooting && Array.isArray(result.troubleshooting) && result.troubleshooting.length > 0) {
			summary += '\n\n## 🔧 Troubleshooting\n';
			result.troubleshooting.forEach((issue: string) => {
				summary += `• ${issue}\n`;
			});
		}
		
		// Add video link
		summary += `\n\n## 🔗 Source\n[Watch Video](${url})`;
		
		return summary;
	}

	/**
	 * Generate URLs for tools and technologies mentioned in the analysis
	 */
	private generateToolUrls(tools: string[]): Array<{ url: string; title: string }> {
		const toolUrlMap: { [key: string]: { url: string; title: string } } = {
			// Terminal/CLI Tools
			'fzf': { url: 'https://github.com/junegunn/fzf', title: 'fzf - Command-line fuzzy finder' },
			'bat': { url: 'https://github.com/sharkdp/bat', title: 'bat - Cat clone with syntax highlighting' },
			'ripgrep': { url: 'https://github.com/BurntSushi/ripgrep', title: 'ripgrep - Fast text search tool' },
			'rg': { url: 'https://github.com/BurntSushi/ripgrep', title: 'ripgrep - Fast text search tool' },
			'exa': { url: 'https://github.com/ogham/exa', title: 'exa - Modern replacement for ls' },
			'lsd': { url: 'https://github.com/Peltoche/lsd', title: 'LSD - Next gen ls command' },
			'fd': { url: 'https://github.com/sharkdp/fd', title: 'fd - Simple, fast find alternative' },
			'find': { url: 'https://www.gnu.org/software/findutils/', title: 'GNU findutils - File search utilities' },
			'zoxide': { url: 'https://github.com/ajeetdsouza/zoxide', title: 'zoxide - Smarter cd command' },
			'autojump': { url: 'https://github.com/wting/autojump', title: 'autojump - cd command that learns' },
			'starship': { url: 'https://starship.rs/', title: 'Starship - Cross-shell prompt' },
			'oh-my-zsh': { url: 'https://ohmyz.sh/', title: 'Oh My Zsh - Zsh framework' },
			'ohmyzsh': { url: 'https://ohmyz.sh/', title: 'Oh My Zsh - Zsh framework' },
			'oh my zsh': { url: 'https://ohmyz.sh/', title: 'Oh My Zsh - Zsh framework' },
			'powerlevel10k': { url: 'https://github.com/romkatv/powerlevel10k', title: 'Powerlevel10k - Zsh theme' },
			'p10k': { url: 'https://github.com/romkatv/powerlevel10k', title: 'Powerlevel10k - Zsh theme' },
			
			// Zsh Plugins
			'zsh-autosuggestions': { url: 'https://github.com/zsh-users/zsh-autosuggestions', title: 'zsh-autosuggestions - Fish-like autosuggestions' },
			'autosuggestions': { url: 'https://github.com/zsh-users/zsh-autosuggestions', title: 'zsh-autosuggestions - Fish-like autosuggestions' },
			'zsh-syntax-highlighting': { url: 'https://github.com/zsh-users/zsh-syntax-highlighting', title: 'zsh-syntax-highlighting - Syntax highlighting for zsh' },
			'syntax-highlighting': { url: 'https://github.com/zsh-users/zsh-syntax-highlighting', title: 'zsh-syntax-highlighting - Syntax highlighting for zsh' },
			'sudo-plugin': { url: 'https://github.com/ohmyzsh/ohmyzsh/tree/master/plugins/sudo', title: 'sudo plugin - Oh My Zsh sudo plugin' },
			'sudo plugin': { url: 'https://github.com/ohmyzsh/ohmyzsh/tree/master/plugins/sudo', title: 'sudo plugin - Oh My Zsh sudo plugin' },
			'web-search-plugin': { url: 'https://github.com/ohmyzsh/ohmyzsh/tree/master/plugins/web-search', title: 'web-search plugin - Oh My Zsh web search plugin' },
			'web-search plugin': { url: 'https://github.com/ohmyzsh/ohmyzsh/tree/master/plugins/web-search', title: 'web-search plugin - Oh My Zsh web search plugin' },
			'web search': { url: 'https://github.com/ohmyzsh/ohmyzsh/tree/master/plugins/web-search', title: 'web-search plugin - Oh My Zsh web search plugin' },
			'git-plugin': { url: 'https://github.com/ohmyzsh/ohmyzsh/tree/master/plugins/git', title: 'git plugin - Oh My Zsh git plugin' },
			'git plugin': { url: 'https://github.com/ohmyzsh/ohmyzsh/tree/master/plugins/git', title: 'git plugin - Oh My Zsh git plugin' },
			'docker-plugin': { url: 'https://github.com/ohmyzsh/ohmyzsh/tree/master/plugins/docker', title: 'docker plugin - Oh My Zsh docker plugin' },
			'docker plugin': { url: 'https://github.com/ohmyzsh/ohmyzsh/tree/master/plugins/docker', title: 'docker plugin - Oh My Zsh docker plugin' },
			'z-plugin': { url: 'https://github.com/ohmyzsh/ohmyzsh/tree/master/plugins/z', title: 'z plugin - Oh My Zsh z plugin' },
			'z plugin': { url: 'https://github.com/ohmyzsh/ohmyzsh/tree/master/plugins/z', title: 'z plugin - Oh My Zsh z plugin' },
			
			// Terminal Multiplexers & Editors
			'tmux': { url: 'https://github.com/tmux/tmux/wiki', title: 'tmux - Terminal multiplexer' },
			'screen': { url: 'https://www.gnu.org/software/screen/', title: 'GNU Screen - Terminal multiplexer' },
			'neovim': { url: 'https://neovim.io/', title: 'Neovim - Hyperextensible Vim-based editor' },
			'nvim': { url: 'https://neovim.io/', title: 'Neovim - Hyperextensible Vim-based editor' },
			'vim': { url: 'https://www.vim.org/', title: 'Vim - Text editor' },
			'emacs': { url: 'https://www.gnu.org/software/emacs/', title: 'Emacs - Extensible text editor' },
			
			// Shells
			'zsh': { url: 'https://www.zsh.org/', title: 'Zsh - Extended Bourne shell' },
			
			// Terminal Emulators
			'terminal': { url: 'https://support.apple.com/guide/terminal/', title: 'macOS Terminal - Built-in terminal emulator' },
			'iterm': { url: 'https://iterm2.com/', title: 'iTerm2 - Terminal emulator for macOS' },
			'iterm2': { url: 'https://iterm2.com/', title: 'iTerm2 - Terminal emulator for macOS' },
			'alacritty': { url: 'https://github.com/alacritty/alacritty', title: 'Alacritty - Cross-platform, GPU-accelerated terminal' },
			'kitty': { url: 'https://sw.kovidgoyal.net/kitty/', title: 'kitty - Fast, feature-rich terminal emulator' },
			'wezterm': { url: 'https://wezfurlong.org/wezterm/', title: 'WezTerm - GPU-accelerated cross-platform terminal' },
			
			// Development Environments
			'shell': { url: 'https://en.wikipedia.org/wiki/Shell_(computing)', title: 'Shell - Command-line interface' },
			'vscode': { url: 'https://code.visualstudio.com/', title: 'Visual Studio Code - Code editor' },
			'visual-studio-code': { url: 'https://code.visualstudio.com/', title: 'Visual Studio Code - Code editor' },
			'visual studio code': { url: 'https://code.visualstudio.com/', title: 'Visual Studio Code - Code editor' },
			'fish': { url: 'https://fishshell.com/', title: 'Fish - User-friendly command line shell' },
			'bash': { url: 'https://www.gnu.org/software/bash/', title: 'Bash - Bourne Again SHell' },
			'powershell': { url: 'https://docs.microsoft.com/powershell/', title: 'PowerShell - Task automation framework' },
			
			// Version Control & DevOps
			'git': { url: 'https://git-scm.com/', title: 'Git - Distributed version control' },
			'github': { url: 'https://github.com/', title: 'GitHub - Development platform' },
			'gitlab': { url: 'https://gitlab.com/', title: 'GitLab - DevOps platform' },
			'docker': { url: 'https://docs.docker.com/', title: 'Docker - Containerization platform' },
			'podman': { url: 'https://podman.io/', title: 'Podman - Daemonless container engine' },
			'kubernetes': { url: 'https://kubernetes.io/', title: 'Kubernetes - Container orchestration' },
			'k8s': { url: 'https://kubernetes.io/', title: 'Kubernetes - Container orchestration' },
			'helm': { url: 'https://helm.sh/', title: 'Helm - Kubernetes package manager' },
			'terraform': { url: 'https://www.terraform.io/', title: 'Terraform - Infrastructure as code' },
			'ansible': { url: 'https://www.ansible.com/', title: 'Ansible - Automation platform' },
			'vagrant': { url: 'https://www.vagrantup.com/', title: 'Vagrant - Development environments' },
			
			// Programming Languages & Runtimes
			'python': { url: 'https://www.python.org/', title: 'Python - Programming language' },
			'javascript': { url: 'https://developer.mozilla.org/docs/Web/JavaScript', title: 'JavaScript - Programming language' },
			'typescript': { url: 'https://www.typescriptlang.org/', title: 'TypeScript - Typed JavaScript' },
			'node': { url: 'https://nodejs.org/', title: 'Node.js - JavaScript runtime' },
			'nodejs': { url: 'https://nodejs.org/', title: 'Node.js - JavaScript runtime' },
			'deno': { url: 'https://deno.land/', title: 'Deno - Secure JavaScript/TypeScript runtime' },
			'bun': { url: 'https://bun.sh/', title: 'Bun - Fast JavaScript runtime' },
			'rust': { url: 'https://www.rust-lang.org/', title: 'Rust - Systems programming language' },
			'go': { url: 'https://golang.org/', title: 'Go - Programming language by Google' },
			'golang': { url: 'https://golang.org/', title: 'Go - Programming language by Google' },
			'java': { url: 'https://www.oracle.com/java/', title: 'Java - Programming language' },
			'kotlin': { url: 'https://kotlinlang.org/', title: 'Kotlin - Modern programming language' },
			'scala': { url: 'https://www.scala-lang.org/', title: 'Scala - Programming language' },
			'c++': { url: 'https://isocpp.org/', title: 'C++ - Programming language' },
			'c': { url: 'https://www.iso.org/standard/74528.html', title: 'C - Programming language' },
			'c#': { url: 'https://docs.microsoft.com/dotnet/csharp/', title: 'C# - Programming language' },
			'ruby': { url: 'https://www.ruby-lang.org/', title: 'Ruby - Programming language' },
			'php': { url: 'https://www.php.net/', title: 'PHP - Server-side scripting language' },
			'swift': { url: 'https://swift.org/', title: 'Swift - Programming language by Apple' },
			'dart': { url: 'https://dart.dev/', title: 'Dart - Programming language by Google' },
			'elixir': { url: 'https://elixir-lang.org/', title: 'Elixir - Dynamic, functional language' },
			'haskell': { url: 'https://www.haskell.org/', title: 'Haskell - Functional programming language' },
			'clojure': { url: 'https://clojure.org/', title: 'Clojure - Dynamic, functional dialect of Lisp' },
			
			// Web Frameworks & Libraries
			'react': { url: 'https://reactjs.org/', title: 'React - JavaScript library for building UIs' },
			'vue': { url: 'https://vuejs.org/', title: 'Vue.js - Progressive JavaScript framework' },
			'vuejs': { url: 'https://vuejs.org/', title: 'Vue.js - Progressive JavaScript framework' },
			'angular': { url: 'https://angular.io/', title: 'Angular - Platform for building apps' },
			'svelte': { url: 'https://svelte.dev/', title: 'Svelte - Cybernetically enhanced web apps' },
			'nextjs': { url: 'https://nextjs.org/', title: 'Next.js - React framework' },
			'nuxtjs': { url: 'https://nuxtjs.org/', title: 'Nuxt.js - Vue.js framework' },
			'gatsby': { url: 'https://www.gatsbyjs.com/', title: 'Gatsby - Static site generator' },
			'express': { url: 'https://expressjs.com/', title: 'Express.js - Node.js web framework' },
			'fastify': { url: 'https://www.fastify.io/', title: 'Fastify - Fast web framework for Node.js' },
			'flask': { url: 'https://flask.palletsprojects.com/', title: 'Flask - Python web framework' },
			'django': { url: 'https://www.djangoproject.com/', title: 'Django - Python web framework' },
			'fastapi': { url: 'https://fastapi.tiangolo.com/', title: 'FastAPI - Modern Python web framework' },
			'rails': { url: 'https://rubyonrails.org/', title: 'Ruby on Rails - Web framework' },
			'laravel': { url: 'https://laravel.com/', title: 'Laravel - PHP web framework' },
			'spring': { url: 'https://spring.io/', title: 'Spring - Java application framework' },
			
			// Databases
			'postgresql': { url: 'https://www.postgresql.org/', title: 'PostgreSQL - Advanced open source database' },
			'postgres': { url: 'https://www.postgresql.org/', title: 'PostgreSQL - Advanced open source database' },
			'mysql': { url: 'https://www.mysql.com/', title: 'MySQL - Open source database' },
			'mariadb': { url: 'https://mariadb.org/', title: 'MariaDB - Open source database' },
			'sqlite': { url: 'https://www.sqlite.org/', title: 'SQLite - Embedded database' },
			'mongodb': { url: 'https://www.mongodb.com/', title: 'MongoDB - Document database' },
			'redis': { url: 'https://redis.io/', title: 'Redis - In-memory data store' },
			'elasticsearch': { url: 'https://www.elastic.co/', title: 'Elasticsearch - Search and analytics engine' },
			'cassandra': { url: 'https://cassandra.apache.org/', title: 'Apache Cassandra - Distributed database' },
			'dynamodb': { url: 'https://aws.amazon.com/dynamodb/', title: 'Amazon DynamoDB - NoSQL database' },
			
			// Package Managers
			'npm': { url: 'https://www.npmjs.com/', title: 'npm - Node.js package manager' },
			'yarn': { url: 'https://yarnpkg.com/', title: 'Yarn - JavaScript package manager' },
			'pnpm': { url: 'https://pnpm.io/', title: 'pnpm - Fast, disk space efficient package manager' },
			'pip': { url: 'https://pip.pypa.io/', title: 'pip - Python package installer' },
			'pipenv': { url: 'https://pipenv.pypa.io/', title: 'Pipenv - Python packaging tool' },
			'poetry': { url: 'https://python-poetry.org/', title: 'Poetry - Python dependency management' },
			'cargo': { url: 'https://doc.rust-lang.org/cargo/', title: 'Cargo - Rust package manager' },
			'go mod': { url: 'https://golang.org/ref/mod', title: 'Go Modules - Go dependency management' },
			'maven': { url: 'https://maven.apache.org/', title: 'Apache Maven - Java build tool' },
			'gradle': { url: 'https://gradle.org/', title: 'Gradle - Build automation tool' },
			'homebrew': { url: 'https://brew.sh/', title: 'Homebrew - macOS package manager' },
			'brew': { url: 'https://brew.sh/', title: 'Homebrew - macOS package manager' },
			'apt': { url: 'https://wiki.debian.org/Apt', title: 'APT - Debian package manager' },
			'yum': { url: 'https://access.redhat.com/solutions/9934', title: 'YUM - RPM package manager' },
			'dnf': { url: 'https://dnf.readthedocs.io/', title: 'DNF - Next-generation package manager' },
			'pacman': { url: 'https://wiki.archlinux.org/title/Pacman', title: 'Pacman - Arch Linux package manager' },
			'portage': { url: 'https://wiki.gentoo.org/wiki/Portage', title: 'Portage - Gentoo package manager' },
			
			// Development Tools & IDEs
			'vs code': { url: 'https://code.visualstudio.com/', title: 'Visual Studio Code - Code editor' },
			'sublime text': { url: 'https://www.sublimetext.com/', title: 'Sublime Text - Text editor' },
			'atom': { url: 'https://atom.io/', title: 'Atom - Hackable text editor' },
			'intellij': { url: 'https://www.jetbrains.com/idea/', title: 'IntelliJ IDEA - Java IDE' },
			'pycharm': { url: 'https://www.jetbrains.com/pycharm/', title: 'PyCharm - Python IDE' },
			'webstorm': { url: 'https://www.jetbrains.com/webstorm/', title: 'WebStorm - JavaScript IDE' },
			'phpstorm': { url: 'https://www.jetbrains.com/phpstorm/', title: 'PhpStorm - PHP IDE' },
			'rider': { url: 'https://www.jetbrains.com/rider/', title: 'Rider - .NET IDE' },
			'goland': { url: 'https://www.jetbrains.com/go/', title: 'GoLand - Go IDE' },
			'clion': { url: 'https://www.jetbrains.com/clion/', title: 'CLion - C/C++ IDE' },
			'eclipse': { url: 'https://www.eclipse.org/', title: 'Eclipse - Integrated development environment' },
			'xcode': { url: 'https://developer.apple.com/xcode/', title: 'Xcode - Apple development environment' },
			'android studio': { url: 'https://developer.android.com/studio', title: 'Android Studio - Android development IDE' },
			
			// Build Tools & Task Runners
			'webpack': { url: 'https://webpack.js.org/', title: 'Webpack - Module bundler' },
			'vite': { url: 'https://vitejs.dev/', title: 'Vite - Frontend build tool' },
			'rollup': { url: 'https://rollupjs.org/', title: 'Rollup - Module bundler' },
			'parcel': { url: 'https://parceljs.org/', title: 'Parcel - Web application bundler' },
			'gulp': { url: 'https://gulpjs.com/', title: 'Gulp - Streaming build system' },
			'grunt': { url: 'https://gruntjs.com/', title: 'Grunt - Task runner' },
			'make': { url: 'https://www.gnu.org/software/make/', title: 'GNU Make - Build automation tool' },
			'cmake': { url: 'https://cmake.org/', title: 'CMake - Cross-platform build system' },
			'bazel': { url: 'https://bazel.build/', title: 'Bazel - Fast, scalable build tool' },
			
			// Cloud Platforms
			'aws': { url: 'https://aws.amazon.com/', title: 'AWS - Amazon Web Services' },
			'azure': { url: 'https://azure.microsoft.com/', title: 'Microsoft Azure - Cloud platform' },
			'gcp': { url: 'https://cloud.google.com/', title: 'Google Cloud Platform' },
			'google cloud': { url: 'https://cloud.google.com/', title: 'Google Cloud Platform' },
			'digitalocean': { url: 'https://www.digitalocean.com/', title: 'DigitalOcean - Cloud infrastructure' },
			'linode': { url: 'https://www.linode.com/', title: 'Linode - Cloud computing' },
			'vultr': { url: 'https://www.vultr.com/', title: 'Vultr - Cloud infrastructure' },
			'heroku': { url: 'https://www.heroku.com/', title: 'Heroku - Cloud platform as a service' },
			'netlify': { url: 'https://www.netlify.com/', title: 'Netlify - Web development platform' },
			'vercel': { url: 'https://vercel.com/', title: 'Vercel - Frontend cloud platform' },
			
			// Operating Systems & Distributions
			'linux': { url: 'https://www.kernel.org/', title: 'Linux - Open source operating system' },
			'ubuntu': { url: 'https://ubuntu.com/', title: 'Ubuntu - Linux distribution' },
			'debian': { url: 'https://www.debian.org/', title: 'Debian - Universal operating system' },
			'fedora': { url: 'https://getfedora.org/', title: 'Fedora - Linux distribution' },
			'centos': { url: 'https://www.centos.org/', title: 'CentOS - Enterprise-class Linux' },
			'rhel': { url: 'https://www.redhat.com/rhel/', title: 'Red Hat Enterprise Linux' },
			'arch': { url: 'https://archlinux.org/', title: 'Arch Linux - Lightweight distribution' },
			'arch linux': { url: 'https://archlinux.org/', title: 'Arch Linux - Lightweight distribution' },
			'manjaro': { url: 'https://manjaro.org/', title: 'Manjaro - User-friendly Arch Linux' },
			'opensuse': { url: 'https://www.opensuse.org/', title: 'openSUSE - Linux distribution' },
			'gentoo': { url: 'https://www.gentoo.org/', title: 'Gentoo - Meta-distribution' },
			'alpine': { url: 'https://alpinelinux.org/', title: 'Alpine Linux - Security-oriented distribution' },
			'macos': { url: 'https://www.apple.com/macos/', title: 'macOS - Apple operating system' },
			'windows': { url: 'https://www.microsoft.com/windows/', title: 'Windows - Microsoft operating system' },
			'freebsd': { url: 'https://www.freebsd.org/', title: 'FreeBSD - Unix-like operating system' },
			
			// Monitoring & Observability
			'prometheus': { url: 'https://prometheus.io/', title: 'Prometheus - Monitoring system' },
			'grafana': { url: 'https://grafana.com/', title: 'Grafana - Analytics and monitoring platform' },
			'kibana': { url: 'https://www.elastic.co/kibana/', title: 'Kibana - Data visualization dashboard' },
			'logstash': { url: 'https://www.elastic.co/logstash/', title: 'Logstash - Data processing pipeline' },
			'fluentd': { url: 'https://www.fluentd.org/', title: 'Fluentd - Data collector' },
			'jaeger': { url: 'https://www.jaegertracing.io/', title: 'Jaeger - Distributed tracing' },
			'zipkin': { url: 'https://zipkin.io/', title: 'Zipkin - Distributed tracing system' },
			'new relic': { url: 'https://newrelic.com/', title: 'New Relic - Observability platform' },
			'datadog': { url: 'https://www.datadoghq.com/', title: 'Datadog - Monitoring and analytics' },
			
			// Testing Frameworks
			'jest': { url: 'https://jestjs.io/', title: 'Jest - JavaScript testing framework' },
			'mocha': { url: 'https://mochajs.org/', title: 'Mocha - JavaScript test framework' },
			'chai': { url: 'https://www.chaijs.com/', title: 'Chai - Assertion library' },
			'cypress': { url: 'https://www.cypress.io/', title: 'Cypress - End-to-end testing' },
			'playwright': { url: 'https://playwright.dev/', title: 'Playwright - Web testing and automation' },
			'selenium': { url: 'https://selenium.dev/', title: 'Selenium - Web browser automation' },
			'pytest': { url: 'https://pytest.org/', title: 'pytest - Python testing framework' },
			'unittest': { url: 'https://docs.python.org/library/unittest.html', title: 'unittest - Python testing framework' },
			'rspec': { url: 'https://rspec.info/', title: 'RSpec - Ruby testing framework' },
			'junit': { url: 'https://junit.org/', title: 'JUnit - Java testing framework' },
			'testng': { url: 'https://testng.org/', title: 'TestNG - Java testing framework' },
			'phpunit': { url: 'https://phpunit.de/', title: 'PHPUnit - PHP testing framework' },
			
			// API Tools
			'postman': { url: 'https://www.postman.com/', title: 'Postman - API development environment' },
			'insomnia': { url: 'https://insomnia.rest/', title: 'Insomnia - API testing tool' },
			'swagger': { url: 'https://swagger.io/', title: 'Swagger - API development tools' },
			'openapi': { url: 'https://www.openapis.org/', title: 'OpenAPI - API specification' },
			'graphql': { url: 'https://graphql.org/', title: 'GraphQL - Query language for APIs' },
			'rest': { url: 'https://restfulapi.net/', title: 'REST - Representational State Transfer' },
			'grpc': { url: 'https://grpc.io/', title: 'gRPC - High-performance RPC framework' },
			
			// Documentation & Static Site Generators
			'hugo': { url: 'https://gohugo.io/', title: 'Hugo - Static site generator' },
			'jekyll': { url: 'https://jekyllrb.com/', title: 'Jekyll - Static site generator' },
			'gitbook': { url: 'https://www.gitbook.com/', title: 'GitBook - Documentation platform' },
			'docusaurus': { url: 'https://docusaurus.io/', title: 'Docusaurus - Documentation website generator' },
			'mkdocs': { url: 'https://www.mkdocs.org/', title: 'MkDocs - Static site generator' },
			
			// Fonts
			'nerd-fonts': { url: 'https://www.nerdfonts.com/', title: 'Nerd Fonts - Developer targeted fonts with icons' },
			'nerd fonts': { url: 'https://www.nerdfonts.com/', title: 'Nerd Fonts - Developer targeted fonts with icons' },
			'nerd-font': { url: 'https://www.nerdfonts.com/', title: 'Nerd Fonts - Developer targeted fonts with icons' },
			'nerd font': { url: 'https://www.nerdfonts.com/', title: 'Nerd Fonts - Developer targeted fonts with icons' },
			'powerline-fonts': { url: 'https://github.com/powerline/fonts', title: 'Powerline fonts - Patched fonts for Powerline' },
			'powerline fonts': { url: 'https://github.com/powerline/fonts', title: 'Powerline fonts - Patched fonts for Powerline' },
			'powerline-font': { url: 'https://github.com/powerline/fonts', title: 'Powerline fonts - Patched fonts for Powerline' },
			'powerline font': { url: 'https://github.com/powerline/fonts', title: 'Powerline fonts - Patched fonts for Powerline' },
			'meslo': { url: 'https://github.com/andreberg/Meslo-Font', title: 'Meslo LG - Customized Menlo font' },
			'fira-code': { url: 'https://github.com/tonsky/FiraCode', title: 'Fira Code - Monospaced font with programming ligatures' },
			'fira code': { url: 'https://github.com/tonsky/FiraCode', title: 'Fira Code - Monospaced font with programming ligatures' },
			'jetbrains-mono': { url: 'https://www.jetbrains.com/lp/mono/', title: 'JetBrains Mono - Developer font' },
			'jetbrains mono': { url: 'https://www.jetbrains.com/lp/mono/', title: 'JetBrains Mono - Developer font' },
			'cascadia-code': { url: 'https://github.com/microsoft/cascadia-code', title: 'Cascadia Code - Monospaced font by Microsoft' },
			'cascadia code': { url: 'https://github.com/microsoft/cascadia-code', title: 'Cascadia Code - Monospaced font by Microsoft' },
			'source-code-pro': { url: 'https://github.com/adobe-fonts/source-code-pro', title: 'Source Code Pro - Monospaced font by Adobe' },
			'source code pro': { url: 'https://github.com/adobe-fonts/source-code-pro', title: 'Source Code Pro - Monospaced font by Adobe' },
			'hack-font': { url: 'https://sourcefoundry.org/hack/', title: 'Hack - Typeface designed for source code' },
			'hack font': { url: 'https://sourcefoundry.org/hack/', title: 'Hack - Typeface designed for source code' },
			'sphinx': { url: 'https://www.sphinx-doc.org/', title: 'Sphinx - Documentation generator' },
			'vuepress': { url: 'https://vuepress.vuejs.org/', title: 'VuePress - Vue-powered static site generator' },
			'docsify': { url: 'https://docsify.js.org/', title: 'Docsify - Documentation site generator' },
			

			'inconsolata': { url: 'https://fonts.google.com/specimen/Inconsolata', title: 'Inconsolata - Monospace font' },
			'iosevka': { url: 'https://typeof.net/Iosevka/', title: 'Iosevka - Versatile typeface for code' },
			'hack': { url: 'https://sourcefoundry.org/hack/', title: 'Hack - Typeface designed for source code' },
		};
		
		const urls: Array<{ url: string; title: string }> = [];
		
		// Match tools from the list (case insensitive)
		tools.forEach(tool => {
			const normalizedTool = tool.toLowerCase().trim();
			const toolInfo = toolUrlMap[normalizedTool];
			if (toolInfo) {
				urls.push(toolInfo);
			}
		});
		
		// Remove duplicates and limit to 8 tools for readability
		const uniqueUrls = urls.filter((url, index, self) => 
			index === self.findIndex(u => u.url === url.url)
		).slice(0, 8);
		
		console.log(`[DEBUG] Generated ${uniqueUrls.length} tool URLs for: ${tools.join(', ')}`);
		
		return uniqueUrls;
	}
	
	private detectAndLinkTools(text: string): { enhancedText: string; toolUrls: Array<{ url: string; title: string }> } {
		if (!text) return { enhancedText: text, toolUrls: [] };
		
		// Define tool names to search for in the text
		const toolKeywords = [
			// Shell and Terminal
			'oh my zsh', 'ohmyzsh', 'oh-my-zsh',
			'zsh', 'bash', 'shell', 'terminal', 'iterm', 'iterm2', 'alacritty', 'kitty', 'wezterm',
			'powerlevel10k', 'p10k', 'starship', 'spaceship prompt',
			
			// Zsh plugins
			'zsh-autosuggestions', 'autosuggestions',
			'zsh-syntax-highlighting', 'syntax-highlighting',
			'sudo plugin', 'web-search plugin', 'web search',
			'git plugin', 'docker plugin', 'kubectl plugin',
			'fzf', 'z plugin', 'autojump', 'zoxide',
			
			// Development tools
			'neovim', 'nvim', 'vim', 'emacs', 'vscode', 'visual studio code',
			'git', 'github', 'gitlab', 'bitbucket',
			'docker', 'kubernetes', 'k8s', 'podman', 'containerd',
			'npm', 'yarn', 'pnpm', 'pip', 'cargo', 'gem', 'composer',
			
			// CLI tools
			'tmux', 'screen', 'ranger', 'nnn', 'lf',
			'htop', 'btop', 'gtop', 'glances',
			'ripgrep', 'rg', 'fd', 'bat', 'exa', 'lsd',
			'curl', 'wget', 'httpie', 'jq', 'yq',
			
			// Fonts
			'nerd fonts', 'nerd font', 'powerline fonts', 'powerline font',
			'meslo', 'fira code', 'jetbrains mono',
			'cascadia code', 'source code pro', 'hack font'
		];
		
		const detectedTools = new Set<string>();
		const lowerText = text.toLowerCase();
		
		// Check for each tool keyword in the text
		toolKeywords.forEach(keyword => {
			if (lowerText.includes(keyword.toLowerCase())) {
				// Normalize the keyword for URL generation
				const normalizedKeyword = keyword.toLowerCase().replace(/ /g, '-');
				detectedTools.add(normalizedKeyword);
			}
		});
		
		// Generate URLs for detected tools
		const toolUrls = this.generateToolUrls(Array.from(detectedTools));
		
		// Return enhanced text with the tool URLs
		return {
			enhancedText: text, // Keep original text
			toolUrls
		};
	}

	/**
	 * Analyze a single task with AI
	 */
	private isQuestion(text: string): boolean {
		// Check if the text is a question (same logic as OpenAI service)
		const questionWords = ['what', 'where', 'when', 'why', 'how', 'who', 'which', 'whom', 'whose', 
							   'can', 'could', 'would', 'should', 'is', 'are', 'do', 'does', 'did', 
							   'will', 'shall', 'may', 'might'];
		
		const trimmedText = text.trim().toLowerCase();
		
		// Check if it ends with a question mark
		if (text.trim().endsWith('?')) {
			return true;
		}
		
		// Check if it starts with a question word
		for (const word of questionWords) {
			if (trimmedText.startsWith(word + ' ')) {
				return true;
			}
		}
		
		return false;
	}

	private async searchGoogleForUrls(query: string, limit: number = 5): Promise<Array<{ url: string; title: string }>> {
		try {
			// Simple Google search URL generation
			// Note: In production, you'd want to use a proper search API
			const searchUrls: Array<{ url: string; title: string }> = [];
			
			// For now, we'll return suggested search URLs that users can manually search
			// In a production environment, you'd integrate with Google Custom Search API or similar
			searchUrls.push({
				url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
				title: `Google Search: ${query}`
			});
			
			// Add some common knowledge bases
			if (query.toLowerCase().includes('how') || query.toLowerCase().includes('what')) {
				searchUrls.push({
					url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}`,
					title: `Wikipedia: ${query}`
				});
			}
			
			// Add Stack Overflow for technical questions
			if (query.match(/code|programming|javascript|python|java|css|html|api|function|error/i)) {
				searchUrls.push({
					url: `https://stackoverflow.com/search?q=${encodeURIComponent(query)}`,
					title: `Stack Overflow: ${query}`
				});
			}
			
			// Add documentation sites for specific technologies
			if (query.match(/react|vue|angular|node|npm/i)) {
				searchUrls.push({
					url: `https://www.google.com/search?q=site:developer.mozilla.org+${encodeURIComponent(query)}`,
					title: `MDN Docs: ${query}`
				});
			}
			
			return searchUrls.slice(0, limit);
		} catch (error) {
			console.error('Error generating search URLs:', error);
			return [];
		}
	}

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
		const urlContext = urlSummaries.length > 0 ? urlSummaries.join('\\n\\n') : undefined;
		const aiAnalysis = await this.openAIService.analyzeTask(task, urlContext);

		// Step 3: Generate additional research URLs for questions
		let additionalSearchUrls: Array<{ url: string; title: string }> = [];
		if (aiAnalysis.suggestedSearchQueries && aiAnalysis.suggestedSearchQueries.length > 0) {
			console.log('Detected question with search queries:', aiAnalysis.suggestedSearchQueries);
			for (const query of aiAnalysis.suggestedSearchQueries.slice(0, 3)) {
				const searchUrls = await this.searchGoogleForUrls(query, 2);
				additionalSearchUrls.push(...searchUrls);
			}
		}

		// Step 4: Build comprehensive card description
		let cardDescription = aiAnalysis.description;
		
		if (urlSummaries.length > 0) {
			cardDescription += '\\n\\n📚 **Research Summary:**\\n';
			urlSummaries.forEach((summary, index) => {
				const urlTitle = enhancedUrls[index]?.title || `URL ${index + 1}`;
				cardDescription += `\\n**${urlTitle}:**\\n${summary}\\n`;
			});
		}

		// Step 4.5: Detect tools in description and task text for URL generation
		const combinedText = `${task.cleanText} ${cardDescription}`;
		const toolDetection = this.detectAndLinkTools(combinedText);

		// Step 5: Create smart card
		const isQuestionTask = this.isQuestion(task.cleanText);
		// Format title for questions professionally
		let formattedTitle = task.cleanText;
		if (isQuestionTask) {
			// Remove question mark emoji if present  
			formattedTitle = formattedTitle.replace(/^\s*[❓?]\s*/, '');
			// Add professional prefix
			formattedTitle = `Research: ${formattedTitle}`;
		} else {
			// Use regular prefix for non-questions
			const prefix = this.plugin.settings.smartExtractPrefix || '🤖 ';
			formattedTitle = `${prefix}${formattedTitle}`;
		}
		
		const smartCard: SmartCard = {
			id: `smart-card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
			title: formattedTitle,
			description: cardDescription,
			tags: task.tags,
			noteLinks: [],
			todos: aiAnalysis.nextSteps.map(step => ({
				id: `todo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
				text: step,
				completed: false,
				created: Date.now()
			})),
			researchUrls: [
				...enhancedUrls.map(url => ({
					id: `url-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
					url: url.url,
					title: url.title,
					description: url.summary || '🔗 Reference link for research',
					created: Date.now(),
					status: 'unread' as const,
					importance: 'medium' as const
				})),
				...additionalSearchUrls.map(url => ({
					id: `search-url-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
					url: url.url,
					title: url.title,
					description: '🔍 Additional research resource',
					created: Date.now(),
					status: 'unread' as const,
					importance: 'high' as const
				})),
				...toolDetection.toolUrls.map(tool => ({
					id: `tool-url-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
					url: tool.url,
					title: tool.title,
					description: '🔧 Tool or resource for this task',
					created: Date.now(),
					status: 'unread' as const,
					importance: 'high' as const
				}))
			].slice(0, 8), // Increased limit to accommodate tool URLs
			created: Date.now(),
			modified: Date.now(),
			aiAnalysis,
			originalTask: task,

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
				detected: Date.now(),
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
			
			// Check if this is a YouTube URL and handle it specially
			if (this.isYouTubeURL(url)) {
				console.log(`[DEBUG] YouTube URL detected, routing to YouTube processing: ${url}`);
				return await this.processYouTubeVideo(url);
			}

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
		const allTasks = await extractor.extractTasksFromSource();
		
		// For smart extraction, only process tasks with hashtags
		// This maintains backward compatibility while fixing the counter
		return allTasks.filter(task => task.hasHashtags);
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



			// Rough cost estimation (tokens * model cost)
			const estimatedTokensPerTask = 300; // rough estimate
			const totalEstimatedTokens = extractedTasks.length * estimatedTokensPerTask;
			const costPerMillion = 0.50; // rough estimate for gpt-4.1-mini
			const estimatedCost = (totalEstimatedTokens / 1000000) * costPerMillion;

			return {
				smartCards,
				totalTasks: extractedTasks.length,
				estimatedCost,
	
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



			// Rough cost estimation (tokens * model cost)
			const estimatedTokensPerTask = 350; // slightly higher for full analysis
			const totalEstimatedTokens = extractedTasks.length * estimatedTokensPerTask;
			const costPerMillion = this.getCostPerMillion();
			const estimatedCost = (totalEstimatedTokens / 1000000) * costPerMillion;

			const preview: SmartExtractionPreview = {
				smartCards,
				totalTasks: extractedTasks.length,
				estimatedCost,
	
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