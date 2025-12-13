const { Parser } = require('@dbml/core');
const fs = require('fs');
const path = require('path');

const dbml = `
Project biblioteca {
  database_type: 'PostgreSQL'
  Note: '''
    # Sistema de Gestión de Biblioteca
    
    Este proyecto implementa una base de datos para gestionar:
    - Usuarios y membresías
  '''
}

Table users {
  id integer
  Note: 'Table note'
}
`;

try {
    const database = Parser.parse(dbml, 'dbml');
    console.log('Name:', database.name);
    console.log('Database Type:', database.databaseType);
    console.log('Note:', database.note);
} catch (e) {
    console.error(e);
}

// Leer archivo de prueba con múltiples corchetes
const testFile = path.join(__dirname, '../test-multibrackets.dbml');
const testDbml = fs.readFileSync(testFile, 'utf8');

console.log('\n--- MULTI-BRACKETS TEST ---');
try {
    const db = Parser.parse(testDbml, 'dbml');
    console.log('Tablas:', db.schemas[0].tables.map(t => t.name));
    db.schemas[0].tables.forEach(table => {
        console.log(`\nTable: ${table.name}`);
        table.columns.forEach(col => {
            console.log(`  ${col.name} ${col.type} [${col.settings.map(s => s.key + (s.value ? ': ' + s.value : '')).join(', ')}]`);
        });
    });
    console.log('\nParseo exitoso de múltiples corchetes.');
} catch (e) {
    console.error('Error al parsear múltiples corchetes:', e);
}
