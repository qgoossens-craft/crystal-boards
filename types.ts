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
	// Enhanced features for AI summarization and note creation
	urls?: DetectedUrl[];
	aiSummary?: AISummary;
	linkedNoteId?: string; // ID of auto-created note
}

export interface DetectedUrl {
	id: string;
	url: string;
	title?: string;
	domain?: string;
	detected: number;
	description?: string; // Can contain summary from smart extract
}

export interface AISummary {
	id: string;
	content: string;
	sourceUrl: string;
	confidence: number;
	created: number;
	model?: string;
	tokens?: number;
}

export interface ResearchUrl {
	id: string;
	title: string;
	url: string;
	description?: string;
	created: number;
	// Link archiving and status
	status?: 'unread' | 'reading' | 'read' | 'archived';
	notes?: string;
	readDate?: number;
	importance?: 'low' | 'medium' | 'high';
	// Enhanced metadata (from LinkManager)
	_enhanced?: {
		category: string;
		icon: string;
		domain: string;
		previewData?: any;
	};
}

// Task extraction types
export interface ExtractedTask {
	text: string;
	cleanText: string; // Text without tags and URLs
	tags: string[];
	urls: { url: string; title: string }[];
	originalLine: string;
	lineNumber: number;
	hasHashtags?: boolean; // Flag to indicate if task has hashtags
}

export interface PluginSettings {
	kanbanFolderPath: string;

	showCoverImages: boolean;
	boardsPerRow: number;
	customPluginName: string;
	// Task extraction settings
	taskSourcePath?: string;
	autoExtractOnStartup?: boolean;
	extractedTaskPrefix?: string;
	removeExtractedTasks?: boolean;
	tagMappingOverrides?: Record<string, string>;
	defaultExtractionBoard?: string;
	extractionColumnName?: string;
	// Smart Extract settings
}



export const DEFAULT_SETTINGS: PluginSettings = {
	kanbanFolderPath: 'Kanban',

	showCoverImages: true,
	boardsPerRow: 3,
	customPluginName: 'Crystal Boards',
	// Task extraction defaults
	taskSourcePath: '',
	autoExtractOnStartup: false,
	extractedTaskPrefix: '📥 ',
	removeExtractedTasks: false,
	tagMappingOverrides: {},
	defaultExtractionBoard: 'Inbox',
	extractionColumnName: 'To Do',
	// Smart Extract defaults
};;

// View types
export const DASHBOARD_VIEW_TYPE = 'crystal-boards-dashboard';
export const BOARD_VIEW_TYPE = 'crystal-boards-board';