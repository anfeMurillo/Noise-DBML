#!/usr/bin/env node

// Script para probar conexión PostgreSQL y generar DBML
// Uso: npx ts-node test-dbml-generation.js "tu-connection-string"

import { reversePostgres } from './src/dbmlReverseEngineer';

async function main() {
  const connectionString = process.argv[2];

  if (!connectionString) {
    console.log('Uso: npx ts-node test-dbml-generation.js "postgresql://usuario:contraseña@host:puerto/base_datos"');
    console.log('');
    console.log('Ejemplo:');
    console.log('npx ts-node test-dbml-generation.js "postgres://user:pass@host.com:5432/db?sslmode=require"');
    process.exit(1);
  }

  console.log('🔍 Probando conexión y generando DBML...\n');

  try {
    console.log('Connection string (ocultando password):', connectionString.replace(/:[^:]*@/, ':***@'));
    console.log('');

    const dbml = await reversePostgres(connectionString);

    console.log('✅ ¡Conexión exitosa y DBML generado!');
    console.log('\n' + '='.repeat(60));
    console.log('DBML OUTPUT:');
    console.log('='.repeat(60));
    console.log(dbml);
    console.log('='.repeat(60));

  } catch (error) {
    console.log('\n❌ ERROR:');
    if (error instanceof Error) {
      console.log('Tipo:', error.constructor.name);
      console.log('Mensaje:', error.message);

      if (error.message.includes('ECONNREFUSED')) {
        console.log('\n🔧 SOLUCIONES:');
        console.log('• Verifica que PostgreSQL esté ejecutándose');
        console.log('• Verifica el host y puerto');
        console.log('• Verifica que no haya firewall bloqueando');
      }

      if (error.message.includes('authentication failed')) {
        console.log('\n🔧 SOLUCIONES:');
        console.log('• Verifica usuario y contraseña');
        console.log('• Verifica permisos del usuario');
      }

      if (error.message.includes('does not exist')) {
        console.log('\n🔧 SOLUCIONES:');
        console.log('• Verifica que la base de datos exista');
      }
    } else {
      console.log('Tipo de error desconocido:', typeof error);
      console.log('Valor:', error);
    }
    process.exit(1);
  }
}

main();