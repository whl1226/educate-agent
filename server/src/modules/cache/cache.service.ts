import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** 仅当 key 不存在时写入，成功返回 true（一次性声明原语） */
  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  del(key: string | string[]): Promise<void>;
  incr(key: string): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<void>;
  ttl(key: string): Promise<number>;
  exists(key: string): Promise<number>;
}

/**
 * 内存降级存储：Redis 不可用时兜底（本地开发）。
 * 生产环境必须启用 Redis（部署指南要求），内存模式仅限开发/演示。
 */
class MemoryStore implements CacheStore {
  private store = new Map<string, { value: string; expireAt: number }>();

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expireAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expireAt: Date.now() + ttlSeconds * 1000 });
  }

  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const item = this.store.get(key);
    if (item && item.expireAt > Date.now()) return false;
    this.store.set(key, { value, expireAt: Date.now() + ttlSeconds * 1000 });
    return true;
  }

  async del(key: string | string[]): Promise<void> {
    const keys = Array.isArray(key) ? key : [key];
    keys.forEach((k) => this.store.delete(k));
  }

  async incr(key: string): Promise<number> {
    const item = this.store.get(key);
    const alive = item && item.expireAt > Date.now();
    const value = alive ? Number(item.value) || 0 : 0;
    // 已存在的 key 保留原过期时间（与 Redis INCR 行为一致），
    // 避免每次自增把窗口重置为 60s 导致限流窗口被压缩绕过
    this.store.set(key, {
      value: String(value + 1),
      expireAt: alive ? item.expireAt : Date.now() + 60_000,
    });
    return value + 1;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    const item = this.store.get(key);
    if (item) item.expireAt = Date.now() + ttlSeconds * 1000;
  }

  async ttl(key: string): Promise<number> {
    const item = this.store.get(key);
    if (!item || item.expireAt < Date.now()) return -2;
    return Math.ceil((item.expireAt - Date.now()) / 1000);
  }

  async exists(key: string): Promise<number> {
    return this.store.has(key) ? 1 : 0;
  }
}

@Injectable()
export class CacheService implements CacheStore, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis | null = null;
  private memory: MemoryStore = new MemoryStore();
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.enabled = this.config.get<boolean>('REDIS_ENABLED') === true;
  }

  onModuleInit() {
    if (!this.enabled) {
      this.logger.warn('Redis 未启用，使用内存存储（仅限开发/演示，生产必须启用 Redis）');
      return;
    }
    try {
      this.redis = new Redis({
        host: this.config.get('REDIS_HOST', '127.0.0.1'),
        port: this.config.get('REDIS_PORT', 6379),
        password: this.config.get('REDIS_PASSWORD') || undefined,
        db: this.config.get('REDIS_DB', 0),
        lazyConnect: false,
        maxRetriesPerRequest: 2,
        retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 2000)),
      });
      this.redis.on('error', (err) => {
        this.logger.warn(`Redis 连接异常，降级内存存储: ${err.message}`);
        this.redis = null;
      });
      this.logger.log('Redis 已连接');
    } catch (err) {
      this.logger.warn(`Redis 初始化失败，降级内存存储: ${(err as Error).message}`);
      this.redis = null;
    }
  }

  onModuleDestroy() {
    this.redis?.disconnect();
  }

  private active(): CacheStore {
    return (this.redis as unknown as CacheStore) || this.memory;
  }

  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (this.redis) {
      const res = await this.redis.set(key, value, 'EX', ttlSeconds, 'NX');
      return res === 'OK';
    }
    return this.memory.setNx(key, value, ttlSeconds);
  }

  get(key: string) {
    return this.active().get(key);
  }
  set(key: string, value: string, ttlSeconds: number) {
    return this.active().set(key, value, ttlSeconds);
  }
  del(key: string | string[]) {
    return this.active().del(key);
  }
  incr(key: string) {
    return this.active().incr(key);
  }
  expire(key: string, ttlSeconds: number) {
    return this.active().expire(key, ttlSeconds);
  }
  ttl(key: string) {
    return this.active().ttl(key);
  }
  exists(key: string) {
    return this.active().exists(key);
  }
}
