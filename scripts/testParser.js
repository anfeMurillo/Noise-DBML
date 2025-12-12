const { Parser } = require('@dbml/core');

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
