export interface KanbanData {
	boards: Board[];
	settings: PluginSettings;
}

export interface Board {
	id: string;
	name: string;
	folderPath: string;
	emoji?: string; // Board emoji instead of cover image
	coverImage?: string;
	coverImageAlignment?: 'center' | 'top' | 'bottom' | 'left' | 'right';
	coverImagePosition?: number; // 0-100, vertical position percentage
	position: number;
	columns: Column[];
	created: number;
	modified: number;
}

export interface Column {
	id: string;
	name: string;
	color: string;
	position: number;
	cards: Card[];
}

export interface Card {
	id: string;
	title: string;
	description?: string;
	tags: string[];
	noteLinks: string[];
	todos: TodoItem[];
	researchUrls: ResearchUrl[];
	created: number;
	modified: number;
}

export interface TodoItem {
	id: string;
	text: string;
	completed: boolean;
	created: number;
}

export interface ResearchUrl {
	id: string;
	title: string;
	url: string;
	description?: string;
	created: number;
}

export interface PluginSettings {
	kanbanFolderPath: string;
	defaultColumnColors: string[];
	showCoverImages: boolean;
	boardsPerRow: number;
	customPluginName: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	kanbanFolderPath: 'Kanban',
	defaultColumnColors: ['#e3f2fd', '#f3e5f5', '#e8f5e8', '#fff3e0', '#ffebee'],
	showCoverImages: true,
	boardsPerRow: 3,
	customPluginName: 'Crystal Boards'
};

// View types
export const DASHBOARD_VIEW_TYPE = 'crystal-boards-dashboard';
export const BOARD_VIEW_TYPE = 'crystal-boards-board';