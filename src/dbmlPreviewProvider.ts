import * as vscode from 'vscode';
import { Parser } from '@dbml/core';
import * as path from 'path';
import { promises as fs } from 'fs';
import { generateSvgFromSchema, ParsedSchema, ParsedTable, ParsedField, ParsedRef } from './svgGenerator';

interface DiagramViewData {
    id: string;
    name: string;
    tables: string[];
}

interface LayoutData {
    positions?: Record<string, { x: number; y: number }>;
    viewBox?: { x: number; y: number; width: number; height: number };
    views?: DiagramViewData[];
    activeViewId?: string;
}

export class DbmlPreviewProvider {
	private panel: vscode.WebviewPanel | undefined;
	private currentDocument: vscode.TextDocument | undefined;

	constructor(private readonly extensionUri: vscode.Uri) {}

	public showPreview(document: vscode.TextDocument) {
		this.currentDocument = document;

		if (this.panel) {
			// If panel already exists, reveal it
			this.panel.reveal(vscode.ViewColumn.Beside);
		} else {
			// Create a new webview panel
			this.panel = vscode.window.createWebviewPanel(
				'dbmlPreview',
				'DBML Preview',
				vscode.ViewColumn.Beside,
				{
					enableScripts: true,
					retainContextWhenHidden: true
				}
			);

            this.panel.webview.onDidReceiveMessage(async message => {
                if (!message || typeof message !== 'object') {
                    return;
                }

                if (message.type === 'saveLayout') {
                    const payload = message.payload;
                    if (!payload || typeof payload !== 'object') {
                        return;
                    }

                    const documentPath = typeof payload.documentPath === 'string' ? payload.documentPath : '';
                    if (!documentPath || !this.currentDocument || this.currentDocument.uri.fsPath !== documentPath) {
                        return;
                    }

                    try {
                        const layoutToSave: LayoutData = {};
                        const positions = this.sanitizePositions(payload.positions);
                        if (Object.keys(positions).length > 0) {
                            layoutToSave.positions = positions;
                        }
                        const viewBox = this.sanitizeViewBox(payload.viewBox);
                        if (viewBox) {
                            layoutToSave.viewBox = viewBox;
                        }
                        const views = this.sanitizeViews(payload.views);
                        layoutToSave.views = views;
                        const activeViewId = typeof payload.activeViewId === 'string' && payload.activeViewId.trim().length > 0 ? payload.activeViewId.trim() : undefined;
                        if (activeViewId) {
                            layoutToSave.activeViewId = activeViewId;
                        }

                        await this.saveLayout(documentPath, layoutToSave);
                    } catch (error) {
                        console.error('Failed to save DBML layout data:', error);
                    }
                }
            });

			// Handle when the panel is closed
			this.panel.onDidDispose(() => {
				this.panel = undefined;
			});
		}

		// Update the webview content
        void this.updatePreview(document);
	}

    public async updatePreview(document: vscode.TextDocument) {
		if (!this.panel || document !== this.currentDocument) {
			return;
		}

		const dbmlContent = document.getText();
        const isFileDocument = document.uri.scheme === 'file';
        const documentPath = isFileDocument ? document.uri.fsPath : '';
        let layoutData: LayoutData = {};

        if (isFileDocument) {
            try {
                layoutData = await this.loadLayout(documentPath);
            } catch (error) {
                console.error('Failed to load DBML layout data:', error);
            }
        }

        this.panel.webview.html = this.getWebviewContent(dbmlContent, layoutData, documentPath);
	}

    private getLayoutFilePathFromFsPath(documentPath: string): string {
        const directory = path.dirname(documentPath);
        const extension = path.extname(documentPath);
        const baseName = path.basename(documentPath, extension);
        const layoutFileName = `${baseName}${extension}.layout.json`;
        return path.join(directory, layoutFileName);
    }

    private async loadLayout(documentPath: string): Promise<LayoutData> {
        const layoutFilePath = this.getLayoutFilePathFromFsPath(documentPath);
        try {
            const raw = await fs.readFile(layoutFilePath, 'utf8');
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            const layout: LayoutData = {};
            const positions = this.sanitizePositions(parsed['positions']);
            if (positions && Object.keys(positions).length > 0) {
                layout.positions = positions;
            }
            const viewBox = this.sanitizeViewBox(parsed['viewBox']);
            if (viewBox) {
                layout.viewBox = viewBox;
            }
            const views = this.sanitizeViews(parsed['views']);
            if (views.length > 0) {
                layout.views = views;
            }
            const activeViewId = typeof parsed['activeViewId'] === 'string' ? parsed['activeViewId'] : undefined;
            if (activeViewId) {
                layout.activeViewId = activeViewId;
            }
            return layout;
        } catch (error) {
            const nodeError = error as NodeJS.ErrnoException;
            if (nodeError && nodeError.code === 'ENOENT') {
                return {};
            }
            throw error;
        }
    }

    private sanitizePositions(input: unknown): Record<string, { x: number; y: number }> {
        if (!input || typeof input !== 'object') {
            return {};
        }

        const result: Record<string, { x: number; y: number }> = {};
        for (const [tableName, value] of Object.entries(input as Record<string, unknown>)) {
            if (!value || typeof value !== 'object') {
                continue;
            }
            const candidate = value as Record<string, unknown>;
            const x = Number(candidate.x);
            const y = Number(candidate.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                continue;
            }
            result[tableName] = { x, y };
        }

        return result;
    }

    private sanitizeViewBox(input: unknown): LayoutData['viewBox'] {
        if (!input || typeof input !== 'object') {
            return undefined;
        }

        const candidate = input as Record<string, unknown>;
        const x = Number(candidate.x);
        const y = Number(candidate.y);
        const width = Number(candidate.width);
        const height = Number(candidate.height);

        if (![x, y, width, height].every(value => Number.isFinite(value))) {
            return undefined;
        }

        return { x, y, width, height };
    }

    private sanitizeViews(input: unknown): DiagramViewData[] {
        if (!Array.isArray(input)) {
            return [];
        }

        const sanitized: DiagramViewData[] = [];
        for (const entry of input) {
            if (!entry || typeof entry !== 'object') {
                continue;
            }
            const raw = entry as Record<string, unknown>;
            const id = typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id.trim() : undefined;
            const name = typeof raw.name === 'string' && raw.name.trim().length > 0 ? raw.name.trim() : 'Untitled View';
            const tables = Array.isArray(raw.tables) ? raw.tables.filter(table => typeof table === 'string' && table.trim().length > 0) : [];

            if (!id) {
                continue;
            }

            sanitized.push({
                id,
                name,
                tables: Array.from(new Set(tables))
            });
        }

        return sanitized;
    }

    private async saveLayout(documentPath: string, layout: LayoutData): Promise<void> {
        const layoutFilePath = this.getLayoutFilePathFromFsPath(documentPath);
        const directory = path.dirname(layoutFilePath);
        await fs.mkdir(directory, { recursive: true });

        const payload: LayoutData = {};
        if (layout.positions) {
            payload.positions = layout.positions;
        }
        if (layout.viewBox) {
            payload.viewBox = layout.viewBox;
        }
        if (layout.views) {
            payload.views = layout.views;
        }
        if (layout.activeViewId) {
            payload.activeViewId = layout.activeViewId;
        }

        await fs.writeFile(layoutFilePath, JSON.stringify(payload, null, 2), 'utf8');
    }

	private convertToSchema(database: any): ParsedSchema {
		const tables: ParsedTable[] = [];
		const refs: ParsedRef[] = [];

		// Extract tables
		if (database.schemas && database.schemas.length > 0) {
			const schema = database.schemas[0];
			
			if (schema.tables) {
				schema.tables.forEach((table: any) => {
					const fields: ParsedField[] = [];
					
					if (table.fields) {
						table.fields.forEach((field: any) => {
							const parsedField: ParsedField = {
								name: field.name || '',
								type: field.type?.type_name || 'unknown',
								pk: field.pk || false,
								unique: field.unique || false,
								notNull: field.not_null || false,
								increment: field.increment || false,
								note: field.note || undefined
							};
							fields.push(parsedField);
						});
					}
					
					tables.push({
						name: table.name || '',
						fields: fields,
						note: table.note || undefined
					});
				});
			}

			// Extract references
			if (schema.refs) {
				schema.refs.forEach((ref: any) => {
					const endpoints = (ref.endpoints || []).map((ep: any) => ({
						tableName: ep.tableName || '',
						fieldNames: ep.fieldNames || [],
						relation: ep.relation || '1'
					}));
					
					const parsedRef: ParsedRef = {
						endpoints: endpoints,
						onDelete: ref.onDelete || undefined,
						onUpdate: ref.onUpdate || undefined
					};
					refs.push(parsedRef);
				});
			}
		}

		return { tables, refs };
	}

