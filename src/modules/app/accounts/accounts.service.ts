import { MAX_ACCOUNTS_PER_USER } from 'src/common/constants/account';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { calcAccountBalance } from './lib/calc-account-balance';
import { FxService } from 'src/modules/fx/fx.service';
import { Currency } from '@prisma/client';
@Injectable()
export class AccountsService {
  private prisma: PrismaService;
  constructor(
    prisma: PrismaService,
    private fx: FxService,
  ) {
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
          select: { fromAmount: true, occurredAt: true },
        },
        transfersIn: {
          where: { isCanceled: false },
          select: { toAmount: true, occurredAt: true },
        },
      },
    });

    const accountsWithBalance = accounts.map((account) => {
      const balance = calcAccountBalance({
        initialBalance: account.initialBalance,
        transactions: account.transactions,
        transfersIn: account.transfersIn,
        transfersOut: account.transfersOut,
      });

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

  async getUserAccountsTotalBalance(userId: string) {
    const [user, accounts] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { defaultCurrency: true },
      }),
      this.prisma.account.findMany({
        where: { userId },
        include: {
          transactions: {
            select: { type: true, amount: true, occurredAt: true },
          },
          transfersOut: {
            where: { isCanceled: false },
            select: { fromAmount: true, occurredAt: true },
          },
          transfersIn: {
            where: { isCanceled: false },
            select: { toAmount: true, occurredAt: true },
          },
        },
      }),
    ]);

    const target = (user?.defaultCurrency ?? 'KZT') as Currency;

    const balances = accounts.map((a) => ({
      currency: a.currency,
      balance: calcAccountBalance({
        initialBalance: a.initialBalance,
        transactions: a.transactions,
        transfersIn: a.transfersIn,
        transfersOut: a.transfersOut,
      }),
    }));

    const totalsByCurrency = balances.reduce(
      (acc, x) => {
        acc[x.currency] = (acc[x.currency] ?? 0) + x.balance;
        return acc;
      },
      {} as Record<Currency, number>,
    );

    try {
      const converted = await Promise.all(
        balances.map(async (x) => {
          const r = await this.fx.convert(x.currency, target, x.balance);
          return r.convertedAmount;
        }),
      );

      const total = converted.reduce((s, n) => s + n, 0);

      return {
        currency: target,
        total,
        fxUnavailable: false,
        totalsByCurrency,
      };
    } catch (e) {
      return {
        currency: target,
        total: null,
        fxUnavailable: true,
        totalsByCurrency,
      };
    }
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

  async getAccountOptions(userId: string) {
    console.log('get acc options: ', userId);
    return this.prisma.account.findMany({
      where: { userId },
      select: { id: true, name: true, type: true, currency: true },
      orderBy: { name: 'asc' },
    });
  }
}
