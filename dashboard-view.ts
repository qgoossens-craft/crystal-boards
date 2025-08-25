import { ItemView, WorkspaceLeaf, Modal, Setting, TFile, App, Notice } from 'obsidian';
import CrystalBoardsPlugin from './main';
import { Board, DASHBOARD_VIEW_TYPE, getThemeAwareColors } from './types';

export class DashboardView extends ItemView {
	plugin: CrystalBoardsPlugin;
	private themeChangeHandler: (() => void) | null = null;
	private themeObserver: MutationObserver | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: CrystalBoardsPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return DASHBOARD_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Crystal Boards';
	}

	getIcon(): string {
		return 'layout-dashboard';
	}

	async onOpen(): Promise<void> {
		await this.renderDashboard();
		this.setupThemeChangeListener();
	}

	async onShow(): Promise<void> {
		// Auto-refresh dashboard when it becomes visible
		await this.renderDashboard();
	}

	async onClose(): Promise<void> {
		// Clean up theme listeners
		if (this.themeObserver) {
			this.themeObserver.disconnect();
			this.themeObserver = null;
		}
		
		if (this.themeChangeHandler) {
			const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
			if (mediaQuery.removeEventListener) {
				mediaQuery.removeEventListener('change', this.themeChangeHandler);
			}
			this.themeChangeHandler = null;
		}
	}

	/**
	 * Setup theme change listener to refresh dashboard when theme changes
	 */
	private setupThemeChangeListener(): void {
		// Listen for theme changes
		if (!this.themeChangeHandler) {
			this.themeChangeHandler = () => {
				console.log('🎨 Dashboard theme change detected - refreshing');
				// Refresh the entire dashboard to update any theme-dependent elements
				this.renderDashboard();
			};
		}

		// Listen for theme changes via body class changes
		if (!this.themeObserver) {
			this.themeObserver = new MutationObserver((mutations) => {
				mutations.forEach((mutation) => {
					if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
						const target = mutation.target as HTMLElement;
						if (target === document.body && this.themeChangeHandler) {
							this.themeChangeHandler();
						}
					}
				});
			});

			this.themeObserver.observe(document.body, {
				attributes: true,
				attributeFilter: ['class']
			});
		}

		// Also listen for system theme changes
		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		if (mediaQuery.addEventListener) {
			mediaQuery.addEventListener('change', this.themeChangeHandler);
		}
	}

	async renderDashboard(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();

		const headerEl = contentEl.createEl('div', { cls: 'crystal-boards-header' });
		// Create editable title
		const titleEl = headerEl.createEl('h1', { cls: 'crystal-boards-title' });
		titleEl.createEl('span', { text: 'Crystal Boards' });
		
		const createBoardBtn = headerEl.createEl('button', {
			text: 'Create Board',
			cls: 'mod-cta crystal-boards-create-btn'
		});
		createBoardBtn.onclick = () => this.openCreateBoardModal();

		// Boards grid with dynamic columns based on setting
		const boardsContainer = contentEl.createEl('div', { cls: 'crystal-boards-grid' });
		
		// Apply the boardsPerRow setting dynamically
		const boardsPerRow = this.plugin.settings.boardsPerRow || 3;
		boardsContainer.style.gridTemplateColumns = `repeat(${boardsPerRow}, 1fr)`;
		
		// Set CSS custom property for responsive design
		boardsContainer.style.setProperty('--boards-per-row', boardsPerRow.toString());
		
		const boards = await this.plugin.dataManager.getBoards();
		
		if (boards.length === 0) {
			const emptyState = boardsContainer.createEl('div', { cls: 'crystal-boards-empty' });
			emptyState.createEl('div', { 
				text: '📋', 
				cls: 'crystal-boards-empty-icon' 
			});
			emptyState.createEl('h3', { 
				text: 'No boards yet', 
				cls: 'crystal-boards-empty-title' 
			});
			emptyState.createEl('p', { 
				text: 'Create your first Kanban board to get started!', 
				cls: 'crystal-boards-empty-description' 
			});
		} else {
			for (const board of boards) {
				await this.renderBoardCard(boardsContainer, board);
			}
		}

		// Add footer with Extract Tasks button
		await this.renderDashboardFooter(contentEl);
	}


	async renderBoardCard(container: HTMLElement, board: Board): Promise<void> {
		const cardEl = container.createEl('div', { cls: 'crystal-board-card crystal-board-card-compact' });
		
		// Handle board opening
		cardEl.onclick = (e) => {
			// Don't open board if clicking on action buttons
			if ((e.target as HTMLElement).closest('.crystal-board-actions')) {
				return;
			}
			this.openBoard(board);
		};

		// Cover image header (keep this!)
		const coverEl = cardEl.createEl('div', { cls: 'crystal-board-cover-compact' });
		if (board.coverImage && this.plugin.settings.showCoverImages) {
			const file = this.app.vault.getAbstractFileByPath(board.coverImage);
			if (file instanceof TFile) {
				const url = this.app.vault.getResourcePath(file);
				coverEl.style.backgroundImage = `url(${url})`;
				
				// Apply alignment and position
				const alignment = board.coverImageAlignment || 'center';
				const verticalPosition = board.coverImagePosition ?? 50; // Default to 50% (center)
				
				// If we have a specific vertical position, use it
				if (board.coverImagePosition !== undefined) {
					coverEl.style.backgroundPosition = `center ${verticalPosition}%`;
				} else {
					// Fall back to alignment presets for backward compatibility
					const positionMap = {
						'center': 'center center',
						'top': 'center top',
						'bottom': 'center bottom',
						'left': 'left center',
						'right': 'right center'
					};
					coverEl.style.backgroundPosition = positionMap[alignment];
				}
				coverEl.addClass('has-image');
			}
		}
		
		if (!coverEl.hasClass('has-image')) {
			// Show emoji instead of default icon if available
			coverEl.createEl('div', { 
				text: board.emoji || '📋', 
				cls: 'crystal-board-cover-icon' 
			});
		}

		// Compact content layout with emoji instead of thumbnail
		const contentEl = cardEl.createEl('div', { cls: 'crystal-board-card-content' });

		// Small emoji instead of thumbnail
		const emojiEl = contentEl.createEl('div', { cls: 'crystal-board-emoji' });
		emojiEl.createEl('div', { 
			text: board.emoji || '📋', 
			cls: 'crystal-board-emoji-icon' 
		});

		// Board info
		const infoEl = contentEl.createEl('div', { cls: 'crystal-board-info-compact' });
		infoEl.createEl('h3', { text: board.name, cls: 'crystal-board-name-compact' });
		
		const metaEl = infoEl.createEl('div', { cls: 'crystal-board-meta-compact' });
		const totalCards = board.columns.reduce((sum, col) => sum + col.cards.length, 0);
		metaEl.createEl('span', { 
			text: `${totalCards} cards`, 
			cls: 'crystal-board-stats' 
		});

		// Actions
		const actionsEl = cardEl.createEl('div', { cls: 'crystal-board-actions' });
		
		// Get all boards to determine if left/right buttons should be enabled
		const allBoards = await this.plugin.dataManager.getBoards();
		const isFirst = board.position === 0;
		const isLast = board.position === allBoards.length - 1;

		// Move left button
		const moveLeftBtn = actionsEl.createEl('button', {
			text: '←',
			cls: `crystal-board-action-btn crystal-board-move-btn ${isFirst ? 'disabled' : ''}`,
			attr: { 'aria-label': 'Move board left' }
		});
		moveLeftBtn.onclick = async (e) => {
			e.stopPropagation();
			if (!isFirst) {
				const success = await this.plugin.dataManager.moveBoardLeft(board.id);
				if (success) {
					await this.renderDashboard();
				}
			}
		};
		moveLeftBtn.disabled = isFirst;

		// Move right button  
		const moveRightBtn = actionsEl.createEl('button', {
			text: '→',
			cls: `crystal-board-action-btn crystal-board-move-btn ${isLast ? 'disabled' : ''}`,
			attr: { 'aria-label': 'Move board right' }
		});
		moveRightBtn.onclick = async (e) => {
			e.stopPropagation();
			if (!isLast) {
				const success = await this.plugin.dataManager.moveBoardRight(board.id);
				if (success) {
					await this.renderDashboard();
				}
			}
		};
		moveRightBtn.disabled = isLast;

		// Edit button
		const editBtn = actionsEl.createEl('button', {
			text: '⚙️',
			cls: 'crystal-board-action-btn',
			attr: { 'aria-label': 'Edit board' }
		});
		editBtn.onclick = (e) => {
			e.stopPropagation();
			this.openEditBoardModal(board);
		};

		// Delete button
		const deleteBtn = actionsEl.createEl('button', {
			text: '🗑️',
			cls: 'crystal-board-action-btn crystal-board-delete-btn',
			attr: { 'aria-label': 'Delete board' }
		});
		deleteBtn.onclick = (e) => {
			e.stopPropagation();
			this.confirmDeleteBoard(board);
		};
	}

	async renderDashboardFooter(container: HTMLElement): Promise<void> {
		// Only show footer if task source is configured
		if (!this.plugin.settings.taskSourcePath) {
			return;
		}

		const footerEl = container.createEl('div', { cls: 'crystal-boards-footer' });
		
		// Extract Tasks button
		const extractBtn = footerEl.createEl('button', {
			cls: this.plugin.settings.useSmartExtract ? 'crystal-smart-extract-btn' : 'crystal-extract-tasks-btn',
			text: this.plugin.settings.useSmartExtract ? '🤖 Smart Extract' : '📥 Extract Tasks'
		});

		// Add tooltip/description
		if (this.plugin.settings.useSmartExtract) {
			extractBtn.title = `AI-powered extraction from ${this.plugin.settings.taskSourcePath}\nAnalyzes context and generates descriptions`;
		} else {
			extractBtn.title = `Extract tasks from ${this.plugin.settings.taskSourcePath}`;
		}
		
		// Button click handler
		extractBtn.onclick = async () => {
			const isSmartExtract = this.plugin.settings.useSmartExtract;
			extractBtn.disabled = true;
			extractBtn.setText(isSmartExtract ? '🧠 Analyzing...' : '⏳ Extracting...');
			
			try {
				if (isSmartExtract) {
					// Check if Smart Extract is properly configured
					if (!this.plugin.settings.openAIApiKey) {
						new Notice('Please configure your OpenAI API key in settings first');
						return;
					}
					
					// The new performSmartExtraction method now shows preview first and handles everything
					const result = await this.plugin.smartExtractionService.performSmartExtraction();
					
					// Only show success/failure messages if the extraction actually happened
					if (result.success) {
						new Notice(`✅ Smart extracted ${result.tasksAnalyzed} tasks with AI analysis`);
						// Refresh dashboard to show new cards - this will recreate the footer
						await this.renderDashboard();
						return; // Exit early to avoid the finally block since button no longer exists
					} else if (result.errors.length > 0 && !result.errors.includes('Smart extraction cancelled by user')) {
						new Notice(`❌ Smart extraction failed: ${result.errors.join(', ')}`);
					}
					// If cancelled by user, don't show error message
				} else {
					await this.plugin.taskExtractionService.quickExtract();
					// Refresh dashboard to show new cards - this will recreate the footer
					await this.renderDashboard();
					return; // Exit early to avoid the finally block since button no longer exists
				}
			} catch (error) {
				console.error('Task extraction failed:', error);
				new Notice(`❌ ${isSmartExtract ? 'Smart' : 'Task'} extraction failed: ${error.message}`);
			} finally {
				// Only reset the button if it still exists (not recreated by renderDashboard)
				if (extractBtn && extractBtn.parentElement) {
					extractBtn.disabled = false;
					extractBtn.setText(this.plugin.settings.useSmartExtract ? '🤖 Smart Extract' : '📥 Extract Tasks');
				}
			}
		};

		// Show extraction stats/info
		try {
			const stats = await this.plugin.taskExtractionService.getExtractionStats();
			if (stats.tasksInSource > 0) {
				const infoEl = footerEl.createEl('span', { 
					cls: 'crystal-extract-info',
					text: `${stats.tasksInSource} tasks available`
				});
				infoEl.title = `Found ${stats.tasksInSource} tasks in ${this.plugin.settings.taskSourcePath}`;
			}
		} catch (error) {
			// Ignore stats errors, just won't show the count
		}
	}

	openBoard(board: Board): void {
		this.plugin.openBoard(board);
	}

	openCreateBoardModal(): void {
		new CreateBoardModal(this.app, this.plugin, async (board) => {
			// Set position for new board
			const existingBoards = await this.plugin.dataManager.getBoards();
			board.position = existingBoards.length;
			
			await this.plugin.dataManager.addBoard(board);
			this.renderDashboard();
		}).open();
	}

	openEditBoardModal(board: Board): void {
		new EditBoardModal(this.app, this.plugin, board, async (updatedBoard) => {
			await this.plugin.dataManager.updateBoard(updatedBoard);
			this.renderDashboard();
		}).open();
	}

	async confirmDeleteBoard(board: Board): Promise<void> {
		const confirmed = await this.showConfirmDialog(
			'Delete Board',
			`Are you sure you want to delete "${board.name}"? This action cannot be undone.`
		);
		
		if (confirmed) {
			await this.plugin.dataManager.deleteBoard(board.id);
			this.renderDashboard();
		}
	}

	private showConfirmDialog(title: string, message: string): Promise<boolean> {
		return new Promise((resolve) => {
			const modal = new Modal(this.app);
			modal.titleEl.setText(title);
			modal.contentEl.createEl('p', { text: message });
			
			const buttonContainer = modal.contentEl.createEl('div', { cls: 'modal-button-container' });
			
			const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
			cancelBtn.onclick = () => {
				modal.close();
				resolve(false);
			};
			
			const confirmBtn = buttonContainer.createEl('button', { 
				text: 'Delete', 
				cls: 'mod-warning' 
			});
			confirmBtn.onclick = () => {
				modal.close();
				resolve(true);
			};
			
			modal.open();
		});
	}

	renderEditableTitle(titleEl: HTMLElement) {
		const titleText = titleEl.createEl('span', {
			text: this.plugin.settings.customPluginName,
			cls: 'crystal-title-text'
		});
		
		const editIcon = titleEl.createEl('span', {
			cls: 'crystal-title-edit-icon',
			text: '✏️'
		});
		
		// Add click handler for editing
		titleEl.addEventListener('click', () => {
			this.startTitleEdit(titleText, editIcon);
		});
		
		// Add hover effects
		titleEl.style.cursor = 'pointer';
		titleEl.title = 'Click to edit plugin name';
	}
	
	startTitleEdit(titleText: HTMLElement, editIcon: HTMLElement) {
		const currentText = titleText.textContent || this.plugin.settings.customPluginName;
		
		// Create input element
		const input = document.createElement('input');
		input.type = 'text';
		input.value = currentText;
		input.className = 'crystal-title-input';
		input.style.fontSize = 'inherit';
		input.style.fontWeight = 'inherit';
		input.style.border = '2px solid var(--interactive-accent)';
		input.style.borderRadius = '4px';
		input.style.padding = '4px 8px';
		input.style.background = 'var(--background-primary)';
		input.style.color = 'var(--text-normal)';
		input.style.width = Math.max(200, currentText.length * 12) + 'px';
		
		// Replace text with input
		titleText.style.display = 'none';
		editIcon.style.display = 'none';
		titleText.parentElement?.insertBefore(input, titleText);
		
		// Focus and select all text
		input.focus();
		input.select();
		
		// Save function
		const saveTitle = async () => {
			const newTitle = input.value.trim() || 'Crystal Boards';
			
			// Update settings
			await this.plugin.updateSettings({ customPluginName: newTitle });
			
			// Update display
			titleText.textContent = newTitle;
			titleText.style.display = 'inline';
			editIcon.style.display = 'inline';
			input.remove();
		};
		
		// Cancel function
		const cancelEdit = () => {
			titleText.style.display = 'inline';
			editIcon.style.display = 'inline';
			input.remove();
		};
		
		// Event handlers
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				saveTitle();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				cancelEdit();
			}
		});
		
		input.addEventListener('blur', saveTitle);
	}
}

