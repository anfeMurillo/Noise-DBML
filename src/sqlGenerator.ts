import { ParsedTable, ParsedField, ParsedRef, ParsedSchema } from './svgGenerator';

export interface SqlGenerationOptions {
    dialect?: 'postgresql' | 'mysql' | 'sqlite' | 'sqlserver';
    includeDropStatements?: boolean;
    includeIfNotExists?: boolean;
    indentSize?: number;
}

const DEFAULT_OPTIONS: Required<SqlGenerationOptions> = {
    dialect: 'postgresql',
    includeDropStatements: false,
    includeIfNotExists: true,
    indentSize: 2
};

export function generateSql(schema: ParsedSchema, options?: SqlGenerationOptions): string {
    const opts = { ...DEFAULT_OPTIONS, ...options };
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
        for (const table of reversedTables) {
            sqlStatements.push(generateDropTableStatement(table, opts));
        }
        sqlStatements.push('');
    }

    // Generate CREATE TABLE statements
    sqlStatements.push('-- Create tables');
    for (const table of schema.tables) {
        sqlStatements.push(generateCreateTableStatement(table, opts));
        sqlStatements.push('');
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

    return sqlStatements.join('\n');
}

function generateDropTableStatement(table: ParsedTable, opts: Required<SqlGenerationOptions>): string {
    const tableName = formatTableName(table, opts);
    
    switch (opts.dialect) {
        case 'mysql':
        case 'postgresql':
            return `DROP TABLE IF EXISTS ${tableName} CASCADE;`;
        case 'sqlite':
            return `DROP TABLE IF EXISTS ${tableName};`;
        case 'sqlserver':
            return `IF OBJECT_ID('${tableName}', 'U') IS NOT NULL DROP TABLE ${tableName};`;
        default:
            return `DROP TABLE IF EXISTS ${tableName};`;
    }
}

function generateCreateTableStatement(table: ParsedTable, opts: Required<SqlGenerationOptions>): string {
    const tableName = formatTableName(table, opts);
    const indent = ' '.repeat(opts.indentSize);
    const lines: string[] = [];

    // Start CREATE TABLE
    if (opts.includeIfNotExists && opts.dialect !== 'sqlserver') {
        lines.push(`CREATE TABLE IF NOT EXISTS ${tableName} (`);
    } else {
        lines.push(`CREATE TABLE ${tableName} (`);
    }

    // Add columns
    const columnDefinitions: string[] = [];
    const primaryKeys: string[] = [];

    for (const field of table.fields) {
        const columnDef = generateColumnDefinition(field, opts);
        columnDefinitions.push(`${indent}${columnDef}`);
        
        if (field.pk) {
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

function generateColumnDefinition(field: ParsedField, opts: Required<SqlGenerationOptions>): string {
    const parts: string[] = [];
    
    // Column name
    parts.push(formatIdentifier(field.name, opts));
    
    // Data type
    parts.push(mapDataType(field.type, opts.dialect));
    
    // Auto increment
    if (field.increment) {
        parts.push(getAutoIncrementKeyword(opts.dialect));
    }
    
    // NOT NULL
    if (field.notNull || field.pk) {
        parts.push('NOT NULL');
    }
    
    // UNIQUE
    if (field.unique && !field.pk) {
        parts.push('UNIQUE');
    }

    // DEFAULT
    if (field.default) {
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
            } else if (dialect === 'sqlserver') {
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
                case 'sqlserver':
                    // SQL Server uses extended properties
                    statements.push(`EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'${comment}', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'${table.name}';`);
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
                    case 'sqlserver':
                        statements.push(`EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'${comment}', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE', @level1name = N'${table.name}', @level2type = N'COLUMN', @level2name = N'${field.name}';`);
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
        case 'sqlserver':
            return `[${cleanName}]`;
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
        },
        sqlserver: {
            'int': 'INT',
            'integer': 'INT',
            'bigint': 'BIGINT',
            'smallint': 'SMALLINT',
            'tinyint': 'TINYINT',
            'decimal': 'DECIMAL',
            'numeric': 'NUMERIC',
            'float': 'FLOAT',
            'real': 'REAL',
            'varchar': 'VARCHAR',
            'char': 'CHAR',
            'text': 'NVARCHAR(MAX)',
            'boolean': 'BIT',
            'bool': 'BIT',
            'date': 'DATE',
            'time': 'TIME',
            'datetime': 'DATETIME2',
            'timestamp': 'DATETIME2',
            'uniqueidentifier': 'UNIQUEIDENTIFIER',
            'binary': 'VARBINARY'
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
        case 'sqlserver':
            return 'IDENTITY(1,1)';
        default:
            return 'AUTO_INCREMENT';
    }
}
