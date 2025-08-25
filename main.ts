import { Plugin, Notice, TFile } from 'obsidian';
import { DashboardView } from './dashboard-view';
import { BoardView } from './board-view';
import { DataManager } from './data-manager';
import { TaskExtractionService } from './task-extraction-service';
import { SmartExtractionService } from './smart-extraction-service';
import { TodoAIService } from './todo-ai-service';
import { PluginSettings, DASHBOARD_VIEW_TYPE, BOARD_VIEW_TYPE, Board } from './types';
import { CrystalBoardsSettingTab } from './settings-tab';

export default class CrystalBoardsPlugin extends Plugin {
	settings: PluginSettings;
	dataManager: DataManager;
	taskExtractionService: TaskExtractionService;
	smartExtractionService: SmartExtractionService;
	todoAIService: TodoAIService;
		async onload() {
		console.log('Loading Crystal Boards plugin');

		// Initialize data manager
		this.dataManager = new DataManager(this);
		await this.dataManager.loadData();
		await this.dataManager.fixBoardPositions(); // Fix any position corruption
		this.settings = this.dataManager.getSettings();

		// Initialize task extraction service
		this.taskExtractionService = new TaskExtractionService(this.app, this);
		
		// Initialize smart extraction service
		this.smartExtractionService = new SmartExtractionService(this);
		
		// Initialize todo AI service
		this.todoAIService = new TodoAIService(this);
		
		// Set up file watcher for task source file
		this.setupTaskSourceFileWatcher();

		// Register views
		this.registerView(
			DASHBOARD_VIEW_TYPE,
			(leaf) => new DashboardView(leaf, this)
		);

		this.registerView(
			BOARD_VIEW_TYPE,
			(leaf) => new BoardView(leaf, this, {} as Board) // Will be updated when opening specific board
		);

		// Add ribbon icon
		this.addRibbonIcon('layout-dashboard', 'Crystal Boards', () => {
			this.activateDashboardView();
		});

		// Add commands
		this.addCommand({
			id: 'open-crystal-boards-dashboard',
			name: 'Open Crystal Boards Dashboard',
			callback: () => {
				this.activateDashboardView();
			}
		});

		this.addCommand({
			id: 'create-new-board',
			name: 'Create New Board',
			callback: () => {
				this.activateDashboardView();
				// Focus will trigger creation modal
			}
		});

		this.addCommand({
			id: 'extract-tasks',
			name: 'Extract Tasks from Source Note',
			callback: async () => {
				if (this.settings.useSmartExtract) {
					await this.smartExtractionService.performSmartExtraction();
				} else {
					await this.taskExtractionService.quickExtract();
				}
			}
		});

		this.addCommand({
			id: 'smart-extract-tasks',
			name: 'Smart Extract Tasks with AI',
			callback: async () => {
				if (!this.settings.useSmartExtract) {
					new Notice('Smart Extract is disabled. Enable it in settings first.');
					return;
				}
				await this.smartExtractionService.performSmartExtraction();
			}
		});

		// Add settings tab
		this.addSettingTab(new CrystalBoardsSettingTab(this.app, this));

		// Setup global accent color change listener
		this.setupAccentColorListener();

		// Ensure Kanban folder exists
		await this.ensureKanbanFolderExists();

		// Auto-extract tasks on startup if enabled
		if (this.settings.autoExtractOnStartup) {
			// Delay auto-extraction slightly to ensure everything is loaded
			setTimeout(async () => {
				await this.taskExtractionService.autoExtractOnStartup();
			}, 1000);
		}
	}

	onunload() {
		console.log('Unloading Crystal Boards plugin');
		

	}

	async activateDashboardView(): Promise<void> {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)[0];

		if (!leaf) {
			// Open in main panel as a tab instead of sidebar
			// getLeaf(true) creates a new tab in the main panel
			const newLeaf = workspace.getLeaf('tab');
			if (newLeaf) {
				leaf = newLeaf;
				await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
			} else {
				return;
			}
		} else {
			// If dashboard already exists, refresh it when activating
			const view = leaf.view as any;
			if (view && view.renderDashboard) {
				await view.renderDashboard();
			}
		}

