import { requestUrl, TFile } from 'obsidian';
import CrystalBoardsPlugin from './main';
import { TodoItem, DetectedUrl, AISummary } from './types';
import { OpenAIService } from './openai-service';

export interface TodoAISummaryResult {
	success: boolean;
	todo: TodoItem;
	summary?: AISummary;
	note?: TFile;
	errors?: string[];
}

export interface AutoNoteOptions {
	createNote: boolean;
	notePath?: string;
	noteTemplate?: string;
	linkToCard: boolean;
}

export class TodoAIService {
	private plugin: CrystalBoardsPlugin;
	private openAIService: OpenAIService;
	private urlCache = new Map<string, { summary: AISummary; timestamp: number }>();

	constructor(plugin: CrystalBoardsPlugin) {
		this.plugin = plugin;
		this.initializeOpenAI();
	}

	private initializeOpenAI(): void {
		const settings = this.plugin.settings;
		this.openAIService = new OpenAIService({
			apiKey: settings.openAIApiKey || '',
			model: settings.openAIModel || 'gpt-4o-mini',
			maxTokens: settings.smartExtractMaxTokens || 500,
			temperature: settings.smartExtractTemperature || 0.3
		});
	}

	/**
	 * Detect URLs in todo text
	 */
	detectUrlsInTodo(todoText: string): DetectedUrl[] {
		// Enhanced URL regex that captures more URL formats
		const urlRegex = /https?:\/\/(?:[-\w.])+(?::[0-9]+)?(?:\/(?:[\w\/_.])*(?:\?(?:[\w&=%.])*)?(?:#(?:[\w.])*)?)?/gi;
		const urls: DetectedUrl[] = [];
		let match;

		while ((match = urlRegex.exec(todoText)) !== null) {
			try {
				const url = match[0];
				const urlObj = new URL(url);
				
				urls.push({
					id: `url-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
					url: url,
					title: this.extractTitleFromUrl(url),
					domain: urlObj.hostname,
					detected: Date.now()
				});
			} catch (error) {
				console.warn('Invalid URL detected:', match[0]);
			}
		}

		return urls;
	}

	/**
	 * Extract a reasonable title from URL
	 */
	private extractTitleFromUrl(url: string): string {
		try {
			const urlObj = new URL(url);
			const pathname = urlObj.pathname;
			
			// Extract meaningful parts from pathname
			const parts = pathname.split('/').filter(part => part && part !== 'index.html');
			if (parts.length > 0) {
				const lastPart = parts[parts.length - 1];
				// Convert hyphens/underscores to spaces and title case
				const title = lastPart
					.replace(/[-_]/g, ' ')
					.replace(/\.[^.]*$/, '') // Remove file extension
					.replace(/\b\w/g, l => l.toUpperCase())
					.trim();
				
				// If the title is too short (like "What"), try to get more context
				if (title.length <= 4 && parts.length > 1) {
					// Try to use the second-to-last part as well
					const secondLast = parts[parts.length - 2];
					const combined = `${secondLast.replace(/[-_]/g, ' ')} - ${title}`;
					return combined.replace(/\b\w/g, l => l.toUpperCase()).trim();
				}
				
				// If still too short, use domain instead
				return title.length > 4 ? title : urlObj.hostname;
			}
			
			return urlObj.hostname;
		} catch {
			return 'URL';
		}
	}

	/**
	 * Process a todo with URLs: detect URLs, get AI summaries, optionally create notes
	 */
	async processTodoWithAI(
		todo: TodoItem, 
		options: AutoNoteOptions = { createNote: false, linkToCard: false }
	): Promise<TodoAISummaryResult> {
		const result: TodoAISummaryResult = {
			success: false,
			todo: { ...todo },
			errors: []
		};

		try {
			// Step 1: Detect URLs in todo text
			const detectedUrls = this.detectUrlsInTodo(todo.text);
			
			if (detectedUrls.length === 0) {
				result.success = true;
				return result;
			}

			// Step 2: Update todo with detected URLs
			result.todo.urls = detectedUrls;

			// Step 3: Check if we already have an AI summary (from smart extract)
			let aiSummary = todo.aiSummary;
			
			// If no existing summary, try to get one for the first URL
			if (!aiSummary && detectedUrls.length > 0) {
				const primaryUrl = detectedUrls[0];
				
				aiSummary = (await this.getAISummaryForUrl(primaryUrl.url, todo.text)) || undefined;
			} else if (aiSummary) {
				
			}
			
			if (aiSummary) {
				result.todo.aiSummary = aiSummary;
				result.summary = aiSummary;
			} else if (options.createNote) {
				// If we couldn't fetch URL content but note creation was requested,
				// check if we have any description/summary from the URLs themselves
				const urlWithDescription = detectedUrls.find(u => u.description);
				
				if (urlWithDescription && urlWithDescription.description) {
					// Create a note using the URL's existing description
					
					try {
						// Create a pseudo AI summary from the URL description
						const pseudoSummary: AISummary = {
							id: `summary-${Date.now()}`,
							content: urlWithDescription.description,
							sourceUrl: urlWithDescription.url,
							confidence: 0.85,
							created: Date.now(),
							model: 'smart-extract',
							tokens: 0
						};
						
						const note = await this.createNoteFromSummary(
							todo.text,
							pseudoSummary,
							detectedUrls,
							options
						);
						
						if (note) {
							result.note = note;
							result.todo.linkedNoteId = note.path;
							result.summary = pseudoSummary;
							result.success = true;
							return result;
						}
					} catch (error) {
						result.errors?.push(`Failed to create note with description: ${error.message}`);
					}
				}
				
				// Final fallback: create a basic note with just URL info
				
				try {
					const basicNote = await this.createBasicNoteFromUrl(
						todo.text,
						detectedUrls,
						options
					);
					
					if (basicNote) {
						result.note = basicNote;
						result.todo.linkedNoteId = basicNote.path;
						result.success = true;
						return result;
					}
				} catch (error) {
					result.errors?.push(`Failed to create basic note: ${error.message}`);
				}
			}

			// Step 4: Create note if requested and we have AI summary
			if (options.createNote && aiSummary) {
				try {
					const note = await this.createNoteFromSummary(
						todo.text,
						aiSummary,
						detectedUrls,
						options
					);
					
					if (note) {
						result.note = note;
						result.todo.linkedNoteId = note.path;
					}
				} catch (error) {
					result.errors?.push(`Failed to create note: ${error.message}`);
				}
			}

			// Only mark as success if we accomplished what was requested
			result.success = !options.createNote || result.note !== undefined;
			return result;

		} catch (error) {
			console.error('Todo AI processing failed:', error);
			result.errors?.push(`AI processing failed: ${error.message}`);
			return result;
		}
	}

	/**
	 * Get AI summary for URL with caching
	 */
	private async getAISummaryForUrl(url: string, todoContext: string): Promise<AISummary | null> {
		try {
			// Check cache first
			const cacheKey = `${url}-${this.hashString(todoContext)}`;
			const cached = this.urlCache.get(cacheKey);
			const cacheExpiry = (this.plugin.settings.cacheDurationHours || 24) * 60 * 60 * 1000;
			
			if (cached && (Date.now() - cached.timestamp) < cacheExpiry) {
				return cached.summary;
			}

			// Fetch content and summarize
			const content = await this.fetchUrlContent(url);
			if (!content) {
				
				return null;
			}
			

			// Create context-aware prompt
			const prompt = `You are analyzing a URL found in a task/todo item. Provide a focused summary that helps with task completion.

Task: "${todoContext}"
URL: ${url}
Content: ${content}

Create a summary that:
- Focuses on information relevant to completing the task
- Identifies key actionable items or requirements
- Extracts important details, deadlines, or specifications
- Notes any resources, tools, or next steps mentioned
- Keeps it concise but comprehensive (3-4 sentences max)

Summary:`;

			const summaryText = await this.openAIService.callOpenAI(prompt, false);
			
			const aiSummary: AISummary = {
				id: `summary-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
				content: summaryText.trim(),
				sourceUrl: url,
				confidence: 0.85, // Base confidence for URL summaries
				created: Date.now(),
				model: this.plugin.settings.openAIModel,
				tokens: this.estimateTokens(summaryText)
			};

			// Cache the result
			if (this.plugin.settings.cacheAIResponses !== false) {
				this.urlCache.set(cacheKey, { 
					summary: aiSummary, 
					timestamp: Date.now() 
				});
			}

			return aiSummary;

		} catch (error) {
			console.error(`Failed to get AI summary for URL ${url}:`, error);
			return null;
		}
	}

	/**
	 * Fetch URL content with multiple strategies
	 */
	private async fetchUrlContent(url: string): Promise<string | null> {
		// Validate URL first
		if (!this.isValidUrl(url)) {
			console.error(`Invalid URL format, cannot fetch: ${url}`);
			return null;
		}
		
		try {
			
			
			// Try to use the smart extraction service's URL scraping
			if (this.plugin.smartExtractionService) {
				const smartService = this.plugin.smartExtractionService as any;
				if (typeof smartService.tryMCPScraping === 'function') {
					try {
						const content = await smartService.tryMCPScraping(url);
						if (content && content.length > 100) {
							
							return content.substring(0, 3000); // Limit for AI processing
						}
					} catch (mcpError) {
						console.log(`MCP scraping failed: ${mcpError.message}, trying fallback`);
						// Continue to fallback method
					}
				}
			}

			// Fallback to direct fetch with readability
			const response = await requestUrl({
				url: url,
				method: 'GET',
				headers: {
					'User-Agent': 'Mozilla/5.0 (compatible; Crystal Boards AI)'
				}
			});

			if (response.status !== 200) {
				throw new Error(`HTTP ${response.status}`);
			}

			// Simple content extraction (strip HTML)
			let content = response.text;
			content = content.replace(/<script[^>]*>.*?<\/script>/gi, '');
			content = content.replace(/<style[^>]*>.*?<\/style>/gi, '');
			content = content.replace(/<[^>]*>/g, ' ');
			content = content.replace(/\s+/g, ' ').trim();

			// Limit content size
			return content.substring(0, 3000);

		} catch (error) {
			console.error(`Failed to fetch URL content: ${error.message}`);
			return null;
		}
	}

	/**
	 * Validate URL before attempting to fetch
	 */
	private isValidUrl(url: string): boolean {
		try {
			const urlObj = new URL(url);
			// Check for valid protocols
			if (!['http:', 'https:'].includes(urlObj.protocol)) {
				
				return false;
			}
			// Check for valid hostname
			if (!urlObj.hostname || urlObj.hostname.length < 3) {
				
				return false;
			}
			return true;
		} catch (error) {
			
			return false;
		}
	}

	/**
	 * Create a note from AI summary
	 */
	/**
	 * Create a basic note when URL content cannot be fetched
	 */
	private async createBasicNoteFromUrl(
		todoText: string,
		urls: Array<{ url: string; title?: string }>,
		options: AutoNoteOptions
	): Promise<TFile | null> {
		try {
			// Generate note title from todo text or URL
			const titleText = urls[0].title || todoText || urls[0].url;
			const title = this.generateNoteTitle(titleText);
			
			// Build basic note content
			let noteContent = `# ${title}\n\n`;
			noteContent += `## Task\n${todoText}\n\n`;
			noteContent += `## URLs\n`;
			
			for (const urlInfo of urls) {
				noteContent += `- [${urlInfo.title || urlInfo.url}](${urlInfo.url})\n`;
			}
			
			noteContent += `\n## Summary\n`;
			noteContent += `*Note: URL content could not be fetched automatically. Please visit the link(s) above to review the content.*\n\n`;
			
			// Add metadata
			noteContent += `---\n`;
			noteContent += `Created: ${new Date().toISOString()}\n`;
			noteContent += `Source: Crystal Boards - Todo AI\n`;
			noteContent += `Status: URL fetch failed - manual review needed\n`;
			
			// Create the note file
			const folder = options.notePath || 'AI Notes/';
			// Ensure folder path doesn't start with / (which would make it absolute)
			const cleanFolder = folder.startsWith('/') ? folder.slice(1) : folder;
			const folderPath = cleanFolder.endsWith('/') ? cleanFolder.slice(0, -1) : cleanFolder;
			
			// Ensure the folder exists (handle existing folder gracefully)
			try {
				const folderObj = this.plugin.app.vault.getAbstractFileByPath(folderPath);
				if (!folderObj) {
					await this.plugin.app.vault.createFolder(folderPath);
				}
			} catch (error) {
				// Folder might already exist or parent folders need to be created
				if (!error.message?.includes('already exists')) {
					console.error('Failed to create folder:', error);
					// Try to create parent folders if needed
					const parts = folderPath.split('/');
					let currentPath = '';
					for (const part of parts) {
						if (part) {
							currentPath = currentPath ? `${currentPath}/${part}` : part;
							const exists = this.plugin.app.vault.getAbstractFileByPath(currentPath);
							if (!exists) {
								try {
									await this.plugin.app.vault.createFolder(currentPath);
								} catch (e) {
									// Ignore if folder exists
								}
							}
						}
					}
				}
			}
			
			// Generate unique filename if file already exists
			let fileName = `${title}.md`;
			let fullPath = `${folderPath}/${fileName}`;
			let counter = 1;
			
			while (this.plugin.app.vault.getAbstractFileByPath(fullPath)) {
				fileName = `${title} ${counter}.md`;
				fullPath = `${folderPath}/${fileName}`;
				counter++;
			}
			
			// Create the note
			const noteFile = await this.plugin.app.vault.create(fullPath, noteContent);
			
			return noteFile;
			
		} catch (error) {
			console.error('Failed to create basic note:', error);
			throw error;
		}
	}

	private async createNoteFromSummary(
		todoText: string,
		aiSummary: AISummary,
		urls: DetectedUrl[],
		options: AutoNoteOptions
	): Promise<TFile | null> {
		try {
			// Generate note name from todo text
			const noteBaseName = this.generateNoteTitle(todoText);
			const folder = options.notePath || 'AI Summaries/';
			// Ensure folder path doesn't start with / (which would make it absolute)
			const cleanFolder = folder.startsWith('/') ? folder.slice(1) : folder;
			const folderPath = cleanFolder.endsWith('/') ? cleanFolder.slice(0, -1) : cleanFolder;
			
			// Ensure the folder exists (handle existing folder gracefully)
			try {
				const folderObj = this.plugin.app.vault.getAbstractFileByPath(folderPath);
				if (!folderObj) {
					await this.plugin.app.vault.createFolder(folderPath);
				}
			} catch (error) {
				// Folder might already exist or parent folders need to be created
				if (!error.message?.includes('already exists')) {
					console.error('Failed to create folder:', error);
					// Try to create parent folders if needed
					const parts = folderPath.split('/');
					let currentPath = '';
					for (const part of parts) {
						if (part) {
							currentPath = currentPath ? `${currentPath}/${part}` : part;
							const exists = this.plugin.app.vault.getAbstractFileByPath(currentPath);
							if (!exists) {
								try {
									await this.plugin.app.vault.createFolder(currentPath);
								} catch (e) {
									// Ignore if folder exists
								}
							}
						}
					}
				}
			}
			
			// Generate unique filename if file already exists
			let fileName = `${noteBaseName}.md`;
			let fullPath = `${folderPath}/${fileName}`;
			let counter = 1;
			
			while (this.plugin.app.vault.getAbstractFileByPath(fullPath)) {
				fileName = `${noteBaseName} ${counter}.md`;
				fullPath = `${folderPath}/${fileName}`;
				counter++;
			}
			
			// Build note content
			const noteContent = this.buildNoteContent(todoText, aiSummary, urls, options);
			
			// Create the note
			const file = await this.plugin.app.vault.create(fullPath, noteContent);
			
			
			return file;

		} catch (error) {
			console.error('Failed to create note:', error);
			throw error;
		}
	}

	/**
	 * Generate a clean note title from todo text
	 */
	private generateNoteTitle(todoText: string): string {
		// Try to extract a meaningful title before removing URLs
		let title = todoText;
		
		// If it starts with "Research:", keep that part
		if (title.startsWith('Research:')) {
			// Extract the research topic (usually between Research: and the URL)
			const match = title.match(/Research:\s*([^-]+?)(?:\s*-\s*https?:\/\/|$)/);
			if (match && match[1]) {
				title = `Research - ${match[1].trim()}`;
			}
		}
		
		// Remove URLs but keep the domain name as context
		const urlMatch = todoText.match(/https?:\/\/([^\/\s]+)/);
		const domain = urlMatch ? urlMatch[1].replace('www.', '') : '';
		
		// Clean up the title
		title = title
			.replace(/https?:\/\/[^\s]+/gi, '') // Remove URLs
			.replace(/[#@]/g, '')
			.replace(/\s*-\s*$/, '') // Remove trailing dash
			.trim();
		
		// If title is too short or generic, add domain context
		if (title.length < 10 && domain) {
			title = title ? `${title} - ${domain}` : domain;
		}
		
		// Limit length and clean up
		title = title.substring(0, 60);
		title = title.replace(/[<>:"\/\\|?*]/g, ''); // Remove invalid filename chars
		title = title.replace(/\s+/g, ' ').trim();
		
		// Fallback if title becomes empty
		return title || `AI Summary ${new Date().toLocaleDateString()}`;
	}

	/**
	 * Build the content for the auto-created note
	 */
	private buildNoteContent(
		todoText: string,
		aiSummary: AISummary,
		urls: DetectedUrl[],
		options: AutoNoteOptions
	): string {
		const timestamp = new Date().toLocaleString();
		
		let content = '';
		
		// Use custom template if provided
		if (options.noteTemplate) {
			content = options.noteTemplate
				.replace('{{todoText}}', todoText)
				.replace('{{summary}}', aiSummary.content)
				.replace('{{url}}', urls[0]?.url || '')
				.replace('{{timestamp}}', timestamp);
			return content;
		}

		// Default template
		content += `# ${this.generateNoteTitle(todoText)}\n\n`;
		content += `> 🤖 **AI-Generated Summary**\n`;
		content += `> Created: ${timestamp}\n`;
		content += `> Source: Crystal Boards Todo AI\n\n`;
		
		content += `## Original Task\n`;
		// Clean up the original task to avoid title duplication and make URLs clickable
		const cleanedTodoText = todoText
			.replace(/^Research:\s*([^-]+?)\s*-\s*/, '') // Remove "Research: title - " part since it's already in the main title
			.replace(/(https?:\/\/[^\s]+)/g, '[$1]($1)'); // Make URLs clickable
		content += `${cleanedTodoText}\n\n`;
		
		content += `## AI Summary\n`;
		// Check if we have actual content or just placeholder text
		const hasRealContent = aiSummary.content && 
			aiSummary.content.trim() !== '🔗 Reference link for research' && 
			aiSummary.content.trim().length > 0;
		
		if (hasRealContent) {
			content += `${aiSummary.content}\n\n`;
		} else {
			content += `AI summary extraction is still in progress. Please check back later or manually review the source links below.\n\n`;
		}
		
		if (urls.length > 0) {
			content += `## Source Links\n`;
			urls.forEach(url => {
				// Improve title extraction to avoid "What" and other short titles
				let displayTitle = url.title;
				
				// If title is too short, generic, or problematic, extract from URL
				if (!displayTitle || displayTitle === 'What' || displayTitle.length <= 3) {
					try {
						const urlObj = new URL(url.url);
						const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);
						
						if (pathParts.length > 0) {
							// Use the last meaningful path segment
							displayTitle = pathParts[pathParts.length - 1]
								.replace(/-/g, ' ')
								.replace(/\.(html|htm|php|jsp|asp)$/i, '')
								.split(' ')
								.map(word => word.charAt(0).toUpperCase() + word.slice(1))
								.join(' ');
						} else {
							displayTitle = url.domain || urlObj.hostname || 'Link';
						}
					} catch {
						displayTitle = url.domain || 'Link';
					}
				}
				
				content += `- [${displayTitle}](${url.url})\n`;
			});
			content += '\n';
		}
		
		content += `## Next Steps\n`;
		content += `- [ ] Review the AI summary above\n`;
		content += `- [ ] Visit the source links for more details\n`;
		content += `- [ ] Update this note with your findings\n`;
		content += `- [ ] Mark the original todo as complete\n\n`;
		
		content += `---\n`;
		const modelDisplay = aiSummary.model === 'smart-extract' 
			? 'Smart Extract (Pre-processed)' 
			: (aiSummary.model || 'Unknown');
		content += `*Generated by Crystal Boards AI • Model: ${modelDisplay} • Confidence: ${Math.round(aiSummary.confidence * 100)}%*\n`;

		return content;
	}

	/**
	 * Update todo with AI enhancement results
	 */
	async enhanceTodo(todoId: string, cardId: string, boardId: string, options?: AutoNoteOptions): Promise<TodoAISummaryResult> {
		try {
			// Find the todo in the data structure
			const boards = this.plugin.dataManager.getBoards();
			const board = boards.find(b => b.id === boardId);
			if (!board) {
				throw new Error('Board not found');
			}

			let targetTodo: TodoItem | null = null;
			let targetCard = null;

			// Find the card and todo
			for (const column of board.columns) {
				const card = column.cards.find(c => c.id === cardId);
				if (card) {
					targetCard = card;
					targetTodo = card.todos.find(t => t.id === todoId) || null;
					break;
				}
			}

			if (!targetTodo || !targetCard) {
				throw new Error('Todo or card not found');
			}

			// Process the todo with AI
			const result = await this.processTodoWithAI(targetTodo, options);
			
			if (result.success) {
				// Update the todo in the card
				const todoIndex = targetCard.todos.findIndex(t => t.id === todoId);
				if (todoIndex !== -1) {
					targetCard.todos[todoIndex] = result.todo;
					
					// If a note was created, add it to the card's note links
					if (options?.linkToCard && result.note) {
						if (!targetCard.noteLinks.includes(result.note.path)) {
							targetCard.noteLinks.push(result.note.path);
						}
					}
					
					// Save the changes
					await this.plugin.dataManager.saveData();
				}
			}

			return result;

		} catch (error) {
			console.error('Failed to enhance todo:', error);
			return {
				success: false,
				todo: { id: todoId, text: '', completed: false, created: Date.now() },
				errors: [`Failed to enhance todo: ${error.message}`]
			};
		}
	}

	/**
	 * Batch process multiple todos
	 */
	async enhanceMultipleTodos(
		todoIds: string[],
		cardId: string,
		boardId: string,
		options?: AutoNoteOptions
	): Promise<TodoAISummaryResult[]> {
		const results: TodoAISummaryResult[] = [];
		
		for (const todoId of todoIds) {
			try {
				const result = await this.enhanceTodo(todoId, cardId, boardId, options);
				results.push(result);
				
				// Add delay between requests to avoid rate limiting
				await new Promise(resolve => setTimeout(resolve, 1000));
			} catch (error) {
				results.push({
					success: false,
					todo: { id: todoId, text: '', completed: false, created: Date.now() },
					errors: [`Batch processing failed: ${error.message}`]
				});
			}
		}
		
		return results;
	}

	/**
	 * Utility functions
	 */
	private hashString(str: string): string {
		let hash = 0;
		if (str.length === 0) return hash.toString();
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32-bit integer
		}
		return hash.toString();
	}

	private estimateTokens(text: string): number {
		// Rough estimation: ~4 characters per token
		return Math.ceil(text.length / 4);
	}

	/**
	 * Clear caches
	 */
	clearCache(): void {
		this.urlCache.clear();
	}

	/**
	 * Update configuration
	 */
	updateConfiguration(): void {
		this.initializeOpenAI();
	}

	/**
	 * Get cache statistics
	 */
	getCacheStats(): { summaries: number; oldestEntry: number | null } {
		const entries = Array.from(this.urlCache.values());
		const oldestEntry = entries.length > 0 
			? Math.min(...entries.map(e => e.timestamp))
			: null;
		
		return {
			summaries: this.urlCache.size,
			oldestEntry
		};
	}
}