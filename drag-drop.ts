import CrystalBoardsPlugin from './main';
import { BoardView } from './board-view';

export class DragDropManager {
	private plugin: CrystalBoardsPlugin;
	private boardView: BoardView;
	private draggedCard: HTMLElement | null = null;
	private draggedCardId: string | null = null;
	private sourceColumnId: string | null = null;
	private dropZones: HTMLElement[] = [];

	constructor(plugin: CrystalBoardsPlugin, boardView: BoardView) {
		this.plugin = plugin;
		this.boardView = boardView;
	}

	enableDragAndDrop(): void {
		this.setupCardDragHandlers();
		this.setupDropZones();
	}

	disableDragAndDrop(): void {
		this.cleanup();
	}

	private setupCardDragHandlers(): void {
		const cards = document.querySelectorAll('.crystal-card');
		
		cards.forEach((card) => {
			const cardEl = card as HTMLElement;
			cardEl.draggable = true;
			
			cardEl.addEventListener('dragstart', (e) => this.handleDragStart(e));
			cardEl.addEventListener('dragend', (e) => this.handleDragEnd(e));
		});
	}

	private setupDropZones(): void {
		const columns = document.querySelectorAll('.crystal-column-cards');
		
		columns.forEach((column) => {
			const columnEl = column as HTMLElement;
			this.dropZones.push(columnEl);
			
			columnEl.addEventListener('dragover', (e) => this.handleDragOver(e));
			columnEl.addEventListener('dragenter', (e) => this.handleDragEnter(e));
			columnEl.addEventListener('dragleave', (e) => this.handleDragLeave(e));
			columnEl.addEventListener('drop', (e) => this.handleDrop(e));
		});
	}

	private handleDragStart(event: DragEvent): void {
		const target = event.target as HTMLElement;
		this.draggedCard = target;
		this.draggedCardId = target.getAttribute('data-card-id');
		
		// Find the source column
		const columnEl = target.closest('.crystal-column') as HTMLElement;
		this.sourceColumnId = columnEl?.getAttribute('data-column-id') || null;
		
		// Add visual feedback
		target.classList.add('crystal-card-dragging');
		
		// Set drag effect
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', this.draggedCardId || '');
		}
		
		// Add visual indicators to all drop zones
		this.dropZones.forEach(zone => {
			zone.classList.add('crystal-drop-zone-active');
		});
	}

	private handleDragEnd(event: DragEvent): void {
		const target = event.target as HTMLElement;
		target.classList.remove('crystal-card-dragging');
		
		// Remove visual indicators from all drop zones
		this.dropZones.forEach(zone => {
			zone.classList.remove('crystal-drop-zone-active', 'crystal-drop-zone-hover');
		});
		
		// Reset drag state
		this.draggedCard = null;
		this.draggedCardId = null;
		this.sourceColumnId = null;
	}

	private handleDragOver(event: DragEvent): void {
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
	}

	private handleDragEnter(event: DragEvent): void {
		event.preventDefault();
		const target = event.target as HTMLElement;
		const columnCardsEl = target.closest('.crystal-column-cards') as HTMLElement;
		
		if (columnCardsEl) {
			columnCardsEl.classList.add('crystal-drop-zone-hover');
		}
	}

	private handleDragLeave(event: DragEvent): void {
		const target = event.target as HTMLElement;
		const columnCardsEl = target.closest('.crystal-column-cards') as HTMLElement;
		
		// Only remove hover effect if we're actually leaving the drop zone
		if (columnCardsEl && !columnCardsEl.contains(event.relatedTarget as Node)) {
			columnCardsEl.classList.remove('crystal-drop-zone-hover');
		}
	}

	private async handleDrop(event: DragEvent): Promise<void> {
		event.preventDefault();
		
		const target = event.target as HTMLElement;
		const columnCardsEl = target.closest('.crystal-column-cards') as HTMLElement;
		const columnEl = target.closest('.crystal-column') as HTMLElement;
		
		if (!columnCardsEl || !columnEl || !this.draggedCardId || !this.sourceColumnId) {
			return;
		}
		
		const targetColumnId = columnEl.getAttribute('data-column-id');
		
		if (!targetColumnId) {
			return;
		}
		
		// Remove hover effect
		columnCardsEl.classList.remove('crystal-drop-zone-hover');
		
		// Don't do anything if dropped in the same column
		if (targetColumnId === this.sourceColumnId) {
			return;
		}
		
		// Calculate drop position
		const dropPosition = this.calculateDropPosition(event, columnCardsEl);
		
		try {
			// Move the card in the data
			await this.plugin.dataManager.moveCardBetweenColumns(
				this.boardView.board.id,
				this.draggedCardId,
				this.sourceColumnId,
				targetColumnId,
				dropPosition
			);
			
			// Update the board view
			const updatedBoard = this.plugin.dataManager.getBoardById(this.boardView.board.id);
			if (updatedBoard) {
				this.boardView.board = updatedBoard;
				await this.boardView.renderBoard();
				
				// Re-enable drag and drop after re-render
				setTimeout(() => {
					this.enableDragAndDrop();
				}, 100);
			}
			
		} catch (error) {
			console.error('Error moving card:', error);
		}
	}

	private calculateDropPosition(event: DragEvent, columnCardsEl: HTMLElement): number {
		const cards = Array.from(columnCardsEl.querySelectorAll('.crystal-card'));
		const afterElement = this.getDragAfterElement(columnCardsEl, event.clientY);
		
		if (afterElement == null) {
			return cards.length;
		} else {
			return cards.indexOf(afterElement);
		}
	}

	private getDragAfterElement(container: HTMLElement, y: number): HTMLElement | null {
		const draggableElements = Array.from(container.querySelectorAll('.crystal-card:not(.crystal-card-dragging)'));
		
		return draggableElements.reduce((closest, child) => {
			const box = child.getBoundingClientRect();
			const offset = y - box.top - box.height / 2;
			
			if (offset < 0 && offset > closest.offset) {
				return { offset: offset, element: child };
			} else {
				return closest;
			}
		}, { offset: Number.NEGATIVE_INFINITY, element: null }).element as HTMLElement | null;
	}

	private cleanup(): void {
		// Remove all event listeners
		const cards = document.querySelectorAll('.crystal-card');
		cards.forEach((card) => {
			const cardEl = card as HTMLElement;
			cardEl.draggable = false;
			cardEl.classList.remove('crystal-card-dragging');
		});
		
		this.dropZones.forEach(zone => {
			zone.classList.remove('crystal-drop-zone-active', 'crystal-drop-zone-hover');
		});
		
		this.dropZones = [];
		this.draggedCard = null;
		this.draggedCardId = null;
		this.sourceColumnId = null;
	}
}