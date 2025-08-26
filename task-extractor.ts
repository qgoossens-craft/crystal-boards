import { App, TFile } from 'obsidian';
import { ExtractedTask, Board, Card, Column, PluginSettings } from './types';
import { LinkManager } from './link-manager';
import CrystalBoardsPlugin from './main';

export class TaskExtractor {
	private app: App;
	private plugin: CrystalBoardsPlugin;
	private linkManager: LinkManager;

	constructor(app: App, plugin: CrystalBoardsPlugin) {
		this.app = app;
		this.plugin = plugin;
		this.linkManager = new LinkManager(app);
	}

	/**
	 * Extract tasks from the configured source note
	 */
	async extractTasksFromSource(): Promise<ExtractedTask[]> {
		const settings = this.plugin.settings;
		
		if (!settings.taskSourcePath) {
			throw new Error('No task source path configured. Please set a source note in settings.');
		}

		const sourceFile = this.app.vault.getAbstractFileByPath(settings.taskSourcePath);
		
		if (!sourceFile || !(sourceFile instanceof TFile)) {
			throw new Error(`Source note "${settings.taskSourcePath}" not found.`);
		}

		const content = await this.app.vault.read(sourceFile);
		return this.parseTasksFromContent(content);
	}

	/**
	 * Parse tasks from markdown content
	 */
	parseTasksFromContent(content: string): ExtractedTask[] {
		const lines = content.split('\n');
		const tasks: ExtractedTask[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			
			// Match bullet points: •, -, *, +
			const bulletMatch = line.match(/^[•\-\*\+]\s+(.+)$/);
			
			if (bulletMatch) {
				const taskText = bulletMatch[1].trim();
				
				// Skip empty tasks
				if (!taskText) continue;

				// Check if task contains hashtags
				const hasHashtags = /#[\w-]+/g.test(taskText);
				
				// Note: We now count all tasks for accurate counter updates
				// Smart extraction will still filter for hashtags during processing

				const extractedTask = this.parseTaskLine(taskText, line, i + 1);
				extractedTask.hasHashtags = hasHashtags; // Add flag to track hashtag presence
				tasks.push(extractedTask);
			}
		}

		return tasks;
	}

	/**
	 * Parse individual task line and extract tags, URLs, and clean text
	 */
	private parseTaskLine(taskText: string, originalLine: string, lineNumber: number): ExtractedTask {
		// Extract hashtags
		const tagMatches = taskText.match(/#[\w-]+/g) || [];
		const tags = tagMatches.map(tag => tag.substring(1)); // Remove # prefix

		// Extract URLs with titles
		const urls: { url: string; title: string }[] = [];
		
		// Match markdown links: [title](url) or bare URLs
		const linkMatches = taskText.matchAll(/\[([^\]]*)\]\(([^)]+)\)|https?:\/\/[^\s]+/g);
		
		for (const match of linkMatches) {
			if (match[1] && match[2]) {
				// Markdown link format [title](url)
				urls.push({
					title: match[1],
					url: match[2]
				});
			} else {
				// Bare URL - extract domain as title
				const url = match[0];
				const domain = this.extractDomainFromUrl(url);
				urls.push({
					title: domain || 'Link',
					url: url
				});
			}
		}

		// Create clean text by removing tags and URLs
		let cleanText = taskText;
		
		// Remove hashtags
		cleanText = cleanText.replace(/#[\w-]+/g, '').trim();
		
		// Remove checkbox syntax ([ ], [x], [X], etc.)
		cleanText = cleanText.replace(/^\s*\[[^\]]*\]\s*/, '').trim();
		
