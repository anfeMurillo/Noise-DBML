import { LogEntry } from '../types';

/**
 * Niveles de logging
 */
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

/**
 * Logger estructurado y configurablecon niveles y categorías
 */
export class Logger {
    private static instance: Logger;
    private minLevel: LogLevel = LogLevel.INFO;
    private logHistory: LogEntry[] = [];
    private maxHistorySize: number = 1000;

    private constructor() { }

    /**
     * Obtiene la instancia singleton del logger
     */
    static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    /**
     * Configura el nivel mínimo de logging
     */
    setMinLevel(level: LogLevel): void {
        this.minLevel = level;
    }

    /**
     * Configura el tamaño máximo del historial
     */
    setMaxHistorySize(size: number): void {
        this.maxHistorySize = size;
        this.trimHistory();
    }

    /**
     * Log a nivel DEBUG
     */
    debug(message: string, category?: string, data?: any): void {
        this.log(LogLevel.DEBUG, message, category, data);
    }

    /**
     * Log a nivel INFO
     */
    info(message: string, category?: string, data?: any): void {
        this.log(LogLevel.INFO, message, category, data);
    }

    /**
     * Log a nivel WARN
     */
    warn(message: string, category?: string, data?: any): void {
        this.log(LogLevel.WARN, message, category, data);
    }

    /**
     * Log a nivel ERROR
     */
    error(message: string, category?: string, data?: any): void {
        this.log(LogLevel.ERROR, message, category, data);
    }

    /**
     * Método interno de logging
     */
    private log(level: LogLevel, message: string, category?: string, data?: any): void {
        if (level < this.minLevel) {
            return;
        }

        const entry: LogEntry = {
            level: this.getLevelName(level),
            message,
            timestamp: new Date(),
            category,
            data
        };

        // Agregar al historial
        this.logHistory.push(entry);
        this.trimHistory();

        // Output a console
        const formattedMessage = this.formatMessage(entry);
        switch (level) {
            case LogLevel.DEBUG:
            case LogLevel.INFO:
                console.log(formattedMessage);
                break;
            case LogLevel.WARN:
                console.warn(formattedMessage);
                break;
            case LogLevel.ERROR:
                console.error(formattedMessage);
                break;
        }
    }

    /**
     * Formatea un mensaje de log
     */
    private formatMessage(entry: LogEntry): string {
        const timestamp = entry.timestamp.toISOString();
        const level = entry.level.toUpperCase().padEnd(5);
        const category = entry.category ? `[${entry.category}]` : '';
        const data = entry.data ? `\n${JSON.stringify(entry.data, null, 2)}` : '';

        return `${timestamp} ${level} ${category} ${entry.message}${data}`;
    }

    /**
     * Obtiene el nombre del nivel de log
     */
    private getLevelName(level: LogLevel): LogEntry['level'] {
        switch (level) {
            case LogLevel.DEBUG:
                return 'debug';
            case LogLevel.INFO:
                return 'info';
            case LogLevel.WARN:
                return 'warn';
            case LogLevel.ERROR:
                return 'error';
        }
    }

    /**
     * Mantiene el historial dentro del tamaño máximo
     */
    private trimHistory(): void {
        if (this.logHistory.length > this.maxHistorySize) {
            this.logHistory = this.logHistory.slice(-this.maxHistorySize);
        }
    }

    /**
     * Obtiene el historial de logs
     */
    getHistory(filter?: { level?: LogEntry['level']; category?: string }): LogEntry[] {
        if (!filter) {
            return [...this.logHistory];
        }

        return this.logHistory.filter(entry => {
            if (filter.level && entry.level !== filter.level) {
                return false;
            }
            if (filter.category && entry.category !== filter.category) {
                return false;
            }
            return true;
        });
    }

    /**
     * Limpia el historial de logs
     */
    clearHistory(): void {
        this.logHistory = [];
    }

    /**
     * Exporta el historial como texto
     */
    exportHistory(): string {
        return this.logHistory.map(entry => this.formatMessage(entry)).join('\n');
    }
}

// Exportar instancia singleton por conveniencia
export const logger = Logger.getInstance();
