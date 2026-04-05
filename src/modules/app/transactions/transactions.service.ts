import { ForbiddenException, Injectable } from '@nestjs/common';
import { Currency, TransactionType } from '@prisma/client';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { CategoriesService } from '../categories/categories.service';
import { getPeriodRange } from '../../../common/helpers/get-current-month-range';
import { PrismaService } from '../../prisma/prisma.service';
import { MoneyConversionService } from '../../fx/money-conversion.service';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(
    private prisma: PrismaService,
    private categoriesService: CategoriesService,
    private readonly moneyConversionService: MoneyConversionService,
  ) {}

  async create(dto: CreateTransactionDto, userId: string) {
    const account = await this.prisma.account.findFirst({
      where: { id: dto.accountId, userId },
      select: { id: true },
    });

    if (!account) throw new ForbiddenException('Account not found');

    const categoryId = await this.resolveCategoryId(
      userId,
      dto.type,
      dto.categoryId,
    );

    const tr = await this.prisma.transaction.create({
      data: {
        userId,
        accountId: dto.accountId,
        categoryId,
        type: dto.type,
        emotion: dto.emotion ?? null,
        amount: dto.amount,
        occurredAt: new Date(dto.occurredAt),
        note: dto.note ?? null,
      },
      select: {
        id: true,
        userId: true,
        accountId: true,
        categoryId: true,
        type: true,
        emotion: true,
        amount: true,
        occurredAt: true,
        note: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return tr;
  }

  async update(id: string, dto: UpdateTransactionDto, userId: string) {
    const current = await this.prisma.transaction.findFirst({
      where: { id, userId },
      select: {
        id: true,
        accountId: true,
        categoryId: true,
        type: true,
      },
    });

    if (!current) {
      throw new ForbiddenException('Transaction not found');
    }

    const nextAccountId = dto.accountId ?? current.accountId;
    const nextType = dto.type ?? current.type;
    const nextCategoryId = await this.resolveCategoryId(
      userId,
      nextType,
      dto.categoryId === undefined ? current.categoryId : dto.categoryId,
    );

    if (dto.accountId) {
      const account = await this.prisma.account.findFirst({
        where: { id: dto.accountId, userId },
        select: { id: true },
      });

      if (!account) {
        throw new ForbiddenException('Account not found');
      }
    }

    return this.prisma.transaction.update({
      where: { id: current.id },
      data: {
        accountId: nextAccountId,
        categoryId: nextCategoryId,
        type: nextType,
        emotion: dto.emotion === undefined ? undefined : (dto.emotion ?? null),
        amount: dto.amount,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
        note:
          dto.note === undefined ? undefined : (dto.note?.trim() || null),
      },
      select: {
        id: true,
        userId: true,
        accountId: true,
        categoryId: true,
        type: true,
        emotion: true,
        amount: true,
        occurredAt: true,
        note: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getUserTransactions(
    userId: string,
    typeFilter?: TransactionType[],
    periodStart?: Date,
    periodEnd?: Date,
  ) {
    return this.prisma.transaction.findMany({
      where: {
        userId,
        ...(periodStart || periodEnd
          ? {
              occurredAt: {
                ...(periodStart ? { gte: periodStart } : {}),
                ...(periodEnd ? { lte: periodEnd } : {}),
              },
            }
          : {}),

        ...(typeFilter?.length
          ? {
              type: {
                in: typeFilter,
              },
            }
          : {}),
      },
      orderBy: { occurredAt: 'desc' },

      select: {
        id: true,
        userId: true,
        accountId: true,
        categoryId: true,
        type: true,
        emotion: true,
        amount: true,
        occurredAt: true,
        note: true,
        account: { select: { currency: true } },
        createdAt: true,
        updatedAt: true,
        category: {
          select: {
            iconKey: true,
            colorKey: true,
            name: true,
          },
        },
      },
    });
  }

  async getCurrentMonthIncomeExpense(userId: string) {
    const { periodEnd, periodStart } = getPeriodRange('month');

    const sums = await this.prisma.transaction.groupBy({
      by: ['type'],
      where: {
        userId,
        occurredAt: { gte: periodStart, lte: periodEnd },
        type: { in: ['INCOME', 'EXPENSE'] },
      },
      _sum: { amount: true },
    });

    const income =
      sums.find((item) => item.type === 'INCOME')?._sum.amount ?? 0;
    const expense =
      sums.find((item) => item.type === 'EXPENSE')?._sum.amount ?? 0;
    const topCategories =
      await this.categoriesService.getTopIncomeExpenseCategories(
        userId,
        periodStart,
        periodEnd,
      );

    return {
      periodStart,
      periodEnd,
      income: Number(income),
      expense: Number(expense),
      ...topCategories,
    };
  }

  async getUserTransactionsConverted(
    userId: string,
    typeFilter?: TransactionType[],
    periodStart?: Date,
    periodEnd?: Date,
  ) {
    const [user, transactions] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { defaultCurrency: true },
      }),
      this.getUserTransactions(userId, typeFilter, periodStart, periodEnd),
    ]);

    const targetCurrency = (user?.defaultCurrency ?? 'KZT') as Currency;

    const converted = await this.moneyConversionService.convertItems(
      transactions.map((transaction) => ({
        ...transaction,
        amount: Number(transaction.amount),
        currency: transaction.account.currency as Currency,
      })),
      targetCurrency,
    );

    return {
      currency: targetCurrency,
      fxUnavailable: converted.fxUnavailable,
      fxStale: converted.fxStale,
      items: converted.items.map(
        ({
          amount,
          convertedAmount,
          currency,
          targetCurrency,
          ...transaction
        }) => ({
          ...transaction,
          amount,
          convertedAmount,
          originalCurrency: currency,
          currency: targetCurrency,
        }),
      ),
    };
  }

  async getLastTransactions(userId: string) {
    const tr = await this.prisma.transaction.findMany({
      where: { userId },
      select: {
        account: {
          select: {
            id: true,
            name: true,
            currency: true,
          },
        },
        category: {
          select: {
            name: true,
            id: true,
          },
        },
        type: true,
        emotion: true,

        originalAmount: true,
        amount: true,
        id: true,
        occurredAt: true,
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: 10,
    });

    return tr;
  }

  private async resolveCategoryId(
    userId: string,
    type: TransactionType,
    categoryId?: string | null,
  ) {
    if (type === 'ADJUSTMENT') {
      return null;
    }

    if (!categoryId) {
      return null;
    }

    const category = await this.prisma.category.findFirst({
      where: {
        id: categoryId,
        userId,
        type,
      },
      select: { id: true },
    });

    if (!category) {
      throw new ForbiddenException('Category not found');
    }

    return category.id;
  }
}
