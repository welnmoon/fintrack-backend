import { MAX_ACCOUNTS_PER_USER } from 'src/common/constants/const';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { HashService } from 'src/modules/crypto/hash.service';
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
      where: {
        userId,
      },
    });
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
