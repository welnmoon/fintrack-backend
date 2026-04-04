export const FOREX_INTERVALS = [
  '1min',
  '5min',
  '15min',
  '1h',
  '4h',
  '1day',
] as const;

export type ForexInterval = (typeof FOREX_INTERVALS)[number];

export type ForexCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
};

export type ForexSnapshot = {
  symbol: string;
  interval: ForexInterval;
  updatedAt: string;
  lastPrice: number;
  candles: ForexCandle[];
  stale: boolean;
  sourceUnavailable: boolean;
  backfillCompleted: boolean;
  lastSuccessfulSyncAt: string | null;
  lastFailedSyncAt: string | null;
  lastErrorMessage: string | null;
};
