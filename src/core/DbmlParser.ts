
import { DbmlParseResult, DbmlParserOptions, ProjectMetadata, ParsedSchema } from '../types';
import { ParsedIndex } from '../svgGenerator';
import { Parser } from '@dbml/core';
import { logger } from '../utils/Logger';
import { CacheManager } from '../utils/CacheManager';
import { ErrorHandler, DbmlParseError } from '../utils/ErrorHandler';

const STANDALONE_INDEX_REGEX = /Index\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{\s*on\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\s*\[(.*?)\]/g;
const PROJECT_BLOCK_REGEX = /Project\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([^}]*)\}/g;

export class DbmlParser {
    private static instance: DbmlParser;
    private cache: CacheManager<DbmlParseResult>;

    private constructor() {
        // Cache de 5 minutos, máximo 50 schemas
        this.cache = new CacheManager<DbmlParseResult>({
            ttl: 5 * 60 * 1000,
            maxSize: 50
        });
    }

    public static getInstance(): DbmlParser {
        if (!DbmlParser.instance) {
            DbmlParser.instance = new DbmlParser();
        }
        return DbmlParser.instance;
    }

    /**
     * Parsea contenido DBML y retorna el schema estructurado
     */
    async parse(content: string, options: DbmlParserOptions = {}): Promise<DbmlParseResult> {
        const startTime = Date.now();
        const cacheKey = this.generateCacheKey(content);

        // Verificar caché
        if (!options.force && this.cache.has(cacheKey)) {
            logger.debug('Parser: usando resultado en caché', 'DbmlParser');
            return this.cache.get(cacheKey)!;
        }

        try {
            logger.info('Parser: parseando contenido DBML', 'DbmlParser', {
                contentLength: content.length
            });

            // Preprocesamiento: Extraer índices standalone
            const { indexes, sanitizedContent: contentWithoutIndexes } = this.extractStandaloneIndexes(content);

            // Preprocesamiento: Extraer bloque Project
            const { project: projectMetadata, sanitizedContent: contentToParse } = this.extractProjectBlock(contentWithoutIndexes);

            // Parsear con @dbml/core (con reintentos para recuperación de errores)
            let database: any;
            let currentContent = contentToParse;
            let attempts = 0;
            const MAX_ATTEMPTS = 5;

            while (true) {
                try {
                    // @ts-ignore - El tipo de Parser.parse no está bien definido en @dbml/core
                    database = Parser.parse(currentContent, 'dbml');
                    break;
                } catch (parseError: any) {
                    attempts++;

                    // Extraer ubicación del error (puede estar en .location o en .diags[0].location)
                    let errorLocation = parseError.location;
                    if (!errorLocation && parseError.diags && Array.isArray(parseError.diags) && parseError.diags.length > 0) {
                        errorLocation = parseError.diags[0].location;
                    }

                    // Si excedimos intentos o no hay ubicación del error, fallar
                    if (attempts >= MAX_ATTEMPTS || !errorLocation) {
                        throw ErrorHandler.fromDbmlParseError(parseError);
                    }

                    // Intentar reparar el contenido
                    // Construimos un objeto de error temporal con la ubicación correcta para tryFixParseError
                    const fixedContent = this.tryFixParseError(currentContent, { location: errorLocation });

                    // Si no se pudo reparar o el contenido no cambió, fallar
                    if (!fixedContent || fixedContent === currentContent) {
                        throw ErrorHandler.fromDbmlParseError(parseError);
                    }

                    // Reintentar con contenido reparado
                    currentContent = fixedContent;
                    logger.warn(`Parser: intentando recuperar error de sintaxis en línea ${errorLocation.start.line}`, 'DbmlParser');
                }
            }

            // Convertir a ParsedSchema
            const schema = this.convertToSchema(database, indexes);

            // Validar si es necesario
            if (options.validateSchema) {
                this.validateSchema(schema);
            }

            const result: DbmlParseResult = {
                schema,
                indexes,
                project: projectMetadata,
                rawDatabase: database
            };

            // Guardar en caché
            this.cache.set(cacheKey, result);

            const elapsed = Date.now() - startTime;
            logger.info(`Parser: completado en ${elapsed}ms`, 'DbmlParser', {
                tables: schema.tables.length,
                refs: schema.refs.length,
                indexes: indexes.length
            });

            return result;

        } catch (error) {
            const normalized = ErrorHandler.normalize(error);
            logger.error('Parser: error parseando DBML', 'DbmlParser', {
                error: normalized.message
            });
            throw error;
        }
    }

    /**
     * Extrae índices standalone del contenido DBML
     */
    private extractStandaloneIndexes(content: string): {
        indexes: ParsedIndex[];
        sanitizedContent: string;
    } {
        const indexes: ParsedIndex[] = [];

        // Reemplazar índices con líneas vacías (preservar números de línea)
        const sanitizedContent = content.replace(
            STANDALONE_INDEX_REGEX,
            (match, name, tableName, columns) => {
                indexes.push({
                    name,
                    tableName,
                    columns: columns.trim(),
                    unique: match.toLowerCase().includes('[unique]')
                });

                // Reemplazar con misma cantidad de newlines
                return '\n'.repeat(match.split('\n').length - 1);
            }
        );

        return { indexes, sanitizedContent };
    }

