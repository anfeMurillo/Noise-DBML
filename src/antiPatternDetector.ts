import { ParsedSchema, ParsedTable, ParsedField } from './svgGenerator';

export interface AntiPattern {
	type: 'warning' | 'error' | 'info';
	severity: 'high' | 'medium' | 'low';
	message: string;
	tableName?: string;
	fieldName?: string;
	description: string;
	recommendation: string;
}

export class AntiPatternDetector {
	private patterns: AntiPattern[] = [];

	detect(schema: ParsedSchema): AntiPattern[] {
		this.patterns = [];

		for (const table of schema.tables) {
			this.checkTableWithoutPrimaryKey(table);
			this.checkTooManyNullableFields(table);
			this.checkTooManyFields(table);
			this.checkEmptyTable(table);
			this.checkReservedNames(table);
			this.checkNamingConventions(table);
		}

		this.checkMissingIndexes(schema);
		this.checkCircularDependencies(schema);
		this.checkManyToManyWithoutJunctionTable(schema);

		return this.patterns;
	}

	private checkTableWithoutPrimaryKey(table: ParsedTable): void {
		const hasPrimaryKey = table.fields.some(field => field.pk);

		if (!hasPrimaryKey) {
			this.patterns.push({
				type: 'warning',
				severity: 'high',
				tableName: table.name,
				message: `Table "${table.name}" without primary key`,
				description: 'This table does not have a primary key defined, which makes it difficult to uniquely identify each record.',
				recommendation: 'Add a primary key (PK) to this table. Consider using an auto-increment "id" field or a UUID.'
			});
		}
	}

	private checkTooManyNullableFields(table: ParsedTable): void {
		const nullableFields = table.fields.filter(field => !field.notNull && !field.pk);
		const totalFields = table.fields.length;
		const nullablePercentage = (nullableFields.length / totalFields) * 100;

		// If more than 50% of fields are nullable (excluding PK)
		if (nullablePercentage > 50 && nullableFields.length > 3) {
			this.patterns.push({
				type: 'warning',
				severity: 'medium',
				tableName: table.name,
				message: `Table "${table.name}" has too many NULL fields`,
				description: `${nullableFields.length} of ${totalFields} fields (${nullablePercentage.toFixed(0)}%) allow NULL values. This may indicate poor normalization.`,
				recommendation: 'Review whether some fields can have default values or if the table should be split into multiple related tables.'
			});
		}
	}

	private checkTooManyFields(table: ParsedTable): void {
		const fieldCount = table.fields.length;

		// More than 20 fields may indicate design issues
		if (fieldCount > 20) {
			this.patterns.push({
				type: 'info',
				severity: 'low',
				tableName: table.name,
				message: `Table "${table.name}" has too many fields`,
				description: `This table has ${fieldCount} fields, which may indicate it is violating the single responsibility principle.`,
				recommendation: 'Consider splitting this table into multiple related tables to improve maintainability and normalization.'
			});
		}
	}

	private checkEmptyTable(table: ParsedTable): void {
		if (table.fields.length === 0) {
			this.patterns.push({
				type: 'error',
				severity: 'high',
				tableName: table.name,
				message: `Table "${table.name}" is empty`,
				description: 'This table has no fields defined.',
				recommendation: 'Define at least one column for this table or remove it if it is not needed.'
			});
		}
	}

	private checkReservedNames(table: ParsedTable): void {
		const reservedWords = [
			'user', 'order', 'group', 'index', 'table', 'database',
			'select', 'insert', 'update', 'delete', 'create', 'drop',
			'alter', 'grant', 'revoke', 'commit', 'rollback'
		];

		const tableNameLower = table.name.toLowerCase();
		if (reservedWords.includes(tableNameLower)) {
			this.patterns.push({
				type: 'warning',
				severity: 'medium',
				tableName: table.name,
				message: `Table "${table.name}" uses a SQL reserved word`,
				description: 'This table name may conflict with SQL reserved keywords.',
				recommendation: 'Rename the table or use quotes/backticks when referencing it in SQL.'
			});
		}

		// Check fields with reserved names
		for (const field of table.fields) {
			const fieldNameLower = field.name.toLowerCase();
			if (reservedWords.includes(fieldNameLower)) {
				this.patterns.push({
					type: 'warning',
					severity: 'low',
					tableName: table.name,
					fieldName: field.name,
					message: `Field "${field.name}" in table "${table.name}" uses a SQL reserved word`,
					description: 'This field uses a reserved word that may cause issues in SQL queries.',
					recommendation: 'Rename the field or use quotes/backticks when referencing it in SQL.'
				});
			}
		}
	}

	private checkNamingConventions(table: ParsedTable): void {
		// Check if table name follows basic conventions
		// - Should not start with numbers
		// - Should not contain spaces or special characters (except underscores)
		const tableNamePattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
		
		if (!tableNamePattern.test(table.name)) {
			this.patterns.push({
				type: 'info',
				severity: 'low',
				tableName: table.name,
				message: `Table "${table.name}" does not follow naming conventions`,
				description: 'The table name contains non-standard characters or format.',
				recommendation: 'Use names containing only letters, numbers and underscores, starting with a letter.'
			});
		}

		// Check if it has an ID field but is not marked as PK
		const idField = table.fields.find(f => 
			f.name.toLowerCase() === 'id' || 
			f.name.toLowerCase() === `${table.name.toLowerCase()}_id`
		);

		if (idField && !idField.pk) {
			this.patterns.push({
				type: 'warning',
				severity: 'medium',
				tableName: table.name,
				fieldName: idField.name,
				message: `Field "${idField.name}" in table "${table.name}" looks like an ID but is not PK`,
				description: 'This field has a name suggesting it is an identifier, but is not marked as a primary key.',
				recommendation: 'If this field is the unique identifier, mark it as [pk]. If not, consider renaming it to avoid confusion.'
			});
		}
	}

