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
		this.cardDescription = this.cleanDescriptionForDisplay(card.description || '');
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
	/**
	 * Clean description for display by converting literal newlines to actual newlines
	 * and removing any formatting artifacts from the smart extraction process
	 */
	private cleanDescriptionForDisplay(description: string): string {
		if (!description) return '';
		
		let cleaned = description
			// Convert literal \n to actual newlines
			.replace(/\\n/g, '\n')
			// Remove any remaining research summary artifacts that might have slipped through
			.replace(/📚\s*\*\*Research Summary:\*\*[\s\S]*?(?=\n\n##|$)/g, '')
			// Clean up excessive line breaks
			.replace(/\n\n\n+/g, '\n\n')
			// Remove any remaining analysis method indicators
			.replace(/🎯\s*\*\*Analysis Method\*\*:\s*[A-Z\s_]+\n\n/g, '')
			.trim();
		
		return cleaned;
	}
	/**
	 * Discover notes in the card's folder structure and update linked notes
	 */
	private async discoverAndUpdateLinkedNotes(): Promise<void> {
		try {
			
			
			// Get the board to determine folder structure
			const board = this.plugin.dataManager.getBoardById(this.boardId);
			if (!board) {
				console.warn('Board not found for note discovery');
				return;
			}

			// Build expected folder path: Kanban/BoardName/CardName/
			const sanitizedCardTitle = this.sanitizeFileName(this.cardTitle);
			const kanbanFolder = this.plugin.settings.kanbanFolderPath || 'Kanban';
			const cardFolderPath = `${kanbanFolder}/${board.name}/${sanitizedCardTitle}`;
			
			

			// Check if the card's folder exists
			const folderExists = await this.app.vault.adapter.exists(cardFolderPath);
			if (!folderExists) {
				
				return;
			}

			// Get all files in the card's folder
			const folderContents = await this.app.vault.adapter.list(cardFolderPath);
			
			// Filter for markdown files
			const markdownFiles = folderContents.files.filter(filePath => 
				filePath.endsWith('.md')
			);

			

			// Add discovered notes to cardNoteLinks if they're not already there
			let newNotesFound = 0;
			for (const filePath of markdownFiles) {
				if (!this.cardNoteLinks.includes(filePath)) {
					this.cardNoteLinks.push(filePath);
					newNotesFound++;
					
				}
			}

			// Also check for notes that might be linked but no longer exist
			const existingLinks = [...this.cardNoteLinks];
			for (const linkPath of existingLinks) {
				// Check if this link is supposed to be in the card folder
				if (linkPath.startsWith(cardFolderPath)) {
					const fileExists = await this.app.vault.adapter.exists(linkPath);
					if (!fileExists) {
						// Remove non-existent files from the card folder
						const index = this.cardNoteLinks.indexOf(linkPath);
						if (index > -1) {
							this.cardNoteLinks.splice(index, 1);
							
						}
					}
				}
			}

			if (newNotesFound > 0) {
				
			} else {
				
			}

		} catch (error) {
			console.error('Error discovering linked notes:', error);
		}
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		
		// Apply CSS class to the modal itself for proper styling
		this.modalEl.addClass('crystal-card-modal');

		// Discover and update linked notes from card folder
		await this.discoverAndUpdateLinkedNotes();

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

	private saveCard(): void {
		// Update the card with edited values
		this.card.title = this.cardTitle;
		this.card.description = this.cardDescription;
		this.card.tags = [...this.cardTags];
		this.card.noteLinks = [...this.cardNoteLinks];
		this.card.todos = [...this.cardTodos];
		this.card.researchUrls = [...this.cardResearchUrls];
		
		// Call the onSave callback
		this.onSave(this.card);
		
		// Close the modal
		this.close();
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

		// Create Linked Note button (using Obsidian's Setting component for consistency)
		new Setting(section)
			.setName('Create New Note')
			.setDesc('Create a new note linked to this card')
			.addButton((btn) => {
				btn.setButtonText('📝 Create Linked Note')
					.setCta()
					.onClick(() => this.createLinkedNote());
			});

		// Search for existing notes (using Setting component for consistency)
		new Setting(section)
			.setName('Link Existing Note')
			.setDesc('Search and link existing notes from your vault')
			.addText((text) => {
				text.setPlaceholder('Search notes by name, path, or content...')
					.onChange((value) => {
						this.performNotesSearch(value, section);
					});
				
				// Store reference for search functionality
				const searchInput = text.inputEl;
				searchInput.classList.add('crystal-notes-search-input');
				
				// Add keyboard navigation
				searchInput.addEventListener('keydown', (e) => {
					this.handleSearchKeydown(e, section);
				});
			});

		// Search results container
		const resultsContainer = section.createEl('div', { cls: 'crystal-notes-search-results' });
		resultsContainer.style.display = 'none'; // Hidden initially

		// Store references for search functionality
		(section as any).searchResultsContainer = resultsContainer;
		(section as any).searchTimeout = null;
		(section as any).selectedIndex = -1;
	}

	/**
	 * Perform notes search with simplified interface
	 */
	private async performNotesSearch(searchTerm: string, section: HTMLElement): Promise<void> {
		const resultsContainer = (section as any).searchResultsContainer as HTMLElement;
		let searchTimeout = (section as any).searchTimeout;

		// Clear previous timeout
		if (searchTimeout) {
			clearTimeout(searchTimeout);
		}

		// Clear existing results
		resultsContainer.empty();
		(section as any).selectedIndex = -1;

		if (!searchTerm.trim()) {
			resultsContainer.style.display = 'none';
			return;
		}

		// Show searching state
		resultsContainer.style.display = 'block';
		resultsContainer.createEl('div', { 
			text: 'Searching...', 
			cls: 'crystal-search-status searching' 
		});

		// Debounce search
		searchTimeout = setTimeout(async () => {
			try {
				const results = await this.performEnhancedSearch(searchTerm);
				this.displaySimpleSearchResults(results, resultsContainer, section);
			} catch (error) {
				console.error('Search error:', error);
				resultsContainer.empty();
				resultsContainer.createEl('div', { 
					text: 'Search failed. Please try again.', 
					cls: 'crystal-search-status error' 
				});
			}
		}, 300);

		(section as any).searchTimeout = searchTimeout;
	}

	/**
	 * Display search results in simplified format
	 */
	private displaySimpleSearchResults(results: any[], resultsContainer: HTMLElement, section: HTMLElement): void {
		resultsContainer.empty();

		if (results.length === 0) {
			resultsContainer.createEl('div', { 
				text: 'No matching notes found', 
				cls: 'crystal-search-status empty' 
			});
			return;
		}

		const resultsEl = resultsContainer.createEl('div', { cls: 'crystal-simple-search-results' });

		results.slice(0, 6).forEach((file, index) => {
			const resultEl = resultsEl.createEl('div', { cls: 'crystal-simple-search-result' });
			
			const titleEl = resultEl.createEl('div', { 
				cls: 'crystal-simple-result-title',
				text: file.basename 
			});
			
			const pathEl = resultEl.createEl('div', { 
				cls: 'crystal-simple-result-path',
				text: file.path 
			});
			
			resultEl.addEventListener('click', () => {
				this.addSimpleNoteLink(file, section);
			});

			// Store index for keyboard navigation
			(resultEl as any).resultIndex = index;
		});
	}

	/**
	 * Add note link with simplified interface
	 */
	private addSimpleNoteLink(file: any, section: HTMLElement): void {
		if (!this.cardNoteLinks.includes(file.path)) {
			this.cardNoteLinks.push(file.path);
			
			// Update notes display
			const notesDisplay = section.querySelector('.crystal-notes-display') as HTMLElement;
			if (notesDisplay) {
				this.updateNotesDisplay(notesDisplay);
			}
			
			// Clear search
			const searchInput = section.querySelector('.crystal-notes-search-input') as HTMLInputElement;
			if (searchInput) {
				searchInput.value = '';
			}
			
			// Hide results
			const resultsContainer = (section as any).searchResultsContainer as HTMLElement;
			resultsContainer.style.display = 'none';
			resultsContainer.empty();
		}
	}

	/**
	 * Handle keyboard navigation in search
	 */
	private handleSearchKeydown(e: KeyboardEvent, section: HTMLElement): void {
		const resultsContainer = (section as any).searchResultsContainer as HTMLElement;
		const results = resultsContainer.querySelectorAll('.crystal-simple-search-result');
		
		if (results.length === 0) return;

		let selectedIndex = (section as any).selectedIndex;

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, -1);
				break;
			case 'Enter':
				e.preventDefault();
				if (selectedIndex >= 0 && results[selectedIndex]) {
					(results[selectedIndex] as HTMLElement).click();
				}
				return;
			case 'Escape':
				e.preventDefault();
				resultsContainer.style.display = 'none';
				resultsContainer.empty();
				selectedIndex = -1;
				break;
			default:
				return;
		}

		// Update selection visual state
		results.forEach((result, index) => {
			if (index === selectedIndex) {
				result.addClass('selected');
			} else {
				result.removeClass('selected');
			}
		});

		(section as any).selectedIndex = selectedIndex;
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
					this.deleteLinkedNote(file, container);
				};
			} else {
				console.warn('File not found for path:', notePath);
			}
		});
		
		
	}

	/**
	 * Delete a linked note with user confirmation
	 */
	private async deleteLinkedNote(file: TFile, container: HTMLElement): Promise<void> {
		try {
			const confirmed = await this.confirmNoteDeletion(file.basename);
			if (!confirmed) {
				return;
			}

			

			// Remove from cardNoteLinks
			const index = this.cardNoteLinks.indexOf(file.path);
			if (index > -1) {
				this.cardNoteLinks.splice(index, 1);
			}

			// Delete the actual file
			await this.app.vault.delete(file);
			
			// Update the display
			this.updateNotesDisplay(container);
			
			new Notice(`🗑️ Deleted note: ${file.basename}`);
			

		} catch (error) {
			console.error('Error deleting linked note:', error);
			new Notice(`❌ Failed to delete note: ${error.message}`);
		}
	}

	/**
	 * Show confirmation dialog for note deletion
	 */
	private async confirmNoteDeletion(noteName: string): Promise<boolean> {
		return new Promise((resolve) => {
			const modal = new Modal(this.app);
			modal.titleEl.setText('Delete Note');

			const content = modal.contentEl;
			content.createEl('p', { 
				text: `Are you sure you want to permanently delete "${noteName}"?`
			});
			
			content.createEl('p', { 
				text: 'This action cannot be undone.',
				cls: 'mod-warning'
			});

			const buttonContainer = content.createEl('div');
			buttonContainer.style.display = 'flex';
			buttonContainer.style.gap = '0.5rem';
			buttonContainer.style.justifyContent = 'flex-end';
			buttonContainer.style.marginTop = '1rem';

			const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
			const deleteBtn = buttonContainer.createEl('button', { 
				text: 'Delete',
				cls: 'mod-warning'
			});

			let isResolved = false;

			const handleCancel = () => {
				if (isResolved) return;
				isResolved = true;
				resolve(false);
				setTimeout(() => modal.close(), 10);
			};

			const handleDelete = () => {
				if (isResolved) return;
				isResolved = true;
				resolve(true);
				setTimeout(() => modal.close(), 10);
			};

			cancelBtn.addEventListener('click', handleCancel);
			deleteBtn.addEventListener('click', handleDelete);
			
			// Handle modal close via other means
			modal.onClose = () => {
				if (!isResolved) {
					isResolved = true;
					resolve(false);
				}
			};

			modal.open();
			
			// Focus the cancel button by default for safety
			setTimeout(() => cancelBtn.focus(), 100);
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
					(result as any).contentScore = contentMatch.score;
					(result as any).totalScore = result.score + (contentMatch.score * 0.3);
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
				statusEl.textContent = 'Start typing to search for notes to link';
				statusEl.className = 'crystal-search-status empty';
			}

			// Focus back to search for easy addition of more notes
			setTimeout(() => searchInput.focus(), 100);
		}
	}

	/**
	 * Create a new linked note with user-provided title
	 */
	private async createLinkedNote(): Promise<void> {
		try {
			
			
			// Get the board to determine folder structure
			const board = this.plugin.dataManager.getBoardById(this.boardId);
			if (!board) {
				new Notice('❌ Could not find board information');
				console.error('Board not found for ID:', this.boardId);
				return;
			}
			

			// Prompt user for note title using Obsidian's native modal
			const title = await this.promptForTitle();
			if (!title) {
				
				return; // User cancelled
			}
			

			// Sanitize title for file system
			const sanitizedTitle = this.sanitizeFileName(title);
			const sanitizedCardTitle = this.sanitizeFileName(this.cardTitle);

			// Create folder path: Kanban/BoardName/CardName/
			const kanbanFolder = this.plugin.settings.kanbanFolderPath || 'Kanban';
			const folderPath = `${kanbanFolder}/${board.name}/${sanitizedCardTitle}`;
			
			
			// Ensure folder exists
			await this.ensureFolderExists(folderPath);

			// Create note path
			const notePath = `${folderPath}/${sanitizedTitle}.md`;
			
			
			// Check if file already exists
			if (this.app.vault.getAbstractFileByPath(notePath)) {
				new Notice(`❌ A note named "${title}" already exists in this location`);
				return;
			}

			// Create the note with basic content
			const noteContent = this.generateNoteContent(title, board.name);
			const file = await this.app.vault.create(notePath, noteContent);
			

			// Wait a moment for file system to sync
			await new Promise(resolve => setTimeout(resolve, 100));

			// Add to linked notes
			this.cardNoteLinks.push(notePath);
			

			// Update the notes display - find it within this modal's content
			const modalContent = this.contentEl;
			let notesDisplay = modalContent.querySelector('.crystal-notes-display') as HTMLElement;
			
			
			
			if (notesDisplay) {
				this.updateNotesDisplay(notesDisplay);
				
			} else {
				console.warn('Could not find notes display element, trying force refresh');
				// Force a re-render of the entire notes section
				this.forceNotesDisplayRefresh();
			}

			// Open the note in a new tab on the right and focus for immediate typing
			await this.openNoteInRightPane(file);
			await this.focusNoteEditor(file);

			new Notice(`✅ Created and linked note: ${title}`);

		} catch (error) {
			console.error('Error creating linked note:', error);
			new Notice(`❌ Failed to create note: ${error.message}`);
		}
	}

	/**
	 * Force refresh of the notes display when DOM selector fails
	 */
	private forceNotesDisplayRefresh(): void {
		try {
			// Search within this modal's content
			const modalContent = this.contentEl;
			
			// Look for the h3 with "Linked Notes" text
			const notesSectionHeaders = modalContent.querySelectorAll('.crystal-section-title');
			for (const header of Array.from(notesSectionHeaders)) {
				if (header.textContent?.includes('Linked Notes')) {
					const section = header.closest('.crystal-card-section');
					if (section) {
						const notesDisplay = section.querySelector('.crystal-notes-display');
						if (notesDisplay) {
							this.updateNotesDisplay(notesDisplay as HTMLElement);
							
							return;
						}
					}
				}
			}
			
			// Fallback: try to find any notes display within the modal
			const notesDisplay = modalContent.querySelector('.crystal-notes-display');
			if (notesDisplay) {
				this.updateNotesDisplay(notesDisplay as HTMLElement);
				
				return;
			}
			
			console.warn('Force refresh failed: Could not find notes section to update');
		} catch (error) {
			console.error('Error in force notes display refresh:', error);
		}
	}

	/**
	 * Prompt user for note title using Obsidian's native prompt
	 */
	private async promptForTitle(): Promise<string | null> {
		return new Promise((resolve) => {
			const modal = new Modal(this.app);
			modal.titleEl.setText('Create Linked Note');

			const content = modal.contentEl;
			content.createEl('p', { text: 'Enter a title for the new note:' });

			const input = content.createEl('input', {
				type: 'text',
				placeholder: 'Note title...'
			});
			input.style.width = '100%';
			input.style.marginBottom = '1rem';

			// Error message placeholder
			const errorMsg = content.createEl('div', {
				cls: 'mod-warning',
				text: ''
			});
			errorMsg.style.display = 'none';
			errorMsg.style.marginBottom = '0.5rem';
			errorMsg.style.fontSize = '0.9rem';

			const buttonContainer = content.createEl('div');
			buttonContainer.style.display = 'flex';
			buttonContainer.style.gap = '0.5rem';
			buttonContainer.style.justifyContent = 'flex-end';

			const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
			const createBtn = buttonContainer.createEl('button', { 
				text: 'Create',
				cls: 'mod-cta'
			});

			const showError = (message: string) => {
				errorMsg.textContent = message;
				errorMsg.style.display = 'block';
				setTimeout(() => {
					errorMsg.style.display = 'none';
				}, 3000);
			};

			let isResolved = false;

			const handleSubmit = () => {
				if (isResolved) return;
				
				const title = input.value.trim();
				if (!title) {
					showError('Please enter a note title');
					input.focus();
					return;
				}
				
				
				
				// Mark as resolved and resolve with title BEFORE closing modal
				isResolved = true;
				resolve(title);
				
				// Close modal after resolving
				setTimeout(() => {
					modal.close();
				}, 10);
			};

			const handleCancel = () => {
				if (isResolved) return;
				
				
				
				// Mark as resolved and resolve with null BEFORE closing modal
				isResolved = true;
				resolve(null);
				
				// Close modal after resolving
				setTimeout(() => {
					modal.close();
				}, 10);
			};

			// Event listeners
			cancelBtn.addEventListener('click', handleCancel);
			createBtn.addEventListener('click', handleSubmit);
			
			input.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					handleSubmit();
				} else if (e.key === 'Escape') {
					e.preventDefault();
					handleCancel();
				}
			});

			// Handle modal close via other means (X button, outside click, etc.)
			modal.onClose = () => {
				if (!isResolved) {
					
					isResolved = true;
					resolve(null);
				}
			};

			modal.open();
			setTimeout(() => input.focus(), 100);
		});
	}

	/**
	 * Sanitize filename for file system compatibility
	 */
	private sanitizeFileName(name: string): string {
		return name
			.replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
			.replace(/\s+/g, ' ') // Replace multiple spaces with single space
			.trim()
			.substring(0, 100); // Limit length
	}

	/**
	 * Ensure folder exists, creating it if necessary
	 */
	private async ensureFolderExists(path: string): Promise<void> {
		const exists = await this.app.vault.adapter.exists(path);
		if (!exists) {
			await this.app.vault.createFolder(path);
		}
	}

	/**
	 * Generate initial content for the new note
	 */
	private generateNoteContent(title: string, boardName: string): string {
		const now = new Date().toISOString().split('T')[0];
		return `# ${title}

**Created:** ${now}  
**Board:** [[${boardName}]]  
**Card:** [[${this.cardTitle}]]

---

## Notes


`;
	}

	/**
	 * Open the note in the right pane
	 */
	private async openNoteInRightPane(file: any): Promise<void> {
		try {
			// Get the current active leaf in the main editor area
			const activeLeaf = this.app.workspace.activeLeaf;
			
			if (activeLeaf) {
				
				// Split the current leaf vertically (creates right pane in main editor)
				const newLeaf = this.app.workspace.createLeafBySplit(activeLeaf, 'vertical');
				await newLeaf.openFile(file);
				this.app.workspace.setActiveLeaf(newLeaf);
				
				return;
			}

			// Fallback: create new leaf in main workspace
			
			const newLeaf = this.app.workspace.getLeaf(true);
			await newLeaf.openFile(file);
			this.app.workspace.setActiveLeaf(newLeaf);

		} catch (error) {
			console.error('Error opening note in right split:', error);
			
			// Ultimate fallback
			const leaf = this.app.workspace.getLeaf(true);
			await leaf.openFile(file);
			this.app.workspace.setActiveLeaf(leaf);
		}
	}

	/**
	 * Focus the editor for immediate typing
	 */
	private async focusNoteEditor(file: any): Promise<void> {
		try {
			// Wait a moment for the view to fully load
			await new Promise(resolve => setTimeout(resolve, 200));

			// Find the markdown view for this file
			const leaves = this.app.workspace.getLeavesOfType('markdown');
			const targetLeaf = leaves.find(leaf => {
				const view = leaf.view as any;
				return view && view.file && view.file.path === file.path;
			});

			if (targetLeaf && targetLeaf.view) {
				const markdownView = targetLeaf.view as any;
				
				// Focus the editor
				if (markdownView.editor && markdownView.editor.focus) {
					markdownView.editor.focus();
					
					// Position cursor at the end of the document for immediate typing
					const lastLine = markdownView.editor.lastLine();
					const lastLineLength = markdownView.editor.getLine(lastLine).length;
					markdownView.editor.setCursor(lastLine, lastLineLength);
					
					
				}
			}
		} catch (error) {
			console.error('Error focusing editor:', error);
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
					
					const smartExtractService = this.plugin.smartExtractionService;
					
					// Step 1: Try MCP scraping first (same as smart extract)
					let content = await smartExtractService.tryMCPScraping(url.url);
					
					if (content && content.trim()) {
						
						
						// Step 2: Use content directly (OpenAI service not directly accessible)
						const summary = content.substring(0, 200) + (content.length > 200 ? '...' : '');
						
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
							
						} else {
							const fallbackSummary = 'Summary could not be generated from URL content.';
							this.cardResearchUrls[index].description = fallbackSummary;
							if (summaryText) {
								summaryText.textContent = fallbackSummary;
							}
						}
					} else {
						
						
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
									const summary = textContent.substring(0, 200) + (textContent.length > 200 ? '...' : '');
									
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
		const todoId = `todo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
			const todoEl = container.createEl('div', { cls: 'crystal-todo-item-redesigned' });
			
			// Checkbox on the left
			const checkbox = todoEl.createEl('input', {
				type: 'checkbox',
				cls: 'crystal-todo-checkbox-left'
			});
			checkbox.checked = todo.completed;
			checkbox.onchange = () => {
				this.cardTodos[index].completed = checkbox.checked;
				// Update text input styling based on completion
				this.updateTodoTextStyling(textInput, checkbox.checked);
				// Update progress bar
				const progressContainer = this.contentEl.querySelector('.crystal-progress-container');
				if (progressContainer) {
					progressContainer.remove();
					const headerEl = this.contentEl.querySelector('.crystal-card-modal-header') as HTMLElement;
					this.renderProgressBar(headerEl);
				}
			};
			
			// Task title input - expanded width
			const textInput = todoEl.createEl('input', {
				type: 'text',
				cls: 'crystal-todo-text-redesigned',
				value: todo.text,
				placeholder: 'Enter task description...'
			});
			
			// Apply initial styling based on completion status
			this.updateTodoTextStyling(textInput, todo.completed);
			
			textInput.onchange = () => {
				this.cardTodos[index].text = textInput.value;
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

			// Remove button
			const removeBtn = todoEl.createEl('button', {
				text: '×',
				cls: 'crystal-todo-remove-redesigned'
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
		});
	}
	
	/**
	 * Update todo text styling based on completion status
	 */
	/**
	 * Update todo text styling based on completion status
	 */
	private updateTodoTextStyling(textInput: HTMLInputElement, completed: boolean): void {
		if (completed) {
			textInput.style.textDecoration = 'line-through';
			textInput.style.color = 'var(--text-muted)';
			textInput.readOnly = true;
			textInput.style.cursor = 'default';
		} else {
			textInput.style.textDecoration = 'none';
			textInput.style.color = 'var(--text-normal)';
			textInput.readOnly = false;
			textInput.style.cursor = 'text';
		}
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
			// Simple inline implementation for detected URLs
			const urlContainer = todoEl.createEl('div', { cls: 'crystal-todo-urls' });
			detectedUrls.forEach(url => {
				const urlEl = urlContainer.createEl('div', { cls: 'crystal-detected-url' });
				urlEl.createEl('a', { text: url.title || url.url, href: url.url, cls: 'external-link' });
			});
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
				// Simple inline implementation for AI summary
				const summaryContainer = todoEl.createEl('div', { cls: 'crystal-ai-summary' });
				summaryContainer.createEl('div', { text: 'AI Summary:', cls: 'crystal-summary-title' });
				summaryContainer.createEl('div', { text: result.summary.content || 'Summary generated', cls: 'crystal-summary-content' });
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
			
			
			if (hoverTimeout) {
				clearTimeout(hoverTimeout);
			}
			
			hoverTimeout = setTimeout(async () => {
				try {
					
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
						
					});
					
					previewEl.addEventListener('mouseleave', () => {
						
						setTimeout(() => {
							if (previewEl) {
								previewEl.remove();
								previewEl = null;
							}
						}, 100);
					});
					
					
					
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
						
					});
					
					previewEl.addEventListener('mouseleave', () => {
						
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