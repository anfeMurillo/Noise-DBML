const { reverseEngineerToDbml } = require('./dist/dbmlReverseEngineer.js');

async function testReverseSqlite() {
  // Test with a SQLite file path
  const filePath = process.argv[2] || 'test.db';

  try {
    console.log('Testing reverseEngineerToDbml function with SQLite...');
    const dbml = await reverseEngineerToDbml({
      type: 'sqlite',
      connectionString: filePath
    });
    console.log('Success! Generated DBML:');
    console.log(dbml);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testReverseSqlite();