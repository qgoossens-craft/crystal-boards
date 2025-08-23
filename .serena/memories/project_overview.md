# Crystal Boards - Project Overview

## Purpose
Crystal Boards is an Obsidian plugin for creating personal Kanban boards with drag and drop functionality. This allows users to organize tasks, projects, and workflows in a visual board format within their Obsidian vault.

## Tech Stack
- **Language**: TypeScript
- **Framework**: Obsidian Plugin API
- **Build Tool**: esbuild
- **Package Manager**: npm
- **Linting**: ESLint with TypeScript
- **Type Checking**: TypeScript compiler

## Dependencies
### Development Dependencies
- `@types/node`: ^16.11.6
- `@typescript-eslint/eslint-plugin`: 5.29.0
- `@typescript-eslint/parser`: 5.29.0
- `builtin-modules`: 3.3.0
- `esbuild`: 0.17.3
- `obsidian`: latest (for API types)
- `tslib`: 2.4.0
- `typescript`: 4.7.4

## Project Structure
- `main.ts` - Main plugin entry point
- `manifest.json` - Plugin metadata and configuration
- `package.json` - Node.js project configuration
- `tsconfig.json` - TypeScript configuration
- `esbuild.config.mjs` - Build configuration
- `.eslintrc` - ESLint configuration
- `styles.css` - Plugin styles
- `README.md` - Documentation

## Current Status
The project is currently based on the Obsidian sample plugin template and needs to be modified to implement Kanban board functionality.