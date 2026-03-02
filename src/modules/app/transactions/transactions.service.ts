import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { CategoriesService } from '../categories/categories.service';
import { getCurrentMonthRange } from 'src/common/helpers/get-current-month-range';

@Injectable()
export class TransactionsService {
  constructor(
    private prisma: PrismaService,
    private categoriesService: CategoriesService,
  ) {}

  async create(dto: CreateTransactionDto, userId: string) {
    const account = await this.prisma.account.findFirst({
      where: { id: dto.accountId, userId },
      select: { id: true, initialBalance: true },
    });
    console.log('Create Transaction: ', dto.amount);
    if (!account) throw new ForbiddenException('Account not found');
    console.log('After checkings: ', dto.amount);

    const tr = await this.prisma.transaction.create({
      data: {
        userId,
        accountId: dto.accountId,
        categoryId: dto.type === 'ADJUSTMENT' ? null : dto.categoryId,
        type: dto.type,
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
        amount: true,
        occurredAt: true,
        note: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    console.log('TR: ', tr.amount);

    return tr;
  }

  async getUserTransactions(userId: string) {
    return this.prisma.transaction.findMany({
      where: { userId },
      orderBy: { occurredAt: 'desc' },
      select: {
        id: true,
        userId: true,
        accountId: true,
        categoryId: true,
        type: true,
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
    const { periodEnd, periodStart } = getCurrentMonthRange();

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
}