	private checkMissingIndexes(schema: ParsedSchema): void {
		// Check fields that are foreign keys but are not indexed
		for (const ref of schema.refs) {
			for (const endpoint of ref.endpoints) {
				const table = schema.tables.find(t => t.name === endpoint.tableName);
				if (!table) {
					continue;
				}

				for (const fieldName of endpoint.fieldNames) {
					const field = table.fields.find(f => f.name === fieldName);
					if (field && !field.pk && !field.unique) {
						// This is a FK field without explicit index
						this.patterns.push({
							type: 'info',
							severity: 'low',
							tableName: table.name,
							fieldName: field.name,
							message: `FK field "${field.name}" in table "${table.name}" might need an index`,
							description: 'Foreign keys benefit from indexes to improve JOIN performance.',
							recommendation: 'Consider adding an index to this field if it is frequently used in JOIN queries.'
						});
					}
				}
			}
		}
	}

	private checkCircularDependencies(schema: ParsedSchema): void {
		// Detect simple circular dependencies (A -> B -> A)
		const dependencies = new Map<string, Set<string>>();

		// Build dependency graph
		for (const ref of schema.refs) {
			if (ref.endpoints.length === 2) {
				const [from, to] = ref.endpoints;
				if (!dependencies.has(from.tableName)) {
					dependencies.set(from.tableName, new Set());
				}
				dependencies.get(from.tableName)!.add(to.tableName);
			}
		}

		// Detect simple cycles
		for (const [table, deps] of dependencies) {
			for (const dep of deps) {
				const depDeps = dependencies.get(dep);
				if (depDeps && depDeps.has(table)) {
					this.patterns.push({
						type: 'warning',
						severity: 'medium',
						message: `Circular dependency detected between "${table}" and "${dep}"`,
						description: 'These tables have mutual references, which can complicate insert and delete operations.',
						recommendation: 'Review whether one of the references should be nullable or if you need to restructure the relationships.'
					});
				}
			}
		}
	}

	private checkManyToManyWithoutJunctionTable(schema: ParsedSchema): void {
		// Esta es una verificación más heurística
		// Buscar patrones donde múltiples tablas referencian mutuamente
		const tableReferences = new Map<string, Set<string>>();

		for (const ref of schema.refs) {
			if (ref.endpoints.length === 2) {
				const [from, to] = ref.endpoints;
				
				if (!tableReferences.has(from.tableName)) {
					tableReferences.set(from.tableName, new Set());
				}
				tableReferences.get(from.tableName)!.add(to.tableName);
			}
		}

		// Look for tables with only PKs and FKs (possible junction tables)
		const junctionTables = new Set<string>();
		for (const table of schema.tables) {
			const pkCount = table.fields.filter(f => f.pk).length;
			const totalCount = table.fields.length;
			
			// If most fields are PKs or FKs, it's probably a junction table
			if (pkCount >= 2 && totalCount <= pkCount + 2) {
				junctionTables.add(table.name);
			}
		}

		// This check is informational
		if (junctionTables.size > 0) {
			this.patterns.push({
				type: 'info',
				severity: 'low',
				message: `${junctionTables.size} junction table(s) detected: ${Array.from(junctionTables).join(', ')}`,
				description: 'These tables appear to be junction tables for many-to-many relationships.',
				recommendation: 'Verify that these junction tables include appropriate constraints and indexes.'
			});
		}
	}

	// Method to generate a report in HTML or text format
	generateReport(patterns: AntiPattern[]): string {
		if (patterns.length === 0) {
			return 'No anti-patterns detected. The schema appears to be well designed!';
		}

		const errors = patterns.filter(p => p.type === 'error');
		const warnings = patterns.filter(p => p.type === 'warning');
		const infos = patterns.filter(p => p.type === 'info');

		let report = `Anti-Pattern Detection Report\n\n`;
		report += `Total issues detected: ${patterns.length}\n`;
		report += `- Errors: ${errors.length}\n`;
		report += `- Warnings: ${warnings.length}\n`;
		report += `- Information: ${infos.length}\n\n`;

		if (errors.length > 0) {
			report += `ERRORS:\n`;
			errors.forEach((p, i) => {
				report += `${i + 1}. ${p.message}\n   ${p.description}\n   Recommendation: ${p.recommendation}\n\n`;
			});
		}

		if (warnings.length > 0) {
			report += `WARNINGS:\n`;
			warnings.forEach((p, i) => {
				report += `${i + 1}. ${p.message}\n   ${p.description}\n   Recommendation: ${p.recommendation}\n\n`;
			});
		}

		if (infos.length > 0) {
			report += `INFORMATION:\n`;
			infos.forEach((p, i) => {
				report += `${i + 1}. ${p.message}\n   ${p.description}\n   Recommendation: ${p.recommendation}\n\n`;
			});
		}

		return report;
	}
}
