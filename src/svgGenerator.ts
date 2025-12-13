export interface ParsedTable {
	name: string;
	fields: ParsedField[];
	note?: string;
	schema?: string;
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
	name?: string;
	endpoints: Array<{
		tableName: string;
		fieldNames: string[];
		relation?: string;
	}>;
	onDelete?: string;
	onUpdate?: string;
}

export interface ParsedGroup {
	name: string;
	tables: string[];
	color?: string;
	note?: string;
}

export interface ParsedSchema {
	tables: ParsedTable[];
	refs: ParsedRef[];
	groups?: ParsedGroup[];
}

function escapeXml(value: unknown): string {
	let normalized: string;
	if (typeof value === 'string') {
		normalized = value;
	} else if (typeof value === 'number') {
		normalized = value.toString();
	} else {
		normalized = '';
	}
	return normalized
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
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
	
	// Calculate preferred horizontal grid line
	// Snap to nearest grid line to ensure horizontal segments follow the grid
	const midY = Math.round(endY / gridSize) * gridSize;

	// Check if the vertical line at stubStartX or stubEndX would pass through either table
	const fromTableRight = fromTableX + tableWidth;
	const fromTableBottom = fromTableY + fromTableHeight;
	const toTableRight = toTableX + tableWidth;
	const toTableBottom = toTableY + toTableHeight;
	
	// Check if vertical segments would pass through tables
	const stubStartPassesFromTable = stubStartX >= fromTableX && stubStartX <= fromTableRight;
	const stubStartPassesToTable = stubStartX >= toTableX && stubStartX <= toTableRight;
	const stubEndPassesFromTable = stubEndX >= fromTableX && stubEndX <= fromTableRight;
	const stubEndPassesToTable = stubEndX >= toTableX && stubEndX <= toTableRight;
	
	// Determine if we need to route around tables
	// Check if any vertical segment would cross through a table's Y range
	// We consider the path startY -> midY -> endY
	const minY = Math.min(startY, endY, midY);
	const maxY = Math.max(startY, endY, midY);
	
	let needsReroute = false;
	let intermediateY = 0;
	
	// Check stubStartX against fromTable
	if (stubStartPassesFromTable && !(maxY < fromTableY || minY > fromTableBottom)) {
		needsReroute = true;
		intermediateY = Math.max(intermediateY, fromTableBottom + gridSize);
	}
	
	// Check stubStartX against toTable
	if (stubStartPassesToTable && !(maxY < toTableY || minY > toTableBottom)) {
		needsReroute = true;
		intermediateY = Math.max(intermediateY, toTableBottom + gridSize);
	}
	
	// Check stubEndX against fromTable
	if (stubEndPassesFromTable && !(maxY < fromTableY || minY > fromTableBottom)) {
		needsReroute = true;
		intermediateY = Math.max(intermediateY, fromTableBottom + gridSize);
	}
	
	// Check stubEndX against toTable
	if (stubEndPassesToTable && !(maxY < toTableY || minY > toTableBottom)) {
		needsReroute = true;
		intermediateY = Math.max(intermediateY, toTableBottom + gridSize);
	}

	// Check horizontal segment at midY (from stubStartX to stubEndX)
	const minStubX = Math.min(stubStartX, stubEndX);
	const maxStubX = Math.max(stubStartX, stubEndX);
	
	// Check if horizontal segment crosses fromTable
	if (midY >= fromTableY - 5 && midY <= fromTableBottom + 5 && 
		maxStubX > fromTableX && minStubX < fromTableRight) {
		needsReroute = true;
		intermediateY = Math.max(intermediateY, fromTableBottom + gridSize);
	}
	
	// Check if horizontal segment crosses toTable
	if (midY >= toTableY - 5 && midY <= toTableBottom + 5 && 
		maxStubX > toTableX && minStubX < toTableRight) {
		needsReroute = true;
		intermediateY = Math.max(intermediateY, toTableBottom + gridSize);
	}
	
	if (needsReroute) {
		// Snap intermediateY to grid
		intermediateY = Math.ceil(intermediateY / gridSize) * gridSize;

		// Route below both tables: horizontal -> vertical -> horizontal -> vertical
		path += ` L ${stubStartX} ${intermediateY}`;
		path += ` L ${stubEndX} ${intermediateY}`;
		path += ` L ${stubEndX} ${endY}`;
	} else {
		// Simple path with grid alignment
		// L stubStartX midY -> L stubEndX midY -> L stubEndX endY
		path += ` L ${stubStartX} ${midY}`;
		path += ` L ${stubEndX} ${midY}`;
		path += ` L ${stubEndX} ${endY}`;
	}
	
	// Final horizontal stub to table edge
	path += ` L ${endX} ${endY}`;
	
	return path;
}

