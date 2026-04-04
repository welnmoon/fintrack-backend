import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import {
  CATEGORY_COLOR_PRESETS,
  COLOR_KEYS,
  EXPENSE_ICON_PRESETS,
  INCOME_ICON_PRESETS,
  ICON_KEYS_BY_TYPE,
} from '../../../common/constants/category-presets';
import { CategoryType, Currency } from '@prisma/client';
import { getPeriodRange } from '../../../common/helpers/get-current-month-range';
import { FxService } from '../../fx/fx.service';

export type ExpensePieItem = {
  id: string;
  name: string;
  iconKey: string | null;
  colorKey: string | null;
  amount: number;
};

export type ExpensePieResult = {
  items: ExpensePieItem[];
  currency: Currency;
  fxUnavailable: boolean;
  fxStale: boolean;
};

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private fx: FxService,
  ) {}

  private validatePresets(
    type: CategoryType,
    dto: { iconKey?: string | null; colorKey?: string | null },
  ) {
    if (dto.iconKey) {
      const allowed = ICON_KEYS_BY_TYPE[type];
      if (!allowed.includes(dto.iconKey))
        throw new BadRequestException('Invalid iconKey for category type');
    }

    if (dto.colorKey) {
      if (!COLOR_KEYS.includes(dto.colorKey as any))
        throw new BadRequestException('Invalid colorKey');
    }
  }

  async create(userId: string, dto: CreateCategoryDto) {
    this.validatePresets(dto.type, dto);

    return this.prisma.category.create({
      data: {
        userId,
        name: dto.name.trim(),
        type: dto.type,
        iconKey: dto.iconKey ?? null,
        colorKey: dto.colorKey ?? null,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.category.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, userId },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async update(userId: string, id: string, dto: UpdateCategoryDto) {
    const current = await this.findOne(userId, id);

    const nextType = dto.type ?? current.type;
    this.validatePresets(nextType, dto);

    return this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        type: dto.type,
        iconKey: dto.iconKey === undefined ? undefined : (dto.iconKey ?? null),
        colorKey:
          dto.colorKey === undefined ? undefined : (dto.colorKey ?? null),
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.category.delete({ where: { id } });
  }

  private async getTopCategoryByType(
    userId: string,
    type: 'INCOME' | 'EXPENSE',
    periodStart: Date,
    periodEnd: Date,
  ) {
    const [top] = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        type,
        categoryId: { not: null },
        occurredAt: { gte: periodStart, lte: periodEnd },
      },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 1,
    });

    if (!top?.categoryId) return null;

    const category = await this.prisma.category.findFirst({
      where: { id: top.categoryId, userId },
      select: {
        id: true,
        name: true,
        type: true,
        iconKey: true,
        colorKey: true,
      },
    });

    if (!category) return null;

    return {
      ...category,
      amount: Number(top._sum.amount ?? 0),
    };
  }

  async getTopIncomeExpenseCategories(
    userId: string,
    periodStart: Date,
    periodEnd: Date,
  ) {
    const [topExpenseCategory, topIncomeCategory] = await Promise.all([
      this.getTopCategoryByType(userId, 'EXPENSE', periodStart, periodEnd),
      this.getTopCategoryByType(userId, 'INCOME', periodStart, periodEnd),
    ]);

    return {
      topExpenseCategory,
      topIncomeCategory,
    };
  }

  async getExpensePie(
    userId: string,
    limit: number,
    periodStart?: Date,
    periodEnd?: Date,
  ): Promise<ExpensePieResult> {
    const currentMonthRange = getPeriodRange('month');
    const periodStartDate = periodStart ?? currentMonthRange.periodStart;
    const periodEndDate = periodEnd ?? currentMonthRange.periodEnd;

    const [user, expenses] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { defaultCurrency: true },
      }),
      this.prisma.transaction.findMany({
        where: {
          userId,
          type: 'EXPENSE',
          categoryId: { not: null },
          occurredAt: { gte: periodStartDate, lte: periodEndDate },
        },
        select: {
          categoryId: true,
          amount: true,
          account: {
            select: {
              currency: true,
            },
          },
        },
      }),
    ]);

    const targetCurrency = (user?.defaultCurrency ?? 'KZT') as Currency;

    if (!expenses.length) {
      return {
        items: [],
        currency: targetCurrency,
        fxUnavailable: false,
        fxStale: false,
      };
    }

    const totalsByCategoryCurrency = new Map<
      string,
      Partial<Record<Currency, number>>
    >();

    for (const row of expenses) {
      if (!row.categoryId) continue;

      const categoryTotals =
        totalsByCategoryCurrency.get(row.categoryId) ??
        ({} as Partial<Record<Currency, number>>);

      const currency = row.account.currency as Currency;
      categoryTotals[currency] = (categoryTotals[currency] ?? 0) + Number(row.amount);
      totalsByCategoryCurrency.set(row.categoryId, categoryTotals);
    }

    const usedCurrencies = new Set<Currency>();
    for (const categoryTotals of totalsByCategoryCurrency.values()) {
      for (const currency of Object.keys(categoryTotals) as Currency[]) {
        usedCurrencies.add(currency);
      }
    }

    const conversionRates = new Map<Currency, number>();
    conversionRates.set(targetCurrency, 1);

    let fxUnavailable = false;
    let fxStale = false;

    for (const currency of usedCurrencies) {
      if (currency === targetCurrency) continue;

      try {
        const { rate, stale } = await this.fx.getRateWithMeta(
          currency,
          targetCurrency,
        );
        conversionRates.set(currency, rate);
        if (stale) {
          fxStale = true;
        }
      } catch {
        fxUnavailable = true;
      }
    }

    const categoryIds = [...totalsByCategoryCurrency.keys()];

    const categories = await this.prisma.category.findMany({
      where: { userId, id: { in: categoryIds } },
      select: { id: true, name: true, iconKey: true, colorKey: true },
    });

    const merged: ExpensePieItem[] = categoryIds.map((categoryId) => {
      const categoryTotals = totalsByCategoryCurrency.get(categoryId) ?? {};
      const category = categories.find((c) => c.id === categoryId);

      let amount = 0;

      if (fxUnavailable) {
        // Fallback mode: keep raw sums (mixed currencies) and surface fxUnavailable flag.
        for (const currency of Object.keys(categoryTotals) as Currency[]) {
          amount += Number(categoryTotals[currency] ?? 0);
        }
      } else {
        for (const currency of Object.keys(categoryTotals) as Currency[]) {
          const raw = Number(categoryTotals[currency] ?? 0);
          const rate = conversionRates.get(currency);
          if (rate === undefined) continue;
          amount += raw * rate;
        }
      }

      return {
        id: categoryId,
        name: category?.name ?? 'Unknown',
        iconKey: category?.iconKey ?? null,
        colorKey: category?.colorKey ?? null,
        amount: Number(amount.toFixed(2)),
      };
    });

    merged.sort((a, b) => b.amount - a.amount);

    const top = merged.slice(0, limit);
    const rest = merged.slice(limit);

    if (rest.length) {
      top.push({
        id: 'other',
        name: 'Other',
        iconKey: null,
        colorKey: null,
        amount: rest.reduce((s, x) => s + x.amount, 0),
      });
    }

    return {
      items: top,
      currency: targetCurrency,
      fxUnavailable,
      fxStale,
    };
  }

  async presets() {
    return {
      icons: {
        INCOME: INCOME_ICON_PRESETS,
        EXPENSE: EXPENSE_ICON_PRESETS,
      },
      colors: CATEGORY_COLOR_PRESETS,
    };
  }
}
