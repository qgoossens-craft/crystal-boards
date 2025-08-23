# Crystal Boards

A beautiful and intuitive Kanban board plugin for Obsidian that helps you organize your tasks, projects, and workflows visually.

![Crystal Boards Dashboard](https://img.shields.io/badge/version-1.0.0-blue)
![Obsidian Plugin](https://img.shields.io/badge/obsidian-plugin-purple)

## ✨ Features

- **📋 Dashboard View**: Clean grid layout displaying all your boards with cover images
- **🎨 Customizable Columns**: Create columns with custom names and colors
- **📝 Rich Cards**: Add titles, tags, and link cards to existing notes
- **🖱️ Drag & Drop**: Smooth drag and drop functionality between columns
- **🖼️ Cover Images**: Use vault images as board covers
- **⚙️ Settings**: Customize folder paths, colors, and display options
- **📱 Responsive**: Works great on both desktop and mobile
- **🔗 Note Integration**: Link cards to existing notes in your vault

## 🚀 Installation

### Method 1: Manual Installation (Recommended for Development)

1. Download or clone this repository
2. Copy the plugin folder to your vault's `.obsidian/plugins/` directory
3. The path should look like: `your-vault/.obsidian/plugins/crystal-boards/`
4. Restart Obsidian or reload the plugins
5. Enable the plugin in Settings → Community Plugins

### Method 2: BRAT (Beta Reviewers Auto-update Tool)

1. Install the BRAT plugin from the Community Plugins
2. Add this repository URL to BRAT
3. Enable the plugin in Settings → Community Plugins

### Method 3: Development Setup

```bash
# Clone the repository
git clone https://github.com/qgoossens-craft/crystal-boards.git

# Navigate to the plugin directory
cd crystal-boards

# Install dependencies
npm install

# Start development mode (auto-compiles on changes)
npm run dev

# Or build for production
npm run build
```

## 📖 Usage

### Getting Started

1. **Open Crystal Boards**: Click the dashboard icon in the ribbon or use the command palette
2. **Create Your First Board**: Click "Create Board" and give it a name
3. **Add Columns**: Click "Add Column" to create custom workflow stages
4. **Create Cards**: Add cards to columns with titles, tags, and note links
5. **Drag & Drop**: Move cards between columns by dragging

### Dashboard Features

- **Grid Layout**: Boards are displayed in a responsive grid
- **Cover Images**: Select images from your vault as board covers
- **Quick Actions**: Edit or delete boards directly from the dashboard
- **Search**: Find boards quickly (coming soon)

### Board Management

#### Creating Boards
- Enter a descriptive name for your board
- Optionally select a cover image from your vault
- Default columns (To Do, In Progress, Done) are created automatically

#### Column Customization
- **Add Columns**: Click the "+" button to add new columns
- **Edit Columns**: Click the gear icon to modify name and color
- **Delete Columns**: Remove columns (warning: this deletes all cards in the column)
- **Color Coding**: Choose from preset colors or use custom colors

#### Card Management
- **Create Cards**: Click "Add Card" in any column
- **Edit Cards**: Click the edit icon on any card
- **Link to Notes**: Connect cards to existing notes in your vault
- **Tags**: Organize cards with multiple tags
- **Drag & Drop**: Move cards between columns seamlessly

### Settings

Access plugin settings through Settings → Crystal Boards:

- **Kanban Folder Path**: Choose where board folders are created (default: "Kanban")
- **Show Cover Images**: Toggle cover image display on dashboard
- **Boards Per Row**: Adjust dashboard grid layout (1-6 boards per row)
- **Default Column Colors**: Customize the color palette for new columns
- **Data Management**: Export/import board data

## 🎨 Customization

### Custom CSS

You can customize the appearance by adding CSS to your theme or the plugin's styles.css:

```css
/* Custom board card styling */
.crystal-board-card {
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

/* Custom column colors */
.crystal-column {
    border-radius: 10px;
}

/* Custom card styling */
.crystal-card {
    border-left: 4px solid var(--interactive-accent);
}
```

### Color Themes

The plugin adapts to your Obsidian theme automatically, but you can customize colors in the settings.

## 🗂️ File Structure

```
your-vault/
├── Kanban/                     # Main kanban folder (configurable)
│   ├── Project Alpha/          # Individual board folders
│   │   └── cover.jpg          # Optional cover images
│   ├── Personal Tasks/
│   └── Team Sprint/
└── .obsidian/
    └── plugins/
        └── crystal-boards/
            ├── data.json      # Plugin data storage
            └── ...           # Plugin files
```

## 🔧 Development

### Project Structure

```
crystal-boards/
├── main.ts              # Main plugin class
├── types.ts             # TypeScript interfaces
├── dashboard-view.ts    # Dashboard grid view
├── board-view.ts        # Individual board view
├── data-manager.ts      # Data persistence layer
├── drag-drop.ts         # Drag and drop functionality
├── settings-tab.ts      # Plugin settings
├── styles.css           # Plugin styles
├── manifest.json        # Plugin metadata
└── package.json         # Dependencies and scripts
```

### Available Scripts

- `npm run dev` - Development mode with auto-compilation
- `npm run build` - Production build
- `npm run version` - Bump version and update manifest
- `npx eslint main.ts` - Lint TypeScript files

### Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and test thoroughly
4. Run linting: `npm run build` (includes type checking and linting)
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

## 📋 Roadmap

### Phase 1: Foundation ✅
- [x] Plugin structure and dashboard
- [x] Basic board creation
- [x] Cover image support

### Phase 2: Core Features ✅
- [x] Individual board view
- [x] Column management
- [x] Card creation and editing
- [x] Color customization

### Phase 3: Enhanced UX ✅
- [x] Drag and drop functionality
- [x] Visual feedback and animations
- [x] Responsive design

### Phase 4: Advanced Features (Planned)
- [ ] Card templates
- [ ] Due dates and reminders
- [ ] Card filtering and search
- [ ] Board templates
- [ ] Keyboard shortcuts
- [ ] Card attachments
- [ ] Time tracking
- [ ] Team collaboration features

### Phase 5: Integration (Planned)
- [ ] Dataview integration
- [ ] Calendar integration
- [ ] Export to other formats
- [ ] API for other plugins
- [ ] Sync with external services

## 🐛 Troubleshooting

### Common Issues

**Plugin doesn't appear in settings**
- Ensure the plugin folder is in the correct location
- Check that all required files are present (main.js, manifest.json, styles.css)
- Restart Obsidian completely

**Drag and drop not working**
- Make sure you're dragging cards (not other elements)
- Try refreshing the board view
- Check browser console for errors

**Cover images not displaying**
- Verify the image file exists in your vault
- Check that the image format is supported (jpg, png, gif, webp)
- Ensure the image path is correct

**Data not saving**
- Check Obsidian's plugin data directory permissions
- Try disabling and re-enabling the plugin
- Export your data as backup before troubleshooting

### Getting Help

- Check the [Issues](https://github.com/qgoossens-craft/crystal-boards/issues) page
- Create a new issue with detailed information about your problem
- Include your Obsidian version and operating system

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- The Obsidian team for the amazing plugin API
- The Obsidian community for inspiration and feedback
- All contributors and beta testers

## 📞 Support

If you find this plugin helpful, consider:
- ⭐ Starring the repository
- 🐛 Reporting bugs and requesting features
- 💡 Contributing to the codebase
- ☕ [Buying me a coffee](https://buymeacoffee.com/qgoossens) (coming soon)

---

**Made with ❤️ for the Obsidian community**