// Comprehensive emoji database with search keywords
const EMOJI_DATABASE = [
	// Smileys & Emotion
	{ emoji: '😀', keywords: ['grin', 'happy', 'smile', 'joy'] },
	{ emoji: '😃', keywords: ['smile', 'happy', 'joy', 'cheerful'] },
	{ emoji: '😄', keywords: ['smile', 'happy', 'joy', 'laugh'] },
	{ emoji: '😁', keywords: ['grin', 'smile', 'happy'] },
	{ emoji: '😆', keywords: ['laugh', 'happy', 'smile', 'joy'] },
	{ emoji: '😅', keywords: ['laugh', 'sweat', 'smile', 'relief'] },
	{ emoji: '🤣', keywords: ['laugh', 'joy', 'tears', 'funny'] },
	{ emoji: '😂', keywords: ['laugh', 'tears', 'joy', 'funny'] },
	{ emoji: '🙂', keywords: ['smile', 'happy', 'positive'] },
	{ emoji: '🙃', keywords: ['upside', 'silly', 'playful'] },
	{ emoji: '😉', keywords: ['wink', 'flirt', 'playful'] },
	{ emoji: '😊', keywords: ['smile', 'happy', 'blush'] },
	{ emoji: '😇', keywords: ['angel', 'innocent', 'halo'] },
	{ emoji: '🥰', keywords: ['love', 'smile', 'hearts'] },
	{ emoji: '😍', keywords: ['love', 'heart', 'eyes', 'adore'] },
	{ emoji: '🤩', keywords: ['star', 'eyes', 'excited', 'amazed'] },
	
	// Objects & Symbols
	{ emoji: '📋', keywords: ['clipboard', 'list', 'tasks', 'notes', 'board'] },
	{ emoji: '📊', keywords: ['chart', 'graph', 'statistics', 'data', 'analytics'] },
	{ emoji: '📈', keywords: ['trending', 'up', 'growth', 'increase', 'chart'] },
	{ emoji: '📉', keywords: ['trending', 'down', 'decrease', 'chart'] },
	{ emoji: '🎯', keywords: ['target', 'goal', 'aim', 'objective', 'bullseye'] },
	{ emoji: '🚀', keywords: ['rocket', 'launch', 'space', 'fast', 'startup'] },
	{ emoji: '💡', keywords: ['idea', 'light', 'bulb', 'innovation', 'creative'] },
	{ emoji: '🔥', keywords: ['fire', 'hot', 'trending', 'popular', 'flame'] },
	{ emoji: '⭐', keywords: ['star', 'favorite', 'important', 'featured'] },
	{ emoji: '🌟', keywords: ['star', 'sparkle', 'shiny', 'special'] },
	{ emoji: '🏆', keywords: ['trophy', 'winner', 'achievement', 'award', 'success'] },
	{ emoji: '🥇', keywords: ['gold', 'medal', 'first', 'winner', 'champion'] },
	{ emoji: '🥈', keywords: ['silver', 'medal', 'second', 'runner'] },
	{ emoji: '🥉', keywords: ['bronze', 'medal', 'third'] },
	{ emoji: '📝', keywords: ['memo', 'note', 'write', 'document', 'text'] },
	{ emoji: '📄', keywords: ['document', 'page', 'file', 'paper'] },
	{ emoji: '💻', keywords: ['laptop', 'computer', 'tech', 'work', 'coding'] },
	{ emoji: '🖥️', keywords: ['desktop', 'computer', 'monitor', 'screen'] },
	{ emoji: '📱', keywords: ['phone', 'mobile', 'smartphone', 'device'] },
	{ emoji: '🎨', keywords: ['art', 'paint', 'creative', 'design', 'palette'] },
	{ emoji: '🖌️', keywords: ['paintbrush', 'art', 'creative'] },
	{ emoji: '✏️', keywords: ['pencil', 'write', 'draw', 'edit'] },
	{ emoji: '📚', keywords: ['books', 'library', 'education', 'study', 'knowledge'] },
	{ emoji: '📖', keywords: ['book', 'open', 'read', 'study'] },
	{ emoji: '🔧', keywords: ['wrench', 'tool', 'fix', 'repair'] },
	{ emoji: '🔨', keywords: ['hammer', 'tool', 'build', 'fix'] },
	{ emoji: '⚙️', keywords: ['gear', 'setting', 'tool', 'cog'] },
	
	// Activities & Sports  
	{ emoji: '⚽', keywords: ['soccer', 'football', 'ball', 'sport'] },
	{ emoji: '🏀', keywords: ['basketball', 'ball', 'sport'] },
	{ emoji: '🏈', keywords: ['american', 'football', 'ball', 'sport'] },
	{ emoji: '⚾', keywords: ['baseball', 'ball', 'sport'] },
	{ emoji: '🎾', keywords: ['tennis', 'ball', 'sport'] },
	{ emoji: '🏐', keywords: ['volleyball', 'ball', 'sport'] },
	{ emoji: '🎳', keywords: ['bowling', 'ball', 'sport', 'pins'] },
	{ emoji: '🏓', keywords: ['ping', 'pong', 'table', 'tennis'] },
	{ emoji: '🏸', keywords: ['badminton', 'sport', 'racquet'] },
	{ emoji: '⛳', keywords: ['golf', 'flag', 'hole'] },
	{ emoji: '🎮', keywords: ['video', 'game', 'controller', 'gaming'] },
	{ emoji: '🕹️', keywords: ['joystick', 'gaming', 'arcade'] },
	{ emoji: '🎯', keywords: ['direct', 'hit', 'target', 'bullseye'] },
	{ emoji: '🎲', keywords: ['die', 'dice', 'game', 'chance', 'random'] },
	{ emoji: '♠️', keywords: ['spade', 'suit', 'cards', 'poker'] },
	{ emoji: '♥️', keywords: ['heart', 'suit', 'cards', 'poker'] },
	{ emoji: '♦️', keywords: ['diamond', 'suit', 'cards', 'poker'] },
	{ emoji: '♣️', keywords: ['club', 'suit', 'cards', 'poker'] },
	
	// Food & Drink
	{ emoji: '🍎', keywords: ['apple', 'fruit', 'red', 'healthy'] },
	{ emoji: '🍏', keywords: ['green', 'apple', 'fruit', 'healthy'] },
	{ emoji: '🍊', keywords: ['orange', 'fruit', 'citrus'] },
	{ emoji: '🍋', keywords: ['lemon', 'fruit', 'citrus', 'sour'] },
	{ emoji: '🍌', keywords: ['banana', 'fruit', 'yellow'] },
	{ emoji: '🍉', keywords: ['watermelon', 'fruit', 'summer'] },
	{ emoji: '🍇', keywords: ['grapes', 'fruit', 'bunch'] },
	{ emoji: '🍓', keywords: ['strawberry', 'fruit', 'berry', 'red'] },
	{ emoji: '🍑', keywords: ['cherries', 'fruit', 'red', 'pair'] },
	{ emoji: '🍍', keywords: ['pineapple', 'fruit', 'tropical'] },
	{ emoji: '🥝', keywords: ['kiwi', 'fruit', 'green'] },
	{ emoji: '🥑', keywords: ['avocado', 'fruit', 'green', 'healthy'] },
	{ emoji: '🍅', keywords: ['tomato', 'fruit', 'red', 'vegetable'] },
	{ emoji: '🌶️', keywords: ['pepper', 'hot', 'spicy', 'chili'] },
	{ emoji: '🌽', keywords: ['corn', 'vegetable', 'yellow'] },
	{ emoji: '🥕', keywords: ['carrot', 'vegetable', 'orange'] },
	{ emoji: '🍞', keywords: ['bread', 'loaf', 'slice'] },
	{ emoji: '🧀', keywords: ['cheese', 'dairy', 'yellow'] },
	{ emoji: '🍳', keywords: ['cooking', 'egg', 'fried', 'pan'] },
	{ emoji: '🥞', keywords: ['pancakes', 'breakfast', 'syrup'] },
	{ emoji: '🥓', keywords: ['bacon', 'meat', 'breakfast'] },
	{ emoji: '🍔', keywords: ['hamburger', 'burger', 'fast', 'food'] },
	{ emoji: '🍟', keywords: ['french', 'fries', 'fast', 'food', 'potato'] },
	{ emoji: '🍕', keywords: ['pizza', 'slice', 'italian', 'food'] },
	{ emoji: '🌮', keywords: ['taco', 'mexican', 'food'] },
	{ emoji: '🌯', keywords: ['burrito', 'wrap', 'mexican', 'food'] },
	{ emoji: '🥗', keywords: ['salad', 'green', 'healthy', 'vegetables'] },
	{ emoji: '🍝', keywords: ['spaghetti', 'pasta', 'italian', 'food'] },
	{ emoji: '🍜', keywords: ['steaming', 'bowl', 'ramen', 'noodles'] },
	{ emoji: '🍲', keywords: ['pot', 'food', 'stew', 'soup'] },
	{ emoji: '🍣', keywords: ['sushi', 'japanese', 'food', 'fish'] },
	{ emoji: '🍱', keywords: ['bento', 'box', 'japanese', 'food'] },
	{ emoji: '🍰', keywords: ['cake', 'slice', 'dessert', 'birthday'] },
	{ emoji: '🎂', keywords: ['birthday', 'cake', 'celebration'] },
	{ emoji: '🍪', keywords: ['cookie', 'sweet', 'dessert'] },
	{ emoji: '🍫', keywords: ['chocolate', 'bar', 'sweet'] },
	{ emoji: '🍿', keywords: ['popcorn', 'movie', 'snack'] },
	
	// Travel & Places
	{ emoji: '🌍', keywords: ['earth', 'globe', 'world', 'europe', 'africa'] },
	{ emoji: '🌎', keywords: ['earth', 'globe', 'world', 'americas'] },
	{ emoji: '🌏', keywords: ['earth', 'globe', 'world', 'asia', 'australia'] },
	{ emoji: '🗺️', keywords: ['world', 'map', 'travel'] },
	{ emoji: '🏔️', keywords: ['mountain', 'snow', 'peak'] },
	{ emoji: '🌋', keywords: ['volcano', 'mountain', 'eruption'] },
	{ emoji: '🏕️', keywords: ['camping', 'tent', 'outdoors'] },
	{ emoji: '🏖️', keywords: ['beach', 'umbrella', 'sand', 'vacation'] },
	{ emoji: '🏜️', keywords: ['desert', 'cactus', 'dry'] },
	{ emoji: '🏝️', keywords: ['desert', 'island', 'palm', 'tree'] },
	{ emoji: '🏠', keywords: ['house', 'home', 'building'] },
	{ emoji: '🏡', keywords: ['house', 'garden', 'home'] },
	{ emoji: '🏢', keywords: ['office', 'building', 'work'] },
	{ emoji: '🏥', keywords: ['hospital', 'medical', 'health'] },
	{ emoji: '🏦', keywords: ['bank', 'money', 'finance'] },
	{ emoji: '🏨', keywords: ['hotel', 'accommodation', 'travel'] },
	{ emoji: '🏪', keywords: ['convenience', 'store', 'shop'] },
	{ emoji: '🏫', keywords: ['school', 'education', 'building'] },
	{ emoji: '🏬', keywords: ['department', 'store', 'shopping'] },
	{ emoji: '🏭', keywords: ['factory', 'industrial', 'building'] },
	{ emoji: '🏯', keywords: ['japanese', 'castle', 'building'] },
	{ emoji: '🏰', keywords: ['castle', 'european', 'building'] },
	{ emoji: '🚗', keywords: ['car', 'automobile', 'vehicle', 'red'] },
	{ emoji: '🚙', keywords: ['suv', 'recreational', 'vehicle'] },
	{ emoji: '🚐', keywords: ['minibus', 'bus', 'vehicle'] },
	{ emoji: '🚛', keywords: ['truck', 'lorry', 'vehicle'] },
	{ emoji: '🚲', keywords: ['bicycle', 'bike', 'cycle'] },
	{ emoji: '🛵', keywords: ['motor', 'scooter', 'vespa'] },
	{ emoji: '🏍️', keywords: ['motorcycle', 'racing', 'motorbike'] },
	{ emoji: '✈️', keywords: ['airplane', 'plane', 'aircraft', 'travel'] },
	{ emoji: '🚁', keywords: ['helicopter', 'aircraft'] },
	{ emoji: '🚂', keywords: ['locomotive', 'steam', 'train'] },
	{ emoji: '🚌', keywords: ['bus', 'vehicle', 'transportation'] },
	{ emoji: '🚖', keywords: ['taxi', 'cab', 'new', 'york'] },
	
	// Nature
	{ emoji: '🌲', keywords: ['evergreen', 'tree', 'nature', 'forest'] },
	{ emoji: '🌳', keywords: ['deciduous', 'tree', 'nature', 'forest'] },
	{ emoji: '🌴', keywords: ['palm', 'tree', 'tropical', 'vacation'] },
	{ emoji: '🌵', keywords: ['cactus', 'desert', 'plant'] },
	{ emoji: '🌷', keywords: ['tulip', 'flower', 'spring', 'pink'] },
	{ emoji: '🌸', keywords: ['cherry', 'blossom', 'flower', 'pink', 'spring'] },
	{ emoji: '🌹', keywords: ['rose', 'flower', 'red', 'love'] },
	{ emoji: '🌺', keywords: ['hibiscus', 'flower', 'tropical'] },
	{ emoji: '🌻', keywords: ['sunflower', 'flower', 'yellow'] },
	{ emoji: '🌼', keywords: ['blossom', 'flower', 'daisy'] },
	{ emoji: '🍄', keywords: ['mushroom', 'toadstool', 'fungus'] },
	{ emoji: '🌿', keywords: ['herb', 'leaf', 'green', 'plant'] },
	{ emoji: '🍀', keywords: ['four', 'leaf', 'clover', 'luck'] },
	{ emoji: '🍃', keywords: ['leaf', 'fluttering', 'wind', 'green'] },
	{ emoji: '🍂', keywords: ['fallen', 'leaves', 'autumn'] },
	{ emoji: '🍁', keywords: ['maple', 'leaf', 'canada', 'autumn'] },
	
	// Musical Instruments & Music
	{ emoji: '🎵', keywords: ['musical', 'note', 'music', 'sound'] },
	{ emoji: '🎶', keywords: ['musical', 'notes', 'music', 'melody'] },
	{ emoji: '🎼', keywords: ['musical', 'score', 'treble', 'clef'] },
	{ emoji: '🎹', keywords: ['musical', 'keyboard', 'piano'] },
	{ emoji: '🥁', keywords: ['drum', 'drumsticks', 'music'] },
	{ emoji: '🎷', keywords: ['saxophone', 'music', 'instrument'] },
	{ emoji: '🎺', keywords: ['trumpet', 'music', 'instrument'] },
	{ emoji: '🎸', keywords: ['guitar', 'music', 'instrument', 'rock'] },
	{ emoji: '🎻', keywords: ['violin', 'music', 'instrument', 'classical'] },
	{ emoji: '🎤', keywords: ['microphone', 'singing', 'karaoke'] },
	{ emoji: '🎧', keywords: ['headphones', 'music', 'audio'] },
	{ emoji: '📻', keywords: ['radio', 'music', 'audio', 'broadcast'] },
	
	// Work & Business
	{ emoji: '💼', keywords: ['briefcase', 'business', 'work', 'professional'] },
	{ emoji: '💰', keywords: ['money', 'bag', 'dollar', 'cash'] },
	{ emoji: '💳', keywords: ['credit', 'card', 'money', 'payment'] },
	{ emoji: '💎', keywords: ['gem', 'stone', 'diamond', 'jewel'] },
	{ emoji: '⚖️', keywords: ['balance', 'scale', 'justice', 'law'] },
	{ emoji: '🛠️', keywords: ['hammer', 'wrench', 'tools', 'fix'] },
	{ emoji: '🧰', keywords: ['toolbox', 'tools', 'repair'] },
	{ emoji: '🔬', keywords: ['microscope', 'lab', 'science'] },
	{ emoji: '🔭', keywords: ['telescope', 'space', 'astronomy'] },
	
	// Weather
	{ emoji: '☀️', keywords: ['sun', 'sunny', 'weather', 'bright'] },
	{ emoji: '🌤️', keywords: ['sun', 'small', 'cloud', 'weather'] },
	{ emoji: '⛅', keywords: ['sun', 'behind', 'cloud', 'weather'] },
	{ emoji: '☁️', keywords: ['cloud', 'weather', 'sky'] },
	{ emoji: '🌧️', keywords: ['cloud', 'rain', 'weather'] },
	{ emoji: '⛈️', keywords: ['cloud', 'lightning', 'rain', 'thunder'] },
	{ emoji: '🌩️', keywords: ['cloud', 'lightning', 'weather'] },
	{ emoji: '🌨️', keywords: ['cloud', 'snow', 'weather', 'cold'] },
	{ emoji: '❄️', keywords: ['snowflake', 'snow', 'cold', 'winter'] },
	{ emoji: '☃️', keywords: ['snowman', 'snow', 'winter', 'cold'] },
	{ emoji: '🌬️', keywords: ['wind', 'face', 'blowing', 'mother', 'nature'] },
	{ emoji: '💧', keywords: ['droplet', 'water', 'tear', 'sweat'] },
	{ emoji: '💦', keywords: ['sweat', 'droplets', 'water', 'workout'] },
	{ emoji: '☔', keywords: ['umbrella', 'rain', 'weather', 'spring'] },
	{ emoji: '🌊', keywords: ['water', 'wave', 'sea', 'ocean'] },
	{ emoji: '🌀', keywords: ['cyclone', 'hurricane', 'typhoon', 'weather'] },
	{ emoji: '🌈', keywords: ['rainbow', 'rain', 'weather', 'gay'] },
	
	// Hearts & Love
	{ emoji: '❤️', keywords: ['heart', 'love', 'red'] },
	{ emoji: '🧡', keywords: ['orange', 'heart', 'love'] },
	{ emoji: '💛', keywords: ['yellow', 'heart', 'love'] },
	{ emoji: '💚', keywords: ['green', 'heart', 'love'] },
	{ emoji: '💙', keywords: ['blue', 'heart', 'love'] },
	{ emoji: '💜', keywords: ['purple', 'heart', 'love'] },
	{ emoji: '🖤', keywords: ['black', 'heart', 'evil'] },
	{ emoji: '🤍', keywords: ['white', 'heart', 'love'] },
	{ emoji: '🤎', keywords: ['brown', 'heart', 'love'] },
	{ emoji: '💔', keywords: ['broken', 'heart', 'love', 'sad'] },
	{ emoji: '💕', keywords: ['two', 'hearts', 'love'] },
	{ emoji: '💞', keywords: ['revolving', 'hearts', 'love'] },
	{ emoji: '💓', keywords: ['beating', 'heart', 'love'] },
	{ emoji: '💗', keywords: ['growing', 'heart', 'love'] },
	{ emoji: '💖', keywords: ['sparkling', 'heart', 'love'] },
	{ emoji: '💘', keywords: ['heart', 'arrow', 'love', 'cupid'] },
	
	// Symbols
	{ emoji: '💯', keywords: ['hundred', 'percent', 'perfect', 'score'] },
	{ emoji: '💢', keywords: ['anger', 'symbol', 'mad', 'angry'] },
	{ emoji: '💥', keywords: ['collision', 'explosion', 'bang'] },
	{ emoji: '💫', keywords: ['dizzy', 'star', 'sparkle'] },
	{ emoji: '💨', keywords: ['dashing', 'away', 'wind', 'fast'] },
	{ emoji: '💬', keywords: ['speech', 'balloon', 'bubble', 'talk'] },
	{ emoji: '💭', keywords: ['thought', 'balloon', 'bubble', 'thinking'] },
	{ emoji: '💤', keywords: ['zzz', 'sleep', 'tired', 'sleepy'] },
	{ emoji: '✨', keywords: ['sparkles', 'stars', 'shine', 'glitter'] }
];

