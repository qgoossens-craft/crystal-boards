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
}

export interface PluginSettings {
	kanbanFolderPath: string;
	defaultColumnColors: string[];
	showCoverImages: boolean;
	boardsPerRow: number;
	customPluginName: string;
	// Task extraction settings
	taskSourcePath?: string;
	autoExtractOnStartup?: boolean;
	extractedTaskPrefix?: string;
	smartExtractPrefix?: string;
	removeExtractedTasks?: boolean;
	tagMappingOverrides?: Record<string, string>;
	defaultExtractionBoard?: string;
	extractionColumnName?: string;
	// Smart Extract settings
	useSmartExtract?: boolean;
	openAIApiKey?: string;
	openAIModel?: 'gpt-3.5-turbo' | 'gpt-4' | 'gpt-4-turbo' | 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4.1' | 'gpt-4.1-mini' | 'gpt-4.1-nano' | 'gpt-5' | 'gpt-5-mini' | 'gpt-5-nano' | 'o3' | 'o3-mini' | 'o1' | 'o1-mini';
	smartExtractMaxTokens?: number;
	smartExtractTemperature?: number;
	useCustomPrompt?: boolean;
	customPrompt?: string;
	smartExtractConfidenceThreshold?: number;
	cacheAIResponses?: boolean;
	cacheDurationHours?: number;
}

// Theme-aware color palettes
// Universal colors that work beautifully on BOTH light and dark backgrounds
export const UNIVERSAL_COLORS = ['#F0D0D0', '#D0F0D5', '#D0E5F0', '#F0F0D0', '#E5D0F0'];
export const LIGHT_THEME_COLORS = UNIVERSAL_COLORS;
export const DARK_THEME_COLORS = UNIVERSAL_COLORS;
/**
 * Get theme-appropriate column colors based on current Obsidian theme
 */
export function getThemeAwareColors(): string[] {
	// Return universal colors that work beautifully on both light and dark backgrounds
	return UNIVERSAL_COLORS;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	kanbanFolderPath: 'Kanban',
	defaultColumnColors: LIGHT_THEME_COLORS,
	showCoverImages: true,
	boardsPerRow: 3,
	customPluginName: 'Crystal Boards',
	// Task extraction defaults
	taskSourcePath: '',
	autoExtractOnStartup: false,
	extractedTaskPrefix: '📥 ',
	smartExtractPrefix: '🤖 ',
	removeExtractedTasks: false,
	tagMappingOverrides: {},
	defaultExtractionBoard: 'Inbox',
	extractionColumnName: 'To Do',
	// Smart Extract defaults
	useSmartExtract: false,
	openAIApiKey: '',
	openAIModel: 'gpt-4.1-mini',
	smartExtractMaxTokens: 500,
	smartExtractTemperature: 0.7,
	useCustomPrompt: false,
	customPrompt: '',
	smartExtractConfidenceThreshold: 0.7,
	cacheAIResponses: true,
	cacheDurationHours: 24
};;

// View types
export const DASHBOARD_VIEW_TYPE = 'crystal-boards-dashboard';
export const BOARD_VIEW_TYPE = 'crystal-boards-board';