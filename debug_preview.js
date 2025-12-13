const { Parser } = require('@dbml/core');
const fs = require('fs');

const dbmlContent = fs.readFileSync('repro_case.dbml', 'utf8');
const processedContent = dbmlContent.replace(/\]\s*\[/g, ', ');

function convertToSchema(database, metadataGroups, content) {
    const tables = [];
    const refs = [];
    const groups = [];
    const metadataLookup = new Map();
    metadataGroups.forEach(group => {
        metadataLookup.set(group.name, group);
    });

    // Extract tables
    if (database.schemas && database.schemas.length > 0) {
        const schema = database.schemas[0];

        if (schema.tables) {
            schema.tables.forEach((table) => {
                const fields = [];

                if (table.fields) {
                    table.fields.forEach((field) => {
                        const fieldText = content.substring(field.token.start.offset, field.token.end.offset);
                        const hasPk = fieldText.includes('[pk]');
                        const parsedField = {
                            name: field.name || '',
                            type: field.type?.type_name || 'unknown',
                            pk: hasPk || field.pk || false,
                            unique: field.unique || false,
                            notNull: field.not_null || false,
                            increment: field.increment || false,
                            note: field.note || undefined,
                            default: field.dbdefault ? {
                                type: field.dbdefault.type,
                                value: field.dbdefault.value
                            } : undefined
                        };
                        fields.push(parsedField);
                    });
                }

                let tableNote = table.note || undefined;
                let schemaName = 'public';

                if (tableNote) {
                    const schemaMatch = tableNote.match(/schema:\s*([a-zA-Z0-9_]+)/i);
                    if (schemaMatch) {
                        schemaName = schemaMatch[1];
                    }
                }

                tables.push({
                    name: table.name || '',
                    fields: fields,
                    note: tableNote,
                    schema: schemaName
                });
            });
        }

        // Extract references
        if (schema.refs) {
            schema.refs.forEach((ref) => {
                const endpoints = (ref.endpoints || []).map((ep) => ({
                    tableName: ep.tableName || '',
                    fieldNames: ep.fieldNames || [],
                    relation: ep.relation || '1'
                }));

                // Only add references with at least 2 valid endpoints
                if (endpoints.length >= 2 && endpoints[0].tableName && endpoints[1].tableName) {
                    const parsedRef = {
                        name: ref.name || undefined,
                        endpoints: endpoints,
                        onDelete: ref.onDelete || undefined,
                        onUpdate: ref.onUpdate || undefined
                    };
                    refs.push(parsedRef);
                }
            });
        }

        // Groups omitted for brevity as there are none in the input
    }
    return { tables, refs, groups };
}


try {
    const parsed = Parser.parse(processedContent, 'dbml');
    console.log('✅ DBML parsed successfully');

    const schema = convertToSchema(parsed, [], processedContent);
    console.log('✅ Schema converted successfully');
    console.log('Tables:', schema.tables.length);
    console.log('Refs:', schema.refs.length);
    console.log('Ref names:', schema.refs.map(r => r.name || 'unnamed'));
    console.log('Ref endpoints:', JSON.stringify(schema.refs.map(r => r.endpoints), null, 2));

    // Check field types
    const users = schema.tables.find(t => t.name === 'users');
    const roleField = users.fields.find(f => f.name === 'user_role');
    console.log('user_role type:', roleField.type);

    const idField = users.fields.find(f => f.name === 'user_id');
    console.log('user_id type:', idField.type);

    const createdAtField = users.fields.find(f => f.name === 'created_at');
    console.log('created_at default:', createdAtField.default);



    // Now emulate generateSvgFromSchema slightly to see if we hit any snags (like references not finding tables)
    // Check if all ref endpoints exist in tables
    schema.refs.forEach(ref => {
        ref.endpoints.forEach(ep => {
            const found = schema.tables.find(t => t.name === ep.tableName);
            if (!found) {
                console.error(`❌ Reference endpoint table not found: ${ep.tableName}`);
            } else {
                // console.log(`Method: Found table ${ep.tableName}`);
            }
        });
    });

} catch (error) {
    console.error('❌ Error:', error);
    if (error.diags) {
        console.error('Diagnostics:', JSON.stringify(error.diags, null, 2));
    }
}
