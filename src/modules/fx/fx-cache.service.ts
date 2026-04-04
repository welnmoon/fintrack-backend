import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createClient } from 'redis';

type MemoryItem = {
  value: number;
  expiresAt: number | null;
};

@Injectable()
export class FxCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(FxCacheService.name);
  private readonly client: ReturnType<typeof createClient> | null;
  private readonly connectPromise: Promise<void> | null;

  // Soft fallback so conversion still works if Redis is temporarily unavailable.
  private readonly memory = new Map<string, MemoryItem>();

  constructor() {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    if (!process.env.REDIS_URL) {
      this.logger.log(`REDIS_URL is not set. Trying default Redis: ${redisUrl}`);
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
        this.logger.log('Redis connection established for FX cache.');
      })
      .catch((error) => {
        this.logger.warn(
          `Redis connection failed, fallback to in-memory cache: ${String(error)}`,
        );
      });
  }

  async onModuleDestroy() {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }

  async getNumber(key: string): Promise<number | null> {
    const client = await this.getClient();
    if (client) {
      const raw = await client.get(key);
      if (raw == null) return null;

      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    }

    const memoryItem = this.memory.get(key);
    if (!memoryItem) return null;

    if (memoryItem.expiresAt !== null && memoryItem.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return null;
    }

    return memoryItem.value;
  }

  async setNumber(
    key: string,
    value: number,
    ttlSeconds?: number,
  ): Promise<void> {
    if (!Number.isFinite(value)) return;

    const client = await this.getClient();
    if (client) {
      if (ttlSeconds !== undefined && ttlSeconds > 0) {
        await client.set(key, String(value), { EX: ttlSeconds });
        return;
      }

      await client.set(key, String(value));
      return;
    }

    const expiresAt =
      ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;
    this.memory.set(key, { value, expiresAt });
  }

  private async getClient() {
    if (!this.client || !this.connectPromise) return null;

    await this.connectPromise;
    if (!this.client.isOpen) return null;

    return this.client;
  }
}
