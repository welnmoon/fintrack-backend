import { MAX_ACCOUNTS_PER_USER } from 'src/common/constants/const';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
@Injectable()
export class AccountsService {
  private prisma: PrismaService;
  constructor(prisma: PrismaService) {
    this.prisma = prisma;
  }

  async getUserAccounts(userId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { userId },
      include: {
        transactions: {
          select: {
            type: true,
            amount: true,
            occurredAt: true,
          },
        },
        transfersOut: {
          where: { isCanceled: false },
          select: { amount: true, occurredAt: true },
        },
        transfersIn: {
          where: { isCanceled: false },
          select: { amount: true, occurredAt: true },
        },
      },
    });

    const accountsWithBalance = accounts.map((account) => {
      const lastAdj = account.transactions
        .filter((t) => t.type === 'ADJUSTMENT')
        .sort(
          (a, b) =>
            new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
        )
        .at(-1);

      const lastAdjustmentTimeMs = lastAdj
        ? new Date(lastAdj.occurredAt).getTime()
        : null;
      const baseBalance = lastAdj
        ? Number(lastAdj.amount)
        : Number(account.initialBalance);

      const includedTransactions = account.transactions.filter((t) => {
        if (t.type === 'ADJUSTMENT') return false;
        if (lastAdjustmentTimeMs === null) return true;
        return new Date(t.occurredAt).getTime() > lastAdjustmentTimeMs;
      });

      const incomeTotal = includedTransactions
        .filter((t) => t.type === 'INCOME')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const expenseTotal = includedTransactions
        .filter((t) => t.type === 'EXPENSE')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const transferOutTotal = account.transfersOut
        .filter((tr) =>
          lastAdjustmentTimeMs === null
            ? true
            : new Date(tr.occurredAt).getTime() > lastAdjustmentTimeMs,
        )
        .reduce((sum, tr) => sum + Number(tr.amount), 0);

      const transferInTotal = account.transfersIn
        .filter((tr) =>
          lastAdjustmentTimeMs === null
            ? true
            : new Date(tr.occurredAt).getTime() > lastAdjustmentTimeMs,
        )
        .reduce((sum, tr) => sum + Number(tr.amount), 0);

      const balance =
        baseBalance +
        incomeTotal -
        expenseTotal +
        transferInTotal -
        transferOutTotal;

      return {
        id: account.id,
        name: account.name,
        currency: account.currency,
        type: account.type,
        accountNumber: account.accountNumber,
        initialBalance: Number(account.initialBalance),
        balance,
      };
    });

    return accountsWithBalance;
  }

  async getAccountById(userId: string, accountId: string) {
    return this.prisma.account.findFirst({
      where: {
        id: accountId,
        userId,
      },
    });
  }

  async createAccount(userId: string, dto: CreateAccountDto) {
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
        const accountName = dto.name
          ? dto.name
          : `Account #${existingAccountsCount + 1}`;

        const newAcc = await prisma.account.create({
          data: {
            userId,
            name: accountName,
            type: dto.type,
            currency: dto.currency,
          },
        });

        const accountNumber = `ACC${newAcc.sequence.toString().padStart(6, '0')}`;

        const updated = await prisma.account.update({
          where: { id: newAcc.id },
          data: { accountNumber },
          select: {
            accountNumber: true,
            currency: true,
            createdAt: true,
            id: true,
            name: true,
            initialBalance: true,
            type: true,
            userId: true,
            sequence: true,
            _count: {
              select: {
                transactions: true,
              },
            },
          },
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
