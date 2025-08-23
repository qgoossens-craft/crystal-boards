import { Plugin } from 'obsidian';
import { KanbanData, Board, Column, Card, PluginSettings, DEFAULT_SETTINGS } from './types';

export class DataManager {
	private plugin: Plugin;
	private data: KanbanData;

	constructor(plugin: Plugin) {
		this.plugin = plugin;
		this.data = {
			boards: [],
			settings: { ...DEFAULT_SETTINGS }
		};
	}

	async loadData(): Promise<void> {
		const savedData = await this.plugin.loadData();
		if (savedData) {
			// Migrate old data format
			const boards = savedData.boards || [];
			const migratedBoards = boards.map((board: any, index: number) => {
				const migratedColumns = board.columns.map((column: any) => {
					const migratedCards = column.cards.map((card: any) => {
						// Migrate old noteLink to noteLinks array
						if (card.noteLink && !card.noteLinks) {
							card = {
								...card,
								noteLinks: [card.noteLink],
								noteLink: undefined
							};
						}
						// Ensure noteLinks exists
						if (!card.noteLinks) {
							card.noteLinks = [];
						}
						// Migrate new card fields
						if (!card.todos) {
							card.todos = [];
						}
						if (!card.researchUrls) {
							card.researchUrls = [];
						}
						if (!card.description) {
							card.description = '';
						}
						return card;
					});
					return { ...column, cards: migratedCards };
				});
				// Migrate board position
				if (board.position === undefined) {
					board.position = index;
				}
				return { ...board, columns: migratedColumns };
			});

			// Sort boards by position
			migratedBoards.sort((a: Board, b: Board) => a.position - b.position);

			this.data = {
				boards: migratedBoards,
				settings: { ...DEFAULT_SETTINGS, ...savedData.settings }
			};
		}
	}

	async fixBoardPositions(): Promise<void> {
		// Fix any duplicate or missing positions
		this.data.boards.forEach((board, index) => {
			board.position = index;
			board.modified = Date.now();
		});
		
		// Sort boards by position
		this.data.boards.sort((a, b) => a.position - b.position);
		await this.saveData();
	}

	async saveData(): Promise<void> {
		await this.plugin.saveData(this.data);
	}

	getBoards(): Board[] {
		return this.data.boards.sort((a, b) => a.position - b.position);
	}

	getBoardById(id: string): Board | undefined {
		return this.data.boards.find(board => board.id === id);
	}

	async addBoard(board: Board): Promise<void> {
		this.data.boards.push(board);
		await this.saveData();
	}

	async updateBoard(updatedBoard: Board): Promise<void> {
		const index = this.data.boards.findIndex(board => board.id === updatedBoard.id);
		if (index !== -1) {
			this.data.boards[index] = { ...updatedBoard, modified: Date.now() };
			await this.saveData();
		}
	}

	async deleteBoard(id: string): Promise<void> {
		this.data.boards = this.data.boards.filter(board => board.id !== id);
		await this.saveData();
	}

	async reorderBoards(boardIds: string[]): Promise<void> {
		// Update positions based on new order
		boardIds.forEach((boardId, index) => {
			const board = this.getBoardById(boardId);
			if (board) {
				board.position = index;
				board.modified = Date.now();
			}
		});
		
		// Sort boards by position
		this.data.boards.sort((a, b) => a.position - b.position);
		await this.saveData();
	}

	async moveBoardLeft(boardId: string): Promise<boolean> {
		const board = this.getBoardById(boardId);
		if (!board || board.position === 0) return false;

		// Find the board to the left (lower position)
		const boardToLeft = this.data.boards.find(b => b.position === board.position - 1);
		if (!boardToLeft) return false;

		// Swap positions
		const originalPosition = board.position;
		board.position = boardToLeft.position;
		boardToLeft.position = originalPosition;

		// Update timestamps
		board.modified = Date.now();
		boardToLeft.modified = Date.now();

		// Sort boards by position
		this.data.boards.sort((a, b) => a.position - b.position);
		await this.saveData();
		return true;
	}

