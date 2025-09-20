import { App, Notice } from 'obsidian';
import { TaskExtractor } from './task-extractor';
import { ExtractedTask, Board } from './types';
import CrystalBoardsPlugin from './main';

export interface ExtractionResult {
	success: boolean;
	tasksExtracted: number;
	boardsCreated: string[];
	boardsUpdated: string[];
	errors: string[];
}

export class TaskExtractionService {
	private app: App;
	private plugin: CrystalBoardsPlugin;
	private extractor: TaskExtractor;

	constructor(app: App, plugin: CrystalBoardsPlugin) {
		this.app = app;
		this.plugin = plugin;
		this.extractor = new TaskExtractor(app, plugin);
	}

	/**
	 * Main extraction method - orchestrates the entire process
	 */
	async extractTasks(): Promise<ExtractionResult> {
		const result: ExtractionResult = {
			success: false,
			tasksExtracted: 0,
			boardsCreated: [],
			boardsUpdated: [],
			errors: []
		};

		try {
			// Step 1: Validate settings
			if (!this.validateSettings()) {
				result.errors.push('Task extraction settings are not properly configured');
				return result;
			}

			// Step 2: Extract tasks from source
			const allTasks = await this.extractor.extractTasksFromSource();
			
			// Filter to only process tasks with hashtags for extraction (not counting)
			const extractedTasks = allTasks.filter(task => task.hasHashtags);
			
			if (extractedTasks.length === 0) {
				result.success = true;
				result.errors.push('No tasks with hashtags found in source note');
				return result;
			}

			// Step 3: Categorize tasks by tags/boards
			const categorizedTasks = this.extractor.categorizeTasks(extractedTasks);

			// Step 4: Process each category and create/update boards
			for (const [boardName, tasks] of categorizedTasks.entries()) {
				try {
					await this.processBoardTasks(boardName, tasks, result);
				} catch (error) {
					result.errors.push(`Error processing board "${boardName}": ${error.message}`);
				}
			}

			// Step 5: Remove extracted tasks from source (if enabled)
			if (this.plugin.settings.removeExtractedTasks) {
				try {
					await this.extractor.removeExtractedTasksFromSource(extractedTasks);
				} catch (error) {
					result.errors.push(`Error removing tasks from source: ${error.message}`);
				}
			}

			result.tasksExtracted = extractedTasks.length;
			result.success = result.errors.length === 0;

		} catch (error) {
			result.errors.push(`Extraction failed: ${error.message}`);
		}

		return result;
	}

	/**
	 * Process tasks for a specific board
	 */
	private async processBoardTasks(
		boardName: string, 
		tasks: ExtractedTask[], 
		result: ExtractionResult
	): Promise<void> {
		// Get or create the board
		const existingBoards = this.plugin.dataManager.getBoards();
		const existingBoard = existingBoards.find(b => 
			b.name.toLowerCase() === boardName.toLowerCase()
		);

		const board = await this.extractor.getOrCreateBoard(boardName);
		
		if (!existingBoard) {
			result.boardsCreated.push(boardName);
		} else if (!result.boardsUpdated.includes(boardName)) {
			result.boardsUpdated.push(boardName);
		}

		// Create cards from tasks and add to board
		for (const task of tasks) {
			const card = await this.extractor.createCardFromTask(task);
			await this.extractor.addCardToBoard(card, board);
		}
	}

	/**
	 * Validate extraction settings
	 */
	private validateSettings(): boolean {
		const settings = this.plugin.settings;
		
		if (!settings.taskSourcePath) {
			return false;
		}

		// Check if source file exists
		const sourceFile = this.app.vault.getAbstractFileByPath(settings.taskSourcePath);
		if (!sourceFile) {
			return false;
		}

		return true;
	}

	/**
	 * Show extraction results to user
	 */
	showExtractionResult(result: ExtractionResult): void {
		if (result.success) {
			const messages = [`✅ Successfully extracted ${result.tasksExtracted} tasks`];
			
			if (result.boardsCreated.length > 0) {
				messages.push(`📋 Created boards: ${result.boardsCreated.join(', ')}`);
			}
			
			if (result.boardsUpdated.length > 0) {
				messages.push(`🔄 Updated boards: ${result.boardsUpdated.join(', ')}`);
			}

			new Notice(messages.join('\n'), 5000);
		} else {
			const errorMsg = result.errors.join('\n');
			new Notice(`❌ Extraction failed:\n${errorMsg}`, 7000);
		}
	}

	/**
	 * Quick extraction for testing/development
	 */
	async quickExtract(): Promise<void> {
		const result = await this.extractTasks();
		this.showExtractionResult(result);
		
		// Refresh dashboard if it's open
		await this.refreshDashboard();
	}

	/**
	 * Auto-extraction on startup (if enabled)
	 */
	async autoExtractOnStartup(): Promise<void> {
		if (!this.plugin.settings.autoExtractOnStartup) {
			return;
		}

		try {
			const result = await this.extractTasks();
			
			if (result.success && result.tasksExtracted > 0) {
				new Notice(`🚀 Auto-extracted ${result.tasksExtracted} tasks on startup`, 3000);
			}
			
			// Always refresh dashboard on startup extraction
			await this.refreshDashboard();
			
		} catch (error) {
			console.error('Auto-extraction on startup failed:', error);
		}
	}

	/**
	 * Refresh the dashboard view if it's currently open
	 */
	private async refreshDashboard(): Promise<void> {
		const dashboardLeaves = this.app.workspace.getLeavesOfType('crystal-boards-dashboard');
		for (const leaf of dashboardLeaves) {
			if (leaf.view && typeof (leaf.view as any).renderDashboard === 'function') {
				await (leaf.view as any).renderDashboard();
			}
		}
	}

	/**
	 * Get extraction statistics for debugging/info
	 */
	async getExtractionStats(): Promise<{
		sourceFileExists: boolean;
		tasksInSource: number;
		configuraitonValid: boolean;
		lastExtraction?: Date;
	}> {
		const stats = {
			sourceFileExists: false,
			tasksInSource: 0,
			configuraitonValid: this.validateSettings(),
			lastExtraction: undefined as Date | undefined
		};

		try {
			if (this.plugin.settings.taskSourcePath) {
				
				const sourceFile = this.app.vault.getAbstractFileByPath(this.plugin.settings.taskSourcePath);
				
				if (sourceFile) {
					stats.sourceFileExists = true;
					const content = await this.app.vault.read(sourceFile as any);
					
					const tasks = this.extractor.parseTasksFromContent(content);
					const tasksWithHashtags = tasks.filter(task => task.hasHashtags);
					
					stats.tasksInSource = tasks.length; // Count all tasks
				} else {
					
				}
			} else {
				
			}
		} catch (error) {
			console.error('Error getting extraction stats:', error);
		}

		return stats;
	}
}