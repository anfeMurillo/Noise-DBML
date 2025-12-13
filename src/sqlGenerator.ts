import { ParsedTable, ParsedField, ParsedRef, ParsedSchema, ParsedIndex } from './svgGenerator';

export interface SqlGenerationOptions {
    dialect?: 'postgresql' | 'mysql' | 'sqlite';
    includeDropStatements?: boolean;
    includeIfNotExists?: boolean;
    indentSize?: number;
    separateBySchema?: boolean;
}

const DEFAULT_OPTIONS: Required<SqlGenerationOptions> = {
    dialect: 'postgresql',
    includeDropStatements: false,
    includeIfNotExists: true,
    indentSize: 2,
    separateBySchema: false
};

export function generateSql(schema: ParsedSchema, options?: SqlGenerationOptions): string | Map<string, string> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    if (opts.separateBySchema) {
        return generateSqlSeparatedBySchema(schema, opts);
    }

    return generateSqlCombined(schema, opts);
}

function generateSqlCombined(schema: ParsedSchema, opts: Required<SqlGenerationOptions>): string {
    const sqlStatements: string[] = [];

    // Header comment
    sqlStatements.push('-- Generated SQL from DBML');
    sqlStatements.push(`-- Dialect: ${opts.dialect}`);
    sqlStatements.push(`-- Generated at: ${new Date().toISOString()}`);
    sqlStatements.push('');

    // Generate DROP statements if requested
    if (opts.includeDropStatements) {
        sqlStatements.push('-- Drop tables');
        const reversedTables = [...schema.tables].reverse();
        const tablesBySchema = groupTablesBySchema(reversedTables);
        for (const [schemaName, tables] of tablesBySchema) {
            if (schemaName) {
                sqlStatements.push(`-- Schema: ${schemaName}`);
            }
            for (const table of tables) {
                sqlStatements.push(generateDropTableStatement(table, opts));
            }
        }
        sqlStatements.push('');
    }

    // Generate CREATE TABLE statements
    sqlStatements.push('-- Create tables');
    const tablesBySchema = groupTablesBySchema(schema.tables);
    for (const [schemaName, tables] of tablesBySchema) {
        if (schemaName) {
            sqlStatements.push(`-- Schema: ${schemaName}`);
        }
        for (const table of tables) {
            sqlStatements.push(generateCreateTableStatement(table, opts));
            sqlStatements.push('');
        }
    }

    // Generate foreign key constraints
    if (schema.refs && schema.refs.length > 0) {
        sqlStatements.push('-- Create foreign key constraints');
        for (const ref of schema.refs) {
            const fkStatements = generateForeignKeyStatements(ref, opts);
            if (fkStatements) {
                sqlStatements.push(fkStatements);
                sqlStatements.push('');
            }
        }
    }

    // Add table comments if supported
    if (opts.dialect !== 'sqlite') {
        const commentStatements = generateTableComments(schema.tables, opts);
        if (commentStatements) {
            sqlStatements.push('-- Add table and column comments');
            sqlStatements.push(commentStatements);
        }
    }

    // Generate indexes
    if (schema.indexes && schema.indexes.length > 0) {
        const indexStatements = generateIndexes(schema.indexes, opts);
        if (indexStatements) {
            sqlStatements.push('-- Create indexes');
            sqlStatements.push(indexStatements);
            sqlStatements.push('');
        }
    }

    return sqlStatements.join('\n');
}

