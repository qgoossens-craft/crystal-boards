import { Plugin } from 'obsidian';
import { DashboardView } from './dashboard-view';
import { BoardView } from './board-view';
import { DataManager } from './data-manager';
import { PluginSettings, DASHBOARD_VIEW_TYPE, BOARD_VIEW_TYPE, Board } from './types';
import { CrystalBoardsSettingTab } from './settings-tab';

export default class CrystalBoardsPlugin extends Plugin {
	settings: PluginSettings;
	dataManager: DataManager;

	async onload() {
		console.log('Loading Crystal Boards plugin');

		// Initialize data manager
		this.dataManager = new DataManager(this);
		await this.dataManager.loadData();
		await this.dataManager.fixBoardPositions(); // Fix any position corruption
		this.settings = this.dataManager.getSettings();

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

		// Add settings tab
		this.addSettingTab(new CrystalBoardsSettingTab(this.app, this));

		// Ensure Kanban folder exists
		await this.ensureKanbanFolderExists();
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

	private async ensureKanbanFolderExists(): Promise<void> {
		const folderPath = this.settings.kanbanFolderPath;
		if (!(await this.app.vault.adapter.exists(folderPath))) {
			await this.app.vault.createFolder(folderPath);
		}
	}

	async updateSettings(newSettings: Partial<PluginSettings>): Promise<void> {
		await this.dataManager.updateSettings(newSettings);
		this.settings = this.dataManager.getSettings();
	}

	async openBoard(board: Board): Promise<void> {
		const { workspace } = this.app;

		// Close existing board views
		const existingLeaves = workspace.getLeavesOfType(BOARD_VIEW_TYPE);
		for (const leaf of existingLeaves) {
			leaf.detach();
		}

		// Open new board view
		const leaf = workspace.getLeaf(true);
		const view = new BoardView(leaf, this, board);
		await leaf.open(view);
		workspace.revealLeaf(leaf);
	}
}