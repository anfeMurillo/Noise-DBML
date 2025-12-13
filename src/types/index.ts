/**
 * Tipos centralizados para la extensión Noise-DBML
 */

// Importar tipos para uso en interfaces
import type { ParsedSchema, ParsedIndex } from '../svgGenerator';

// Re-exportar tipos existentes de svgGenerator para compatibilidad
export { ParsedTable, ParsedField, ParsedRef, ParsedGroup, ParsedIndex, ParsedSchema } from '../svgGenerator';

/**
 * Metadatos del bloque Project de DBML
 */
export interface ProjectMetadata {
    name: string;
    database_type?: string;
    note?: string;
    [key: string]: any;
}

/**
 * Resultado de parsing de DBML con metadata adicional
 */
export interface DbmlParseResult {
    schema: ParsedSchema;
    indexes: ParsedIndex[];
    project?: ProjectMetadata;
    rawDatabase: any;
}

/**
 * Opciones para el parser de DBML
 */
export interface DbmlParserOptions {
    stripIndexes?: boolean;
    validateSchema?: boolean;
    cacheKey?: string;
    force?: boolean;
}

/**
 * Información de error de parsing estructurada
 */
export interface DbmlParseError {
    message: string;
    line?: number;
    column?: number;
    location?: {
        start: { line: number; column: number };
        end: { line: number; column: number };
    };
}

/**
 * Resultado de validación de conexión a base de datos
 */
export interface ConnectionValidationResult {
    isValid: boolean;
    error?: string;
    suggestions?: string[];
}

/**
 * Tipos de errores custom para la extensión
 */
export enum ErrorType {
    PARSE_ERROR = 'PARSE_ERROR',
    VALIDATION_ERROR = 'VALIDATION_ERROR',
    CONNECTION_ERROR = 'CONNECTION_ERROR',
    FILE_ERROR = 'FILE_ERROR',
    UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Error estructurado para la extensión
 */
export interface StructuredError {
    type: ErrorType;
    message: string;
    details?: string;
    suggestions?: string[];
    originalError?: Error;
}

/**
 * Entrada de log estructurada
 */
export interface LogEntry {
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    timestamp: Date;
    category?: string;
    data?: any;
}

/**
 * Opciones de caché
 */
export interface CacheOptions {
    ttl?: number; // Time to live en milisegundos
    maxSize?: number; // Tamaño máximo en items
}

/**
 * Item de caché con metadata
 */
export interface CacheItem<T> {
    key: string;
    value: T;
    timestamp: number;
    size?: number;
}
