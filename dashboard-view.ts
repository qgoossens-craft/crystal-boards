import { ItemView, WorkspaceLeaf, Modal, Setting, TFile, App } from 'obsidian';
import CrystalBoardsPlugin from './main';
import { Board, DASHBOARD_VIEW_TYPE } from './types';

export class DashboardView extends ItemView {
	plugin: CrystalBoardsPlugin;

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
	}

	async onShow(): Promise<void> {
		// Auto-refresh dashboard when it becomes visible
		await this.renderDashboard();
	}

	async onClose(): Promise<void> {
		// Clean up if needed
	}

	async renderDashboard(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();

		// Header
		const headerEl = contentEl.createEl('div', { cls: 'crystal-boards-header' });
		headerEl.createEl('h1', { text: 'Crystal Boards', cls: 'crystal-boards-title' });
		
		const createBoardBtn = headerEl.createEl('button', {
			text: 'Create Board',
			cls: 'mod-cta crystal-boards-create-btn'
		});
		createBoardBtn.onclick = () => this.openCreateBoardModal();

		// Boards grid
		const boardsContainer = contentEl.createEl('div', { cls: 'crystal-boards-grid' });
		
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

		// Cover image header
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
			coverEl.createEl('div', { 
				text: '📋', 
				cls: 'crystal-board-cover-icon' 
			});
		}

		// Compact content layout with thumbnail and info
		const contentEl = cardEl.createEl('div', { cls: 'crystal-board-card-content' });

		// Small thumbnail for visual consistency
		const thumbnailEl = contentEl.createEl('div', { cls: 'crystal-board-thumbnail' });
		if (board.coverImage && this.plugin.settings.showCoverImages) {
			const file = this.app.vault.getAbstractFileByPath(board.coverImage);
			if (file instanceof TFile) {
				const url = this.app.vault.getResourcePath(file);
				thumbnailEl.style.backgroundImage = `url(${url})`;
				thumbnailEl.addClass('has-image');
			}
		}
		
		if (!thumbnailEl.hasClass('has-image')) {
			thumbnailEl.createEl('div', { 
				text: '📋', 
				cls: 'crystal-board-thumbnail-icon' 
			});
		}

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
}

class CreateBoardModal extends Modal {
	plugin: CrystalBoardsPlugin;
	onSubmit: (board: Board) => void;
	boardName = '';
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
			coverImage: this.coverImage || undefined,
			position: 0, // Will be set properly in the callback
			columns: [
				{
					id: this.generateId(),
					name: 'To Do',
					color: '#e3f2fd',
					position: 0,
					cards: []
				},
				{
					id: this.generateId(),
					name: 'In Progress',
					color: '#fff3e0',
					position: 1,
					cards: []
				},
				{
					id: this.generateId(),
					name: 'Done',
					color: '#e8f5e8',
					position: 2,
					cards: []
				}
			],
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

		// Filter images based on search term
		this.imageSearchResults = this.allImageFiles
			.filter(file => 
				file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
				file.path.toLowerCase().includes(searchTerm.toLowerCase())
			)
			.slice(0, 6); // Limit to 6 results

		// Display search results
		if (this.imageSearchResults.length > 0) {
			searchResultsEl.createEl('div', { 
				text: `Found ${this.imageSearchResults.length} image(s):`,
				cls: 'crystal-search-results-title'
			});

			const resultsGrid = searchResultsEl.createEl('div', { cls: 'crystal-search-results-grid' });
			
			for (const file of this.imageSearchResults) {
				const resultItem = resultsGrid.createEl('div', { cls: 'crystal-search-result-item' });
				
				const thumbnail = resultItem.createEl('div', { cls: 'crystal-search-thumbnail' });
				const url = this.app.vault.getResourcePath(file);
				thumbnail.style.backgroundImage = `url(${url})`;
				
				resultItem.createEl('div', { 
					text: file.name,
					cls: 'crystal-search-filename'
				});

				resultItem.onclick = () => {
					this.coverImage = file.path;
					this.updateSelectedImageDisplay(container.querySelector('.crystal-selected-image') as HTMLElement);
					searchResultsEl.empty();
				};
			}
		} else {
			searchResultsEl.createEl('div', { 
				text: 'No images found matching your search.',
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
	coverImage: string;
	coverImageAlignment: string;
	coverImagePosition: number;
	imageSearchResults: TFile[] = [];
	allImageFiles: TFile[] = [];

	constructor(app: App, plugin: CrystalBoardsPlugin, board: Board, onSubmit: (board: Board) => void) {
		super(app);
		this.plugin = plugin;
		this.board = board;
		this.onSubmit = onSubmit;
		this.boardName = board.name;
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

		// Cover image alignment (only show if there's an image)
		if (this.coverImage) {
			new Setting(contentEl)
				.setName('Cover Image Alignment')
				.setDesc('Adjust how the cover image is positioned')
				.addDropdown((dropdown) => {
					dropdown.addOption('center', 'Center')
						.addOption('top', 'Top')
						.addOption('bottom', 'Bottom')
						.addOption('left', 'Left')
						.addOption('right', 'Right')
						.setValue(this.coverImageAlignment)
						.onChange((value) => {
							this.coverImageAlignment = value;
						});
				});
			
			// Cover image vertical position
			new Setting(contentEl)
				.setName('Cover Image Vertical Position')
				.setDesc('Fine-tune the vertical position of the image (0% = top, 100% = bottom)')
				.addSlider((slider) => {
					slider.setLimits(0, 100, 1)
						.setValue(this.coverImagePosition)
						.setDynamicTooltip()
						.onChange((value) => {
							this.coverImagePosition = value;
							// Update preview if we add one
						});
				});
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

		// Filter images based on search term
		this.imageSearchResults = this.allImageFiles
			.filter(file => 
				file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
				file.path.toLowerCase().includes(searchTerm.toLowerCase())
			)
			.slice(0, 6); // Limit to 6 results

		// Display search results
		if (this.imageSearchResults.length > 0) {
			searchResultsEl.createEl('div', { 
				text: `Found ${this.imageSearchResults.length} image(s):`,
				cls: 'crystal-search-results-title'
			});

			const resultsGrid = searchResultsEl.createEl('div', { cls: 'crystal-search-results-grid' });
			
			for (const file of this.imageSearchResults) {
				const resultItem = resultsGrid.createEl('div', { cls: 'crystal-search-result-item' });
				
				const thumbnail = resultItem.createEl('div', { cls: 'crystal-search-thumbnail' });
				const url = this.app.vault.getResourcePath(file);
				thumbnail.style.backgroundImage = `url(${url})`;
				
				resultItem.createEl('div', { 
					text: file.name,
					cls: 'crystal-search-filename'
				});

				resultItem.onclick = () => {
					this.coverImage = file.path;
					this.updateSelectedImageDisplay(container.querySelector('.crystal-selected-image') as HTMLElement);
					searchResultsEl.empty();
				};
			}
		} else {
			searchResultsEl.createEl('div', { 
				text: 'No images found matching your search.',
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

	updateBoard(): void {
		if (!this.boardName.trim()) {
			// TODO: Show error message
			return;
		}

		const updatedBoard: Board = {
			...this.board,
			name: this.boardName.trim(),
			coverImage: this.coverImage || undefined,
			coverImageAlignment: this.coverImageAlignment as 'center' | 'top' | 'bottom' | 'left' | 'right',
			coverImagePosition: this.coverImagePosition,
			modified: Date.now()
		};

		this.onSubmit(updatedBoard);
		this.close();
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}