    /**
     * Extrae bloque Project del contenido DBML
     */
    private extractProjectBlock(content: string): {
        project?: any;
        sanitizedContent: string;
    } {
        let project: any = undefined;

        // Reemplazar bloque Project con líneas vacías (preservar números de línea)
        const sanitizedContent = content.replace(
            PROJECT_BLOCK_REGEX,
            (match, projectName, properties) => {
                // Parsear propiedades del proyecto
                project = { name: projectName.trim() };

                // Extraer propiedades del bloque
                const propLines = properties.split('\n');
                for (const line of propLines) {
                    const propMatch = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)\s*$/);
                    if (propMatch) {
                        const [, key, value] = propMatch;
                        // Remover comillas simples o dobles del valor
                        const cleanValue = value.trim().replace(/^['"]|['"]$/g, '');
                        project[key.trim()] = cleanValue;
                    }
                }

                // Reemplazar con misma cantidad de newlines
                return '\n'.repeat(match.split('\n').length - 1);
            }
        );

        return { project, sanitizedContent };
    }

    /**
     * Intenta reparar errores de sintaxis conocidos en una línea específica
     */
    private tryFixParseError(content: string, error: any): string | null {
        try {
            const lineNum = error.location.start.line;
            const lines = content.split('\n');
            const index = lineNum - 1;

            if (index < 0 || index >= lines.length) { return null; }

            let line = lines[index];
            const originalLine = line;

            // Fix 1: Check constraints (unsupported by @dbml/core)
            if (line.includes('check:')) {
                // Remover 'check: value' dentro de brackets, manejando comas
                line = line.replace(/,\s*check\s*:\s*[^,\]]+/gi, '');
                line = line.replace(/check\s*:\s*[^,\]]+\s*,?/gi, '');
            }

            // Fix 2: Backticks in default values (unsupported syntax default: `now()`)
            // Convert to string: default: `now()` -> default: 'now()'
            if (line.includes('default:') && line.includes('`')) {
                line = line.replace(/default:\s*`([^`]+)`/g, "default: '$1'");
            }

            // Fix 3: Empty brackets cleanup []
            line = line.replace(/\[\s*\]/g, '');

            if (line === originalLine) { return null; }

            lines[index] = line;
            return lines.join('\n');

        } catch (e) {
            return null;
        }
    }

    /**
     * Convierte el resultado del parser @dbml/core a ParsedSchema
     */
    private convertToSchema(database: any, standaloneIndexes: ParsedIndex[]): ParsedSchema {
        const schema: ParsedSchema = {
            tables: [],
            refs: [],
            groups: [],
            indexes: standaloneIndexes
        };

        // Procesar schemas y tablas
        if (database.schemas && Array.isArray(database.schemas)) {
            for (const dbSchema of database.schemas) {
                // Procesar tablas
                if (dbSchema.tables && Array.isArray(dbSchema.tables)) {
                    for (const table of dbSchema.tables) {
                        schema.tables.push({
                            name: table.name,
                            schema: dbSchema.name !== 'public' ? dbSchema.name : undefined,
                            fields: this.convertFields(table.fields || []),
                            note: table.note
                        });
                    }
                }

                // Procesar referencias
                if (dbSchema.refs && Array.isArray(dbSchema.refs)) {
                    for (const ref of dbSchema.refs) {
                        schema.refs.push({
                            name: ref.name,
                            endpoints: (ref.endpoints || []).map((e: any) => ({
                                tableName: e.tableName,
                                fieldNames: e.fieldNames || [],
                                relation: e.relation
                            })),
                            onDelete: ref.onDelete,
                            onUpdate: ref.onUpdate
                        });
                    }
                }
            }
        }

        return schema;
    }

    /**
     * Convierte campos de tabla
     */
    private convertFields(fields: any[]): any[] {
        return fields.map(f => {
            let typeName = f.type?.type_name || 'varchar';

            // Agregar argumentos de tipo si existen
            if (f.type?.args && !typeName.includes('(')) {
                typeName += `(${f.type.args})`;
            }

            return {
                name: f.name,
                type: typeName,
                pk: f.pk || false,
                unique: f.unique || false,
                notNull: f.not_null || false,
                increment: f.increment || false,
                note: f.note,
                default: f.dbdefault ? {
                    type: f.dbdefault.type,
                    value: String(f.dbdefault.value)
                } : undefined
            };
        });
    }

    /**
     * Valida el schema parseado
     */
    private validateSchema(schema: ParsedSchema): void {
        // Validar que haya al menos una tabla
        if (schema.tables.length === 0) {
            throw new DbmlParseError(
                'El schema no contiene tablas',
                undefined,
                undefined,
                undefined,
                ['Asegúrate de definir al menos una tabla con "Table nombre { ... }"']
            );
        }

        // Validar referencias
        for (const ref of schema.refs) {
            if (!ref.endpoints || ref.endpoints.length < 2) {
                logger.warn(`Referencia inválida: ${ref.name || 'sin nombre'}`, 'DbmlParser');
            }
        }
    }

    /**
     * Genera una clave de caché a partir del contenido
     */
    private generateCacheKey(content: string): string {
        // Hash simple del contenido
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return `dbml_${hash}`;
    }

    /**
     * Invalida la caché
     */
    clearCache(): void {
        this.cache.clear();
        logger.info('Parser cache cleared', 'DbmlParser');
    }

    /**
     * Obtiene estadísticas de la caché
     */
    getCacheStats() {
        return this.cache.getStats();
    }

    /**
     * Limpia entradas de caché expiradas
     */
    cleanup(): void {
        const removed = this.cache.cleanup();
        if (removed > 0) {
            logger.debug(`Parser: limpiadas ${removed} entradas de caché`, 'DbmlParser');
        }
    }
}

// Exportar instancia singleton por conveniencia
export const dbmlParser = DbmlParser.getInstance();
