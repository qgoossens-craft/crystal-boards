import { Modal, App } from 'obsidian';
import CrystalBoardsPlugin from './main';

export class SmartExtractLoadingModal extends Modal {
	private plugin: CrystalBoardsPlugin;
	private progressContainer: HTMLElement;
	private progressBar: HTMLElement;
	private statusText: HTMLElement;
	private cancelButton: HTMLElement;
	private isCancelled: boolean = false;
	private onCancelCallback?: () => void;

	constructor(plugin: CrystalBoardsPlugin) {
		super(plugin.app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('smart-extract-loading-modal');

		// Header
		const header = contentEl.createEl('div', { cls: 'smart-extract-loading-header' });
		header.createEl('h2', { 
			text: '🤖 Smart Extract Processing',
			cls: 'smart-extract-loading-title'
		});

		// Status text
		this.statusText = contentEl.createEl('p', { 
			text: 'Initializing...',
			cls: 'smart-extract-loading-status'
		});

		// Progress container
		this.progressContainer = contentEl.createEl('div', { cls: 'smart-extract-progress-container' });
		
		// Progress bar background
		const progressBg = this.progressContainer.createEl('div', { cls: 'smart-extract-progress-bg' });
		
		// Progress bar fill
		this.progressBar = progressBg.createEl('div', { cls: 'smart-extract-progress-bar' });

		// Progress percentage
		const progressText = this.progressContainer.createEl('div', { 
			cls: 'smart-extract-progress-text',
			text: '0%'
		});

		// Cancel button
		const buttonContainer = contentEl.createEl('div', { cls: 'smart-extract-loading-buttons' });
		this.cancelButton = buttonContainer.createEl('button', {
			text: '❌ Cancel',
			cls: 'smart-extract-cancel-btn'
		});
		
		this.cancelButton.addEventListener('click', () => {
			this.isCancelled = true;
			this.statusText.setText('Cancelling...');
			this.cancelButton.disabled = true;
			if (this.onCancelCallback) {
				this.onCancelCallback();
			}
		});

		// Prevent modal from closing on escape/click outside during processing
		this.scope.unregister();
	}

	updateProgress(percentage: number, status: string) {
		if (this.isCancelled) return;
		
		this.progressBar.style.width = `${Math.max(0, Math.min(100, percentage))}%`;
		this.progressContainer.querySelector('.smart-extract-progress-text')!.textContent = `${Math.round(percentage)}%`;
		this.statusText.setText(status);
	}

	setStatus(status: string) {
		if (this.isCancelled) return;
		this.statusText.setText(status);
	}

	onCancel(callback: () => void) {
		this.onCancelCallback = callback;
	}

	isCancelRequested(): boolean {
		return this.isCancelled;
	}

	showSuccess(message: string) {
		this.progressBar.style.width = '100%';
		this.progressContainer.querySelector('.smart-extract-progress-text')!.textContent = '100%';
		this.statusText.setText(message);
		this.cancelButton.textContent = '✅ Done';
		this.cancelButton.disabled = false;
		
		setTimeout(() => {
			this.close();
		}, 1500);
	}

	showError(error: string) {
		this.progressBar.style.width = '100%';
		this.progressBar.addClass('error');
		this.statusText.setText(`❌ ${error}`);
		this.cancelButton.textContent = '❌ Close';
		this.cancelButton.disabled = false;
	}
}