function generateSqlSeparatedBySchema(schema: ParsedSchema, opts: Required<SqlGenerationOptions>): Map<string, string> {
    const files = new Map<string, string>();
    const tablesBySchema = groupTablesBySchema(schema.tables);

    // Generate a file for each schema
    for (const [schemaName, tables] of tablesBySchema) {
        const sqlStatements: string[] = [];

        // Header
        sqlStatements.push('-- Generated SQL from DBML');
        sqlStatements.push(`-- Dialect: ${opts.dialect}`);
        sqlStatements.push(`-- Schema: ${schemaName || 'default'}`);
        sqlStatements.push(`-- Generated at: ${new Date().toISOString()}`);
        sqlStatements.push('');

        // Generate DROP statements if requested
        if (opts.includeDropStatements) {
            sqlStatements.push('-- Drop tables');
            const reversedTables = tables.reverse();
            for (const table of reversedTables) {
                sqlStatements.push(generateDropTableStatement(table, opts));
            }
            sqlStatements.push('');
        }

        // Generate CREATE TABLE statements
        sqlStatements.push('-- Create tables');
        for (const table of tables) {
            sqlStatements.push(generateCreateTableStatement(table, opts));
            sqlStatements.push('');
        }

        // Add table comments if supported
        if (opts.dialect !== 'sqlite') {
            const commentStatements = generateTableComments(tables, opts);
            if (commentStatements) {
                sqlStatements.push('-- Add table and column comments');
                sqlStatements.push(commentStatements);
            }
        }

        const fileName = schemaName ? `schema_${schemaName}.sql` : 'schema_default.sql';
        files.set(fileName, sqlStatements.join('\n'));
    }

    // Generate global file for foreign keys and indexes
    const globalStatements: string[] = [];
    globalStatements.push('-- Generated SQL from DBML - Global constraints and indexes');
    globalStatements.push(`-- Dialect: ${opts.dialect}`);
    globalStatements.push(`-- Generated at: ${new Date().toISOString()}`);
    globalStatements.push('');

    // Foreign keys
    if (schema.refs && schema.refs.length > 0) {
        globalStatements.push('-- Create foreign key constraints');
        for (const ref of schema.refs) {
            const fkStatements = generateForeignKeyStatements(ref, opts);
            if (fkStatements) {
                globalStatements.push(fkStatements);
                globalStatements.push('');
            }
        }
    }

    // Indexes
    if (schema.indexes && schema.indexes.length > 0) {
        const indexStatements = generateIndexes(schema.indexes, opts);
        if (indexStatements) {
            globalStatements.push('-- Create indexes');
            globalStatements.push(indexStatements);
            globalStatements.push('');
        }
    }

    if (globalStatements.length > 4) { // More than just header
        files.set('global_constraints.sql', globalStatements.join('\n'));
    }

    return files;
}

function generateDropTableStatement(table: ParsedTable, opts: Required<SqlGenerationOptions>): string {
    const tableName = formatTableName(table, opts);

    switch (opts.dialect) {
        case 'mysql':
        case 'postgresql':
            return `DROP TABLE IF EXISTS ${tableName} CASCADE;`;
        case 'sqlite':
            return `DROP TABLE IF EXISTS ${tableName};`;
        default:
            return `DROP TABLE IF EXISTS ${tableName};`;
    }
}

function generateCreateTableStatement(table: ParsedTable, opts: Required<SqlGenerationOptions>): string {
    const tableName = formatTableName(table, opts);
    const indent = ' '.repeat(opts.indentSize);
    const lines: string[] = [];

    // Start CREATE TABLE
    if (opts.includeIfNotExists) {
        lines.push(`CREATE TABLE IF NOT EXISTS ${tableName} (`);
    } else {
        lines.push(`CREATE TABLE ${tableName} (`);
    }

    // Add columns
    const columnDefinitions: string[] = [];
    const primaryKeys: string[] = [];

    for (const field of table.fields) {
        // Special handling for SQLite Autoincrement
        // SQLite requires "INTEGER PRIMARY KEY AUTOINCREMENT" to be defined inline
        // and NOT in the table constraints
        let isSqliteAutoIncrement = false;
        if (opts.dialect === 'sqlite' && field.increment) {
            isSqliteAutoIncrement = true;
        }

        const columnDef = generateColumnDefinition(field, opts, isSqliteAutoIncrement);
        columnDefinitions.push(`${indent}${columnDef}`);

        // Add to primary keys list if it's a PK and NOT a SQLite autoincrement field
        // (because SQLite autoincrement fields already have PRIMARY KEY inline)
        if (field.pk && !isSqliteAutoIncrement) {
            primaryKeys.push(formatIdentifier(field.name, opts));
        }
    }

    // Add primary key constraint if any
    if (primaryKeys.length > 0) {
        const pkConstraint = `${indent}PRIMARY KEY (${primaryKeys.join(', ')})`;
        columnDefinitions.push(pkConstraint);
    }

    lines.push(columnDefinitions.join(',\n'));
    lines.push(');');

    return lines.join('\n');
}

