import { Modal, Setting, Notice } from 'obsidian';
import { Modal, Notice } from 'obsidian';
import CrystalBoardsPlugin from './main';
import { SmartCard, SmartExtractionPreview, SmartExtractApproval } from './smart-extraction-service';

export class SmartExtractPreviewModal extends Modal {
	private plugin: CrystalBoardsPlugin;
	private preview: SmartExtractionPreview;
	private approval: SmartExtractApproval;
	public onApprovalCallback?: (approval: SmartExtractApproval) => Promise<any>;

	constructor(plugin: CrystalBoardsPlugin, preview: SmartExtractionPreview) {
		super(plugin.app);
		this.plugin = plugin;
		this.preview = preview;
		this.approval = {
			approved: false,
			selectedCards: [...preview.smartCards],
			modifications: {}
		};
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('smart-extract-preview-modal');

		// Header
		const headerEl = contentEl.createEl('div', { cls: 'smart-extract-header' });
		headerEl.createEl('h2', { text: '🤖 Smart Extract Preview' });
		
		// Summary stats
		const statsEl = contentEl.createEl('div', { cls: 'smart-extract-stats' });
		statsEl.createEl('p', { 
			text: `Found ${this.preview.totalTasks} tasks total` 
		});
		
		if (this.preview.estimatedCost > 0) {
			statsEl.createEl('p', { 
				text: `💰 ~$${this.preview.estimatedCost.toFixed(4)} cost` 
			});
		}
		
		if (this.preview.averageConfidence > 0) {
			const confidencePercent = (this.preview.averageConfidence * 100).toFixed(0);
			statsEl.createEl('p', { 
				text: `🎯 ${confidencePercent}% confidence` 
			});
		}

		// Cards preview
		if (this.preview.smartCards.length > 0) {
			const cardsHeaderEl = contentEl.createEl('div', { cls: 'cards-header' });
			cardsHeaderEl.createEl('h3', { text: 'Tasks Preview' });
			const cardsContainer = contentEl.createEl('div', { cls: 'smart-cards-preview' });

			for (const card of this.preview.smartCards) {
				this.renderCardPreview(cardsContainer, card);
			}
		}

		// Action buttons
		const buttonsEl = contentEl.createEl('div', { cls: 'modal-buttons' });
		
		const cancelBtn = buttonsEl.createEl('button', { 
			text: 'Cancel',
			cls: 'mod-cancel'
		});
		cancelBtn.onclick = () => this.close();

		const previewBtn = buttonsEl.createEl('button', { 
			text: 'Generate Full Preview',
			cls: 'mod-secondary'
		});
		previewBtn.onclick = () => this.generateFullPreview();

		const approveBtn = buttonsEl.createEl('button', { 
			text: this.getExtractButtonText(),
			cls: 'mod-cta'
		});
		approveBtn.onclick = () => this.approveExtraction();

		// Set initial button state
		this.updateExtractButton();
	}

