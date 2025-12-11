# NOISE DBML

NOISE DBML renders Database Markup Language diagrams directly inside Visual Studio Code using an interactive webview.

## Highlights

- Preview DBML files with pan, zoom, and an adaptive grid.
- Persist custom layouts, zoom level, and grid settings per document.
- Save filtered diagram views for quick context switching.
- Theme-aware styling that matches the editor.

## Getting Started

1. Install NOISE DBML from the VS Code Marketplace.
2. Open a `.dbml` file.
3. Click the eye icon in the editor toolbar or run **DBML: Open Preview**.

## Command

- **DBML: Open Preview** (`noise-dbml.openPreview`)

## Requirements

- Visual Studio Code 1.107.0 or newer
- DBML files that follow the official [DBML specification](https://www.dbml.org/home/)

## Development

1. `npm install`
2. `npm run compile`
3. Press `F5` to launch the extension development host
4. `npm test` to execute automated tests

## Support

Report issues and request features through the GitHub repository.
