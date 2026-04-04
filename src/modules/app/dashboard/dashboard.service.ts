import { Injectable } from '@nestjs/common';
import { Currency, TransactionType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { TransactionsService } from '../transactions/transactions.service';
import { CategoriesService } from '../categories/categories.service';
import { FxService } from '../../fx/fx.service';

export type BalanceHistoryInterval = 'day' | 'week' | 'month';

type HistoryBucket = {
  periodStart: Date;
  periodEnd: Date;
};

type AccountEventKind =
  | TransactionType
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT';

type AccountEvent = {
  at: Date;
  kind: AccountEventKind;
  amount: number;
};

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private accountService: AccountsService,
    private transactionService: TransactionsService,
    private categoriesService: CategoriesService,
    private fxService: FxService,
  ) {}

  async getDashboard(
    userId: string,
    periodStart?: Date,
    periodEnd?: Date,
    limit = 10,
  ) {
    const accountsTotalBalance =
      await this.accountService.getUserAccountsTotalBalance(userId);

    const expenseAndIncomes =
      await this.transactionService.getCurrentMonthIncomeExpense(userId);

    const lastTransactions =
      await this.transactionService.getLastTransactions(userId);

    const expensePie = await this.categoriesService.getExpensePie(
      userId,
      limit,
      periodStart,
      periodEnd,
    );

    return {
      accountsTotalBalance,
      expenseAndIncomes,
      lastTransactions,
      expensePie,
    };
  }

  async getExpensePie(
    userId: string,
    interval: BalanceHistoryInterval = 'month',
    limit = 10,
    from?: Date,
    to?: Date,
  ) {
    const { periodStart, periodEnd } =
      from || to
        ? this.getCustomPeriodRange(from, to)
        : this.getCurrentPeriodRange(interval);

    return this.categoriesService.getExpensePie(
      userId,
      limit,
      periodStart,
      periodEnd,
    );
  }

  async getBalanceHistory(
    userId: string,
    interval: BalanceHistoryInterval = 'day',
    points?: number,
  ) {
    const defaultPointsByInterval: Record<BalanceHistoryInterval, number> = {
      day: 30,
      week: 12,
      month: 12,
    };

    const requestedPoints = points ?? defaultPointsByInterval[interval];
    const pointsCount = Math.min(Math.max(requestedPoints, 1), 120);
    const buckets = this.buildHistoryBuckets(interval, pointsCount);
    const maxPeriodEnd = buckets.at(-1)?.periodEnd ?? new Date();

    const [user, accounts, transactions, transfers] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { defaultCurrency: true },
      }),
      this.prisma.account.findMany({
        where: { userId },
        select: { id: true, currency: true, initialBalance: true },
      }),
      this.prisma.transaction.findMany({
        where: {
          userId,
          occurredAt: { lte: maxPeriodEnd },
        },
        select: {
          accountId: true,
          type: true,
          amount: true,
          occurredAt: true,
        },
      }),
      this.prisma.transfer.findMany({
        where: {
          userId,
          isCanceled: false,
          occurredAt: { lte: maxPeriodEnd },
        },
        select: {
          fromAccountId: true,
          toAccountId: true,
          fromAmount: true,
          toAmount: true,
          occurredAt: true,
        },
      }),
    ]);

    const targetCurrency = (user?.defaultCurrency ?? 'KZT') as Currency;

    const eventsByAccount = new Map<string, AccountEvent[]>();
    for (const account of accounts) {
      eventsByAccount.set(account.id, []);
    }

    for (const tx of transactions) {
      const accountEvents = eventsByAccount.get(tx.accountId);
      if (!accountEvents) continue;
      accountEvents.push({
        at: tx.occurredAt,
        kind: tx.type,
        amount: Number(tx.amount),
      });
    }

    for (const transfer of transfers) {
      const fromAccountEvents = eventsByAccount.get(transfer.fromAccountId);
      if (fromAccountEvents) {
        fromAccountEvents.push({
          at: transfer.occurredAt,
          kind: 'TRANSFER_OUT',
          amount: Number(transfer.fromAmount),
        });
      }

      const toAccountEvents = eventsByAccount.get(transfer.toAccountId);
      if (toAccountEvents) {
        toAccountEvents.push({
          at: transfer.occurredAt,
          kind: 'TRANSFER_IN',
          amount: Number(transfer.toAmount),
        });
      }
    }

    const eventPriority: Record<AccountEventKind, number> = {
      ADJUSTMENT: 0,
      INCOME: 1,
      EXPENSE: 2,
      TRANSFER_IN: 3,
      TRANSFER_OUT: 4,
    };

    for (const accountEvents of eventsByAccount.values()) {
      accountEvents.sort((a, b) => {
        const timeDiff = a.at.getTime() - b.at.getTime();
        if (timeDiff !== 0) return timeDiff;
        return eventPriority[a.kind] - eventPriority[b.kind];
      });
    }

    const totalsByCurrencyByBucket: Array<Partial<Record<Currency, number>>> =
      buckets.map(() => ({}));

    for (const account of accounts) {
      const accountEvents = eventsByAccount.get(account.id) ?? [];
      let eventIndex = 0;
      let accountBalance = Number(account.initialBalance);

      for (let bucketIndex = 0; bucketIndex < buckets.length; bucketIndex++) {
        const bucketEndTs = buckets[bucketIndex].periodEnd.getTime();

        while (
          eventIndex < accountEvents.length &&
          accountEvents[eventIndex].at.getTime() <= bucketEndTs
        ) {
          const event = accountEvents[eventIndex];

          if (event.kind === 'ADJUSTMENT') {
            accountBalance = event.amount;
          } else if (event.kind === 'INCOME' || event.kind === 'TRANSFER_IN') {
            accountBalance += event.amount;
          } else {
            accountBalance -= event.amount;
          }

          eventIndex++;
        }

        const bucketTotals = totalsByCurrencyByBucket[bucketIndex];
        bucketTotals[account.currency] =
          Number(bucketTotals[account.currency] ?? 0) + accountBalance;
      }
    }

    const usedCurrencies = new Set<Currency>();
    for (const bucketTotals of totalsByCurrencyByBucket) {
      for (const currency of Object.keys(bucketTotals) as Currency[]) {
        usedCurrencies.add(currency);
      }
    }

    const conversionRates = new Map<Currency, number>();
    conversionRates.set(targetCurrency, 1);

    let fxUnavailable = false;
    let fxStale = false;
    const currenciesToConvert = [...usedCurrencies].filter(
      (currency) => currency !== targetCurrency,
    );

    if (currenciesToConvert.length > 0) {
      try {
        const rates = await Promise.all(
          currenciesToConvert.map(async (currency) => {
            const { rate, stale } = await this.fxService.getRateWithMeta(
              currency,
              targetCurrency,
            );
            return { currency, rate, stale };
          }),
        );

        for (const item of rates) {
          conversionRates.set(item.currency, item.rate);
          if (item.stale) {
            fxStale = true;
          }
        }
      } catch {
        fxUnavailable = true;
      }
    }

    if (!fxUnavailable) {
      for (const currency of usedCurrencies) {
        if (!conversionRates.has(currency)) {
          fxUnavailable = true;
          break;
        }
      }
    }

    const historyPoints = buckets.map((bucket, index) => {
      const rawTotals = totalsByCurrencyByBucket[index];
      const totalsByCurrency: Partial<Record<Currency, number>> = {};

      for (const currency of Object.keys(rawTotals) as Currency[]) {
        totalsByCurrency[currency] = this.round2(
          Number(rawTotals[currency] ?? 0),
        );
      }

      if (fxUnavailable) {
        let fallbackTotal = 0;
        for (const currency of Object.keys(rawTotals) as Currency[]) {
          fallbackTotal += Number(rawTotals[currency] ?? 0);
        }

        return {
          periodStart: bucket.periodStart,
          periodEnd: bucket.periodEnd,
          total: this.round2(fallbackTotal),
          totalsByCurrency,
        };
      }

      let total = 0;
      for (const currency of Object.keys(rawTotals) as Currency[]) {
        const rate = conversionRates.get(currency);
        if (rate === undefined) continue;
        total += Number(rawTotals[currency] ?? 0) * rate;
      }

      return {
        periodStart: bucket.periodStart,
        periodEnd: bucket.periodEnd,
        total: this.round2(total),
        totalsByCurrency,
      };
    });

    return {
      interval,
      currency: targetCurrency,
      fxUnavailable,
      fxStale,
      points: historyPoints,
    };
  }

  private round2(value: number) {
    return Number(value.toFixed(2));
  }

  private buildHistoryBuckets(
    interval: BalanceHistoryInterval,
    pointsCount: number,
  ): HistoryBucket[] {
    const now = new Date();
    const buckets: HistoryBucket[] = [];

    for (let offset = pointsCount - 1; offset >= 0; offset--) {
      if (interval === 'day') {
        const anchor = new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() - offset,
          ),
        );
        buckets.push({
          periodStart: this.startOfUtcDay(anchor),
          periodEnd: this.endOfUtcDay(anchor),
        });
        continue;
      }

      if (interval === 'week') {
        const anchor = new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() - offset * 7,
          ),
        );
        buckets.push({
          periodStart: this.startOfUtcWeek(anchor),
          periodEnd: this.endOfUtcWeek(anchor),
        });
        continue;
      }

      const anchor = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1),
      );
      buckets.push({
        periodStart: this.startOfUtcMonth(anchor),
        periodEnd: this.endOfUtcMonth(anchor),
      });
    }

    if (buckets.length > 0) {
      const lastBucket = buckets[buckets.length - 1];
      buckets[buckets.length - 1] = {
        ...lastBucket,
        periodEnd: now,
      };
    }

    return buckets;
  }

  private startOfUtcDay(date: Date) {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private endOfUtcDay(date: Date) {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );
  }

  private startOfUtcWeek(date: Date) {
    const dayOfWeek = date.getUTCDay();
    const daysFromMonday = (dayOfWeek + 6) % 7;
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate() - daysFromMonday,
      ),
    );
  }

  private endOfUtcWeek(date: Date) {
    const weekStart = this.startOfUtcWeek(date);
    return new Date(
      Date.UTC(
        weekStart.getUTCFullYear(),
        weekStart.getUTCMonth(),
        weekStart.getUTCDate() + 6,
        23,
        59,
        59,
        999,
      ),
    );
  }

  private startOfUtcMonth(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }

  private endOfUtcMonth(date: Date) {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      ),
    );
  }

  private getCurrentPeriodRange(interval: BalanceHistoryInterval) {
    const now = new Date();

    if (interval === 'day') {
      return {
        periodStart: this.startOfUtcDay(now),
        periodEnd: now,
      };
    }

    if (interval === 'week') {
      return {
        periodStart: this.startOfUtcWeek(now),
        periodEnd: now,
      };
    }

    return {
      periodStart: this.startOfUtcMonth(now),
      periodEnd: now,
    };
  }

  private getCustomPeriodRange(from?: Date, to?: Date) {
    const resolvedFrom = from ?? to ?? new Date();
    const resolvedTo = to ?? from ?? new Date();

    const fromDay = this.startOfUtcDay(resolvedFrom);
    const toDay = this.endOfUtcDay(resolvedTo);

    if (fromDay.getTime() <= toDay.getTime()) {
      return {
        periodStart: fromDay,
        periodEnd: toDay,
      };
    }

    return {
      periodStart: this.startOfUtcDay(resolvedTo),
      periodEnd: this.endOfUtcDay(resolvedFrom),
    };
  }
}