function generateColumnDefinition(field: ParsedField, opts: Required<SqlGenerationOptions>, isSqliteAutoIncrement: boolean = false): string {
    const parts: string[] = [];

    // Column name
    parts.push(formatIdentifier(field.name, opts));

    // Data type
    // SQLite AutoIncrement MUST be INTEGER
    if (isSqliteAutoIncrement) {
        parts.push('INTEGER');
    } else {
        parts.push(mapDataType(field.type, opts.dialect));
    }

    // Auto increment & Primary Key for SQLite
    if (isSqliteAutoIncrement) {
        parts.push('PRIMARY KEY AUTOINCREMENT');
    } else {
        // Normal Auto increment for other DBs or non-sqlite
        if (field.increment) {
            parts.push(getAutoIncrementKeyword(opts.dialect));
        }
    }

    // NOT NULL
    // For SQLite AutoIncrement, it's implied. For others, add it.
    if (!isSqliteAutoIncrement && (field.notNull || field.pk)) {
        parts.push('NOT NULL');
    }

    // UNIQUE
    if (field.unique && !field.pk) {
        parts.push('UNIQUE');
    }

    // DEFAULT
    // SQLite AutoIncrement usually doesn't have default (it's auto-generated)
    if (!isSqliteAutoIncrement && field.default) {
        const defaultValue = formatDefaultValue(field.default, opts.dialect);
        if (defaultValue) {
            parts.push(`DEFAULT ${defaultValue}`);
        }
    }

    return parts.join(' ');
}

function formatDefaultValue(defaultInfo: { type: string; value: string }, dialect: string): string | null {
    const { type, value } = defaultInfo;

    switch (type.toLowerCase()) {
        case 'string':
        case 'varchar':
        case 'char':
            return `'${value.replace(/'/g, "''")}'`;
        case 'boolean':
            if (dialect === 'postgresql') {
                return value.toLowerCase() === 'true' ? 'TRUE' : 'FALSE';
            } else if (dialect === 'mysql') {
                return value.toLowerCase() === 'true' ? '1' : '0';
            } else {
                return value.toUpperCase();
            }
        case 'number':
        case 'int':
        case 'integer':
        case 'float':
        case 'decimal':
        case 'double':
            return value;
        case 'null':
            return 'NULL';
        default:
            // For complex defaults or unknown types, try to use the value as-is
            return value;
    }
}

