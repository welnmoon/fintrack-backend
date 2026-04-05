import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createClient } from 'redis';

@Injectable()
export class ForexCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(ForexCacheService.name);
  private readonly ttlSeconds = this.parsePositiveInt(
    process.env.FOREX_CACHE_TTL_SECONDS ?? process.env.FX_CACHE_TTL_SECONDS,
    120,
  );

  private readonly client: ReturnType<typeof createClient> | null;
  private readonly connectPromise: Promise<void> | null;

  constructor() {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    if (!process.env.REDIS_URL) {
      this.logger.log(
        `REDIS_URL is not set. Trying default Redis: ${redisUrl}`,
      );
    }

    const client = createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 1000,
        reconnectStrategy: () => false,
      },
    });
    client.on('error', (error) => {
      this.logger.warn(`Redis error: ${String(error)}`);
    });

    this.client = client;
    this.connectPromise = client
      .connect()
      .then(() => {
        this.logger.log('Redis connection established for forex cache.');
      })
      .catch((error) => {
        this.logger.warn(
          `Redis connection failed, fallback to DB only: ${String(error)}`,
        );
      });
  }

  async onModuleDestroy() {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    const client = await this.getClient();
    if (!client) return null;

    const raw = await client.get(key);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJson(key: string, payload: unknown, ttlSeconds = this.ttlSeconds) {
    const client = await this.getClient();
    if (!client) return;

    const raw = JSON.stringify(payload);

    if (ttlSeconds > 0) {
      await client.set(key, raw, { EX: ttlSeconds });
      return;
    }

    await client.set(key, raw);
  }

  private async getClient() {
    if (!this.client || !this.connectPromise) return null;

    await this.connectPromise;
    if (!this.client.isOpen) return null;
    return this.client;
  }

  private parsePositiveInt(raw: string | undefined, fallback: number) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return Math.floor(value);
  }
}
