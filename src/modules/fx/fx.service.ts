import { HttpService } from '@nestjs/axios';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class FxService {
  private readonly apiKey = process.env.FIXER_API_KEY ?? '';
  private readonly baseUrl =
    process.env.FIXER_BASE_URL ?? 'http://data.fixer.io/api';
  private readonly ttl = Number(process.env.FX_CACHE_TTL_SECONDS ?? 3600);

  constructor(
    private readonly http: HttpService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {
    if (!this.apiKey) {
      throw new Error('FIXER_API_KEY is missing');
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

    const rate = await this.getRate(from, to);

    const convertedAmount = Number((amount * rate).toFixed(2));

    return {
      rate,
      convertedAmount,
    };
  }

  // getRate("KZT", "USD")
  // сколько USD за 1 KZT
  async getRate(from: string, to: string): Promise<number> {
    const f = from.toUpperCase();
    const t = to.toUpperCase();
    if (f === t) return 1;

    const key = `fx:latest:${f}:${t}`;

    const cached = await this.cache.get<number>(key);
    if (cached !== undefined && cached !== null) return cached;

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

    await this.cache.set(key, rate, this.ttl);
    return rate;
  }
}
