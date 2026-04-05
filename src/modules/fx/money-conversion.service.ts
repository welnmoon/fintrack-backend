import { Currency } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { FxService } from './fx.service';

type MoneyItem = {
  amount: number;
  currency: Currency;
};

export type ConvertedMoneyItem<T extends MoneyItem> = T & {
  convertedAmount: number;
  targetCurrency: Currency;
};

export type MoneyConversionResult<T extends MoneyItem> = {
  items: ConvertedMoneyItem<T>[];
  fxUnavailable: boolean;
  fxStale: boolean;
};

@Injectable()
export class MoneyConversionService {
  constructor(private readonly fxService: FxService) {}

  async convertItems<T extends MoneyItem>(
    items: T[],
    targetCurrency: Currency,
  ): Promise<MoneyConversionResult<T>> {
    if (!items.length) {
      return {
        items: [],
        fxUnavailable: false,
        fxStale: false,
      };
    }

    const conversionRates = new Map<Currency, number>();
    conversionRates.set(targetCurrency, 1);

    let fxUnavailable = false;
    let fxStale = false;

    const currenciesToConvert = [
      ...new Set(items.map((item) => item.currency)),
    ].filter((currency) => currency !== targetCurrency);

    for (const currency of currenciesToConvert) {
      try {
        const { rate, stale } = await this.fxService.getRateWithMeta(
          currency,
          targetCurrency,
        );

        conversionRates.set(currency, rate);
        if (stale) {
          fxStale = true;
        }
      } catch {
        fxUnavailable = true;
        break;
      }
    }

    return {
      items: items.map((item) => {
        const rate = conversionRates.get(item.currency);
        const convertedAmount =
          fxUnavailable || rate === undefined
            ? this.round2(item.amount)
            : this.round2(item.amount * rate);

        return {
          ...item,
          convertedAmount,
          targetCurrency,
        };
      }),
      fxUnavailable,
      fxStale,
    };
  }

  async sumItems<T extends MoneyItem>(items: T[], targetCurrency: Currency) {
    const totalsByCurrency = items.reduce(
      (acc, item) => {
        acc[item.currency] = this.round2((acc[item.currency] ?? 0) + item.amount);
        return acc;
      },
      {} as Record<Currency, number>,
    );

    const converted = await this.convertItems(items, targetCurrency);

    return {
      currency: targetCurrency,
      total: converted.fxUnavailable
        ? null
        : this.round2(
            converted.items.reduce((sum, item) => sum + item.convertedAmount, 0),
          ),
      fxUnavailable: converted.fxUnavailable,
      fxStale: converted.fxStale,
      totalsByCurrency,
      items: converted.items,
    };
  }

  private round2(value: number) {
    return Number(value.toFixed(2));
  }
}
