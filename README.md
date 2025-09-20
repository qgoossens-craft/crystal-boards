# ✨ Crystal Boards

<div align="center">

![Crystal Boards Hero](https://img.shields.io/badge/Crystal%20Boards-Simple%20Kanban-8A2BE2?style=for-the-badge&logo=obsidian)

**Simple & Elegant Kanban Plugin for Obsidian**

*Transform your ideas into organized workflows with beautiful simplicity*

[![Version](https://img.shields.io/badge/version-1.0.0-blue?style=flat-square)](https://github.com/qgoossens-craft/crystal-boards)
[![Obsidian Plugin](https://img.shields.io/badge/obsidian-plugin-8A2BE2?style=flat-square)](https://obsidian.md)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)


[ Features](#-features) • [ Installation](#-installation) • [ Usage](#-usage) • [ Configuration](#-configuration)

</div>

---

![alt text](image-1.png)

## What is Crystal Boards?

Crystal Boards is a **simple and elegant Kanban plugin** designed specifically for Obsidian users who want a clean, distraction-free way to organize their ideas and tasks.

I built Crystal Boards because I wasn't satisfied with existing Kanban solutions that were overly complex with features like assignees, deadlines, and importance tags that felt more suited for team environments than personal productivity.

**Crystal Boards focuses on simplicity**:
- Beautiful, visual kanban boards
- Seamless integration with your Obsidian notes
- Clean drag & drop interface
- Automatic task extraction from markdown files
- No clutter, no complexity - just pure productivity

## How to use Crystal Boards:

**1 - Simple Kanban Workflow**: Create boards, add cards, and organize your ideas across customizable columns with intuitive drag & drop.

**2 - Smart Task Extraction**: Crystal Boards automatically scans your markdown notes for tagged todos and organizes them into the appropriate kanban boards.

**3 - Note Integration**: Link cards directly to your Obsidian notes for seamless knowledge management and task tracking. 

---

![alt text](image.png)

---


Crystal Boards is a **simple and powerful Kanban plugin** that transforms your Obsidian workflow:

-  **Beautiful Visual Interface**: Stunning dashboard with intuitive drag & drop functionality
-  **Smart Task Extraction**: Automatically extracts tasks from your markdown notes using hashtags
-  **Deep Obsidian Integration**: Seamless note linking and vault integration
-  **Responsive Design**: Perfect experience on desktop and mobile
-  **Clean & Simple**: No clutter, just the features you need for productive task management


![alt text](image-4.png)

##  Features

###  **Core Kanban Features**
- **Intuitive Task Management** - Create, organize, and manage tasks with drag & drop simplicity
- **Smart Task Extraction** - Automatically import tasks from markdown files using hashtags
- **Note Integration** - Link cards directly to your Obsidian notes for seamless workflow
- **Hashtag Organization** - Organize tasks by categories using hashtag-based filtering
- **Visual Dashboard** - Beautiful overview of all your boards with customizable layouts 

![alt text](image-2.png)

###  **Advanced Task Management**
- **Task Source Sync** - Auto-sync with external task files and monitoring
- **Hashtag Organization** - Smart filtering and categorization system
- **Deep Note Integration** - Rich linking with preview and navigation
- **Bulk Operations** - Select all cards in columns, mass editing
- **Real-time Updates** - File watching and automatic board synchronization

### **Beautiful Interface**
- **Visual Dashboard** - Stunning grid layout with cover images
- **Custom Themes** - Adapts to your Obsidian theme automatically
- **Responsive Design** - Perfect experience on any device
- **Smooth Animations** - Polished interactions and feedback
- **Intuitive UX** - Drag & drop everything, visual feedback

### **Power User Features**
- **Column Reordering** - Move columns with arrow buttons for perfect workflow organization
- **Bulk Selection** - Select all cards in a column with one click for mass operations
- **⌨️ Keyboard Shortcuts** - Efficient navigation and actions for power users
- **Advanced Settings** - Fine-tune visual appearance and behavior
- **Responsive Design** - Optimized for both desktop and mobile use

![alt text](image-3.png)

## Installation

### Method 1: Community Plugins (Coming Soon)
1. Open Obsidian Settings
2. Go to Community Plugins → Browse
3. Search for "Crystal Boards"
4. Install and enable

### Method 2: Manual Installation
1. Download the latest release from [GitHub](https://github.com/qgoossens-craft/crystal-boards/releases)
2. Extract to your vault's `.obsidian/plugins/crystal-boards/` folder
3. Restart Obsidian and enable the plugin

### Method 3: BRAT (Beta Testing)
1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat) from Community Plugins
2. Open BRAT settings in Obsidian
3. Click "Add Beta plugin" and enter: `qgoossens-craft/crystal-boards`
4. BRAT will automatically download and install the latest beta release
5. Enable Crystal Boards in Settings → Community Plugins

**Note**: BRAT installations automatically update to new beta releases when available.

## Smart Task Extraction

Crystal Boards makes it easy to turn your existing notes into organized kanban boards:

### Markdown Task Import
```markdown
# Your existing note
- [ ] #project Review quarterly reports
- [ ] #meeting Prepare presentation slides
- [ ] #coding Fix authentication bug #priority-high
```

Crystal Boards automatically:
- 📥 Scans your notes for tagged tasks
- 🎯 Organizes tasks by hashtag categories
- 🔄 Syncs changes in real-time
- ⚡ Updates boards when notes change

### Simple Workflow
```
1. 📝 Write tasks in any markdown note with hashtags
2. 🔗 Link the note to a Crystal Board
3. ⚡ Click "Extract" to import tasks automatically
4. 🎯 Tasks appear organized by their hashtag categories
```

## Usage

### Quick Start

1. **Open Dashboard**: Click the Crystal Boards icon in the ribbon
2. **Create Board**: Click "Create Board" and name your project
3. **Extract Tasks**: Use the task extraction feature to import from your notes
4. **Organize**: Drag & drop cards between columns to manage your workflow
5. **Link Notes**: Connect cards to your existing Obsidian notes for seamless integration

### Dashboard Magic

<table>
<tr>
<td width="50%">

**🖼️ Visual Organization**
- Beautiful grid layout
- Custom cover images
- Quick board access
- Responsive design

</td>
<td width="50%">

**⚡ Quick Actions**
- Create boards instantly
- Bulk operations
- Board reordering
- Smart search (coming soon)

</td>
</tr>
</table>

### 📋 Board Management

#### 🎨 **Column Customization**
- **➕ Add Columns**: Custom workflow stages
- **🎨 Color Coding**: Visual organization
- **↔️ Reordering**: Arrow button navigation
- **⚙️ Smart Configuration**: Intelligent defaults

#### 🃏 **Advanced Card Features**
- **🔗 Note Linking**: Deep Obsidian integration with seamless navigation
- **🏷️ Tag Management**: Hashtag-based organization and filtering
- **📎 Rich Content**: Add URLs, descriptions, and metadata to cards
- **✅ Task Status**: Track completion status with visual indicators

#### ⚡ **Power Features**
- **☑️ Bulk Selection**: Select all cards in column
- **🔄 Real-time Sync**: Auto-update from external sources
- **📱 Mobile Optimized**: Touch-friendly interface
- **⌨️ Keyboard Navigation**: Efficient workflows

## ⚙️ Configuration

### 📁 Basic Settings

```javascript
// Plugin Configuration
{
  "kanbanFolderPath": "Kanban",     // Custom folder for boards
  "taskSourcePath": "Tasks.md",     // Your main task file
  "showCoverImages": true,          // Display board cover images
  "boardsPerRow": 3,               // Dashboard layout
  "autoExtractOnStartup": false    // Auto-extract tasks on startup
}
```

### 🎨 Visual Customization

```css
/* Custom Board Styling */
.crystal-board-card {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.1);
}

/* Modern Card Design */
.crystal-card {
    backdrop-filter: blur(10px);
    border-left: 4px solid var(--interactive-accent);
    transition: all 0.3s ease;
}
```

## 🛠️ Advanced Features

### 📊 Task Source Integration

Connect Crystal Boards to external task files for powerful automation:

```markdown
# Your Tasks.md file
- [ ] #project Review quarterly reports
- [ ] #meeting Prepare presentation slides  
- [ ] #coding Fix authentication bug #priority-high
```

Crystal Boards automatically:
- 📥 Imports tasks with hashtags
- 🔄 Syncs changes in real-time  
- 🎯 Organizes by categories
- ⚡ Updates boards automatically

### 🔗 URL Integration

Add rich content to your cards:

```
🔗 Paste any URL into a card
📊 Automatic title and description extraction
📸 Preview generation for visual context
🎯 Clean, organized presentation
```

### ⚡ Smooth Performance

Crystal Boards is built for speed:
- 🚀 Fast board loading and navigation
- 📊 Real-time updates when notes change
- ✨ Smooth drag & drop animations
- 💾 Efficient data storage and sync

## 🗂️ Project Structure

```
your-vault/
├── 📁 Kanban/                 # Main boards folder (customizable)
│   ├── 📁 Work Project/       # Individual board folders  
│   │   ├── 🖼️ cover.jpg      # Custom cover images
│   │   └── 📄 notes/          # Linked notes
│   ├── 📁 Personal/           # Personal task boards
│   └── 📁 Learning/           # Learning & development
└── 📁 .obsidian/
    └── 📁 plugins/
        └── 📁 crystal-boards/ # Plugin files
            └── 📄 data.json   # Board data storage
```

## 🎨 Customization Gallery

### 🌈 Theme Variations

<table>
<tr>
<td width="33%">

**🌙 Dark Theme**
- Elegant dark interface
- Neon accent colors  
- Modern glassmorphism

</td>
<td width="33%">

**☀️ Light Theme**  
- Clean, bright design
- Subtle shadows
- Professional appearance

</td>
<td width="33%">

**🎨 Custom Themes**
- Your brand colors
- Custom CSS styling
- Unlimited possibilities

</td>
</tr>
</table>

## 🔧 Development & Contributing

### 🚀 Development Setup

```bash
# Clone the repository
git clone https://github.com/qgoossens-craft/crystal-boards.git

# Install dependencies  
cd crystal-boards
npm install

# Start development mode
npm run dev

# Build for production
npm run build
```

### 📝 Project Architecture

```typescript
// Core Components
CrystalBoardsPlugin      // Main plugin class
├── DataManager          // Data persistence & management
├── DashboardView        // Visual board grid interface
├── BoardView            // Individual board interface
├── TaskExtractionService // Markdown task extraction & file monitoring
└── SettingsTab          // Configuration interface
```

### 🤝 Contributing

We welcome contributions! Please:

1. 🍴 Fork the repository
2. 🌿 Create feature branch: `git checkout -b feature/amazing-feature`
3. ✅ Test thoroughly with TypeScript: `npm run build`
4. 📝 Commit changes: `git commit -m 'Add amazing feature'`
5. 🚀 Push branch: `git push origin feature/amazing-feature`
6. 🔄 Open Pull Request

## 📋 Roadmap

### 🎯 Version 2.0 (Coming Soon)
- [ ] 📅 **Calendar Integration** - Date-based task management
- [ ] 🔍 **Advanced Search** - Full-text search across all boards
- [ ] 📋 **Templates System** - Reusable board and card templates  
- [ ] ⏰ **Time Tracking** - Built-in productivity analytics
- [ ] 🔄 **Automation Rules** - Custom workflow automation

### 🚀 Version 3.0 (Future)
- [ ] 👥 **Team Collaboration** - Multi-user support
- [ ] 🌐 **Cloud Sync** - Cross-device synchronization
- [ ] 📊 **Analytics Dashboard** - Productivity insights
- [ ] 🔌 **API Integration** - Connect external services
- [ ] 🎨 **Advanced Theming** - Visual customization toolkit

## 🐛 Troubleshooting

### 🔧 Common Solutions

<details>
<summary><strong>🔍 Task Extraction Not Working</strong></summary>

- ✅ Ensure tasks use proper markdown format: `- [ ] task #hashtag`
- 🔗 Verify the note is linked to your board
- 📄 Check that hashtags match your board column names
- 🔄 Try clicking "Extract" button to refresh

</details>

<details>
<summary><strong>📱 Plugin Not Loading</strong></summary>

- 📁 Check plugin folder location: `.obsidian/plugins/crystal-boards/`
- 📄 Ensure all files present: `main.js`, `manifest.json`, `styles.css`
- 🔄 Restart Obsidian completely
- ⚙️ Enable in Settings → Community Plugins

</details>

<details>
<summary><strong>🖱️ Drag & Drop Issues</strong></summary>

- 🎯 Ensure dragging card elements (not other UI parts)
- 🔄 Refresh board view if needed
- 🕵️ Check browser console for JavaScript errors
- 📱 Try on different device/browser

</details>

### 🆘 Getting Help

- 📋 Check [Issues](https://github.com/qgoossens-craft/crystal-boards/issues) page
- 🐛 Create detailed bug report with:
  - 💻 Obsidian version & OS
  - 📝 Steps to reproduce  
  - 🖼️ Screenshots if helpful
- 💬 Join our [Discord Community](#) (coming soon)

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- 🙌 **Obsidian Team** - For the incredible plugin API and platform
- 🤝 **Community Contributors** - Bug reports, feature requests, and testing
- 🎯 **Modern Kanban Solutions** - Inspiration for clean task management interfaces
- 🎨 **Design Inspiration** - Modern productivity apps and design systems

## 💖 Support the Project

If Crystal Boards helps boost your productivity:

- ⭐ **Star the repository** - Show your appreciation
- 🐛 **Report bugs & request features** - Help make it better
- 🤝 **Contribute code** - Join the development
- ☕ **Buy me a coffee** - [Support development](https://buymeacoffee.com/qgoossens)
- 📢 **Share with others** - Spread the word!

---

<div align="center">

**✨ Made with ❤️ for the Obsidian Community ✨**

*Transform your productivity with AI-powered task management*

[![GitHub](https://img.shields.io/badge/GitHub-qgoossens--craft-181717?style=flat-square&logo=github)](https://github.com/qgoossens-craft)
[![Twitter](https://img.shields.io/badge/Twitter-@qgoossens-1DA1F2?style=flat-square&logo=twitter)](#)
[![Discord](https://img.shields.io/badge/Discord-Community-7289DA?style=flat-square&logo=discord)](#)

</div>