	private renderCardPreview(container: HTMLElement, card: SmartCard) {
		const cardEl = container.createEl('div', { cls: 'smart-card-preview' });

		// Card header with checkbox and confidence
		const headerEl = cardEl.createEl('div', { cls: 'card-header' });
		
		const checkbox = headerEl.createEl('input', { type: 'checkbox' });
		checkbox.checked = this.approval.selectedCards.includes(card);
		checkbox.onchange = () => {
			if (checkbox.checked) {
				if (!this.approval.selectedCards.includes(card)) {
					this.approval.selectedCards.push(card);
				}
			} else {
				const index = this.approval.selectedCards.indexOf(card);
				if (index > -1) {
					this.approval.selectedCards.splice(index, 1);
				}
			}
			// Update the extract button text
			this.updateExtractButton();
		};

		const titleEl = headerEl.createEl('span', { 
			cls: 'card-title',
			text: card.title 
		});

		const confidenceEl = headerEl.createEl('span', { 
			cls: 'confidence-badge',
			text: `${(card.confidence * 100).toFixed(0)}%`
		});
		confidenceEl.title = 'AI Confidence Level';

		// AI Analysis
		if (card.aiAnalysis) {
			const analysisEl = cardEl.createEl('div', { cls: 'ai-analysis' });
			
			// Context
			if (card.aiAnalysis.context) {
				const contextEl = analysisEl.createEl('div', { cls: 'ai-context' });
				contextEl.createEl('strong', { text: 'Context: ' });
				contextEl.createSpan({ text: card.aiAnalysis.context });
			}

			// Description
			if (card.aiAnalysis.description) {
				const descEl = analysisEl.createEl('div', { cls: 'ai-description' });
				descEl.createEl('strong', { text: 'Description: ' });
				descEl.createSpan({ text: card.aiAnalysis.description });
			}

			// Next Steps
			if (card.aiAnalysis.nextSteps.length > 0) {
				const stepsEl = analysisEl.createEl('div', { cls: 'ai-next-steps' });
				stepsEl.createEl('strong', { text: 'Suggested Next Steps:' });
				const stepsList = stepsEl.createEl('ul');
				for (const step of card.aiAnalysis.nextSteps) {
					stepsList.createEl('li', { text: step });
				}
			}
		}

		// AI Summary if available
		if (card.aiSummary) {
			const summaryEl = cardEl.createEl('div', { cls: 'ai-summary-preview' });
			summaryEl.createEl('strong', { text: '🤖 AI Summary: ' });
			summaryEl.createEl('p', { 
				cls: 'ai-summary-text',
				text: card.aiSummary.summary 
			});
		}

		// Linked Note if created
		if (card.linkedNote) {
			const noteEl = cardEl.createEl('div', { cls: 'linked-note-preview' });
			noteEl.createEl('strong', { text: '📝 Auto-created Note: ' });
			const noteLink = noteEl.createEl('a', {
				text: card.linkedNote.name,
				cls: 'internal-link'
			});
			noteLink.onclick = () => {
				// Open the linked note in Obsidian
				this.plugin.app.workspace.openLinkText(card.linkedNote.path, '');
			};
		}

		// URLs if any
		if (card.researchUrls.length > 0) {
			const urlsEl = cardEl.createEl('div', { cls: 'card-urls' });
			urlsEl.createEl('strong', { text: 'Related URLs:' });
			for (const researchUrl of card.researchUrls) {
				const urlEl = urlsEl.createEl('div', { cls: 'url-item' });
				const urlHeader = urlEl.createEl('div', { cls: 'url-header' });
				
				const link = urlHeader.createEl('a', { 
					text: researchUrl.title,
					href: researchUrl.url
				});
				link.setAttr('target', '_blank');
				
				// Create Note button for this URL
				const createNoteBtn = urlHeader.createEl('button', {
					text: '📝 Create Note',
					cls: 'create-note-btn'
				});
				createNoteBtn.title = 'Create Obsidian note from URL summary';
				createNoteBtn.onclick = async () => {
					await this.createNoteFromUrl(researchUrl, card.originalTask.cleanText);
				};
				
				if (researchUrl.description) {
					urlEl.createEl('p', { 
						cls: 'url-summary',
						text: researchUrl.description 
					});
				}
			}
		}

		// Edit button for modifications
		const editBtn = cardEl.createEl('button', { 
			text: '✏️ Edit',
			cls: 'card-edit-btn'
		});
		editBtn.title = 'Edit AI suggestions';
		editBtn.onclick = () => {
			this.openCardEditor(card, cardEl);
		};
	}

	private async generateFullPreview() {
		const btn = this.contentEl.querySelector('.mod-secondary') as HTMLButtonElement;
		if (btn) {
			btn.disabled = true;
			btn.textContent = 'Generating...';
		}

		try {
			const fullPreview = await this.plugin.smartExtractionService.generatePreview();
			// Close this modal and open a new one with full preview
			this.close();
			new SmartExtractPreviewModal(this.plugin, fullPreview).open();
		} catch (error) {
			new Notice(`Failed to generate full preview: ${error.message}`);
		} finally {
			if (btn) {
				btn.disabled = false;
				btn.textContent = 'Generate Full Preview';
			}
		}
	}

