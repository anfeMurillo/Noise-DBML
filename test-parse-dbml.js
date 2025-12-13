#!/usr/bin/env node

const { Parser } = require('@dbml/core');
const fs = require('fs');

const dbmlContent = fs.readFileSync('test-user-dbml.dbml', 'utf8');

try {
  const parsed = Parser.parse(dbmlContent, 'dbml');
  console.log('✅ DBML parsed successfully');
  console.log('Parsed:', typeof parsed, parsed);
  if (parsed && typeof parsed === 'object') {
    console.log('Keys:', Object.keys(parsed));
    if (parsed.schemas) {
      console.log('Schemas:', parsed.schemas.length);
    }
    if (parsed.tables) {
      console.log('Tables:', parsed.tables.length);
    }
  }
} catch (error) {
  console.error('❌ Error parsing DBML:', error);
}