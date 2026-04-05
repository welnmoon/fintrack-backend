import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { FxCacheService } from './fx-cache.service';

@Injectable()
export class FxService {
  private readonly logger = new Logger(FxService.name);
  private readonly apiKey = process.env.FIXER_API_KEY ?? '';
  private readonly baseUrl =
    process.env.FIXER_BASE_URL ?? 'http://data.fixer.io/api';
  private readonly ttl = Number(process.env.FX_CACHE_TTL_SECONDS ?? 3600);
  private readonly lastKnownTtl = Number(
    process.env.FX_LAST_KNOWN_TTL_SECONDS ?? 60 * 60 * 24 * 30,
  );

  constructor(
    private readonly http: HttpService,
    private readonly cache: FxCacheService,
  ) {
    if (!this.apiKey) {
      this.logger.warn(
        'FIXER_API_KEY is missing. FX conversion will use last-known cache only.',
      );
    }
  }

  // await fx.convert('KZT', 'USD', 5000);
  // 1 KZT = 0.002 USD

  // {
  //   rate: 0.002,
  //   convertedAmount: 10
  // }
  async convert(from: string, to: string, amount: number) {
    if (!Number.isFinite(amount)) {
      throw new Error('Invalid amount');
    }

    const { rate, stale } = await this.getRateWithMeta(from, to);

    const convertedAmount = Number((amount * rate).toFixed(2));

    return {
      rate,
      convertedAmount,
      stale,
    };
  }

  // getRate("KZT", "USD")
  // сколько USD за 1 KZT
  async getRate(from: string, to: string): Promise<number> {
    const result = await this.getRateWithMeta(from, to);
    return result.rate;
  }

  async getRateWithMeta(
    from: string,
    to: string,
  ): Promise<{ rate: number; stale: boolean }> {
    const f = from.toUpperCase();
    const t = to.toUpperCase();
    if (f === t) return { rate: 1, stale: false };

    const latestKey = `fx:latest:${f}:${t}`;
    const lastKnownKey = `fx:last-known:${f}:${t}`;

    const cached = await this.cache.getNumber(latestKey);
    if (cached !== null) {
      return { rate: cached, stale: false };
    }

    try {
      if (!this.apiKey) {
        throw new Error('FIXER_API_KEY is missing');
      }

      const url =
        `${this.baseUrl}/latest` +
        `?access_key=${encodeURIComponent(this.apiKey)}` +
        `&symbols=${encodeURIComponent(`${f},${t}`)}`;

      const { data } = await this.http.axiosRef.get(url);

      if (!data?.success) {
        const info =
          data?.error?.info ?? data?.error?.type ?? 'Unknown Fixer error';
        throw new Error(`Fixer error: ${info}`);
      }

      const eurToF = Number(data?.rates?.[f]);
      const eurToT = Number(data?.rates?.[t]);

      if (!Number.isFinite(eurToF) || eurToF <= 0)
        throw new Error(`Bad rate for ${f}`);
      if (!Number.isFinite(eurToT) || eurToT <= 0)
        throw new Error(`Bad rate for ${t}`);

      const rate = eurToT / eurToF;

      await this.cache.setNumber(latestKey, rate, this.ttl);
      await this.cache.setNumber(lastKnownKey, rate, this.lastKnownTtl);

      return { rate, stale: false };
    } catch (error) {
      const lastKnown = await this.cache.getNumber(lastKnownKey);
      if (lastKnown !== null) {
        return { rate: lastKnown, stale: true };
      }

      throw error;
    }
  }
}
