import { App, Modal, Setting, TFile, MarkdownRenderer } from 'obsidian';
import CrystalBoardsPlugin from './main';
import { Card, TodoItem, ResearchUrl } from './types';
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

		// Card Title
		new Setting(scrollEl)
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

		// Card Description
		new Setting(scrollEl)
			.setName('Description')
			.setDesc('Detailed description of the card')
			.addTextArea((textArea) => {
				textArea.setPlaceholder('Enter description...')
					.setValue(this.cardDescription)
					.onChange((value) => {
						this.cardDescription = value;
					});
				textArea.inputEl.style.minHeight = '80px';
			});

		// Tags Section
		this.renderTagsSection(scrollEl);

		// Linked Notes Section
		this.renderNotesSection(scrollEl);

		// Todos Section
		this.renderTodosSection(scrollEl);

		// Research URLs Section
		this.renderResearchSection(scrollEl);

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

		// Note search
		new Setting(section)
			.setName('Add Note')
			.setDesc('Search for notes to link to this card')
			.addText((text) => {
				text.setPlaceholder('Search notes...')
					.onChange((searchTerm) => {
						this.searchNotes(searchTerm, section);
					});
			});

		// Search results container
		section.createEl('div', { cls: 'crystal-note-search-results' });
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

	private searchNotes(searchTerm: string, container: HTMLElement): void {
		const searchResultsEl = container.querySelector('.crystal-note-search-results') as HTMLElement;
		if (!searchResultsEl) return;

		searchResultsEl.empty();

		if (!searchTerm.trim()) {
			this.noteSearchResults = [];
			return;
		}

		this.noteSearchResults = this.allMarkdownFiles
			.filter(file => 
				file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
				file.path.toLowerCase().includes(searchTerm.toLowerCase())
			)
			.filter(file => !this.cardNoteLinks.includes(file.path))
			.slice(0, 8);

		if (this.noteSearchResults.length > 0) {
			const resultsContainer = searchResultsEl.createEl('div', { cls: 'crystal-search-results' });
			
			this.noteSearchResults.forEach(file => {
				const resultEl = resultsContainer.createEl('div', { cls: 'crystal-search-result' });
				resultEl.createEl('span', { text: file.basename });
				resultEl.createEl('span', { 
					text: file.path,
					cls: 'crystal-note-path'
				});
				
				resultEl.onclick = () => {
					if (!this.cardNoteLinks.includes(file.path)) {
						this.cardNoteLinks.push(file.path);
						this.updateNotesDisplay(container.querySelector('.crystal-notes-display') as HTMLElement);
						searchResultsEl.empty();
						
						// Clear search input
						const searchInput = container.querySelector('input') as HTMLInputElement;
						if (searchInput) searchInput.value = '';
					}
				};
			});
		}
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
			const todoEl = container.createEl('div', { cls: 'crystal-todo-item' });
			
			const checkbox = todoEl.createEl('input', {
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
			
			const textInput = todoEl.createEl('input', {
				type: 'text',
				cls: 'crystal-todo-text',
				value: todo.text,
				placeholder: 'Enter task description...'
			});
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
			
			const removeBtn = todoEl.createEl('button', {
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
		});
	}

	private renderResearchSection(container: HTMLElement): void {
		const section = container.createEl('div', { cls: 'crystal-card-section' });
		const titleContainer = section.createEl('div', { cls: 'crystal-section-title-container' });
		titleContainer.createEl('h3', { text: 'Research & URLs', cls: 'crystal-section-title' });
		
		// Add URL button
		const addBtn = titleContainer.createEl('button', {
			text: '+ Add URL',
			cls: 'crystal-add-btn'
		});
		addBtn.onclick = () => this.addNewResearchUrl(section);

		// URLs display
		const urlsDisplay = section.createEl('div', { cls: 'crystal-urls-display' });
		this.updateUrlsDisplay(urlsDisplay);
	}

	private addNewResearchUrl(section: HTMLElement): void {
		const urlId = this.generateId();
		const newUrl: ResearchUrl = {
			id: urlId,
			title: '',
			url: '',
			description: '',
			created: Date.now()
		};
		
		this.cardResearchUrls.push(newUrl);
		this.updateUrlsDisplay(section.querySelector('.crystal-urls-display') as HTMLElement);
	}

	private updateUrlsDisplay(container: HTMLElement): void {
		container.empty();
		
		if (this.cardResearchUrls.length === 0) {
			container.createEl('div', { 
				text: 'No research URLs added yet',
				cls: 'crystal-empty-state'
			});
			return;
		}

		this.cardResearchUrls.forEach((url, index) => {
			const urlEl = container.createEl('div', { cls: 'crystal-url-item' });
			
			const titleInput = urlEl.createEl('input', {
				type: 'text',
				cls: 'crystal-url-title',
				value: url.title,
				placeholder: 'Link title...'
			});
			titleInput.onchange = () => {
				this.cardResearchUrls[index].title = titleInput.value;
			};
			
			const urlInput = urlEl.createEl('input', {
				type: 'url',
				cls: 'crystal-url-input',
				value: url.url,
				placeholder: 'https://...'
			});
			urlInput.onchange = async () => {
				const newUrl = urlInput.value.trim();
				this.cardResearchUrls[index].url = newUrl;
				
				// Auto-enhance URL if it looks like a valid URL and title is empty
				if (newUrl && this.isValidUrl(newUrl) && !this.cardResearchUrls[index].title.trim()) {
					try {
						// Show loading state
						titleInput.value = '⏳ Loading title...';
						titleInput.disabled = true;
						
						// Enhance the URL
						const metadata = await this.linkManager.enhanceUrl(newUrl);
						
						// Update title and description with enhanced data
						this.cardResearchUrls[index].title = metadata.title;
						this.cardResearchUrls[index].description = metadata.description;
						
						// Update UI
						titleInput.value = metadata.title;
						descInput.value = metadata.description;
						titleInput.disabled = false;
						
						// Add category indicator
						this.addCategoryIndicator(urlEl, metadata);
						
					} catch (error) {
						console.warn('Failed to enhance URL:', error);
						titleInput.value = '';
						titleInput.disabled = false;
					}
				}
			};
			
			const descInput = urlEl.createEl('input', {
				type: 'text',
				cls: 'crystal-url-description',
				value: url.description || '',
				placeholder: 'Optional description...'
			});
			descInput.onchange = () => {
				this.cardResearchUrls[index].description = descInput.value;
			};
			
			const actionsEl = urlEl.createEl('div', { cls: 'crystal-url-actions' });
			
			if (url.url) {
				const openBtn = actionsEl.createEl('button', {
					text: '🔗',
					cls: 'crystal-url-open',
					attr: { 'aria-label': 'Open URL' }
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
				this.updateUrlsDisplay(container);
			};
		});
	}

	private saveCard(): void {
		if (!this.cardTitle.trim()) {
			// TODO: Show validation error
			return;
		}

		const updatedCard: Card = {
			...this.card,
			title: this.cardTitle.trim(),
			description: this.cardDescription.trim(),
			tags: this.cardTags.filter(tag => tag.trim()),
			noteLinks: this.cardNoteLinks,
			todos: this.cardTodos.filter(todo => todo.text.trim()),
			researchUrls: this.cardResearchUrls.filter(url => url.url.trim()),
			modified: Date.now()
		};

		this.onSave(updatedCard);
		this.close();
	}

	private generateId(): string {
		return Math.random().toString(36).substr(2, 9);
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