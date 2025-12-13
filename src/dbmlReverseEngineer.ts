import { Client as PgClient } from 'pg';
import mysql from 'mysql2/promise';
import sqlite3 from 'sqlite3';

// @ts-ignore
const { Database } = require('@sqlitecloud/drivers');

export type SupportedDb = 'postgres' | 'mysql' | 'sqlite';

export interface ReverseEngineerOptions {
  type: SupportedDb;
  connectionString: string;
}

export async function reverseEngineerToDbml(options: ReverseEngineerOptions): Promise<string> {
  switch (options.type) {
    case 'postgres':
      return await reversePostgres(options.connectionString);
    case 'mysql':
      return await reverseMysql(options.connectionString);
    case 'sqlite':
      return await reverseSqlite(options.connectionString);

    default:
      throw new Error('Unsupported database type');
  }
}

// Type mapping functions
function mapPostgresType(pgType: string): string {
  const typeMap: { [key: string]: string } = {
    'integer': 'int',
    'bigint': 'bigint',
    'smallint': 'smallint',
    'serial': 'int',
    'bigserial': 'bigint',
    'real': 'float',
    'double precision': 'double',
    'numeric': 'decimal',
    'decimal': 'decimal',
    'character varying': 'varchar',
    'character': 'char',
    'text': 'text',
    'boolean': 'boolean',
    'date': 'date',
    'time': 'time',
    'timestamp': 'timestamp',
    'timestamp with time zone': 'timestamptz',
    'json': 'json',
    'jsonb': 'jsonb',
    'uuid': 'uuid',
    'bytea': 'bytea'
  };
  return typeMap[pgType.toLowerCase()] || pgType;
}

function mapMysqlType(mysqlType: string): string {
  // Extract base type from type string (e.g., "varchar(255)" -> "varchar")
  const baseType = mysqlType.split('(')[0].toLowerCase();
  const typeMap: { [key: string]: string } = {
    'int': 'int',
    'tinyint': 'tinyint',
    'smallint': 'smallint',
    'mediumint': 'mediumint',
    'bigint': 'bigint',
    'float': 'float',
    'double': 'double',
    'decimal': 'decimal',
    'varchar': 'varchar',
    'char': 'char',
    'text': 'text',
    'tinytext': 'tinytext',
    'mediumtext': 'mediumtext',
    'longtext': 'longtext',
    'boolean': 'boolean',
    'bool': 'boolean',
    'date': 'date',
    'datetime': 'datetime',
    'timestamp': 'timestamp',
    'time': 'time',
    'year': 'year',
    'json': 'json',
    'blob': 'blob',
    'tinyblob': 'tinyblob',
    'mediumblob': 'mediumblob',
    'longblob': 'longblob'
  };
  return typeMap[baseType] || mysqlType;
}

function mapSqliteType(sqliteType: string): string {
  const typeMap: { [key: string]: string } = {
    'integer': 'int',
    'real': 'float',
    'text': 'varchar',
    'blob': 'blob'
  };
  return typeMap[sqliteType.toLowerCase()] || sqliteType;
}



// --- PostgreSQL ---
function sanitizeDefaultValue(defaultValue: string): string | null {
  // Remove quotes if present
  let value = defaultValue.trim();
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
    value = value.slice(1, -1);
  }
  // Handle PostgreSQL casting like 'value'::type
  if (value.includes('::')) {
    value = value.split('::')[0];
  }
  // Skip complex expressions like now(), functions, etc.
  if (value.includes('(') || value.includes(')') || value.toLowerCase().includes('now') || value.toLowerCase().includes('current')) {
    return null; // Skip complex defaults
  }
  // For DBML, quote strings but not numbers or booleans
  if (isNaN(Number(value)) && value.toLowerCase() !== 'true' && value.toLowerCase() !== 'false') {
    // It's a string, quote it
    return `'${value.replace(/'/g, "\\'")}'`;
  } else {
    // Number or boolean, return as is
    return value;
  }
}

