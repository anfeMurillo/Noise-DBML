import * as vscode from 'vscode';
import { Parser } from '@dbml/core';
import { generateSvgFromSchema, ParsedSchema, ParsedTable, ParsedField, ParsedRef } from './svgGenerator';

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

			// Handle when the panel is closed
			this.panel.onDidDispose(() => {
				this.panel = undefined;
			});
		}

		// Update the webview content
		this.updatePreview(document);
	}

	public updatePreview(document: vscode.TextDocument) {
		if (!this.panel || document !== this.currentDocument) {
			return;
		}

		const dbmlContent = document.getText();
		this.panel.webview.html = this.getWebviewContent(dbmlContent);
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
					const parsedRef: ParsedRef = {
						endpoints: ref.endpoints || [],
						onDelete: ref.onDelete || undefined,
						onUpdate: ref.onUpdate || undefined
					};
					refs.push(parsedRef);
				});
			}
		}

		return { tables, refs };
	}

	private getWebviewContent(dbmlContent: string): string {
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
            display: flex;
            justify-content: center;
            align-items: flex-start;
            min-height: 100vh;
        }
        
        .diagram-container {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            max-width: 100%;
            overflow: auto;
        }
        
        svg {
            max-width: 100%;
            height: auto;
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
            stroke: var(--vscode-panel-border);
            stroke-width: 1.5;
        }
        
        svg .field-divider {
            stroke: var(--vscode-panel-border);
            stroke-width: 1;
            opacity: 0.3;
        }
        
        svg .relationship-line {
            stroke: var(--vscode-editorInfo-foreground);
            stroke-width: 2;
            fill: none;
        }
        
        svg .relationship-arrow {
            fill: var(--vscode-editorInfo-foreground);
        }
        
        svg .table-name {
            fill: var(--vscode-button-foreground);
        }
        
        svg .field-row:hover {
            fill: var(--vscode-list-hoverBackground);
            opacity: 0.5;
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
            <div class="diagram-container">
                ${svgContent}
            </div>
        `}
    </div>
</body>
</html>`;
	}
}