		workspace.revealLeaf(leaf);
	}

	/**
	 * Setup file watcher for the task source file
	 * Automatically updates boards when the todo file changes
	 */
	private setupTaskSourceFileWatcher(): void {
		// Watch for changes to the task source file
		this.registerEvent(
			this.app.vault.on('modify', async (file) => {
				// Check if the modified file is our task source file
				if (this.settings.taskSourcePath && 
					file instanceof TFile && 
					file.path === this.settings.taskSourcePath) {
					
					console.log(`[DEBUG] Task source file modified: ${file.path}, triggering update...`);
					console.log(`[DEBUG] Current settings path: ${this.settings.taskSourcePath}`);
					
					// Debounce to avoid multiple rapid updates
					if (this.taskSourceUpdateTimeout) {
						clearTimeout(this.taskSourceUpdateTimeout);
					}
					
					this.taskSourceUpdateTimeout = window.setTimeout(async () => {
						// Re-extract tasks and update boards
						await this.updateBoardsFromTaskSource();
					}, 500); // Wait 500ms after last change
				}
			})
		);
	}

	private taskSourceUpdateTimeout: number | null = null;

	/**
	 * Update boards when task source file changes
	 */
	private async updateBoardsFromTaskSource(): Promise<void> {
		try {
			console.log('Task source file changed, updating boards...');
			
			// Get current task counts from source
			const stats = await this.taskExtractionService.getExtractionStats();
			console.log(`[DEBUG] Current stats - Tasks in source: ${stats.tasksInSource}, File exists: ${stats.sourceFileExists}`);
			
			// Update dashboard if it's open
			const dashboardLeaves = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);
			console.log(`[DEBUG] Found ${dashboardLeaves.length} open dashboard leaves`);
			for (const leaf of dashboardLeaves) {
				if (leaf.view instanceof DashboardView) {
					console.log('[DEBUG] Updating dashboard view...');
					await leaf.view.renderDashboard();
				}
			}
			
			// Update any open board views
			const boardLeaves = this.app.workspace.getLeavesOfType(BOARD_VIEW_TYPE);
			for (const leaf of boardLeaves) {
				if (leaf.view instanceof BoardView) {
					await leaf.view.refreshBoardData();
				}
			}
			
			console.log(`Boards updated: ${stats.tasksInSource} tasks in source file`);
		} catch (error) {
			console.error('Error updating boards from task source:', error);
		}
	}

	async openDashboardInCurrentTab(): Promise<void> {
		const { workspace } = this.app;

		// Use the current active leaf and switch its view type to dashboard
		const activeLeaf = workspace.activeLeaf;
		if (activeLeaf) {
			await activeLeaf.setViewState({ 
				type: DASHBOARD_VIEW_TYPE, 
				active: true 
			});
			workspace.revealLeaf(activeLeaf);
		}
	}

	private async ensureKanbanFolderExists(): Promise<void> {
		const folderPath = this.settings.kanbanFolderPath;
		if (!(await this.app.vault.adapter.exists(folderPath))) {
			await this.app.vault.createFolder(folderPath);
		}
	}

	async updateSettings(newSettings: Partial<PluginSettings>): Promise<void> {
		const oldSettings = { ...this.settings };
		await this.dataManager.updateSettings(newSettings);
		this.settings = this.dataManager.getSettings();
		
		// Update Smart Extract configuration if related settings changed
		if (newSettings.openAIApiKey !== undefined || newSettings.openAIModel !== undefined || 
			newSettings.smartExtractMaxTokens !== undefined || newSettings.smartExtractTemperature !== undefined) {
			this.smartExtractionService?.updateConfiguration();
		}
		
		// Refresh dashboard if boardsPerRow or showCoverImages changed
		if (newSettings.boardsPerRow !== undefined && newSettings.boardsPerRow !== oldSettings.boardsPerRow ||
			newSettings.showCoverImages !== undefined && newSettings.showCoverImages !== oldSettings.showCoverImages) {
			
			// Find and refresh dashboard view
			const dashboardLeaves = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);
			for (const leaf of dashboardLeaves) {
				if (leaf.view instanceof DashboardView) {
					await leaf.view.renderDashboard();
				}
			}
		}
	}

	async openBoard(board: Board): Promise<void> {
		const { workspace } = this.app;

		// Close existing board views
		const existingLeaves = workspace.getLeavesOfType(BOARD_VIEW_TYPE);
		for (const leaf of existingLeaves) {
			leaf.detach();
		}

		// Find the dashboard leaf and reuse it for the board
		let leaf = workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)[0];
		
		if (!leaf) {
			// If no dashboard leaf exists, create a new tab in the main panel
			leaf = workspace.getLeaf('tab');
		}
		
		if (leaf) {
			const view = new BoardView(leaf, this, board);
			await leaf.open(view);
			workspace.revealLeaf(leaf);
		}
	}

	/**
	 * Setup global accent color change listener
	 * Monitors CSS custom property changes and refreshes all open plugin views
	 */
	private setupAccentColorListener(): void {
		// Store current accent color to detect changes
		let currentAccentColor = this.getCurrentAccentColor();
		console.log('🎨 Crystal Boards: Initial accent color detected:', currentAccentColor);
		
		// Use periodic checking to detect accent color changes
		this.registerInterval(
			window.setInterval(() => {
				const newAccentColor = this.getCurrentAccentColor();
				if (newAccentColor !== currentAccentColor && newAccentColor) {
					console.log('🎨 Crystal Boards: Accent color changed from', currentAccentColor, 'to', newAccentColor);
					currentAccentColor = newAccentColor;
					this.refreshAllViews();
				}
			}, 1000) // Check every 1 second for responsiveness
		);
	}

	/**
	 * Get the current accent color from CSS custom properties
	 */
	private getCurrentAccentColor(): string {
		const computedStyle = getComputedStyle(document.documentElement);
		const accentColor = computedStyle.getPropertyValue('--interactive-accent').trim();
		
		// Also check for alternative accent color properties
		if (!accentColor) {
			const altAccent = computedStyle.getPropertyValue('--accent-color').trim();
			if (altAccent) return altAccent;
			
			const themeAccent = computedStyle.getPropertyValue('--theme-accent').trim();
			if (themeAccent) return themeAccent;
		}
		
		return accentColor;
	}

	/**
	 * Refresh all open Crystal Boards views when accent color changes
	 */
	private refreshAllViews(): void {
		const { workspace } = this.app;

		// Refresh all dashboard views
		const dashboardLeaves = workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);
		dashboardLeaves.forEach(async (leaf) => {
			const view = leaf.view as DashboardView;
			if (view && typeof view.renderDashboard === 'function') {
				console.log('🔄 Refreshing dashboard view for accent color change');
				await view.renderDashboard();
			}
		});

		// Refresh all board views  
		const boardLeaves = workspace.getLeavesOfType(BOARD_VIEW_TYPE);
		boardLeaves.forEach(async (leaf) => {
			const view = leaf.view as BoardView;
			if (view && typeof view.renderBoard === 'function') {
				console.log('🔄 Refreshing board view for accent color change');
				await view.renderBoard();
			}
		});

		// Force CSS recalculation by triggering a reflow
		document.documentElement.style.setProperty('--crystal-boards-accent-update', Date.now().toString());
	}
}