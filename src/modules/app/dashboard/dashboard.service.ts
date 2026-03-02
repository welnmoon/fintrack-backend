import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { TransactionsService } from '../transactions/transactions.service';
import { CategoriesService } from '../categories/categories.service';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private accountService: AccountsService,
    private transactionService: TransactionsService,
    private categoriesService: CategoriesService,
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
}
