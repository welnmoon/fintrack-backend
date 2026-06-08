import { MAX_ACCOUNTS_PER_USER } from '../../../common/constants/account';
import { DEFAULT_ACCOUNT_BACKGROUND_KEY } from '../../../common/constants/account-backgrounds';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Currency } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { calcAccountBalance } from './lib/calc-account-balance';
import { MoneyConversionService } from '../../fx/money-conversion.service';
import { SetAccountBalanceDto } from './dto/set-account-balance.dto';
import { UpdateAccountBackgroundDto } from './dto/update-account-background.dto';

@Injectable()
export class AccountsService {
  private prisma: PrismaService;
  constructor(
    prisma: PrismaService,
    private readonly moneyConversionService: MoneyConversionService,
  ) {
    this.prisma = prisma;
  }

  async getUserAccounts(userId: string) {
    const [user, accounts] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { defaultCurrency: true },
      }),
      this.prisma.account.findMany({
        where: { userId, isArchived: false },
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
      }),
    ]);

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
        backgroundKey: account.backgroundKey,
        accountNumber: account.accountNumber,
        initialBalance: Number(account.initialBalance),
        balance,
      };
    });

    const targetCurrency = user?.defaultCurrency ?? 'KZT';
    const converted = await this.moneyConversionService.convertItems(
      accountsWithBalance.map((account) => ({
        amount: account.balance,
        currency: account.currency,
      })),
      targetCurrency,
    );

    return accountsWithBalance.map((account, index) => ({
      ...account,
      convertedBalance:
        converted.items[index]?.convertedAmount ?? account.balance,
      convertedCurrency: targetCurrency,
      isArchived: false,
      archivedAt: null,
    }));
  }

  async getArchivedAccounts(userId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { userId, isArchived: true },
      orderBy: [{ archivedAt: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        name: true,
        currency: true,
        type: true,
        backgroundKey: true,
        accountNumber: true,
        initialBalance: true,
        isArchived: true,
        archivedAt: true,
      },
    });

    return accounts.map((account) => ({
      ...account,
      initialBalance: Number(account.initialBalance),
      balance: 0,
      convertedBalance: 0,
      convertedCurrency: account.currency,
    }));
  }

  async getUserAccountsTotalBalance(userId: string) {
    const [user, accounts] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { defaultCurrency: true },
      }),
      this.prisma.account.findMany({
        where: { userId, isArchived: false },
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

    const target = user?.defaultCurrency ?? 'KZT';

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

    const summary = await this.moneyConversionService.sumItems(
      balances.map((item) => ({
        amount: item.balance,
        currency: item.currency,
      })),
      target,
    );

    return {
      currency: target,
      total: summary.total,
      fxUnavailable: summary.fxUnavailable,
      fxStale: summary.fxStale,
      totalsByCurrency,
    };
  }

  async getAccountById(userId: string, accountId: string) {
    return this.prisma.account.findFirst({
      where: {
        id: accountId,
        userId,
        isArchived: false,
      },
    });
  }

  async createAccount(userId: string, dto: CreateAccountDto) {
    try {
      const existingAccountsCount = await this.prisma.account.count({
        where: { userId, isArchived: false },
      });

      // if (existingAccountsCount >= MAX_ACCOUNTS_PER_USER) {
      //   throw new BadRequestException(
      //     `User cannot have more than ${MAX_ACCOUNTS_PER_USER} accounts`,
      //   );
      // }

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
            backgroundKey: dto.backgroundKey ?? DEFAULT_ACCOUNT_BACKGROUND_KEY,
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
            backgroundKey: true,
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
      // console.log('error creating account', e?.code, e?.meta, e);
      if (e instanceof BadRequestException) {
        throw e;
      }
      throw new ConflictException('Failed to create account');
    }
  }

  async getAccountOptions(userId: string) {
    return this.prisma.account.findMany({
      where: { userId, isArchived: false },
      select: {
        id: true,
        name: true,
        type: true,
        currency: true,
        backgroundKey: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async updateAccountBackground(
    userId: string,
    accountId: string,
    dto: UpdateAccountBackgroundDto,
  ) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId, isArchived: false },
      select: { id: true },
    });

    if (!account) {
      throw new BadRequestException('Account not found');
    }

    return this.prisma.account.update({
      where: { id: accountId },
      data: {
        backgroundKey: dto.backgroundKey,
      },
      select: {
        id: true,
        backgroundKey: true,
      },
    });
  }

  async setAccountBalance(
    userId: string,
    accountId: string,
    dto: SetAccountBalanceDto,
  ) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId, isArchived: false },
      select: { id: true },
    });

    if (!account) {
      throw new BadRequestException('Account not found');
    }

    const [latestTransaction, latestTransferOut, latestTransferIn] =
      await Promise.all([
        this.prisma.transaction.findFirst({
          where: { userId, accountId },
          orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
          select: { occurredAt: true },
        }),
        this.prisma.transfer.findFirst({
          where: { userId, fromAccountId: accountId, isCanceled: false },
          orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
          select: { occurredAt: true },
        }),
        this.prisma.transfer.findFirst({
          where: { userId, toAccountId: accountId, isCanceled: false },
          orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
          select: { occurredAt: true },
        }),
      ]);

    const nowMs = Date.now();
    const latestActivityMs = Math.max(
      latestTransaction?.occurredAt.getTime() ?? 0,
      latestTransferOut?.occurredAt.getTime() ?? 0,
      latestTransferIn?.occurredAt.getTime() ?? 0,
    );

    const occurredAt = new Date(
      latestActivityMs >= nowMs ? latestActivityMs + 1 : nowMs,
    );

    return this.prisma.transaction.create({
      data: {
        userId,
        accountId,
        categoryId: null,
        type: 'ADJUSTMENT',
        amount: dto.amount,
        occurredAt,
        note: dto.note?.trim() || null,
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
  }

  async deleteAccount(userId: string, accountId: string) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId },
      select: {
        id: true,
        name: true,
      },
    });

    if (!account) {
      throw new BadRequestException('Account not found');
    }

    const [transactionsCount, transfersCount] = await Promise.all([
      this.prisma.transaction.count({
        where: { userId, accountId },
      }),
      this.prisma.transfer.count({
        where: {
          userId,
          OR: [{ fromAccountId: accountId }, { toAccountId: accountId }],
        },
      }),
    ]);

    if (transactionsCount > 0 || transfersCount > 0) {
      throw new BadRequestException(
        'Only empty accounts without transactions or transfers can be deleted',
      );
    }

    await this.prisma.account.delete({
      where: { id: accountId },
    });

    return {
      id: account.id,
      deleted: true,
    };
  }

  async archiveAccount(userId: string, accountId: string) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId },
      select: {
        id: true,
        name: true,
        isArchived: true,
      },
    });

    if (!account) {
      throw new BadRequestException('Account not found');
    }

    if (account.isArchived) {
      throw new BadRequestException('Account already archived');
    }

    const archivedAt = new Date();

    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id: accountId },
        data: {
          isArchived: true,
          archivedAt,
        },
      }),
      this.prisma.user.updateMany({
        where: { id: userId, defaultAccountId: accountId },
        data: { defaultAccountId: null },
      }),
    ]);

    return {
      id: account.id,
      archived: true,
      archivedAt,
    };
  }

  async unarchiveAccount(userId: string, accountId: string) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId },
      select: {
        id: true,
        name: true,
        isArchived: true,
      },
    });

    if (!account) {
      throw new BadRequestException('Account not found');
    }

    if (!account.isArchived) {
      throw new BadRequestException('Account is already active');
    }

    const activeAccountsCount = await this.prisma.account.count({
      where: { userId, isArchived: false },
    });

    if (activeAccountsCount >= MAX_ACCOUNTS_PER_USER) {
      throw new BadRequestException(
        `User cannot have more than ${MAX_ACCOUNTS_PER_USER} active accounts`,
      );
    }

    await this.prisma.account.update({
      where: { id: accountId },
      data: {
        isArchived: false,
        archivedAt: null,
      },
    });

    return {
      id: account.id,
      unarchived: true,
    };
  }
}
