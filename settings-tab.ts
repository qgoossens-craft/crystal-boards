import { App, PluginSettingTab, Setting } from 'obsidian';
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