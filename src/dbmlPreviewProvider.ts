import * as vscode from 'vscode';
import { Parser } from '@dbml/core';
import * as path from 'path';
import { promises as fs } from 'fs';
import { generateSvgFromSchema, ParsedSchema, ParsedTable, ParsedField, ParsedRef, ParsedGroup } from './svgGenerator';

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

interface TableGroupMetadata {
    name: string;
    tables: string[];
    color?: string;
    note?: string;
}

const DEFAULT_GROUP_COLOR = 'var(--vscode-button-background)';
const GROUP_COLOR_MAP: Record<string, string> = {
    red: 'var(--vscode-charts-red, #F14C4C)',
    blue: 'var(--vscode-charts-blue, #3794FF)',
    green: 'var(--vscode-charts-green, #89D185)',
    yellow: 'var(--vscode-charts-yellow, #F9DC5C)',
    orange: 'var(--vscode-charts-orange, #E78C45)',
    purple: 'var(--vscode-charts-purple, #B180D7)'
};

export class DbmlPreviewProvider {
	private panel: vscode.WebviewPanel | undefined;
	private currentDocument: vscode.TextDocument | undefined;

	constructor(private readonly extensionUri: vscode.Uri) {}

    public async showPreview(document: vscode.TextDocument): Promise<void> {
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
                } else if (message.type === 'generateDocs') {
                    await this.generateDocumentation();
                } else if (message.type === 'exportImage') {
                    const dataUrl = message.data;
                    if (dataUrl) {
                        const matches = dataUrl.match(/^data:image\/([a-z]+);base64,(.+)$/);
                        if (matches && matches.length === 3) {
                            const buffer = Buffer.from(matches[2], 'base64');
                            const uri = await vscode.window.showSaveDialog({
                                filters: {
                                    'Images': ['png']
                                },
                                defaultUri: vscode.Uri.file('diagram.png')
                            });
                            
                            if (uri) {
                                await vscode.workspace.fs.writeFile(uri, buffer);
                                vscode.window.showInformationMessage('Diagram exported successfully!');
                            }
                        }
                    }
                }
            });

			// Handle when the panel is closed
			this.panel.onDidDispose(() => {
				this.panel = undefined;
			});
		}

        await this.renderDocument(document);
        if (!this.panel) {
            return;
        }

        await this.renderDocument(document);
    }

    private async renderDocument(document: vscode.TextDocument): Promise<void> {
        if (!this.panel) {
            return;
        }

        const documentPath = document.uri.fsPath;
        const dbmlContent = document.getText();
        let layoutData: LayoutData = {};
        try {
            layoutData = await this.loadLayout(documentPath);
        } catch (error) {
            console.error('Failed to load DBML layout data:', error);
            layoutData = {};
        }

        const { sanitized, groups } = this.preprocessDbmlContent(dbmlContent);
        this.panel.webview.html = this.getWebviewContent(sanitized, layoutData, documentPath, groups);
    }

    public async updatePreview(document: vscode.TextDocument): Promise<void> {
        if (!this.panel) {
            return;
        }

        if (!this.currentDocument || this.currentDocument.uri.fsPath !== document.uri.fsPath) {
            return;
        }

        this.currentDocument = document;
        await this.renderDocument(document);
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

    private preprocessDbmlContent(dbmlContent: string): { sanitized: string; groups: TableGroupMetadata[] } {
        const groupPattern = /TableGroup\s+("[^"]+"|'[^']+'|`[^`]+`|[^\s\[{]+)\s*(\[[^\]]*\])?\s*\{([\s\S]*?)\}/gi;
        const groups: TableGroupMetadata[] = [];
        let result = '';
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = groupPattern.exec(dbmlContent)) !== null) {
            const [fullMatch, rawName, rawSettings, rawBody] = match;
            const matchStart = match.index;
            const matchEnd = groupPattern.lastIndex;

            result += dbmlContent.slice(lastIndex, matchStart);

            const groupName = this.stripIdentifier(rawName);
            const { color, note: noteFromSettings } = this.parseGroupSettings(rawSettings ?? '');

            const bodyProcessing = this.processGroupBody(rawBody);
            const note = noteFromSettings ?? bodyProcessing.note;
            const tables = bodyProcessing.tableNames;

            groups.push({
                name: groupName,
                tables,
                color,
                note
            });

            const sanitizedBody = bodyProcessing.sanitizedBody;
            const trimmedBody = sanitizedBody.replace(/\s+$/, '');
            const formattedBody = trimmedBody.length > 0 ? `\n${trimmedBody}\n` : '\n';
            result += `TableGroup ${rawName} {${formattedBody}}`;

            lastIndex = matchEnd;
        }

        result += dbmlContent.slice(lastIndex);
        return { sanitized: result, groups };
    }

    private stripIdentifier(value: string): string {
        const trimmed = value.trim();
        if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('`') && trimmed.endsWith('`'))) {
            return trimmed.slice(1, -1);
        }
        return trimmed;
    }

    private parseGroupSettings(settings: string): { color?: string; note?: string } {
        if (!settings || settings.length < 2) {
            return {};
        }
        const inner = settings.slice(1, -1);
        const result: { color?: string; note?: string } = {};
        const settingPattern = /(\w+)\s*:\s*([^,\]]+)/g;
        let match: RegExpExecArray | null;
        while ((match = settingPattern.exec(inner)) !== null) {
            const key = match[1].toLowerCase();
            let value = match[2].trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")) || (value.startsWith('`') && value.endsWith('`'))) {
                value = value.slice(1, -1);
            }
            if (key === 'color') {
                    const normalized = value.trim().toLowerCase();
                    if (/^[a-z]+$/.test(normalized) && Object.prototype.hasOwnProperty.call(GROUP_COLOR_MAP, normalized)) {
                        result.color = normalized;
                    }
            } else if (key === 'note') {
                result.note = value;
            }
        }
        return result;
    }

    private processGroupBody(body: string): { sanitizedBody: string; tableNames: string[]; note?: string } {
        let workingBody = body;
        let noteValue: string | undefined;

        const tripleNotePattern = /Note\s*:\s*'''([\s\S]*?)'''/i;
        const singleNotePattern = /Note\s*:\s*(["'])([\s\S]*?)\1/i;

        let noteMatch = tripleNotePattern.exec(workingBody);
        if (noteMatch) {
            noteValue = noteMatch[1].trim();
            workingBody = workingBody.replace(noteMatch[0], '');
        } else {
            noteMatch = singleNotePattern.exec(workingBody);
            if (noteMatch) {
                noteValue = noteMatch[2].trim();
                workingBody = workingBody.replace(noteMatch[0], '');
            }
        }

        const lines = workingBody.split(/\r?\n/);
        const tableNames: string[] = [];
        const sanitizedLines: string[] = [];
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
                sanitizedLines.push(line);
                continue;
            }
            if (/^(--|\/\/|\#)/.test(trimmed)) {
                sanitizedLines.push(line);
                continue;
            }
            if (/^Note\b/i.test(trimmed)) {
                continue;
            }
            const identifierMatch = trimmed.match(/^([A-Za-z0-9_\.\"`]+)$/);
            if (identifierMatch) {
                tableNames.push(this.stripIdentifier(identifierMatch[1]));
                const indent = line.match(/^\s*/)?.[0] ?? '  ';
                sanitizedLines.push(`${indent}${identifierMatch[1]}`);
                continue;
            }
            // Preserve any other content to avoid breaking formatting
            sanitizedLines.push(line);
        }

        const sanitizedBody = sanitizedLines.join('\n');
        return { sanitizedBody, tableNames, note: noteValue };
    }

    private convertToSchema(database: any, metadataGroups: TableGroupMetadata[]): ParsedSchema {
		const tables: ParsedTable[] = [];
		const refs: ParsedRef[] = [];
        const groups: ParsedGroup[] = [];
        const metadataLookup = new Map<string, TableGroupMetadata>();
        metadataGroups.forEach(group => {
            metadataLookup.set(group.name, group);
        });

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
				
				// Only add references with at least 2 valid endpoints
				if (endpoints.length >= 2 && endpoints[0].tableName && endpoints[1].tableName) {
					const parsedRef: ParsedRef = {
						name: ref.name || undefined,
						endpoints: endpoints,
						onDelete: ref.onDelete || undefined,
						onUpdate: ref.onUpdate || undefined
					};
					refs.push(parsedRef);
				}
			});
		}

		if (schema.tableGroups) {
			schema.tableGroups.forEach((group: any) => {
				const groupName = group.name || '';
				const tablesInGroup = (group.tables || []).map((table: any) => table?.name || table?.tableName || '').filter((name: string) => name.length > 0);
				const metadata = metadataLookup.get(groupName);
				groups.push({
					name: groupName,
					tables: tablesInGroup,
					color: metadata?.color,
					note: metadata?.note
				});
			});
		}
	}

	// Include metadata-defined groups that parser did not return (e.g., empty groups)
	metadataGroups.forEach(group => {
		if (!groups.some(existing => existing.name === group.name)) {
			groups.push({
				name: group.name,
				tables: group.tables,
				color: group.color,
				note: group.note
			});
		}
	});

	return { tables, refs, groups };
}

    private async generateDocumentation(): Promise<void> {
        if (!this.currentDocument) {
            vscode.window.showErrorMessage('No active DBML document found.');
            return;
        }

        const dbmlContent = this.currentDocument.getText();
        let database;
        try {
             // @ts-ignore
             database = Parser.parse(dbmlContent, 'dbml');
        } catch (e) {
            vscode.window.showErrorMessage('Failed to parse DBML: ' + e);
            return;
        }

        const docPath = path.join(path.dirname(this.currentDocument.uri.fsPath), 'docs');
        
        try {
            await fs.mkdir(docPath, { recursive: true });
        } catch (e) {
            vscode.window.showErrorMessage('Failed to create docs folder: ' + e);
            return;
        }

        // Generate HTML content
        const htmlContent = this.generateDocsHtml(database);
        
        try {
            await fs.writeFile(path.join(docPath, 'index.html'), htmlContent);
            vscode.window.showInformationMessage('Documentation generated successfully in ' + docPath);
        } catch (e) {
            vscode.window.showErrorMessage('Failed to write documentation file: ' + e);
        }
    }

    private generateDocsHtml(database: any): string {
        const schema = this.convertToSchema(database, []);
        const tables = schema.tables;
        
        // Project Info
        const projectName = database.name || 'Database Documentation';
        const projectType = database.databaseType || '';
        const projectNote = database.note ? this.parseMarkdown(database.note) : '';

        let projectHtml = `
            <div class="project-section">
                <h1>${projectName}</h1>
                ${projectType ? `<div class="badge">${projectType}</div>` : ''}
                <div class="project-note">${projectNote}</div>
            </div>
        `;

        let tablesHtml = '';
        tables.forEach(table => {
            let fieldsHtml = '';
            table.fields.forEach(field => {
                fieldsHtml += `
                    <tr>
                        <td>${field.name}</td>
                        <td>${field.type}</td>
                        <td>${field.pk ? 'PK' : ''}</td>
                        <td>${field.note || ''}</td>
                    </tr>
                `;
            });

            const tableNote = table.note ? this.parseMarkdown(table.note) : '';

            tablesHtml += `
                <div class="table-section">
                    <h2>${table.name}</h2>
                    <div class="table-note">${tableNote}</div>
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Type</th>
                                <th>Attributes</th>
                                <th>Note</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${fieldsHtml}
                        </tbody>
                    </table>
                </div>
            `;
        });

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${projectName} - Documentation</title>
    <style>
        :root {
            --bg-color: #ffffff;
            --text-color: #333333;
            --table-border: #e0e0e0;
            --table-header-bg: #f5f5f5;
            --code-bg: #f8f8f8;
            --link-color: #007acc;
        }

        @media (prefers-color-scheme: dark) {
            :root {
                --bg-color: #1e1e1e;
                --text-color: #d4d4d4;
                --table-border: #333333;
                --table-header-bg: #2d2d2d;
                --code-bg: #2d2d2d;
                --link-color: #3794ff;
            }
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            line-height: 1.6;
            color: var(--text-color);
            background-color: var(--bg-color);
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
        }

        h1, h2, h3 {
            color: var(--text-color);
            margin-top: 0;
        }

        a {
            color: var(--link-color);
            text-decoration: none;
        }

        a:hover {
            text-decoration: underline;
        }

        .project-section {
            margin-bottom: 4rem;
            border-bottom: 2px solid var(--table-border);
            padding-bottom: 2rem;
        }
        
        .badge {
            display: inline-block;
            padding: 0.25rem 0.75rem;
            background-color: var(--table-header-bg);
            border-radius: 1rem;
            font-size: 0.85rem;
            font-weight: 600;
            margin-bottom: 1rem;
            border: 1px solid var(--table-border);
        }

        .project-note, .table-note {
            margin-top: 1rem;
            margin-bottom: 1rem;
        }
        
        .project-note h1, .project-note h2, .project-note h3 {
            margin-top: 1.5rem;
            margin-bottom: 0.75rem;
        }
        
        .project-note ul, .table-note ul {
            padding-left: 1.5rem;
        }

        .table-section {
            margin-bottom: 3rem;
            border: 1px solid var(--table-border);
            border-radius: 8px;
            padding: 1.5rem;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 1rem;
        }

        th, td {
            text-align: left;
            padding: 0.75rem;
            border-bottom: 1px solid var(--table-border);
        }

        th {
            background-color: var(--table-header-bg);
            font-weight: 600;
        }

        code {
            background-color: var(--code-bg);
            padding: 0.2rem 0.4rem;
            border-radius: 4px;
            font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    ${projectHtml}
    ${tablesHtml}
</body>
</html>`;
    }

    private parseMarkdown(text: string): string {
        if (!text) {
            return '';
        }

        const lines = text.split('\n');
        let html = '';
        let inList = false;

        for (let line of lines) {
            // Escape HTML
            line = line
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');

            // Headers
            if (line.trim().startsWith('# ')) {
                if (inList) { html += '</ul>\n'; inList = false; }
                html += `<h1>${line.trim().substring(2)}</h1>\n`;
                continue;
            }
            if (line.trim().startsWith('## ')) {
                if (inList) { html += '</ul>\n'; inList = false; }
                html += `<h2>${line.trim().substring(3)}</h2>\n`;
                continue;
            }
            if (line.trim().startsWith('### ')) {
                if (inList) { html += '</ul>\n'; inList = false; }
                html += `<h3>${line.trim().substring(4)}</h3>\n`;
                continue;
            }

            // List items
            if (line.trim().startsWith('- ')) {
                if (!inList) {
                    html += '<ul>\n';
                    inList = true;
                }
                let content = line.trim().substring(2);
                // Inline formatting
                content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                content = content.replace(/\*(.*?)\*/g, '<em>$1</em>');
                html += `<li>${content}</li>\n`;
                continue;
            }

            // End list if not a list item
            if (inList) {
                html += '</ul>\n';
                inList = false;
            }

            // Paragraphs / Text
            if (line.trim() === '') {
                // html += '<br>\n'; 
                // Don't add excessive brs, maybe just ignore empty lines or treat as paragraph separators?
                // For simplicity, let's treat non-empty lines as paragraphs if they aren't headers/lists
            } else {
                // Inline formatting
                line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                line = line.replace(/\*(.*?)\*/g, '<em>$1</em>');
                html += `<p>${line}</p>\n`;
            }
        }

        if (inList) {
            html += '</ul>\n';
        }

        return html;
    }

private getWebviewContent(sanitizedDbml: string, layoutData: LayoutData, documentPath: string, groupMetadata: TableGroupMetadata[]): string {
	let svgContent = '';
	let errorMessage = '';

	try {
		// Parse DBML
		// @ts-ignore - @dbml/core types are incomplete
		const database = Parser.parse(sanitizedDbml, 'dbml');
		
		// Convert parsed database to our schema format
		const schema = this.convertToSchema(database, groupMetadata);
		
		// Generate SVG from schema
		svgContent = generateSvgFromSchema(schema);
	} catch (error) {
		errorMessage = error instanceof Error ? error.message : 'Unknown error parsing DBML';
		console.error('DBML Parse Error:', error);
	}

        const webview = this.panel?.webview;
        if (!webview) {
            return '';
        }

        const tableDirectoryIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'src', 'resources', 'menu-svgrepo-com.svg')).toString();
        const viewsIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'src', 'resources', 'cube-svgrepo-com.svg')).toString();
        const gridIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'src', 'resources', 'frame-svgrepo-com.svg')).toString();
        const magnetIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'src', 'resources', 'switch-svgrepo-com.svg')).toString();
        const resetIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'src', 'resources', 'drag-svgrepo-com.svg')).toString();
        const docsIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'src', 'resources', 'book.svg')).toString();
        const exportIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'src', 'resources', 'download.svg')).toString();

        const layoutJson = JSON.stringify(layoutData ?? {}).replace(/</g, '\u003c');
        const groupsJson = JSON.stringify(groupMetadata ?? []).replace(/</g, '\u003c');
        const documentPathJson = JSON.stringify(documentPath ?? '').replace(/</g, '\u003c');

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
            position: relative;
            background: var(--vscode-editor-background);
            --grid-line-color-thin: color-mix(in srgb, var(--vscode-editor-foreground) 16%, transparent);
            --grid-line-color-bold: color-mix(in srgb, var(--vscode-editor-foreground) 28%, transparent);
            --grid-cell-width: 20px;
            --grid-cell-height: 20px;
            --grid-major-width: 100px;
            --grid-major-height: 100px;
            --grid-offset-x: 0px;
            --grid-offset-y: 0px;
        }

        @supports not (color-mix(in srgb, #000 50%, transparent)) {
            .diagram-container {
                --grid-line-color-thin: rgba(120, 120, 120, 0.22);
                --grid-line-color-bold: rgba(120, 120, 120, 0.38);
            }
        }

        .diagram-container > svg {
            position: relative;
            z-index: 1;
        }

        .canvas-grid {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            pointer-events: none;
            opacity: 0;
            background-image:
                linear-gradient(to right, var(--grid-line-color-thin) 1px, transparent 1px),
                linear-gradient(to bottom, var(--grid-line-color-thin) 1px, transparent 1px),
                linear-gradient(to right, var(--grid-line-color-bold) 1px, transparent 1px),
                linear-gradient(to bottom, var(--grid-line-color-bold) 1px, transparent 1px);
            background-size:
                var(--grid-cell-width) var(--grid-cell-height),
                var(--grid-cell-width) var(--grid-cell-height),
                var(--grid-major-width) var(--grid-major-height),
                var(--grid-major-width) var(--grid-major-height);
            background-position:
                var(--grid-offset-x) var(--grid-offset-y),
                var(--grid-offset-x) var(--grid-offset-y),
                var(--grid-offset-x) var(--grid-offset-y),
                var(--grid-offset-x) var(--grid-offset-y);
            transition: opacity 0.2s ease;
            z-index: 0;
        }

        .diagram-container.grid-visible .canvas-grid {
            opacity: 0.75;
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

        svg .table-group-title {
            fill: var(--vscode-button-foreground);
            font-weight: bold;
            font-size: 16px;
        }

        svg g.table.group-collapsed {
            display: none;
        }

        svg .table-group-toggle {
            cursor: pointer;
            color: var(--vscode-button-foreground);
        }

        svg .table-group-header {
            cursor: move;
        }

        svg .table-group.dragging {
            opacity: 0.85;
        }

        svg .table-group-toggle-icon {
            width: 26px;
            height: 26px;
            display: block;
        }

        svg .table-group-toggle-icon use {
            fill: currentColor;
        }

        svg .table-group[data-collapsed="true"] .table-group-toggle-icon {
            opacity: 0.6;
        }
        
        svg .field-row:hover {
            fill: var(--vscode-list-hoverBackground);
            opacity: 0.5;
        }
        
        svg .table:hover {
            filter: brightness(1.1);
        }
        
        svg .draggable.selected .table {
            filter: brightness(1.08) drop-shadow(0 0 6px rgba(0, 0, 0, 0.35));
        }
        
        svg .draggable.selected .table-border {
            stroke: none;
            stroke-width: 0;
            filter: none;
            animation: none;
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

        .toolbar-icon {
            display: block;
            width: 22px;
            height: 22px;
            pointer-events: none;
            background-color: color-mix(in srgb, var(--vscode-button-background) 82%, white 18%);
            mask-image: var(--toolbar-icon-image);
            mask-repeat: no-repeat;
            mask-position: center;
            mask-size: contain;
            -webkit-mask-image: var(--toolbar-icon-image);
            -webkit-mask-repeat: no-repeat;
            -webkit-mask-position: center;
            -webkit-mask-size: contain;
            transition: background-color 0.2s ease;
        }

        .toolbar-button.active .toolbar-icon,
        .toolbar-button.directory-toggle.active .toolbar-icon {
            background-color: color-mix(in srgb, var(--vscode-button-background) 55%, black 45%);
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
            position: fixed;
            top: 0;
            right: -320px;
            width: 320px;
            height: 100%;
            display: flex;
            flex-direction: column;
            background: var(--vscode-sideBar-background);
            border-left: 1px solid var(--vscode-panel-border);
            box-shadow: -2px 0 12px rgba(0, 0, 0, 0.35);
            overflow: hidden;
            z-index: 950;
            transition: right 0.3s ease;
            pointer-events: none;
        }

        .diagram-views-panel.open {
            right: 0;
            pointer-events: auto;
        }

        .diagram-views-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 18px;
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
            padding: 16px 18px;
            gap: 12px;
            overflow-y: auto;
            flex: 1;
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

        .diagram-views-button:hover:not(:disabled) {
            background: var(--vscode-button-hoverBackground, var(--vscode-button-background));
            border-color: var(--vscode-button-hoverBorder, var(--vscode-button-border, transparent));
        }

        .diagram-views-button.danger {
            background: rgba(241, 76, 76, 0.18);
            color: var(--vscode-errorForeground, #f14c4c);
            border-color: rgba(241, 76, 76, 0.32);
        }

        .diagram-views-button.danger:hover:not(:disabled) {
            background: rgba(241, 76, 76, 0.28);
            color: var(--vscode-errorForeground, #f14c4c);
            border-color: rgba(241, 76, 76, 0.45);
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
            transition: background 0.2s ease, color 0.2s ease;
        }

        .diagram-views-table-item:hover {
            background: var(--vscode-toolbar-hoverBackground);
        }

        .diagram-views-table-item.selected {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }

        .diagram-views-table-item.selected:hover {
            background: var(--vscode-list-activeSelectionBackground);
        }

        .diagram-views-table-item input[type="checkbox"] {
            width: 14px;
            height: 14px;
            accent-color: var(--vscode-checkbox-foreground, var(--vscode-list-activeSelectionBackground));
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

        .diagram-views-modal-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.45);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 2000;
            backdrop-filter: blur(1px);
        }

        .diagram-views-modal-backdrop.open {
            display: flex;
        }

        .diagram-views-modal {
            background: var(--vscode-editorWidget-background);
            color: var(--vscode-foreground);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 8px;
            padding: 16px;
            width: min(320px, 90vw);
            box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .diagram-views-modal-title {
            font-size: 14px;
            font-weight: 600;
        }

        .diagram-views-modal-description {
            font-size: 12px;
            opacity: 0.8;
            line-height: 1.4;
        }

        .diagram-views-modal-input {
            height: 28px;
            border-radius: 4px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            padding: 4px 8px;
            font-size: 12px;
        }

        .diagram-views-modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
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
                <div class="canvas-grid" id="canvasGrid"></div>
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
                    </div>
                    <div class="diagram-views-table-list" id="diagramViewsTableList"></div>
                    <div class="diagram-views-footer">
                        <button class="diagram-views-button" id="diagramViewsShowAllBtn" title="Show all tables">Show all</button>
                        <button class="diagram-views-button danger" id="diagramViewsDeleteBtn" title="Delete view">Delete</button>
                    </div>
                    <div class="diagram-views-hint">Select which tables belong to the active view. Use Show all to reset the diagram.</div>
                </div>
            </div>
            <div class="diagram-views-modal-backdrop" id="diagramViewsModal" aria-hidden="true">
                <div class="diagram-views-modal" role="dialog" aria-modal="true" aria-labelledby="diagramViewsModalTitle">
                    <div class="diagram-views-modal-title" id="diagramViewsModalTitle">Nueva vista</div>
                    <div class="diagram-views-modal-description">&#191;C&#243;mo quieres llamar la nueva vista?</div>
                    <input class="diagram-views-modal-input" id="diagramViewsModalInput" type="text" autocomplete="off" spellcheck="false" />
                    <div class="diagram-views-modal-actions">
                        <button class="diagram-views-button" id="diagramViewsModalCancel">Cancelar</button>
                        <button class="diagram-views-button" id="diagramViewsModalConfirm">Guardar</button>
                    </div>
                </div>
            </div>
            <div class="diagram-views-modal-backdrop" id="diagramViewsDeleteModal" aria-hidden="true">
                <div class="diagram-views-modal" role="dialog" aria-modal="true" aria-labelledby="diagramViewsDeleteTitle">
                    <div class="diagram-views-modal-title" id="diagramViewsDeleteTitle">Eliminar vista</div>
                    <div class="diagram-views-modal-description" id="diagramViewsDeleteDescription"></div>
                    <div class="diagram-views-modal-actions">
                        <button class="diagram-views-button" id="diagramViewsDeleteCancel">Cancelar</button>
                        <button class="diagram-views-button danger" id="diagramViewsDeleteConfirm">Eliminar</button>
                    </div>
                </div>
            </div>
            <div class="toolbar">
                <button class="toolbar-button directory-toggle" id="directoryToggleBtn" title="Toggle table directory">
                    <span class="toolbar-icon" style="--toolbar-icon-image: url('${tableDirectoryIconUri}');"></span>
                </button>
                <button class="toolbar-button" id="diagramViewsToggleBtn" title="Toggle diagram views panel">
                    <span class="toolbar-icon" style="--toolbar-icon-image: url('${viewsIconUri}');"></span>
                </button>
                <button class="toolbar-button" id="autoArrangeBtn" title="Auto arrange diagram">
                    <span class="toolbar-icon" style="--toolbar-icon-image: url('${magnetIconUri}');"></span>
                </button>
                <button class="toolbar-button" id="gridToggleBtn" title="Toggle canvas grid">
                    <span class="toolbar-icon" style="--toolbar-icon-image: url('${gridIconUri}');"></span>
                </button>
                <button class="toolbar-button" id="resetZoomBtn" title="Reset zoom and pan">
                    <span class="toolbar-icon" style="--toolbar-icon-image: url('${resetIconUri}');"></span>
                </button>
                <button class="toolbar-button" id="generateDocsBtn" title="Generate Documentation">
                    <span class="toolbar-icon" style="--toolbar-icon-image: url('${docsIconUri}');"></span>
                </button>
                <button class="toolbar-button" id="exportImageBtn" title="Export diagram as image">
                    <span class="toolbar-icon" style="--toolbar-icon-image: url('${exportIconUri}');"></span>
                </button>
            </div>
        `}
    </div>
    
    <script>
        (function() {
            const vscode = acquireVsCodeApi();
            const svg = document.getElementById('diagram-svg');
            const container = document.querySelector('.diagram-container');
            const gridOverlay = document.getElementById('canvasGrid');
            const gridToggleBtn = document.getElementById('gridToggleBtn');
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
            const tableGroups = new Map();
            const defaultGroupColor = ${JSON.stringify(DEFAULT_GROUP_COLOR)};
            const groupColorMap = ${JSON.stringify(GROUP_COLOR_MAP)};
            function normalizeGroupColorToken(raw) {
                if (typeof raw !== 'string') {
                    return '';
                }
                const normalized = raw.trim().toLowerCase();
                if (!/^[a-z]+$/.test(normalized)) {
                    return '';
                }
                return Object.prototype.hasOwnProperty.call(groupColorMap, normalized) ? normalized : '';
            }
            function resolveGroupColor(token) {
                if (!token) {
                    return defaultGroupColor;
                }
                return groupColorMap[token] || defaultGroupColor;
            }
            document.querySelectorAll('.table-group').forEach(groupElement => {
                const groupName = groupElement.getAttribute('data-group');
                if (!groupName) {
                    return;
                }
                let tableNames = [];
                const tablesPayload = groupElement.getAttribute('data-tables');
                if (tablesPayload) {
                    try {
                        const parsed = JSON.parse(tablesPayload);
                        if (Array.isArray(parsed)) {
                            tableNames = parsed.filter(item => typeof item === 'string');
                        }
                    } catch (error) {
                        console.warn('Failed to parse table group membership for', groupName, error);
                    }
                }
                const colorToken = normalizeGroupColorToken(groupElement.getAttribute('data-color') || '');
                const resolvedColor = resolveGroupColor(colorToken);
                const note = groupElement.getAttribute('data-note') || '';
                tableGroups.set(groupName, {
                    name: groupName,
                    element: groupElement,
                    tables: tableNames,
                    colorToken,
                    color: resolvedColor,
                    note,
                    collapsed: false
                });
                groupElement.setAttribute('data-resolved-color', resolvedColor);
            });
            
            let selectedTable = null;
            let offset = { x: 0, y: 0 };
            let isDragging = false;
            let isPanning = false;
            let panStart = { x: 0, y: 0 };
            let isGroupDragging = false;
            let draggedGroup = null;
            let groupDragStart = { x: 0, y: 0 };
            let groupInitialPositions = new Map();
            
            let viewBox = { x: 0, y: 0, width: 2000, height: 2000 };
            const gridSize = 20;
            const majorGridMultiple = 5;
            const minGridPixelSize = 0.5;
            const layoutCanPersist = typeof documentPath === 'string' && documentPath.length > 0;
			
            const state = vscode.getState() || {};
            let positions = {};
            let gridVisible = typeof state.gridVisible === 'boolean' ? state.gridVisible : false;
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
            let dismissNewViewModal = null;
            let dismissDeleteViewModal = null;
            if (state.positions && typeof state.positions === 'object') {
                positions = JSON.parse(JSON.stringify(state.positions));
            } else if (initialLayoutData.positions && typeof initialLayoutData.positions === 'object') {
                positions = JSON.parse(JSON.stringify(initialLayoutData.positions));
            }
            const savedViewBox = state.viewBox || initialLayoutData.viewBox;
            let layoutSaveTimeout = null;

            updateGridVisibility();
            updateGridAppearance();
            window.addEventListener('resize', updateGridAppearance);
            requestAnimationFrame(updateGridAppearance);

            function cloneViews() {
                return diagramViews.map(view => ({
                    id: view.id,
                    name: view.name,
                    tables: Array.isArray(view.tables) ? [...view.tables] : []
                }));
            }

            function generateUniqueViewName(baseName) {
                const sanitized = typeof baseName === 'string' && baseName.trim().length > 0
                    ? baseName.trim()
                    : 'Nueva vista';
                const existingNames = new Set(
                    diagramViews
                        .filter(view => view && typeof view.name === 'string')
                        .map(view => view.name.trim().toLowerCase())
                );
                if (!existingNames.has(sanitized.toLowerCase())) {
                    return sanitized;
                }
                let index = 2;
                let candidate = sanitized + ' ' + index;
                while (existingNames.has(candidate.toLowerCase())) {
                    index += 1;
                    candidate = sanitized + ' ' + index;
                }
                return candidate;
            }

            function isDefaultView(view) {
                if (!view || typeof view !== 'object') {
                    return false;
                }
                if (typeof view.isDefault === 'boolean') {
                    return view.isDefault;
                }
                if (typeof view.id === 'string') {
                    const normalized = view.id.trim().toLowerCase();
                    if (normalized === 'default' || normalized === '__default__' || normalized === '__all__') {
                        return true;
                    }
                }
                return false;
            }

            function requestNewViewName(defaultName, onConfirm) {
                if (typeof onConfirm !== 'function') {
                    return;
                }
                const fallbackDefault = typeof defaultName === 'string' && defaultName.trim().length > 0
                    ? defaultName.trim()
                    : 'Nueva vista';

                if (!diagramViewsModal || !diagramViewsModalInput || !diagramViewsModalConfirm || !diagramViewsModalCancel) {
                    const fallbackResponse = prompt('\u00bfC\u00f3mo quieres llamar la nueva vista?', fallbackDefault);
                    if (fallbackResponse && fallbackResponse.trim()) {
                        onConfirm(fallbackResponse.trim());
                    }
                    return;
                }

                if (typeof dismissNewViewModal === 'function') {
                    dismissNewViewModal();
                }

                diagramViewsModal.classList.add('open');
                diagramViewsModal.setAttribute('aria-hidden', 'false');
                diagramViewsModalInput.value = fallbackDefault;
                diagramViewsModalInput.focus();
                diagramViewsModalInput.select();

                const cleanup = () => {
                    diagramViewsModal.classList.remove('open');
                    diagramViewsModal.setAttribute('aria-hidden', 'true');
                    diagramViewsModalConfirm.removeEventListener('click', confirmHandler);
                    diagramViewsModalCancel.removeEventListener('click', cancelHandler);
                    diagramViewsModal.removeEventListener('pointerdown', backdropHandler);
                    diagramViewsModalInput.removeEventListener('keydown', keyHandler);
                    dismissNewViewModal = null;
                };

                const confirmHandler = (event) => {
                    event.preventDefault();
                    const value = diagramViewsModalInput.value.trim();
                    if (!value) {
                        diagramViewsModalInput.focus();
                        return;
                    }
                    cleanup();
                    onConfirm(value);
                };

                const cancelHandler = (event) => {
                    event.preventDefault();
                    cleanup();
                };

                const backdropHandler = (event) => {
                    if (event.target === diagramViewsModal) {
                        cleanup();
                    }
                };

                const keyHandler = (event) => {
                    if (event.key === 'Enter') {
                        confirmHandler(event);
                    } else if (event.key === 'Escape') {
                        event.preventDefault();
                        cancelHandler(event);
                    }
                };

                diagramViewsModalConfirm.addEventListener('click', confirmHandler);
                diagramViewsModalCancel.addEventListener('click', cancelHandler);
                diagramViewsModal.addEventListener('pointerdown', backdropHandler);
                diagramViewsModalInput.addEventListener('keydown', keyHandler);

                dismissNewViewModal = cleanup;
            }

            function requestDeleteConfirmation(view, onConfirm) {
                if (!view || typeof onConfirm !== 'function') {
                    return;
                }

                const description = 'Se eliminara la vista "' + view.name + '". Esta accion no se puede deshacer.';

                if (!diagramViewsDeleteModal || !diagramViewsDeleteDescription || !diagramViewsDeleteConfirm || !diagramViewsDeleteCancel) {
                    if (confirm('Eliminar la vista "' + view.name + '"?')) {
                        onConfirm();
                    }
                    return;
                }

                if (typeof dismissDeleteViewModal === 'function') {
                    dismissDeleteViewModal();
                }

                diagramViewsDeleteDescription.textContent = description;
                diagramViewsDeleteModal.classList.add('open');
                diagramViewsDeleteModal.setAttribute('aria-hidden', 'false');

                const cleanup = () => {
                    diagramViewsDeleteModal.classList.remove('open');
                    diagramViewsDeleteModal.setAttribute('aria-hidden', 'true');
                    diagramViewsDeleteConfirm.removeEventListener('click', confirmHandler);
                    diagramViewsDeleteCancel.removeEventListener('click', cancelHandler);
                    diagramViewsDeleteModal.removeEventListener('pointerdown', backdropHandler);
                    document.removeEventListener('keydown', keyHandler);
                    dismissDeleteViewModal = null;
                };

                const confirmHandler = (event) => {
                    event.preventDefault();
                    cleanup();
                    onConfirm();
                };

                const cancelHandler = (event) => {
                    event.preventDefault();
                    cleanup();
                };

                const backdropHandler = (event) => {
                    if (event.target === diagramViewsDeleteModal) {
                        cleanup();
                    }
                };

                const keyHandler = (event) => {
                    if (event.key === 'Enter') {
                        confirmHandler(event);
                    } else if (event.key === 'Escape') {
                        cancelHandler(event);
                    }
                };

                diagramViewsDeleteConfirm.addEventListener('click', confirmHandler);
                diagramViewsDeleteCancel.addEventListener('click', cancelHandler);
                diagramViewsDeleteModal.addEventListener('pointerdown', backdropHandler);
                document.addEventListener('keydown', keyHandler);

                dismissDeleteViewModal = cleanup;
            }

            function updateGridVisibility() {
                if (container) {
                    container.classList.toggle('grid-visible', Boolean(gridVisible));
                }
                if (gridOverlay) {
                    gridOverlay.setAttribute('aria-hidden', gridVisible ? 'false' : 'true');
                }
                if (gridToggleBtn) {
                    gridToggleBtn.classList.toggle('active', Boolean(gridVisible));
                }
            }

            function updateGridAppearance() {
                if (!gridOverlay || !svg || !container) {
                    return;
                }
                const width = svg.clientWidth;
                const height = svg.clientHeight;
                if (!width || !height || !viewBox.width || !viewBox.height) {
                    return;
                }
                const scaleX = width / viewBox.width;
                const scaleY = height / viewBox.height;
                const cellWidth = Math.max(gridSize * scaleX, minGridPixelSize);
                const cellHeight = Math.max(gridSize * scaleY, minGridPixelSize);
                const majorWidth = cellWidth * majorGridMultiple;
                const majorHeight = cellHeight * majorGridMultiple;
                const offsetX = ((-viewBox.x * scaleX) % cellWidth + cellWidth) % cellWidth;
                const offsetY = ((-viewBox.y * scaleY) % cellHeight + cellHeight) % cellHeight;

                gridOverlay.style.setProperty('--grid-cell-width', cellWidth.toFixed(2) + 'px');
                gridOverlay.style.setProperty('--grid-cell-height', cellHeight.toFixed(2) + 'px');
                gridOverlay.style.setProperty('--grid-major-width', majorWidth.toFixed(2) + 'px');
                gridOverlay.style.setProperty('--grid-major-height', majorHeight.toFixed(2) + 'px');
                gridOverlay.style.setProperty('--grid-offset-x', offsetX.toFixed(2) + 'px');
                gridOverlay.style.setProperty('--grid-offset-y', offsetY.toFixed(2) + 'px');
            }

            function refreshRelationshipVisibility() {
                document.querySelectorAll('.relationship-line').forEach(line => {
                    const fromTable = line.getAttribute('data-from');
                    const toTable = line.getAttribute('data-to');
                    const fromElement = fromTable ? tableLookup.get(fromTable) : null;
                    const toElement = toTable ? tableLookup.get(toTable) : null;
                    const shouldHide = !fromElement || !toElement ||
                        fromElement.classList.contains('hidden') ||
                        toElement.classList.contains('hidden');
                    line.classList.toggle('hidden', shouldHide);
                });
            }

            function updateGroupLayouts() {
                if (tableGroups.size === 0) {
                    return;
                }
                const padding = 24;
                const headerHeight = 46;
                const headerGap = 12;
                tableGroups.forEach(group => {
                    const element = group.element;
                    const headerRect = element.querySelector('.table-group-header-bg');
                    const bodyRect = element.querySelector('.table-group-body');
                    const shadowRect = element.querySelector('.table-group-shadow');
                    const title = element.querySelector('.table-group-title');
                    const toggle = element.querySelector('.table-group-toggle');
                    if (!headerRect || !bodyRect || !shadowRect || !title || !toggle) {
                        return;
                    }

                    let minX = Number.POSITIVE_INFINITY;
                    let minY = Number.POSITIVE_INFINITY;
                    let maxX = Number.NEGATIVE_INFINITY;
                    let maxY = Number.NEGATIVE_INFINITY;

                    group.tables.forEach(tableName => {
                        const table = tableLookup.get(tableName);
                        if (!table) {
                            return;
                        }
                        const tableX = parseFloat(table.getAttribute('data-x') || '0');
                        const tableY = parseFloat(table.getAttribute('data-y') || '0');
                        const tableWidth = parseFloat(table.getAttribute('data-width') || '250');
                        const tableHeight = parseFloat(table.getAttribute('data-height') || '0');
                        if (!Number.isFinite(tableX) || !Number.isFinite(tableY)) {
                            return;
                        }
                        minX = Math.min(minX, tableX);
                        minY = Math.min(minY, tableY);
                        maxX = Math.max(maxX, tableX + tableWidth);
                        maxY = Math.max(maxY, tableY + tableHeight);
                    });

                    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
                        element.setAttribute('display', 'none');
                        return;
                    }

                    element.removeAttribute('display');

                    const headerColor = group.color && group.color.trim().length > 0 ? group.color : defaultGroupColor;
                    headerRect.setAttribute('fill', headerColor);
                    bodyRect.setAttribute('fill', headerColor);
                    bodyRect.setAttribute('fill-opacity', group.collapsed ? '0' : '0.12');
                    shadowRect.setAttribute('fill', headerColor);
                    shadowRect.setAttribute('fill-opacity', '0.08');

                    const width = Math.max(240, maxX - minX + padding * 2);
                    const bodyHeight = group.collapsed ? 0 : Math.max(0, maxY - minY + padding * 2);
                    const totalHeight = headerHeight + (group.collapsed ? headerGap : headerGap + bodyHeight);
                    const offsetX = minX - padding;
                    const offsetY = minY - headerHeight - headerGap;

                    element.setAttribute('transform', 'translate(' + offsetX + ', ' + offsetY + ')');
                    element.setAttribute('data-collapsed', group.collapsed ? 'true' : 'false');
                    element.setAttribute('data-offset-x', String(offsetX));
                    element.setAttribute('data-offset-y', String(offsetY));
                    element.setAttribute('data-header-width', String(width));
                    element.setAttribute('data-header-height', String(headerHeight));
                    element.classList.toggle('collapsed', group.collapsed);
                    group.offsetX = offsetX;
                    group.offsetY = offsetY;
                    group.headerWidth = width;
                    group.headerHeight = headerHeight;

                    headerRect.setAttribute('x', '0');
                    headerRect.setAttribute('y', '0');
                    headerRect.setAttribute('width', String(width));
                    headerRect.setAttribute('height', String(headerHeight));

                    const titleX = 20;
                    const titleY = headerHeight / 2 + 5;
                    title.setAttribute('x', String(titleX));
                    title.setAttribute('y', String(titleY));

                    const toggleSize = 26;
                    const toggleX = width - toggleSize - 16;
                    const toggleY = (headerHeight - toggleSize) / 2;
                    toggle.setAttribute('transform', 'translate(' + toggleX + ', ' + toggleY + ')');
                    const toggleIcon = toggle.querySelector('.table-group-toggle-icon');
                    if (toggleIcon) {
                        toggleIcon.classList.toggle('is-collapsed', group.collapsed);
                        toggleIcon.setAttribute('width', String(toggleSize));
                        toggleIcon.setAttribute('height', String(toggleSize));
                    }
                    toggle.classList.toggle('collapsed', group.collapsed);
                    toggle.setAttribute('aria-pressed', group.collapsed ? 'true' : 'false');

                    bodyRect.setAttribute('x', '0');
                    bodyRect.setAttribute('y', String(headerHeight));
                    bodyRect.setAttribute('width', String(width));
                    bodyRect.setAttribute('height', String(Math.max(0, bodyHeight)));
                    bodyRect.setAttribute('visibility', group.collapsed ? 'hidden' : 'visible');

                    shadowRect.setAttribute('x', '-4');
                    shadowRect.setAttribute('y', '-4');
                    shadowRect.setAttribute('width', String(width + 8));
                    shadowRect.setAttribute('height', String(totalHeight + 8));
                });
            }

            function setGroupCollapsed(groupName, nextState) {
                const group = tableGroups.get(groupName);
                if (!group) {
                    return;
                }
                const collapsed = typeof nextState === 'boolean' ? nextState : !group.collapsed;
                group.collapsed = collapsed;
                group.tables.forEach(tableName => {
                    const table = tableLookup.get(tableName);
                    const directoryItem = directoryLookup.get(tableName);
                    if (table) {
                        table.classList.toggle('group-collapsed', collapsed);
                        table.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
                    }
                    if (directoryItem) {
                        directoryItem.classList.toggle('group-collapsed', collapsed);
                    }
                });
                updateGroupLayouts();
                refreshRelationshipVisibility();
                updateRelationships();
            }

            function arrangeTablesWithinGroups() {
                const tableWidth = 250;
                const horizontalSpacing = 120;
                const verticalSpacing = 80;
                let changed = false;

                tableGroups.forEach(group => {
                    const memberTables = group.tables
                        .map(name => tableLookup.get(name))
                        .filter(table => Boolean(table));

                    if (memberTables.length === 0) {
                        return;
                    }

                    const hasStoredPositions = memberTables.every(table => {
                        const tableName = table.getAttribute('data-table');
                        return Boolean(tableName && Object.prototype.hasOwnProperty.call(positions, tableName));
                    });

                    if (hasStoredPositions) {
                        return;
                    }

                    const sortedTables = memberTables.slice().sort((a, b) => {
                        const ay = Number.parseFloat(a.getAttribute('data-y') || '0');
                        const by = Number.parseFloat(b.getAttribute('data-y') || '0');
                        if (Number.isFinite(ay) && Number.isFinite(by) && ay !== by) {
                            return ay - by;
                        }
                        const ax = Number.parseFloat(a.getAttribute('data-x') || '0');
                        const bx = Number.parseFloat(b.getAttribute('data-x') || '0');
                        if (Number.isFinite(ax) && Number.isFinite(bx)) {
                            return ax - bx;
                        }
                        return 0;
                    });

                    let anchorX = Number.POSITIVE_INFINITY;
                    let anchorY = Number.POSITIVE_INFINITY;

                    sortedTables.forEach(table => {
                        const currentX = Number.parseFloat(table.getAttribute('data-x') || '0');
                        const currentY = Number.parseFloat(table.getAttribute('data-y') || '0');
                        if (Number.isFinite(currentX)) {
                            anchorX = Math.min(anchorX, currentX);
                        }
                        if (Number.isFinite(currentY)) {
                            anchorY = Math.min(anchorY, currentY);
                        }
                    });

                    if (!Number.isFinite(anchorX)) {
                        anchorX = 100;
                    }
                    if (!Number.isFinite(anchorY)) {
                        anchorY = 100;
                    }

                    const columns = Math.max(1, Math.ceil(Math.sqrt(sortedTables.length)));
                    let columnIndex = 0;
                    let currentX = anchorX;
                    let currentY = anchorY;
                    let maxHeightInRow = 0;

                    sortedTables.forEach(table => {
                        const heightAttr = table.getAttribute('data-height');
                        let tableHeight = Number.parseFloat(heightAttr || '0');
                        if (!Number.isFinite(tableHeight) || tableHeight <= 0) {
                            tableHeight = getTableHeight(table);
                        }

                        setTablePosition(table, currentX, currentY);
                        changed = true;

                        maxHeightInRow = Math.max(maxHeightInRow, tableHeight);
                        columnIndex++;
                        if (columnIndex >= columns) {
                            columnIndex = 0;
                            currentX = anchorX;
                            currentY += maxHeightInRow + verticalSpacing;
                            maxHeightInRow = 0;
                        } else {
                            currentX += tableWidth + horizontalSpacing;
                        }
                    });
                });

                return changed;
            }

            function initializeGroups() {
                if (tableGroups.size === 0) {
                    return;
                }
                tableGroups.forEach(group => {
                    const resolvedColor = group.color && group.color.trim().length > 0 ? group.color : defaultGroupColor;
                    group.tables.forEach(tableName => {
                        const table = tableLookup.get(tableName);
                        if (!table) {
                            return;
                        }
                        table.setAttribute('data-group-color', resolvedColor);
                        const headerRect = table.querySelector('.table-header');
                        if (headerRect) {
                            headerRect.setAttribute('fill', resolvedColor);
                        }
                    });

                    const toggle = group.element.querySelector('.table-group-toggle');
                    if (toggle) {
                        const handleToggle = (event) => {
                            event.stopPropagation();
                            setGroupCollapsed(group.name, !group.collapsed);
                        };
                        toggle.addEventListener('click', handleToggle);
                        toggle.addEventListener('keydown', event => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                handleToggle(event);
                            }
                        });
                    }

                    const headerRect = group.element.querySelector('.table-group-header-bg');
                    const bodyRect = group.element.querySelector('.table-group-body');
                    const shadowRect = group.element.querySelector('.table-group-shadow');
                    if (headerRect) {
                        headerRect.setAttribute('fill', resolvedColor);
                    }
                    if (bodyRect) {
                        bodyRect.setAttribute('fill', resolvedColor);
                        bodyRect.setAttribute('fill-opacity', '0.12');
                    }
                    if (shadowRect) {
                        shadowRect.setAttribute('fill', resolvedColor);
                        shadowRect.setAttribute('fill-opacity', '0.08');
                    }
                });

                const rearranged = arrangeTablesWithinGroups();
                updateGroupLayouts();
                updateRelationships();
                refreshRelationshipVisibility();
                if (rearranged) {
                    persistState();
                    scheduleLayoutSave();
                }
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
                state.gridVisible = gridVisible;
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

                updateRelationships();
                refreshRelationshipVisibility();
                updateGroupLayouts();
            }
            
            // Collision detection helper
            function getTableHeight(table) {
                const fieldCount = table.querySelectorAll('.field-row').length;
                const fieldHeight = 30;
                const headerHeight = 40;
                return headerHeight + (fieldCount * fieldHeight);
            }

            function setTablePosition(table, x, y, updateState = true) {
                const snappedX = Math.round(x / gridSize) * gridSize;
                const snappedY = Math.round(y / gridSize) * gridSize;
                table.setAttribute('transform', 'translate(' + snappedX + ', ' + snappedY + ')');
                table.setAttribute('data-x', String(snappedX));
                table.setAttribute('data-y', String(snappedY));
                if (updateState) {
                    const tableName = table.getAttribute('data-table');
                    if (tableName) {
                        positions[tableName] = { x: snappedX, y: snappedY };
                    }
                }
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
                updateGroupLayouts();
                refreshRelationshipVisibility();
                
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
                updateGridAppearance();
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
                    }
                });
                updateRelationships();
            }
            updateGroupLayouts();
            refreshRelationshipVisibility();
            
            // Hover effect for tables and relationships
            document.querySelectorAll('.draggable').forEach(table => {
                table.addEventListener('mouseenter', function() {
                    if (!isDragging && !isGroupDragging) {
                        const tableName = this.getAttribute('data-table');
                        highlightRelationships(tableName, true);
                    }
                });
                
                table.addEventListener('mouseleave', function() {
                    if (!isDragging && !isGroupDragging) {
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
                updateGridAppearance();
                
                // Save viewBox state
                persistState();
                scheduleLayoutSave();
            });
            
            // Mouse down - start dragging or panning
            document.addEventListener('mousedown', (e) => {
                const target = e.target;
                const groupHeader = target.closest('.table-group-header');
                if (groupHeader && !target.closest('.table-group-toggle')) {
                    const groupElement = groupHeader.closest('.table-group');
                    const groupName = groupElement ? groupElement.getAttribute('data-group') : null;
                    const groupData = groupName ? tableGroups.get(groupName) : null;
                    if (groupData && Array.isArray(groupData.tables) && groupData.tables.length > 0) {
                        isGroupDragging = true;
                        draggedGroup = groupData;
                        selectedTable = null;
                        groupInitialPositions = new Map();
                        groupData.tables.forEach(tableName => {
                            const table = tableLookup.get(tableName);
                            if (!table) {
                                return;
                            }
                            const tableX = Number.parseFloat(table.getAttribute('data-x') || '0');
                            const tableY = Number.parseFloat(table.getAttribute('data-y') || '0');
                            groupInitialPositions.set(table, { x: tableX, y: tableY });
                        });
                        const pt = svg.createSVGPoint();
                        pt.x = e.clientX;
                        pt.y = e.clientY;
                        const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
                        groupDragStart.x = svgP.x;
                        groupDragStart.y = svgP.y;
                        if (groupData.element) {
                            groupData.element.classList.add('dragging');
                        }
                        e.preventDefault();
                        return;
                    }
                }
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
                if (isGroupDragging && draggedGroup) {
                    const pt = svg.createSVGPoint();
                    pt.x = e.clientX;
                    pt.y = e.clientY;
                    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());

                    const deltaX = svgP.x - groupDragStart.x;
                    const deltaY = svgP.y - groupDragStart.y;

                    groupInitialPositions.forEach((pos, table) => {
                        const nextX = pos.x + deltaX;
                        const nextY = pos.y + deltaY;
                        setTablePosition(table, nextX, nextY, false);
                    });

                    updateGroupLayouts();
                    updateRelationships();
                    e.preventDefault();
                } else if (isDragging && selectedTable) {
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
                    updateGridAppearance();
                    
                    panStart.x = e.clientX;
                    panStart.y = e.clientY;
                    e.preventDefault();
                }
            });
            
            // Mouse up - stop dragging or panning
            document.addEventListener('mouseup', (e) => {
                if (isGroupDragging && draggedGroup) {
                    if (draggedGroup.element) {
                        draggedGroup.element.classList.remove('dragging');
                    }
                    groupInitialPositions.forEach((_, table) => {
                        const tableName = table.getAttribute('data-table');
                        if (!tableName) {
                            return;
                        }
                        const x = Number.parseFloat(table.getAttribute('data-x') || '0');
                        const y = Number.parseFloat(table.getAttribute('data-y') || '0');
                        positions[tableName] = { x, y };
                    });
                    updateGroupLayouts();
                    updateRelationships();
                    persistState();
                    scheduleLayoutSave();
                    isGroupDragging = false;
                    draggedGroup = null;
                    groupInitialPositions = new Map();
                } else if (isDragging && selectedTable) {
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
                fromTableX, fromTableY, fromTableWidth, fromTableHeight,
                toTableX, toTableY, toTableWidth, toTableHeight
            ) {
                let path = 'M ' + startX + ' ' + startY;
                
                // First horizontal stub from table edge
                path += ' L ' + stubStartX + ' ' + startY;
                
                // Check if the vertical line at stubStartX would pass through either table
                const fromTableRight = fromTableX + fromTableWidth;
                const fromTableBottom = fromTableY + fromTableHeight;
                const toTableRight = toTableX + toTableWidth;
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
                const defaultTableWidth = 250;
                const fieldHeight = 30;
                const headerHeight = 40;
                const groupHeaderHeight = 46;
                const stubLength = 40;

                function getGroupForTable(table) {
                    const groupName = table.getAttribute('data-group');
                    if (!groupName) {
                        return null;
                    }
                    return tableGroups.get(groupName) || null;
                }

                function getGroupBounds(group) {
                    const element = group.element;
                    const offsetXAttr = element.getAttribute('data-offset-x');
                    const offsetYAttr = element.getAttribute('data-offset-y');
                    const widthAttr = element.getAttribute('data-header-width');
                    const heightAttr = element.getAttribute('data-header-height');
                    const offsetX = Number.parseFloat(offsetXAttr ?? String(group.offsetX ?? 0));
                    const offsetY = Number.parseFloat(offsetYAttr ?? String(group.offsetY ?? 0));
                    const width = Number.parseFloat(widthAttr ?? String(group.headerWidth ?? 0));
                    const height = Number.parseFloat(heightAttr ?? String(group.headerHeight ?? 0));
                    return {
                        x: Number.isFinite(offsetX) ? offsetX : 0,
                        y: Number.isFinite(offsetY) ? offsetY : 0,
                        width: Number.isFinite(width) && width > 0 ? width : defaultTableWidth,
                        height: Number.isFinite(height) && height > 0 ? height : groupHeaderHeight
                    };
                }

                function buildEndpointInfo(table, fieldOffset) {
                    const tableX = Number.parseFloat(table.getAttribute('data-x') || '0');
                    const tableY = Number.parseFloat(table.getAttribute('data-y') || '0');

                    if (!Number.isFinite(tableX) || !Number.isFinite(tableY)) {
                        return null;
                    }

                    if (!table.classList.contains('group-collapsed')) {
                        const fieldCount = table.querySelectorAll('.field-row').length;
                        const tableHeight = headerHeight + (fieldCount * fieldHeight);
                        const anchorY = tableY + headerHeight + (fieldOffset * fieldHeight) + (fieldHeight / 2);
                        return {
                            x: tableX,
                            y: tableY,
                            width: defaultTableWidth,
                            height: tableHeight,
                            anchorY
                        };
                    }

                    const group = getGroupForTable(table);
                    if (group) {
                        const bounds = getGroupBounds(group);
                        return {
                            x: bounds.x,
                            y: bounds.y,
                            width: bounds.width,
                            height: bounds.height,
                            anchorY: bounds.y + bounds.height / 2,
                            collapsedToGroup: true
                        };
                    }

                    const fallbackFieldCount = table.querySelectorAll('.field-row').length;
                    const fallbackHeight = headerHeight + (fallbackFieldCount * fieldHeight);
                    return {
                        x: tableX,
                        y: tableY,
                        width: defaultTableWidth,
                        height: fallbackHeight,
                        anchorY: tableY + fallbackHeight / 2
                    };
                }

                document.querySelectorAll('.relationship-line').forEach(line => {
                    const fromTableName = line.getAttribute('data-from');
                    const toTableName = line.getAttribute('data-to');

                    const fromTable = fromTableName ? tableLookup.get(fromTableName) : null;
                    const toTable = toTableName ? tableLookup.get(toTableName) : null;

                    if (!fromTable || !toTable) {
                        return;
                    }

                    const fromFieldOffset = Number.parseFloat(line.getAttribute('data-from-field-offset') || '0');
                    const toFieldOffset = Number.parseFloat(line.getAttribute('data-to-field-offset') || '0');

                    const fromInfo = buildEndpointInfo(fromTable, fromFieldOffset);
                    const toInfo = buildEndpointInfo(toTable, toFieldOffset);

                    if (!fromInfo || !toInfo) {
                        return;
                    }

                    const sides = calculateBestConnectionSides(
                        fromInfo.x, fromInfo.anchorY, fromInfo.width,
                        toInfo.x, toInfo.anchorY, toInfo.width
                    );

                    let fromX = fromInfo.x;
                    let fromStubX = fromX - stubLength;
                    if (sides.fromSide === 'right') {
                        fromX = fromInfo.x + fromInfo.width;
                        fromStubX = fromX + stubLength;
                    }

                    let toX = toInfo.x;
                    let toStubX = toX - stubLength;
                    if (sides.toSide === 'right') {
                        toX = toInfo.x + toInfo.width;
                        toStubX = toX + stubLength;
                    }

                    const pathData = calculateOrthogonalPath(
                        fromX, fromInfo.anchorY, fromStubX,
                        toX, toInfo.anchorY, toStubX,
                        15,
                        fromInfo.x, fromInfo.y, fromInfo.width, fromInfo.height,
                        toInfo.x, toInfo.y, toInfo.width, toInfo.height
                    );
                    line.setAttribute('d', pathData);
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
                        item.classList.toggle('selected', checkbox.checked);
                        persistActiveViewTablesSnapshot();
                        if (typeof onToggle === 'function') {
                            onToggle();
                        }
                    });

                    const label = document.createElement('span');
                    label.textContent = tableName;

                    item.classList.toggle('selected', checkbox.checked);
                    item.appendChild(checkbox);
                    item.appendChild(label);
                    container.appendChild(item);
                });
            }

            function persistActiveViewTablesSnapshot() {
                const activeView = getActiveView();
                if (activeView) {
                    activeView.tables = Array.from(pendingViewTables);
                }
                persistViewsAndScheduleSave();
            }

            function updateDiagramViewsButtonState(buttons) {
                if (!buttons) {
                    return;
                }
                const activeView = getActiveView();
                const hasActive = Boolean(activeView);
                const canRenameOrDelete = hasActive && !isDefaultView(activeView);
                const { renameBtn, deleteBtn } = buttons;

                if (renameBtn) {
                    renameBtn.disabled = !canRenameOrDelete;
                }
                if (deleteBtn) {
                    deleteBtn.disabled = !canRenameOrDelete;
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
            const diagramViewsModal = document.getElementById('diagramViewsModal');
            const diagramViewsModalInput = document.getElementById('diagramViewsModalInput');
            const diagramViewsModalConfirm = document.getElementById('diagramViewsModalConfirm');
            const diagramViewsModalCancel = document.getElementById('diagramViewsModalCancel');
            const diagramViewsDeleteModal = document.getElementById('diagramViewsDeleteModal');
            const diagramViewsDeleteDescription = document.getElementById('diagramViewsDeleteDescription');
            const diagramViewsDeleteConfirm = document.getElementById('diagramViewsDeleteConfirm');
            const diagramViewsDeleteCancel = document.getElementById('diagramViewsDeleteCancel');
            
            // Initialize table directory
            initializeTableDirectory();
            initializeGroups();
            
            // Directory toggle button
            if (directoryToggleBtn && tableDirectory) {
                directoryToggleBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    tableDirectory.classList.toggle('open');
                    const isOpen = tableDirectory.classList.contains('open');
                    directoryToggleBtn.classList.toggle('active', isOpen);
                });
            }

            if (gridToggleBtn) {
                gridToggleBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    gridVisible = !gridVisible;
                    updateGridVisibility();
                    persistState();
                });
            }
            
            // Close directory button
            if (closeDirectoryBtn && tableDirectory) {
                closeDirectoryBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    tableDirectory.classList.remove('open');
                    directoryToggleBtn?.classList.remove('active');
                });
            }

            // Close directory when clicking outside
            if (tableDirectory && directoryToggleBtn) {
                document.addEventListener('click', (event) => {
                    if (!tableDirectory.contains(event.target) && !directoryToggleBtn.contains(event.target)) {
                        if (tableDirectory.classList.contains('open')) {
                            tableDirectory.classList.remove('open');
                            directoryToggleBtn.classList.remove('active');
                        }
                    }
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
                    updateGridAppearance();
                    persistViewsAndScheduleSave();
                });
            }

            const generateDocsBtn = document.getElementById('generateDocsBtn');
            if (generateDocsBtn) {
                generateDocsBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    vscode.postMessage({
                        type: 'generateDocs'
                    });
                });
            }

            const exportImageBtn = document.getElementById('exportImageBtn');
            if (exportImageBtn) {
                exportImageBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    
                    const svgClone = svg.cloneNode(true);
                    
                    // Collect styles
                    const computedStyle = getComputedStyle(document.body);
                    const rootStyle = getComputedStyle(document.documentElement);
                    
                    const getVar = (name, fallback) => {
                        let val = computedStyle.getPropertyValue(name);
                        if (!val || val.trim() === '') {
                             val = rootStyle.getPropertyValue(name);
                        }
                        return (val && val.trim() !== '') ? val : fallback;
                    };

                    let cssVariables = '';
                    // Iterate over all properties to find CSS variables
                    for (let i = 0; i < computedStyle.length; i++) {
                        const key = computedStyle[i];
                        if (key.startsWith('--')) {
                            cssVariables += \`\${key}: \${computedStyle.getPropertyValue(key)};\\n\`;
                        }
                    }
                    
                    let cssRules = '';
                    for (let i = 0; i < document.styleSheets.length; i++) {
                        const sheet = document.styleSheets[i];
                        try {
                            for (let j = 0; j < sheet.cssRules.length; j++) {
                                cssRules += sheet.cssRules[j].cssText + '\\n';
                            }
                        } catch (e) {
                            console.warn('Access to stylesheet denied', e);
                        }
                    }
                    
                    const bgColor = getVar('--vscode-editor-background', '#1e1e1e');
                    const fgColor = getVar('--vscode-editor-foreground', '#cccccc');
                    const btnBg = getVar('--vscode-button-background', '#0e639c');
                    const btnFg = getVar('--vscode-button-foreground', '#ffffff');

                    const style = document.createElement('style');
                    style.textContent = \`
                        :root, body, svg {
                            \${cssVariables}
                            background-color: \${bgColor};
                            color: \${fgColor};
                        }
                        \${cssRules}
                        /* Ensure critical colors are set */
                        text { fill: \${fgColor} !important; }
                        .field-name { fill: \${fgColor} !important; }
                        .field-type { fill: \${fgColor} !important; }
                        .table-body { fill: \${bgColor} !important; stroke: \${fgColor}; stroke-width: 1px; }
                        .table-header { fill: \${btnBg} !important; }
                        .table-name { fill: \${btnFg} !important; }
                        .relationship-line { stroke: \${fgColor} !important; }
                        .cardinality-marker { stroke: \${fgColor} !important; fill: \${fgColor} !important; }
                    \`;
                    svgClone.insertBefore(style, svgClone.firstChild);

                    // Get the actual bounding box of the content
                    const bbox = svg.getBBox();
                    const padding = 50;
                    const viewBoxX = bbox.x - padding;
                    const viewBoxY = bbox.y - padding;
                    const viewBoxWidth = bbox.width + (padding * 2);
                    const viewBoxHeight = bbox.height + (padding * 2);
                    
                    // Set viewBox to match content
                    svgClone.setAttribute('viewBox', \`\${viewBoxX} \${viewBoxY} \${viewBoxWidth} \${viewBoxHeight}\`);
                    
                    // Set dimensions for high resolution export
                    const scale = 2; // 2x resolution
                    const width = viewBoxWidth * scale;
                    const height = viewBoxHeight * scale;
                    
                    svgClone.setAttribute('width', width);
                    svgClone.setAttribute('height', height);
                    
                    const serializer = new XMLSerializer();
                    let svgString = serializer.serializeToString(svgClone);
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    
                    const img = new Image();
                    const svgBlob = new Blob([svgString], {type: 'image/svg+xml;charset=utf-8'});
                    const url = URL.createObjectURL(svgBlob);
                    
                    img.onload = function() {
                        ctx.fillStyle = bgColor;
                        ctx.fillRect(0, 0, width, height);
                        
                        ctx.drawImage(img, 0, 0, width, height);
                        URL.revokeObjectURL(url);
                        
                        const dataUrl = canvas.toDataURL('image/png');
                        vscode.postMessage({
                            type: 'exportImage',
                            data: dataUrl
                        });
                    };
                    
                    img.src = url;
                });
            }

            if (diagramViewsPanel && diagramViewsToggleBtn) {
                const buttons = {
                    renameBtn: diagramViewsRenameBtn,
                    deleteBtn: diagramViewsDeleteBtn
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
                    if (typeof dismissNewViewModal === 'function') {
                        dismissNewViewModal();
                    }
                    if (typeof dismissDeleteViewModal === 'function') {
                        dismissDeleteViewModal();
                    }
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

                document.addEventListener('keydown', (event) => {
                    if (event.key === 'Escape' && !event.defaultPrevented && diagramViewsPanel.classList.contains('open')) {
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
                        const defaultName = generateUniqueViewName('Nueva vista');
                        requestNewViewName(defaultName, (resolvedName) => {
                            const id = 'view_' + Date.now().toString(36);
                            const tables = pendingViewTables.size > 0
                                ? Array.from(pendingViewTables)
                                : Array.from(allTableNames);

                            diagramViews.push({
                                id,
                                name: resolvedName,
                                tables
                            });
                            activeViewId = id;
                            pendingViewTables = new Set(tables);
                            applyViewTables(tables);
                            persistViewsAndScheduleSave();
                            refreshUi();
                        });
                    });
                }

                if (diagramViewsRenameBtn) {
                    diagramViewsRenameBtn.addEventListener('click', () => {
                        const activeView = getActiveView();
                        if (!activeView || isDefaultView(activeView)) {
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
                        if (!activeView || isDefaultView(activeView)) {
                            return;
                        }

                        requestDeleteConfirmation(activeView, () => {
                            diagramViews = diagramViews.filter(view => view.id !== activeView.id);
                            activeViewId = '';
                            pendingViewTables = new Set(allTableNames);
                            applyViewTables(allTableNames);
                            persistViewsAndScheduleSave();
                            refreshUi();
                        });
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