function filterEmojis(searchTerm: string): typeof EMOJI_DATABASE {
	if (!searchTerm.trim()) {
		return EMOJI_DATABASE.slice(0, 60); // Show first 60 emojis when no search
	}
	
	const term = searchTerm.toLowerCase();
	return EMOJI_DATABASE.filter(item => 
		item.keywords.some(keyword => keyword.includes(term)) ||
		item.emoji.includes(searchTerm)
	).slice(0, 60); // Limit to 60 results for performance
}

class CreateBoardModal extends Modal {
	plugin: CrystalBoardsPlugin;
	onSubmit: (board: Board) => void;
	boardName = '';
	emoji = '';
	coverImage = '';
	imageSearchResults: TFile[] = [];
	allImageFiles: TFile[] = [];

	constructor(app: App, plugin: CrystalBoardsPlugin, onSubmit: (board: Board) => void) {
		super(app);
		this.plugin = plugin;
		this.onSubmit = onSubmit;
		this.allImageFiles = this.app.vault.getFiles()
			.filter((file: TFile) => /\.(jpg|jpeg|png|gif|webp)$/i.test(file.path));
		this.imageSearchResults = [];
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Create New Board' });

		new Setting(contentEl)
			.setName('Board Name')
			.setDesc('Enter a name for your new Kanban board')
			.addText((text) => {
				text.setPlaceholder('My Project')
					.setValue(this.boardName)
					.onChange((value) => {
						this.boardName = value;
					});
				text.inputEl.focus();
			});

		// Emoji picker with search
		const emojiContainer = contentEl.createEl('div', { cls: 'crystal-emoji-picker-container' });
		const emojiSetting = new Setting(emojiContainer)
			.setName('Board Emoji')
			.setDesc('Choose an emoji to represent your board');
		
		// Search input
		const searchInput = emojiContainer.createEl('input', { 
			cls: 'crystal-emoji-search',
			attr: { type: 'text', placeholder: 'Search emojis... (try "rocket", "heart", "food")' }
		});
		
		// Selected emoji display
		const selectedEmojiEl = emojiContainer.createEl('div', { cls: 'crystal-selected-emoji' });
		this.updateSelectedEmojiDisplay(selectedEmojiEl);
		
		const emojiGrid = emojiContainer.createEl('div', { cls: 'crystal-emoji-grid' });
		
		// Initial load of emojis
		this.renderEmojis(emojiGrid, '');
		
		// Search functionality
		searchInput.addEventListener('input', (e) => {
			const searchTerm = (e.target as HTMLInputElement).value;
			this.renderEmojis(emojiGrid, searchTerm);
		});

		// Cover image search
		const imageSearchContainer = contentEl.createEl('div', { cls: 'crystal-image-search-container' });
		
		new Setting(imageSearchContainer)
			.setName('Cover Image (Optional)')
			.setDesc('Search for an image from your vault to use as the board cover')
			.addText((text) => {
				text.setPlaceholder('Search for images...')
					.onChange((searchTerm) => {
						this.searchImages(searchTerm, imageSearchContainer);
					});
			});

		// Selected image display
		const selectedImageEl = imageSearchContainer.createEl('div', { cls: 'crystal-selected-image' });
		this.updateSelectedImageDisplay(selectedImageEl);

		// Search results container  
		imageSearchContainer.createEl('div', { cls: 'crystal-image-search-results' });

		new Setting(contentEl)
			.addButton((btn) => {
				btn.setButtonText('Cancel')
					.onClick(() => {
						this.close();
					});
			})
			.addButton((btn) => {
				btn.setButtonText('Create Board')
					.setCta()
					.onClick(() => {
						this.createBoard();
					});
			});
	}

