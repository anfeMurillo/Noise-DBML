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
	}>;
	onDelete?: string;
	onUpdate?: string;
}

export interface ParsedSchema {
	tables: ParsedTable[];
	refs: ParsedRef[];
}

export function generateSvgFromSchema(schema: ParsedSchema): string {
	const tableWidth = 250;
	const fieldHeight = 30;
	const headerHeight = 40;
	const tableSpacing = 100;
	const tablesPerRow = 3;
	
	// Calculate positions for tables
	const tablePositions: Array<{table: ParsedTable, x: number, y: number}> = [];
	schema.tables.forEach((table, index) => {
		const row = Math.floor(index / tablesPerRow);
		const col = index % tablesPerRow;
		const x = col * (tableWidth + tableSpacing) + 50;
		const y = row * 350 + 50;
		tablePositions.push({ table, x, y });
	});

	// Calculate total SVG dimensions
	const rows = Math.ceil(schema.tables.length / tablesPerRow);
	const svgWidth = Math.min(tablesPerRow, schema.tables.length) * (tableWidth + tableSpacing) + 100;
	const svgHeight = rows * 350 + 100;

	let svg = `<svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">`;
	svg += '<defs>';
	svg += '<marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">';
	svg += '<path d="M0,0 L0,6 L9,3 z" class="relationship-arrow" />';
	svg += '</marker>';
	svg += '</defs>';

	// Draw relationships first (so they appear behind tables)
	schema.refs.forEach(ref => {
		if (ref.endpoints.length >= 2) {
			const fromEndpoint = ref.endpoints[0];
			const toEndpoint = ref.endpoints[1];
			
			const fromPos = tablePositions.find(p => p.table.name === fromEndpoint.tableName);
			const toPos = tablePositions.find(p => p.table.name === toEndpoint.tableName);
			
			if (fromPos && toPos) {
				const fromX = fromPos.x + tableWidth;
				const fromY = fromPos.y + headerHeight + 15;
				const toX = toPos.x;
				const toY = toPos.y + headerHeight + 15;
				
				svg += `<line x1="${fromX}" y1="${fromY}" x2="${toX}" y2="${toY}" class="relationship-line" marker-end="url(#arrow)" />`;
			}
		}
	});

	// Draw tables
	tablePositions.forEach(({ table, x, y }) => {
		const tableHeight = headerHeight + (table.fields.length * fieldHeight);
		
		// Table container
		svg += `<g class="table" transform="translate(${x}, ${y})">`;
		
		// Header
		svg += `<rect width="${tableWidth}" height="${headerHeight}" class="table-header" rx="4" ry="4" />`;
		svg += `<text x="${tableWidth / 2}" y="${headerHeight / 2 + 5}" class="table-name" text-anchor="middle" font-weight="bold" font-size="16">${table.name}</text>`;
		
		// Body background
		svg += `<rect y="${headerHeight}" width="${tableWidth}" height="${table.fields.length * fieldHeight}" class="table-body" rx="4" ry="4" />`;
		
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

	svg += '</svg>';
	return svg;
}
