import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

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
            icon: true,
            color: true,
            name: true,
          },
        },
      },
    });
  }
}
