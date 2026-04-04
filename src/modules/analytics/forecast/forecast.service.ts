import {
  getLastNDaysRange,
  getPeriodRange,
} from '@/common/helpers/get-current-month-range';
import { AccountsService } from '@/modules/app/accounts/accounts.service';
import { TransactionsService } from '@/modules/app/transactions/transactions.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ForecastService {
  constructor(
    private prisma: PrismaService,
    private accountsService: AccountsService,
    private transactionsService: TransactionsService,
  ) {}

  async getCurrentMonthForecast(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new Error('User not found');
    }

    const defaultCurrency = user?.defaultCurrency;
    // const userAccounts = await this.prisma.account.findMany({
    //   where: { userId },
    // });

    const currentMonthRange = getPeriodRange('month');
    const last7DaysRange = getLastNDaysRange(7);

    const transactionInThisMonth =
      await this.transactionsService.getUserTransactionsConverted(
        userId,
        ['EXPENSE'],
        currentMonthRange.periodStart,
        currentMonthRange.periodEnd,
      );

    const transactionsInLast7Days =
      await this.transactionsService.getUserTransactionsConverted(
        userId,
        ['EXPENSE'],
        last7DaysRange.periodStart,
        last7DaysRange.periodEnd,
      );

    const accountsTotalBalance =
      await this.accountsService.getUserAccountsTotalBalance(userId);

    const spentSoFar = transactionInThisMonth.items.reduce(
      (sum, tx) => sum + Number(tx.convertedAmount ?? 0),
      0,
    ); // Сумма всех расходов за текущий месяц.

    const recent7Spent = transactionsInLast7Days.items.reduce(
      (sum, tx) => sum + Number(tx.convertedAmount ?? 0),
      0,
    ); // Сумма свежих расходов за неделю.

    const now = new Date();
    const daysPassed = now.getDate();

    const daysInMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
    ).getDate();

    const daysRemaining = daysInMonth - daysPassed;

    const monthAvg = spentSoFar / Math.max(daysPassed, 1); // Средний расход в день по месяцу

    const recentPeriodDays = Math.min(daysPassed, 7);
    const recent7Avg = recent7Spent / Math.max(recentPeriodDays, 1); //Средний расход в день по свежему периоду:

    const blendedDailyExpense = monthAvg * 0.4 + recent7Avg * 0.6;

    const forecastFutureExpense = blendedDailyExpense * daysRemaining; // Сколько, вероятно, ещё потратит до конца месяца.

    const projectedEndBalance =
      (accountsTotalBalance.total ?? 0) - forecastFutureExpense; // Сколько, вероятно, останется к концу месяца.

    return {
      currency: defaultCurrency,
      currentBalance: accountsTotalBalance.total ?? 0,
      spentSoFar,
      recent7Spent,
      monthAvg,
      recent7Avg,
      blendedDailyExpense,
      forecastFutureExpense,
      projectedEndBalance,
      daysPassed,
      daysRemaining,
      basedOnTransactionsCount: transactionInThisMonth.items.length,
      confidence: this.getConfidence(transactionInThisMonth.items.length),
    };
  }

  private getConfidence(transactionsCount: number): 'low' | 'medium' | 'high' {
    if (transactionsCount < 5) return 'low';
    if (transactionsCount < 15) return 'medium';
    return 'high';
  }
}
