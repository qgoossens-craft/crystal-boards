import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import CrystalBoardsPlugin from './main';

export class CrystalBoardsSettingTab extends PluginSettingTab {
	plugin: CrystalBoardsPlugin;

	constructor(app: App, plugin: CrystalBoardsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Crystal Boards Settings' });

		new Setting(containerEl)
			.setName('Kanban Folder Path')
			.setDesc('The folder where your Kanban boards will be stored')
			.addText(text => text
				.setPlaceholder('Kanban')
				.setValue(this.plugin.settings.kanbanFolderPath)
				.onChange(async (value) => {
					await this.plugin.updateSettings({ kanbanFolderPath: value });
				}));

		new Setting(containerEl)
			.setName('Show Cover Images')
			.setDesc('Display cover images on board cards in the dashboard')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showCoverImages)
				.onChange(async (value) => {
					await this.plugin.updateSettings({ showCoverImages: value });
				}));

		new Setting(containerEl)
			.setName('Boards Per Row')
			.setDesc('Number of board cards to display per row in the dashboard')
			.addSlider(slider => slider
				.setLimits(1, 6, 1)
				.setValue(this.plugin.settings.boardsPerRow)
				.setDynamicTooltip()
				.onChange(async (value) => {
					await this.plugin.updateSettings({ boardsPerRow: value });
				}));

		// Color presets section
		containerEl.createEl('h3', { text: 'Default Column Colors' });
		containerEl.createEl('p', { 
			text: 'These colors will be used for new columns when creating boards.',
			cls: 'setting-item-description'
		});

		this.plugin.settings.defaultColumnColors.forEach((color, index) => {
			new Setting(containerEl)
				.setName(`Color ${index + 1}`)
				.addColorPicker(colorPicker => colorPicker
					.setValue(color)
					.onChange(async (value) => {
						const newColors = [...this.plugin.settings.defaultColumnColors];
						newColors[index] = value;
						await this.plugin.updateSettings({ defaultColumnColors: newColors });
					}));
		});

		// Task extraction section
		containerEl.createEl('h3', { text: 'Task Extraction' });
		containerEl.createEl('p', { 
			text: 'Configure automatic task extraction from your notes into boards.',
			cls: 'setting-item-description'
		});

		new Setting(containerEl)
			.setName('Task Source Note')
			.setDesc('Path to the note containing tasks to extract (e.g., "Todo.md")')
			.addText(text => text
				.setPlaceholder('Todo.md')
				.setValue(this.plugin.settings.taskSourcePath || '')
				.onChange(async (value) => {
					await this.plugin.updateSettings({ taskSourcePath: value });
				}));

		new Setting(containerEl)
			.setName('Auto-extract on Startup')
			.setDesc('Automatically extract tasks when the plugin loads')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoExtractOnStartup || false)
				.onChange(async (value) => {
					await this.plugin.updateSettings({ autoExtractOnStartup: value });
				}));

		new Setting(containerEl)
			.setName('Extracted Task Prefix')
			.setDesc('Prefix to add to extracted task titles (e.g., "📥 " or "[EXTRACTED] ")')
			.addText(text => text
				.setPlaceholder('📥 ')
				.setValue(this.plugin.settings.extractedTaskPrefix || '')
				.onChange(async (value) => {
					await this.plugin.updateSettings({ extractedTaskPrefix: value });
				}));

		new Setting(containerEl)
			.setName('Smart Extract Prefix')
			.setDesc('Prefix to add to Smart Extract task titles (e.g., "🤖 " or "[AI] ")')
			.addText(text => text
				.setPlaceholder('🤖 ')
				.setValue(this.plugin.settings.smartExtractPrefix || '')
				.onChange(async (value) => {
					await this.plugin.updateSettings({ smartExtractPrefix: value });
				}));

		new Setting(containerEl)
			.setName('Remove Extracted Tasks')
			.setDesc('Remove tasks from source note after extracting them to boards')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.removeExtractedTasks || false)
				.onChange(async (value) => {
					await this.plugin.updateSettings({ removeExtractedTasks: value });
				}));

		new Setting(containerEl)
			.setName('Default Board for Untagged Tasks')
			.setDesc('Board name to use for tasks without matching tags')
			.addText(text => text
				.setPlaceholder('Inbox')
				.setValue(this.plugin.settings.defaultExtractionBoard || 'Inbox')
				.onChange(async (value) => {
					await this.plugin.updateSettings({ defaultExtractionBoard: value });
				}));

		new Setting(containerEl)
			.setName('Default Column for New Tasks')
			.setDesc('Column name to place extracted tasks into')
			.addText(text => text
				.setPlaceholder('To Do')
				.setValue(this.plugin.settings.extractionColumnName || 'To Do')
				.onChange(async (value) => {
					await this.plugin.updateSettings({ extractionColumnName: value });
				}));

		// Smart Extract with AI section
	containerEl.createEl('h3', { text: 'Smart Extract (AI-Powered)' });
	containerEl.createEl('p', { 
		text: 'Use AI to automatically analyze tasks and generate descriptions and next steps.',
		cls: 'setting-item-description'
	});

	new Setting(containerEl)
		.setName('Enable Smart Extract')
		.setDesc('Use AI-powered extraction instead of standard extraction')
		.addToggle(toggle => toggle
			.setValue(this.plugin.settings.useSmartExtract || false)
			.onChange(async (value) => {
				await this.plugin.updateSettings({ useSmartExtract: value });
				// Show/hide related settings
				this.display();
			}));

	if (this.plugin.settings.useSmartExtract) {
		new Setting(containerEl)
			.setName('OpenAI API Key')
			.setDesc('Your OpenAI API key (stored securely)')
			.addText(text => {
				text.inputEl.type = 'password';
				text.setPlaceholder('sk-...')
					.setValue(this.plugin.settings.openAIApiKey || '')
					.onChange(async (value) => {
						await this.plugin.updateSettings({ openAIApiKey: value });
					});
				
				// Add show/hide button
				const eyeButton = text.inputEl.parentElement?.createEl('button', {
					cls: 'clickable-icon',
					attr: { 'aria-label': 'Show API key' }
				});
				if (eyeButton) {
					eyeButton.innerHTML = '👁️';
					eyeButton.onclick = () => {
						text.inputEl.type = text.inputEl.type === 'password' ? 'text' : 'password';
						eyeButton.innerHTML = text.inputEl.type === 'password' ? '👁️' : '🙈';
					};
				}
			})
			.addButton(button => button
				.setButtonText('Test Connection')
				.onClick(async () => {
					if (!this.plugin.settings.openAIApiKey) {
						new Notice('Please enter an API key first');
						return;
					}
					
					button.setButtonText('Testing...');
					button.setDisabled(true);
					
					try {
						// Test the API connection
						const { OpenAIService } = await import('./openai-service');
						const service = new OpenAIService({
							apiKey: this.plugin.settings.openAIApiKey,
							model: this.plugin.settings.openAIModel || 'gpt-3.5-turbo',
							maxTokens: 100,
							temperature: 0.7
						});
						
						const success = await service.testConnection();
						if (success) {
							new Notice('✅ OpenAI connection successful!');
						} else {
							new Notice('❌ Connection failed. Please check your API key.');
						}
					} catch (error) {
						new Notice(`❌ Error: ${error.message}`);
					} finally {
						button.setButtonText('Test Connection');
						button.setDisabled(false);
					}
				}));

		new Setting(containerEl)
			.setName('AI Model')
			.setDesc('Choose the OpenAI model to use')
			.addDropdown(dropdown => dropdown
				.addOption('gpt-4.1-mini', 'GPT-4.1 Mini (Recommended - Fast & Smart)')
				.addOption('gpt-4.1', 'GPT-4.1 (Smartest non-reasoning model)')
				.addOption('gpt-4.1-nano', 'GPT-4.1 Nano (Fastest, most cost-efficient)')
				.addOption('gpt-5-mini', 'GPT-5 Mini (Fast, cost-efficient version of GPT-5)')
				.addOption('gpt-5', 'GPT-5 (Best for coding and agentic tasks)')
				.addOption('gpt-5-nano', 'GPT-5 Nano (Fastest, most cost-efficient GPT-5)')
				.addOption('o3-mini', 'o3-mini (Small reasoning model)')
				.addOption('o3', 'o3 (Reasoning model for complex tasks)')
				.addOption('gpt-4o', 'GPT-4o (Fast, intelligent, flexible)')
				.addOption('gpt-4o-mini', 'GPT-4o Mini (Fast, affordable small model)')
				.addOption('gpt-4-turbo', 'GPT-4 Turbo (High intelligence)')
				.addOption('gpt-4', 'GPT-4 (Classic high-intelligence)')
				.addOption('gpt-3.5-turbo', 'GPT-3.5 Turbo (Legacy, cheaper)')
				.addOption('o1', 'o1 (Previous reasoning model)')
				.addOption('o1-mini', 'o1-mini (Small reasoning alternative)')
				.setValue(this.plugin.settings.openAIModel || 'gpt-4.1-mini')
				.onChange(async (value: any) => {
					await this.plugin.updateSettings({ openAIModel: value });
				}));

		new Setting(containerEl)
			.setName('Max Tokens')
			.setDesc('Maximum tokens for AI responses (affects cost and response length)')
			.addSlider(slider => slider
				.setLimits(100, 1000, 50)
				.setValue(this.plugin.settings.smartExtractMaxTokens || 500)
				.setDynamicTooltip()
				.onChange(async (value) => {
					await this.plugin.updateSettings({ smartExtractMaxTokens: value });
				}));

		new Setting(containerEl)
			.setName('Temperature')
			.setDesc('AI creativity level (0 = deterministic, 1 = creative)')
			.addSlider(slider => slider
				.setLimits(0, 1, 0.1)
				.setValue(this.plugin.settings.smartExtractTemperature || 0.7)
				.setDynamicTooltip()
				.onChange(async (value) => {
					await this.plugin.updateSettings({ smartExtractTemperature: value });
				}));

		new Setting(containerEl)
			.setName('Confidence Threshold')
			.setDesc('Minimum confidence level to auto-accept AI suggestions')
			.addSlider(slider => slider
				.setLimits(0, 1, 0.05)
				.setValue(this.plugin.settings.smartExtractConfidenceThreshold || 0.7)
				.setDynamicTooltip()
				.onChange(async (value) => {
					await this.plugin.updateSettings({ smartExtractConfidenceThreshold: value });
				}));

		new Setting(containerEl)
			.setName('Use Custom Prompt')
			.setDesc('Use your own prompt instead of the default')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.useCustomPrompt || false)
				.onChange(async (value) => {
					await this.plugin.updateSettings({ useCustomPrompt: value });
					this.display();
				}));

		if (this.plugin.settings.useCustomPrompt) {
			new Setting(containerEl)
				.setName('Custom Prompt')
				.setDesc('Your custom prompt for task analysis (use {task}, {tags}, {url} as placeholders)')
				.addTextArea(text => text
					.setPlaceholder('Analyze the task: {task}\nTags: {tags}\n...')
					.setValue(this.plugin.settings.customPrompt || '')
					.onChange(async (value) => {
						await this.plugin.updateSettings({ customPrompt: value });
					}));
		}

		new Setting(containerEl)
			.setName('Cache AI Responses')
			.setDesc('Cache AI responses to reduce API calls and costs')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.cacheAIResponses !== false)
				.onChange(async (value) => {
					await this.plugin.updateSettings({ cacheAIResponses: value });
				}));

		if (this.plugin.settings.cacheAIResponses !== false) {
			new Setting(containerEl)
				.setName('Cache Duration')
				.setDesc('How long to cache AI responses (in hours)')
				.addSlider(slider => slider
					.setLimits(1, 168, 1)
					.setValue(this.plugin.settings.cacheDurationHours || 24)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.plugin.updateSettings({ cacheDurationHours: value });
					}));
		}
	}

	// Data management section
		containerEl.createEl('h3', { text: 'Data Management' });

		new Setting(containerEl)
			.setName('Export Data')
			.setDesc('Export all your board data as JSON')
			.addButton(button => button
				.setButtonText('Export')
				.onClick(async () => {
					await this.exportData();
				}));

		new Setting(containerEl)
			.setName('Import Data')
			.setDesc('Import board data from JSON file')
			.addButton(button => button
				.setButtonText('Import')
				.onClick(async () => {
					await this.importData();
				}));
	}

	private async exportData(): Promise<void> {
		const data = this.plugin.dataManager.getBoards();
		const dataStr = JSON.stringify(data, null, 2);
		const blob = new Blob([dataStr], { type: 'application/json' });
		
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `crystal-boards-export-${new Date().toISOString().split('T')[0]}.json`;
		a.click();
		
		URL.revokeObjectURL(a.href);
	}

	private async importData(): Promise<void> {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';
		
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) return;
			
			try {
				const text = await file.text();
				const importedData = JSON.parse(text);
				
				// Validate the data structure
				if (!Array.isArray(importedData)) {
					throw new Error('Invalid data format');
				}
				
				// TODO: Implement data validation and import logic
				console.log('Imported data:', importedData);
				
				// For now, just log the data
				// In a full implementation, you'd want to:
				// 1. Validate each board structure
				// 2. Ask user about conflicts
				// 3. Merge or replace existing data
				// 4. Update the dashboard
				
			} catch (error) {
				console.error('Error importing data:', error);
				// TODO: Show error message to user
			}
		};
		
		input.click();
	}
}