export function generateSvgFromSchema(schema: ParsedSchema, positions?: Map<string, {x: number, y: number}>): string {
	const tableWidth = 380;
	const fieldHeight = 30;
	const headerHeight = 40;
	const tableSpacing = 150;
	const tablesPerRow = 3;
	const gridSize = 20; // Grid cell size for routing
	const groups = schema.groups ?? [];
	const groupByTable = new Map<string, ParsedGroup>();
	groups.forEach(group => {
		group.tables.forEach(tableName => {
			if (tableName) {
				groupByTable.set(tableName, group);
			}
		});
	});
	
	// Calculate positions for tables
	const tablePositions: Array<{table: ParsedTable, x: number, y: number, height: number}> = [];
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
		
		const tableHeight = headerHeight + (table.fields.length * fieldHeight);
		tablePositions.push({ table, x, y, height: tableHeight });
	});

	// Infinite canvas with viewBox
	let svg = `<svg width="100%" height="100%" viewBox="0 0 2000 2000" xmlns="http://www.w3.org/2000/svg" id="diagram-svg" style="background: transparent;">`;
	
	// Define markers for cardinality indicators
	svg += `<defs>`;
	svg += `<symbol id="icon-glasses" viewBox="0 0 24 24" fill="none">`;
	svg += `<path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M5.44152 5.00024C5.00819 5.00024 4.63559 5.27423 4.50847 5.67256C4.12006 6.88964 3.54128 8.7533 3.03552 10.582C3.77685 10.2098 4.61396 10.0002 5.5 10.0002C8.08018 10.0002 10.2454 11.7769 10.839 14.1737C11.1739 14.0666 11.5598 14.0002 12 14.0002C12.4402 14.0002 12.8261 14.0666 13.161 14.1737C13.7546 11.7769 15.9198 10.0002 18.5 10.0002C19.386 10.0002 20.2231 10.2098 20.9645 10.582C20.4587 8.7533 19.8799 6.88964 19.4915 5.67256C19.3644 5.27423 18.9918 5.00024 18.5585 5.00024H17C16.4477 5.00024 16 4.55253 16 4.00024C16 3.44796 16.4477 3.00024 17 3.00024H18.5585C19.8469 3.00024 21.0005 3.82262 21.3969 5.06451C21.8162 6.3784 22.4602 8.45388 23.0003 10.4437C23.2702 11.438 23.517 12.4208 23.6969 13.2818C23.8041 13.7942 23.8932 14.2893 23.9465 14.7302C23.9818 14.9818 24 15.2389 24 15.5002C24 18.5378 21.5376 21.0002 18.5 21.0002C15.7742 21.0002 13.5116 19.0174 13.0758 16.4154C12.8172 16.1044 12.3886 16.0002 12 16.0002C11.6114 16.0002 11.1828 16.1044 10.9242 16.4154C10.4884 19.0174 8.22578 21.0002 5.5 21.0002C2.46243 21.0002 0 18.5378 0 15.5002C0 15.2389 0.0182295 14.9818 0.0534864 14.7302C0.106769 14.2893 0.195948 13.7942 0.303069 13.2818C0.483034 12.4208 0.729752 11.438 0.99968 10.4437C1.53984 8.45388 2.18384 6.3784 2.60314 5.06451C2.99947 3.82262 4.15313 3.00024 5.44152 3.00024H7C7.55228 3.00024 8 3.44796 8 4.00024C8 4.55253 7.55228 5.00024 7 5.00024H5.44152ZM2.00992 15.5002C2.00992 17.4278 3.57248 18.9903 5.5 18.9903C7.42752 18.9903 8.99008 17.4278 8.99008 15.5002C8.99008 13.5727 7.42752 12.0102 5.5 12.0102C3.57248 12.0102 2.00992 13.5727 2.00992 15.5002ZM15.0099 15.5002C15.0099 17.4278 16.5725 18.9903 18.5 18.9903C20.4275 18.9903 21.9901 17.4278 21.9901 15.5002C21.9901 13.5727 20.4275 12.0102 18.5 12.0102C16.5725 12.0102 15.0099 13.5727 15.0099 15.5002Z"></path>`;
	svg += `</symbol>`;
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

	if (groups.length > 0) {
		svg += '<g id="table-groups">';
		groups.forEach(group => {
			const safeName = escapeXml(group.name || '');
			const safeColor = escapeXml(group.color ?? '');
			const safeNote = escapeXml(group.note ?? '');
			const tablesAttr = escapeXml(JSON.stringify(group.tables ?? []));
			svg += `<g class="table-group" data-group="${safeName}" data-color="${safeColor}" data-note="${safeNote}" data-tables="${tablesAttr}" data-collapsed="false">`;
			svg += `<rect class="table-group-shadow" x="0" y="0" width="0" height="0" rx="22" ry="22"></rect>`;
			svg += `<rect class="table-group-body" x="0" y="0" width="0" height="0" rx="18" ry="18"></rect>`;
			svg += `<g class="table-group-header" data-group-name="${safeName}">`;
			svg += `<rect class="table-group-header-bg" x="0" y="0" width="0" height="0" rx="14" ry="14"></rect>`;
			svg += `<text class="table-group-title" x="0" y="0" font-weight="bold" font-size="16">${safeName}</text>`;
			svg += `<g class="table-group-toggle" role="button" tabindex="0" aria-pressed="false" aria-label="Toggle group ${safeName}">`;
			svg += `<svg class="table-group-toggle-icon" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" focusable="false">`;
			svg += `<use href="#icon-glasses" />`;
			svg += `</svg>`;
			svg += `</g>`;
			svg += `</g>`;
			if (safeNote) {
				svg += `<title>${safeNote}</title>`;
			}
			svg += `</g>`;
		});
		svg += '</g>';
	}
	
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
				
				let tooltipText = '';
				if (ref.name) {
					tooltipText += `Name: ${escapeXml(ref.name)}\n`;
				}
				if (ref.onDelete) {
					tooltipText += `On Delete: ${escapeXml(ref.onDelete)}\n`;
				}
				if (ref.onUpdate) {
					tooltipText += `On Update: ${escapeXml(ref.onUpdate)}\n`;
				}
				tooltipText = tooltipText.trim();

				svg += `<g class="relationship">`;
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
				>`;
				
				if (tooltipText) {
					svg += `<title>${tooltipText}</title>`;
				}
				
				svg += `</path>`;
				svg += `</g>`;
			}
		}
	});
	
	svg += '</g>';

	svg += '<g id="tables">';

	// Build sets of primary keys and foreign keys
	const primaryKeys = new Set<string>();
	schema.tables.forEach(table => {
		table.fields.forEach(field => {
			if (field.pk) {
				primaryKeys.add(`${table.name}.${field.name}`);
			}
		});
	});

	// In DBML, a reference like "Ref: posts.user_id > users.id" means:
	// - posts.user_id is the foreign key (FK) that references users.id
	// - users.id is the primary key being referenced (not an FK in this context)
	// Both endpoints appear in the reference, but only the non-PK side is the FK
	const foreignKeys = new Set<string>();
	schema.refs.forEach(ref => {
		if (ref.endpoints.length >= 2) {
			// Add all fields from both endpoints
			const allFields: string[] = [];
			ref.endpoints.forEach(endpoint => {
				if (endpoint.fieldNames) {
					endpoint.fieldNames.forEach(fieldName => {
						allFields.push(`${endpoint.tableName}.${fieldName}`);
					});
				}
			});
			
			// Mark fields as FK if they're NOT a PK, or if both are PKs (many-to-many case)
			allFields.forEach(fieldKey => {
				// If this field is not a PK in its table, it's definitely a FK
				// If it's a PK but part of a many-to-many relationship, it can also be a FK
				if (!primaryKeys.has(fieldKey)) {
					foreignKeys.add(fieldKey);
				}
			});
		}
	});

	// Draw tables
	tablePositions.forEach(({ table, x, y, height }) => {
		const tableHeight = height;
		const safeTableName = escapeXml(table.name);
		const groupInfo = groupByTable.get(table.name);
		const groupAttr = groupInfo ? ` data-group="${escapeXml(groupInfo.name)}"` : '';
		const groupColorAttr = groupInfo?.color ? ` data-group-color="${escapeXml(groupInfo.color)}"` : '';
		const groupNoteAttr = groupInfo?.note ? ` data-group-note="${escapeXml(groupInfo.note)}"` : '';
		const clipSafeId = table.name.replace(/[^a-zA-Z0-9_-]/g, '_');
		
		// Table container with data attributes for dragging
		svg += `<g class="table draggable" data-table="${safeTableName}" data-x="${x}" data-y="${y}" data-height="${tableHeight}" data-width="${tableWidth}"${groupAttr}${groupColorAttr}${groupNoteAttr} transform="translate(${x}, ${y})" style="cursor: move;">`;
		
		// Clip path for rounded corners only on outer edges
		svg += `<defs>`;
		svg += `<clipPath id="clip-${clipSafeId}">`;
		svg += `<rect width="${tableWidth}" height="${tableHeight}" rx="5" ry="5" />`;
		svg += `</clipPath>`;
		svg += `</defs>`;
		
		// Background group with clip path
		svg += `<g clip-path="url(#clip-${clipSafeId})">`;
		
		// Header (no rounded corners)
		svg += `<rect width="${tableWidth}" height="${headerHeight}" class="table-header" />`;
		
		// Body background (no rounded corners)
		svg += `<rect y="${headerHeight}" width="${tableWidth}" height="${table.fields.length * fieldHeight}" class="table-body" />`;
		
		svg += `</g>`;
		
		// Outer border with rounded corners
		svg += `<rect width="${tableWidth}" height="${tableHeight}" class="table-border" rx="5" ry="5" fill="none" />`;
		
		// Header text
		const maxHeaderChars = 40;
		const safeTableNameDisplay = safeTableName.length > maxHeaderChars 
			? safeTableName.substring(0, maxHeaderChars - 1) + '…' 
			: safeTableName;
		svg += `<text x="${tableWidth / 2}" y="${headerHeight / 2 + 5}" class="table-name" text-anchor="middle" font-weight="bold" font-size="16">${safeTableNameDisplay}</text>`;
		
		// Fields
		table.fields.forEach((field, index) => {
			const fieldY = headerHeight + (index * fieldHeight);
			
			// Escape note for HTML attribute if present
			const escapedNote = field.note ? field.note.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;') : '';
			const hasNoteClass = field.note ? ' has-note' : '';
			const noteDataAttr = field.note ? ` data-note="${escapedNote}"` : '';
			
			// Field background (for hover effect)
			svg += `<rect y="${fieldY}" width="${tableWidth}" height="${fieldHeight}" class="field-row${hasNoteClass}" fill="transparent"${noteDataAttr} />`;
			
			// Field name
			const fieldLabelRaw = field.name;
			const maxNameChars = 30;
			const fieldLabelDisplay = fieldLabelRaw.length > maxNameChars 
				? fieldLabelRaw.substring(0, maxNameChars - 1) + '…' 
				: fieldLabelRaw;
			const fieldLabel = escapeXml(fieldLabelDisplay);
			let badges = '';
			
			if (field.unique) {
				badges += ' UQ';
			}
			if (field.notNull) {
				badges += ' NN';
			}
			
			svg += `<text x="10" y="${fieldY + 20}" class="field-name" font-size="13">${fieldLabel}</text>`;
			
			// Icons after field name
			const iconSize = 20;
			const iconY = fieldY + (fieldHeight - iconSize) / 2;
			// Fixed position for icons to normalize distance
			let iconX = 200;
			
			// PK icon if this field is a primary key
			if (field.pk) {
				const pkIconSize = 16; // 20% smaller than standard icon size
				const pkIconY = fieldY + (fieldHeight - pkIconSize) / 2;
				svg += `<svg x="${iconX}" y="${pkIconY}" width="${pkIconSize}" height="${pkIconSize}" viewBox="0 0 24 24" opacity="0.9">`;
				svg += `<path fill="currentColor" style="color: var(--vscode-symbolIcon-keyForeground, var(--vscode-charts-yellow, #F9DC5C));" fill-rule="evenodd" clip-rule="evenodd" d="M22.6767 1.33707C22.2865 0.946887 21.6539 0.946888 21.2637 1.33707L9.74788 12.8529C9.7071 12.8937 9.67058 12.9371 9.63833 12.9826C8.74832 12.3632 7.66658 12 6.5 12C3.46243 12 1 14.4624 1 17.5C1 20.5375 3.46243 23 6.5 23C9.53757 23 12 20.5375 12 17.5C12 16.3403 11.6411 15.2645 11.0283 14.3775C11.0749 14.3447 11.1192 14.3075 11.1609 14.2659L16.5062 8.92052L19.3096 11.7239C19.7001 12.1144 20.3333 12.1144 20.7238 11.7239C21.1143 11.3333 21.1143 10.7002 20.7238 10.3097L17.9205 7.5063L19.5062 5.92052L20.7764 7.19064C21.1669 7.58117 21.8001 7.58117 22.1906 7.19064C22.5811 6.80012 22.5811 6.16695 22.1906 5.77643L20.9205 4.5063L22.6767 2.75005C23.0669 2.35987 23.0669 1.72726 22.6767 1.33707ZM6.5 20.9791C4.57855 20.9791 3.02092 19.4214 3.02092 17.5C3.02092 15.5785 4.57855 14.0209 6.5 14.0209C8.42145 14.0209 9.97908 15.5785 9.97908 17.5C9.97908 19.4214 8.42145 20.9791 6.5 20.9791Z"/>`;
				svg += `</svg>`;
				iconX += pkIconSize + 2;
			}
			
			// FK icon if this field is a foreign key
			const fieldKey = `${table.name}.${field.name}`;
			if (foreignKeys.has(fieldKey)) {
				const fkIconSize = 16; // 20% smaller than standard icon size
				const fkIconY = fieldY + (fieldHeight - fkIconSize) / 2;
				svg += `<svg x="${iconX}" y="${fkIconY}" width="${fkIconSize}" height="${fkIconSize}" viewBox="0 0 24 24" opacity="0.9">`;
				svg += `<path fill="currentColor" style="color: var(--vscode-symbolIcon-referenceForeground, var(--vscode-charts-blue, #75BEFF));" d="M13.2218 3.32234C15.3697 1.17445 18.8521 1.17445 21 3.32234C23.1479 5.47022 23.1479 8.95263 21 11.1005L17.4645 14.636C15.3166 16.7839 11.8342 16.7839 9.6863 14.636C9.48752 14.4373 9.30713 14.2271 9.14514 14.0075C8.90318 13.6796 8.97098 13.2301 9.25914 12.9419C9.73221 12.4688 10.5662 12.6561 11.0245 13.1435C11.0494 13.1699 11.0747 13.196 11.1005 13.2218C12.4673 14.5887 14.6834 14.5887 16.0503 13.2218L19.5858 9.6863C20.9526 8.31947 20.9526 6.10339 19.5858 4.73655C18.219 3.36972 16.0029 3.36972 14.636 4.73655L13.5754 5.79721C13.1849 6.18774 12.5517 6.18774 12.1612 5.79721C11.7706 5.40669 11.7706 4.77352 12.1612 4.383L13.2218 3.32234Z"/>`;
				svg += `<path fill="currentColor" style="color: var(--vscode-symbolIcon-referenceForeground, var(--vscode-charts-blue, #75BEFF));" d="M6.85787 9.6863C8.90184 7.64233 12.2261 7.60094 14.3494 9.42268C14.7319 9.75083 14.7008 10.3287 14.3444 10.685C13.9253 11.1041 13.2317 11.0404 12.7416 10.707C11.398 9.79292 9.48593 9.88667 8.27209 11.1005L4.73655 14.636C3.36972 16.0029 3.36972 18.219 4.73655 19.5858C6.10339 20.9526 8.31947 20.9526 9.6863 19.5858L10.747 18.5251C11.1375 18.1346 11.7706 18.1346 12.1612 18.5251C12.5517 18.9157 12.5517 19.5488 12.1612 19.9394L11.1005 21C8.95263 23.1479 5.47022 23.1479 3.32234 21C1.17445 18.8521 1.17445 15.3697 3.32234 13.2218L6.85787 9.6863Z"/>`;
				svg += `</svg>`;
				iconX += fkIconSize + 2;
			}
			
			// Note icon if this field has a note
			if (field.note) {
				const noteIconSize = 16; // 20% smaller than standard icon size
				const noteIconY = fieldY + (fieldHeight - noteIconSize) / 2;
				const noteIconClass = `note-icon note-icon-${table.name}-${field.name}`;
				// Escape HTML characters in note
				const escapedNote = field.note.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
				svg += `<svg x="${iconX}" y="${noteIconY}" width="${noteIconSize}" height="${noteIconSize}" viewBox="0 0 24 24" opacity="0.8" class="${noteIconClass}" data-note="${escapedNote}" style="cursor: help;">`;
				svg += `<path fill="currentColor" style="color: var(--vscode-descriptionForeground, #999);" fill-rule="evenodd" clip-rule="evenodd" d="M6 1C4.34315 1 3 2.34315 3 4V20C3 21.6569 4.34315 23 6 23H18C19.6569 23 21 21.6569 21 20V8.82843C21 8.03278 20.6839 7.26972 20.1213 6.70711L15.2929 1.87868C14.7303 1.31607 13.9672 1 13.1716 1H6ZM5 4C5 3.44772 5.44772 3 6 3H12V8C12 9.10457 12.8954 10 14 10H19V20C19 20.5523 18.5523 21 18 21H6C5.44772 21 5 20.5523 5 20V4ZM18.5858 8L14 3.41421V8H18.5858Z"/>`;
				svg += `</svg>`;
			}
			
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
