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

// Calculate the best connection sides based on table positions
function calculateBestConnectionSides(fromX: number, fromY: number, fromWidth: number, toX: number, toY: number, toWidth: number): { fromSide: 'left' | 'right', toSide: 'left' | 'right' } {
	// Calculate all 4 possible connection combinations
	const options = [
		// Right to Left
		{ fromSide: 'right' as const, toSide: 'left' as const, fromPoint: fromX + fromWidth, toPoint: toX },
		// Right to Right
		{ fromSide: 'right' as const, toSide: 'right' as const, fromPoint: fromX + fromWidth, toPoint: toX + toWidth },
		// Left to Left
		{ fromSide: 'left' as const, toSide: 'left' as const, fromPoint: fromX, toPoint: toX },
		// Left to Right
		{ fromSide: 'left' as const, toSide: 'right' as const, fromPoint: fromX, toPoint: toX + toWidth },
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
	startX: number, startY: number, stubStartX: number, 
	endX: number, endY: number, stubEndX: number, 
	gridSize: number, radius: number,
	fromTableX: number, fromTableY: number, fromTableHeight: number,
	toTableX: number, toTableY: number, toTableHeight: number,
	tableWidth: number
): string {
	let path = `M ${startX} ${startY}`;
	
	// First horizontal stub from table edge
	path += ` L ${stubStartX} ${startY}`;
	
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
				// Line crosses the table - route around it
				intermediateY = fromTableY - 30; // Route above
			} else if (startY > fromTableBottom && endY < fromTableY) {
				intermediateY = fromTableBottom + 30; // Route below
			} else if (startY < endY) {
				intermediateY = fromTableY - 30; // Going down - route above
			} else {
				intermediateY = fromTableBottom + 30; // Going up - route below
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
		path += ` L ${stubStartX} ${intermediateY}`;
		path += ` L ${stubEndX} ${intermediateY}`;
		path += ` L ${stubEndX} ${endY}`;
	} else {
		// Simple two-segment path
		path += ` L ${stubStartX} ${endY}`;
		path += ` L ${stubEndX} ${endY}`;
	}
	
	// Final horizontal stub to table edge
	path += ` L ${endX} ${endY}`;
	
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
			// Default grid layout - calculate based on actual table heights
			const row = Math.floor(index / tablesPerRow);
			const col = index % tablesPerRow;
			
			// Calculate cumulative height for this row
			let rowY = 50;
			for (let r = 0; r < row; r++) {
				let maxHeightInRow = 0;
				for (let c = 0; c < tablesPerRow; c++) {
					const tableIndex = r * tablesPerRow + c;
					if (tableIndex < schema.tables.length) {
						const tableHeight = headerHeight + (schema.tables[tableIndex].fields.length * fieldHeight);
						maxHeightInRow = Math.max(maxHeightInRow, tableHeight);
					}
				}
				rowY += maxHeightInRow + tableSpacing;
			}
			
			x = Math.round((col * (tableWidth + tableSpacing) + 50) / gridSize) * gridSize;
			y = Math.round(rowY / gridSize) * gridSize;
		}
		
		tablePositions.push({ table, x, y });
	});

	// Infinite canvas with viewBox
	let svg = `<svg width="100%" height="100%" viewBox="0 0 2000 2000" xmlns="http://www.w3.org/2000/svg" id="diagram-svg" style="background: var(--vscode-editor-background);">`;
	
	// Define markers for cardinality indicators
	svg += `<defs>`;
	// Marker for "many" (*) - circle
	svg += `<marker id="many-marker" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">`;
	svg += `<circle cx="5" cy="5" r="3" class="cardinality-marker" />`;
	svg += `</marker>`;
	// Marker for "one" (1) - perpendicular line
	svg += `<marker id="one-marker" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">`;
	svg += `<line x1="5" y1="1" x2="5" y2="9" class="cardinality-marker" stroke-width="2" />`;
	svg += `</marker>`;
	// Marker for "zero or one" (0..1) - circle with line
	svg += `<marker id="zero-one-marker" markerWidth="14" markerHeight="10" refX="7" refY="5" orient="auto">`;
	svg += `<circle cx="4" cy="5" r="2.5" class="cardinality-marker" fill="none" />`;
	svg += `<line x1="10" y1="1" x2="10" y2="9" class="cardinality-marker" stroke-width="2" />`;
	svg += `</marker>`;
	svg += `</defs>`;
	
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
				
				// Connection stub length - distance from table edge before first turn
				const stubLength = 40;
				
				// Use intelligent side selection
				const sides = calculateBestConnectionSides(
					fromPos.x, fromFieldY, tableWidth,
					toPos.x, toFieldY, tableWidth
				);
				
				let fromX: number, toX: number, fromStubX: number, toStubX: number;
				
				// Set connection points based on calculated best sides
				if (sides.fromSide === 'right') {
					fromX = fromPos.x + tableWidth;
					fromStubX = fromX + stubLength;
				} else {
					fromX = fromPos.x;
					fromStubX = fromX - stubLength;
				}
				
				if (sides.toSide === 'right') {
					toX = toPos.x + tableWidth;
					toStubX = toX + stubLength;
				} else {
					toX = toPos.x;
					toStubX = toX - stubLength;
				}
				
				const fromY = fromFieldY;
				const toY = toFieldY;
				
				// Determine relationship cardinality
				const fromRelation = fromEndpoint.relation || '*';
				const toRelation = toEndpoint.relation || '1';
				
				// Determine which markers to use
				let markerStart = '';
				let markerEnd = '';
				
				// From side marker (start of line)
				if (fromRelation === '*' || fromRelation === 'n') {
					markerStart = 'url(#many-marker)';
				} else if (fromRelation === '1') {
					markerStart = 'url(#one-marker)';
				} else if (fromRelation === '0..1' || fromRelation === '?') {
					markerStart = 'url(#zero-one-marker)';
				}
				
				// To side marker (end of line)
				if (toRelation === '*' || toRelation === 'n') {
					markerEnd = 'url(#many-marker)';
				} else if (toRelation === '1') {
					markerEnd = 'url(#one-marker)';
				} else if (toRelation === '0..1' || toRelation === '?') {
					markerEnd = 'url(#zero-one-marker)';
				}
				
				// Calculate table heights
				const fromTableHeight = headerHeight + (fromPos.table.fields.length * fieldHeight);
				const toTableHeight = headerHeight + (toPos.table.fields.length * fieldHeight);
				
				// Calculate orthogonal path with stub points to prevent edge alignment
				const pathData = calculateOrthogonalPath(
					fromX, fromY, fromStubX, toX, toY, toStubX, gridSize, 15,
					fromPos.x, fromPos.y, fromTableHeight,
					toPos.x, toPos.y, toTableHeight,
					tableWidth
				);
				
				svg += `<path 
					d="${pathData}"
					class="relationship-line" 
					data-from="${fromEndpoint.tableName}"
					data-to="${toEndpoint.tableName}"
					data-from-x="${fromX}"
					data-from-y="${fromY}"
					data-from-stub-x="${fromStubX}"
					data-to-x="${toX}"
					data-to-y="${toY}"
					data-to-stub-x="${toStubX}"
					data-from-field-offset="${fromFieldIndex}"
					data-to-field-offset="${toFieldIndex}"
					data-from-side="${sides.fromSide}"
					data-to-side="${sides.toSide}"
					marker-start="${markerStart}"
					marker-end="${markerEnd}"
				/>`;
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
