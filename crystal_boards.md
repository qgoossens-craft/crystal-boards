# Obsidian Kanban Plugin - Development Plan

## Project Overview
A personal Kanban board plugin for Obsidian with dashboard view, drag-and-drop functionality, and note integration.

## Core Requirements Summary
- **Boards**: Separate folders in `/Kanban/` directory
- **Storage**: Plugin data folder (hidden from user)
- **Dashboard**: Grid view of ~6 boards with cover images
- **Columns**: Fully customizable with color coding
- **Cards**: Mixed content - text cards + optional note links
- **Integration**: Link to existing notes, display title/tags
- **UI**: Drag & drop between columns

## File Structure
```
your-vault/
├── Kanban/                          # Main kanban folder
│   ├── Board1/                      # Individual board folders
│   │   └── cover.jpg               # Board cover images
│   ├── Board2/
│   └── ProjectX/
└── .obsidian/
    └── plugins/
        └── kanban-plugin/
            ├── data.json           # Plugin settings & board data
            └── ...
```

## Development Phases

### Phase 1: Plugin Foundation (Days 1-2)
**Goal**: Set up basic plugin structure and dashboard

#### Files to Create:
1. **`main.ts`** - Main plugin class
   - Plugin initialization
   - Register views and commands
   - Load/save data methods

2. **`manifest.json`** - Plugin manifest
   - Plugin metadata
   - Version, author, description

3. **`versions.json`** - Version compatibility

4. **`dashboard-view.ts`** - Dashboard view component
   - Grid layout for boards
   - Board creation interface
   - Cover image display

#### Key Features:
- Plugin loads without errors
- Dashboard view opens via ribbon icon
- Basic board creation (name + folder)
- Cover image selection from vault

### Phase 2: Board View & Columns (Days 3-4)
**Goal**: Individual board view with customizable columns

#### Files to Create:
5. **`board-view.ts`** - Individual board view
   - Column display and management
   - Column creation/editing modal
   - Color picker for columns

6. **`types.ts`** - TypeScript interfaces
   - Board, Column, Card data structures
   - Plugin settings interface

7. **`modals/column-modal.ts`** - Column configuration
   - Name, color, position settings
   - Validation and save logic

#### Key Features:
- Navigate from dashboard to board view
- Create/edit/delete columns
- Color coding for columns
- Column reordering

### Phase 3: Cards & Basic Functionality (Days 5-6)
**Goal**: Card creation, editing, and basic display

#### Files to Create:
8. **`card-component.ts`** - Card display component
   - Title, tags, note link display
   - Card editing interface
   - Note link suggestions

9. **`modals/card-modal.ts`** - Card creation/editing
   - Property configuration
   - Note linking interface
   - Tag management

#### Key Features:
- Create cards in columns
- Edit card properties (title, tags)
- Link cards to existing notes
- Delete cards

### Phase 4: Drag & Drop (Days 7-8)
**Goal**: Implement drag and drop between columns

#### Files to Create:
10. **`drag-drop.ts`** - Drag and drop logic
    - HTML5 drag API implementation
    - Column-to-column movement
    - Visual feedback during drag

#### Key Features:
- Drag cards between columns
- Visual indicators during drag
- Smooth animations
- Data persistence after moves

### Phase 5: Data Management & Settings (Days 9-10)
**Goal**: Robust data handling and user settings

#### Files to Create:
11. **`data-manager.ts`** - Data persistence
    - Save/load board data
    - Backup and restore
    - Data validation

12. **`settings-tab.ts`** - Plugin settings
    - Default kanban folder location
    - UI preferences
    - Data management options

#### Key Features:
- Reliable data saving/loading
- Settings panel in Obsidian preferences
- Error handling and recovery

### Phase 6: Polish & Advanced Features (Days 11-12)
**Goal**: UI polish and additional features

#### Enhancements:
- Board templates
- Card filtering/search
- Keyboard shortcuts
- Export functionality
- Performance optimizations

## Technical Architecture

### Data Structure
```typescript
interface KanbanData {
  boards: Board[];
  settings: PluginSettings;
}

interface Board {
  id: string;
  name: string;
  folderPath: string;
  coverImage?: string;
  columns: Column[];
  created: number;
  modified: number;
}

interface Column {
  id: string;
  name: string;
  color: string;
  position: number;
  cards: Card[];
}

interface Card {
  id: string;
  title: string;
  tags: string[];
  noteLink?: string;
  created: number;
  modified: number;
}
```

### Key Dependencies
- Obsidian API (`obsidian` package)
- HTML5 Drag and Drop API
- CSS for styling and animations

## Implementation Notes for Claude Code

### When implementing, focus on:
1. **Obsidian API Usage**:
   - Use `this.app.vault` for file operations
   - Use `this.app.workspace` for view management
   - Use `Plugin.loadData()` and `Plugin.saveData()` for persistence

2. **View Registration**:
   - Register custom views with `this.registerView()`
   - Use `WorkspaceLeaf` for view management

3. **Event Handling**:
   - Use `this.registerDomEvent()` for DOM events
   - Use `this.app.workspace.on()` for Obsidian events

4. **File Management**:
   - Use `this.app.vault.adapter.exists()` to check folders
   - Use `this.app.vault.createFolder()` for folder creation
   - Use `TFile` and `TFolder` types appropriately

5. **UI Components**:
   - Extend `ItemView` for custom views
   - Use `Modal` class for dialogs
   - Use `Setting` class for settings UI

## Testing Strategy
- Test with existing vault structure
- Verify data persistence across Obsidian restarts
- Test drag and drop edge cases
- Validate note linking functionality
- Test with various image formats for covers

## Success Criteria
✅ Dashboard displays boards in grid layout  
✅ Board creation with folder structure  
✅ Custom columns with color coding  
✅ Card creation and editing  
✅ Drag and drop between columns  
✅ Note linking functionality  
✅ Cover image display  
✅ Data persistence  
✅ No conflicts with existing Obsidian functionality

---

## Next Steps
1. Set up the plugin development environment
2. Start with Phase 1 (Plugin Foundation)
3. Test each phase thoroughly before moving to the next
4. Use Claude Code to implement each file systematically

This plan provides a structured approach to building your Kanban plugin with clear milestones and deliverables for each phase.