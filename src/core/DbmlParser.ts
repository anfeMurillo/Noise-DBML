import { Parser } from '@dbml/core';
import { ParsedIndex, ParsedSchema } from '../svgGenerator';
import { DbmlParseResult, DbmlParserOptions } from '../types';
import { CacheManager } from '../utils/CacheManager';
import { ErrorHandler, DbmlParseError } from '../utils/ErrorHandler';
import { logger } from '../utils/Logger';

/**
 * Regex para identificar índices standalone en DBML
 * Formato: Index nombre on tabla (columnas)
 */
export const STANDALONE_INDEX_REGEX = /^\s*Index\s+([A-Za-z_][A-Za-z0-9_]*)\s+on\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\).*$/gm;

/**
 * Parser centralizado para contenido DBML
 * Maneja parsing, caché y extracción de características especiales
 */
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

    /**
     * Obtiene la instancia singleton
     */
    static getInstance(): DbmlParser {
        if (!DbmlParser.instance) {
            DbmlParser.instance = new DbmlParser();
        }
        return DbmlParser.instance;
    }

    /**
     * Parsea contenido DBML y retorna schema estructurado
     */
    async parse(content: string, options: DbmlParserOptions = {}): Promise<DbmlParseResult> {
        const startTime = Date.now();

        // Generar clave de caché
        const cacheKey = options.cacheKey || this.generateCacheKey(content);

        // Intentar obtener del caché
        const cached = this.cache.get(cacheKey);
        if (cached) {
            logger.debug('Parser: usando resultado cacheado', 'DbmlParser');
            return cached;
        }

        logger.info('Parser: parseando contenido DBML', 'DbmlParser', {
            contentLength: content.length,
            stripIndexes: options.stripIndexes
        });

        try {
            // Extraer índices standalone si es necesario
            let indexes: ParsedIndex[] = [];
            let contentToParse = content;

            if (options.stripIndexes !== false) {
                const extraction = this.extractStandaloneIndexes(content);
                indexes = extraction.indexes;
                contentToParse = extraction.sanitizedContent;

                logger.debug(`Parser: extraídos ${indexes.length} índices standalone`, 'DbmlParser');
            }

            // Parsear con @dbml/core
            let database: any;
            try {
                // @ts-ignore - El tipo de Parser.parse no está bien definido en @dbml/core
                database = Parser.parse(contentToParse, 'dbml');
            } catch (parseError: any) {
                throw ErrorHandler.fromDbmlParseError(parseError);
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