export async function reversePostgres(connStr: string): Promise<string> {
  console.log('Attempting to connect to PostgreSQL with connection string:', connStr.replace(/:[^:]*@/, ':***@')); // Log without password

  // Remove sslmode from connection string and handle SSL separately
  const cleanConnStr = connStr.replace(/[?&]sslmode=[^&]*/, '');
  console.log('Clean connection string:', cleanConnStr.replace(/:[^:]*@/, ':***@'));

  // Configure SSL for cloud databases
  const clientConfig: any = {
    connectionString: cleanConnStr
  };

  if (connStr.includes('sslmode=require') || connStr.includes('sslmode=prefer')) {
    clientConfig.ssl = {
      rejectUnauthorized: false,
      checkServerIdentity: () => undefined
    };
    console.log('SSL configured to accept self-signed certificates');
  }

  const client = new PgClient(clientConfig);
  try {
    console.log('Connecting to PostgreSQL...');
    await client.connect();
    console.log('Connected successfully to PostgreSQL');

    // Test the connection
    const testResult = await client.query('SELECT version()');
    console.log('PostgreSQL version:', testResult.rows[0].version);

    // Get all schemas that the user can access
    let schemasResult;
    try {
      schemasResult = await client.query(`
        SELECT schema_name
        FROM information_schema.schemata
        WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
        ORDER BY schema_name
      `);
      console.log('Available schemas:', schemasResult.rows.map(r => r.schema_name));
    } catch (schemaError: any) {
      console.error('Failed to get schemas:', schemaError);
      // If we can't get schemas, just try 'public'
      schemasResult = { rows: [{ schema_name: 'public' }] };
      console.log('Using default schema: public');
    }

    let dbml = '';
    let totalTables = 0;

    // Try different schemas if public doesn't have tables
    const schemasToTry = ['public', ...schemasResult.rows.map(r => r.schema_name).filter(s => s !== 'public')];

    for (const schemaName of schemasToTry) {
      console.log(`Checking schema: ${schemaName}`);

      // Get all tables from this schema
      const tablesResult = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = $1 AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `, [schemaName]);

      console.log(`Found ${tablesResult.rows.length} tables in schema ${schemaName}`);

      if (tablesResult.rows.length === 0) {
        continue; // Try next schema
      }

      for (const tableRow of tablesResult.rows) {
        const tableName = tableRow.table_name;
        totalTables++;

        dbml += `Table ${tableName} {\n`;

        // Get columns with constraints
        const columnsResult = await client.query(`
          SELECT
            c.column_name,
            c.data_type,
            c.is_nullable,
            c.column_default,
            CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key,
            CASE WHEN ai.column_name IS NOT NULL THEN true ELSE false END as is_auto_increment
          FROM information_schema.columns c
          LEFT JOIN (
            SELECT ku.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name
            WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = $1 AND tc.table_schema = $2
          ) pk ON c.column_name = pk.column_name
          LEFT JOIN (
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = $1 AND table_schema = $2 AND column_default LIKE 'nextval%'
          ) ai ON c.column_name = ai.column_name
          WHERE c.table_name = $1 AND c.table_schema = $2
          ORDER BY c.ordinal_position
        `, [tableName, schemaName]);

        console.log(`Table ${tableName} has ${columnsResult.rows.length} columns`);


        for (const col of columnsResult.rows) {
          let mappedType = mapPostgresType(col.data_type);
          let typeComment = '';
          // Si el tipo no es estándar, usar varchar y agregar comentario
          const standardTypes = [
            'int', 'bigint', 'smallint', 'float', 'double', 'decimal', 'varchar', 'char', 'text', 'boolean', 'date', 'time', 'timestamp', 'timestamptz', 'json', 'jsonb', 'uuid', 'bytea'
          ];
          if (!standardTypes.includes(mappedType)) {
            typeComment = ` // original type: ${col.data_type}`;
            mappedType = 'varchar';
          }
          let columnDef = `  ${col.column_name} ${mappedType}`;
          const settings: string[] = [];
          if (col.is_primary_key) {
            settings.push('pk');
          }
          if (col.is_auto_increment) {
            settings.push('increment');
          }
          if (col.is_nullable === 'NO') {
            settings.push('not null');
          }
          if (col.column_default && !col.is_auto_increment) {
            const sanitizedDefault = sanitizeDefaultValue(col.column_default);
            if (sanitizedDefault) {
              settings.push(`default: ${sanitizedDefault}`);
            }
          }
          if (settings.length > 0) {
            columnDef += ` [${settings.join(', ')}]`;
          }
          columnDef += typeComment;
          dbml += columnDef + '\n';
        }

        dbml += `}\n\n`;
      }

      // Get foreign key relationships for this schema
      const fkResult = await client.query(`
        SELECT
          tc.table_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          rc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1
        ORDER BY tc.table_name, kcu.column_name
      `, [schemaName]);

      console.log(`Found ${fkResult.rows.length} foreign key relationships in schema ${schemaName}`);

      for (const fk of fkResult.rows) {
        dbml += `Ref: ${fk.table_name}.${fk.column_name} > ${fk.foreign_table_name}.${fk.foreign_column_name}\n`;
      }

      // If we found tables, break out of schema loop
      if (totalTables > 0) {
        break;
      }
    }

    if (totalTables === 0) {
      throw new Error('No tables found in any accessible schema. Please check your database permissions and ensure tables exist.');
    }

    console.log(`Generated DBML with ${totalTables} tables`);
    return dbml.trim();

  } catch (error: any) {
    console.error('PostgreSQL reverse engineering error:', error);
    console.error('Error type:', typeof error);
    console.error('Error properties:', Object.keys(error));
    console.error('Error stack:', error.stack);

    // Extract meaningful error message
    let errorMessage = 'Unknown error';
    if (error && typeof error === 'object') {
      errorMessage = error.message || error.code || error.toString();
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    // Provide more specific error messages for common issues
    if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('getaddrinfo ENOTFOUND')) {
      errorMessage = 'Host not found. Please check the hostname in your connection string.';
    } else if (errorMessage.includes('ECONNREFUSED')) {
      errorMessage = 'Connection refused. Please check the host and port in your connection string.';
    } else if (errorMessage.includes('authentication failed') || errorMessage.includes('password authentication failed')) {
      errorMessage = 'Authentication failed. Please check your username and password.';
    } else if (errorMessage.includes('does not exist')) {
      errorMessage = 'Database does not exist. Please check the database name in your connection string.';
    } else if (errorMessage.includes('SSL')) {
      errorMessage = 'SSL connection error. Try adding ?sslmode=require to your connection string.';
    }

    throw new Error(`PostgreSQL connection failed: ${errorMessage}`);
  } finally {
    try {
      await client.end();
      console.log('PostgreSQL connection closed');
    } catch (closeError) {
      console.error('Error closing PostgreSQL connection:', closeError);
    }
  }
}