function generateForeignKeyStatements(ref: ParsedRef, opts: Required<SqlGenerationOptions>): string | null {
    if (!ref.endpoints || ref.endpoints.length < 2) {
        return null;
    }

    const fromEndpoint = ref.endpoints[0];
    const toEndpoint = ref.endpoints[1];

    if (!fromEndpoint.tableName || !toEndpoint.tableName ||
        !fromEndpoint.fieldNames || !toEndpoint.fieldNames ||
        fromEndpoint.fieldNames.length === 0 || toEndpoint.fieldNames.length === 0) {
        return null;
    }

    const fromTable = formatIdentifier(fromEndpoint.tableName, opts);
    const toTable = formatIdentifier(toEndpoint.tableName, opts);
    const fromColumns = fromEndpoint.fieldNames.map(f => formatIdentifier(f, opts)).join(', ');
    const toColumns = toEndpoint.fieldNames.map(f => formatIdentifier(f, opts)).join(', ');

    const constraintName = ref.name ||
        `fk_${fromEndpoint.tableName}_${toEndpoint.tableName}`.toLowerCase();
    const formattedConstraintName = formatIdentifier(constraintName, opts);

    let statement = `ALTER TABLE ${fromTable}\n`;
    statement += `  ADD CONSTRAINT ${formattedConstraintName}\n`;
    statement += `  FOREIGN KEY (${fromColumns})\n`;
    statement += `  REFERENCES ${toTable} (${toColumns})`;

    if (ref.onDelete) {
        statement += `\n  ON DELETE ${ref.onDelete.toUpperCase()}`;
    }

    if (ref.onUpdate) {
        statement += `\n  ON UPDATE ${ref.onUpdate.toUpperCase()}`;
    }

    statement += ';';

    return statement;
}

