import { ConnectionValidationResult } from '../types';

/**
 * Validadores centralizados para la extensión
 */
export class Validators {
    /**
     * Valida un connection string de PostgreSQL
     */
    static validatePostgresConnectionString(connString: string): ConnectionValidationResult {
        // Formato: postgresql://user:password@host:port/database
        const pgRegex = /^postgres(ql)?:\/\/([^:]+):([^@]+)@([^:/]+):?(\d+)?\/(.+)$/;

        if (!pgRegex.test(connString.split('?')[0])) { // Ignorar query params para validación básica
            return {
                isValid: false,
                error: 'Formato de connection string inválido',
                suggestions: [
                    'Formato esperado: postgresql://user:password@host:port/database',
                    'Ejemplo: postgresql://postgres:mypassword@localhost:5432/mydb',
                    'Para SSL: agregar ?sslmode=require al final'
                ]
            };
        }

        return { isValid: true };
    }

    /**
     * Valida un connection string de MySQL
     */
    static validateMysqlConnectionString(connString: string): ConnectionValidationResult {
        // Formato: mysql://user:password@host:port/database
        const mysqlRegex = /^mysql:\/\/([^:]+):([^@]+)@([^:/]+):?(\d+)?\/(.+)$/;

        if (!mysqlRegex.test(connString.split('?')[0])) {
            return {
                isValid: false,
                error: 'Formato de connection string inválido',
                suggestions: [
                    'Formato esperado: mysql://user:password@host:port/database',
                    'Ejemplo: mysql://root:mypassword@localhost:3306/mydb',
                    'Para SSL: agregar ?ssl=true al final'
                ]
            };
        }

        return { isValid: true };
    }

    /**
     * Valida un path de archivo SQLite
     */
    static validateSqlitePath(path: string): ConnectionValidationResult {
        // Puede ser un path de archivo o un connection string de SQLite Cloud
        if (path.startsWith('sqlitecloud://') || path.startsWith('https://')) {
            return this.validateSqliteCloudConnectionString(path);
        }

        // Para paths locales, verificar que tenga extensión válida
        const validExtensions = ['.db', '.sqlite', '.sqlite3'];
        const hasValidExtension = validExtensions.some(ext => path.toLowerCase().endsWith(ext));

        if (!hasValidExtension) {
            return {
                isValid: false,
                error: 'Extensión de archivo inválida',
                suggestions: [
                    'Extensiones válidas: .db, .sqlite, .sqlite3',
                    'Ejemplo: C:\\databases\\mydb.sqlite'
                ]
            };
        }

        return { isValid: true };
    }

    /**
     * Valida un connection string de SQLite Cloud
     */
    static validateSqliteCloudConnectionString(connString: string): ConnectionValidationResult {
        if (!connString.startsWith('sqlitecloud://') && !connString.startsWith('https://')) {
            return {
                isValid: false,
                error: 'Connection string de SQLite Cloud inválido',
                suggestions: [
                    'Formato esperado: sqlitecloud://user:password@host:port/database',
                    'O: https://your-project.sqlite.cloud/database'
                ]
            };
        }

        return { isValid: true };
    }

    /**
     * Valida contenido DBML básico
     */
    static validateDbmlContent(content: string): ConnectionValidationResult {
        if (!content || content.trim().length === 0) {
            return {
                isValid: false,
                error: 'El contenido DBML está vacío',
                suggestions: ['Agrega al menos una definición de tabla']
            };
        }

        // Verificar que tenga al menos una tabla
        const hasTable = /Table\s+\w+\s*{/.test(content);
        if (!hasTable) {
            return {
                isValid: false,
                error: 'No se encontraron definiciones de tablas',
                suggestions: [
                    'Usa el snippet "table" para crear una tabla',
                    'Formato: Table nombre_tabla { ... }'
                ]
            };
        }

        return { isValid: true };
    }

    /**
     * Sanitiza un identificador (nombre de tabla, columna, etc.)
     */
    static sanitizeIdentifier(identifier: string): string {
        // Eliminar espacios y caracteres especiales
        return identifier
            .trim()
            .replace(/[^\w_]/g, '_')
            .replace(/^(\d)/, '_$1'); // No puede empezar con número
    }

    /**
     * Valida un nombre de identificador SQL
     */
    static validateIdentifier(identifier: string): ConnectionValidationResult {
        if (!identifier || identifier.trim().length === 0) {
            return {
                isValid: false,
                error: 'El identificador no puede estar vacío'
            };
        }

        // No puede empezar con número
        if (/^\d/.test(identifier)) {
            return {
                isValid: false,
                error: 'El identificador no puede empezar con un número',
                suggestions: ['Usa guión bajo al inicio: _' + identifier]
            };
        }

        // Solo letras, números y guiones bajos
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
            return {
                isValid: false,
                error: 'El identificador contiene caracteres inválidos',
                suggestions: [
                    'Usa solo letras, números y guiones bajos',
                    'Sugerencia: ' + this.sanitizeIdentifier(identifier)
                ]
            };
        }

        // Verificar palabras reservadas comunes
        const reservedWords = [
            'select', 'insert', 'update', 'delete', 'where', 'from', 'table',
            'database', 'create', 'drop', 'alter', 'index', 'view', 'user'
        ];

        if (reservedWords.includes(identifier.toLowerCase())) {
            return {
                isValid: false,
                error: 'El identificador es una palabra reservada de SQL',
                suggestions: [
                    'Usa un nombre diferente',
                    'O rodéalo con comillas en la generación SQL'
                ]
            };
        }

        return { isValid: true };
    }

    /**
     * Valida una URL
     */
    static validateUrl(url: string): ConnectionValidationResult {
        try {
            new URL(url);
            return { isValid: true };
        } catch {
            return {
                isValid: false,
                error: 'URL inválida',
                suggestions: ['Verifica el formato de la URL']
            };
        }
    }

    /**
     * Valida un puerto
     */
    static validatePort(port: string | number): ConnectionValidationResult {
        const portNum = typeof port === 'string' ? parseInt(port, 10) : port;

        if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
            return {
                isValid: false,
                error: 'Puerto inválido',
                suggestions: [
                    'El puerto debe ser un número entre 1 y 65535',
                    'Puertos comunes: PostgreSQL (5432), MySQL (3306)'
                ]
            };
        }

        return { isValid: true };
    }
}
