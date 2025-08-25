import { App, Modal, Setting, TFile, MarkdownRenderer, Component, Notice } from 'obsidian';
import CrystalBoardsPlugin from './main';
import { Card, TodoItem, ResearchUrl, DetectedUrl, AISummary } from './types';
import { LinkManager } from './link-manager';
import { LinkPreviewManager } from './link-preview';

export class CardModal extends Modal {
	plugin: CrystalBoardsPlugin;
	card: Card;
	boardId: string;
	columnId: string;
	onSave: (card: Card) => void;
	
	private cardTitle: string;
	private cardDescription: string;
	private cardTags: string[];
	private cardNoteLinks: string[];
	private cardTodos: TodoItem[];
	private cardResearchUrls: ResearchUrl[];
	
	private noteSearchResults: TFile[] = [];
	private allMarkdownFiles: TFile[] = [];
	private linkManager: LinkManager;
	private linkPreviewManager: LinkPreviewManager;

	constructor(
		app: App, 
		plugin: CrystalBoardsPlugin, 
		card: Card, 
		boardId: string, 
		columnId: string, 
		onSave: (card: Card) => void
	) {
		super(app);
		this.plugin = plugin;
		this.card = card;
		this.boardId = boardId;
		this.columnId = columnId;
		this.onSave = onSave;
		
		// Initialize editable values
		this.cardTitle = card.title;
		this.cardDescription = card.description || '';
		this.cardTags = [...card.tags];
		this.cardNoteLinks = [...card.noteLinks];
		this.cardTodos = [...card.todos];
		this.cardResearchUrls = [...card.researchUrls];
		
		// Load all markdown files for note search
		this.allMarkdownFiles = this.app.vault.getMarkdownFiles();
		
		// Initialize link manager and preview
		this.linkManager = new LinkManager(app);
		this.linkPreviewManager = new LinkPreviewManager(app, this.linkManager);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		
		// Apply CSS class to the modal itself for proper styling
		this.modalEl.addClass('crystal-card-modal');

		// Modal header
		const headerEl = contentEl.createEl('div', { cls: 'crystal-card-modal-header' });
		headerEl.createEl('h2', { text: 'Edit Card', cls: 'crystal-card-modal-title' });

		// Progress indicator if there are todos
		if (this.cardTodos.length > 0) {
			this.renderProgressBar(headerEl);
		}

		// Scrollable content area
		const scrollEl = contentEl.createEl('div', { cls: 'crystal-card-modal-content' });

		// Section 1: Title (light background)
		const titleSection = scrollEl.createEl('div', { cls: 'crystal-modal-section crystal-section-light' });
		new Setting(titleSection)
			.setName('Title')
			.setDesc('Card title')
			.addText((text) => {
				text.setPlaceholder('Enter card title...')
					.setValue(this.cardTitle)
					.onChange((value) => {
						this.cardTitle = value;
					});
				text.inputEl.focus();
			});

		// Separator after Title
		scrollEl.createEl('div', { cls: 'crystal-section-separator' });

		// Section 2: Tags (dark background)
		const tagsSection = scrollEl.createEl('div', { cls: 'crystal-modal-section crystal-section-dark' });
		this.renderTagsSection(tagsSection);

		// Separator after Tags
		scrollEl.createEl('div', { cls: 'crystal-section-separator' });

		// Section 3: Description (PROMINENT - Most Important Section)
		const descriptionSection = scrollEl.createEl('div', { cls: 'crystal-modal-section crystal-section-description crystal-section-light' });
		
		// Custom description header with emphasis
		const descHeader = descriptionSection.createEl('div', { cls: 'crystal-description-header' });
		descHeader.createEl('h3', { 
			text: 'Description',
			cls: 'crystal-description-title'
		});
		descHeader.createEl('span', { 
			text: 'Primary content of the card',
			cls: 'crystal-description-subtitle'
		});
		
		// Large, prominent description area with markdown support
		const descContainer = descriptionSection.createEl('div', { cls: 'crystal-description-container' });
		
		// Create markdown display and edit elements
		const descDisplayDiv = descContainer.createEl('div', { cls: 'crystal-description-display' });
		const descTextarea = descContainer.createEl('textarea', {
			cls: 'crystal-description-textarea crystal-description-edit',
			placeholder: `Enter a detailed description of this card. This is the main content that will be displayed prominently in the card view.

You can include:
• Key objectives and goals
• Important context and background  
• Detailed requirements or specifications
• Any relevant notes or considerations`,
			value: this.cardDescription
		});
		
		// Initially hide the textarea
		descTextarea.style.display = 'none';
		
		// Set up markdown rendering
		const renderMarkdown = async () => {
			descDisplayDiv.empty();
			if (this.cardDescription.trim()) {
				await MarkdownRenderer.renderMarkdown(
					this.cardDescription, 
					descDisplayDiv, 
					'', 
					new Component()
				);
			} else {
				descDisplayDiv.createEl('div', {
					cls: 'crystal-description-placeholder',
					text: 'Click to add a description...'
				});
			}
		};
		
		// Initial render
		renderMarkdown();
		
		// Toggle between view and edit modes
		const switchToEditMode = () => {
			descTextarea.value = this.cardDescription; // Set current content
			descDisplayDiv.style.display = 'none';
			descTextarea.style.display = 'block';
			descTextarea.style.minHeight = '200px';
			autoResize(); // Resize to fit content
			updateCharCount(); // Update character count
			descTextarea.focus();
		};
		
		const switchToViewMode = () => {
			this.cardDescription = descTextarea.value;
			descTextarea.style.display = 'none';
			descDisplayDiv.style.display = 'block';
			renderMarkdown();
		};
		
		// Click display to edit
		descDisplayDiv.addEventListener('click', switchToEditMode);
		
		// Auto-resize textarea
		const autoResize = () => {
			descTextarea.style.height = 'auto';
			const scrollHeight = descTextarea.scrollHeight;
			descTextarea.style.height = Math.min(scrollHeight, 500) + 'px';
		};
		
		// Initial resize
		setTimeout(autoResize, 0);
		
		// Updated event handlers for markdown mode
		descTextarea.addEventListener('input', () => {
			this.cardDescription = descTextarea.value;
			autoResize();
			updateCharCount();
		});
		
		// Exit edit mode on blur or Escape
		descTextarea.addEventListener('blur', switchToViewMode);
		descTextarea.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				switchToViewMode();
			}
		});
		
		// Character count indicator
		const charCount = descContainer.createEl('div', { cls: 'crystal-description-char-count' });
		const updateCharCount = () => {
			const count = this.cardDescription.length;
			charCount.textContent = `${count} characters`;
			if (count === 0) {
				charCount.addClass('empty');
			} else {
				charCount.removeClass('empty');
			}
		};
		updateCharCount();

		// Separator after Description (with extra margin since this is important)
		const separator = scrollEl.createEl('div', { cls: 'crystal-section-separator crystal-separator-important' });

		// Section 4: Linked Notes (dark background)
		const notesSection = scrollEl.createEl('div', { cls: 'crystal-modal-section crystal-section-dark' });
		this.renderNotesSection(notesSection);

		// Separator after Linked Notes
		scrollEl.createEl('div', { cls: 'crystal-section-separator' });

		// Section 5: Todos (light background)
		const todosSection = scrollEl.createEl('div', { cls: 'crystal-modal-section crystal-section-light' });
		this.renderTodosSection(todosSection);

		// Separator after Todos
		scrollEl.createEl('div', { cls: 'crystal-section-separator' });

		// Section 6: Research URLs (dark background)
		const urlsSection = scrollEl.createEl('div', { cls: 'crystal-modal-section crystal-section-dark' });
		this.renderResearchSection(urlsSection);

		// Modal footer with buttons
		const footerEl = contentEl.createEl('div', { cls: 'crystal-card-modal-footer' });
		
		const cancelBtn = footerEl.createEl('button', {
			text: 'Cancel',
			cls: 'crystal-modal-btn'
		});
		cancelBtn.onclick = () => this.close();

		const saveBtn = footerEl.createEl('button', {
			text: 'Save Changes',
			cls: 'crystal-modal-btn crystal-modal-btn-primary'
		});
		saveBtn.onclick = () => this.saveCard();
	}

	private renderProgressBar(container: HTMLElement): void {
		const completedTodos = this.cardTodos.filter(todo => todo.completed).length;
		const totalTodos = this.cardTodos.length;
		const percentage = totalTodos > 0 ? (completedTodos / totalTodos) * 100 : 0;

		const progressContainer = container.createEl('div', { cls: 'crystal-progress-container' });
		
		const progressBar = progressContainer.createEl('div', { cls: 'crystal-progress-bar' });
		const progressFill = progressBar.createEl('div', { cls: 'crystal-progress-fill' });
		progressFill.style.width = `${percentage}%`;
		
		progressContainer.createEl('div', { 
			cls: 'crystal-progress-text',
			text: `${completedTodos}/${totalTodos} tasks completed (${Math.round(percentage)}%)`
		});
	}

	private renderTagsSection(container: HTMLElement): void {
		const section = container.createEl('div', { cls: 'crystal-card-section' });
		section.createEl('h3', { text: 'Tags', cls: 'crystal-section-title' });

		// Current tags display
		const tagsDisplay = section.createEl('div', { cls: 'crystal-tags-display' });
		this.updateTagsDisplay(tagsDisplay);

		// Add tag input
		new Setting(section)
			.setName('Add Tag')
			.addText((text) => {
				text.setPlaceholder('Enter tag name...')
					.onChange((value) => {
						// Auto-complete could be added here
					});
				
				text.inputEl.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						const tagName = text.getValue().trim();
						if (tagName && !this.cardTags.includes(tagName)) {
							this.cardTags.push(tagName);
							this.updateTagsDisplay(tagsDisplay);
							text.setValue('');
						}
					}
				});
			})
			.addButton((btn) => {
				btn.setButtonText('Add')
					.onClick(() => {
						const input = section.querySelector('input') as HTMLInputElement;
						const tagName = input.value.trim();
						if (tagName && !this.cardTags.includes(tagName)) {
							this.cardTags.push(tagName);
							this.updateTagsDisplay(tagsDisplay);
							input.value = '';
						}
					});
			});
	}

	private updateTagsDisplay(container: HTMLElement): void {
		container.empty();
		
		if (this.cardTags.length === 0) {
			container.createEl('div', { 
				text: 'No tags added yet',
				cls: 'crystal-empty-state'
			});
			return;
		}

		this.cardTags.forEach((tag, index) => {
			const tagEl = container.createEl('span', { cls: 'crystal-tag' });
			tagEl.createEl('span', { text: tag });
			
			const removeBtn = tagEl.createEl('button', {
				text: '×',
				cls: 'crystal-tag-remove'
			});
			removeBtn.onclick = () => {
				this.cardTags.splice(index, 1);
				this.updateTagsDisplay(container);
			};
		});
	}

	private renderNotesSection(container: HTMLElement): void {
		const section = container.createEl('div', { cls: 'crystal-card-section' });
		section.createEl('h3', { text: 'Linked Notes', cls: 'crystal-section-title' });

		// Current notes display
		const notesDisplay = section.createEl('div', { cls: 'crystal-notes-display' });
		this.updateNotesDisplay(notesDisplay);

		// Enhanced note search container
		const searchContainer = section.createEl('div', { cls: 'crystal-note-search-container' });
		
		// Search header
		const searchHeader = searchContainer.createEl('div', { cls: 'crystal-search-header' });
		searchHeader.createEl('h4', { 
			text: '🔗 Link a Note', 
			cls: 'crystal-search-title' 
		});
		searchHeader.createEl('span', { 
			text: 'Search your vault to connect relevant notes', 
			cls: 'crystal-search-subtitle' 
		});

		// Search input with enhanced styling
		const inputContainer = searchContainer.createEl('div', { cls: 'crystal-search-input-container' });
		
		const searchIcon = inputContainer.createEl('span', { 
			cls: 'crystal-search-icon',
			text: '🔍'
		});
		
		const searchInput = inputContainer.createEl('input', {
			type: 'text',
			cls: 'crystal-search-input',
			placeholder: 'Search notes by name, path, or content...',
			attr: {
				'autocomplete': 'off',
				'spellcheck': 'false'
			}
		});

		const clearBtn = inputContainer.createEl('button', {
			cls: 'crystal-search-clear',
			text: '×',
			attr: { 'aria-label': 'Clear search' }
		});
		clearBtn.style.display = 'none';

		// Search results container with loading state
		const resultsContainer = searchContainer.createEl('div', { cls: 'crystal-search-results-container' });
		
		// Search status/help text
		const searchStatus = resultsContainer.createEl('div', { cls: 'crystal-search-status' });

		// Keyboard navigation state
		let selectedIndex = -1;
		let searchTimeout: NodeJS.Timeout | null = null;

		// Enhanced search functionality
		const performSearch = async (searchTerm: string) => {
			// Clear previous timeout
			if (searchTimeout) {
				clearTimeout(searchTimeout);
			}

			// Update UI state
			clearBtn.style.display = searchTerm ? 'block' : 'none';
			searchIcon.textContent = searchTerm ? '⏳' : '🔍';
			selectedIndex = -1;

			// Clear results
			const existingResults = resultsContainer.querySelector('.crystal-search-results');
			if (existingResults) {
				existingResults.remove();
			}

			if (!searchTerm.trim()) {
				// Show recently modified notes when no search term
				this.showRecentNotes(resultsContainer, searchStatus);
				return;
			}

			// Show searching state
			searchStatus.textContent = 'Searching...';
			searchStatus.className = 'crystal-search-status searching';

			// Debounce search
			searchTimeout = setTimeout(async () => {
				try {
					const results = await this.performEnhancedSearch(searchTerm);
					this.displaySearchResults(results, resultsContainer, searchStatus, searchInput);
					searchIcon.textContent = '🔍';
				} catch (error) {
					console.error('Search error:', error);
					searchStatus.textContent = 'Search failed. Please try again.';
					searchStatus.className = 'crystal-search-status error';
					searchIcon.textContent = '⚠️';
				}
			}, 300);
		};

		// Event listeners
		searchInput.addEventListener('input', (e) => {
			const target = e.target as HTMLInputElement;
			performSearch(target.value);
		});

		searchInput.addEventListener('focus', () => {
			if (!searchInput.value.trim()) {
				this.showRecentNotes(resultsContainer, searchStatus);
			}
		});

		// Clear button functionality
		clearBtn.addEventListener('click', () => {
			searchInput.value = '';
			searchInput.focus();
			performSearch('');
		});

		// Keyboard navigation
		searchInput.addEventListener('keydown', (e) => {
			const results = resultsContainer.querySelectorAll('.crystal-search-result');
			
			switch (e.key) {
				case 'ArrowDown':
					e.preventDefault();
					selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
					this.updateSelection(results, selectedIndex);
					break;
				case 'ArrowUp':
					e.preventDefault();
					selectedIndex = Math.max(selectedIndex - 1, -1);
					this.updateSelection(results, selectedIndex);
					break;
				case 'Enter':
					e.preventDefault();
					if (selectedIndex >= 0 && results[selectedIndex]) {
						(results[selectedIndex] as HTMLElement).click();
					}
					break;
				case 'Escape':
					e.preventDefault();
					searchInput.blur();
					const existingResults = resultsContainer.querySelector('.crystal-search-results');
					if (existingResults) {
						existingResults.remove();
					}
					searchStatus.textContent = '';
					break;
			}
		});

		// Initial state - show recent notes
		this.showRecentNotes(resultsContainer, searchStatus);
	}

	private updateNotesDisplay(container: HTMLElement): void {
		container.empty();
		
		if (this.cardNoteLinks.length === 0) {
			container.createEl('div', { 
				text: 'No notes linked yet',
				cls: 'crystal-empty-state'
			});
			return;
		}

		this.cardNoteLinks.forEach((notePath, index) => {
			const file = this.app.vault.getAbstractFileByPath(notePath);
			if (file instanceof TFile) {
				const noteEl = container.createEl('div', { cls: 'crystal-linked-note' });
				
				const noteLink = noteEl.createEl('a', {
					text: file.basename,
					cls: 'crystal-note-link'
				});
				noteLink.onclick = () => {
					// Open in right pane
					this.app.workspace.getLeaf('split', 'vertical').openFile(file);
				};
				
				// Add hover preview functionality
				this.createNoteHoverPreview(noteLink, file);
				
				const removeBtn = noteEl.createEl('button', {
					text: '×',
					cls: 'crystal-note-remove'
				});
				removeBtn.onclick = () => {
					this.cardNoteLinks.splice(index, 1);
					this.updateNotesDisplay(container);
				};
			}
		});
	}

	private async performEnhancedSearch(searchTerm: string): Promise<any[]> {
		const searchTermLower = searchTerm.toLowerCase();
		const results: any[] = [];

		// First, search by filename (highest priority)
		const filenameMatches = this.allMarkdownFiles
			.filter(file => !this.cardNoteLinks.includes(file.path))
			.map(file => {
				const nameScore = this.calculateMatchScore(file.basename.toLowerCase(), searchTermLower);
				const pathScore = this.calculateMatchScore(file.path.toLowerCase(), searchTermLower);
				return {
					file,
					score: Math.max(nameScore, pathScore),
					matchType: nameScore > pathScore ? 'name' : 'path',
					preview: ''
				};
			})
			.filter(result => result.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, 12);

		// Add content search for top filename matches
		for (const result of filenameMatches.slice(0, 8)) {
			try {
				const content = await this.app.vault.read(result.file);
				const contentMatch = this.findContentMatch(content, searchTerm);
				if (contentMatch.found || result.score > 0.3) {
					result.preview = contentMatch.preview;
					result.contentScore = contentMatch.score;
					result.totalScore = result.score + (contentMatch.score * 0.3);
					results.push(result);
				}
			} catch (error) {
				// Still include if filename matched well
				if (result.score > 0.3) {
					result.preview = 'Unable to preview content';
					results.push(result);
				}
			}
		}

		// Sort by total score
		results.sort((a, b) => (b.totalScore || b.score) - (a.totalScore || a.score));

		return results.slice(0, 8);
	}

	private displaySearchResults(results: any[], container: HTMLElement, statusEl: HTMLElement, searchInput: HTMLInputElement): void {
		// Remove existing results
		const existingResults = container.querySelector('.crystal-search-results');
		if (existingResults) {
			existingResults.remove();
		}

		if (results.length === 0) {
			statusEl.textContent = 'No matching notes found. Try a different search term.';
			statusEl.className = 'crystal-search-status empty';
			return;
		}

		statusEl.textContent = `Found ${results.length} matching note${results.length === 1 ? '' : 's'}`;
		statusEl.className = 'crystal-search-status success';

		const resultsEl = container.createEl('div', { cls: 'crystal-search-results' });

		results.forEach((result, index) => {
			const resultEl = resultsEl.createEl('div', { cls: 'crystal-search-result' });
			
			// Note icon and title
			const headerEl = resultEl.createEl('div', { cls: 'crystal-result-header' });
			
			const iconEl = headerEl.createEl('span', { cls: 'crystal-result-icon' });
			iconEl.textContent = this.getNoteIcon(result.file);
			
			const titleEl = headerEl.createEl('span', { 
				cls: 'crystal-result-title',
				text: result.file.basename 
			});
			
			// Match type indicator
			const matchEl = headerEl.createEl('span', { cls: 'crystal-result-match-type' });
			matchEl.textContent = result.matchType === 'name' ? '📝 Name' : 
								 result.matchType === 'path' ? '📁 Path' : '📄 Content';
			
			// Path
			const pathEl = resultEl.createEl('div', { 
				cls: 'crystal-result-path',
				text: result.file.path 
			});
			
			// Preview
			if (result.preview) {
				const previewEl = resultEl.createEl('div', { 
					cls: 'crystal-result-preview',
					text: result.preview 
				});
			}

			// Metadata
			const metaEl = resultEl.createEl('div', { cls: 'crystal-result-metadata' });
			const lastModified = new Date(result.file.stat.mtime);
			metaEl.createEl('span', { 
				cls: 'crystal-result-date',
				text: `Modified: ${this.formatDate(lastModified)}`
			});
			
			// Click handler
			resultEl.addEventListener('click', () => {
				this.addNoteLink(result.file, container, searchInput);
			});

			// Keyboard selection support
			resultEl.addEventListener('mouseenter', () => {
				// Update selection on hover
				const allResults = resultsEl.querySelectorAll('.crystal-search-result');
				allResults.forEach(r => r.classList.remove('selected'));
				resultEl.classList.add('selected');
			});
		});
	}

	private showRecentNotes(container: HTMLElement, statusEl: HTMLElement): void {
		// Remove existing results
		const existingResults = container.querySelector('.crystal-search-results');
		if (existingResults) {
			existingResults.remove();
		}

		// Get recently modified notes
		const recentNotes = this.allMarkdownFiles
			.filter(file => !this.cardNoteLinks.includes(file.path))
			.sort((a, b) => b.stat.mtime - a.stat.mtime)
			.slice(0, 6);

		if (recentNotes.length === 0) {
			statusEl.textContent = 'No notes available to link.';
			statusEl.className = 'crystal-search-status empty';
			return;
		}

		statusEl.textContent = 'Recently modified notes - or start typing to search';
		statusEl.className = 'crystal-search-status recent';

		const resultsEl = container.createEl('div', { cls: 'crystal-search-results recent-notes' });

		recentNotes.forEach(file => {
			const resultEl = resultsEl.createEl('div', { cls: 'crystal-search-result recent-note' });
			
			const headerEl = resultEl.createEl('div', { cls: 'crystal-result-header' });
			
			const iconEl = headerEl.createEl('span', { cls: 'crystal-result-icon' });
			iconEl.textContent = this.getNoteIcon(file);
			
			const titleEl = headerEl.createEl('span', { 
				cls: 'crystal-result-title',
				text: file.basename 
			});

			const recentEl = headerEl.createEl('span', { 
				cls: 'crystal-recent-indicator',
				text: '🕒 Recent'
			});
			
			const pathEl = resultEl.createEl('div', { 
				cls: 'crystal-result-path',
				text: file.path 
			});

			const metaEl = resultEl.createEl('div', { cls: 'crystal-result-metadata' });
			const lastModified = new Date(file.stat.mtime);
			metaEl.createEl('span', { 
				cls: 'crystal-result-date',
				text: `Modified: ${this.formatDate(lastModified)}`
			});
			
			resultEl.addEventListener('click', () => {
				const searchInput = container.closest('.crystal-note-search-container')?.querySelector('.crystal-search-input') as HTMLInputElement;
				this.addNoteLink(file, container, searchInput);
			});
		});
	}

	private addNoteLink(file: any, container: HTMLElement, searchInput: HTMLInputElement): void {
		if (!this.cardNoteLinks.includes(file.path)) {
			this.cardNoteLinks.push(file.path);
			
			// Update notes display
			const notesDisplay = container.closest('.crystal-card-section')?.querySelector('.crystal-notes-display') as HTMLElement;
			if (notesDisplay) {
				this.updateNotesDisplay(notesDisplay);
			}
			
			// Clear search and hide results
			searchInput.value = '';
			const resultsContainer = container.closest('.crystal-note-search-container')?.querySelector('.crystal-search-results-container') as HTMLElement;
			const existingResults = resultsContainer?.querySelector('.crystal-search-results');
			if (existingResults) {
				existingResults.remove();
			}
			
			// Show recent notes again
			const statusEl = resultsContainer?.querySelector('.crystal-search-status') as HTMLElement;
			if (statusEl && resultsContainer) {
				this.showRecentNotes(resultsContainer, statusEl);
			}

			// Focus back to search for easy addition of more notes
			setTimeout(() => searchInput.focus(), 100);
		}
	}

	private updateSelection(results: NodeListOf<Element>, selectedIndex: number): void {
		results.forEach((result, index) => {
			if (index === selectedIndex) {
				result.classList.add('selected');
				result.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
			} else {
				result.classList.remove('selected');
			}
		});
	}

	private getNoteIcon(file: any): string {
		// Simple logic to assign icons based on filename or path
		const name = file.basename.toLowerCase();
		const path = file.path.toLowerCase();
		
		if (name.includes('todo') || name.includes('task')) return '✅';
		if (name.includes('idea') || name.includes('brainstorm')) return '💡';
		if (name.includes('meeting') || name.includes('notes')) return '📝';
		if (name.includes('project')) return '🚀';
		if (name.includes('research')) return '🔬';
		if (path.includes('daily') || path.includes('journal')) return '📅';
		if (path.includes('template')) return '📋';
		
		return '📄';
	}

	private formatDate(date: Date): string {
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
		
		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Yesterday';
		if (diffDays < 7) return `${diffDays} days ago`;
		if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
		if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
		
		return date.toLocaleDateString();
	}

	private calculateMatchScore(text: string, searchTerm: string): number {
		if (!text || !searchTerm) return 0;

		// Exact match
		if (text === searchTerm) return 1.0;
		
		// Starts with
		if (text.startsWith(searchTerm)) return 0.9;
		
		// Contains as whole word
		const wordBoundary = new RegExp(`\\b${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
		if (wordBoundary.test(text)) return 0.8;
		
		// Contains substring
		if (text.includes(searchTerm)) return 0.6;
		
		// Fuzzy match (simple)
		let score = 0;
		let searchIndex = 0;
		for (let i = 0; i < text.length && searchIndex < searchTerm.length; i++) {
			if (text[i] === searchTerm[searchIndex]) {
				searchIndex++;
				score += 1;
			}
		}
		
		if (searchIndex === searchTerm.length) {
			return 0.3 * (score / text.length);
		}
		
		return 0;
	}

	private findContentMatch(content: string, searchTerm: string): { found: boolean; score: number; preview: string } {
		const searchTermLower = searchTerm.toLowerCase();
		const contentLower = content.toLowerCase();
		
		if (!contentLower.includes(searchTermLower)) {
			return { found: false, score: 0, preview: this.getContentPreview(content) };
		}

		const index = contentLower.indexOf(searchTermLower);
		const lineStart = Math.max(0, content.lastIndexOf('\n', index - 1) + 1);
		const lineEnd = content.indexOf('\n', index + searchTerm.length);
		const line = content.substring(lineStart, lineEnd !== -1 ? lineEnd : content.length);
		
		// Extract context around match
		const previewStart = Math.max(0, index - 50);
		const previewEnd = Math.min(content.length, index + searchTerm.length + 50);
		let preview = content.substring(previewStart, previewEnd).trim();
		
		// Add ellipsis if truncated
		if (previewStart > 0) preview = '...' + preview;
		if (previewEnd < content.length) preview = preview + '...';
		
		return {
			found: true,
			score: 0.5,
			preview: preview || line.trim()
		};
	}

	private getContentPreview(content: string): string {
		// Get first meaningful line
		const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
		return lines[0]?.trim().substring(0, 100) + (lines[0]?.length > 100 ? '...' : '') || 'Empty note';
	}

	private renderTodosSection(container: HTMLElement): void {
		const section = container.createEl('div', { cls: 'crystal-card-section' });
		const titleContainer = section.createEl('div', { cls: 'crystal-section-title-container' });
		titleContainer.createEl('h3', { text: 'Tasks', cls: 'crystal-section-title' });
		
		// Add todo button
		const addBtn = titleContainer.createEl('button', {
			text: '+ Add Task',
			cls: 'crystal-add-btn'
		});
		addBtn.onclick = () => this.addNewTodo(section);

		// Add sample todo button for testing AI features
		const sampleBtn = titleContainer.createEl('button', {
			text: '🧪 Test AI Todo',
			cls: 'crystal-add-btn crystal-sample-btn'
		});
		sampleBtn.onclick = () => this.addSampleTodo(section);
		sampleBtn.style.marginLeft = '0.5rem';
		sampleBtn.style.fontSize = '0.8rem';
		sampleBtn.style.padding = '0.3rem 0.6rem';

		// Todos display
		const todosDisplay = section.createEl('div', { cls: 'crystal-todos-display' });
		this.updateTodosDisplay(todosDisplay);
	}

	/**
	 * Render the Research URLs section
	 */
	private renderResearchSection(container: HTMLElement): void {
		// Section header
		const headerEl = container.createEl('div', { cls: 'crystal-section-header' });
		const titleEl = headerEl.createEl('h3', { text: '🔗 Research URLs', cls: 'crystal-section-title' });
		
		// Add URL button
		const addUrlBtn = headerEl.createEl('button', {
			text: '+ Add URL',
			cls: 'crystal-add-url-btn'
		});
		addUrlBtn.onclick = () => this.addNewResearchUrl(container);

		// URLs display container
		const urlsContainer = container.createEl('div', { cls: 'crystal-urls-container' });
		this.updateUrlsDisplay(urlsContainer);
	}

	/**
	 * Update the URLs display
	 */
	private updateUrlsDisplay(container: HTMLElement): void {
		container.empty();

		if (this.cardResearchUrls.length === 0) {
			const emptyState = container.createEl('div', {
				text: 'No research URLs added yet. Click "Add URL" to add research links.',
				cls: 'crystal-empty-state'
			});
			return;
		}

		// Display each URL
		this.cardResearchUrls.forEach((url, index) => {
			this.renderResearchUrl(container, url, index);
		});
	}

	/**
	 * Render a single research URL
	 */
	private renderResearchUrl(container: HTMLElement, url: ResearchUrl, index: number): void {
		const urlEl = container.createEl('div', { 
			cls: 'crystal-url-item',
			attr: { 'data-url-index': index.toString() }
		});

		// URL info section
		const infoEl = urlEl.createEl('div', { cls: 'crystal-url-info' });
		
		// Header with favicon and title
		const headerEl = infoEl.createEl('div', { cls: 'crystal-url-header' });
		
		// Favicon
		if (url.url && url.url.trim()) {
			try {
				const faviconEl = headerEl.createEl('img', {
					cls: 'crystal-url-favicon',
					attr: {
						'src': `https://www.google.com/s2/favicons?domain=${new URL(url.url).hostname}&sz=16`,
						'alt': 'Site favicon',
						'width': '16',
						'height': '16'
					}
				});
				faviconEl.onerror = () => {
					// Fallback to a generic link icon if favicon fails to load
					faviconEl.style.display = 'none';
					const fallbackIcon = headerEl.createEl('span', { 
						text: '🔗', 
						cls: 'crystal-url-fallback-icon' 
					});
					headerEl.insertBefore(fallbackIcon, faviconEl.nextSibling);
				};
			} catch (e) {
				// Invalid URL, show fallback icon
				headerEl.createEl('span', { 
					text: '🔗', 
					cls: 'crystal-url-fallback-icon' 
				});
			}
		}

		// Title (editable) - will be auto-populated with actual page title
		const titleInput = headerEl.createEl('input', {
			type: 'text',
			cls: 'crystal-url-title',
			value: url.title || '',
			placeholder: 'Loading title...'
		});
		titleInput.onchange = () => {
			this.cardResearchUrls[index].title = titleInput.value;
		};

		// AI Summary field (auto-populated)
		const summaryEl = infoEl.createEl('div', { cls: 'crystal-url-summary' });
		const summaryText = summaryEl.createEl('div', {
			text: url.description || 'Loading summary...',
			cls: 'crystal-url-summary-text'
		});

		// Auto-enhance URL info if we have a URL but missing title/summary
		if (url.url && url.url.trim() && (!url.title || !url.description || url.description === '🔗 Reference link for research')) {
			this.enhanceUrlInfo(index);
		}

		// Actions section
		const actionsEl = urlEl.createEl('div', { cls: 'crystal-url-actions' });

		// Open URL button
		if (url.url && url.url.trim()) {
			const openBtn = actionsEl.createEl('button', {
				text: '🔗 Open',
				cls: 'crystal-open-url-btn',
				attr: { 'aria-label': 'Open URL in browser' }
			});
			openBtn.onclick = () => {
				window.open(url.url, '_blank');
			};

			// Add hover preview
			this.linkPreviewManager.addHoverPreview(openBtn, url.url);
		}

		// Add link status controls
		this.addLinkStatusControls(urlEl, url, index);
		
		const removeBtn = actionsEl.createEl('button', {
			text: '×',
			cls: 'crystal-url-remove'
		});
		removeBtn.onclick = () => {
			this.cardResearchUrls.splice(index, 1);
			const urlsContainer = container.closest('.crystal-urls-container') as HTMLElement;
			this.updateUrlsDisplay(urlsContainer);
		};
	}

	/**
	 * Add link status controls (importance, read/unread)
	 */
	private addLinkStatusControls(urlEl: HTMLElement, url: ResearchUrl, index: number): void {
		const statusEl = urlEl.createEl('div', { cls: 'crystal-url-status' });

		// Importance selector
		const importanceSelect = statusEl.createEl('select', { cls: 'crystal-url-importance' });
		const importanceOptions = [
			{ value: 'low', text: '🟢 Low', color: '#28a745' },
			{ value: 'medium', text: '🟡 Medium', color: '#ffc107' },
			{ value: 'high', text: '🔴 High', color: '#dc3545' }
		];

		importanceOptions.forEach(option => {
			const optionEl = importanceSelect.createEl('option', {
				value: option.value,
				text: option.text
			});
			if (url.importance === option.value) {
				optionEl.selected = true;
			}
		});

		importanceSelect.onchange = () => {
			this.cardResearchUrls[index].importance = importanceSelect.value as 'low' | 'medium' | 'high';
		};

		// Read/Unread toggle
		const readToggle = statusEl.createEl('button', {
			text: url.status === 'read' ? '👁️ Read' : '📖 Unread',
			cls: `crystal-url-read-toggle ${url.status === 'read' ? 'read' : 'unread'}`
		});
		readToggle.onclick = () => {
			const newStatus = url.status === 'read' ? 'unread' : 'read';
			this.cardResearchUrls[index].status = newStatus;
			readToggle.textContent = newStatus === 'read' ? '👁️ Read' : '📖 Unread';
			readToggle.className = `crystal-url-read-toggle ${newStatus}`;
		};
	}

	/**
	 * Add a new research URL
	 */
	private addNewResearchUrl(container: HTMLElement): void {
		const newUrl: ResearchUrl = {
			id: `url-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
			url: '',
			title: '',
			description: '',
			created: Date.now(),
			status: 'unread',
			importance: 'medium'
		};

		this.cardResearchUrls.push(newUrl);
		const urlsContainer = container.querySelector('.crystal-urls-container') as HTMLElement;
		this.updateUrlsDisplay(urlsContainer);

		// Focus on the new URL input
		setTimeout(() => {
			const newIndex = this.cardResearchUrls.length - 1;
			const newUrlEl = urlsContainer.querySelector(`[data-url-index="${newIndex}"]`) as HTMLElement;
			if (newUrlEl) {
				const urlInput = newUrlEl.querySelector('.crystal-url-input') as HTMLInputElement;
				if (urlInput) {
					// Show the input for editing immediately for new URLs
					const urlText = newUrlEl.querySelector('.crystal-url-text') as HTMLElement;
					const editBtn = newUrlEl.querySelector('.crystal-url-edit-btn') as HTMLElement;
					if (urlText && editBtn) {
						urlInput.classList.remove('crystal-url-input-hidden');
						urlText.style.display = 'none';
						editBtn.textContent = '💾';
						urlInput.focus();
					}
				}
			}
		}, 100);
	}

	/**
	 * Enhance URL info by fetching title and generating AI summary
	 */
	private async enhanceUrlInfo(index: number, force: boolean = false): Promise<void> {
		const url = this.cardResearchUrls[index];
		if (!url.url || !url.url.trim()) return;

		try {
			// Show loading state
			const urlItem = document.querySelector(`[data-url-index="${index}"]`) as HTMLElement;
			if (!urlItem) return;

			const titleInput = urlItem.querySelector('.crystal-url-title') as HTMLInputElement;
			const summaryText = urlItem.querySelector('.crystal-url-summary-text') as HTMLElement;

			// Only fetch if we don't have title/summary or if forced
			const needsTitle = force || !url.title || url.title.trim() === '' || url.title === 'freecodecamp.org';
			const needsSummary = force || !url.description || url.description.trim() === '' || url.description === '🔗 Reference link for research';

			if (!needsTitle && !needsSummary) return;

			if (needsTitle) {
				if (titleInput) titleInput.placeholder = 'Loading title...';
			}
			
			if (needsSummary) {
				if (summaryText) summaryText.textContent = 'Loading summary...';
			}

			// Extract title from URL path first (immediate feedback)
			let title = '';
			if (needsTitle) {
				title = this.extractTitleFromUrl(url.url);
				if (title && titleInput) {
					titleInput.value = title;
					this.cardResearchUrls[index].title = title;
				}
			}

			// Get summary using the same pipeline as smart extraction
			if (needsSummary) {
				try {
					console.log('Starting URL content extraction for:', url.url);
					const smartExtractService = this.plugin.smartExtractService;
					const openAIService = this.plugin.openAIService;
					
					// Step 1: Try MCP scraping first (same as smart extract)
					let content = await smartExtractService.tryMCPScraping(url.url);
					
					if (content && content.trim()) {
						console.log(`MCP scraping successful, extracted ${content.length} characters`);
						
						// Step 2: Use OpenAI to summarize the content
						const summary = await openAIService.summarizeURL(url.url, content);
						
						if (summary && summary.trim()) {
							// Keep summary short (max 150 chars)
							let finalSummary = summary;
							if (finalSummary.length > 150) {
								finalSummary = finalSummary.substring(0, 147) + '...';
							}
							
							this.cardResearchUrls[index].description = finalSummary;
							if (summaryText) {
								summaryText.textContent = finalSummary;
							}
							console.log('Summary generated successfully:', finalSummary);
						} else {
							const fallbackSummary = 'Summary could not be generated from URL content.';
							this.cardResearchUrls[index].description = fallbackSummary;
							if (summaryText) {
								summaryText.textContent = fallbackSummary;
							}
						}
					} else {
						console.log('MCP scraping failed, trying direct fetch...');
						
						// Step 3: Fallback to direct URL fetch (same as smart extract fallback)
						try {
							const response = await fetch(url.url, {
								headers: {
									'User-Agent': 'Crystal Boards Research'
								}
							});
							
							if (response.ok) {
								const html = await response.text();
								
								// Basic HTML text extraction
								let textContent = html
									.replace(/<script[^>]*>.*?<\/script>/gi, '')
									.replace(/<style[^>]*>.*?<\/style>/gi, '')
									.replace(/<[^>]*>/g, ' ')
									.replace(/\s+/g, ' ')
									.trim();
								
								// Limit content size
								if (textContent.length > 3000) {
									textContent = textContent.substring(0, 3000) + '...';
								}
								
								if (textContent.length > 100) {
									const summary = await openAIService.summarizeURL(url.url, textContent);
									
									if (summary && summary.trim()) {
										let finalSummary = summary;
										if (finalSummary.length > 150) {
											finalSummary = finalSummary.substring(0, 147) + '...';
										}
										
										this.cardResearchUrls[index].description = finalSummary;
										if (summaryText) {
											summaryText.textContent = finalSummary;
										}
									} else {
										const fallbackSummary = 'Summary could not be generated.';
										this.cardResearchUrls[index].description = fallbackSummary;
										if (summaryText) {
											summaryText.textContent = fallbackSummary;
										}
									}
								} else {
									const fallbackSummary = 'Insufficient content to generate summary.';
									this.cardResearchUrls[index].description = fallbackSummary;
									if (summaryText) {
										summaryText.textContent = fallbackSummary;
									}
								}
							} else {
								throw new Error(`HTTP ${response.status}`);
							}
						} catch (fetchError) {
							console.warn('Direct fetch also failed:', fetchError);
							const errorSummary = 'Unable to access URL content for summary.';
							this.cardResearchUrls[index].description = errorSummary;
							if (summaryText) {
								summaryText.textContent = errorSummary;
							}
						}
					}
				} catch (error) {
					console.error('Failed to generate summary:', error);
					const errorMessage = 'Error generating summary for this URL.';
					this.cardResearchUrls[index].description = errorMessage;
					if (summaryText) {
						summaryText.textContent = errorMessage;
					}
				}
			}

		} catch (error) {
			console.error('Error enhancing URL info:', error);
		}
	}

	/**
	 * Extract a readable title from URL path
	 */
	private extractTitleFromUrl(url: string): string {
		try {
			const urlObj = new URL(url);
			const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);
			
			if (pathParts.length > 0) {
				// Use the last meaningful path segment
				const lastPart = pathParts[pathParts.length - 1];
				
				// Convert URL slug to readable title
				let title = lastPart
					.replace(/[-_]/g, ' ')                    // Replace dashes/underscores with spaces
					.replace(/\.(html|htm|php|jsp|asp)$/i, '') // Remove file extensions
					.replace(/\d{4}\/\d{2}\/\d{2}/g, '')      // Remove date patterns
					.split(' ')
					.filter(word => word.length > 0)         // Remove empty words
					.map(word => {
						// Capitalize each word appropriately
						if (word.toLowerCase() === 'and') return 'and';
						if (word.toLowerCase() === 'or') return 'or';
						if (word.toLowerCase() === 'the') return 'the';
						if (word.toLowerCase() === 'a') return 'a';
						if (word.toLowerCase() === 'an') return 'an';
						if (word.toLowerCase() === 'in') return 'in';
						if (word.toLowerCase() === 'on') return 'on';
						if (word.toLowerCase() === 'at') return 'at';
						if (word.toLowerCase() === 'to') return 'to';
						if (word.toLowerCase() === 'for') return 'for';
						if (word.toLowerCase() === 'of') return 'of';
						if (word.toLowerCase() === 'with') return 'with';
						if (word.toLowerCase() === 'by') return 'by';
						
						return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
					})
					.join(' ');

				// Handle special cases like "what is linting and how can it save you time"
				if (title.length > 50) {
					title = title.substring(0, 50) + '...';
				}
				
				// Make sure first letter is capitalized
				if (title.length > 0) {
					title = title.charAt(0).toUpperCase() + title.slice(1);
				}

				return title || urlObj.hostname.replace('www.', '');
			} else {
				// Fallback to hostname if no path
				return urlObj.hostname.replace('www.', '');
			}
		} catch (error) {
			console.warn('Error extracting title from URL:', error);
			return 'Untitled';
		}
	}

	private addNewTodo(section: HTMLElement): void {
		const todoId = this.generateId();
		const newTodo: TodoItem = {
			id: todoId,
			text: '',
			completed: false,
			created: Date.now()
		};
		
		this.cardTodos.push(newTodo);
		this.updateTodosDisplay(section.querySelector('.crystal-todos-display') as HTMLElement);
		
		// Update progress bar
		const progressContainer = this.contentEl.querySelector('.crystal-progress-container');
		if (progressContainer) {
			progressContainer.remove();
		}
		if (this.cardTodos.length > 0) {
			const headerEl = this.contentEl.querySelector('.crystal-card-modal-header') as HTMLElement;
			this.renderProgressBar(headerEl);
		}
	}

	private addSampleTodo(section: HTMLElement): void {
		const todoId = this.generateId();
		const sampleTodo: TodoItem = {
			id: todoId,
			text: 'Research this article: https://obsidian.md/blog/new-obsidian-icon/',
			completed: false,
			created: Date.now()
		};
		
		this.cardTodos.push(sampleTodo);
		this.updateTodosDisplay(section.querySelector('.crystal-todos-display') as HTMLElement);
		
		// Update progress bar
		const progressContainer = this.contentEl.querySelector('.crystal-progress-container');
		if (progressContainer) {
			progressContainer.remove();
		}
		if (this.cardTodos.length > 0) {
			const headerEl = this.contentEl.querySelector('.crystal-card-modal-header') as HTMLElement;
			this.renderProgressBar(headerEl);
		}
	}

	private updateTodosDisplay(container: HTMLElement): void {
		container.empty();
		
		if (this.cardTodos.length === 0) {
			container.createEl('div', { 
				text: 'No tasks added yet',
				cls: 'crystal-empty-state'
			});
			return;
		}

		this.cardTodos.forEach((todo, index) => {
			const todoEl = container.createEl('div', { cls: 'crystal-todo-item crystal-todo-enhanced' });
			
			// Main todo row
			const todoMainRow = todoEl.createEl('div', { cls: 'crystal-todo-main-row' });
			
			const checkbox = todoMainRow.createEl('input', {
				type: 'checkbox',
				cls: 'crystal-todo-checkbox'
			});
			checkbox.checked = todo.completed;
			checkbox.onchange = () => {
				this.cardTodos[index].completed = checkbox.checked;
				// Update progress bar
				const progressContainer = this.contentEl.querySelector('.crystal-progress-container');
				if (progressContainer) {
					progressContainer.remove();
					const headerEl = this.contentEl.querySelector('.crystal-card-modal-header') as HTMLElement;
					this.renderProgressBar(headerEl);
				}
			};
			
			const textInput = todoMainRow.createEl('input', {
				type: 'text',
				cls: 'crystal-todo-text',
				value: todo.text,
				placeholder: 'Enter task description...'
			});
			textInput.onchange = () => {
				this.cardTodos[index].text = textInput.value;
				// Auto-detect URLs when text changes
				this.detectUrlsInTodo(todo, index, todoEl);
			};
			
			// Add Enter key support for todos
			textInput.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					this.cardTodos[index].text = textInput.value;
					
					// If this is the last todo and it has text, add a new empty todo
					if (index === this.cardTodos.length - 1 && textInput.value.trim()) {
						const section = container.closest('.crystal-card-section') as HTMLElement;
						this.addNewTodo(section);
					}
				}
			});

			// Enhanced AI actions section
			const actionsRow = todoMainRow.createEl('div', { cls: 'crystal-todo-actions' });

			// Check if this todo has URLs
			const hasUrls = this.hasUrlsInText(todo.text);
			
			// Show AI buttons if URLs are detected
			if (hasUrls) {
				// AI Summary button
				const aiBtn = actionsRow.createEl('button', {
					text: '🤖 AI',
					cls: 'crystal-todo-ai-btn',
					attr: { 'aria-label': 'Get AI Summary', 'title': 'Get AI Summary of URLs' }
				});
				aiBtn.onclick = () => this.handleAISummary(todo, index, todoEl);
			} else if (todo.text.trim()) {
				// Show helpful hint when todo has text but no URLs
				const hintBtn = actionsRow.createEl('span', {
					text: 'Add URL for AI features',
					cls: 'crystal-todo-hint'
				});
				hintBtn.style.fontSize = '0.7rem';
				hintBtn.style.color = 'var(--text-muted)';
				hintBtn.style.fontStyle = 'italic';
			}

			const removeBtn = actionsRow.createEl('button', {
				text: '×',
				cls: 'crystal-todo-remove'
			});
			removeBtn.onclick = () => {
				this.cardTodos.splice(index, 1);
				this.updateTodosDisplay(container);
				// Update progress bar
				const progressContainer = this.contentEl.querySelector('.crystal-progress-container');
				if (progressContainer) {
					progressContainer.remove();
				}
				if (this.cardTodos.length > 0) {
					const headerEl = this.contentEl.querySelector('.crystal-card-modal-header') as HTMLElement;
					this.renderProgressBar(headerEl);
				}
			};

			// Show AI summary if available
			if (todo.aiSummary) {
				this.renderAISummary(todoEl, todo.aiSummary);
			}

			// Show detected URLs
			if (todo.urls && todo.urls.length > 0) {
				this.renderDetectedUrls(todoEl, todo.urls);
			}
		});
	}

	private hasUrlsInText(text: string): boolean {
		const urlRegex = /https?:\/\/[^\s]+/gi;
		return urlRegex.test(text);
	}

	private detectUrlsInTodo(todo: TodoItem, index: number, todoEl: HTMLElement): void {
		if (!this.hasUrlsInText(todo.text)) {
			// Remove any existing URL detection UI
			const urlContainer = todoEl.querySelector('.crystal-todo-urls');
			if (urlContainer) {
				urlContainer.remove();
			}
			// Clear URLs from todo
			delete todo.urls;
			return;
		}

		// Use the AI service to detect URLs
		const detectedUrls = this.plugin.todoAIService.detectUrlsInTodo(todo.text);
		if (detectedUrls.length > 0) {
			this.cardTodos[index].urls = detectedUrls;
			this.renderDetectedUrls(todoEl, detectedUrls);
		}
	}

	private async handleAISummary(todo: TodoItem, index: number, todoEl: HTMLElement): Promise<void> {
		try {
			// Show loading state
			const aiBtn = todoEl.querySelector('.crystal-todo-ai-btn') as HTMLElement;
			const originalText = aiBtn.textContent;
			aiBtn.textContent = '⏳';
			aiBtn.classList.add('loading');

			// Get AI summary
			const result = await this.plugin.todoAIService.processTodoWithAI(todo, {
				createNote: false,
				linkToCard: false
			});

			if (result.success && result.summary) {
				// Update the todo with summary
				this.cardTodos[index] = result.todo;
				// Render the AI summary
				this.renderAISummary(todoEl, result.summary);
				new Notice('AI summary generated!');
			} else {
				new Notice('Failed to generate AI summary: ' + (result.errors?.join(', ') || 'Unknown error'));
			}

		} catch (error) {
			console.error('AI Summary error:', error);
			new Notice('Failed to get AI summary: ' + error.message);
		} finally {
			// Reset button state
			const aiBtn = todoEl.querySelector('.crystal-todo-ai-btn') as HTMLElement;
			if (aiBtn) {
				aiBtn.textContent = '🤖';
				aiBtn.classList.remove('loading');
			}
		}
	}

	/**
	 * Check if a string is a valid URL
	 */
	private isValidUrl(url: string): boolean {
		try {
			new URL(url);
			return url.startsWith('http://') || url.startsWith('https://');
		} catch {
			return false;
		}
	}

	/**
	 * Get favicon URL for a given website URL
	 */
	private getFaviconUrl(url: string): string {
		if (!url || !this.isValidUrl(url)) {
			// Return a default globe icon as base64 SVG
			return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI4IiBjeT0iOCIgcj0iNyIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMS41IiBmaWxsPSJub25lIi8+PHBhdGggZD0iTTUgOEgxMU04IDVWMTEiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+';
		}
		
		try {
			const urlObj = new URL(url);
			const domain = urlObj.hostname;
			
			// Use Google's favicon service as primary option (reliable and fast)
			return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
			
			// Alternative services (in case you want to switch):
			// return `https://favicons.githubusercontent.com/${domain}`;
			// return `https://icon.horse/icon/${domain}`;
			// return `${urlObj.protocol}//${domain}/favicon.ico`;
		} catch {
			// Return default icon if URL parsing fails
			return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI4IiBjeT0iOCIgcj0iNyIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMS41IiBmaWxsPSJub25lIi8+PHBhdGggZD0iTTUgOEgxMU04IDVWMTEiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+';
		}
	}

	/**
	 * Add category indicator to URL element
	 */
	private addCategoryIndicator(urlEl: HTMLElement, metadata: any): void {
		// Remove existing category indicator if any
		const existing = urlEl.querySelector('.crystal-url-category');
		if (existing) {
			existing.remove();
		}

		// Add new category indicator
		const categoryEl = urlEl.createEl('div', { 
			cls: 'crystal-url-category',
			text: `${metadata.icon} ${metadata.category}`,
			title: `Category: ${metadata.category} • Domain: ${metadata.domain}`
		});
		
		// Insert category indicator after title input
		const titleInput = urlEl.querySelector('.crystal-url-title');
		if (titleInput && titleInput.nextSibling) {
			urlEl.insertBefore(categoryEl, titleInput.nextSibling);
		} else {
			urlEl.appendChild(categoryEl);
		}
	}

	/**
	 * Add link status controls for reading progress and notes
	 */
	private addLinkStatusControls(urlEl: HTMLElement, url: ResearchUrl, index: number): void {
		const statusContainer = urlEl.createEl('div', { cls: 'crystal-link-status' });

		// Status buttons
		const statusButtons = statusContainer.createEl('div', { cls: 'crystal-status-buttons' });
		
		const statuses = [
			{ key: 'unread', label: '📋 To Read', color: 'var(--color-blue)' },
			{ key: 'reading', label: '👀 Reading', color: 'var(--color-orange)' },
			{ key: 'read', label: '✅ Read', color: 'var(--color-green)' },
			{ key: 'archived', label: '📁 Archived', color: 'var(--color-purple)' }
		];

		const currentStatus = url.status || 'unread';

		statuses.forEach(status => {
			const btn = statusButtons.createEl('button', {
				cls: `crystal-status-btn ${currentStatus === status.key ? 'active' : ''}`,
				text: status.label,
				attr: { 'data-status': status.key }
			});
			
			if (currentStatus === status.key) {
				btn.style.backgroundColor = status.color;
				btn.style.color = 'white';
			}

			btn.onclick = () => {
				// Update status
				this.cardResearchUrls[index].status = status.key as any;
				if (status.key === 'read' && !this.cardResearchUrls[index].readDate) {
					this.cardResearchUrls[index].readDate = Date.now();
				}

				// Update UI
				statusButtons.querySelectorAll('.crystal-status-btn').forEach(b => {
					const btn = b as HTMLButtonElement;
					btn.classList.remove('active');
					btn.style.backgroundColor = '';
					btn.style.color = '';
				});
				
				btn.classList.add('active');
				btn.style.backgroundColor = status.color;
				btn.style.color = 'white';
			};
		});

		// Importance selector
		const importanceContainer = statusContainer.createEl('div', { cls: 'crystal-importance' });
		importanceContainer.createEl('label', { text: 'Importance:', cls: 'crystal-label' });
		
		const importanceSelect = importanceContainer.createEl('select', { cls: 'crystal-importance-select' });
		['low', 'medium', 'high'].forEach(level => {
			const option = importanceSelect.createEl('option', { 
				value: level,
				text: level.charAt(0).toUpperCase() + level.slice(1)
			});
			if (url.importance === level) {
				option.selected = true;
			}
		});
		
		importanceSelect.onchange = () => {
			this.cardResearchUrls[index].importance = importanceSelect.value as any;
		};

		// Notes textarea
		const notesContainer = statusContainer.createEl('div', { cls: 'crystal-notes' });
		notesContainer.createEl('label', { text: 'Notes:', cls: 'crystal-label' });
		
		const notesTextarea = notesContainer.createEl('textarea', {
			cls: 'crystal-notes-input',
			placeholder: 'Add notes about this link...',
			value: url.notes || ''
		});
		
		notesTextarea.onchange = () => {
			this.cardResearchUrls[index].notes = notesTextarea.value;
		};

		// Show/hide status controls based on whether URL exists
		if (!url.url) {
			statusContainer.style.display = 'none';
		}
	}

	private createNoteHoverPreview(element: HTMLElement, file: TFile): void {
		let hoverTimeout: NodeJS.Timeout | null = null;
		let previewEl: HTMLElement | null = null;
		
		element.addEventListener('mouseenter', () => {
			console.log('Mouse entered note link in modal:', file.basename);
			
			if (hoverTimeout) {
				clearTimeout(hoverTimeout);
			}
			
			hoverTimeout = setTimeout(async () => {
				try {
					console.log('Creating preview for:', file.basename);
					const content = await this.app.vault.read(file);
					// Show full content for scrolling
					let previewContent = content;
					
					// Remove existing preview
					if (previewEl) {
						previewEl.remove();
					}
					
					previewEl = document.body.createEl('div', {
						cls: 'crystal-note-preview-popup'
					});
					
					// Create header with note name and scroll indicator
					const headerEl = previewEl.createEl('div', {
						cls: 'crystal-note-preview-header'
					});
					headerEl.createEl('span', { text: file.basename });
					const scrollIndicator = headerEl.createEl('span', { 
						cls: 'crystal-note-preview-scroll-indicator',
						text: '↕ Scroll'
					});
					
					// Create a container for the rendered markdown
					const contentContainer = previewEl.createEl('div', {
						cls: 'crystal-note-preview-content'
					});
					
					// Add scroll event listener to show/hide scroll indicator
					contentContainer.addEventListener('scroll', () => {
						const isScrollable = contentContainer.scrollHeight > contentContainer.clientHeight;
						const isAtBottom = contentContainer.scrollTop + contentContainer.clientHeight >= contentContainer.scrollHeight - 5;
						const isAtTop = contentContainer.scrollTop <= 5;
						
						if (!isScrollable) {
							scrollIndicator.style.opacity = '0';
						} else if (isAtBottom) {
							scrollIndicator.textContent = '↑ Scroll up';
							scrollIndicator.style.opacity = '0.7';
						} else if (isAtTop) {
							scrollIndicator.textContent = '↓ More below';
							scrollIndicator.style.opacity = '0.7';
						} else {
							scrollIndicator.textContent = '↕ Scroll';
							scrollIndicator.style.opacity = '0.7';
						}
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
					
					// Trigger scroll event to set initial indicator state
					setTimeout(() => {
						contentContainer.dispatchEvent(new Event('scroll'));
					}, 10);
					
					// Position the preview near the element
					const rect = element.getBoundingClientRect();
					previewEl.style.position = 'fixed';
					previewEl.style.left = `${rect.left}px`;
					previewEl.style.top = `${rect.bottom + 10}px`;
					previewEl.style.zIndex = '10000';
					previewEl.style.maxWidth = '350px';
					
					// Add hover events to keep preview open when mouse is over it
					previewEl.addEventListener('mouseenter', () => {
						console.log('Mouse entered preview in modal');
					});
					
					previewEl.addEventListener('mouseleave', () => {
						console.log('Mouse left preview in modal');
						setTimeout(() => {
							if (previewEl) {
								previewEl.remove();
								previewEl = null;
							}
						}, 100);
					});
					
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
					
					// Create header for error preview
					const errorHeaderEl = previewEl.createEl('div', {
						cls: 'crystal-note-preview-header'
					});
					errorHeaderEl.createEl('span', { text: file.basename });
					
					// Create content container for error
					const errorContentEl = previewEl.createEl('div', {
						cls: 'crystal-note-preview-content'
					});
					errorContentEl.textContent = 'Error loading note preview';
					
					const rect = element.getBoundingClientRect();
					previewEl.style.position = 'fixed';
					previewEl.style.left = `${rect.left}px`;
					previewEl.style.top = `${rect.bottom + 10}px`;
					previewEl.style.zIndex = '10000';
					
					// Add hover events to error preview as well
					previewEl.addEventListener('mouseenter', () => {
						console.log('Mouse entered error preview in modal');
					});
					
					previewEl.addEventListener('mouseleave', () => {
						console.log('Mouse left error preview in modal');
						setTimeout(() => {
							if (previewEl) {
								previewEl.remove();
								previewEl = null;
							}
						}, 100);
					});
				}
			}, 500); // 500ms delay before showing preview
		});
		
		element.addEventListener('mouseleave', () => {
			console.log('Mouse left note link in modal:', file.basename);
			
			if (hoverTimeout) {
				clearTimeout(hoverTimeout);
				hoverTimeout = null;
			}
			
			// Only hide after a short delay to allow moving to preview
			setTimeout(() => {
				if (previewEl && !previewEl.matches(':hover')) {
					previewEl.remove();
					previewEl = null;
				}
			}, 100);
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}