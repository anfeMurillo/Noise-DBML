import { ErrorType, StructuredError } from '../types';

/**
 * Custom base error for Noise-DBML extension
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

        // Keep proper stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, NoiseDbmlError);
        }
    }

    /**
     * Converts the error to a structured object
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
     * Gets a formatted message to show to the user
     */
    getUserMessage(): string {
        let msg = this.message;

        if (this.details) {
            msg += `\n\nDetails: ${this.details}`;
        }

        if (this.suggestions && this.suggestions.length > 0) {
            msg += '\n\nSuggestions:';
            this.suggestions.forEach((s, i) => {
                msg += `\n${i + 1}. ${s}`;
            });
        }

        return msg;
    }
}

/**
 * DBML parsing error
 */
export class DbmlParseError extends NoiseDbmlError {
    constructor(
        message: string,
        public readonly line?: number,
        public readonly column?: number,
        details?: string,
        suggestions?: string[]
    ) {
        const locationInfo = line !== undefined ? ` (Line ${line}${column !== undefined ? `, Column ${column}` : ''})` : '';
        super(
            ErrorType.PARSE_ERROR,
            `DBML parsing error${locationInfo}: ${message}`,
            details,
            suggestions
        );
        this.name = 'DbmlParseError';
    }
}

/**
 * Schema validation error
 */
export class DbmlValidationError extends NoiseDbmlError {
    constructor(
        message: string,
        public readonly tableName?: string,
        public readonly fieldName?: string,
        suggestions?: string[]
    ) {
        const locationInfo = tableName ? ` in table '${tableName}'${fieldName ? `.${fieldName}` : ''}` : '';
        super(
            ErrorType.VALIDATION_ERROR,
            `Validation error${locationInfo}: ${message}`,
            undefined,
            suggestions
        );
        this.name = 'DbmlValidationError';
    }
}

/**
 * Database connection error
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
            `Connection error to ${dbType}: ${message}`,
            undefined,
            suggestions,
            originalError
        );
        this.name = 'DatabaseConnectionError';
    }

    private static getSuggestions(dbType: string, errorMessage: string): string[] {
        const suggestions: string[] = [];

        if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('getaddrinfo')) {
            suggestions.push('Check that the hostname is correct');
            suggestions.push('Ensure you have internet connection if it is a cloud DB');
        }

        if (errorMessage.includes('ECONNREFUSED')) {
            suggestions.push('Check that the database server is running');
            suggestions.push('Confirm that the port is correct');
            if (dbType === 'postgres') { suggestions.push('Default port: 5432'); }
            if (dbType === 'mysql') { suggestions.push('Default port: 3306'); }
        }

        if (errorMessage.includes('authentication') || errorMessage.includes('password')) {
            suggestions.push('Check your username and password');
            suggestions.push('If the password contains special characters, ensure it is correctly encoded');
        }

        if (errorMessage.includes('SSL') || errorMessage.includes('ssl')) {
            if (dbType === 'postgres') {
                suggestions.push('Try adding ?sslmode=require to your connection string');
                suggestions.push('For local development, use ?sslmode=disable');
            }
            if (dbType === 'mysql') {
                suggestions.push('Try adding ?ssl=true to your connection string');
            }
        }

        if (errorMessage.includes('does not exist')) {
            suggestions.push('Check that the database name is correct');
            suggestions.push('Ensure you have permissions to access the database');
        }

        // General suggestions
        if (suggestions.length === 0) {
            suggestions.push('Check your connection string');
            suggestions.push('Confirm you have access to the database');
        }

        return suggestions;
    }
}

/**
 * Centralized error handler
 */
export class ErrorHandler {
    /**
     * Converts any error to NoiseDbmlError
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
            'Unknown error',
            String(error)
        );
    }

    /**
     * Handles parsing errors from @dbml/core
     */
    static fromDbmlParseError(error: any): DbmlParseError {
        if (error.diags && Array.isArray(error.diags)) {
            const firstDiag = error.diags[0];
            return new DbmlParseError(
                firstDiag.message || firstDiag.error || 'Syntax error',
                firstDiag.location?.start?.line,
                firstDiag.location?.start?.column,
                error.diags.length > 1 ? `${error.diags.length} errors found` : undefined,
                ['Check your DBML syntax', 'Consult documentation at https://dbml.dbdiagram.io/docs/']
            );
        }

        if (error.location) {
            return new DbmlParseError(
                error.message || 'Syntax error',
                error.location.start?.line,
                error.location.start?.column
            );
        }

        return new DbmlParseError(
            error.message || 'Error parsing DBML',
            undefined,
            undefined,
            String(error)
        );
    }

    /**
     * Formats an error for logging
     */
    static formatForLog(error: unknown): string {
        const normalized = this.normalize(error);

        let formatted = `[${normalized.type}] ${normalized.message}`;

        if (normalized.details) {
            formatted += `\nDetails: ${normalized.details}`;
        }

        if (normalized.originalError?.stack) {
            formatted += `\nStack: ${normalized.originalError.stack}`;
        }

        return formatted;
    }
}
