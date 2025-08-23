import { DashboardView } from './dashboard-view';
import { Board } from './types';

export class DashboardDragDropHandler {
	private dashboardView: DashboardView;
	private draggedBoardId: string | null = null;
	private draggedElement: HTMLElement | null = null;
	private placeholder: HTMLElement | null = null;
	private dropZones: HTMLElement[] = [];

	constructor(dashboardView: DashboardView) {
		this.dashboardView = dashboardView;
	}

	initializeDragDrop(boardsContainer: HTMLElement): void {
		// Clear any existing setup
		this.cleanup();
		
		// Setup drop zone on the container
		this.setupDropZone(boardsContainer);
		
		// Setup drag handlers for all board cards
		this.setupBoardDragHandlers(boardsContainer);
	}

	private setupDropZone(boardsContainer: HTMLElement): void {
		this.dropZones.push(boardsContainer);
		
		boardsContainer.addEventListener('dragover', this.handleDragOver.bind(this));
		boardsContainer.addEventListener('dragenter', this.handleDragEnter.bind(this));
		boardsContainer.addEventListener('dragleave', this.handleDragLeave.bind(this));
		boardsContainer.addEventListener('drop', this.handleDrop.bind(this));
	}

	private setupBoardDragHandlers(boardsContainer: HTMLElement): void {
		const boardCards = boardsContainer.querySelectorAll('.crystal-board-card');
		
		boardCards.forEach((card) => {
			const cardEl = card as HTMLElement;
			cardEl.addEventListener('dragstart', this.handleDragStart.bind(this));
			cardEl.addEventListener('dragend', this.handleDragEnd.bind(this));
		});
	}

	makeBoardDraggable(boardElement: HTMLElement, board: Board): void {
		boardElement.setAttribute('draggable', 'true');
		boardElement.setAttribute('data-board-id', board.id);
		boardElement.classList.add('crystal-board-draggable');
		
		// Prevent default drag on action buttons
		const actionButtons = boardElement.querySelectorAll('.crystal-board-action-btn');
		actionButtons.forEach(button => {
			button.setAttribute('draggable', 'false');
			(button as HTMLElement).ondragstart = (e) => {
				e.preventDefault();
				e.stopPropagation();
				return false;
			};
		});
		
		console.log('Made board draggable:', board.id);
	}

	private handleDragStart(event: DragEvent): void {
		console.log('Board drag start triggered', event.target);
		const target = event.target as HTMLElement;
		const boardCard = target.closest('.crystal-board-card') as HTMLElement;
		
		// Don't start drag if clicking on action buttons
		if (target.closest('.crystal-board-actions')) {
			console.log('Drag prevented - action button clicked');
			event.preventDefault();
			return;
		}
		
		if (!boardCard || !boardCard.hasAttribute('data-board-id')) {
			console.log('Drag prevented - no valid board card');
			return;
		}
		
		const boardId = boardCard.getAttribute('data-board-id');
		console.log('Starting drag for board:', boardId);

		this.draggedBoardId = boardId;
		this.draggedElement = boardCard;

		// Add dragging class for visual feedback
		boardCard.classList.add('crystal-board-dragging');

		// Create placeholder
		this.createPlaceholder(boardCard);

		// Set drag data
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', this.draggedBoardId || '');
			console.log('Drag data set successfully');
		}