    private getWebviewContent(dbmlContent: string, layoutData: LayoutData, documentPath: string): string {
		let svgContent = '';
		let errorMessage = '';

		try {
			// Parse DBML
			// @ts-ignore - @dbml/core types are incomplete
			const database = Parser.parse(dbmlContent, 'dbml');
			
			// Convert parsed database to our schema format
			const schema = this.convertToSchema(database);
			
			// Generate SVG from schema
			svgContent = generateSvgFromSchema(schema);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unknown error parsing DBML';
			console.error('DBML Parse Error:', error);
		}

        const layoutJson = JSON.stringify(layoutData ?? {}).replace(/</g, '\\u003c');
        const documentPathJson = JSON.stringify(documentPath ?? '').replace(/</g, '\\u003c');

		return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DBML Preview</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
            overflow: auto;
        }
        
        .container {
            width: 100vw;
            height: 100vh;
            overflow: hidden;
            position: relative;
        }
        
        .diagram-container {
            width: 100%;
            height: 100%;
            overflow: hidden;
            cursor: grab;
        }
        
        .diagram-container.panning {
            cursor: grabbing;
        }
        
        svg {
            width: 100%;
            height: 100%;
            display: block;
        }
        
        /* Adapt SVG colors to theme */
        svg text {
            fill: var(--vscode-editor-foreground);
        }
        
        svg .table-header {
            fill: var(--vscode-button-background);
            stroke: var(--vscode-button-border);
            stroke-width: 1.5;
        }
        
        svg .table-body {
            fill: var(--vscode-editor-background);
        }
        
        svg .table-border {
            stroke: var(--vscode-panel-border);
            stroke-width: 1.5;
        }
        
        svg .field-divider {
            stroke: var(--vscode-panel-border);
            stroke-width: 1;
            opacity: 0.3;
        }
        
        svg .relationship-line {
            stroke: var(--vscode-editor-foreground);
            stroke-width: 2;
            fill: none;
            opacity: 0.3;
            transition: opacity 0.2s ease, stroke 0.2s ease, stroke-width 0.2s ease, stroke-dasharray 0.2s ease;
            stroke-dasharray: none;
        }
        
        svg .relationship-line.active {
            opacity: 1;
            stroke: var(--vscode-button-background);
            stroke-width: 2.5;
            filter: brightness(1.2) saturate(1.3);
            stroke-dasharray: 8, 4;
            animation: dash-flow-active 1.5s linear infinite;
        }
        
        svg .cardinality-marker {
            fill: var(--vscode-editor-foreground);
            stroke: var(--vscode-editor-foreground);
            opacity: 0.3;
            transition: opacity 0.2s ease, fill 0.2s ease, stroke 0.2s ease;
        }
        
        svg .relationship-line.active ~ marker .cardinality-marker,
        svg path.active + marker .cardinality-marker {
            opacity: 1;
            fill: var(--vscode-button-background);
            stroke: var(--vscode-button-background);
            filter: brightness(1.2) saturate(1.3);
        }
        
        @keyframes dash-flow {
            to {
                stroke-dashoffset: -100;
            }
        }
        
        @keyframes dash-flow-active {
            to {
                stroke-dashoffset: -50;
            }
        }
        
        svg .table-name {
            fill: var(--vscode-button-foreground);
        }
        
        svg .field-row:hover {
            fill: var(--vscode-list-hoverBackground);
            opacity: 0.5;
        }
        
        svg .table:hover {
            filter: brightness(1.1);
        }
        
        svg .draggable.selected .table {
            filter: brightness(1.08) drop-shadow(0 0 3px var(--vscode-button-background));
        }
        
        svg .draggable.selected .table-border {
            stroke: var(--vscode-button-background);
            stroke-width: 2.2;
            filter: drop-shadow(0 0 2px var(--vscode-button-background));
            animation: pulse-border 2s ease-in-out infinite;
        }
        
        @keyframes pulse-border {
            0%, 100% {
                opacity: 1;
            }
            50% {
                opacity: 0.7;
            }
        }
        
        .error {
            color: var(--vscode-errorForeground);
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            padding: 15px;
            border-radius: 4px;
            margin: 20px;
        }
        
        .error-title {
            font-weight: bold;
            margin-bottom: 8px;
        }
        
        svg .draggable {
            cursor: move;
        }
        
        svg .draggable.dragging {
            opacity: 0.7;
        }
        
        /* Note tooltip */
        .note-tooltip {
            position: fixed;
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-editorWidget-border);
            border-radius: 6px;
            padding: 12px 16px;
            max-width: 400px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 10000;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s ease;
            font-size: 13px;
            line-height: 1.5;
            color: var(--vscode-editorWidget-foreground);
            word-wrap: break-word;
            white-space: pre-wrap;
        }
        
        .note-tooltip.visible {
            opacity: 1;
        }
        
        .note-tooltip::before {
            content: '';
            position: absolute;
            left: -8px;
            top: 50%;
            transform: translateY(-50%);
            width: 0;
            height: 0;
            border-style: solid;
            border-width: 6px 8px 6px 0;
            border-color: transparent var(--vscode-editorWidget-border) transparent transparent;
        }
        
        .note-tooltip::after {
            content: '';
            position: absolute;
            left: -7px;
            top: 50%;
            transform: translateY(-50%);
            width: 0;
            height: 0;
            border-style: solid;
            border-width: 5px 7px 5px 0;
            border-color: transparent var(--vscode-editorWidget-background) transparent transparent;
        }
        
        svg .note-icon:hover {
            opacity: 1 !important;
        }
        
        /* Table directory panel */
        .table-directory {
            position: fixed;
            right: -280px;
            top: 0;
            width: 280px;
            height: 100%;
            background: var(--vscode-sideBar-background);
            border-left: 1px solid var(--vscode-panel-border);
            transition: right 0.3s ease;
            z-index: 999;
            display: flex;
            flex-direction: column;
        }
        
        .table-directory.open {
            right: 0;
        }
        
        .table-directory-header {
            padding: 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .table-directory-title {
            font-weight: 600;
            font-size: 14px;
            color: var(--vscode-foreground);
        }
        
        .table-directory-close {
            background: none;
            border: none;
            color: var(--vscode-icon-foreground);
            cursor: pointer;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: background 0.2s ease;
        }
        
        .table-directory-close:hover {
            background: var(--vscode-toolbar-hoverBackground);
        }
        
        .table-directory-content {
            flex: 1;
            overflow-y: auto;
            padding: 8px;
        }
        
        .table-directory-item {
            padding: 10px 12px;
            cursor: pointer;
            border-radius: 4px;
            transition: background 0.2s ease;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            color: var(--vscode-foreground);
            margin-bottom: 2px;
        }
        
        .table-directory-item:hover {
            background: var(--vscode-list-hoverBackground);
        }
        
        .table-directory-item.selected {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }
        
        .table-directory-item svg {
            width: 16px;
            height: 16px;
            opacity: 0.7;
        }
        
        /* Toolbar */
        .toolbar {
            position: fixed;
            bottom: 20px;
            left: 20px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            z-index: 1000;
        }
        
        .toolbar-button,
        .toolbar-button.directory-toggle {
            width: 40px;
            height: 40px;
            background: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }
        
        .toolbar-button:hover {
            background: var(--vscode-list-hoverBackground);
            transform: scale(1.05);
        }
        
        .toolbar-button.active {
            background: var(--vscode-button-background);
            border-color: var(--vscode-button-background);
        }
        
        .toolbar-button svg {
            width: 24px;
            height: 24px;
            fill: currentColor;
            color: var(--vscode-icon-foreground);
            opacity: 0.9;
        }
        
        .toolbar-button:hover svg {
            opacity: 1;
            color: var(--vscode-editor-background);
            filter: brightness(2) contrast(1.5);
        }
        
        .toolbar-button.active svg {
            color: var(--vscode-button-foreground);
        }
        
        .side-panel {
            position: fixed;
            right: -300px;
            top: 0;
            width: 300px;
            height: 100%;
            background: var(--vscode-sideBar-background);
            border-left: 1px solid var(--vscode-panel-border);
            box-shadow: -2px 0 8px rgba(0, 0, 0, 0.2);
            transition: right 0.3s ease;
            z-index: 999;
            overflow-y: auto;
        }
        
        .side-panel.open {
            right: 0;
        }
        
        .side-panel-header {
            padding: 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        
        .side-panel-title {
            font-size: 14px;
            font-weight: 600;
            color: var(--vscode-editor-foreground);
        }
        
        .side-panel-close {
            background: none;
            border: none;
            color: var(--vscode-editor-foreground);
            cursor: pointer;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .side-panel-close:hover {
            background: var(--vscode-list-hoverBackground);
            border-radius: 3px;
        }
        
        .side-panel-content {
            padding: 8px;
        }
        
        .menu-item {
            padding: 12px 16px;
            cursor: pointer;
            transition: background 0.2s ease;
            border-radius: 4px;
            margin-bottom: 4px;
        }
        
        .menu-item:hover {
            background: var(--vscode-list-hoverBackground);
        }
        
        .menu-item-title {
            font-weight: 500;
            margin-bottom: 4px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .menu-item-icon {
            width: 16px;
            height: 16px;
        }
        
        .menu-item-icon svg {
            width: 100%;
            height: 100%;
            fill: currentColor;
            color: var(--vscode-icon-foreground);
            opacity: 0.8;
        }
        
        .menu-item:hover .menu-item-icon svg {
            opacity: 1;
        }
        
        .menu-item-description {
            font-size: 11px;
            opacity: 0.7;
            line-height: 1.4;
            margin-left: 24px;
        }

        .hidden {
            display: none !important;
        }

        .draggable.hidden,
        .relationship-line.hidden,
        .table-directory-item.hidden {
            display: none !important;
        }

        .diagram-views-panel {
            position: absolute;
            top: 16px;
            right: 16px;
            width: 280px;
            max-height: calc(100% - 32px);
            display: none;
            flex-direction: column;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 6px;
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
            overflow: hidden;
            z-index: 25;
        }

        .diagram-views-panel.open {
            display: flex;
        }

        .diagram-views-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 14px;
            background: var(--vscode-editorWidget-background);
            border-bottom: 1px solid var(--vscode-widget-border);
            font-weight: 500;
        }

        .diagram-views-title {
            font-size: 13px;
        }

        .diagram-views-close {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            border: none;
            border-radius: 4px;
            background: transparent;
            color: var(--vscode-icon-foreground);
            cursor: pointer;
        }

        .diagram-views-close:hover {
            background: var(--vscode-toolbar-hoverBackground);
        }

        .diagram-views-body {
            display: flex;
            flex-direction: column;
            padding: 12px 14px;
            gap: 12px;
            overflow: hidden;
        }

        .diagram-views-select-row {
            display: flex;
            gap: 8px;
            align-items: center;
        }

        .diagram-views-select {
            flex: 1;
            height: 28px;
            font-size: 12px;
            padding: 4px 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
        }

        .diagram-views-actions {
            display: flex;
            gap: 6px;
        }

        .diagram-views-button {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            height: 28px;
            font-size: 12px;
            border-radius: 4px;
            border: 1px solid var(--vscode-button-border, transparent);
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            cursor: pointer;
            transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease, opacity 0.2s ease;
        }

        .diagram-views-button.primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-border, transparent);
            box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
        }

        .diagram-views-button:hover:not(:disabled) {
            background: var(--vscode-button-hoverBackground, var(--vscode-button-background));
            border-color: var(--vscode-button-hoverBorder, var(--vscode-button-border, transparent));
        }

        .diagram-views-button.primary:hover:not(:disabled) {
            background: var(--vscode-button-hoverBackground, var(--vscode-button-background));
            color: var(--vscode-button-foreground);
        }

        .diagram-views-button:disabled {
            opacity: 0.6;
            cursor: default;
        }

        .diagram-views-table-list {
            flex: 1;
            overflow: auto;
            border: 1px solid var(--vscode-widget-border);
            border-radius: 6px;
            padding: 6px;
            display: flex;
            flex-direction: column;
            gap: 4px;
            background: var(--vscode-editorWidget-background);
        }

        .diagram-views-table-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 8px;
            border-radius: 4px;
        }

        .diagram-views-table-item:hover {
            background: var(--vscode-toolbar-hoverBackground);
        }

        .diagram-views-table-item input[type="checkbox"] {
            width: 14px;
            height: 14px;
        }

        .diagram-views-empty {
            padding: 12px;
            text-align: center;
            font-size: 12px;
            opacity: 0.7;
        }

        .diagram-views-footer {
            display: flex;
            gap: 8px;
        }

        .diagram-views-footer .diagram-views-button {
            flex: 1;
        }

        .diagram-views-hint {
            font-size: 11px;
            opacity: 0.7;
            line-height: 1.4;
        }
    </style>
