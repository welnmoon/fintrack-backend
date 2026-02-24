import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { CreateTransferDto } from './dto/create-transfer.dto';

@Injectable()
export class TransfersService {
  constructor(private prisma: PrismaService) {}

  async getUserTransfers(userId: string) {
    return this.prisma.transfer.findMany({
      where: { userId },
    });
  }

  async createUserTransfers(userId: string, dto: CreateTransferDto) {
    return this.prisma.transfer.create({
      data: {
        userId,
        fromAccountId: dto.fromAccountId,
        toAccountId: dto.toAccountId,
        amount: dto.amount,
        occurredAt: new Date(),
      },
    });
  }

  async cancelUserTransfer(transferId: string) {
    return this.prisma.transfer.update({
      where: { id: transferId },
      data: { isCanceled: true },
    });
  }
}