function generateTableComments(tables: ParsedTable[], opts: Required<SqlGenerationOptions>): string | null {
    const statements: string[] = [];

    for (const table of tables) {
        const tableName = formatTableName(table, opts);

        // Table comment
        if (table.note) {
            const comment = table.note.replace(/'/g, "''");

            switch (opts.dialect) {
                case 'postgresql':
                    statements.push(`COMMENT ON TABLE ${tableName} IS '${comment}';`);
                    break;
                case 'mysql':
                    // MySQL handles comments in CREATE TABLE, but we can use ALTER
                    statements.push(`ALTER TABLE ${tableName} COMMENT = '${comment}';`);
                    break;
            }
        }

        // Column comments
        for (const field of table.fields) {
            if (field.note) {
                const comment = field.note.replace(/'/g, "''");
                const columnName = formatIdentifier(field.name, opts);

                switch (opts.dialect) {
                    case 'postgresql':
                        statements.push(`COMMENT ON COLUMN ${tableName}.${columnName} IS '${comment}';`);
                        break;
                    case 'mysql':
                        // MySQL requires ALTER TABLE MODIFY
                        const columnDef = generateColumnDefinition(field, opts);
                        statements.push(`ALTER TABLE ${tableName} MODIFY COLUMN ${columnDef} COMMENT '${comment}';`);
                        break;
                }
            }
        }
    }

    return statements.length > 0 ? statements.join('\n') : null;
}

function formatTableName(table: ParsedTable, opts: Required<SqlGenerationOptions>): string {
    if (table.schema && opts.dialect !== 'sqlite') {
        return `${formatIdentifier(table.schema, opts)}.${formatIdentifier(table.name, opts)}`;
    }
    return formatIdentifier(table.name, opts);
}

function formatIdentifier(name: string, opts: Required<SqlGenerationOptions>): string {
    // Remove existing quotes/backticks
    const cleanName = name.replace(/^["'`\[]|["'`\]]$/g, '');

    switch (opts.dialect) {
        case 'mysql':
            return `\`${cleanName}\``;
        case 'postgresql':
        case 'sqlite':
            return `"${cleanName}"`;
        default:
            return `"${cleanName}"`;
    }
}

function mapDataType(dbmlType: string, dialect: string): string {
    const type = dbmlType.toLowerCase().trim();

    // Common type mappings
    const typeMap: Record<string, Record<string, string>> = {
        postgresql: {
            'int': 'INTEGER',
            'integer': 'INTEGER',
            'bigint': 'BIGINT',
            'smallint': 'SMALLINT',
            'decimal': 'DECIMAL',
            'numeric': 'NUMERIC',
            'real': 'REAL',
            'double': 'DOUBLE PRECISION',
            'float': 'DOUBLE PRECISION',
            'serial': 'SERIAL',
            'bigserial': 'BIGSERIAL',
            'varchar': 'VARCHAR',
            'char': 'CHAR',
            'text': 'TEXT',
            'boolean': 'BOOLEAN',
            'bool': 'BOOLEAN',
            'date': 'DATE',
            'time': 'TIME',
            'timestamp': 'TIMESTAMP',
            'timestamptz': 'TIMESTAMPTZ',
            'json': 'JSON',
            'jsonb': 'JSONB',
            'uuid': 'UUID',
            'bytea': 'BYTEA'
        },
        mysql: {
            'int': 'INT',
            'integer': 'INT',
            'bigint': 'BIGINT',
            'smallint': 'SMALLINT',
            'tinyint': 'TINYINT',
            'decimal': 'DECIMAL',
            'numeric': 'DECIMAL',
            'float': 'FLOAT',
            'double': 'DOUBLE',
            'varchar': 'VARCHAR',
            'char': 'CHAR',
            'text': 'TEXT',
            'boolean': 'TINYINT(1)',
            'bool': 'TINYINT(1)',
            'date': 'DATE',
            'time': 'TIME',
            'datetime': 'DATETIME',
            'timestamp': 'TIMESTAMP',
            'json': 'JSON',
            'blob': 'BLOB'
        },
        sqlite: {
            'int': 'INTEGER',
            'integer': 'INTEGER',
            'bigint': 'INTEGER',
            'smallint': 'INTEGER',
            'decimal': 'REAL',
            'numeric': 'REAL',
            'float': 'REAL',
            'double': 'REAL',
            'varchar': 'TEXT',
            'char': 'TEXT',
            'text': 'TEXT',
            'boolean': 'INTEGER',
            'bool': 'INTEGER',
            'date': 'TEXT',
            'time': 'TEXT',
            'datetime': 'TEXT',
            'timestamp': 'TEXT',
            'blob': 'BLOB'
        }
    };

    const dialectMap = typeMap[dialect] || typeMap.postgresql;

    // Check if type has parameters (e.g., varchar(255))
    const match = type.match(/^(\w+)(\(.*\))?$/);
    if (match) {
        const baseType = match[1];
        const params = match[2] || '';
        const mappedType = dialectMap[baseType];

        if (mappedType) {
            // For types that don't support parameters in the target dialect
            if (params && (mappedType === 'TEXT' || mappedType === 'INTEGER' || mappedType === 'REAL')) {
                return mappedType;
            }
            return mappedType + params;
        }
    }

    // Return as-is if no mapping found (might be a custom type)
    return dbmlType.toUpperCase();
}

function getAutoIncrementKeyword(dialect: string): string {
    switch (dialect) {
        case 'postgresql':
            return 'GENERATED ALWAYS AS IDENTITY';
        case 'mysql':
            return 'AUTO_INCREMENT';
        case 'sqlite':
            return 'AUTOINCREMENT';
        default:
            return 'AUTO_INCREMENT';
    }
}

function generateIndexes(indexes: ParsedIndex[], opts: Required<SqlGenerationOptions>): string | null {
    if (indexes.length === 0) {
        return null;
    }

    const statements: string[] = [];

    for (const index of indexes) {
        const indexName = formatIdentifier(index.name, opts);
        const tableName = formatIdentifier(index.tableName, opts);
        const columns = index.columns;

        let statement = `CREATE INDEX ${indexName} ON ${tableName} (${columns});`;

        if (opts.includeIfNotExists) {
            // Postgres and SQLite support IF NOT EXISTS for indexes
            // MySQL 8.0+ also supports it
            if (opts.dialect === 'postgresql' || opts.dialect === 'sqlite') {
                statement = `CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columns});`;
            }
        }

        statements.push(statement);
    }

    return statements.join('\n');
}

function groupTablesBySchema(tables: ParsedTable[]): Map<string | undefined, ParsedTable[]> {
    const groups = new Map<string | undefined, ParsedTable[]>();
    for (const table of tables) {
        const schema = table.schema;
        if (!groups.has(schema)) {
            groups.set(schema, []);
        }
        groups.get(schema)!.push(table);
    }
    return groups;
}
