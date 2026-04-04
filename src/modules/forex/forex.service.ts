import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  Logger,
  MessageEvent,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { catchError, concat, defer, map, Observable, of, Subject } from 'rxjs';
import { ForexCacheService } from './forex-cache.service';
import {
  FOREX_INTERVALS,
  ForexCandle,
  ForexInterval,
  ForexSnapshot,
} from './forex.types';
import { PrismaService } from '../prisma/prisma.service';

type TwelvedataTimeSeriesValue = {
  datetime?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
};

type TwelvedataTimeSeriesResponse = {
  status?: string;
  code?: number;
  message?: string;
  values?: TwelvedataTimeSeriesValue[];
};

type StreamState = {
  symbol: string;
  interval: ForexInterval;
  snapshot: ForexSnapshot | null;
  subject: Subject<ForexSnapshot>;
  timer: ReturnType<typeof setInterval> | null;
  subscribers: number;
};

type ForexSyncStateRecord = {
  backfillCompleted: boolean;
  oldestCandleTime: Date | null;
  staleSince: Date | null;
  sourceUnavailable: boolean;
  lastSuccessfulSyncAt: Date | null;
  lastFailedSyncAt: Date | null;
  lastErrorMessage: string | null;
};

@Injectable()
export class ForexService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(ForexService.name);
  private readonly apiKey =
    process.env.TWELVEDATA_API_KEY ?? process.env.TWELVEDATA_SECRET_KEY ?? '';
  private readonly baseUrl =
    process.env.TWELVEDATA_BASE_URL ?? 'https://api.twelvedata.com';

  private readonly pollIntervalMs = this.parsePositiveInt(
    process.env.FOREX_POLL_INTERVAL_MS,
    15000,
  );
  private readonly historySize = this.parsePositiveInt(
    process.env.FOREX_HISTORY_SIZE,
    1000,
  );
  private readonly tailFetchSize = this.parsePositiveInt(
    process.env.FOREX_TAIL_FETCH_SIZE,
    2,
  );

  private readonly backfillChunkSize = this.parsePositiveInt(
    process.env.FOREX_BACKFILL_CHUNK_SIZE,
    200,
  );
  private readonly backfillMaxRequests = this.parsePositiveInt(
    process.env.FOREX_BACKFILL_MAX_REQUESTS,
    3,
  );

  private readonly defaultSymbol = this.normalizeSymbol(
    process.env.FOREX_DEFAULT_SYMBOL,
    'EUR/USD',
  );
  private readonly defaultInterval = this.normalizeInterval(
    process.env.FOREX_DEFAULT_INTERVAL,
    '1min',
  );

  private readonly warmupSymbols = this.parseSymbols(
    process.env.FOREX_WARMUP_SYMBOLS,
    [this.defaultSymbol],
  );
  private readonly warmupIntervals = this.parseIntervals(
    process.env.FOREX_WARMUP_INTERVALS,
    [this.defaultInterval],
  );

  private readonly streams = new Map<string, StreamState>();
  private readonly runningBackfills = new Set<string>();

  constructor(
    private readonly http: HttpService,
    private readonly prisma: PrismaService,
    private readonly cache: ForexCacheService,
  ) {
    if (!this.apiKey) {
      this.logger.warn(
        'TWELVEDATA_API_KEY is missing. Forex stream will return error events.',
      );
    }
  }

  onModuleInit() {
    void this.warmupHistory();
  }

  onModuleDestroy() {
    for (const state of this.streams.values()) {
      if (state.timer) {
        clearInterval(state.timer);
        state.timer = null;
      }
      state.subject.complete();
    }
  }

  async getSnapshot(symbol?: string, interval?: ForexInterval) {
    const normalizedSymbol = this.normalizeSymbol(symbol, this.defaultSymbol);
    const normalizedInterval = this.normalizeInterval(
      interval,
      this.defaultInterval,
    );

    const state = this.ensureState(normalizedSymbol, normalizedInterval);
    if (state.snapshot) return state.snapshot;

    const snapshot = await this.loadSnapshot(
      normalizedSymbol,
      normalizedInterval,
    );
    state.snapshot = snapshot;
    this.scheduleBackfill(normalizedSymbol, normalizedInterval);

    return snapshot;
  }

  stream(symbol?: string, interval?: ForexInterval): Observable<MessageEvent> {
    const normalizedSymbol = this.normalizeSymbol(symbol, this.defaultSymbol);
    const normalizedInterval = this.normalizeInterval(
      interval,
      this.defaultInterval,
    );

    const state = this.ensureState(normalizedSymbol, normalizedInterval);
    state.subscribers += 1;

    this.startPolling(state);
    this.scheduleBackfill(normalizedSymbol, normalizedInterval);

    const initial$ = defer(() =>
      this.getSnapshot(normalizedSymbol, normalizedInterval),
    ).pipe(
      map((snapshot) => this.toSseMessage('snapshot', snapshot)),
      catchError((error) =>
        of(this.toSseMessage('error', { message: this.toError(error) })),
      ),
    );

    const updates$ = state.subject
      .asObservable()
      .pipe(map((snapshot) => this.toSseMessage('candle', snapshot)));

    return new Observable<MessageEvent>((subscriber) => {
      const subscription = concat(initial$, updates$).subscribe(subscriber);

      return () => {
        state.subscribers = Math.max(0, state.subscribers - 1);
        if (state.subscribers === 0) {
          this.stopPolling(state);
        }
        subscription.unsubscribe();
      };
    });
  }

  private toSseMessage(type: string, data: string | object): MessageEvent {
    return { type, data };
  }

  private ensureState(symbol: string, interval: ForexInterval) {
    const key = this.toStreamKey(symbol, interval);
    const existing = this.streams.get(key);
    if (existing) return existing;

    const created: StreamState = {
      symbol,
      interval,
      snapshot: null,
      subject: new Subject<ForexSnapshot>(),
      timer: null,
      subscribers: 0,
    };

    this.streams.set(key, created);
    return created;
  }

  private startPolling(state: StreamState) {
    if (state.timer) return;

    // First sync immediately, then continue by interval.
    void this.refreshState(state);

    state.timer = setInterval(() => {
      void this.refreshState(state);
    }, this.pollIntervalMs);
  }

  private stopPolling(state: StreamState) {
    if (!state.timer) return;
    clearInterval(state.timer);
    state.timer = null;
  }

  private async refreshState(state: StreamState) {
    try {
      const latestFromApi = await this.fetchTimeSeries(
        state.symbol,
        state.interval,
        this.tailFetchSize,
      );

      if (latestFromApi.length) {
        await this.saveCandlesToDb(state.symbol, state.interval, latestFromApi);
      }

      await this.markSyncSuccess(state.symbol, state.interval);
    } catch (error) {
      await this.markSyncFailure(
        state.symbol,
        state.interval,
        this.toError(error),
      );
      this.logger.warn(
        `Polling failed for ${state.symbol} ${state.interval}: ${this.toError(error)}`,
      );
    }

    await this.publishLatestSnapshot(state, true);
    this.scheduleBackfill(state.symbol, state.interval);
  }

  private async loadSnapshot(symbol: string, interval: ForexInterval) {
    const cacheKey = this.toCacheKey(symbol, interval);
    const syncState = await this.getSyncState(symbol, interval);

    const fromCache = await this.cache.getJson<ForexSnapshot>(cacheKey);
    if (fromCache?.candles?.length) {
      return this.withSyncMeta(fromCache, syncState);
    }

    let candles = await this.loadCandlesFromDb(
      symbol,
      interval,
      this.historySize,
    );

    if (!candles.length) {
      try {
        const initial = await this.fetchTimeSeries(
          symbol,
          interval,
          this.historySize,
        );
        if (initial.length) {
          await this.saveCandlesToDb(symbol, interval, initial);
          await this.markSyncSuccess(symbol, interval);
        }
      } catch (error) {
        await this.markSyncFailure(symbol, interval, this.toError(error));
      }

      candles = await this.loadCandlesFromDb(
        symbol,
        interval,
        this.historySize,
      );
    }

    if (!candles.length) {
      throw new Error(`No forex candles available for ${symbol} ${interval}`);
    }

    const latestSyncState = await this.getSyncState(symbol, interval);
    const snapshot = this.buildSnapshot(
      symbol,
      interval,
      candles,
      latestSyncState,
    );
    await this.cache.setJson(cacheKey, snapshot);

    return snapshot;
  }

  private async publishLatestSnapshot(state: StreamState, emit: boolean) {
    const candles = await this.loadCandlesFromDb(
      state.symbol,
      state.interval,
      this.historySize,
    );
    if (!candles.length) return null;

    const syncState = await this.getSyncState(state.symbol, state.interval);
    const snapshot = this.buildSnapshot(
      state.symbol,
      state.interval,
      candles,
      syncState,
    );

    state.snapshot = snapshot;
    await this.cache.setJson(
      this.toCacheKey(state.symbol, state.interval),
      snapshot,
    );

    if (emit) {
      state.subject.next(snapshot);
    }

    return snapshot;
  }

  private scheduleBackfill(symbol: string, interval: ForexInterval) {
    const key = this.toStreamKey(symbol, interval);
    if (this.runningBackfills.has(key)) return;

    this.runningBackfills.add(key);

    void this.runBackfill(symbol, interval)
      .catch((error) => {
        this.logger.warn(
          `Backfill failed for ${symbol} ${interval}: ${this.toError(error)}`,
        );
      })
      .finally(() => {
        this.runningBackfills.delete(key);
      });
  }

  private async runBackfill(symbol: string, interval: ForexInterval) {
    const syncState = await this.getSyncState(symbol, interval);
    if (syncState.backfillCompleted) return;

    let oldestCandleTime =
      syncState.oldestCandleTime ??
      (await this.getOldestCandleTimeFromDb(symbol, interval));

    if (!oldestCandleTime) {
      // No local history yet: loadSnapshot/refresh will create initial candles first.
      return;
    }

    let cursorUnix = Math.floor(oldestCandleTime.getTime() / 1000) - 1;
    let requestsUsed = 0;

    while (requestsUsed < this.backfillMaxRequests) {
      requestsUsed += 1;

      let olderChunk: ForexCandle[] = [];
      try {
        olderChunk = await this.fetchTimeSeries(
          symbol,
          interval,
          this.backfillChunkSize,
          this.toTwelveDataDateTime(cursorUnix),
        );
      } catch (error) {
        await this.markSyncFailure(symbol, interval, this.toError(error));
        throw error;
      }

      if (!olderChunk.length) {
        await this.markBackfillCompleted(symbol, interval, oldestCandleTime);
        break;
      }

      await this.saveCandlesToDb(symbol, interval, olderChunk);

      const chunkOldestUnix = olderChunk[0].time;
      oldestCandleTime = new Date(chunkOldestUnix * 1000);
      await this.markBackfillProgress(symbol, interval, oldestCandleTime);

      if (olderChunk.length < this.backfillChunkSize) {
        await this.markBackfillCompleted(symbol, interval, oldestCandleTime);
        break;
      }

      if (chunkOldestUnix >= cursorUnix) {
        this.logger.warn(
          `Backfill cursor did not move for ${symbol} ${interval}. Stopping current run.`,
        );
        break;
      }

      cursorUnix = chunkOldestUnix - 1;
    }

    const stream = this.streams.get(this.toStreamKey(symbol, interval));
    if (stream?.subscribers) {
      await this.publishLatestSnapshot(stream, true);
    }
  }

  private async warmupHistory() {
    for (const symbol of this.warmupSymbols) {
      for (const interval of this.warmupIntervals) {
        try {
          await this.loadSnapshot(symbol, interval);
          this.scheduleBackfill(symbol, interval);
        } catch (error) {
          this.logger.warn(
            `Warmup failed for ${symbol} ${interval}: ${this.toError(error)}`,
          );
        }
      }
    }
  }

  private async getOldestCandleTimeFromDb(
    symbol: string,
    interval: ForexInterval,
  ) {
    const row = await this.prisma.forexCandle.findFirst({
      where: { symbol, interval },
      select: { time: true },
      orderBy: { time: 'asc' },
    });

    return row?.time ?? null;
  }

  private async getSyncState(
    symbol: string,
    interval: ForexInterval,
  ): Promise<ForexSyncStateRecord> {
    return this.prisma.forexSyncState.upsert({
      where: {
        symbol_interval: {
          symbol,
          interval,
        },
      },
      create: {
        symbol,
        interval,
      },
      update: {},
      select: {
        backfillCompleted: true,
        oldestCandleTime: true,
        staleSince: true,
        sourceUnavailable: true,
        lastSuccessfulSyncAt: true,
        lastFailedSyncAt: true,
        lastErrorMessage: true,
      },
    });
  }

  private async markSyncSuccess(symbol: string, interval: ForexInterval) {
    const now = new Date();

    await this.prisma.forexSyncState.upsert({
      where: {
        symbol_interval: {
          symbol,
          interval,
        },
      },
      create: {
        symbol,
        interval,
        sourceUnavailable: false,
        staleSince: null,
        lastSuccessfulSyncAt: now,
        lastErrorMessage: null,
      },
      update: {
        sourceUnavailable: false,
        staleSince: null,
        lastSuccessfulSyncAt: now,
        lastErrorMessage: null,
      },
    });
  }

  private async markSyncFailure(
    symbol: string,
    interval: ForexInterval,
    errorMessage: string,
  ) {
    const now = new Date();
    const current = await this.getSyncState(symbol, interval);

    await this.prisma.forexSyncState.upsert({
      where: {
        symbol_interval: {
          symbol,
          interval,
        },
      },
      create: {
        symbol,
        interval,
        sourceUnavailable: true,
        staleSince: now,
        lastFailedSyncAt: now,
        lastErrorMessage: errorMessage,
      },
      update: {
        sourceUnavailable: true,
        staleSince: current.staleSince ?? now,
        lastFailedSyncAt: now,
        lastErrorMessage: errorMessage,
      },
    });
  }

  private async markBackfillProgress(
    symbol: string,
    interval: ForexInterval,
    oldestCandleTime: Date,
  ) {
    const current = await this.getSyncState(symbol, interval);
    const currentOldest = current.oldestCandleTime;
    const nextOldest =
      currentOldest && currentOldest.getTime() < oldestCandleTime.getTime()
        ? currentOldest
        : oldestCandleTime;

    await this.prisma.forexSyncState.upsert({
      where: {
        symbol_interval: {
          symbol,
          interval,
        },
      },
      create: {
        symbol,
        interval,
        backfillCompleted: false,
        oldestCandleTime: nextOldest,
        lastBackfillAt: new Date(),
      },
      update: {
        backfillCompleted: false,
        oldestCandleTime: nextOldest,
        lastBackfillAt: new Date(),
      },
    });
  }

  private async markBackfillCompleted(
    symbol: string,
    interval: ForexInterval,
    oldestCandleTime: Date | null,
  ) {
    await this.prisma.forexSyncState.upsert({
      where: {
        symbol_interval: {
          symbol,
          interval,
        },
      },
      create: {
        symbol,
        interval,
        backfillCompleted: true,
        oldestCandleTime,
        lastBackfillAt: new Date(),
      },
      update: {
        backfillCompleted: true,
        oldestCandleTime,
        lastBackfillAt: new Date(),
      },
    });
  }

  private async loadCandlesFromDb(
    symbol: string,
    interval: ForexInterval,
    limit: number,
  ) {
    const rows = await this.prisma.forexCandle.findMany({
      where: { symbol, interval },
      orderBy: { time: 'desc' },
      take: limit,
    });

    return rows
      .slice()
      .reverse()
      .map((row) => ({
        time: Math.floor(new Date(row.time).getTime() / 1000),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: row.volume === null ? null : Number(row.volume),
      })) satisfies ForexCandle[];
  }

  private async saveCandlesToDb(
    symbol: string,
    interval: ForexInterval,
    candles: ForexCandle[],
  ) {
    for (const candle of candles) {
      await this.prisma.forexCandle.upsert({
        where: {
          symbol_interval_time: {
            symbol,
            interval,
            time: new Date(candle.time * 1000),
          },
        },
        create: {
          symbol,
          interval,
          time: new Date(candle.time * 1000),
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume ?? null,
        },
        update: {
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume ?? null,
        },
      });
    }
  }

  private async fetchTimeSeries(
    symbol: string,
    interval: ForexInterval,
    outputSize: number,
    endDate?: string,
  ) {
    if (!this.apiKey) {
      throw new Error('TWELVEDATA_API_KEY is missing');
    }

    const { data } = await this.http.axiosRef.get<TwelvedataTimeSeriesResponse>(
      `${this.baseUrl}/time_series`,
      {
        params: {
          symbol,
          interval,
          outputsize: outputSize,
          timezone: 'UTC',
          format: 'JSON',
          apikey: this.apiKey,
          ...(endDate ? { end_date: endDate } : {}),
        },
      },
    );

    if (data?.status === 'error') {
      const detail = data?.message ?? `Twelve Data error code ${data?.code}`;
      throw new Error(detail);
    }

    return (data?.values ?? [])
      .map((value) => this.parseCandle(value))
      .filter((item): item is ForexCandle => item !== null)
      .sort((a, b) => a.time - b.time);
  }

  private parseCandle(value: TwelvedataTimeSeriesValue): ForexCandle | null {
    if (!value?.datetime) return null;

    const open = Number(value.open);
    const high = Number(value.high);
    const low = Number(value.low);
    const close = Number(value.close);
    const volume = value.volume == null ? null : Number(value.volume);

    if (
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close)
    ) {
      return null;
    }

    const time = this.toUnixSeconds(value.datetime);
    if (!Number.isFinite(time)) return null;

    return {
      time,
      open,
      high,
      low,
      close,
      volume: volume === null || !Number.isFinite(volume) ? null : volume,
    };
  }

  private buildSnapshot(
    symbol: string,
    interval: ForexInterval,
    candles: ForexCandle[],
    syncState: ForexSyncStateRecord,
  ) {
    const lastPrice = candles[candles.length - 1]?.close ?? 0;

    return {
      symbol,
      interval,
      updatedAt: new Date().toISOString(),
      lastPrice,
      candles,
      stale: syncState.sourceUnavailable,
      sourceUnavailable: syncState.sourceUnavailable,
      backfillCompleted: syncState.backfillCompleted,
      lastSuccessfulSyncAt:
        syncState.lastSuccessfulSyncAt?.toISOString() ?? null,
      lastFailedSyncAt: syncState.lastFailedSyncAt?.toISOString() ?? null,
      lastErrorMessage: syncState.lastErrorMessage,
    } satisfies ForexSnapshot;
  }

  private withSyncMeta(
    snapshot: ForexSnapshot,
    syncState: ForexSyncStateRecord,
  ): ForexSnapshot {
    return {
      ...snapshot,
      stale: syncState.sourceUnavailable,
      sourceUnavailable: syncState.sourceUnavailable,
      backfillCompleted: syncState.backfillCompleted,
      lastSuccessfulSyncAt:
        syncState.lastSuccessfulSyncAt?.toISOString() ?? null,
      lastFailedSyncAt: syncState.lastFailedSyncAt?.toISOString() ?? null,
      lastErrorMessage: syncState.lastErrorMessage,
    };
  }

  private toUnixSeconds(datetime: string) {
    const iso = datetime.replace(' ', 'T');
    const ms = Date.parse(`${iso}Z`);
    if (!Number.isFinite(ms)) return NaN;

    return Math.floor(ms / 1000);
  }

  private toTwelveDataDateTime(unixSeconds: number) {
    return new Date(unixSeconds * 1000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ');
  }

  private normalizeSymbol(symbol: string | undefined, fallback: string) {
    const normalized = (symbol ?? fallback).trim().toUpperCase();
    return normalized.length > 0 ? normalized : fallback;
  }

  private normalizeInterval(
    interval: string | undefined,
    fallback: ForexInterval,
  ): ForexInterval {
    if (!interval) return fallback;

    const normalized = interval.trim() as ForexInterval;
    return FOREX_INTERVALS.includes(normalized) ? normalized : fallback;
  }

  private parseSymbols(raw: string | undefined, fallback: string[]) {
    if (!raw) return fallback;

    const parsed = raw
      .split(',')
      .map((item) => this.normalizeSymbol(item, ''))
      .filter((item) => item.length > 0);

    return parsed.length ? parsed : fallback;
  }

  private parseIntervals(raw: string | undefined, fallback: ForexInterval[]) {
    if (!raw) return fallback;

    const parsed = raw
      .split(',')
      .map((item) => item.trim() as ForexInterval)
      .filter((item) => FOREX_INTERVALS.includes(item));

    return parsed.length ? parsed : fallback;
  }

  private toStreamKey(symbol: string, interval: ForexInterval) {
    return `${symbol}|${interval}`;
  }

  private toCacheKey(symbol: string, interval: ForexInterval) {
    return `forex:snapshot:${symbol}:${interval}:${this.historySize}`;
  }

  private parsePositiveInt(raw: string | undefined, fallback: number) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return Math.floor(value);
  }

  private toError(error: unknown) {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}