// --- MySQL ---
async function reverseMysql(connStr: string): Promise<string> {
  const conn = await mysql.createConnection(connStr);
  try {
    // Get all tables
    const [tables] = await conn.query(`SHOW TABLES`);
    let dbml = '';

    for (const row of tables as any[]) {
      const tableName = Object.values(row)[0] as string;

      dbml += `Table ${tableName} {\n`;

      // Get columns with primary key info
      const [columns] = await conn.query(`
        SELECT
          COLUMN_NAME,
          COLUMN_TYPE,
          IS_NULLABLE,
          COLUMN_DEFAULT,
          COLUMN_KEY,
          EXTRA
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = ? AND TABLE_SCHEMA = DATABASE()
        ORDER BY ORDINAL_POSITION
      `, [tableName]);

      for (const col of columns as any[]) {
        let columnDef = `  ${col.COLUMN_NAME} ${mapMysqlType(col.COLUMN_TYPE)}`;
        const attributes: string[] = [];

        if (col.COLUMN_KEY === 'PRI') { attributes.push('pk'); }
        if (col.EXTRA.includes('auto_increment')) { attributes.push('increment'); }
        if (col.IS_NULLABLE === 'NO') { attributes.push('not null'); }
        if (col.COLUMN_DEFAULT && !col.EXTRA.includes('auto_increment')) {
          const sanitized = sanitizeDefaultValue(col.COLUMN_DEFAULT);
          if (sanitized) {
            attributes.push(`default: ${sanitized}`);
          }
        }

        if (attributes.length > 0) {
          columnDef += ` [${attributes.join(', ')}]`;
        }

        dbml += columnDef + '\n';
      }

      dbml += `}\n\n`;
    }

    // Get foreign key relationships
    const [fks] = await conn.query(`
      SELECT
        TABLE_NAME,
        COLUMN_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY TABLE_NAME, COLUMN_NAME
    `);

    for (const fk of fks as any[]) {
      dbml += `Ref: ${fk.TABLE_NAME}.${fk.COLUMN_NAME} > ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}\n`;
    }

    return dbml.trim();
  } finally {
    await conn.end();
  }
}

// --- SQLite ---
async function reverseSqlite(connectionString: string): Promise<string> {
  let db: any;
  let isCloud = false;

  if (connectionString.startsWith('sqlitecloud://') || connectionString.startsWith('https://')) {
    isCloud = true;
    db = new Database(connectionString);
  } else {
    db = new sqlite3.Database(connectionString);
  }

  try {
    const all = async (sql: string, params: any[] = []) => {
      if (isCloud) {
        const result = await db.sql(sql);
        return result;
      } else {
        return new Promise<any[]>((resolve, reject) => {
          db.all(sql, params, (err: any, rows: any[]) => (err ? reject(err) : resolve(rows)));
        });
      }
    };

    const tables = await all(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`);
    let dbml = '';

    for (const row of tables) {
      const tableName = row.name || row.NAME;

      dbml += `Table ${tableName} {\n`;

      const columns = await all(`PRAGMA table_info("${tableName}")`);
      for (const col of columns) {
        let columnDef = `  ${col.name || col.NAME} ${mapSqliteType(col.type || col.TYPE)}`;
        const attributes: string[] = [];

        if (col.pk || col.PK) { attributes.push('pk'); }
        if (col.notnull || col.NOTNULL) { attributes.push('not null'); }
        if ((col.dflt_value !== null && col.dflt_value !== undefined) || (col.DFLT_VALUE !== null && col.DFLT_VALUE !== undefined)) {
          const dflt = col.dflt_value || col.DFLT_VALUE;
          const sanitized = sanitizeDefaultValue(dflt);
          if (sanitized) {
            attributes.push(`default: ${sanitized}`);
          }
        }

        if (attributes.length > 0) {
          columnDef += ` [${attributes.join(', ')}]`;
        }

        dbml += columnDef + '\n';
      }

      dbml += `}\n\n`;
    }

    // Get foreign key relationships
    for (const tableRow of tables) {
      const tableName = tableRow.name || tableRow.NAME;
      const fks = await all(`PRAGMA foreign_key_list("${tableName}")`);
      for (const fk of fks) {
        dbml += `Ref: ${tableName}.${fk.from || fk.FROM} > ${fk.table || fk.TABLE}.${fk.to || fk.TO}\n`;
      }
    }

    return dbml.trim();
  } finally {
    if (isCloud) {
      await db.close();
    } else {
      db.close();
    }
  }
}


