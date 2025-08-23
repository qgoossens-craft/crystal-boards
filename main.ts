import { Plugin } from 'obsidian';
import { DashboardView } from './dashboard-view';
import { BoardView } from './board-view';
import { DataManager } from './data-manager';
import { TaskExtractionService } from './task-extraction-service';
import { PluginSettings, DASHBOARD_VIEW_TYPE, BOARD_VIEW_TYPE, Board } from './types';
import { CrystalBoardsSettingTab } from './settings-tab';

export default class CrystalBoardsPlugin extends Plugin {
	settings: PluginSettings;
	dataManager: DataManager;
	taskExtractionService: TaskExtractionService;

	async onload() {
		console.log('Loading Crystal Boards plugin');

		// Initialize data manager
		this.dataManager = new DataManager(this);
		await this.dataManager.loadData();
		await this.dataManager.fixBoardPositions(); // Fix any position corruption
		this.settings = this.dataManager.getSettings();

		// Initialize task extraction service
		this.taskExtractionService = new TaskExtractionService(this.app, this);

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
				await this.taskExtractionService.quickExtract();
			}
		});

		// Add settings tab
		this.addSettingTab(new CrystalBoardsSettingTab(this.app, this));

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
			const newLeaf = workspace.getRightLeaf(false);
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
			// If no dashboard leaf exists, create a new leaf
			leaf = workspace.getLeaf();
		}
		
		if (leaf) {
			const view = new BoardView(leaf, this, board);
			await leaf.open(view);
			workspace.revealLeaf(leaf);
		}
	}
}