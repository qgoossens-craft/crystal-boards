import { Plugin, Notice } from 'obsidian';
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
	private accentColorObserver: MutationObserver | null = null;

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
		
		// Clean up accent color listener
		if (this.accentColorObserver) {
			this.accentColorObserver.disconnect();
			this.accentColorObserver = null;
		}
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
		
		// Method 1: Use periodic checking (most reliable for CSS custom properties)
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

		// Method 2: Listen for Obsidian workspace events that might indicate theme changes
		this.app.workspace.on('css-change', () => {
			const newAccentColor = this.getCurrentAccentColor();
			if (newAccentColor !== currentAccentColor && newAccentColor) {
				console.log('🎨 Crystal Boards: Accent color changed via css-change event from', currentAccentColor, 'to', newAccentColor);
				currentAccentColor = newAccentColor;
				this.refreshAllViews();
			}
		});

		// Method 3: MutationObserver for style elements and link elements (CSS files)
		this.accentColorObserver = new MutationObserver((mutations) => {
			let shouldCheck = false;
			mutations.forEach((mutation) => {
				// Check for changes to style elements or link elements
				if (mutation.type === 'childList') {
					mutation.addedNodes.forEach((node) => {
						if (node.nodeType === Node.ELEMENT_NODE) {
							const element = node as Element;
							if (element.tagName === 'STYLE' || element.tagName === 'LINK') {
								shouldCheck = true;
							}
						}
					});
				}
				// Check for attribute changes on html/body
				if (mutation.type === 'attributes' && (mutation.target === document.documentElement || mutation.target === document.body)) {
					shouldCheck = true;
				}
			});
			
			if (shouldCheck) {
				// Small delay to allow CSS to be processed
				setTimeout(() => {
					const newAccentColor = this.getCurrentAccentColor();
					if (newAccentColor !== currentAccentColor && newAccentColor) {
						console.log('🎨 Crystal Boards: Accent color changed via MutationObserver from', currentAccentColor, 'to', newAccentColor);
						currentAccentColor = newAccentColor;
						this.refreshAllViews();
					}
				}, 100);
			}
		});

		// Observe head for style/link changes and body/html for class changes
		this.accentColorObserver.observe(document.head, {
			childList: true,
			subtree: true
		});
		
		this.accentColorObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class', 'style']
		});

		this.accentColorObserver.observe(document.body, {
			attributes: true,
			attributeFilter: ['class', 'style']
		});
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