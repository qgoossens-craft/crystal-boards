# Suggested Commands for Crystal Boards Development

## Development Commands

### Building and Development
- `npm i` - Install dependencies
- `npm run dev` - Start development mode with watch compilation
- `npm run build` - Build for production
- `npm run version` - Bump version and update manifest

### Code Quality
- `npx eslint main.ts` - Lint main TypeScript file
- `npx eslint src/` - Lint all files in src directory (if created)
- `npx tsc --noEmit` - Type check without compilation

### Testing and Validation
- Manual testing requires:
  1. Copy `main.js`, `styles.css`, `manifest.json` to vault `.obsidian/plugins/crystal-boards/`
  2. Reload Obsidian
  3. Enable plugin in settings

## System Commands (macOS/Darwin)
- `ls` - List directory contents
- `find . -name "*.ts"` - Find TypeScript files
- `grep -r "pattern" .` - Search for patterns in files
- `git status` - Check git status
- `git add .` - Stage changes
- `git commit -m "message"` - Commit changes

## Plugin Development Workflow
1. Make changes to `main.ts` or create new `.ts` files
2. Run `npm run dev` to auto-compile
3. Reload Obsidian to test changes
4. Use browser dev tools to debug (Ctrl+Shift+I)

## Release Process
1. Update version in `manifest.json`
2. Run `npm run build` for production build
3. Create GitHub release with `manifest.json`, `main.js`, `styles.css`