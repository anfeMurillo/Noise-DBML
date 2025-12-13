import { CacheItem, CacheOptions } from '../types';
import { logger } from './Logger';

/**
 * Gestor de caché genérico con TTL y límite de tamaño
 */
export class CacheManager<T> {
    private cache: Map<string, CacheItem<T>> = new Map();
    private readonly defaultTTL: number;
    private readonly maxSize: number;
    private hits: number = 0;
    private misses: number = 0;

    constructor(options: CacheOptions = {}) {
        this.defaultTTL = options.ttl || 60000; // 1 minuto por defecto
        this.maxSize = options.maxSize || 100;
    }

    /**
     * Obtiene un valor del caché
     */
    get(key: string): T | null {
        const item = this.cache.get(key);

        if (!item) {
            this.misses++;
            logger.debug(`Cache miss: ${key}`, 'CacheManager');
            return null;
        }

        // Verificar si ha expirado
        if (this.isExpired(item)) {
            logger.debug(`Cache expired: ${key}`, 'CacheManager');
            this.cache.delete(key);
            this.misses++;
            return null;
        }

        this.hits++;
        logger.debug(`Cache hit: ${key}`, 'CacheManager');
        return item.value;
    }

    /**
     * Almacena un valor en el caché
     */
    set(key: string, value: T, ttl?: number): void {
        // Limpiar si se alcanzó el tamaño máximo
        if (this.cache.size >= this.maxSize) {
            this.evictOldest();
        }

        const item: CacheItem<T> = {
            key,
            value,
            timestamp: Date.now(),
            size: this.estimateSize(value)
        };

        this.cache.set(key, item);
        logger.debug(`Cache set: ${key}`, 'CacheManager', { ttl: ttl || this.defaultTTL });
    }

    /**
     * Verifica si una clave existe en el caché
     */
    has(key: string): boolean {
        const item = this.cache.get(key);
        if (!item) {return false;}

        if (this.isExpired(item)) {
            this.cache.delete(key);
            return false;
        }

        return true;
    }

    /**
     * Elimina un valor del caché
     */
    delete(key: string): boolean {
        const deleted = this.cache.delete(key);
        if (deleted) {
            logger.debug(`Cache delete: ${key}`, 'CacheManager');
        }
        return deleted;
    }

    /**
     * Limpia todo el caché
     */
    clear(): void {
        const size = this.cache.size;
        this.cache.clear();
        this.hits = 0;
        this.misses = 0;
        logger.info(`Cache cleared (${size} items)`, 'CacheManager');
    }

    /**
     * Invalida entradas que cumplan un predicado
     */
    invalidate(predicate: (key: string, value: T) => boolean): number {
        let count = 0;
        for (const [key, item] of this.cache.entries()) {
            if (predicate(key, item.value)) {
                this.cache.delete(key);
                count++;
            }
        }

        if (count > 0) {
            logger.info(`Cache invalidated ${count} items`, 'CacheManager');
        }

        return count;
    }

    /**
     * Obtiene estadísticas del caché
     */
    getStats() {
        const total = this.hits + this.misses;
        const hitRate = total > 0 ? (this.hits / total) * 100 : 0;

        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hits: this.hits,
            misses: this.misses,
            hitRate: hitRate.toFixed(2) + '%',
            totalRequests: total
        };
    }

    /**
     * Limpia entradas expiradas
     */
    cleanup(): number {
        let count = 0;
        for (const [key, item] of this.cache.entries()) {
            if (this.isExpired(item)) {
                this.cache.delete(key);
                count++;
            }
        }

        if (count > 0) {
            logger.debug(`Cache cleanup: removed ${count} expired items`, 'CacheManager');
        }

        return count;
    }

    /**
     * Verifica si un item ha expirado
     */
    private isExpired(item: CacheItem<T>): boolean {
        return Date.now() - item.timestamp > this.defaultTTL;
    }

    /**
     * Elimina el item más antiguo
     */
    private evictOldest(): void {
        let oldestKey: string | null = null;
        let oldestTimestamp = Infinity;

        for (const [key, item] of this.cache.entries()) {
            if (item.timestamp < oldestTimestamp) {
                oldestTimestamp = item.timestamp;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this.cache.delete(oldestKey);
            logger.debug(`Cache evicted oldest: ${oldestKey}`, 'CacheManager');
        }
    }

    /**
     * Estima el tamaño de un valor (simplificado)
     */
    private estimateSize(value: T): number {
        try {
            return JSON.stringify(value).length;
        } catch {
            return 0;
        }
    }
}
