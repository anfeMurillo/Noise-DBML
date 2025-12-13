#!/usr/bin/env node

const { Parser } = require('@dbml/core');
const fs = require('fs');

const dbmlContent = fs.readFileSync('test-user-syntax.dbml', 'utf8');

// Preprocess to support multiple brackets
const processedContent = dbmlContent.replace(/\]\s*\[/g, ', ');
console.log('Original DBML:');
console.log(dbmlContent);
console.log('\nProcessed DBML:');
console.log(processedContent);

try {
  const parsed = Parser.parse(processedContent, 'dbml');
  console.log('✅ DBML parsed successfully');
  if (parsed && typeof parsed === 'object') {
    if (parsed.schemas) {
      const schema = parsed.schemas[0];
      for (const table of schema.tables) {
        if (table.name === 'needed_ingredients') {
          console.log('Table:', table.name);
          console.log('Fields:');
          for (const field of table.fields) {
            console.log('  ', field.name, field.type.type_name, {
              pk: field.pk,
              not_null: field.not_null,
              dbdefault: field.dbdefault,
              increment: field.increment,
              unique: field.unique
            });
          }
          break;
        }
      }
    }
  }
} catch (error) {
  console.error('❌ Error parsing DBML:', error);
}