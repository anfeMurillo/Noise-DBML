const { Client } = require('pg');
// const { reversePostgres } = require('./src/dbmlReverseEngineer.ts');

// Script para probar la conexión a PostgreSQL con diagnóstico detallado
// Ejecutar con: node test-postgres-connection.js "tu-connection-string-aqui"
// Para generar DBML: node test-postgres-connection.js "tu-connection-string-aqui" --generate-dbml

async function testPostgresConnection(connectionString, generateDbml = false) {
  console.log('🔍 Probando conexión a PostgreSQL...\n');

  // Remove sslmode from connection string and handle SSL separately
  const cleanConnectionString = connectionString.replace(/[?&]sslmode=[^&]*/, '');
  console.log('Connection string (ocultando password):', cleanConnectionString.replace(/:[^:]*@/, ':***@'));
  console.log('');

  // Configure SSL for cloud databases (same logic as reversePostgres)
  const clientConfig = {
    connectionString: cleanConnectionString
  };

  if (connectionString.includes('sslmode=require') || connectionString.includes('sslmode=prefer')) {
    clientConfig.ssl = {
      rejectUnauthorized: false,
      checkServerIdentity: () => undefined
    };
    console.log('🔒 SSL configurado para aceptar certificados auto-firmados\n');
  } else {
    console.log('🔒 SSL no configurado (usar ?sslmode=require para bases de datos cloud)\n');
  }

  const client = new Client(clientConfig);

  try {
    console.log('1. Intentando conectar...');
    await client.connect();
    console.log('✅ Conexión exitosa a PostgreSQL');

    console.log('\n2. Probando consulta básica...');
    const versionResult = await client.query('SELECT version()');
    console.log('✅ Consulta exitosa');
    console.log('Versión de PostgreSQL:', versionResult.rows[0].version);

    console.log('\n3. Verificando permisos de information_schema...');
    const schemasResult = await client.query(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
      ORDER BY schema_name
    `);
    console.log('✅ Acceso a information_schema exitoso');
    console.log('Esquemas disponibles:', schemasResult.rows.map(r => r.schema_name));

    console.log('\n4. Buscando tablas en esquemas...');
    let totalTables = 0;
    for (const schemaRow of schemasResult.rows) {
      const schemaName = schemaRow.schema_name;
      try {
        const tablesResult = await client.query(`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = $1 AND table_type = 'BASE TABLE'
          ORDER BY table_name
        `, [schemaName]);

        const count = tablesResult.rows.length;
        if (count > 0) {
          console.log(`✅ Esquema '${schemaName}': ${count} tablas`);
          console.log('   Primeras 3:', tablesResult.rows.slice(0, 3).map(r => r.table_name));
          totalTables += count;
        }
      } catch (schemaError) {
        console.log(`❌ Error en esquema '${schemaName}':`, schemaError.message);
      }
    }

    if (totalTables === 0) {
      console.log('\n⚠️  ADVERTENCIA: No se encontraron tablas en ningún esquema');
      console.log('   Esto podría indicar:');
      console.log('   - La base de datos está vacía');
      console.log('   - El usuario no tiene permisos para ver las tablas');
      console.log('   - Las tablas están en un esquema no accesible');
    } else {
      console.log(`\n✅ Total de tablas encontradas: ${totalTables}`);
    }

    // Si se solicita generar DBML, hacerlo ahora
    if (generateDbml) {
      console.log('\n📄 Generando DBML...');
      console.log('⚠️  Funcionalidad DBML no disponible en este script');
      console.log('   Usa la extensión VS Code para generar DBML');
      /*
      try {
        const dbml = await reversePostgres(connectionString);
        console.log('✅ DBML generado exitosamente!');
        console.log('\n' + '='.repeat(50));
        console.log('DBML OUTPUT:');
        console.log('='.repeat(50));
        console.log(dbml);
        console.log('='.repeat(50));
      } catch (dbmlError) {
        console.log('\n❌ Error al generar DBML:', dbmlError.message);
      }
      */
    }

    console.log('\n🎉 ¡La conexión funciona correctamente!');
    console.log('Puedes usar esta connection string en la extensión DBML.');

  } catch (error) {
    console.log('\n❌ ERROR DE CONEXIÓN:');
    console.log('Tipo de error:', error.constructor.name);
    console.log('Mensaje:', error.message);

    if (error.code) {
      console.log('Código de error:', error.code);
    }

    console.log('\n🔧 POSIBLES SOLUCIONES:');

    if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo ENOTFOUND')) {
      console.log('• Verifica que el hostname sea correcto');
      console.log('• Si es una IP, asegúrate de que esté bien escrita');
      console.log('• Si es un dominio, verifica que resuelva correctamente');
    }

    if (error.message.includes('ECONNREFUSED')) {
      console.log('• Verifica que PostgreSQL esté ejecutándose');
      console.log('• Verifica que el puerto sea correcto (por defecto 5432)');
      console.log('• Verifica que no haya firewall bloqueando la conexión');
    }

    if (error.message.includes('authentication failed') || error.message.includes('password')) {
      console.log('• Verifica el nombre de usuario');
      console.log('• Verifica la contraseña');
      console.log('• Verifica que el usuario tenga permisos para conectarse');
    }

    if (error.message.includes('does not exist')) {
      console.log('• Verifica que el nombre de la base de datos sea correcto');
      console.log('• Verifica que la base de datos exista');
    }

    if (error.message.includes('SSL')) {
      console.log('• Para bases de datos cloud, intenta agregar ?sslmode=require');
      console.log('• Ejemplo: postgresql://user:pass@host:5432/db?sslmode=require');
    }

    if (error.message.includes('self-signed certificate') || error.code === 'SELF_SIGNED_CERT_IN_CHAIN') {
      console.log('• CERTIFICADO AUTO-FIRMADO detectado');
      console.log('• El script ya maneja esto automáticamente');
      console.log('• Si usas la extensión, debería funcionar ahora');
    }

    console.log('\n📝 FORMATOS DE CONNECTION STRING VÁLIDOS:');
    console.log('• postgresql://usuario:contraseña@host:puerto/base_datos');
    console.log('• postgres://usuario:contraseña@host:puerto/base_datos');
    console.log('• Para SSL: agrega ?sslmode=require al final');

  } finally {
    try {
      await client.end();
      console.log('\n🔌 Conexión cerrada');
    } catch (closeError) {
      console.log('Error al cerrar conexión:', closeError.message);
    }
  }
}

// Obtener connection string de argumentos de línea de comandos
const connectionString = process.argv[2];
const generateDbml = process.argv.includes('--generate-dbml');

if (!connectionString) {
  console.log('Uso: node test-postgres-connection.js "postgresql://usuario:contraseña@host:puerto/base_datos"');
  console.log('     node test-postgres-connection.js "postgresql://usuario:contraseña@host:puerto/base_datos" --generate-dbml');
  console.log('');
  console.log('Ejemplos:');
  console.log('node test-postgres-connection.js "postgresql://myuser:mypass@localhost:5432/mydb"');
  console.log('node test-postgres-connection.js "postgres://user:pass@myhost.com:5432/dbname?sslmode=require"');
  console.log('node test-postgres-connection.js "postgres://user:pass@myhost.com:5432/dbname?sslmode=require" --generate-dbml');
  process.exit(1);
}

testPostgresConnection(connectionString, generateDbml);