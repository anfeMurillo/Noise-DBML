const { dbmlParser } = require('./out/src/core/DbmlParser');
const fs = require('fs');
const path = require('path');

async function runTest() {
    console.log('Testing Project configuration support...');

    // Read the test file
    const dbmlContent = fs.readFileSync('test_project_config.dbml', 'utf8');

    try {
        console.log('Parsing DBML with DbmlParser...');
        // Use the extension's parser which has the fix
        const result = await dbmlParser.parse(dbmlContent);

        console.log('\n✅ Success! DBML parsed correctly.');

        if (result.project) {
            console.log('\nProject Metadata extracted:');
            console.log(JSON.stringify(result.project, null, 2));

            if (result.project.database_type === 'PostgreSQL' && result.project.note) {
                console.log('✅ Project metadata is correct.');
            } else {
                console.error('❌ Project metadata mismatch.');
            }
        } else {
            console.error('❌ Project metadata NOT extracted.');
        }

        console.log(`\nFound ${result.schema.tables.length} tables.`);
        console.log(`Found ${result.indexes.length} indexes.`);

    } catch (error) {
        console.error('❌ Parsing failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

runTest();