	async approveExtraction() {
		const btn = this.contentEl.querySelector('.mod-cta') as HTMLButtonElement;
		if (btn) {
			btn.disabled = true;
			btn.textContent = 'Extracting...';
		}

		try {
			// Mark as approved
			this.approval.approved = true;
			
			if (this.onApprovalCallback) {
				// Execute the extraction through the callback
				const result = await this.onApprovalCallback(this.approval);
				
				if (result && result.success) {
					new Notice(`✅ Successfully extracted ${result.tasksAnalyzed} tasks with AI analysis`);
					
					// Refresh dashboard if it's open
					const dashboardLeaves = this.app.workspace.getLeavesOfType('crystal-boards-dashboard');
					for (const leaf of dashboardLeaves) {
						if (leaf.view && (leaf.view as any).renderDashboard) {
							await (leaf.view as any).renderDashboard();
						}
					}
				} else {
					const errorMsg = result?.errors?.join(', ') || 'Unknown error';
					new Notice(`❌ Smart extraction failed: ${errorMsg}`);
				}
			} else {
				new Notice(`✅ Approved ${this.approval.selectedCards.length} tasks for extraction`);
			}
			
			this.close();
			
		} catch (error) {
			console.error('Approval failed:', error);
			new Notice(`❌ Approval failed: ${error.message}`);
		} finally {
			if (btn) {
				btn.disabled = false;
				btn.textContent = 'Extract Selected';
			}
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	getApproval(): SmartExtractApproval {
		return this.approval;
	}

	private getExtractButtonText(): string {
		const selectedCount = this.approval.selectedCards.length;
		if (selectedCount === 0) {
			return 'Select todos to extract';
		} else if (selectedCount === 1) {
			return 'Extract 1 todo';
		} else {
			return `Extract ${selectedCount} todos`;
		}
	}

	private updateExtractButton(): void {
		const approveBtn = this.contentEl.querySelector('.mod-cta') as HTMLButtonElement;
		if (approveBtn) {
			approveBtn.textContent = this.getExtractButtonText();
			approveBtn.disabled = this.approval.selectedCards.length === 0;
		}
	}

	/**
	 * Create a note from URL summary
	 */
	private async createNoteFromUrl(researchUrl: any, taskContext: string): Promise<void> {
		try {
			// Show loading state
			const button = document.querySelector('.create-note-btn:focus') as HTMLElement;
			const originalText = button?.textContent;
			if (button) {
				button.textContent = '⏳ Creating...';
				button.setAttribute('disabled', 'true');
			}

			// Check if OpenAI API key is configured
			if (!this.plugin.settings.openAIApiKey) {
				throw new Error('OpenAI API key not configured. Please configure it in settings.');
			}

			// Use TodoAIService to create note
			const todoAIService = new (await import('./todo-ai-service')).TodoAIService(this.plugin);
			
			// Create a TodoItem for this URL
			const todoItem = {
				id: `temp-${Date.now()}`,
				text: taskContext,
				completed: false,
				created: Date.now(),
				urls: [{
					id: researchUrl.id || `url-${Date.now()}`,
					url: researchUrl.url,
					title: researchUrl.title,
					description: researchUrl.description || '',
					created: Date.now(),
					status: 'unread' as const,
					importance: 'medium' as const
				}]
			};

			// Process with AI to create note
			const result = await todoAIService.processTodoWithAI(todoItem, {
				createNote: true,
				linkToCard: true,
				notePath: 'AI Notes/',
				noteTemplate: ''
			});

			if (result.success && result.note) {
				// Success feedback
				if (button) {
					button.textContent = '✅ Created!';
					button.style.background = 'var(--interactive-success)';
					
					// Open the created note
					setTimeout(() => {
						this.plugin.app.workspace.openLinkText(result.note!.path, '');
					}, 500);

					// Reset button after delay
					setTimeout(() => {
						if (originalText && button) {
							button.textContent = originalText;
							button.removeAttribute('disabled');
							button.style.background = '';
						}
					}, 2000);
				}

				// Show success notice
				new Notice(`✅ Note created: ${result.note.basename}`);
			} else {
				throw new Error(result.errors?.join(', ') || 'Failed to create note');
			}

		} catch (error) {
			console.error('Failed to create note from URL:', error);
			new Notice(`❌ Failed to create note: ${error.message}`);
			
			// Reset button
			const button = document.querySelector('.create-note-btn:focus') as HTMLElement;
			if (button && button.textContent?.includes('Creating')) {
				button.textContent = '📝 Create Note';
				button.removeAttribute('disabled');
			}
		}
	}

	/**
	 * Open inline editor for a specific card
	 */
	private openCardEditor(card: SmartCard, cardEl: HTMLElement) {
	const cardId = card.id;
	
	// Get existing modifications or use original card data
	const existingModifications = this.approval.modifications[cardId];
	const currentTitle = existingModifications?.title || card.title;
	const currentDescription = existingModifications?.description || card.description || '';
	const currentContext = existingModifications?.context || card.aiAnalysis?.context || '';
	const currentNextSteps = existingModifications?.nextSteps || card.aiAnalysis?.nextSteps || [];
	
	// Find the AI analysis section or create it if it doesn't exist
	let analysisEl = cardEl.querySelector('.ai-analysis') as HTMLElement;
	if (!analysisEl) {
		analysisEl = cardEl.createEl('div', { cls: 'ai-analysis' });
	}
	
	// Store original content to restore on cancel
	const originalContent = analysisEl.innerHTML;
	
	// Clear the analysis section for editing mode
	analysisEl.innerHTML = '';
	analysisEl.addClass('editing-mode');
	
	// Context editor section
	if (currentContext || card.aiAnalysis?.context) {
		const contextEl = analysisEl.createEl('div', { cls: 'ai-context editable-section' });
		contextEl.createEl('strong', { text: 'Context: ' });
		const contextTextarea = contextEl.createEl('textarea', {
			cls: 'inline-editor',
			value: currentContext
		});
		contextTextarea.rows = 3;
		contextTextarea.placeholder = 'Describe the context of this task...';
		// Auto-resize textarea based on content
		contextTextarea.style.height = 'auto';
		contextTextarea.style.height = contextTextarea.scrollHeight + 'px';
		contextTextarea.addEventListener('input', () => {
			contextTextarea.style.height = 'auto';
			contextTextarea.style.height = contextTextarea.scrollHeight + 'px';
		});
	}
	
	// Description editor section
	const descEl = analysisEl.createEl('div', { cls: 'ai-description editable-section' });
	descEl.createEl('strong', { text: 'Description: ' });
	const descTextarea = descEl.createEl('textarea', {
		cls: 'inline-editor',
		value: currentDescription
	});
	descTextarea.rows = 5;
	descTextarea.placeholder = 'Provide a detailed description...';
	// Auto-resize textarea based on content
	descTextarea.style.height = 'auto';
	descTextarea.style.height = descTextarea.scrollHeight + 'px';
	descTextarea.addEventListener('input', () => {
		descTextarea.style.height = 'auto';
		descTextarea.style.height = descTextarea.scrollHeight + 'px';
	});
	
	// Next Steps editor section  
	const stepsEl = analysisEl.createEl('div', { cls: 'ai-next-steps editable-section' });
	stepsEl.createEl('strong', { text: 'Suggested Next Steps:' });
	const stepsContainer = stepsEl.createEl('div', { cls: 'steps-editor-container' });
	
	// Create editable list items for each step
	const stepInputs: HTMLInputElement[] = [];
	currentNextSteps.forEach((step, index) => {
		const stepItem = stepsContainer.createEl('div', { cls: 'step-item' });
		const bullet = stepItem.createEl('span', { text: '• ', cls: 'step-bullet' });
		const stepInput = stepItem.createEl('input', {
			type: 'text',
			value: step,
			cls: 'step-input',
			placeholder: 'Enter a next step...'
		});
		stepInputs.push(stepInput);
		
		// Add remove button for each step
		const removeBtn = stepItem.createEl('button', {
			text: '✕',
			cls: 'remove-step-btn',
			title: 'Remove this step'
		});
		removeBtn.onclick = () => {
			stepItem.remove();
			const idx = stepInputs.indexOf(stepInput);
			if (idx > -1) stepInputs.splice(idx, 1);
		};
	});
	
	// Add button to add new steps
	const addStepBtn = stepsContainer.createEl('button', {
		text: '+ Add Step',
		cls: 'add-step-btn'
	});
	addStepBtn.onclick = () => {
		const stepItem = document.createElement('div');
		stepItem.className = 'step-item';
		const bullet = stepItem.createEl('span', { text: '• ', cls: 'step-bullet' });
		const stepInput = stepItem.createEl('input', {
			type: 'text',
			value: '',
			cls: 'step-input',
			placeholder: 'Enter a next step...'
		});
		stepInputs.push(stepInput);
		
		const removeBtn = stepItem.createEl('button', {
			text: '✕',
			cls: 'remove-step-btn',
			title: 'Remove this step'
		});
		removeBtn.onclick = () => {
			stepItem.remove();
			const idx = stepInputs.indexOf(stepInput);
			if (idx > -1) stepInputs.splice(idx, 1);
		};
		
		stepsContainer.insertBefore(stepItem, addStepBtn);
		stepInput.focus();
	};
	
	// Update the edit button to show it's in edit mode
	const editBtn = cardEl.querySelector('.card-edit-btn') as HTMLButtonElement;
	if (editBtn) {
		editBtn.style.display = 'none';
	}
	
	// Add save/cancel buttons at the bottom
	const editorButtons = analysisEl.createEl('div', { cls: 'editor-buttons' });
	
	const cancelBtn = editorButtons.createEl('button', { 
		text: 'Cancel',
		cls: 'editor-btn-cancel'
	});
	cancelBtn.onclick = () => {
		// Restore original content
		analysisEl.innerHTML = originalContent;
		analysisEl.removeClass('editing-mode');
		if (editBtn) editBtn.style.display = '';
	};
	
	const saveBtn = editorButtons.createEl('button', { 
		text: 'Save Changes',
		cls: 'editor-btn-save mod-cta'
	});
	saveBtn.onclick = () => {
		// Get context value if it exists
		const contextTextarea = analysisEl.querySelector('.ai-context textarea') as HTMLTextAreaElement;
		const contextValue = contextTextarea?.value.trim();
		
		// Save modifications
		const modifications = {
			title: currentTitle, // Keep the existing title
			description: descTextarea.value.trim(),
			context: contextValue,
			nextSteps: stepInputs
				.map(input => input.value.trim())
				.filter(s => s.length > 0)
		};
		this.approval.modifications[cardId] = modifications;
		
		// Rebuild the display with the new values
		analysisEl.innerHTML = '';
		analysisEl.removeClass('editing-mode');
		
		// Recreate the display with updated values
		if (contextValue) {
			const contextEl = analysisEl.createEl('div', { cls: 'ai-context' });
			contextEl.createEl('strong', { text: 'Context: ' });
			contextEl.createSpan({ text: contextValue });
		}
		
		if (modifications.description) {
			const descEl = analysisEl.createEl('div', { cls: 'ai-description' });
			descEl.createEl('strong', { text: 'Description: ' });
			descEl.createSpan({ text: modifications.description });
		}
		
		if (modifications.nextSteps && modifications.nextSteps.length > 0) {
			const stepsEl = analysisEl.createEl('div', { cls: 'ai-next-steps' });
			stepsEl.createEl('strong', { text: 'Suggested Next Steps:' });
			const stepsList = stepsEl.createEl('ul');
			for (const step of modifications.nextSteps) {
				stepsList.createEl('li', { text: step });
			}
		}
		
		// Add modified indicator if not already present
		let modifiedIndicator = cardEl.querySelector('.modified-indicator') as HTMLElement;
		if (!modifiedIndicator) {
			const headerEl = cardEl.querySelector('.card-header');
			if (headerEl) {
				modifiedIndicator = headerEl.createEl('span', { 
					cls: 'modified-indicator',
					text: '✏️ Modified',
					title: 'This card has been edited'
				});
			}
		}
		
		// Show edit button again
		if (editBtn) editBtn.style.display = '';
		
		new Notice('✅ Card changes saved');
	};
}

	/**
	 * Update card display with modifications
	 */
	private updateCardDisplay(card: SmartCard, cardEl: HTMLElement, modifications: any) {
		// Update title
		if (modifications.title) {
			const titleEl = cardEl.querySelector('.card-title') as HTMLElement;
			if (titleEl) {
				titleEl.textContent = modifications.title;
			}
		}

		// Update description
		if (modifications.description) {
			const descEl = cardEl.querySelector('.ai-description span') as HTMLElement;
			if (descEl) {
				descEl.textContent = modifications.description;
			}
		}

		// Update next steps
		if (modifications.nextSteps && modifications.nextSteps.length > 0) {
			const stepsEl = cardEl.querySelector('.ai-next-steps ul') as HTMLElement;
			if (stepsEl) {
				stepsEl.innerHTML = '';
				for (const step of modifications.nextSteps) {
					stepsEl.createEl('li', { text: step });
				}
			}
		}

		// Add modified indicator
		let modifiedIndicator = cardEl.querySelector('.modified-indicator') as HTMLElement;
		if (!modifiedIndicator) {
			const headerEl = cardEl.querySelector('.card-header');
			if (headerEl) {
				modifiedIndicator = headerEl.createEl('span', { 
					cls: 'modified-indicator',
					text: '✏️ Modified',
					title: 'This card has been edited'
				});
			}
		}
	}
}