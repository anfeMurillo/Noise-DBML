const { reverseEngineerToDbml } = require('./src/dbmlReverseEngineer.ts');

async function testReversePostgres() {
  // Test connection string - replace with your actual connection string
  const connStr = process.argv[2] || 'postgresql://test:test@localhost:5432/test';

  try {
    console.log('Testing reverseEngineerToDbml function with PostgreSQL...');
    const dbml = await reverseEngineerToDbml({
      type: 'postgres',
      connectionString: connStr
    });
    console.log('Success! Generated DBML:');
    console.log(dbml);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testReversePostgres();