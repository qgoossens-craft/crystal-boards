# Code Style and Conventions

## TypeScript Configuration
- **Target**: ES6
- **Module**: ESNext
- **Strict mode**: Enabled with strictNullChecks
- **Source maps**: Inline for development
- **Type checking**: noImplicitAny enabled

## ESLint Rules
- Uses TypeScript ESLint plugin
- Extends recommended ESLint and TypeScript rules
- **No unused vars**: Error level (args ignored)
- **Ban TS comments**: Disabled
- **Empty functions**: Allowed
- **Prototype builtins**: Disabled

## Naming Conventions
- **Classes**: PascalCase (e.g., `CrystalBoardsPlugin`, `KanbanBoard`)
- **Interfaces**: PascalCase with descriptive names (e.g., `MyPluginSettings`)
- **Variables/Functions**: camelCase
- **Constants**: UPPER_SNAKE_CASE for exports, camelCase for local

## File Organization
- Main plugin class in `main.ts`
- Interfaces and types at top of files
- Default exports for plugin classes
- Named exports for utilities

## Code Patterns
- Use `async/await` for asynchronous operations
- Proper error handling with try/catch
- Use Obsidian's built-in Notice for user feedback
- Register event listeners with plugin lifecycle
- Clean up resources in `onunload()`

## Import Style
```typescript
import { App, Plugin, Setting } from 'obsidian';
```

## Comments and Documentation
- Use JSDoc comments for public APIs
- Inline comments for complex logic
- TODO comments for future improvements