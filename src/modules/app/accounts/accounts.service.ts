import { MAX_ACCOUNTS_PER_USER } from 'src/common/constants/const';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { HashService } from 'src/modules/crypto/hash.service';
import { Decimal } from '@prisma/client/runtime/client';
@Injectable()
export class AccountsService {
  private prisma: PrismaService;
  //   private hashService: HashService;
  constructor(prisma: PrismaService) {
    this.prisma = prisma;
    // this.hashService = hashService;
  }
  async getUserAccounts(userId: string) {
    return this.prisma.account.findMany({
      where: { userId },
    });
    // const accounts = await this.prisma.account.findMany({
    //   where: { userId },
    //   select: {
    //     id: true,
    //     name: true,
    //     currency: true,
    //     initialBalance: true,
    //   },
    // });

    // const [income, expense, transferIn, transferOut] = await Promise.all([
    //   this.prisma.transaction.groupBy({
    //     by: ['accountId'],
    //     where: { userId, type: 'INCOME' },
    //     _sum: { amount: true },
    //   }),
    //   this.prisma.transaction.groupBy({
    //     by: ['accountId'],
    //     where: { userId, type: 'EXPENSE' },
    //     _sum: { amount: true },
    //   }),
    //   this.prisma.transfer.groupBy({
    //     by: ['toAccountId'],
    //     where: { userId, isCanceled: false },
    //     _sum: { amount: true },
    //   }),
    //   this.prisma.transfer.groupBy({
    //     by: ['fromAccountId'],
    //     where: { userId, isCanceled: false },
    //     _sum: { amount: true },
    //   }),
    // ]);

    // const toMap = (
    //   rows: { accountId: string; _sum: { amount: number | null } }[],
    // ) => {
    //   const map = new Map<string, number>();
    //   rows.forEach((row) => {
    //     map.set(row.accountId, row._sum.amount ?? 0);
    //   });
    //   return map;
    // };

    // const incomeMap = toMap(income);
    // const expenseMap = toMap(expense);
    // const transferInMap = toMap(transferIn);
    // const transferOutMap = toMap(transferOut);

    // return {
    //   accounts,
    //   income: incomeMap,
    //   expense: expenseMap,
    //   transferIn: transferInMap,
    //   transferOut: transferOutMap,
    // };
  }

  async getAccountById(userId: string, accountId: string) {
    return this.prisma.account.findFirst({
      where: {
        id: accountId,
        userId,
      },
    });
  }

  async createAccount(userId: string) {
    try {
      const existingAccountsCount = await this.prisma.account.count({
        where: { userId },
      });

      if (existingAccountsCount >= MAX_ACCOUNTS_PER_USER) {
        throw new BadRequestException(
          `User cannot have more than ${MAX_ACCOUNTS_PER_USER} accounts`,
        );
      }

      const account = await this.prisma.$transaction(async (prisma) => {
        const newAcc = await prisma.account.create({
          data: {
            userId,
            name: `Account #${existingAccountsCount + 1}`,
            type: 'BANK',
            currency: 'KZT',
          },
        });

        const accountNumber = `ACC${newAcc.sequence.toString().padStart(6, '0')}`;

        const updated = await prisma.account.update({
          where: { id: newAcc.id },
          data: { accountNumber },
        });
        return updated;
      });

      return account;
    } catch (e) {
      console.log('error creating account', e?.code, e?.meta, e);
      if (e instanceof BadRequestException) {
        throw e;
      }
      throw new ConflictException('Failed to create account');
    }
  }
}