		// Remove markdown links
		cleanText = cleanText.replace(/\[([^\]]*)\]\([^)]+\)/g, '$1').trim();
		
		// Remove bare URLs
		cleanText = cleanText.replace(/https?:\/\/[^\s]+/g, '').trim();
		
		// Clean up multiple spaces
		cleanText = cleanText.replace(/\s+/g, ' ').trim();

		return {
			text: taskText,
			cleanText: cleanText,
			tags: tags,
			urls: urls,
			originalLine: originalLine,
			lineNumber: lineNumber
		};
	}

	/**
	 * Extract domain from URL for fallback titles
	 */
	private extractDomainFromUrl(url: string): string | null {
		try {
			const urlObj = new URL(url);
			return urlObj.hostname.replace('www.', '');
		} catch {
			return null;
		}
	}

	/**
	 * Categorize tasks by their tags
	 */
	categorizeTasks(tasks: ExtractedTask[]): Map<string, ExtractedTask[]> {
		const categorized = new Map<string, ExtractedTask[]>();
		
		for (const task of tasks) {
			if (task.tags.length === 0) {
				// Tasks without tags go to default category
				const defaultBoard = this.plugin.settings.defaultExtractionBoard || 'Inbox';
				if (!categorized.has(defaultBoard)) {
					categorized.set(defaultBoard, []);
				}
				categorized.get(defaultBoard)!.push(task);
			} else {
				// Tasks with tags - add to each matching board
				for (const tag of task.tags) {
					const boardName = this.findBoardNameForTag(tag);
					
					if (!categorized.has(boardName)) {
						categorized.set(boardName, []);
					}
					categorized.get(boardName)!.push(task);
				}
			}
		}

		return categorized;
	}

	/**
	 * Find the appropriate board name for a given tag
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
	 * Find board by name (case-insensitive)
	 */
	findBoardForTag(tag: string, boards: Board[]): Board | null {
		const boardName = this.findBoardNameForTag(tag);
		
		return boards.find(board => 
			board.name.toLowerCase() === boardName.toLowerCase()
		) || null;
	}

	/**
	 * Enhance URLs from task with better metadata and categorization
	 */
	private async enhanceTaskUrls(urls: { url: string; title: string }[], timestamp: number): Promise<any[]> {
		if (urls.length === 0) {
			return [];
		}

		try {
			// Enhance all URLs in parallel
			const enhancedMetadata = await this.linkManager.enhanceUrls(urls);
			
			// Convert enhanced metadata to ResearchUrl format
			return enhancedMetadata.map((metadata, index) => ({
				id: `url-${timestamp}-${index}`,
				title: metadata.title,
				url: metadata.originalUrl,
				description: metadata.description,
				created: timestamp,
				// Store additional metadata for future use
				_enhanced: {
					category: metadata.category,
					icon: metadata.icon,
					domain: metadata.domain,
					previewData: metadata.previewData
				}
			}));
		} catch (error) {
			console.warn('Failed to enhance URLs, falling back to basic processing:', error);
			
			// Fallback to basic URL processing
			return urls.map((urlData, index) => ({
				id: `url-${timestamp}-${index}`,
				title: urlData.title,
				url: urlData.url,
				description: '',
				created: timestamp
			}));
		}
	}

	/**
	 * Create a card from an extracted task (with enhanced URL processing)
	 */
	async createCardFromTask(task: ExtractedTask): Promise<Card> {
		const settings = this.plugin.settings;
		const now = Date.now();
		
		// Generate unique ID
		const cardId = `card-${now}-${Math.random().toString(36).substr(2, 9)}`;
		
		// Create title with optional prefix
		const prefix = settings.extractedTaskPrefix || '';
		const title = `${prefix}${task.cleanText}`;

		// Enhance URLs with better metadata and categorization
		const researchUrls = await this.enhanceTaskUrls(task.urls, now);

		return {
			id: cardId,
			title: title,
			description: '', // Could be populated from task description if format changes
			tags: task.tags,
			noteLinks: [], // Could be populated if tasks reference notes
			todos: [], // Empty for now, could parse sub-tasks later
			researchUrls: researchUrls,
			created: now,
			modified: now
		};
	}

	/**
	 * Get or create a board for the given name
	 */
	async getOrCreateBoard(boardName: string): Promise<Board> {
		const boards = this.plugin.dataManager.getBoards();
		
		// Try to find existing board
		const existingBoard = boards.find(board => 
			board.name.toLowerCase() === boardName.toLowerCase()
		);

		if (existingBoard) {
			return existingBoard;
		}

		// Create new board
		const now = Date.now();
		const boardId = `board-${now}-${Math.random().toString(36).substr(2, 9)}`;
		
		const newBoard: Board = {
			id: boardId,
			name: boardName,
			folderPath: `${this.plugin.settings.kanbanFolderPath}/${boardName}`,
			position: boards.length,
			columns: this.createDefaultColumns(),
			created: now,
			modified: now
		};

		await this.plugin.dataManager.addBoard(newBoard);
		
		// Create folder for the board
		const folderExists = await this.app.vault.adapter.exists(newBoard.folderPath);
		if (!folderExists) {
			await this.app.vault.createFolder(newBoard.folderPath);
		}

		return newBoard;
	}

	/**
	 * Create default columns for a new board
	 */
	private createDefaultColumns(): Column[] {
		const now = Date.now();
		const colors = this.plugin.settings.defaultColumnColors;
		
		const defaultColumnNames = ['To Do', 'In Progress', 'Done'];
		
		return defaultColumnNames.map((name, index) => ({
			id: `column-${now}-${index}`,
			name: name,
			color: colors[index % colors.length],
			position: index,
			cards: []
		}));
	}

	/**
	 * Add card to the appropriate column in a board
	 */
	async addCardToBoard(card: Card, board: Board): Promise<void> {
		const settings = this.plugin.settings;
		const targetColumnName = settings.extractionColumnName || 'To Do';
		
		// Find the target column
		let targetColumn = board.columns.find(col => 
			col.name.toLowerCase() === targetColumnName.toLowerCase()
		);

		// If target column doesn't exist, use first column
		if (!targetColumn && board.columns.length > 0) {
			targetColumn = board.columns[0];
		}

		// If no columns exist, create default ones
		if (!targetColumn) {
			board.columns = this.createDefaultColumns();
			targetColumn = board.columns[0];
		}

		// Add card to column
		targetColumn.cards.push(card);
		
		// Update board
		board.modified = Date.now();
		await this.plugin.dataManager.updateBoard(board);
	}

	/**
	 * Remove extracted tasks from source note (if enabled)
	 */
	async removeExtractedTasksFromSource(extractedTasks: ExtractedTask[]): Promise<void> {
		const settings = this.plugin.settings;
		
		if (!settings.removeExtractedTasks || !settings.taskSourcePath) {
			return;
		}

		const sourceFile = this.app.vault.getAbstractFileByPath(settings.taskSourcePath);
		
		if (!sourceFile || !(sourceFile instanceof TFile)) {
			return;
		}

		const content = await this.app.vault.read(sourceFile);
		const lines = content.split('\n');
		
		// Remove lines that were extracted (in reverse order to maintain line numbers)
		const lineNumbersToRemove = extractedTasks
			.map(task => task.lineNumber - 1) // Convert to 0-based index
			.sort((a, b) => b - a); // Sort in descending order

		for (const lineIndex of lineNumbersToRemove) {
			lines.splice(lineIndex, 1);
		}

		const newContent = lines.join('\n');
		await this.app.vault.modify(sourceFile, newContent);
	}
}