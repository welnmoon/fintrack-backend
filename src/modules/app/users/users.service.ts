import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { HashService } from 'src/modules/crypto/hash.service';

@Injectable()
export class UsersService {
  private prisma: PrismaService;
  private hashService: HashService;
  constructor(prisma: PrismaService, hashService: HashService) {
    this.prisma = prisma;
    this.hashService = hashService;
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return user;
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
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
        ...(dto.defaultCurrency !== undefined
          ? { defaultCurrency: dto.defaultCurrency }
          : {}),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        defaultCurrency: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