	async createBoard(): Promise<void> {
		if (!this.boardName.trim()) {
			// TODO: Show error message
			return;
		}

		const now = Date.now();
		const board: Board = {
			id: this.generateId(),
			name: this.boardName.trim(),
			folderPath: `${this.plugin.settings.kanbanFolderPath}/${this.boardName.trim()}`,
			emoji: this.emoji || undefined,
			coverImage: this.coverImage || undefined,
			position: 0, // Will be set properly in the callback
			columns: (() => {
					const colors = getThemeAwareColors();
					return [
						{
							id: this.generateId(),
							name: 'To Do',
							color: colors[0],
							position: 0,
							cards: []
						},
						{
							id: this.generateId(),
							name: 'In Progress',
							color: colors[1],
							position: 1,
							cards: []
						},
						{
							id: this.generateId(),
							name: 'Done',
							color: colors[2],
							position: 2,
							cards: []
						}
					];
				})(),
			created: now,
			modified: now
		};

		// Create folder structure
		await this.ensureFolderExists(board.folderPath);

		this.onSubmit(board);
		this.close();
	}

	private async ensureFolderExists(path: string): Promise<void> {
		if (!(await this.app.vault.adapter.exists(path))) {
			await this.app.vault.createFolder(path);
		}
	}

	private searchImages(searchTerm: string, container: HTMLElement): void {
		const searchResultsEl = container.querySelector('.crystal-image-search-results') as HTMLElement;
		if (!searchResultsEl) return;

		searchResultsEl.empty();

		if (!searchTerm.trim()) {
			this.imageSearchResults = [];
			return;
		}

		const searchLower = searchTerm.toLowerCase();
		
		// Enhanced search with path autocomplete and folder suggestions
		let results: Array<{file: TFile, matchType: 'exact' | 'folder' | 'filename' | 'path', score: number}> = [];
		
		// Get unique folder paths from image files for autocomplete suggestions
		const folderPaths = new Set<string>();
		this.allImageFiles.forEach(file => {
			const pathParts = file.path.split('/');
			// Add progressively longer path segments
			for (let i = 1; i < pathParts.length; i++) {
				const folderPath = pathParts.slice(0, i).join('/');
				if (folderPath.toLowerCase().includes(searchLower)) {
					folderPaths.add(folderPath);
				}
			}
		});

		// Score and categorize matches
		this.allImageFiles.forEach(file => {
			const fileName = file.name.toLowerCase();
			const filePath = file.path.toLowerCase();
			const fileDir = file.parent?.path.toLowerCase() || '';
			
			let matchType: 'exact' | 'folder' | 'filename' | 'path' = 'path';
			let score = 0;
			
			// Exact filename match (highest priority)
			if (fileName === searchLower || fileName.startsWith(searchLower)) {
				matchType = 'exact';
				score = 100;
			}
			// Folder name match
			else if (fileDir.includes(searchLower) || file.parent?.name.toLowerCase().includes(searchLower)) {
				matchType = 'folder';
				score = 80;
			}
			// Filename contains search term
			else if (fileName.includes(searchLower)) {
				matchType = 'filename';
				score = 60;
			}
			// Full path contains search term
			else if (filePath.includes(searchLower)) {
				matchType = 'path';
				score = 40;
			}
			
			if (score > 0) {
				// Boost score for matches at word boundaries
				if (fileName.includes(' ' + searchLower) || fileName.startsWith(searchLower)) {
					score += 10;
				}
				
				results.push({file, matchType, score});
			}
		});
		
		// Sort by score (highest first) and limit results
		results = results.sort((a, b) => b.score - a.score).slice(0, 8);
		this.imageSearchResults = results.map(r => r.file);

		// Show folder path suggestions if we have partial path matches
		const folderSuggestions = Array.from(folderPaths)
			.filter(path => path.toLowerCase().includes(searchLower))
			.sort()
			.slice(0, 3);
		
		if (folderSuggestions.length > 0 && searchTerm.includes('/')) {
			searchResultsEl.createEl('div', { 
				text: 'Folder suggestions:',
				cls: 'crystal-search-results-title'
			});
			
			const suggestionsContainer = searchResultsEl.createEl('div', { cls: 'crystal-path-suggestions' });
			
			folderSuggestions.forEach(folderPath => {
				const suggestionEl = suggestionsContainer.createEl('div', { cls: 'crystal-path-suggestion' });
				suggestionEl.createEl('span', { text: '📁', cls: 'crystal-folder-icon' });
				suggestionEl.createEl('span', { text: folderPath, cls: 'crystal-folder-path' });
				
				suggestionEl.onclick = () => {
					// Auto-complete the search input with folder path
					const searchInput = container.querySelector('input[placeholder*="Search for images"]') as HTMLInputElement;
					if (searchInput) {
						searchInput.value = folderPath + '/';
						searchInput.dispatchEvent(new Event('input'));
					}
				};
			});
		}

		// Display image search results
		if (results.length > 0) {
			searchResultsEl.createEl('div', { 
				text: `Found ${results.length} image(s):`,
				cls: 'crystal-search-results-title'
			});

			const resultsGrid = searchResultsEl.createEl('div', { cls: 'crystal-search-results-grid' });
			
			results.forEach(({file, matchType, score}) => {
				const resultItem = resultsGrid.createEl('div', { 
					cls: `crystal-search-result-item crystal-match-${matchType}`
				});
				
				const thumbnail = resultItem.createEl('div', { cls: 'crystal-search-thumbnail' });
				const url = this.app.vault.getResourcePath(file);
				thumbnail.style.backgroundImage = `url(${url})`;
				
				const infoContainer = resultItem.createEl('div', { cls: 'crystal-search-info' });
				
				// Show filename
				infoContainer.createEl('div', { 
					text: file.name,
					cls: 'crystal-search-filename'
				});
				
				// Show folder path if different from filename search
				if (file.parent && file.parent.path !== '/') {
					infoContainer.createEl('div', { 
						text: file.parent.path,
						cls: 'crystal-search-filepath'
					});
				}
				
				// Show match type indicator
				const matchIndicator = infoContainer.createEl('div', { cls: 'crystal-match-indicator' });
				const matchLabels = {
					'exact': '🎯 Exact match',
					'folder': '📁 Folder match', 
					'filename': '📄 Filename match',
					'path': '🔗 Path match'
				};
				matchIndicator.createEl('span', { 
					text: matchLabels[matchType], 
					cls: 'crystal-match-type'
				});

				resultItem.onclick = () => {
					this.coverImage = file.path;
					this.updateSelectedImageDisplay(container.querySelector('.crystal-selected-image') as HTMLElement);
					searchResultsEl.empty();
					
					// Update search input to show selected file path
					const searchInput = container.querySelector('input[placeholder*="Search for images"]') as HTMLInputElement;
					if (searchInput) {
						searchInput.value = file.path;
					}
				};
			});
		} else if (folderSuggestions.length === 0) {
			searchResultsEl.createEl('div', { 
				text: 'No images found matching your search. Try searching by folder path (e.g., "Images/" or "Attachments/photos").',
				cls: 'crystal-search-no-results'
			});
		}
	}