	async moveBoardRight(boardId: string): Promise<boolean> {
		const board = this.getBoardById(boardId);
		const maxPosition = this.data.boards.length - 1;
		if (!board || board.position === maxPosition) return false;

		// Find the board to the right (higher position)
		const boardToRight = this.data.boards.find(b => b.position === board.position + 1);
		if (!boardToRight) return false;

		// Swap positions
		const originalPosition = board.position;
		board.position = boardToRight.position;
		boardToRight.position = originalPosition;

		// Update timestamps
		board.modified = Date.now();
		boardToRight.modified = Date.now();

		// Sort boards by position
		this.data.boards.sort((a, b) => a.position - b.position);
		await this.saveData();
		return true;
	}

	getSettings(): PluginSettings {
		return this.data.settings;
	}

	async updateSettings(newSettings: Partial<PluginSettings>): Promise<void> {
		this.data.settings = { ...this.data.settings, ...newSettings };
		await this.saveData();
	}

	// Utility methods for board operations
	async moveCardBetweenColumns(
		boardId: string, 
		cardId: string, 
		fromColumnId: string, 
		toColumnId: string, 
		toPosition: number
	): Promise<void> {
		const board = this.getBoardById(boardId);
		if (!board) return;

		const fromColumn = board.columns.find(col => col.id === fromColumnId);
		const toColumn = board.columns.find(col => col.id === toColumnId);
		
		if (!fromColumn || !toColumn) return;

		const cardIndex = fromColumn.cards.findIndex(card => card.id === cardId);
		if (cardIndex === -1) return;

		const [card] = fromColumn.cards.splice(cardIndex, 1);
		toColumn.cards.splice(toPosition, 0, card);

		await this.updateBoard(board);
	}

	async addCardToColumn(boardId: string, columnId: string, card: Card): Promise<void> {
		const board = this.getBoardById(boardId);
		if (!board) return;

		const column = board.columns.find(col => col.id === columnId);
		if (!column) return;

		column.cards.push(card);
		await this.updateBoard(board);
	}

	async removeCardFromColumn(boardId: string, columnId: string, cardId: string): Promise<void> {
		const board = this.getBoardById(boardId);
		if (!board) return;

		const column = board.columns.find(col => col.id === columnId);
		if (!column) return;

		column.cards = column.cards.filter(card => card.id !== cardId);
		await this.updateBoard(board);
	}

	async updateCard(boardId: string, columnId: string, updatedCard: Card): Promise<void> {
		const board = this.getBoardById(boardId);
		if (!board) return;

		const column = board.columns.find(col => col.id === columnId);
		if (!column) return;

		const cardIndex = column.cards.findIndex(card => card.id === updatedCard.id);
		if (cardIndex === -1) return;

		updatedCard.modified = Date.now();
		column.cards[cardIndex] = updatedCard;
		await this.updateBoard(board);
	}



	async addColumnToBoard(boardId: string, column: Column): Promise<void> {
		const board = this.getBoardById(boardId);
		if (!board) return;

		board.columns.push(column);
		await this.updateBoard(board);
	}

	async removeColumnFromBoard(boardId: string, columnId: string): Promise<void> {
		const board = this.getBoardById(boardId);
		if (!board) return;

		board.columns = board.columns.filter(col => col.id !== columnId);
		// Reorder positions
		board.columns.forEach((col, index) => {
			col.position = index;
		});
		await this.updateBoard(board);
	}

	async updateColumn(boardId: string, updatedColumn: Column): Promise<void> {
		const board = this.getBoardById(boardId);
		if (!board) return;

		const columnIndex = board.columns.findIndex(col => col.id === updatedColumn.id);
		if (columnIndex === -1) return;

		board.columns[columnIndex] = updatedColumn;
		await this.updateBoard(board);
	}

	async reorderColumns(boardId: string, newOrder: string[]): Promise<void> {
		const board = this.getBoardById(boardId);
		if (!board) return;

		const reorderedColumns = newOrder.map((columnId, index) => {
			const column = board.columns.find(col => col.id === columnId);
			if (column) {
				return { ...column, position: index };
			}
			return null;
		}).filter(Boolean);

		if (reorderedColumns.length === board.columns.length) {
			board.columns = reorderedColumns as Column[];
			await this.updateBoard(board);
		}
	}
}