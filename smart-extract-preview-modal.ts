import { Modal, Setting, Notice } from 'obsidian';
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

		// URLs if any
		if (card.researchUrls.length > 0) {
			const urlsEl = cardEl.createEl('div', { cls: 'card-urls' });
			urlsEl.createEl('strong', { text: 'Related URLs:' });
			for (const researchUrl of card.researchUrls) {
				const urlEl = urlsEl.createEl('div', { cls: 'url-item' });
				const link = urlEl.createEl('a', { 
					text: researchUrl.title,
					href: researchUrl.url
				});
				link.setAttr('target', '_blank');
				
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
	 * Open inline editor for a specific card
	 */
	private openCardEditor(card: SmartCard, cardEl: HTMLElement) {
		const cardId = card.id;
		
		// Create editor container
		const editorEl = cardEl.createEl('div', { cls: 'card-editor' });
		
		// Title editor
		const titleSection = editorEl.createEl('div', { cls: 'editor-section' });
		titleSection.createEl('label', { text: 'Title:' });
		const titleInput = titleSection.createEl('input', { 
			type: 'text',
			value: card.title,
			cls: 'editor-input'
		});

		// Description editor
		const descSection = editorEl.createEl('div', { cls: 'editor-section' });
		descSection.createEl('label', { text: 'Description:' });
		const descTextarea = descSection.createEl('textarea', {
			value: card.description,
			cls: 'editor-textarea'
		});
		descTextarea.rows = 3;

		// Next steps editor
		const stepsSection = editorEl.createEl('div', { cls: 'editor-section' });
		stepsSection.createEl('label', { text: 'Next Steps (one per line):' });
		const stepsTextarea = stepsSection.createEl('textarea', {
			value: card.aiAnalysis?.nextSteps.join('\n') || '',
			cls: 'editor-textarea'
		});
		stepsTextarea.rows = 4;

		// Editor buttons
		const editorButtons = editorEl.createEl('div', { cls: 'editor-buttons' });
		
		const cancelBtn = editorButtons.createEl('button', { 
			text: 'Cancel',
			cls: 'editor-btn-cancel'
		});
		cancelBtn.onclick = () => {
			editorEl.remove();
		};

		const saveBtn = editorButtons.createEl('button', { 
			text: 'Save Changes',
			cls: 'editor-btn-save'
		});
		saveBtn.onclick = () => {
			// Save modifications
			this.approval.modifications[cardId] = {
				title: titleInput.value.trim(),
				description: descTextarea.value.trim(),
				nextSteps: stepsTextarea.value.trim().split('\n').filter(s => s.trim())
			};

			// Update the card preview display
			this.updateCardDisplay(card, cardEl, this.approval.modifications[cardId]);
			
			// Remove editor
			editorEl.remove();
			
			new Notice('✅ Card changes saved');
		};

		// Hide the card preview content while editing
		const cardContent = cardEl.querySelector('.ai-analysis') as HTMLElement;
		if (cardContent) {
			cardContent.style.display = 'none';
		}
		
		// Restore content when editor is removed
		const originalRemove = editorEl.remove;
		editorEl.remove = function() {
			if (cardContent) {
				cardContent.style.display = 'block';
			}
			originalRemove.call(editorEl);
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