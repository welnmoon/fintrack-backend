import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { FxService } from '../../fx/fx.service';
import { TransferResponse } from './types/transfer-response';

@Injectable()
export class TransfersService {
  constructor(
    private prisma: PrismaService,
    private fx: FxService,
  ) {}

  async getUserTransfers(userId: string) {
    return this.prisma.transfer.findMany({
      where: { userId },
      orderBy: { occurredAt: 'desc' },
    });
  }

  async createUserTransfer(
    userId: string,
    dto: CreateTransferDto,
  ): Promise<TransferResponse> {
    const [fromAcc, toAcc] = await Promise.all([
      this.prisma.account.findFirst({
        where: { id: dto.fromAccountId, userId },
        select: { id: true, currency: true },
      }),
      this.prisma.account.findFirst({
        where: { id: dto.toAccountId, userId },
        select: { id: true, currency: true },
      }),
    ]);

    if (!fromAcc || !toAcc) throw new ForbiddenException('Account not found');
    if (fromAcc.id === toAcc.id) throw new BadRequestException('Same account');

    const fromAmount = Number(dto.amount);
    if (!Number.isFinite(fromAmount) || fromAmount <= 0) {
      throw new BadRequestException('Invalid amount');
    }

    const { rate, convertedAmount } = await this.fx.convert(
      fromAcc.currency,
      toAcc.currency,
      fromAmount,
    );

    const transfer = await this.prisma.transfer.create({
      data: {
        userId,
        fromAccountId: fromAcc.id,
        toAccountId: toAcc.id,
        fromAmount: fromAmount,
        toAmount: convertedAmount,
        exchangeRate: rate,
        occurredAt: new Date(),
      },
      select: {
        id: true,
        userId: true,
        fromAccountId: true,
        toAccountId: true,
        fromAmount: true,
        toAmount: true,
        exchangeRate: true,
        occurredAt: true,
        note: true,
        createdAt: true,
        isCanceled: true,
      },
    });

    return {
      ...transfer,
      fromAmount: String(transfer.fromAmount),
      toAmount: String(transfer.toAmount),
      exchangeRate: String(transfer.exchangeRate),
      occurredAt: transfer.occurredAt.toISOString(),
      createdAt: transfer.createdAt.toISOString(),
    };
  }

  async cancelUserTransfer(transferId: string) {
    return this.prisma.transfer.update({
      where: { id: transferId },
      data: { isCanceled: true },
    });
  }
}
