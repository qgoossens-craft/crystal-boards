import { requestUrl } from 'obsidian';
import { OpenAIService, TaskAnalysis } from './openai-service';
import { TaskExtractionService } from './task-extraction-service';
import { ExtractedTask, ResearchUrl, TodoItem } from './types';
import CrystalBoardsPlugin from './main';

export interface SmartExtractApproval {
	approved: boolean;
	selectedCards: SmartCard[];
	modifications: Record<string, {
		title?: string;
		description?: string;
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
	private baseExtractionService: TaskExtractionService;
	private urlCache = new Map<string, { content: string; timestamp: number }>();

	constructor(plugin: CrystalBoardsPlugin) {
		this.plugin = plugin;
		this.baseExtractionService = plugin.taskExtractionService;
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
						if (modifications.nextSteps) {
							smartCard.todos = modifications.nextSteps.map(step => ({
								id: `todo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
								text: step,
								completed: false,
								created: Date.now()
							}));
						}
					}

					// Determine target board
					const boardName = smartCard.originalTask.board || this.plugin.settings.defaultBoard || 'Tasks';
					
					// Create the card
					await dataManager.createCard(boardName, smartCard);
					
					// Track board usage
					if (!result.boardsCreated.includes(boardName) && !result.boardsUpdated.includes(boardName)) {
						const boards = await dataManager.getAllBoards();
						if (boards.find(b => b.name === boardName)) {
							result.boardsUpdated.push(boardName);
						} else {
							result.boardsCreated.push(boardName);
						}
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

		// Step 3: Create enhanced smart card
		const smartCard: SmartCard = {
			id: `smart-card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
			title: `${this.plugin.settings.extractedTaskPrefix || '📥 '}${task.cleanText}`,
			description: aiAnalysis.description,
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
				description: (url as any).summary,
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
	 * Fetch and summarize URL content
	 */
	private async fetchAndSummarizeURL(url: string): Promise<string> {
		try {
			// Check cache first
			const cacheKey = url;
			const cached = this.urlCache.get(cacheKey);
			const cacheExpiry = (this.plugin.settings.cacheDurationHours || 24) * 60 * 60 * 1000;
			
			if (cached && (Date.now() - cached.timestamp) < cacheExpiry) {
				console.log('Using cached URL content for:', url);
				return cached.content;
			}

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

			// Extract text content (basic HTML stripping)
			let content = response.text;
			content = content.replace(/<script[^>]*>.*?<\/script>/gi, '');
			content = content.replace(/<style[^>]*>.*?<\/style>/gi, '');
			content = content.replace(/<[^>]*>/g, ' ');
			content = content.replace(/\s+/g, ' ').trim();

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
					const smartCard = await this.analyzeTaskWithAI(task);
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