		// Add visual indicators to drop zones
		this.dropZones.forEach(zone => {
			zone.classList.add('crystal-drop-zone-active');
		});
	}

	private createPlaceholder(boardCard: HTMLElement): void {
		this.placeholder = boardCard.cloneNode(true) as HTMLElement;
		this.placeholder.classList.remove('crystal-board-dragging');
		this.placeholder.classList.add('crystal-board-placeholder');
		this.placeholder.removeAttribute('data-board-id');
		this.placeholder.style.pointerEvents = 'none';
		this.placeholder.setAttribute('draggable', 'false');
		console.log('Placeholder created:', this.placeholder);
	}

	private handleDragEnd(event: DragEvent): void {
		console.log('Board drag end triggered');
		const target = event.target as HTMLElement;
		target.classList.remove('crystal-board-dragging');
		
		// Remove visual indicators from all drop zones
		this.dropZones.forEach(zone => {
			zone.classList.remove('crystal-drop-zone-active', 'crystal-drop-zone-hover');
		});
		
		// Remove placeholder if it exists
		if (this.placeholder && this.placeholder.parentNode) {
			this.placeholder.parentNode.removeChild(this.placeholder);
		}
		
		// Reset drag state
		this.draggedBoardId = null;
		this.draggedElement = null;
		this.placeholder = null;
	}

	private handleDragOver(event: DragEvent): void {
		if (!this.draggedBoardId) return;

		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
	}

	private handleDragEnter(event: DragEvent): void {
		if (!this.draggedBoardId) return;
		
		event.preventDefault();
		const target = event.target as HTMLElement;
		const boardsGrid = target.closest('.crystal-boards-grid') as HTMLElement;
		
		if (boardsGrid) {
			boardsGrid.classList.add('crystal-drop-zone-hover');
			this.updatePlaceholderPosition(event, boardsGrid);
		}
	}

	private handleDragLeave(event: DragEvent): void {
		if (!this.draggedBoardId) return;
		
		const target = event.target as HTMLElement;
		const boardsGrid = target.closest('.crystal-boards-grid') as HTMLElement;
		
		// Only remove hover effect if we're actually leaving the drop zone
		if (boardsGrid && !boardsGrid.contains(event.relatedTarget as Node)) {
			boardsGrid.classList.remove('crystal-drop-zone-hover');
		}
	}

	private updatePlaceholderPosition(event: DragEvent, boardsGrid: HTMLElement): void {
		if (!this.placeholder) return;

		const target = event.target as HTMLElement;
		const boardCard = target.closest('.crystal-board-card') as HTMLElement;

		// Remove existing placeholder
		if (this.placeholder.parentNode) {
			this.placeholder.parentNode.removeChild(this.placeholder);
		}

		if (boardCard && boardCard !== this.draggedElement && !boardCard.classList.contains('crystal-board-dragging')) {
			const rect = boardCard.getBoundingClientRect();
			const centerX = rect.left + rect.width / 2;
			
			console.log('Updating placeholder position, mouse X:', event.clientX, 'center X:', centerX);
			
			if (event.clientX < centerX) {
				// Insert before
				console.log('Inserting placeholder before board card');
				boardCard.parentNode?.insertBefore(this.placeholder, boardCard);
			} else {
				// Insert after
				console.log('Inserting placeholder after board card');
				if (boardCard.nextSibling) {
					boardCard.parentNode?.insertBefore(this.placeholder, boardCard.nextSibling);
				} else {
					boardCard.parentNode?.appendChild(this.placeholder);
				}
			}
		} else {
			// If not over a board card, append to end of grid
			console.log('Inserting placeholder at end of grid');
			boardsGrid.appendChild(this.placeholder);
		}
	}

	private async handleDrop(event: DragEvent): Promise<void> {
		if (!this.draggedBoardId || !this.placeholder) return;

		event.preventDefault();
		console.log('Board drop event triggered');

		const boardsGrid = event.currentTarget as HTMLElement;
		boardsGrid.classList.remove('crystal-drop-zone-hover');
		
		// Get all board cards in their current DOM order (excluding dragged and placeholder)
		const allCards = Array.from(boardsGrid.querySelectorAll('.crystal-board-card:not(.crystal-board-placeholder):not(.crystal-board-dragging)')) as HTMLElement[];
		
		// Find the placeholder position relative to all children
		const allChildren = Array.from(boardsGrid.children);
		const placeholderIndex = allChildren.indexOf(this.placeholder);
		
		console.log('Placeholder index:', placeholderIndex);
		console.log('All cards count:', allCards.length);

		// Build new order array by inserting dragged board at placeholder position
		const newOrder: string[] = [];
		let insertedDraggedBoard = false;

		// Iterate through all positions including placeholder
		for (let i = 0; i < allChildren.length; i++) {
			const child = allChildren[i];
			
			if (child === this.placeholder) {
				// Insert dragged board at placeholder position
				if (this.draggedBoardId) {
					newOrder.push(this.draggedBoardId);
					insertedDraggedBoard = true;
					console.log('Inserted dragged board at position:', i);
				}
			} else if (child.classList.contains('crystal-board-card') && 
					   !child.classList.contains('crystal-board-dragging')) {
				// Add existing board (not the one being dragged)
				const boardId = child.getAttribute('data-board-id');
				if (boardId && boardId !== this.draggedBoardId) {
					newOrder.push(boardId);
				}
			}
		}

		// Fallback: if dragged board wasn't inserted yet, add it at the end
		if (!insertedDraggedBoard && this.draggedBoardId) {
			newOrder.push(this.draggedBoardId);
			console.log('Added dragged board at end as fallback');
		}

		console.log('New board order:', newOrder);

		try {
			// Update the order in data manager
			await this.dashboardView.plugin.dataManager.reorderBoards(newOrder);

			// Re-render the dashboard
			await this.dashboardView.renderDashboard();
			
			console.log('Board reordering completed successfully');
		} catch (error) {
			console.error('Error reordering boards:', error);
		}
	}

	cleanup(): void {
		// Remove event listeners from drop zones
		this.dropZones.forEach(zone => {
			zone.classList.remove('crystal-drop-zone-active', 'crystal-drop-zone-hover');
			// Note: We can't easily remove event listeners without keeping references
			// but since we're replacing the entire container content, this should be fine
		});
		
		this.dropZones = [];
		this.draggedBoardId = null;
		this.draggedElement = null;
		
		if (this.placeholder && this.placeholder.parentNode) {
			this.placeholder.parentNode.removeChild(this.placeholder);
		}
		this.placeholder = null;
	}
}