	private updateSelectedImageDisplay(container: HTMLElement): void {
		if (!container) return;
		
		container.empty();
		
		if (this.coverImage) {
			const file = this.app.vault.getAbstractFileByPath(this.coverImage);
			if (file instanceof TFile) {
				const selectedContainer = container.createEl('div', { cls: 'crystal-selected-image-container' });
				
				const thumbnail = selectedContainer.createEl('div', { cls: 'crystal-selected-thumbnail' });
				const url = this.app.vault.getResourcePath(file);
				thumbnail.style.backgroundImage = `url(${url})`;
				
				const info = selectedContainer.createEl('div', { cls: 'crystal-selected-info' });
				info.createEl('div', { text: 'Selected:', cls: 'crystal-selected-label' });
				info.createEl('div', { text: file.name, cls: 'crystal-selected-name' });
				
				const removeBtn = selectedContainer.createEl('button', {
					text: '×',
					cls: 'crystal-remove-image-btn'
				});
				removeBtn.onclick = () => {
					this.coverImage = '';
					this.updateSelectedImageDisplay(container);
				};
			}
		}
	}

	private generateId(): string {
		return Math.random().toString(36).substr(2, 9);
	}

	private renderEmojis(emojiGrid: HTMLElement, searchTerm: string): void {
		emojiGrid.empty();
		
		const filteredEmojis = filterEmojis(searchTerm);
		
		for (const item of filteredEmojis) {
			const emojiBtn = emojiGrid.createEl('button', { 
				text: item.emoji, 
				cls: 'crystal-emoji-btn' + (this.emoji === item.emoji ? ' selected' : ''),
				attr: { title: item.keywords.join(', ') }
			});
			emojiBtn.onclick = () => {
				// Remove selection from other buttons
				emojiGrid.querySelectorAll('.crystal-emoji-btn').forEach(btn => btn.removeClass('selected'));
				// Select current button
				emojiBtn.addClass('selected');
				this.emoji = item.emoji;
				this.updateSelectedEmojiDisplay(emojiGrid.parentElement?.querySelector('.crystal-selected-emoji') as HTMLElement);
			};
		}
		
		if (filteredEmojis.length === 0) {
			emojiGrid.createEl('div', { 
				text: 'No emojis found. Try different keywords!', 
				cls: 'crystal-emoji-no-results' 
			});
		}
	}