</head>
<body>
    <div class="container">
        ${errorMessage ? `
            <div class="error">
                <div class="error-title">Error parsing DBML:</div>
                <pre>${errorMessage}</pre>
            </div>
        ` : `
            <div class="table-directory" id="tableDirectory">
                <div class="table-directory-header">
                    <div class="table-directory-title">Tables</div>
                    <button class="table-directory-close" id="closeDirectoryBtn">
                        <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                            <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z"/>
                        </svg>
                    </button>
                </div>
                <div class="table-directory-content" id="tableDirectoryContent">
                </div>
            </div>
            <div class="diagram-container">
                ${svgContent}
            </div>
            <div class="side-panel" id="sidePanel">
                <div class="side-panel-header">
                    <div class="side-panel-title">Auto Arrange Diagram</div>
                    <button class="side-panel-close" id="closePanelBtn">
                        <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                            <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z"/>
                        </svg>
                    </button>
                </div>
                <div class="side-panel-content">
                    <div class="menu-item" data-algorithm="left-right">
                        <div class="menu-item-title">
                            <div class="menu-item-icon">
                                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M4 11h12.17l-5.59-5.59L12 4l8 8-8 8-1.41-1.41L16.17 13H4z"/>
                                </svg>
                            </div>
                            <span>Left-right</span>
                        </div>
                        <div class="menu-item-description">Arrange tables from left to right based on relationship direction. Ideal for diagrams with long relationship lineage like ETL pipelines.</div>
                    </div>
                    <div class="menu-item" data-algorithm="snowflake">
                        <div class="menu-item-title">
                            <div class="menu-item-icon">
                                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2zm0 8l1.5 4.5L18 16l-4.5 1.5L12 22l-1.5-4.5L6 16l4.5-1.5L12 10z"/>
                                </svg>
                            </div>
                            <span>Snowflake</span>
                        </div>
                        <div class="menu-item-description">Arrange tables in a snowflake shape, with the most connected tables in the center. Ideal for densely connected diagrams like data warehouses.</div>
                    </div>
                    <div class="menu-item" data-algorithm="compact">
                        <div class="menu-item-title">
                            <div class="menu-item-icon">
                                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/>
                                </svg>
                            </div>
                            <span>Compact</span>
                        </div>
                        <div class="menu-item-description">Arrange tables in a compact rectangular layout. Ideal for diagrams with few relationships and tables.</div>
                    </div>
                </div>
            </div>
            <div class="diagram-views-panel" id="diagramViewsPanel">
                <div class="diagram-views-header">
                    <div class="diagram-views-title">Diagram Views</div>
                    <button class="diagram-views-close" id="closeDiagramViewsBtn" title="Close">
                        <svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                            <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z"/>
                        </svg>
                    </button>
                </div>
                <div class="diagram-views-body">
                    <div class="diagram-views-select-row">
                        <select class="diagram-views-select" id="diagramViewsSelect" title="Select a saved view">
                        </select>
                        <button class="diagram-views-button" id="diagramViewsNewBtn" title="Create new view">New</button>
                    </div>
                    <div class="diagram-views-actions">
                        <button class="diagram-views-button" id="diagramViewsRenameBtn" title="Rename view">Rename</button>
                        <button class="diagram-views-button" id="diagramViewsDeleteBtn" title="Delete view">Delete</button>
                    </div>
                    <div class="diagram-views-table-list" id="diagramViewsTableList"></div>
                    <div class="diagram-views-footer">
                        <button class="diagram-views-button" id="diagramViewsShowAllBtn" title="Show all tables">Show all</button>
                        <button class="diagram-views-button primary" id="diagramViewsSaveBtn" title="Save current view">Save</button>
                    </div>
                    <div class="diagram-views-hint">Select which tables belong to the active view. Use Show all to reset the diagram.</div>
                </div>
            </div>
            <div class="toolbar">
                <button class="toolbar-button directory-toggle" id="directoryToggleBtn" title="Toggle table directory">
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                        <path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z"/>
                    </svg>
                </button>
                <button class="toolbar-button" id="diagramViewsToggleBtn" title="Toggle diagram views panel">
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                        <path d="M4 5h5v5H4V5zm0 9h5v5H4v-5zm11-9h5v5h-5V5zm0 9h5v5h-5v-5z"/>
                    </svg>
                </button>
                <button class="toolbar-button" id="autoArrangeBtn" title="Auto arrange diagram">
                    <svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                        <path d="M42.56,26.854c0.391-0.391,0.391-1.023,0-1.414l-4.685-4.686c-0.188-0.188-0.442-0.293-0.707-0.293s-0.52,0.105-0.707,0.293l-9.979,9.979c-0.799,0.775-1.823,1.202-2.883,1.202c-0.937,0-1.801-0.348-2.432-0.979c-1.387-1.387-1.281-3.776,0.231-5.323c0.076-0.076,3.404-3.405,6.2-6.201c0,0,0,0,0,0s0,0,0,0c1.902-1.902,3.56-3.56,3.769-3.769c0.391-0.391,0.391-1.023,0-1.414l-4.685-4.686c-0.188-0.188-0.442-0.293-0.708-0.293c0,0,0,0-0.001,0c-0.266,0.001-0.521,0.107-0.708,0.295c-0.042,0.043-1.747,1.748-3.767,3.768l0,0l0,0c-0.038,0.038-0.075,0.075-0.113,0.113c-2.974,2.974-6.57,6.57-6.589,6.59C9.785,25.162,9.54,33.164,14.25,37.874c2.19,2.19,5.162,3.396,8.368,3.396c3.484,0,6.833-1.387,9.425-3.901C32.104,37.311,42.455,26.959,42.56,26.854z M25.976,11.685l3.271,3.271c-0.873,0.873-1.639,1.639-2.356,2.355l-3.271-3.271C24.577,13.084,25.419,12.242,25.976,11.685z M30.654,35.93c-2.221,2.154-5.075,3.341-8.036,3.341c-2.672,0-5.142-0.998-6.954-2.811c-3.938-3.938-3.686-10.679,0.56-15.021c0.072-0.072,3.176-3.176,5.983-5.984l3.271,3.271c-5.475,5.475-5.504,5.505-5.505,5.506c-2.279,2.33-2.377,5.981-0.22,8.14c1.009,1.009,2.375,1.564,3.846,1.564c1.582,0,3.101-0.627,4.286-1.777l5.505-5.505l3.271,3.271C33.85,32.735,30.743,35.842,30.654,35.93z M38.075,28.511l-3.271-3.271l2.364-2.364l3.271,3.271C39.881,26.705,39.035,27.55,38.075,28.511z"/>
                    </svg>
                </button>
                <button class="toolbar-button" id="resetZoomBtn" title="Reset zoom and pan">
                    <svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                        <path d="M20.921,31.898c2.758,0,5.367-0.956,7.458-2.704l1.077,1.077l-0.358,0.358c-0.188,0.188-0.293,0.442-0.293,0.707s0.105,0.52,0.293,0.707l8.257,8.256c0.195,0.195,0.451,0.293,0.707,0.293s0.512-0.098,0.707-0.293l2.208-2.208c0.188-0.188,0.293-0.442,0.293-0.707s-0.105-0.52-0.293-0.707l-8.257-8.256c-0.391-0.391-1.023-0.391-1.414,0l-0.436,0.436l-1.073-1.073c1.793-2.104,2.777-4.743,2.777-7.537c0-3.112-1.212-6.038-3.413-8.239s-5.127-3.413-8.239-3.413s-6.038,1.212-8.238,3.413c-2.201,2.201-3.413,5.126-3.413,8.239c0,3.112,1.212,6.038,3.413,8.238C14.883,30.687,17.809,31.898,20.921,31.898z M38.855,37.385l-0.794,0.793l-6.843-6.842l0.794-0.793L38.855,37.385z M14.097,13.423c1.823-1.823,4.246-2.827,6.824-2.827s5.002,1.004,6.825,2.827c1.823,1.823,2.827,4.247,2.827,6.825c0,2.578-1.004,5.001-2.827,6.824c-1.823,1.823-4.247,2.827-6.825,2.827s-5.001-1.004-6.824-2.827c-1.823-1.823-2.827-4.247-2.827-6.824C11.27,17.669,12.273,15.246,14.097,13.423z"/>
                    </svg>
                </button>
            </div>
        `}
    </div>
    
    <script>
        (function() {
            const vscode = acquireVsCodeApi();
            const svg = document.getElementById('diagram-svg');
            const container = document.querySelector('.diagram-container');
            const initialLayoutData = ${layoutJson};
            const documentPath = ${documentPathJson};
            const tableLookup = new Map();
            document.querySelectorAll('.draggable').forEach(table => {
                const name = table.getAttribute('data-table');
                if (name) {
                    tableLookup.set(name, table);
                }
            });
            const directoryLookup = new Map();
            const allTableNames = Array.from(tableLookup.keys()).sort((a, b) => a.localeCompare(b));
            
            let selectedTable = null;
            let offset = { x: 0, y: 0 };
            let isDragging = false;
            let isPanning = false;
            let panStart = { x: 0, y: 0 };
            
            let viewBox = { x: 0, y: 0, width: 2000, height: 2000 };
            const gridSize = 20;
            const layoutCanPersist = typeof documentPath === 'string' && documentPath.length > 0;
			
            const state = vscode.getState() || {};
            let positions = {};
            let diagramViews = Array.isArray(state.views)
                ? JSON.parse(JSON.stringify(state.views))
                : Array.isArray(initialLayoutData.views)
                    ? JSON.parse(JSON.stringify(initialLayoutData.views))
                    : [];
            if (!Array.isArray(diagramViews)) {
                diagramViews = [];
            }
            let activeViewId = typeof state.activeViewId === 'string'
                ? state.activeViewId
                : typeof initialLayoutData.activeViewId === 'string'
                    ? initialLayoutData.activeViewId
                    : '';
            if (activeViewId && !diagramViews.some(view => view && view.id === activeViewId)) {
                activeViewId = '';
            }
            let pendingViewTables = new Set();
            if (state.positions && typeof state.positions === 'object') {
                positions = JSON.parse(JSON.stringify(state.positions));
            } else if (initialLayoutData.positions && typeof initialLayoutData.positions === 'object') {
                positions = JSON.parse(JSON.stringify(initialLayoutData.positions));
            }
            const savedViewBox = state.viewBox || initialLayoutData.viewBox;
            let layoutSaveTimeout = null;

            function cloneViews() {
                return diagramViews.map(view => ({
                    id: view.id,
                    name: view.name,
                    tables: Array.isArray(view.tables) ? [...view.tables] : []
                }));
            }

            function getActiveView() {
                if (!activeViewId) {
                    return null;
                }
                return diagramViews.find(view => view.id === activeViewId) || null;
            }

            function persistState() {
                state.positions = positions;
                state.viewBox = viewBox;
                state.views = cloneViews();
                state.activeViewId = activeViewId;
                vscode.setState(state);
            }
			
            function sendLayoutUpdate() {
                if (!layoutCanPersist) {
                    return;
                }

                const clonedPositions = positions && typeof positions === 'object'
                    ? JSON.parse(JSON.stringify(positions))
                    : {};
                const clonedViewBox = {
                    x: viewBox.x,
                    y: viewBox.y,
                    width: viewBox.width,
                    height: viewBox.height
                };

                const clonedViews = cloneViews();

                vscode.postMessage({
                    type: 'saveLayout',
                    payload: {
                        documentPath,
                        positions: clonedPositions,
                        viewBox: clonedViewBox,
                        views: clonedViews,
                        activeViewId: activeViewId
                    }
                });
            }

            function scheduleLayoutSave() {
                if (!layoutCanPersist) {
                    return;
                }

                if (layoutSaveTimeout) {
                    clearTimeout(layoutSaveTimeout);
                }

                layoutSaveTimeout = setTimeout(() => {
                    layoutSaveTimeout = null;
                    sendLayoutUpdate();
                }, 250);
            }

            function ensurePendingViewTables() {
                const activeView = getActiveView();
                if (activeView && Array.isArray(activeView.tables) && activeView.tables.length > 0) {
                    const filtered = activeView.tables.filter(name => typeof name === 'string' && tableLookup.has(name));
                    pendingViewTables = filtered.length > 0 ? new Set(filtered) : new Set(allTableNames);
                } else {
                    pendingViewTables = new Set(allTableNames);
                }
            }

            function applyViewTables(tableNames) {
                const hadRequestedTables = Array.isArray(tableNames) && tableNames.length > 0;
                const normalized = Array.isArray(tableNames) ? tableNames.filter(name => typeof name === 'string' && tableLookup.has(name)) : [];
                const set = new Set(normalized);
                let restrict = set.size < tableLookup.size;
                if (set.size === 0) {
                    restrict = hadRequestedTables ? false : true;
                }

                tableLookup.forEach((table, name) => {
                    const shouldShow = !restrict || set.has(name);
                    table.classList.toggle('hidden', !shouldShow);
                });

                directoryLookup.forEach((item, name) => {
                    const shouldShow = !restrict || set.has(name);
                    item.classList.toggle('hidden', !shouldShow);
                });

                document.querySelectorAll('.relationship-line').forEach(line => {
                    const fromTable = line.getAttribute('data-from');
                    const toTable = line.getAttribute('data-to');
                    const shouldShow = !restrict || (fromTable && toTable && set.has(fromTable) && set.has(toTable));
                    line.classList.toggle('hidden', !shouldShow);
                });

                updateRelationships();
            }
            
            // Collision detection helper
            function getTableHeight(table) {
                const fieldCount = table.querySelectorAll('.field-row').length;
                const fieldHeight = 30;
                const headerHeight = 40;
                return headerHeight + (fieldCount * fieldHeight);
            }
            
            function checkCollision(x1, y1, w1, h1, x2, y2, w2, h2) {
                return !(x1 + w1 < x2 || x2 + w2 < x1 || y1 + h1 < y2 || y2 + h2 < y1);
            }
            
            function resolveCollisions(tablePositions, tableWidth) {
                const minSpacing = 50;
                let hasCollision = true;
                let iterations = 0;
                const maxIterations = 100;
                
                while (hasCollision && iterations < maxIterations) {
                    hasCollision = false;
                    iterations++;
                    
                    for (let i = 0; i < tablePositions.length; i++) {
                        for (let j = i + 1; j < tablePositions.length; j++) {
                            const pos1 = tablePositions[i];
                            const pos2 = tablePositions[j];
                            
                            if (checkCollision(
                                pos1.x, pos1.y, tableWidth, pos1.height,
                                pos2.x, pos2.y, tableWidth, pos2.height
                            )) {
                                hasCollision = true;
                                
                                // Calculate overlap
                                const centerX1 = pos1.x + tableWidth / 2;
                                const centerY1 = pos1.y + pos1.height / 2;
                                const centerX2 = pos2.x + tableWidth / 2;
                                const centerY2 = pos2.y + pos2.height / 2;
                                
                                const dx = centerX2 - centerX1;
                                const dy = centerY2 - centerY1;
                                const distance = Math.sqrt(dx * dx + dy * dy);
                                
                                if (distance > 0) {
                                    // Push apart
                                    const pushDistance = minSpacing;
                                    const pushX = (dx / distance) * pushDistance;
                                    const pushY = (dy / distance) * pushDistance;
                                    
                                    pos2.x += pushX;
                                    pos2.y += pushY;
                                }
                            }
                        }
                    }
                }
            }
            
            // Auto arrange algorithms
            function applyAutoArrange(algorithm) {
                const tables = Array.from(tableLookup.values());
                if (tables.length === 0) {
                    return;
                }
                const tableWidth = 250;
                const fieldHeight = 30;
                const headerHeight = 40;
                const spacing = 150;
                
                // Initialize positions if needed
                if (!positions || typeof positions !== 'object') {
                    positions = {};
                }
                
                if (algorithm === 'left-right') {
                    // Build dependency graph
                    const graph = new Map();
                    const inDegree = new Map();
                    
                    tables.forEach(table => {
                        const name = table.getAttribute('data-table');
                        if (!name) {
                            return;
                        }
                        graph.set(name, []);
                        inDegree.set(name, 0);
                    });
                    
                    document.querySelectorAll('.relationship-line').forEach(line => {
                        const from = line.getAttribute('data-from');
                        const to = line.getAttribute('data-to');
                        if (from && to && graph.has(from) && inDegree.has(to)) {
                            graph.get(from).push(to);
                            inDegree.set(to, inDegree.get(to) + 1);
                        }
                    });
                    
                    // Topological sort for layering
                    const layers = [];
                    const queue = [];
                    const processed = new Set();
                    
                    inDegree.forEach((degree, name) => {
                        if (degree === 0) queue.push(name);
                    });
                    
                    while (queue.length > 0) {
                        const currentLayer = [...queue];
                        layers.push(currentLayer);
                        queue.length = 0;
                        
                        currentLayer.forEach(name => {
                            processed.add(name);
                            const neighbors = graph.get(name) || [];
                            neighbors.forEach(neighbor => {
                                if (!inDegree.has(neighbor)) {
                                    return;
                                }
                                inDegree.set(neighbor, inDegree.get(neighbor) - 1);
                                if (inDegree.get(neighbor) === 0 && !processed.has(neighbor)) {
                                    queue.push(neighbor);
                                }
                            });
                        });
                    }
                    
                    // Position tables
                    const tablePositions = [];
                    let x = 100;
                    
                    layers.forEach((layer, layerIndex) => {
                        let y = 100;
                        layer.forEach((tableName, index) => {
                            const table = tableLookup.get(tableName);
                            if (table) {
                                const height = getTableHeight(table);
                                tablePositions.push({ 
                                    table, 
                                    tableName, 
                                    x, 
                                    y, 
                                    height 
                                });
                                y += height + 100;
                            }
                        });
                        x += tableWidth + spacing;
                    });
                    
                    // Resolve collisions
                    resolveCollisions(tablePositions, tableWidth);
                    
                    // Apply positions
                    tablePositions.forEach(pos => {
                        pos.table.setAttribute('transform', 'translate(' + pos.x + ', ' + pos.y + ')');
                        pos.table.setAttribute('data-x', pos.x);
                        pos.table.setAttribute('data-y', pos.y);
                        if (pos.tableName) {
                            positions[pos.tableName] = { x: pos.x, y: pos.y };
                        }
                    });
                    
                } else if (algorithm === 'snowflake') {
                    // Calculate connection count for each table
                    const connections = new Map();
                    tables.forEach(table => {
                        const name = table.getAttribute('data-table');
                        if (name) {
                            connections.set(name, 0);
                        }
                    });
                    
                    document.querySelectorAll('.relationship-line').forEach(line => {
                        const from = line.getAttribute('data-from');
                        const to = line.getAttribute('data-to');
                        if (from && connections.has(from)) {
                            connections.set(from, connections.get(from) + 1);
                        }
                        if (to && connections.has(to)) {
                            connections.set(to, connections.get(to) + 1);
                        }
                    });
                    
                    // Sort by connection count
                    const sortedTables = tables.sort((a, b) => {
                        const aConn = connections.get(a.getAttribute('data-table')) || 0;
                        const bConn = connections.get(b.getAttribute('data-table')) || 0;
                        return bConn - aConn;
                    });
                    
                    // Place center table
                    const tablePositions = [];
                    
                    if (sortedTables.length > 0) {
                        const centerTable = sortedTables[0];
                        const centerX = 500;
                        const centerY = 500;
                        const centerHeight = getTableHeight(centerTable);
                        
                        tablePositions.push({
                            table: centerTable,
                            tableName: centerTable.getAttribute('data-table'),
                            x: centerX,
                            y: centerY,
                            height: centerHeight
                        });
                        
                        // Place remaining tables in a circle
                        const radius = 450;
                        const angleStep = (2 * Math.PI) / (sortedTables.length - 1);
                        
                        for (let i = 1; i < sortedTables.length; i++) {
                            const angle = angleStep * (i - 1);
                            const x = centerX + radius * Math.cos(angle);
                            const y = centerY + radius * Math.sin(angle);
                            const table = sortedTables[i];
                            const height = getTableHeight(table);
                            
                            tablePositions.push({
                                table: table,
                                tableName: table.getAttribute('data-table'),
                                x: x,
                                y: y,
                                height: height
                            });
                        }
                        
                        // Resolve collisions
                        resolveCollisions(tablePositions, tableWidth);
                        
                        // Apply positions
                        tablePositions.forEach(pos => {
                            pos.table.setAttribute('transform', 'translate(' + pos.x + ', ' + pos.y + ')');
                            pos.table.setAttribute('data-x', pos.x);
                            pos.table.setAttribute('data-y', pos.y);
                            if (pos.tableName) {
                                positions[pos.tableName] = { x: pos.x, y: pos.y };
                            }
                        });
                    }
                    
                } else if (algorithm === 'compact') {
                    // Simple grid layout
                    const cols = Math.ceil(Math.sqrt(tables.length));
                    const tablePositions = [];
                    let x = 100;
                    let y = 100;
                    let col = 0;
                    let maxHeightInRow = 0;
                    
                    tables.forEach(table => {
                        const height = getTableHeight(table);
                        maxHeightInRow = Math.max(maxHeightInRow, height);
                        
                        tablePositions.push({
                            table: table,
                            tableName: table.getAttribute('data-table'),
                            x: x,
                            y: y,
                            height: height
                        });
                        
                        col++;
                        if (col >= cols) {
                            col = 0;
                            x = 100;
                            y += maxHeightInRow + 100;
                            maxHeightInRow = 0;
                        } else {
                            x += tableWidth + spacing;
                        }
                    });
                    
                    // Resolve collisions
                    resolveCollisions(tablePositions, tableWidth);
                    
                    // Apply positions
                    tablePositions.forEach(pos => {
                        pos.table.setAttribute('transform', 'translate(' + pos.x + ', ' + pos.y + ')');
                        pos.table.setAttribute('data-x', pos.x);
                        pos.table.setAttribute('data-y', pos.y);
                        if (pos.tableName) {
                            positions[pos.tableName] = { x: pos.x, y: pos.y };
                        }
                    });
                }
                
                // Update relationships
                updateRelationships();
                
                // Save state
                persistState();
                scheduleLayoutSave();
            }
            
            if (savedViewBox) {
                viewBox = {
                    x: savedViewBox.x,
                    y: savedViewBox.y,
                    width: savedViewBox.width,
                    height: savedViewBox.height
                };
                svg.setAttribute('viewBox', viewBox.x + ' ' + viewBox.y + ' ' + viewBox.width + ' ' + viewBox.height);
            }
            
            // Apply saved positions
            if (Object.keys(positions).length > 0) {
                document.querySelectorAll('.draggable').forEach(table => {
                    const tableName = table.getAttribute('data-table');
                    if (positions[tableName]) {
                        const { x, y } = positions[tableName];
                        table.setAttribute('transform', 'translate(' + x + ', ' + y + ')');
                        table.setAttribute('data-x', x);
                        table.setAttribute('data-y', y);
                        updateRelationships();
                    }
                });
            }
            
            // Hover effect for tables and relationships
            document.querySelectorAll('.draggable').forEach(table => {
                table.addEventListener('mouseenter', function() {
                    if (!isDragging) {
                        const tableName = this.getAttribute('data-table');
                        highlightRelationships(tableName, true);
                    }
                });
                
                table.addEventListener('mouseleave', function() {
                    if (!isDragging) {
                        const tableName = this.getAttribute('data-table');
                        highlightRelationships(tableName, false);
                    }
                });
            });
            
            function highlightRelationships(tableName, highlight) {
                document.querySelectorAll('.relationship-line').forEach(line => {
                    const fromTable = line.getAttribute('data-from');
                    const toTable = line.getAttribute('data-to');
                    
                    if (fromTable === tableName || toTable === tableName) {
                        if (highlight) {
                            line.classList.add('active');
                        } else {
                            line.classList.remove('active');
                        }
                    }
                });

            }
            
            // Zoom with mouse wheel
            svg.addEventListener('wheel', (e) => {
                e.preventDefault();
                
                const delta = e.deltaY > 0 ? 1.1 : 0.9;
                const pt = svg.createSVGPoint();
                pt.x = e.clientX;
                pt.y = e.clientY;
                const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
                
                viewBox.width *= delta;
                viewBox.height *= delta;
                
                viewBox.x = svgP.x - (svgP.x - viewBox.x) * delta;
                viewBox.y = svgP.y - (svgP.y - viewBox.y) * delta;
                
                svg.setAttribute('viewBox', viewBox.x + ' ' + viewBox.y + ' ' + viewBox.width + ' ' + viewBox.height);
                
                // Save viewBox state
                persistState();
                scheduleLayoutSave();
            });
            
            // Mouse down - start dragging or panning
            document.addEventListener('mousedown', (e) => {
                const target = e.target;
                const tableGroup = target.closest('.draggable');
                
                // Check if click is outside any table (deselect)
                if (!tableGroup && !target.closest('.table-directory') && !target.closest('.toolbar')) {
                    // Deselect all tables
                    document.querySelectorAll('.draggable.selected').forEach(t => {
                        t.classList.remove('selected');
                    });
                    document.querySelectorAll('.table-directory-item.selected').forEach(item => {
                        item.classList.remove('selected');
                    });
                }
                
                if (tableGroup) {
                    // Select the table when clicking on it
                    const tableName = tableGroup.getAttribute('data-table');
                    if (tableName) {
                        selectTable(tableName);
                    }
                    
                    // Dragging a table
                    isDragging = true;
                    selectedTable = tableGroup;
                    selectedTable.classList.add('dragging');
                    
                    const transform = selectedTable.getAttribute('transform');
                    const match = transform.match(/translate\\(([^,]+),\\s*([^)]+)\\)/);
                    const currentX = match ? parseFloat(match[1]) : 0;
                    const currentY = match ? parseFloat(match[2]) : 0;
                    
                    const pt = svg.createSVGPoint();
                    pt.x = e.clientX;
                    pt.y = e.clientY;
                    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
                    
                    offset.x = svgP.x - currentX;
                    offset.y = svgP.y - currentY;
                    
                    e.preventDefault();
                } else if (e.target === svg || e.target.closest('#relationships')) {
                    // Panning the canvas
                    isPanning = true;
                    container.classList.add('panning');
                    panStart.x = e.clientX;
                    panStart.y = e.clientY;
                    e.preventDefault();
                }
            });
            
            // Mouse move - drag table or pan canvas
            document.addEventListener('mousemove', (e) => {
                if (isDragging && selectedTable) {
                    const pt = svg.createSVGPoint();
                    pt.x = e.clientX;
                    pt.y = e.clientY;
                    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
                    
                    // Snap to grid
                    let newX = Math.round((svgP.x - offset.x) / gridSize) * gridSize;
                    let newY = Math.round((svgP.y - offset.y) / gridSize) * gridSize;
                    
                    selectedTable.setAttribute('transform', 'translate(' + newX + ', ' + newY + ')');
                    selectedTable.setAttribute('data-x', newX);
                    selectedTable.setAttribute('data-y', newY);
                    
                    // Force update relationships immediately during dragging
                    updateRelationships();
                    e.preventDefault();
                } else if (isPanning) {
                    const dx = (e.clientX - panStart.x) * (viewBox.width / svg.clientWidth);
                    const dy = (e.clientY - panStart.y) * (viewBox.height / svg.clientHeight);
                    
                    viewBox.x -= dx;
                    viewBox.y -= dy;
                    
                    svg.setAttribute('viewBox', viewBox.x + ' ' + viewBox.y + ' ' + viewBox.width + ' ' + viewBox.height);
                    
                    panStart.x = e.clientX;
                    panStart.y = e.clientY;
                    e.preventDefault();
                }
            });
            
            // Mouse up - stop dragging or panning
            document.addEventListener('mouseup', (e) => {
                if (isDragging && selectedTable) {
                    selectedTable.classList.remove('dragging');
                    
                    // Save positions
                    const tableName = selectedTable.getAttribute('data-table');
                    const x = parseFloat(selectedTable.getAttribute('data-x'));
                    const y = parseFloat(selectedTable.getAttribute('data-y'));
                    
                    if (tableName) {
                        positions[tableName] = { x, y };
                    }
                    persistState();
                    scheduleLayoutSave();
                    
                    isDragging = false;
                    selectedTable = null;
                }
                
                if (isPanning) {
                    container.classList.remove('panning');
                    persistState();
                    scheduleLayoutSave();
                    isPanning = false;
                }
            });
            
            // Calculate the best connection sides based on table positions
            function calculateBestConnectionSides(fromX, fromY, fromWidth, toX, toY, toWidth) {
                // Calculate all 4 possible connection combinations
                const options = [
                    // Right to Left
                    { fromSide: 'right', toSide: 'left', fromPoint: fromX + fromWidth, toPoint: toX },
                    // Right to Right
                    { fromSide: 'right', toSide: 'right', fromPoint: fromX + fromWidth, toPoint: toX + toWidth },
                    // Left to Left
                    { fromSide: 'left', toSide: 'left', fromPoint: fromX, toPoint: toX },
                    // Left to Right
                    { fromSide: 'left', toSide: 'right', fromPoint: fromX, toPoint: toX + toWidth },
                ];
                
                // Calculate Manhattan distance for each option
                const optionsWithDistance = options.map(opt => {
                    const dx = Math.abs(opt.toPoint - opt.fromPoint);
                    const dy = Math.abs(toY - fromY);
                    const distance = dx + dy;
                    
                    // Penalize connections that go backwards (less intuitive)
                    let penalty = 0;
                    if (opt.fromSide === 'right' && opt.toPoint < opt.fromPoint) {
                        penalty = 200; // Going backwards to the left
                    } else if (opt.fromSide === 'left' && opt.toPoint > opt.fromPoint) {
                        penalty = 200; // Going backwards to the right
                    }
                    
                    return { ...opt, distance: distance + penalty };
                });
                
                // Choose the option with shortest distance
                const best = optionsWithDistance.reduce((best, current) => 
                    current.distance < best.distance ? current : best
                );
                
                return { fromSide: best.fromSide, toSide: best.toSide };
            }
            
            // Calculate orthogonal path with stub segments to prevent edge alignment
            function calculateOrthogonalPath(
                startX, startY, stubStartX, 
                endX, endY, stubEndX, radius,
                fromTableX, fromTableY, fromTableHeight,
                toTableX, toTableY, toTableHeight,
                tableWidth
            ) {
                let path = 'M ' + startX + ' ' + startY;
                
                // First horizontal stub from table edge
                path += ' L ' + stubStartX + ' ' + startY;
                
                // Check if the vertical line at stubStartX would pass through either table
                const fromTableRight = fromTableX + tableWidth;
                const fromTableBottom = fromTableY + fromTableHeight;
                const toTableRight = toTableX + tableWidth;
                const toTableBottom = toTableY + toTableHeight;
                
                // Check if stubStartX is within the horizontal range of either table
                const passesFromTable = stubStartX >= fromTableX && stubStartX <= fromTableRight;
                const passesToTable = stubStartX >= toTableX && stubStartX <= toTableRight;
                
                // Check if we need to route around tables
                let needsReroute = false;
                let intermediateY = 0;
                
                if (passesFromTable) {
                    // Check if line would pass through from table vertically
                    const minY = Math.min(startY, endY);
                    const maxY = Math.max(startY, endY);
                    if (!(maxY < fromTableY || minY > fromTableBottom)) {
                        needsReroute = true;
                        // Route above or below the from table
                        if (startY < fromTableY && endY > fromTableBottom) {
                            intermediateY = fromTableY - 30;
                        } else if (startY > fromTableBottom && endY < fromTableY) {
                            intermediateY = fromTableBottom + 30;
                        } else if (startY < endY) {
                            intermediateY = fromTableY - 30;
                        } else {
                            intermediateY = fromTableBottom + 30;
                        }
                    }
                }
                
                if (!needsReroute && passesToTable) {
                    // Check if line would pass through to table vertically
                    const minY = Math.min(startY, endY);
                    const maxY = Math.max(startY, endY);
                    if (!(maxY < toTableY || minY > toTableBottom)) {
                        needsReroute = true;
                        // Route above or below the to table
                        if (startY < toTableY && endY > toTableBottom) {
                            intermediateY = toTableY - 30;
                        } else if (startY > toTableBottom && endY < toTableY) {
                            intermediateY = toTableBottom + 30;
                        } else if (startY < endY) {
                            intermediateY = toTableY - 30;
                        } else {
                            intermediateY = toTableBottom + 30;
                        }
                    }
                }
                
                if (needsReroute) {
                    // Three-segment path: horizontal -> vertical -> horizontal -> vertical
                    path += ' L ' + stubStartX + ' ' + intermediateY;
                    path += ' L ' + stubEndX + ' ' + intermediateY;
                    path += ' L ' + stubEndX + ' ' + endY;
                } else {
                    // Simple two-segment path
                    path += ' L ' + stubStartX + ' ' + endY;
                    path += ' L ' + stubEndX + ' ' + endY;
                }
                
                // Final horizontal stub to table edge
                path += ' L ' + endX + ' ' + endY;
                
                return path;
            }
            
            // Update relationship lines
            function updateRelationships() {
                const tableWidth = 250;
                const fieldHeight = 30;
                const headerHeight = 40;
                
                document.querySelectorAll('.relationship-line').forEach(line => {
                    const fromTableName = line.getAttribute('data-from');
                    const toTableName = line.getAttribute('data-to');
                    
                    const fromTable = fromTableName ? tableLookup.get(fromTableName) : null;
                    const toTable = toTableName ? tableLookup.get(toTableName) : null;
                    
                    if (fromTable && toTable) {
                        const fromTableX = parseFloat(fromTable.getAttribute('data-x')) || 0;
                        const fromTableY = parseFloat(fromTable.getAttribute('data-y')) || 0;
                        const toTableX = parseFloat(toTable.getAttribute('data-x')) || 0;
                        const toTableY = parseFloat(toTable.getAttribute('data-y')) || 0;
                        
                        // Skip if any coordinate is invalid
                        if (isNaN(fromTableX) || isNaN(fromTableY) || isNaN(toTableX) || isNaN(toTableY)) {
                            return;
                        }
                        
                        // Get stored field offsets from data attributes
                        const fromFieldOffset = parseFloat(line.getAttribute('data-from-field-offset') || '0');
                        const toFieldOffset = parseFloat(line.getAttribute('data-to-field-offset') || '0');
                        
                        // Calculate precise Y positions for fields
                        const fromY = fromTableY + headerHeight + (fromFieldOffset * fieldHeight) + (fieldHeight / 2);
                        const toY = toTableY + headerHeight + (toFieldOffset * fieldHeight) + (fieldHeight / 2);
                        
                        // Connection stub length - distance from table edge before first turn
                        const stubLength = 40;
                        
                        // Use intelligent side selection
                        const sides = calculateBestConnectionSides(
                            fromTableX, fromY, tableWidth,
                            toTableX, toY, tableWidth
                        );
                        
                        let fromX, toX, fromStubX, toStubX;
                        
                        // Set connection points based on calculated best sides
                        if (sides.fromSide === 'right') {
                            fromX = fromTableX + tableWidth;
                            fromStubX = fromX + stubLength;
                        } else {
                            fromX = fromTableX;
                            fromStubX = fromX - stubLength;
                        }
                        
                        if (sides.toSide === 'right') {
                            toX = toTableX + tableWidth;
                            toStubX = toX + stubLength;
                        } else {
                            toX = toTableX;
                            toStubX = toX - stubLength;
                        }
                        
                        // Calculate table heights directly
                        const fromFieldCount = fromTable.querySelectorAll('.field-row').length;
                        const toFieldCount = toTable.querySelectorAll('.field-row').length;
                        const fromTableHeight = headerHeight + (fromFieldCount * fieldHeight);
                        const toTableHeight = headerHeight + (toFieldCount * fieldHeight);
                        
                        const pathData = calculateOrthogonalPath(
                            fromX, fromY, fromStubX, toX, toY, toStubX, 15,
                            fromTableX, fromTableY, fromTableHeight,
                            toTableX, toTableY, toTableHeight,
                            tableWidth
                        );
                        line.setAttribute('d', pathData);
                    }
                });
            }
            
            // Initialize table directory
            function initializeTableDirectory() {
                const tableDirectory = document.getElementById('tableDirectory');
                const tableDirectoryContent = document.getElementById('tableDirectoryContent');
                const tables = Array.from(tableLookup.values());
                
                if (!tableDirectoryContent) return;
                
                // Clear existing content
                tableDirectoryContent.innerHTML = '';
                directoryLookup.clear();
                
                // Create directory items
                tables.forEach(table => {
                    const tableName = table.getAttribute('data-table');
                    const item = document.createElement('div');
                    item.className = 'table-directory-item';
                    item.setAttribute('data-table', tableName);
                    item.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">' +
                        '<path d="M4 5h16v2H4V5zm0 4h16v10H4V9zm2 2v6h12v-6H6z"/>' +
                        '</svg>' +
                        '<span>' + tableName + '</span>';
                    if (tableName) {
                        directoryLookup.set(tableName, item);
                    }
                    
                    // Click handler for directory item
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        selectTable(tableName);
                    });
                    
                    tableDirectoryContent.appendChild(item);
                });
            }

            function renderDiagramViewsSelect(diagramViewsSelect) {
                if (!diagramViewsSelect) {
                    return;
                }

                diagramViewsSelect.innerHTML = '';

                const allOption = document.createElement('option');
                allOption.value = '__all__';
                allOption.textContent = 'All tables';
                diagramViewsSelect.appendChild(allOption);

                diagramViews.forEach(view => {
                    if (!view) {
                        return;
                    }
                    const option = document.createElement('option');
                    option.value = view.id;
                    option.textContent = view.name;
                    diagramViewsSelect.appendChild(option);
                });

                const hasActiveView = Boolean(activeViewId && diagramViews.some(view => view.id === activeViewId));
                diagramViewsSelect.value = hasActiveView ? activeViewId : '__all__';
            }

            function renderDiagramViewsTableList(container, onToggle) {
                if (!container) {
                    return;
                }

                container.innerHTML = '';

                if (tableLookup.size === 0) {
                    const empty = document.createElement('div');
                    empty.className = 'diagram-views-empty';
                    empty.textContent = 'No tables detected in this diagram.';
                    container.appendChild(empty);
                    return;
                }

                allTableNames.forEach(tableName => {
                    const item = document.createElement('label');
                    item.className = 'diagram-views-table-item';
                    item.setAttribute('data-table', tableName);

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = pendingViewTables.has(tableName);
                    checkbox.addEventListener('change', () => {
                        if (checkbox.checked) {
                            pendingViewTables.add(tableName);
                        } else {
                            pendingViewTables.delete(tableName);
                        }
                        if (typeof onToggle === 'function') {
                            onToggle();
                        }
                    });

                    const label = document.createElement('span');
                    label.textContent = tableName;

                    item.appendChild(checkbox);
                    item.appendChild(label);
                    container.appendChild(item);
                });
            }

            function updateDiagramViewsButtonState(buttons) {
                if (!buttons) {
                    return;
                }
                const activeView = getActiveView();
                const hasActive = Boolean(activeView);
                const { renameBtn, deleteBtn, saveBtn } = buttons;

                if (renameBtn) {
                    renameBtn.disabled = !hasActive;
                }
                if (deleteBtn) {
                    deleteBtn.disabled = !hasActive;
                }
                if (saveBtn) {
                    saveBtn.disabled = !hasActive;
                }
            }

            function persistViewsAndScheduleSave() {
                persistState();
                scheduleLayoutSave();
            }
            
            // Select table function
            function selectTable(tableName) {
                // Remove previous selection
                document.querySelectorAll('.draggable.selected').forEach(t => {
                    t.classList.remove('selected');
                });
                document.querySelectorAll('.table-directory-item.selected').forEach(item => {
                    item.classList.remove('selected');
                });
                
                // Add new selection
                const tableGroup = tableName ? tableLookup.get(tableName) : null;
                const directoryItem = tableName ? directoryLookup.get(tableName) : null;
                
                if (tableGroup) {
                    tableGroup.classList.add('selected');
                }
                if (directoryItem) {
                    directoryItem.classList.add('selected');
                }
            }
            
            // Side panel and toolbar functionality
            const autoArrangeBtn = document.getElementById('autoArrangeBtn');
            const sidePanel = document.getElementById('sidePanel');
            const closePanelBtn = document.getElementById('closePanelBtn');
            const resetZoomBtn = document.getElementById('resetZoomBtn');
            const directoryToggleBtn = document.getElementById('directoryToggleBtn');
            const tableDirectory = document.getElementById('tableDirectory');
            const closeDirectoryBtn = document.getElementById('closeDirectoryBtn');
            const diagramViewsToggleBtn = document.getElementById('diagramViewsToggleBtn');
            const diagramViewsPanel = document.getElementById('diagramViewsPanel');
            const closeDiagramViewsBtn = document.getElementById('closeDiagramViewsBtn');
            const diagramViewsSelect = document.getElementById('diagramViewsSelect');
            const diagramViewsNewBtn = document.getElementById('diagramViewsNewBtn');
            const diagramViewsRenameBtn = document.getElementById('diagramViewsRenameBtn');
            const diagramViewsDeleteBtn = document.getElementById('diagramViewsDeleteBtn');
            const diagramViewsTableList = document.getElementById('diagramViewsTableList');
            const diagramViewsShowAllBtn = document.getElementById('diagramViewsShowAllBtn');
            const diagramViewsSaveBtn = document.getElementById('diagramViewsSaveBtn');
            
            // Initialize table directory
            initializeTableDirectory();
            
            // Directory toggle button
            if (directoryToggleBtn && tableDirectory) {
                directoryToggleBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    tableDirectory.classList.toggle('open');
                });
            }
            
            // Close directory button
            if (closeDirectoryBtn && tableDirectory) {
                closeDirectoryBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    tableDirectory.classList.remove('open');
                });
            }
            
            if (autoArrangeBtn && sidePanel) {
                autoArrangeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    sidePanel.classList.toggle('open');
                    autoArrangeBtn.classList.toggle('active');
                });
                
                if (closePanelBtn) {
                    closePanelBtn.addEventListener('click', () => {
                        sidePanel.classList.remove('open');
                        autoArrangeBtn.classList.remove('active');
                    });
                }
                
                // Close panel when clicking outside
                document.addEventListener('click', (e) => {
                    if (!sidePanel.contains(e.target) && !autoArrangeBtn.contains(e.target)) {
                        sidePanel.classList.remove('open');
                        autoArrangeBtn.classList.remove('active');
                    }
                });
                
                document.querySelectorAll('.menu-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const algorithm = item.getAttribute('data-algorithm');
                        sidePanel.classList.remove('open');
                        autoArrangeBtn.classList.remove('active');
                        applyAutoArrange(algorithm);
                    });
                });
            }
            
            if (resetZoomBtn) {
                resetZoomBtn.addEventListener('click', () => {
                    viewBox = { x: 0, y: 0, width: 2000, height: 2000 };
                    svg.setAttribute('viewBox', '0 0 2000 2000');
                    persistViewsAndScheduleSave();
                });
            }

            if (diagramViewsPanel && diagramViewsToggleBtn) {
                const buttons = {
                    renameBtn: diagramViewsRenameBtn,
                    deleteBtn: diagramViewsDeleteBtn,
                    saveBtn: diagramViewsSaveBtn
                };

                const refreshUi = () => {
                    renderDiagramViewsSelect(diagramViewsSelect);
                    renderDiagramViewsTableList(diagramViewsTableList, () => {
                        applyViewTables(Array.from(pendingViewTables));
                    });
                    updateDiagramViewsButtonState(buttons);
                };

                const showPanel = () => {
                    ensurePendingViewTables();
                    refreshUi();
                    diagramViewsPanel.classList.add('open');
                    diagramViewsToggleBtn.classList.add('active');
                };

                const hidePanel = () => {
                    diagramViewsPanel.classList.remove('open');
                    diagramViewsToggleBtn.classList.remove('active');
                };

                diagramViewsToggleBtn.addEventListener('click', (event) => {
                    event.stopPropagation();
                    if (diagramViewsPanel.classList.contains('open')) {
                        hidePanel();
                    } else {
                        showPanel();
                    }
                });

                if (closeDiagramViewsBtn) {
                    closeDiagramViewsBtn.addEventListener('click', (event) => {
                        event.stopPropagation();
                        hidePanel();
                    });
                }

                document.addEventListener('click', (event) => {
                    if (!diagramViewsPanel.contains(event.target) && !diagramViewsToggleBtn.contains(event.target)) {
                        hidePanel();
                    }
                });

                if (diagramViewsSelect) {
                    diagramViewsSelect.addEventListener('change', () => {
                        const newValue = diagramViewsSelect.value;
                        if (newValue === '__all__') {
                            activeViewId = '';
                            pendingViewTables = new Set(allTableNames);
                            applyViewTables(allTableNames);
                        } else {
                            activeViewId = newValue;
                            const activeView = getActiveView();
                            ensurePendingViewTables();
                            const tablesToShow = activeView && Array.isArray(activeView.tables) && activeView.tables.length > 0
                                ? activeView.tables
                                : allTableNames;
                            applyViewTables(tablesToShow);
                        }
                        persistViewsAndScheduleSave();
                        renderDiagramViewsTableList(diagramViewsTableList, () => {
                            applyViewTables(Array.from(pendingViewTables));
                        });
                        updateDiagramViewsButtonState(buttons);
                    });
                }

                if (diagramViewsNewBtn) {
                    diagramViewsNewBtn.addEventListener('click', () => {
                        const name = prompt('Name for the new view', 'New View');
                        if (!name || !name.trim()) {
                            return;
                        }

                        const id = 'view_' + Date.now().toString(36);
                        const tables = Array.from(pendingViewTables.size > 0 ? pendingViewTables : new Set(allTableNames));

                        diagramViews.push({
                            id,
                            name: name.trim(),
                            tables
                        });
                        activeViewId = id;
                        pendingViewTables = new Set(tables);
                        applyViewTables(tables);
                        persistViewsAndScheduleSave();
                        refreshUi();
                    });
                }

                if (diagramViewsRenameBtn) {
                    diagramViewsRenameBtn.addEventListener('click', () => {
                        const activeView = getActiveView();
                        if (!activeView) {
                            return;
                        }

                        const newName = prompt('Rename view', activeView.name);
                        if (!newName || !newName.trim()) {
                            return;
                        }

                        activeView.name = newName.trim();
                        persistViewsAndScheduleSave();
                        renderDiagramViewsSelect(diagramViewsSelect);
                    });
                }

                if (diagramViewsDeleteBtn) {
                    diagramViewsDeleteBtn.addEventListener('click', () => {
                        const activeView = getActiveView();
                        if (!activeView) {
                            return;
                        }

                        const confirmed = confirm('Delete view "' + activeView.name + '"?');
                        if (!confirmed) {
                            return;
                        }

                        diagramViews = diagramViews.filter(view => view.id !== activeView.id);
                        activeViewId = '';
                        pendingViewTables = new Set(allTableNames);
                        applyViewTables(allTableNames);
                        persistViewsAndScheduleSave();
                        refreshUi();
                    });
                }

                if (diagramViewsShowAllBtn) {
                    diagramViewsShowAllBtn.addEventListener('click', () => {
                        activeViewId = '';
                        pendingViewTables = new Set(allTableNames);
                        applyViewTables(allTableNames);
                        persistViewsAndScheduleSave();
                        refreshUi();
                    });
                }

                if (diagramViewsSaveBtn) {
                    diagramViewsSaveBtn.addEventListener('click', () => {
                        const activeView = getActiveView();
                        if (!activeView) {
                            return;
                        }

                        activeView.tables = Array.from(pendingViewTables);
                        applyViewTables(activeView.tables);
                        persistViewsAndScheduleSave();
                        refreshUi();
                    });
                }

                ensurePendingViewTables();
                applyViewTables(activeViewId ? Array.from(pendingViewTables) : allTableNames);
                updateDiagramViewsButtonState(buttons);
            }
            
            // Note tooltip functionality
            let noteTooltip = document.createElement('div');
            noteTooltip.className = 'note-tooltip';
            document.body.appendChild(noteTooltip);
            
            let showTooltipTimeout;
            let hideTooltipTimeout;
            
            document.querySelectorAll('.field-row.has-note').forEach(fieldRow => {
                fieldRow.addEventListener('mouseenter', function() {
                    clearTimeout(hideTooltipTimeout);
                    clearTimeout(showTooltipTimeout);
                    const note = this.getAttribute('data-note');
                    if (note) {
                        noteTooltip.textContent = note;
                        
                        // Get the position of the field row in screen coordinates
                        const rowRect = this.getBoundingClientRect();
                        
                        // Position tooltip to the right of the row
                        const tooltipX = rowRect.right + 12;
                        const tooltipY = rowRect.top + (rowRect.height / 2);
                        
                        noteTooltip.style.left = tooltipX + 'px';
                        noteTooltip.style.top = tooltipY + 'px';
                        noteTooltip.style.transform = 'translateY(-50%)';
                        
                        // Show tooltip after a short delay
                        showTooltipTimeout = setTimeout(() => {
                            noteTooltip.classList.add('visible');
                        }, 200);
                    }
                });
                
                fieldRow.addEventListener('mouseleave', function() {
                    clearTimeout(showTooltipTimeout);
                    hideTooltipTimeout = setTimeout(() => {
                        noteTooltip.classList.remove('visible');
                    }, 100);
                });
            });
        })();
    </script>
</body>
</html>`;
	}
}
