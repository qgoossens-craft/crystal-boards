import { ItemView, WorkspaceLeaf, Modal, Setting, App, TFile, MarkdownRenderer } from 'obsidian';
import CrystalBoardsPlugin from './main';
import { Board, Column, Card, BOARD_VIEW_TYPE } from './types';
import { DragDropManager } from './drag-drop';
import { CardModal } from './card-modal';

export class BoardView extends ItemView {
	plugin: CrystalBoardsPlugin;
	board: Board;
	dragDropManager: DragDropManager;
	selectedCards: Set<string> = new Set();
	bulkActionMode: boolean = false;

	constructor(leaf: WorkspaceLeaf, plugin: CrystalBoardsPlugin, board: Board) {
		super(leaf);
		this.plugin = plugin;
		this.board = board;
		this.dragDropManager = new DragDropManager(plugin, this);
	}

	getViewType(): string {
		return BOARD_VIEW_TYPE;
	}

	getDisplayText(): string {
		return `Board: ${this.board.name}`;
	}

	getIcon(): string {
		return 'kanban';
	}

	async onOpen(): Promise<void> {
		await this.renderBoard();
	}

	async onClose(): Promise<void> {
		this.dragDropManager.disableDragAndDrop();
	}

	async renderBoard(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();

		// Board header
		const headerEl = contentEl.createEl('div', { cls: 'crystal-board-header' });
		
		const titleContainer = headerEl.createEl('div', { cls: 'crystal-board-title-container' });
		const backBtn = titleContainer.createEl('button', {
			text: '← Dashboard',
			cls: 'crystal-board-back-btn'
		});
		backBtn.onclick = () => this.plugin.activateDashboardView();

		titleContainer.createEl('h1', { 
			text: this.board.name, 
			cls: 'crystal-board-title' 
		});

		const actionsContainer = headerEl.createEl('div', { cls: 'crystal-board-actions-container' });
		
		const addColumnBtn = actionsContainer.createEl('button', {
			text: '+ Add Column',
			cls: 'mod-cta crystal-board-add-column-btn'
		});
		addColumnBtn.onclick = () => this.openAddColumnModal();

		// Bulk action toolbar (shown when cards are selected)
		this.renderBulkActionToolbar(contentEl);

		// Board cover image (if set)
		if (this.board.coverImage && this.plugin.settings.showCoverImages) {
			const file = this.app.vault.getAbstractFileByPath(this.board.coverImage);
			if (file instanceof TFile) {
				const coverContainer = contentEl.createEl('div', { cls: 'crystal-board-cover-container' });
				const coverEl = coverContainer.createEl('div', { cls: 'crystal-board-cover' });
				
				// Add edit button overlay
				const editCoverBtn = coverContainer.createEl('button', {
					text: '✏️ Adjust Image',
					cls: 'crystal-board-cover-edit-btn'
				});
				editCoverBtn.onclick = () => this.openCoverImageEditor(coverEl);
				
				const url = this.app.vault.getResourcePath(file);
				coverEl.style.backgroundImage = `url(${url})`;
				
				// Apply alignment and position
				const alignment = this.board.coverImageAlignment || 'center';
				const verticalPosition = this.board.coverImagePosition ?? 50; // Default to 50% (center)
				
				// If we have a specific vertical position, use it instead of alignment presets
				if (this.board.coverImagePosition !== undefined) {
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
			}
		}

		// Board columns container
		const boardContainer = contentEl.createEl('div', { cls: 'crystal-board-container' });
		const columnsContainer = boardContainer.createEl('div', { cls: 'crystal-board-columns' });

		// Render columns
		const sortedColumns = this.board.columns.sort((a, b) => a.position - b.position);
		for (const column of sortedColumns) {
			await this.renderColumn(columnsContainer, column);
		}



		// Enable drag and drop after rendering
		setTimeout(() => {
			this.dragDropManager.enableDragAndDrop();
		}, 100);
	}

	async renderColumn(container: HTMLElement, column: Column): Promise<void> {
		const columnEl = container.createEl('div', { 
			cls: 'crystal-column',
			attr: { 'data-column-id': column.id }
		});
		columnEl.style.backgroundColor = column.color;

		// Column header
		const headerEl = columnEl.createEl('div', { cls: 'crystal-column-header' });
		headerEl.createEl('h3', { 
			text: column.name, 
			cls: 'crystal-column-title' 
		});

		const columnActions = headerEl.createEl('div', { cls: 'crystal-column-actions' });
		
		const editBtn = columnActions.createEl('button', {
			text: '⚙️',
			cls: 'crystal-column-action-btn',
			attr: { 'aria-label': 'Edit column' }
		});
		editBtn.onclick = (e) => {
			e.stopPropagation();
			this.openEditColumnModal(column);
		};

		const deleteBtn = columnActions.createEl('button', {
			text: '🗑️',
			cls: 'crystal-column-action-btn crystal-column-delete-btn',
			attr: { 'aria-label': 'Delete column' }
		});
		deleteBtn.onclick = (e) => {
			e.stopPropagation();
			this.confirmDeleteColumn(column);
		};

		// Card count
		headerEl.createEl('span', { 
			text: `${column.cards.length}`,
			cls: 'crystal-column-count' 
		});

		// Cards container
		const cardsEl = columnEl.createEl('div', { cls: 'crystal-column-cards' });
		
		// Render cards
		for (const card of column.cards) {
			await this.renderCard(cardsEl, card, column.id);
		}

		// Add card button
		const addCardBtn = cardsEl.createEl('button', {
			text: '+ Add Card',
			cls: 'crystal-add-card-btn'
		});
		addCardBtn.onclick = () => this.openAddCardModal(column.id);
	}

	async renderCard(container: HTMLElement, card: Card, columnId: string): Promise<void> {
		const cardEl = container.createEl('div', { 
			cls: 'crystal-card',
			attr: { 'data-card-id': card.id }
		});

		// Add selection state if card is selected
		if (this.selectedCards.has(card.id)) {
			cardEl.addClass('crystal-card-selected');
		}

		// Selection checkbox
		const selectionEl = cardEl.createEl('div', { cls: 'crystal-card-selection' });
		const checkbox = selectionEl.createEl('input', {
			type: 'checkbox',
			cls: 'crystal-card-checkbox'
		}) as HTMLInputElement;
		checkbox.checked = this.selectedCards.has(card.id);
		checkbox.onclick = (e) => {
			e.stopPropagation();
			this.toggleCardSelection(card.id);
		};

		// Make the entire card clickable to open modal
		cardEl.onclick = (e) => {
			// Don't trigger if clicking on action buttons or checkbox
			if (!(e.target as HTMLElement).closest('.crystal-card-actions') && 
				!(e.target as HTMLElement).closest('.crystal-card-selection')) {
				this.openCardModal(card, columnId);
			}
		};

		// Card content
		const contentEl = cardEl.createEl('div', { cls: 'crystal-card-content' });
		contentEl.createEl('h4', { text: card.title, cls: 'crystal-card-title' });

		// Description preview (first 100 characters)
		if (card.description) {
			const descPreview = card.description.length > 100 
				? card.description.substring(0, 100) + '...'
				: card.description;
			contentEl.createEl('p', { text: descPreview, cls: 'crystal-card-description' });
		}

		// Progress bar for todos (if any)
		if (card.todos && card.todos.length > 0) {
			const completedTodos = card.todos.filter(todo => todo.completed).length;
			const totalTodos = card.todos.length;
			const percentage = (completedTodos / totalTodos) * 100;

			const progressContainer = contentEl.createEl('div', { cls: 'crystal-card-progress' });
			const progressBar = progressContainer.createEl('div', { cls: 'crystal-card-progress-bar' });
			const progressFill = progressBar.createEl('div', { cls: 'crystal-card-progress-fill' });
			progressFill.style.width = `${percentage}%`;
			
			progressContainer.createEl('div', { 
				cls: 'crystal-card-progress-text',
				text: `${completedTodos}/${totalTodos} tasks`
			});
		}

		// Tags
		if (card.tags.length > 0) {
			const tagsEl = contentEl.createEl('div', { cls: 'crystal-card-tags' });
			// Show max 3 tags, then "+"
			const visibleTags = card.tags.slice(0, 3);
			for (const tag of visibleTags) {
				tagsEl.createEl('span', { text: tag, cls: 'crystal-card-tag' });
			}
			if (card.tags.length > 3) {
				tagsEl.createEl('span', { 
					text: `+${card.tags.length - 3}`, 
					cls: 'crystal-card-tag crystal-card-tag-more' 
				});
			}
		}

		// Note links count with hover previews
		if (card.noteLinks && card.noteLinks.length > 0) {
			const notesCount = contentEl.createEl('div', { cls: 'crystal-card-notes-count' });
			
			// Create individual note links with hover previews
			card.noteLinks.forEach((notePath, index) => {
				const file = this.app.vault.getAbstractFileByPath(notePath);
				if (file instanceof TFile) {
					const noteLink = notesCount.createEl('span', {
						text: file.basename,
						cls: 'crystal-card-note-link'
					});
					
					// Add click to open note in right pane
					noteLink.onclick = (e) => {
						e.stopPropagation();
						// Open in right pane
						this.app.workspace.getLeaf('split', 'vertical').openFile(file);
					};
					
					// Add hover preview functionality
					this.createNoteHoverPreview(noteLink, file);
					
					// Add separator if not last item
					if (index < card.noteLinks.length - 1) {
						notesCount.createEl('span', { text: ' • ', cls: 'crystal-note-separator' });
					}
				}
			});
			
			// Add count summary
			if (card.noteLinks.length > 1) {
				notesCount.createEl('span', {
					text: ` (${card.noteLinks.length} notes)`,
					cls: 'crystal-card-notes-summary'
				});
			}
		}

		// Research URLs count
		if (card.researchUrls && card.researchUrls.length > 0) {
			const urlsCount = contentEl.createEl('div', { cls: 'crystal-card-urls-count' });
			urlsCount.createEl('span', { 
				text: `🔗 ${card.researchUrls.length} link${card.researchUrls.length === 1 ? '' : 's'}`,
				cls: 'crystal-card-url-count-text'
			});
		}

		// Card actions
		const actionsEl = cardEl.createEl('div', { cls: 'crystal-card-actions' });
		
		const editBtn = actionsEl.createEl('button', {
			text: '✏️',
			cls: 'crystal-card-action-btn',
			attr: { 'aria-label': 'Edit card' }
		});
		editBtn.onclick = (e) => {
			e.stopPropagation();
			this.openCardModal(card, columnId);
		};

		const deleteBtn = actionsEl.createEl('button', {
			text: '🗑️',
			cls: 'crystal-card-action-btn crystal-card-delete-btn',
			attr: { 'aria-label': 'Delete card' }
		});
		deleteBtn.onclick = (e) => {
			e.stopPropagation();
			this.confirmDeleteCard(card, columnId);
		};
	}

	private createNoteHoverPreview(element: HTMLElement, file: TFile): void {
		let hoverTimeout: NodeJS.Timeout | null = null;
		let previewEl: HTMLElement | null = null;
		
		element.addEventListener('mouseenter', () => {
			console.log('Mouse entered note link:', file.basename);
			
			if (hoverTimeout) {
				clearTimeout(hoverTimeout);
			}
			
			hoverTimeout = setTimeout(async () => {
				try {
					console.log('Creating preview for:', file.basename);
					const content = await this.app.vault.read(file);
					let previewContent = content.length > 400 ? content.substring(0, 400) + '...' : content;
					
					// Remove existing preview
					if (previewEl) {
						previewEl.remove();
					}
					
					previewEl = document.body.createEl('div', {
						cls: 'crystal-note-preview-popup'
					});
					
					// Create a container for the rendered markdown
					const contentContainer = previewEl.createEl('div', {
						cls: 'crystal-note-preview-content'
					});
					
					// Render markdown using Obsidian's renderer
					if (previewContent.trim()) {
						await MarkdownRenderer.renderMarkdown(
							previewContent,
							contentContainer,
							file.path,
							this.plugin
						);
					} else {
						contentContainer.textContent = 'Empty note';
					}
					
					// Position the preview near the element
					const rect = element.getBoundingClientRect();
					previewEl.style.position = 'fixed';
					previewEl.style.left = `${rect.left}px`;
					previewEl.style.top = `${rect.bottom + 10}px`;
					previewEl.style.zIndex = '10000';
					previewEl.style.maxWidth = '350px';
					
					console.log('Preview created and positioned');
					
				} catch (error) {
					console.error('Error reading note for preview:', error);
					// Show error preview
					if (previewEl) {
						previewEl.remove();
					}
					previewEl = document.body.createEl('div', {
						cls: 'crystal-note-preview-popup'
					});
					previewEl.textContent = 'Error loading note preview';
					
					const rect = element.getBoundingClientRect();
					previewEl.style.position = 'fixed';
					previewEl.style.left = `${rect.left}px`;
					previewEl.style.top = `${rect.bottom + 10}px`;
					previewEl.style.zIndex = '10000';
				}
			}, 500); // 500ms delay before showing preview
		});
		
		element.addEventListener('mouseleave', () => {
			console.log('Mouse left note link:', file.basename);
			
			if (hoverTimeout) {
				clearTimeout(hoverTimeout);
				hoverTimeout = null;
			}
			if (previewEl) {
				previewEl.remove();
				previewEl = null;
			}
		});
	}

	openCoverImageEditor(coverEl: HTMLElement): void {
		new CoverImageEditorModal(this.app, this.plugin, this.board, coverEl, async (updatedBoard) => {
			this.board = updatedBoard;
			await this.plugin.dataManager.updateBoard(updatedBoard);
			await this.renderBoard();
		}).open();
	}

	openAddColumnModal(): void {
		new ColumnModal(this.app, this.plugin, this.board, null, (column) => {
			this.addColumn(column);
		}).open();
	}

	openEditColumnModal(column: Column): void {
		new ColumnModal(this.app, this.plugin, this.board, column, (updatedColumn) => {
			this.updateColumn(updatedColumn);
		}).open();
	}

	async confirmDeleteColumn(column: Column): Promise<void> {
		const confirmed = await this.showConfirmDialog(
			'Delete Column',
			`Are you sure you want to delete "${column.name}"? All cards in this column will be lost.`
		);
		
		if (confirmed) {
			await this.plugin.dataManager.removeColumnFromBoard(this.board.id, column.id);
			const updatedBoard = this.plugin.dataManager.getBoardById(this.board.id);
			if (updatedBoard) {
				this.board = updatedBoard;
				this.renderBoard();
			}
		}
	}

	openAddCardModal(columnId: string): void {
		const newCard: Card = {
			id: this.generateId(),
			title: '',
			description: '',
			tags: [],
			noteLinks: [],
			todos: [],
			researchUrls: [],
			created: Date.now(),
			modified: Date.now()
		};
		
		new CardModal(this.app, this.plugin, newCard, this.board.id, columnId, async (card) => {
			if (card.title.trim()) {
				await this.plugin.dataManager.addCardToColumn(this.board.id, columnId, card);
				await this.renderBoard();
			}
		}).open();
	}

	openCardModal(card: Card, columnId: string): void {
		new CardModal(this.app, this.plugin, card, this.board.id, columnId, async (updatedCard) => {
			await this.plugin.dataManager.updateCard(this.board.id, columnId, updatedCard);
			await this.renderBoard();
		}).open();
	}

	async confirmDeleteCard(card: Card, columnId: string): Promise<void> {
		const confirmed = await this.showConfirmDialog(
			'Delete Card',
			`Are you sure you want to delete "${card.title}"?`
		);
		
		if (confirmed) {
			await this.plugin.dataManager.removeCardFromColumn(this.board.id, columnId, card.id);
			const updatedBoard = this.plugin.dataManager.getBoardById(this.board.id);
			if (updatedBoard) {
				this.board = updatedBoard;
				this.renderBoard();
			}
		}
	}

	async addColumn(column: Column): Promise<void> {
		await this.plugin.dataManager.addColumnToBoard(this.board.id, column);
		const updatedBoard = this.plugin.dataManager.getBoardById(this.board.id);
		if (updatedBoard) {
			this.board = updatedBoard;
			this.renderBoard();
		}
	}

	async updateColumn(column: Column): Promise<void> {
		await this.plugin.dataManager.updateColumn(this.board.id, column);
		const updatedBoard = this.plugin.dataManager.getBoardById(this.board.id);
		if (updatedBoard) {
			this.board = updatedBoard;
			this.renderBoard();
		}
	}

	async addCard(card: Card, columnId: string): Promise<void> {
		await this.plugin.dataManager.addCardToColumn(this.board.id, columnId, card);
		const updatedBoard = this.plugin.dataManager.getBoardById(this.board.id);
		if (updatedBoard) {
			this.board = updatedBoard;
			this.renderBoard();
		}
	}

	async updateCard(card: Card, columnId: string): Promise<void> {
		await this.plugin.dataManager.updateCard(this.board.id, columnId, card);
		const updatedBoard = this.plugin.dataManager.getBoardById(this.board.id);
		if (updatedBoard) {
			this.board = updatedBoard;
			this.renderBoard();
		}
	}

	openNoteLink(notePath: string): void {
		const file = this.app.vault.getAbstractFileByPath(notePath);
		if (file) {
			this.app.workspace.openLinkText(notePath, '', true);
		}
	}

	// Selection management methods
	toggleCardSelection(cardId: string): void {
		if (this.selectedCards.has(cardId)) {
			this.selectedCards.delete(cardId);
		} else {
			this.selectedCards.add(cardId);
		}
		this.updateCardSelectionUI(cardId);
		this.updateBulkActionToolbar();
	}

	selectAllCards(): void {
		this.selectedCards.clear();
		// Add all card IDs from all columns
		for (const column of this.board.columns) {
			for (const card of column.cards) {
				this.selectedCards.add(card.id);
			}
		}
		this.renderBoard();
	}

	clearSelection(): void {
		this.selectedCards.clear();
		this.renderBoard();
	}

	private updateCardSelectionUI(cardId: string): void {
		const cardEl = this.containerEl.querySelector(`[data-card-id="${cardId}"]`);
		if (cardEl) {
			const checkbox = cardEl.querySelector('.crystal-card-checkbox') as HTMLInputElement;
			if (checkbox) {
				checkbox.checked = this.selectedCards.has(cardId);
			}
			
			if (this.selectedCards.has(cardId)) {
				cardEl.addClass('crystal-card-selected');
			} else {
				cardEl.removeClass('crystal-card-selected');
			}
		}
	}

	private renderBulkActionToolbar(contentEl: HTMLElement): void {
		const toolbarContainer = contentEl.createEl('div', { 
			cls: 'crystal-bulk-action-toolbar'
		});
		
		if (this.selectedCards.size === 0) {
			toolbarContainer.style.display = 'none';
		} else {
			toolbarContainer.style.display = 'flex';
		}

		// Selection info
		const selectionInfo = toolbarContainer.createEl('div', { 
			cls: 'crystal-selection-info',
			text: `${this.selectedCards.size} cards selected`
		});

		// Bulk actions
		const actionsContainer = toolbarContainer.createEl('div', { cls: 'crystal-bulk-actions' });

		// Select All button
		const selectAllBtn = actionsContainer.createEl('button', {
			text: 'Select All',
			cls: 'crystal-bulk-action-btn'
		});
		selectAllBtn.onclick = () => this.selectAllCards();

		// Clear Selection button
		const clearBtn = actionsContainer.createEl('button', {
			text: 'Clear',
			cls: 'crystal-bulk-action-btn'
		});
		clearBtn.onclick = () => this.clearSelection();

		// Move to Column button
		const moveBtn = actionsContainer.createEl('button', {
			text: '📁 Move',
			cls: 'crystal-bulk-action-btn'
		});
		moveBtn.onclick = () => this.openBulkMoveModal();

		// Manage Tags button
		const tagsBtn = actionsContainer.createEl('button', {
			text: '🏷️ Tags',
			cls: 'crystal-bulk-action-btn'
		});
		tagsBtn.onclick = () => this.openBulkTagModal();

		// Delete button
		const deleteBtn = actionsContainer.createEl('button', {
			text: '🗑️ Delete',
			cls: 'crystal-bulk-action-btn crystal-bulk-action-delete'
		});
		deleteBtn.onclick = () => this.confirmBulkDelete();
	}

	private updateBulkActionToolbar(): void {
		const toolbar = this.containerEl.querySelector('.crystal-bulk-action-toolbar');
		if (toolbar) {
			const selectionInfo = toolbar.querySelector('.crystal-selection-info');
			if (selectionInfo) {
				selectionInfo.textContent = `${this.selectedCards.size} cards selected`;
			}
			
			if (this.selectedCards.size === 0) {
				(toolbar as HTMLElement).style.display = 'none';
			} else {
				(toolbar as HTMLElement).style.display = 'flex';
			}
		}
	}

	// Bulk action methods
	async confirmBulkDelete(): Promise<void> {
		if (this.selectedCards.size === 0) return;

		const modal = new BulkDeleteModal(this.app, this.selectedCards.size, async () => {
			await this.executeBulkDelete();
		});
		modal.open();
	}

	private async executeBulkDelete(): Promise<void> {
		const selectedCardIds = Array.from(this.selectedCards);
		
		// Find and delete each selected card
		for (const column of this.board.columns) {
			const cardsToDelete = column.cards.filter(card => selectedCardIds.includes(card.id));
			for (const card of cardsToDelete) {
				await this.plugin.dataManager.removeCardFromColumn(this.board.id, column.id, card.id);
			}
		}

		this.selectedCards.clear();
		const updatedBoard = this.plugin.dataManager.getBoardById(this.board.id);
		if (updatedBoard) {
			this.board = updatedBoard;
			await this.renderBoard();
		}
	}

	private openBulkMoveModal(): void {
		if (this.selectedCards.size === 0) return;
		
		new BulkMoveModal(this.app, this.plugin, this.board, Array.from(this.selectedCards), async (targetColumnId) => {
			await this.executeBulkMove(targetColumnId);
		}).open();
	}

	private async executeBulkMove(targetColumnId: string): Promise<void> {
		const selectedCardIds = Array.from(this.selectedCards);
		const cardsToMove: { card: Card; sourceColumnId: string }[] = [];

		// Collect all cards to move
		for (const column of this.board.columns) {
			for (const card of column.cards) {
				if (selectedCardIds.includes(card.id)) {
					cardsToMove.push({ card, sourceColumnId: column.id });
				}
			}
		}

		// Move each card
		for (const { card, sourceColumnId } of cardsToMove) {
			if (sourceColumnId !== targetColumnId) {
				await this.plugin.dataManager.removeCardFromColumn(this.board.id, sourceColumnId, card.id);
				await this.plugin.dataManager.addCardToColumn(this.board.id, targetColumnId, card);
			}
		}

		this.selectedCards.clear();
		const updatedBoard = this.plugin.dataManager.getBoardById(this.board.id);
		if (updatedBoard) {
			this.board = updatedBoard;
			await this.renderBoard();
		}
	}

	private openBulkTagModal(): void {
		if (this.selectedCards.size === 0) return;
		
		new BulkTagModal(this.app, this.plugin, this.board, Array.from(this.selectedCards), async (action, tags) => {
			await this.executeBulkTagAction(action, tags);
		}).open();
	}

	private async executeBulkTagAction(action: 'add' | 'remove' | 'replace', tags: string[]): Promise<void> {
		const selectedCardIds = Array.from(this.selectedCards);

		for (const column of this.board.columns) {
			for (const card of column.cards) {
				if (selectedCardIds.includes(card.id)) {
					let updatedTags = [...card.tags];

					switch (action) {
						case 'add':
							// Add new tags that aren't already present
							for (const tag of tags) {
								if (!updatedTags.includes(tag)) {
									updatedTags.push(tag);
								}
							}
							break;
						case 'remove':
							// Remove specified tags
							updatedTags = updatedTags.filter(tag => !tags.includes(tag));
							break;
						case 'replace':
							// Replace all tags with new ones
							updatedTags = [...tags];
							break;
					}

					const updatedCard = { ...card, tags: updatedTags, modified: Date.now() };
					await this.plugin.dataManager.updateCard(this.board.id, column.id, updatedCard);
				}
			}
		}

		this.selectedCards.clear();
		const updatedBoard = this.plugin.dataManager.getBoardById(this.board.id);
		if (updatedBoard) {
			this.board = updatedBoard;
			await this.renderBoard();
		}
	}

	// Bulk action methods - removed duplicates

	private generateId(): string {
		return Math.random().toString(36).substr(2, 9);
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

class ColumnModal extends Modal {
	plugin: CrystalBoardsPlugin;
	board: Board;
	column: Column | null;
	onSubmit: (column: Column) => void;
	columnName = '';
	columnColor = '';

	constructor(
		app: App, 
		plugin: CrystalBoardsPlugin, 
		board: Board, 
		column: Column | null, 
		onSubmit: (column: Column) => void
	) {
		super(app);
		this.plugin = plugin;
		this.board = board;
		this.column = column;
		this.onSubmit = onSubmit;
		this.columnName = column?.name || '';
		this.columnColor = column?.color || this.plugin.settings.defaultColumnColors[0];
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: this.column ? 'Edit Column' : 'Add Column' });

		new Setting(contentEl)
			.setName('Column Name')
			.setDesc('Enter a name for the column')
			.addText((text) => {
				text.setPlaceholder('To Do')
					.setValue(this.columnName)
					.onChange((value) => {
						this.columnName = value;
					});
				text.inputEl.focus();
			});

		new Setting(contentEl)
			.setName('Column Color')
			.setDesc('Choose a background color for the column')
			.addColorPicker((colorPicker) => {
				colorPicker.setValue(this.columnColor)
					.onChange((value) => {
						this.columnColor = value;
					});
			});

		// Color presets
		const presetsContainer = contentEl.createEl('div', { cls: 'crystal-color-presets' });
		presetsContainer.createEl('h4', { text: 'Color Presets' });
		
		const presetsGrid = presetsContainer.createEl('div', { cls: 'crystal-color-presets-grid' });
		for (const color of this.plugin.settings.defaultColumnColors) {
			const presetBtn = presetsGrid.createEl('button', {
				cls: 'crystal-color-preset-btn'
			});
			presetBtn.style.backgroundColor = color;
			presetBtn.onclick = () => {
				this.columnColor = color;
				// Update the color picker
				contentEl.querySelector('input[type="color"]')?.setAttribute('value', color);
			};
		}

		new Setting(contentEl)
			.addButton((btn) => {
				btn.setButtonText('Cancel')
					.onClick(() => {
						this.close();
					});
			})
			.addButton((btn) => {
				btn.setButtonText(this.column ? 'Save Changes' : 'Add Column')
					.setCta()
					.onClick(() => {
						this.saveColumn();
					});
			});
	}

	saveColumn(): void {
		if (!this.columnName.trim()) {
			// TODO: Show error message
			return;
		}
		const column: Column = this.column ? {
			...this.column,
			name: this.columnName.trim(),
			color: this.columnColor
		} : {
			id: this.generateId(),
			name: this.columnName.trim(),
			color: this.columnColor,
			position: this.board.columns.length,
			cards: []
		};

		this.onSubmit(column);
		this.close();
	}

	private generateId(): string {
		return Math.random().toString(36).substr(2, 9);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// Bulk Action Modal Classes
class BulkDeleteModal extends Modal {
	private count: number;
	private onConfirm: () => Promise<void>;

	constructor(app: App, count: number, onConfirm: () => Promise<void>) {
		super(app);
		this.count = count;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Delete Selected Cards' });
		
		contentEl.createEl('p', { 
			text: `Are you sure you want to delete ${this.count} selected card(s)? This action cannot be undone.`
		});

		const buttonContainer = contentEl.createEl('div', { cls: 'modal-button-container' });
		
		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.onclick = () => this.close();
		
		const deleteBtn = buttonContainer.createEl('button', { 
			text: 'Delete Cards', 
			cls: 'mod-warning'
		});
		deleteBtn.onclick = async () => {
			await this.onConfirm();
			this.close();
		};
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class BulkMoveModal extends Modal {
	private plugin: CrystalBoardsPlugin;
	private board: Board;
	private selectedCardIds: string[];
	private onConfirm: (targetColumnId: string) => void;

	constructor(app: App, plugin: CrystalBoardsPlugin, board: Board, selectedCardIds: string[], onConfirm: (targetColumnId: string) => void) {
		super(app);
		this.plugin = plugin;
		this.board = board;
		this.selectedCardIds = selectedCardIds;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Move Selected Cards' });
		
		contentEl.createEl('p', { 
			text: `Move ${this.selectedCardIds.length} selected card(s) to:` 
		});

		const columnContainer = contentEl.createEl('div', { cls: 'crystal-column-selector' });
		
		for (const column of this.board.columns) {
			const columnBtn = columnContainer.createEl('button', {
				text: column.name,
				cls: 'crystal-column-option-btn'
			});
			columnBtn.style.backgroundColor = column.color;
			columnBtn.onclick = () => {
				this.onConfirm(column.id);
				this.close();
			};
		}

		const buttonContainer = contentEl.createEl('div', { cls: 'modal-button-container' });
		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.onclick = () => this.close();
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class BulkTagModal extends Modal {
	private plugin: CrystalBoardsPlugin;
	private board: Board;
	private selectedCardIds: string[];
	private onConfirm: (action: 'add' | 'remove' | 'replace', tags: string[]) => void;
	private tagInput: HTMLInputElement;
	private selectedAction: 'add' | 'remove' | 'replace' = 'add';

	constructor(app: App, plugin: CrystalBoardsPlugin, board: Board, selectedCardIds: string[], onConfirm: (action: 'add' | 'remove' | 'replace', tags: string[]) => void) {
		super(app);
		this.plugin = plugin;
		this.board = board;
		this.selectedCardIds = selectedCardIds;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Manage Tags' });
		
		contentEl.createEl('p', { 
			text: `Manage tags for ${this.selectedCardIds.length} selected card(s):` 
		});

		// Action selector
		const actionContainer = contentEl.createEl('div', { cls: 'crystal-tag-action-selector' });
		actionContainer.createEl('label', { text: 'Action:' });
		
		const actionSelect = actionContainer.createEl('select', { cls: 'crystal-tag-action-select' });
		
		const addOption = actionSelect.createEl('option', { value: 'add', text: 'Add tags' });
		const removeOption = actionSelect.createEl('option', { value: 'remove', text: 'Remove tags' });
		const replaceOption = actionSelect.createEl('option', { value: 'replace', text: 'Replace all tags' });
		
		actionSelect.onchange = () => {
			this.selectedAction = actionSelect.value as 'add' | 'remove' | 'replace';
		};

		// Tag input
		const inputContainer = contentEl.createEl('div', { cls: 'crystal-tag-input-container' });
		inputContainer.createEl('label', { text: 'Tags (comma-separated):' });
		
		this.tagInput = inputContainer.createEl('input', { 
			type: 'text',
			placeholder: 'tag1, tag2, tag3...',
			cls: 'crystal-tag-input'
		});

		// Existing tags for reference
		const existingTags = new Set<string>();
		for (const column of this.board.columns) {
			for (const card of column.cards) {
				if (this.selectedCardIds.includes(card.id)) {
					card.tags?.forEach(tag => existingTags.add(tag));
				}
			}
		}

		if (existingTags.size > 0) {
			const existingContainer = contentEl.createEl('div', { cls: 'crystal-existing-tags' });
			existingContainer.createEl('label', { text: 'Current tags on selected cards:' });
			const tagsList = existingContainer.createEl('div', { cls: 'crystal-tags-list' });
			
			Array.from(existingTags).forEach(tag => {
				const tagEl = tagsList.createEl('span', { 
					text: tag, 
					cls: 'crystal-tag-chip' 
				});
				tagEl.onclick = () => {
					const currentValue = this.tagInput.value;
					const tags = currentValue ? currentValue.split(',').map(t => t.trim()) : [];
					if (!tags.includes(tag)) {
						tags.push(tag);
						this.tagInput.value = tags.join(', ');
					}
				};
			});
		}

		const buttonContainer = contentEl.createEl('div', { cls: 'modal-button-container' });
		
		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.onclick = () => this.close();
		
		const confirmBtn = buttonContainer.createEl('button', { 
			text: 'Apply Changes', 
			cls: 'mod-cta' 
		});
		confirmBtn.onclick = () => {
			const tagText = this.tagInput.value.trim();
			if (tagText) {
				const tags = tagText.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
				if (tags.length > 0) {
					this.onConfirm(this.selectedAction, tags);
				}
			}
			this.close();
		};

		this.tagInput.focus();
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

export class CoverImageEditorModal extends Modal {
	plugin: CrystalBoardsPlugin;
	board: Board;
	coverEl: HTMLElement;
	onSubmit: (board: Board) => void;
	coverImagePosition: number;
	previewEl: HTMLElement | null = null;

	constructor(
		app: App,
		plugin: CrystalBoardsPlugin,
		board: Board,
		coverEl: HTMLElement,
		onSubmit: (board: Board) => void
	) {
		super(app);
		this.plugin = plugin;
		this.board = board;
		this.coverEl = coverEl;
		this.onSubmit = onSubmit;
		this.coverImagePosition = board.coverImagePosition ?? 50;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('crystal-cover-editor-modal');
		contentEl.createEl('h2', { text: 'Adjust Cover Image Position' });

		// Create preview container
		const previewContainer = contentEl.createEl('div', { cls: 'crystal-cover-preview-container' });
		this.previewEl = previewContainer.createEl('div', { cls: 'crystal-cover-preview' });
		
		// Set up the preview with the current image
		if (this.board.coverImage) {
			const file = this.app.vault.getAbstractFileByPath(this.board.coverImage);
			if (file instanceof TFile) {
				const url = this.app.vault.getResourcePath(file);
				this.previewEl.style.backgroundImage = `url(${url})`;
				this.previewEl.style.backgroundSize = 'cover';
				this.previewEl.style.backgroundRepeat = 'no-repeat';
				this.updatePreviewPosition(this.coverImagePosition);
			}
		}

		// Add position slider
		new Setting(contentEl)
			.setName('Vertical Position')
			.setDesc('Adjust the vertical position of the image')
			.addSlider((slider) => {
				slider.setLimits(0, 100, 1)
					.setValue(this.coverImagePosition)
					.setDynamicTooltip()
					.onChange((value) => {
						this.coverImagePosition = value;
						this.updatePreviewPosition(value);
						// Also update the actual cover in real-time
						this.updateActualCover(value);
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
				this.updatePreviewPosition(preset.value);
				this.updateActualCover(preset.value);
			};
		}

		// Action buttons
		new Setting(contentEl)
			.addButton((btn) => {
				btn.setButtonText('Cancel')
					.onClick(() => {
						// Reset to original position
						this.updateActualCover(this.board.coverImagePosition ?? 50);
						this.close();
					});
			})
			.addButton((btn) => {
				btn.setButtonText('Save Position')
					.setCta()
					.onClick(() => {
						this.savePosition();
					});
			});
	}

	updatePreviewPosition(value: number): void {
		if (this.previewEl) {
			this.previewEl.style.backgroundPosition = `center ${value}%`;
		}
	}

	updateActualCover(value: number): void {
		// Update the actual cover image in the board view for real-time preview
		if (this.coverEl) {
			this.coverEl.style.backgroundPosition = `center ${value}%`;
		}
	}

	savePosition(): void {
		const updatedBoard: Board = {
			...this.board,
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

