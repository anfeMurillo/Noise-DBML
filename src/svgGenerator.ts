export interface ParsedTable {
	name: string;
	fields: ParsedField[];
	note?: string;
}

export interface ParsedField {
	name: string;
	type: string;
	pk?: boolean;
	unique?: boolean;
	notNull?: boolean;
	increment?: boolean;
	note?: string;
}

export interface ParsedRef {
	endpoints: Array<{
		tableName: string;
		fieldNames: string[];
		relation?: string;
	}>;
	onDelete?: string;
	onUpdate?: string;
}

export interface ParsedSchema {
	tables: ParsedTable[];
	refs: ParsedRef[];
}

// Calculate orthogonal path with rounded corners
function calculateOrthogonalPath(x1: number, y1: number, x2: number, y2: number, gridSize: number, radius: number): string {
	// Snap points to grid
	const startX = Math.round(x1 / gridSize) * gridSize;
	const startY = Math.round(y1 / gridSize) * gridSize;
	const endX = Math.round(x2 / gridSize) * gridSize;
	const endY = Math.round(y2 / gridSize) * gridSize;
	
	const dx = endX - startX;
	const dy = endY - startY;
	
	// Start path
	let path = `M ${startX} ${startY}`;
	
	// Simple orthogonal routing with rounded corners
	if (Math.abs(dx) > Math.abs(dy)) {
		// Horizontal first
		const midX = startX + dx / 2;
		
		if (dx > 0) {
			// Going right
			path += ` L ${midX - radius} ${startY}`;
			path += ` Q ${midX} ${startY} ${midX} ${startY + (dy > 0 ? radius : -radius)}`;
			path += ` L ${midX} ${endY - (dy > 0 ? radius : -radius)}`;
			path += ` Q ${midX} ${endY} ${midX + radius} ${endY}`;
			path += ` L ${endX} ${endY}`;
		} else {
			// Going left
			path += ` L ${midX + radius} ${startY}`;
			path += ` Q ${midX} ${startY} ${midX} ${startY + (dy > 0 ? radius : -radius)}`;
			path += ` L ${midX} ${endY - (dy > 0 ? radius : -radius)}`;
			path += ` Q ${midX} ${endY} ${midX - radius} ${endY}`;
			path += ` L ${endX} ${endY}`;
		}
	} else {
		// Vertical first
		const midY = startY + dy / 2;
		
		if (dy > 0) {
			// Going down
			path += ` L ${startX} ${midY - radius}`;
			path += ` Q ${startX} ${midY} ${startX + (dx > 0 ? radius : -radius)} ${midY}`;
			path += ` L ${endX - (dx > 0 ? radius : -radius)} ${midY}`;
			path += ` Q ${endX} ${midY} ${endX} ${midY + radius}`;
			path += ` L ${endX} ${endY}`;
		} else {
			// Going up
			path += ` L ${startX} ${midY + radius}`;
			path += ` Q ${startX} ${midY} ${startX + (dx > 0 ? radius : -radius)} ${midY}`;
			path += ` L ${endX - (dx > 0 ? radius : -radius)} ${midY}`;
			path += ` Q ${endX} ${midY} ${endX} ${midY - radius}`;
			path += ` L ${endX} ${endY}`;
		}
	}
	
	return path;
}

