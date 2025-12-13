import { ErrorType, StructuredError } from '../types';

/**
 * Error base personalizado para la extensión Noise-DBML
 */
export class NoiseDbmlError extends Error {
    constructor(
        public readonly type: ErrorType,
        message: string,
        public readonly details?: string,
        public readonly suggestions?: string[],
        public readonly originalError?: Error
    ) {
        super(message);
        this.name = 'NoiseDbmlError';

        // Mantener stack trace adecuado
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, NoiseDbmlError);
        }
    }

    /**
     * Convierte el error a un objeto estructurado
     */
    toStructured(): StructuredError {
        return {
            type: this.type,
            message: this.message,
            details: this.details,
            suggestions: this.suggestions,
            originalError: this.originalError
        };
    }

    /**
     * Obtiene un mensaje formateado para mostrar al usuario
     */
    getUserMessage(): string {
        let msg = this.message;

        if (this.details) {
            msg += `\n\nDetalles: ${this.details}`;
        }

        if (this.suggestions && this.suggestions.length > 0) {
            msg += '\n\nSugerencias:';
            this.suggestions.forEach((s, i) => {
                msg += `\n${i + 1}. ${s}`;
            });
        }

        return msg;
    }
}

/**
 * Error de parsing de DBML
 */
export class DbmlParseError extends NoiseDbmlError {
    constructor(
        message: string,
        public readonly line?: number,
        public readonly column?: number,
        details?: string,
        suggestions?: string[]
    ) {
        const locationInfo = line !== undefined ? ` (Línea ${line}${column !== undefined ? `, Columna ${column}` : ''})` : '';
        super(
            ErrorType.PARSE_ERROR,
            `Error de parsing DBML${locationInfo}: ${message}`,
            details,
            suggestions
        );
        this.name = 'DbmlParseError';
    }
}

/**
 * Error de validación de esquema
 */
export class DbmlValidationError extends NoiseDbmlError {
    constructor(
        message: string,
        public readonly tableName?: string,
        public readonly fieldName?: string,
        suggestions?: string[]
    ) {
        const locationInfo = tableName ? ` en tabla '${tableName}'${fieldName ? `.${fieldName}` : ''}` : '';
        super(
            ErrorType.VALIDATION_ERROR,
            `Error de validación${locationInfo}: ${message}`,
            undefined,
            suggestions
        );
        this.name = 'DbmlValidationError';
    }
}

/**
 * Error de conexión a base de datos
 */
export class DatabaseConnectionError extends NoiseDbmlError {
    constructor(
        message: string,
        public readonly dbType: 'postgres' | 'mysql' | 'sqlite',
        public readonly connectionString?: string,
        originalError?: Error
    ) {
        const suggestions = DatabaseConnectionError.getSuggestions(dbType, message);
        super(
            ErrorType.CONNECTION_ERROR,
            `Error de conexión a ${dbType}: ${message}`,
            undefined,
            suggestions,
            originalError
        );
        this.name = 'DatabaseConnectionError';
    }

    private static getSuggestions(dbType: string, errorMessage: string): string[] {
        const suggestions: string[] = [];

        if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('getaddrinfo')) {
            suggestions.push('Verifica que el hostname sea correcto');
            suggestions.push('Asegúrate de tener conexión a internet si es una BD en la nube');
        }

        if (errorMessage.includes('ECONNREFUSED')) {
            suggestions.push('Verifica que el servidor de base de datos esté ejecutándose');
            suggestions.push('Confirma que el puerto sea el correcto');
            if (dbType === 'postgres') {suggestions.push('Puerto por defecto: 5432');}
            if (dbType === 'mysql') {suggestions.push('Puerto por defecto: 3306');}
        }

        if (errorMessage.includes('authentication') || errorMessage.includes('password')) {
            suggestions.push('Verifica tu usuario y contraseña');
            suggestions.push('Si la contraseña contiene caracteres especiales, asegúrate de codificarla correctamente');
        }

        if (errorMessage.includes('SSL') || errorMessage.includes('ssl')) {
            if (dbType === 'postgres') {
                suggestions.push('Intenta agregar ?sslmode=require a tu connection string');
                suggestions.push('Para desarrollo local, usa ?sslmode=disable');
            }
            if (dbType === 'mysql') {
                suggestions.push('Intenta agregar ?ssl=true a tu connection string');
            }
        }

        if (errorMessage.includes('does not exist')) {
            suggestions.push('Verifica que el nombre de la base de datos sea correcto');
            suggestions.push('Asegúrate de tener permisos para acceder a la base de datos');
        }

        // Sugerencias generales
        if (suggestions.length === 0) {
            suggestions.push('Verifica tu connection string');
            suggestions.push('Confirma que tienes acceso a la base de datos');
        }

        return suggestions;
    }
}

/**
 * Manejador centralizado de errores
 */
export class ErrorHandler {
    /**
     * Convierte cualquier error a NoiseDbmlError
     */
    static normalize(error: unknown): NoiseDbmlError {
        if (error instanceof NoiseDbmlError) {
            return error;
        }

        if (error instanceof Error) {
            return new NoiseDbmlError(
                ErrorType.UNKNOWN_ERROR,
                error.message,
                undefined,
                undefined,
                error
            );
        }

        if (typeof error === 'string') {
            return new NoiseDbmlError(
                ErrorType.UNKNOWN_ERROR,
                error
            );
        }

        return new NoiseDbmlError(
            ErrorType.UNKNOWN_ERROR,
            'Error desconocido',
            String(error)
        );
    }

    /**
     * Maneja errores de parsing del @dbml/core
     */
    static fromDbmlParseError(error: any): DbmlParseError {
        if (error.diags && Array.isArray(error.diags)) {
            const firstDiag = error.diags[0];
            return new DbmlParseError(
                firstDiag.message || firstDiag.error || 'Error de sintaxis',
                firstDiag.location?.start?.line,
                firstDiag.location?.start?.column,
                error.diags.length > 1 ? `${error.diags.length} errores encontrados` : undefined,
                ['Revisa la sintaxis DBML', 'Consulta la documentación en https://dbml.dbdiagram.io/docs/']
            );
        }

        if (error.location) {
            return new DbmlParseError(
                error.message || 'Error de sintaxis',
                error.location.start?.line,
                error.location.start?.column
            );
        }

        return new DbmlParseError(
            error.message || 'Error al parsear DBML',
            undefined,
            undefined,
            String(error)
        );
    }

    /**
     * Formatea un error para logging
     */
    static formatForLog(error: unknown): string {
        const normalized = this.normalize(error);

        let formatted = `[${normalized.type}] ${normalized.message}`;

        if (normalized.details) {
            formatted += `\nDetalles: ${normalized.details}`;
        }

        if (normalized.originalError?.stack) {
            formatted += `\nStack: ${normalized.originalError.stack}`;
        }

        return formatted;
    }
}
