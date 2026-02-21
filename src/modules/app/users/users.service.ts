import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { HashService } from 'src/modules/crypto/hash.service';
import { MAX_ACCOUNTS_PER_USER } from 'src/common/constants/const';

@Injectable()
export class UsersService {
  private prisma: PrismaService;
  private hashService: HashService;
  constructor(prisma: PrismaService, hashService: HashService) {
    this.prisma = prisma;
    this.hashService = hashService;
  }

  async getUsers() {
    return this.prisma.user.findMany();
  }

  async create(dto: CreateUserDto) {
    const passwordHash = await this.hashService.hashPassword(dto.password);

    return await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    return this.prisma.user.update({
      where: {
        id,
      },
      data: {
        email: dto.email ?? undefined,
        firstName: dto.firstName ?? undefined,
        lastName: dto.lastName ?? undefined,
        passwordHash:
          dto.password !== undefined
            ? await this.hashService.hashPassword(dto.password)
            : undefined,
      },
    });
  }

  // --------- Accounts ----------

  async getUserAccounts(userId: string) {
    return this.prisma.account.findMany({
      where: {
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
