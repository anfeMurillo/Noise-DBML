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
            opacity: 0.25;
            transition: opacity 0.2s ease, stroke 0.2s ease, stroke-width 0.2s ease;
            stroke-dasharray: 5, 5;
            animation: dash-flow 20s linear infinite;
        }
        
        svg .relationship-line.active {
            opacity: 1;
            stroke: var(--vscode-button-background);
            stroke-width: 3;
            filter: brightness(1.2) saturate(1.3);
            stroke-dasharray: 8, 4;
            animation: dash-flow-active 1.5s linear infinite;
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
        
        svg .cardinality-label {
            fill: var(--vscode-editor-foreground);
            opacity: 0.4;
            transition: opacity 0.2s ease, fill 0.2s ease;
            pointer-events: none;
        }
        
        svg .cardinality-label.active {
            opacity: 1;
            fill: var(--vscode-button-background);
            font-weight: bold;
            filter: brightness(1.2) saturate(1.3);
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
    
    <script>
        (function() {
            const vscode = acquireVsCodeApi();
            const svg = document.getElementById('diagram-svg');
            const container = document.querySelector('.diagram-container');
            
            let selectedTable = null;
            let offset = { x: 0, y: 0 };
            let isDragging = false;
            let isPanning = false;
            let panStart = { x: 0, y: 0 };
            
            // ViewBox state for pan and zoom
            let viewBox = { x: 0, y: 0, width: 2000, height: 2000 };
            const gridSize = 20;
            
            // Load saved state
            const state = vscode.getState() || {};
            const positions = state.positions || {};
            const savedViewBox = state.viewBox;
            
            if (savedViewBox) {
                viewBox = savedViewBox;
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
                
                document.querySelectorAll('.cardinality-label').forEach(label => {
                    const fromTable = label.getAttribute('data-from');
                    const toTable = label.getAttribute('data-to');
                    
                    if (fromTable === tableName || toTable === tableName) {
                        if (highlight) {
                            label.classList.add('active');
                        } else {
                            label.classList.remove('active');
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
                state.viewBox = viewBox;
                vscode.setState(state);
            });
            
            // Mouse down - start dragging or panning
            document.addEventListener('mousedown', (e) => {
                const target = e.target;
                const tableGroup = target.closest('.draggable');
                
                if (tableGroup) {
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
                    
                    positions[tableName] = { x, y };
                    state.positions = positions;
                    state.viewBox = viewBox;
                    vscode.setState(state);
                    
                    isDragging = false;
                    selectedTable = null;
                }
                
                if (isPanning) {
                    container.classList.remove('panning');
                    state.viewBox = viewBox;
                    vscode.setState(state);
                    isPanning = false;
                }
            });
            
            // Calculate orthogonal path with stub segments to prevent edge alignment
            function calculateOrthogonalPath(startX, startY, stubStartX, endX, endY, stubEndX, radius) {
                let path = 'M ' + startX + ' ' + startY;
                
                // First horizontal stub from table edge
                path += ' L ' + stubStartX + ' ' + startY;
                
                const dy = endY - startY;
                
                // Create a three-segment path: horizontal -> vertical -> horizontal
                if (dy !== 0) {
                    // First turn at stub point
                    if (dy > 0) {
                        path += ' Q ' + stubStartX + ' ' + startY + ' ' + stubStartX + ' ' + (startY + radius);
                        path += ' L ' + stubStartX + ' ' + (endY - radius);
                        path += ' Q ' + stubStartX + ' ' + endY + ' ' + (stubStartX + radius) + ' ' + endY;
                    } else {
                        path += ' Q ' + stubStartX + ' ' + startY + ' ' + stubStartX + ' ' + (startY - radius);
                        path += ' L ' + stubStartX + ' ' + (endY + radius);
                        path += ' Q ' + stubStartX + ' ' + endY + ' ' + (stubStartX + radius) + ' ' + endY;
                    }
                    
                    // Horizontal to target stub
                    path += ' L ' + (stubEndX - radius) + ' ' + endY;
                    
                    // Final turn to target stub
                    if (dy > 0) {
                        path += ' Q ' + stubEndX + ' ' + endY + ' ' + stubEndX + ' ' + (endY - radius);
                        path += ' L ' + stubEndX + ' ' + endY;
                    } else {
                        path += ' Q ' + stubEndX + ' ' + endY + ' ' + stubEndX + ' ' + (endY + radius);
                        path += ' L ' + stubEndX + ' ' + endY;
                    }
                } else {
                    // Same Y - straight horizontal line
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
                    
                    const fromTable = document.querySelector('[data-table="' + fromTableName + '"]');
                    const toTable = document.querySelector('[data-table="' + toTableName + '"]');
                    
                    if (fromTable && toTable) {
                        const fromTableX = parseFloat(fromTable.getAttribute('data-x'));
                        const fromTableY = parseFloat(fromTable.getAttribute('data-y'));
                        const toTableX = parseFloat(toTable.getAttribute('data-x'));
                        const toTableY = parseFloat(toTable.getAttribute('data-y'));
                        
                        // Get stored field offsets from data attributes
                        const fromFieldOffset = parseFloat(line.getAttribute('data-from-field-offset') || '0');
                        const toFieldOffset = parseFloat(line.getAttribute('data-to-field-offset') || '0');
                        
                        // Calculate precise Y positions for fields
                        const fromY = fromTableY + headerHeight + (fromFieldOffset * fieldHeight) + (fieldHeight / 2);
                        const toY = toTableY + headerHeight + (toFieldOffset * fieldHeight) + (fieldHeight / 2);
                        
                        // Determine which side to connect based on relative position
                        const fromCenterX = fromTableX + tableWidth / 2;
                        const toCenterX = toTableX + tableWidth / 2;
                        
                        // Connection stub length - distance from table edge before first turn
                        const stubLength = 40;
                        let fromX, toX, fromStubX, toStubX;
                        
                        if (toCenterX > fromCenterX) {
                            // Target is to the right
                            fromX = fromTableX + tableWidth; // Exit point at right edge
                            toX = toTableX; // Entry point at left edge
                            fromStubX = fromX + stubLength; // Stub extends to the right
                            toStubX = toX - stubLength; // Stub extends to the left
                        } else {
                            // Target is to the left
                            fromX = fromTableX; // Exit point at left edge
                            toX = toTableX + tableWidth; // Entry point at right edge
                            fromStubX = fromX - stubLength; // Stub extends to the left
                            toStubX = toX + stubLength; // Stub extends to the right
                        }
                        
                        const pathData = calculateOrthogonalPath(fromX, fromY, fromStubX, toX, toY, toStubX, 15);
                        line.setAttribute('d', pathData);
                        
                        // Update cardinality label position
                        const label = document.querySelector('.cardinality-label[data-from="' + fromTableName + '"][data-to="' + toTableName + '"]');
                        if (label) {
                            const midX = (fromX + toX) / 2;
                            const midY = (fromY + toY) / 2;
                            label.setAttribute('x', midX);
                            label.setAttribute('y', midY - 5);
                        }
                    }
                });
            }
        })();
    </script>
</body>
</html>`;
	}
}
