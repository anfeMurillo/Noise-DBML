#!/usr/bin/env node

const { Parser } = require('@dbml/core');
const fs = require('fs');

console.log('Testing DBML with Project configuration...\n');

const dbmlContent = fs.readFileSync('test_project_config.dbml', 'utf8');

console.log('DBML Content:');
console.log('='.repeat(60));
console.log(dbmlContent);
console.log('='.repeat(60));
console.log('\nParsing...\n');

try {
    const parsed = Parser.parse(dbmlContent, 'dbml');
    console.log('✅ DBML parsed successfully!');
    console.log('\nParsed structure:');
    console.log(JSON.stringify(parsed, null, 2));
} catch (error) {
    console.error('❌ Error parsing DBML:');
    console.error('Error message:', error.message);
    console.error('Error location:', error.location);
    console.error('\nFull error:', error);
}
