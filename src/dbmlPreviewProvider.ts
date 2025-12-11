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
        
        .toolbar-button {
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
            width: 20px;
            height: 20px;
            fill: currentColor;
            color: var(--vscode-icon-foreground);
            opacity: 0.9;
        }
        
        .toolbar-button:hover svg {
            opacity: 1;
            color: var(--vscode-button-foreground);
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
            <div class="toolbar">
                <button class="toolbar-button" id="autoArrangeBtn" title="Auto arrange diagram">
                    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Z"/>
                        <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM5 13s1-1 3-1 3 1 3 1v1H5v-1Z"/>
                    </svg>
                </button>
                <button class="toolbar-button" id="resetZoomBtn" title="Reset zoom and pan">
                    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                        <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
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
            let positions = state.positions || {};
            const savedViewBox = state.viewBox;
            
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
                const tables = Array.from(document.querySelectorAll('.draggable'));
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
                        graph.set(name, []);
                        inDegree.set(name, 0);
                    });
                    
                    document.querySelectorAll('.relationship-line').forEach(line => {
                        const from = line.getAttribute('data-from');
                        const to = line.getAttribute('data-to');
                        if (from && to) {
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
                            graph.get(name).forEach(neighbor => {
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
                            const table = document.querySelector('[data-table="' + tableName + '"]');
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
                        positions[pos.tableName] = { x: pos.x, y: pos.y };
                    });
                    
                } else if (algorithm === 'snowflake') {
                    // Calculate connection count for each table
                    const connections = new Map();
                    tables.forEach(table => {
                        connections.set(table.getAttribute('data-table'), 0);
                    });
                    
                    document.querySelectorAll('.relationship-line').forEach(line => {
                        const from = line.getAttribute('data-from');
                        const to = line.getAttribute('data-to');
                        connections.set(from, connections.get(from) + 1);
                        connections.set(to, connections.get(to) + 1);
                    });
                    
                    // Sort by connection count
                    const sortedTables = tables.sort((a, b) => {
                        const aConn = connections.get(a.getAttribute('data-table'));
                        const bConn = connections.get(b.getAttribute('data-table'));
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
                            positions[pos.tableName] = { x: pos.x, y: pos.y };
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
                        positions[pos.tableName] = { x: pos.x, y: pos.y };
                    });
                }
                
                // Update relationships
                updateRelationships();
                
                // Save state
                state.positions = positions;
                vscode.setState(state);
            }
            
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
                        
                        // Get table heights
                        const fromTableHeight = fromTable.getBBox().height;
                        const toTableHeight = toTable.getBBox().height;
                        
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
            
            // Side panel and toolbar functionality
            const autoArrangeBtn = document.getElementById('autoArrangeBtn');
            const sidePanel = document.getElementById('sidePanel');
            const closePanelBtn = document.getElementById('closePanelBtn');
            const resetZoomBtn = document.getElementById('resetZoomBtn');
            
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
                    state.viewBox = viewBox;
                    vscode.setState(state);
                });
            }
        })();
    </script>
</body>
</html>`;
	}
}
