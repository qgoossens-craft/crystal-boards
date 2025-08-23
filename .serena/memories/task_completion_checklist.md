# Task Completion Checklist

## Before Completing Any Task

### Code Quality Checks
1. **Lint the code**: `npx eslint main.ts` or affected files
2. **Type check**: `npx tsc --noEmit --skipLibCheck`
3. **Build test**: `npm run build` to ensure production build works
4. **Manual testing**: Test functionality in Obsidian

### Testing Workflow
1. Run `npm run dev` to compile changes
2. Copy files to Obsidian plugins directory (if not already linked)
3. Reload Obsidian (Ctrl+R or Cmd+R)
4. Test the feature manually
5. Check browser console for errors (Ctrl+Shift+I)

### Code Review
1. Ensure proper error handling
2. Check for memory leaks (event listeners cleaned up)
3. Verify accessibility and user experience
4. Confirm TypeScript strict mode compliance
5. Review for security considerations

### Documentation
1. Update README.md if public API changes
2. Add inline comments for complex logic
3. Update version if significant changes
4. Document any new settings or commands

### Git Workflow
1. Stage changes: `git add .`
2. Commit with descriptive message: `git commit -m "feat: add kanban board functionality"`
3. Push if working on shared repository

## Deployment Checklist
1. Update `manifest.json` version
2. Run `npm run build` for production
3. Test production build manually
4. Create release with required files: `manifest.json`, `main.js`, `styles.css`