export function generateSvgFromSchema(schema: ParsedSchema, positions?: Map<string, {x: number, y: number}>): string {
	const tableWidth = 250;
	const fieldHeight = 30;
	const headerHeight = 40;
	const tableSpacing = 100;
	const tablesPerRow = 3;
	const gridSize = 20; // Grid cell size for routing
	
	// Calculate positions for tables
	const tablePositions: Array<{table: ParsedTable, x: number, y: number}> = [];
	schema.tables.forEach((table, index) => {
		let x: number, y: number;
		
		// Use saved position if available
		if (positions && positions.has(table.name)) {
			const pos = positions.get(table.name)!;
			x = pos.x;
			y = pos.y;
		} else {
			// Default grid layout - snap to grid
			const row = Math.floor(index / tablesPerRow);
			const col = index % tablesPerRow;
			x = Math.round((col * (tableWidth + tableSpacing) + 50) / gridSize) * gridSize;
			y = Math.round((row * 350 + 50) / gridSize) * gridSize;
		}
		
		tablePositions.push({ table, x, y });
	});

	// Infinite canvas with viewBox
	let svg = `<svg width="100%" height="100%" viewBox="0 0 2000 2000" xmlns="http://www.w3.org/2000/svg" id="diagram-svg" style="background: var(--vscode-editor-background);">`;
	svg += '<g id="relationships">';

	// Draw relationships first (so they appear behind tables)
	schema.refs.forEach((ref, index) => {
		if (ref.endpoints.length >= 2) {
			const fromEndpoint = ref.endpoints[0];
			const toEndpoint = ref.endpoints[1];
			
			const fromPos = tablePositions.find(p => p.table.name === fromEndpoint.tableName);
			const toPos = tablePositions.find(p => p.table.name === toEndpoint.tableName);
			
			if (fromPos && toPos) {
				// Find the specific field indices for connection points
				let fromFieldIndex = 0;
				let toFieldIndex = 0;
				
				if (fromEndpoint.fieldNames && fromEndpoint.fieldNames.length > 0) {
					const fieldName = fromEndpoint.fieldNames[0];
					fromFieldIndex = fromPos.table.fields.findIndex(f => f.name === fieldName);
					if (fromFieldIndex === -1) {
						fromFieldIndex = 0;
					}
				}
				
				if (toEndpoint.fieldNames && toEndpoint.fieldNames.length > 0) {
					const fieldName = toEndpoint.fieldNames[0];
					toFieldIndex = toPos.table.fields.findIndex(f => f.name === fieldName);
					if (toFieldIndex === -1) {
						toFieldIndex = 0;
					}
				}
				
				// Calculate Y position based on field index
				const fromFieldY = fromPos.y + headerHeight + (fromFieldIndex * fieldHeight) + (fieldHeight / 2);
				const toFieldY = toPos.y + headerHeight + (toFieldIndex * fieldHeight) + (fieldHeight / 2);
				
				// Determine which side to connect based on relative position
				const fromCenterX = fromPos.x + tableWidth / 2;
				const toCenterX = toPos.x + tableWidth / 2;
				
				let fromX: number, toX: number;
				
				// If target is to the right, exit from right side, enter from left
				// If target is to the left, exit from left side, enter from right
				if (toCenterX > fromCenterX) {
					fromX = fromPos.x + tableWidth; // Exit from right
					toX = toPos.x; // Enter from left
				} else {
					fromX = fromPos.x; // Exit from left
					toX = toPos.x + tableWidth; // Enter from right
				}
				
				const fromY = fromFieldY;
				const toY = toFieldY;
				
				// Determine relationship cardinality
				const fromRelation = fromEndpoint.relation || '*';
				const toRelation = toEndpoint.relation || '1';
				
				// Build cardinality label (e.g., "1:n", "1:1", "0:1")
				let cardinalityLabel = `${fromRelation}:${toRelation}`;
				
				// Calculate orthogonal path with rounded corners
				const pathData = calculateOrthogonalPath(fromX, fromY, toX, toY, gridSize, 15);
				
				// Calculate midpoint for label placement
				const midX = (fromX + toX) / 2;
				const midY = (fromY + toY) / 2;
				
				svg += `<path 
					d="${pathData}"
					class="relationship-line" 
					data-from="${fromEndpoint.tableName}"
					data-to="${toEndpoint.tableName}"
					data-from-x="${fromX}"
					data-from-y="${fromY}"
					data-to-x="${toX}"
					data-to-y="${toY}"
					data-from-field-offset="${fromFieldIndex}"
					data-to-field-offset="${toFieldIndex}"
				/>`;
				
				// Add cardinality label
				svg += `<text 
					x="${midX}" 
					y="${midY - 5}" 
					class="cardinality-label"
					data-from="${fromEndpoint.tableName}"
					data-to="${toEndpoint.tableName}"
					text-anchor="middle" 
					font-size="11"
					font-weight="bold"
				>${cardinalityLabel}</text>`;
			}
		}
	});
	
	svg += '</g>';
	svg += '<g id="tables">';

	// Draw tables
	tablePositions.forEach(({ table, x, y }) => {
		const tableHeight = headerHeight + (table.fields.length * fieldHeight);
		
		// Table container with data attributes for dragging
		svg += `<g class="table draggable" data-table="${table.name}" data-x="${x}" data-y="${y}" transform="translate(${x}, ${y})" style="cursor: move;">`;
		
		// Clip path for rounded corners only on outer edges
		svg += `<defs>`;
		svg += `<clipPath id="clip-${table.name}">`;
		svg += `<rect width="${tableWidth}" height="${tableHeight}" rx="8" ry="8" />`;
		svg += `</clipPath>`;
		svg += `</defs>`;
		
		// Background group with clip path
		svg += `<g clip-path="url(#clip-${table.name})">`;
		
		// Header (no rounded corners)
		svg += `<rect width="${tableWidth}" height="${headerHeight}" class="table-header" />`;
		
		// Body background (no rounded corners)
		svg += `<rect y="${headerHeight}" width="${tableWidth}" height="${table.fields.length * fieldHeight}" class="table-body" />`;
		
		svg += `</g>`;
		
		// Outer border with rounded corners
		svg += `<rect width="${tableWidth}" height="${tableHeight}" class="table-border" rx="8" ry="8" fill="none" />`;
		
		// Header text
		svg += `<text x="${tableWidth / 2}" y="${headerHeight / 2 + 5}" class="table-name" text-anchor="middle" font-weight="bold" font-size="16">${table.name}</text>`;
		
		// Fields
		table.fields.forEach((field, index) => {
			const fieldY = headerHeight + (index * fieldHeight);
			
			// Field background (for hover effect)
			svg += `<rect y="${fieldY}" width="${tableWidth}" height="${fieldHeight}" class="field-row" fill="transparent" />`;
			
			// Field name
			let fieldLabel = field.name;
			let badges = '';
			
			if (field.pk) {
				badges += ' PK';
			}
			if (field.unique) {
				badges += ' UQ';
			}
			if (field.notNull) {
				badges += ' NN';
			}
			
			svg += `<text x="10" y="${fieldY + 20}" class="field-name" font-size="13">${fieldLabel}</text>`;
			
			// Field type
			svg += `<text x="${tableWidth - 10}" y="${fieldY + 20}" class="field-type" text-anchor="end" font-size="12" opacity="0.7">${field.type}${badges}</text>`;
			
			// Divider line
			if (index < table.fields.length - 1) {
				svg += `<line x1="0" y1="${fieldY + fieldHeight}" x2="${tableWidth}" y2="${fieldY + fieldHeight}" class="field-divider" />`;
			}
		});
		
		svg += '</g>';
	});

	svg += '</g>'; // Close tables group
	svg += '</svg>';
	return svg;
}