	private updateSelectedEmojiDisplay(container: HTMLElement): void {
		if (!container) return;
		
		container.empty();
		
		if (this.emoji) {
			const selectedContainer = container.createEl('div', { cls: 'crystal-selected-emoji-container' });
			
			const emojiDisplay = selectedContainer.createEl('div', { cls: 'crystal-selected-emoji-display' });
			emojiDisplay.createEl('span', { text: this.emoji, cls: 'crystal-selected-emoji-large' });
			emojiDisplay.createEl('span', { text: 'Selected emoji', cls: 'crystal-selected-emoji-label' });
			
			const removeBtn = selectedContainer.createEl('button', {
				text: '×',
				cls: 'crystal-remove-emoji-btn'
			});
			removeBtn.onclick = () => {
				this.emoji = '';
				this.updateSelectedEmojiDisplay(container);
				// Remove selection from grid
				const emojiGrid = container.parentElement?.querySelector('.crystal-emoji-grid') as HTMLElement;
				if (emojiGrid) {
					emojiGrid.querySelectorAll('.crystal-emoji-btn').forEach(btn => btn.removeClass('selected'));
				}
			};
		} else {
			container.createEl('div', { 
				text: 'No emoji selected', 
				cls: 'crystal-no-emoji-selected' 
			});
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class EditBoardModal extends Modal {
	plugin: CrystalBoardsPlugin;
	board: Board;
	onSubmit: (board: Board) => void;
	boardName: string;
	emoji: string;
	coverImage: string;
	coverImageAlignment: string;
	coverImagePosition: number;
	imageSearchResults: TFile[] = [];
	allImageFiles: TFile[] = [];
	previewEl: HTMLElement | null = null;

	constructor(app: App, plugin: CrystalBoardsPlugin, board: Board, onSubmit: (board: Board) => void) {
		super(app);
		this.plugin = plugin;
		this.board = board;
		this.onSubmit = onSubmit;
		this.boardName = board.name;
		this.emoji = board.emoji || '';
		this.coverImage = board.coverImage || '';
		this.coverImageAlignment = board.coverImageAlignment || 'center';
		this.coverImagePosition = board.coverImagePosition ?? 50; // Default to 50% (center)
		this.allImageFiles = this.app.vault.getFiles()
			.filter((file: TFile) => /\.(jpg|jpeg|png|gif|webp)$/i.test(file.path));
		this.imageSearchResults = [];
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Edit Board' });

		new Setting(contentEl)
			.setName('Board Name')
			.setDesc('Enter a name for your Kanban board')
			.addText((text) => {
				text.setPlaceholder('My Project')
					.setValue(this.boardName)
					.onChange((value) => {
						this.boardName = value;
					});
				text.inputEl.focus();
			});

		// Emoji picker with search
		const emojiContainer = contentEl.createEl('div', { cls: 'crystal-emoji-picker-container' });
		const emojiSetting = new Setting(emojiContainer)
			.setName('Board Emoji')
			.setDesc('Choose an emoji to represent your board');
		
		// Search input
		const searchInput = emojiContainer.createEl('input', { 
			cls: 'crystal-emoji-search',
			attr: { type: 'text', placeholder: 'Search emojis... (try "rocket", "heart", "food")' }
		});
		
		// Selected emoji display
		const selectedEmojiEl = emojiContainer.createEl('div', { cls: 'crystal-selected-emoji' });
		this.updateSelectedEmojiDisplay(selectedEmojiEl);
		
		const emojiGrid = emojiContainer.createEl('div', { cls: 'crystal-emoji-grid' });
		
		// Initial load of emojis
		this.renderEmojis(emojiGrid, '');
		
		// Search functionality
		searchInput.addEventListener('input', (e) => {
			const searchTerm = (e.target as HTMLInputElement).value;
			this.renderEmojis(emojiGrid, searchTerm);
		});

		// Cover image search
		const imageSearchContainer = contentEl.createEl('div', { cls: 'crystal-image-search-container' });
		
		new Setting(imageSearchContainer)
			.setName('Cover Image (Optional)')
			.setDesc('Search for an image from your vault to use as the board cover')
			.addText((text) => {
				text.setPlaceholder('Search for images...')
					.setValue(this.coverImage ? this.app.vault.getAbstractFileByPath(this.coverImage)?.name || '' : '')
					.onChange((searchTerm) => {
						this.searchImages(searchTerm, imageSearchContainer);
					});
			});

		// Selected image display
		const selectedImageEl = imageSearchContainer.createEl('div', { cls: 'crystal-selected-image' });
		this.updateSelectedImageDisplay(selectedImageEl);

		// Search results container
		imageSearchContainer.createEl('div', { cls: 'crystal-image-search-results' });

		// Cover image preview (if there's an image)
		this.createPreview(contentEl);

		// Cover image positioning (only show if there's an image)
		if (this.coverImage) {
			// Cover image vertical position with live preview
			new Setting(contentEl)
				.setName('Cover Image Vertical Position')
				.setDesc('Fine-tune the vertical position of the image (0% = top, 100% = bottom)')
				.addSlider((slider) => {
					slider.setLimits(0, 100, 1)
						.setValue(this.coverImagePosition)
						.setDynamicTooltip()
						.onChange((value) => {
							this.coverImagePosition = value;
							// Update live preview
							if (this.previewEl) {
								this.previewEl.style.backgroundPosition = `center ${value}%`;
							}
						});
				});

			// Add preset buttons for quick positioning
			const presetsContainer = contentEl.createEl('div', { cls: 'crystal-position-presets' });
			presetsContainer.createEl('h4', { text: 'Quick Positions' });
			
			const presetsGrid = presetsContainer.createEl('div', { cls: 'crystal-presets-grid' });
			
			const presets = [
				{ name: 'Top', value: 0 },
				{ name: 'Upper', value: 25 },
				{ name: 'Center', value: 50 },
				{ name: 'Lower', value: 75 },
				{ name: 'Bottom', value: 100 }
			];

			for (const preset of presets) {
				const presetBtn = presetsGrid.createEl('button', {
					text: preset.name,
					cls: 'crystal-preset-btn'
				});
				presetBtn.onclick = () => {
					this.coverImagePosition = preset.value;
					// Update slider
					const sliderEl = contentEl.querySelector('input[type="range"]') as HTMLInputElement;
					if (sliderEl) {
						sliderEl.value = preset.value.toString();
					}
					// Update live preview
					if (this.previewEl) {
						this.previewEl.style.backgroundPosition = `center ${preset.value}%`;
					}
				};
			}
		}

		new Setting(contentEl)
			.addButton((btn) => {
				btn.setButtonText('Cancel')
					.onClick(() => {
						this.close();
					});
			})
			.addButton((btn) => {
				btn.setButtonText('Save Changes')
					.setCta()
					.onClick(() => {
						this.updateBoard();
					});
			});
	}

	private searchImages(searchTerm: string, container: HTMLElement): void {
		const searchResultsEl = container.querySelector('.crystal-image-search-results') as HTMLElement;
		if (!searchResultsEl) return;

		searchResultsEl.empty();

		if (!searchTerm.trim()) {
			this.imageSearchResults = [];
			return;
		}

		const searchLower = searchTerm.toLowerCase();
		
		// Enhanced search with path autocomplete and folder suggestions
		let results: Array<{file: TFile, matchType: 'exact' | 'folder' | 'filename' | 'path', score: number}> = [];
		
		// Get unique folder paths from image files for autocomplete suggestions
		const folderPaths = new Set<string>();
		this.allImageFiles.forEach(file => {
			const pathParts = file.path.split('/');
			// Add progressively longer path segments
			for (let i = 1; i < pathParts.length; i++) {
				const folderPath = pathParts.slice(0, i).join('/');
				if (folderPath.toLowerCase().includes(searchLower)) {
					folderPaths.add(folderPath);
				}
			}
		});

		// Score and categorize matches
		this.allImageFiles.forEach(file => {
			const fileName = file.name.toLowerCase();
			const filePath = file.path.toLowerCase();
			const fileDir = file.parent?.path.toLowerCase() || '';
			
			let matchType: 'exact' | 'folder' | 'filename' | 'path' = 'path';
			let score = 0;
			
			// Exact filename match (highest priority)
			if (fileName === searchLower || fileName.startsWith(searchLower)) {
				matchType = 'exact';
				score = 100;
			}
			// Folder name match
			else if (fileDir.includes(searchLower) || file.parent?.name.toLowerCase().includes(searchLower)) {
				matchType = 'folder';
				score = 80;
			}
			// Filename contains search term
			else if (fileName.includes(searchLower)) {
				matchType = 'filename';
				score = 60;
			}
			// Full path contains search term
			else if (filePath.includes(searchLower)) {
				matchType = 'path';
				score = 40;
			}
			
			if (score > 0) {
				// Boost score for matches at word boundaries
				if (fileName.includes(' ' + searchLower) || fileName.startsWith(searchLower)) {
					score += 10;
				}
				
				results.push({file, matchType, score});
			}
		});
		
		// Sort by score (highest first) and limit results
		results = results.sort((a, b) => b.score - a.score).slice(0, 8);
		this.imageSearchResults = results.map(r => r.file);

		// Show folder path suggestions if we have partial path matches
		const folderSuggestions = Array.from(folderPaths)
			.filter(path => path.toLowerCase().includes(searchLower))
			.sort()
			.slice(0, 3);
		
		if (folderSuggestions.length > 0 && searchTerm.includes('/')) {
			searchResultsEl.createEl('div', { 
				text: 'Folder suggestions:',
				cls: 'crystal-search-results-title'
			});
			
			const suggestionsContainer = searchResultsEl.createEl('div', { cls: 'crystal-path-suggestions' });
			
			folderSuggestions.forEach(folderPath => {
				const suggestionEl = suggestionsContainer.createEl('div', { cls: 'crystal-path-suggestion' });
				suggestionEl.createEl('span', { text: '📁', cls: 'crystal-folder-icon' });
				suggestionEl.createEl('span', { text: folderPath, cls: 'crystal-folder-path' });
				
				suggestionEl.onclick = () => {
					// Auto-complete the search input with folder path
					const searchInput = container.querySelector('input[placeholder*="Search for images"]') as HTMLInputElement;
					if (searchInput) {
						searchInput.value = folderPath + '/';
						searchInput.dispatchEvent(new Event('input'));
					}
				};
			});
		}

		// Display image search results
		if (results.length > 0) {
			searchResultsEl.createEl('div', { 
				text: `Found ${results.length} image(s):`,
				cls: 'crystal-search-results-title'
			});

			const resultsGrid = searchResultsEl.createEl('div', { cls: 'crystal-search-results-grid' });
			
			results.forEach(({file, matchType, score}) => {
				const resultItem = resultsGrid.createEl('div', { 
					cls: `crystal-search-result-item crystal-match-${matchType}`
				});
				
				const thumbnail = resultItem.createEl('div', { cls: 'crystal-search-thumbnail' });
				const url = this.app.vault.getResourcePath(file);
				thumbnail.style.backgroundImage = `url(${url})`;
				
				const infoContainer = resultItem.createEl('div', { cls: 'crystal-search-info' });
				
				// Show filename
				infoContainer.createEl('div', { 
					text: file.name,
					cls: 'crystal-search-filename'
				});
				
				// Show folder path if different from filename search
				if (file.parent && file.parent.path !== '/') {
					infoContainer.createEl('div', { 
						text: file.parent.path,
						cls: 'crystal-search-filepath'
					});
				}
				
				// Show match type indicator
				const matchIndicator = infoContainer.createEl('div', { cls: 'crystal-match-indicator' });
				const matchLabels = {
					'exact': '🎯 Exact match',
					'folder': '📁 Folder match', 
					'filename': '📄 Filename match',
					'path': '🔗 Path match'
				};
				matchIndicator.createEl('span', { 
					text: matchLabels[matchType], 
					cls: 'crystal-match-type'
				});

				resultItem.onclick = () => {
					this.coverImage = file.path;
					this.updateSelectedImageDisplay(container.querySelector('.crystal-selected-image') as HTMLElement);
					searchResultsEl.empty();
					
					// Update search input to show selected file path
					const searchInput = container.querySelector('input[placeholder*="Search for images"]') as HTMLInputElement;
					if (searchInput) {
						searchInput.value = file.path;
					}
					
					// Update preview if it exists (EditBoardModal has preview functionality)
					if (this.previewEl) {
						this.updatePreview();
					}
				};
			});
		} else if (folderSuggestions.length === 0) {
			searchResultsEl.createEl('div', { 
				text: 'No images found matching your search. Try searching by folder path (e.g., "Images/" or "Attachments/photos").',
				cls: 'crystal-search-no-results'
			});
		}
	}

	private updateSelectedImageDisplay(container: HTMLElement): void {
		if (!container) return;
		
		container.empty();
		
		if (this.coverImage) {
			const file = this.app.vault.getAbstractFileByPath(this.coverImage);
			if (file instanceof TFile) {
				const selectedContainer = container.createEl('div', { cls: 'crystal-selected-image-container' });
				
				const thumbnail = selectedContainer.createEl('div', { cls: 'crystal-selected-thumbnail' });
				const url = this.app.vault.getResourcePath(file);
				thumbnail.style.backgroundImage = `url(${url})`;
				
				const info = selectedContainer.createEl('div', { cls: 'crystal-selected-info' });
				info.createEl('div', { text: 'Selected:', cls: 'crystal-selected-label' });
				info.createEl('div', { text: file.name, cls: 'crystal-selected-name' });
				
				const removeBtn = selectedContainer.createEl('button', {
					text: '×',
					cls: 'crystal-remove-image-btn'
				});
				removeBtn.onclick = () => {
					this.coverImage = '';
					this.updateSelectedImageDisplay(container);
				};
			}
		}
	}

	private createPreview(contentEl: HTMLElement): void {
		if (this.coverImage) {
			const previewContainer = contentEl.createEl('div', { cls: 'crystal-cover-preview-container' });
			previewContainer.createEl('h4', { text: 'Live Preview' });
			this.previewEl = previewContainer.createEl('div', { cls: 'crystal-cover-preview' });
			
			const file = this.app.vault.getAbstractFileByPath(this.coverImage);
			if (file instanceof TFile) {
				const url = this.app.vault.getResourcePath(file);
				this.previewEl.style.backgroundImage = `url(${url})`;
				this.previewEl.style.backgroundSize = 'cover';
				this.previewEl.style.backgroundRepeat = 'no-repeat';
				this.previewEl.style.backgroundPosition = `center ${this.coverImagePosition}%`;
			}
		} else {
			this.previewEl = null;
		}
	}

	private updatePreview(): void {
		if (this.previewEl && this.coverImage) {
			const file = this.app.vault.getAbstractFileByPath(this.coverImage);
			if (file instanceof TFile) {
				const url = this.app.vault.getResourcePath(file);
				this.previewEl.style.backgroundImage = `url(${url})`;
				this.previewEl.style.backgroundSize = 'cover';
				this.previewEl.style.backgroundRepeat = 'no-repeat';
				this.previewEl.style.backgroundPosition = `center ${this.coverImagePosition}%`;
			}
		}
	}

	updateBoard(): void {
		if (!this.boardName.trim()) {
			// TODO: Show error message
			return;
		}

		const updatedBoard: Board = {
			...this.board,
			name: this.boardName.trim(),
			emoji: this.emoji || undefined,
			coverImage: this.coverImage || undefined,
			coverImageAlignment: this.coverImageAlignment as 'center' | 'top' | 'bottom' | 'left' | 'right',
			coverImagePosition: this.coverImagePosition,
			modified: Date.now()
		};

		this.onSubmit(updatedBoard);
		this.close();
	}

	private renderEmojis(emojiGrid: HTMLElement, searchTerm: string): void {
		emojiGrid.empty();
		
		const filteredEmojis = filterEmojis(searchTerm);
		
		for (const item of filteredEmojis) {
			const emojiBtn = emojiGrid.createEl('button', { 
				text: item.emoji, 
				cls: 'crystal-emoji-btn' + (this.emoji === item.emoji ? ' selected' : ''),
				attr: { title: item.keywords.join(', ') }
			});
			emojiBtn.onclick = () => {
				// Remove selection from other buttons
				emojiGrid.querySelectorAll('.crystal-emoji-btn').forEach(btn => btn.removeClass('selected'));
				// Select current button
				emojiBtn.addClass('selected');
				this.emoji = item.emoji;
				this.updateSelectedEmojiDisplay(emojiGrid.parentElement?.querySelector('.crystal-selected-emoji') as HTMLElement);
			};
		}
		
		if (filteredEmojis.length === 0) {
			emojiGrid.createEl('div', { 
				text: 'No emojis found. Try different keywords!', 
				cls: 'crystal-emoji-no-results' 
			});
		}
	}

	private updateSelectedEmojiDisplay(container: HTMLElement): void {
		if (!container) return;
		
		container.empty();
		
		if (this.emoji) {
			const selectedContainer = container.createEl('div', { cls: 'crystal-selected-emoji-container' });
			
			const emojiDisplay = selectedContainer.createEl('div', { cls: 'crystal-selected-emoji-display' });
			emojiDisplay.createEl('span', { text: this.emoji, cls: 'crystal-selected-emoji-large' });
			emojiDisplay.createEl('span', { text: 'Selected emoji', cls: 'crystal-selected-emoji-label' });
			
			const removeBtn = selectedContainer.createEl('button', {
				text: '×',
				cls: 'crystal-remove-emoji-btn'
			});
			removeBtn.onclick = () => {
				this.emoji = '';
				this.updateSelectedEmojiDisplay(container);
				// Remove selection from grid
				const emojiGrid = container.parentElement?.querySelector('.crystal-emoji-grid') as HTMLElement;
				if (emojiGrid) {
					emojiGrid.querySelectorAll('.crystal-emoji-btn').forEach(btn => btn.removeClass('selected'));
				}
			};
		} else {
			container.createEl('div', { 
				text: 'No emoji selected', 
				cls: 'crystal-no-emoji-selected' 
			});
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}