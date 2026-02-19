import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Prisma } from '@prisma/client';
import { HashService } from 'src/modules/crypto/hash.service';

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
    try {
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
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('User with this email already exists');
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateUserDto) {
    // TODO: проверка полей на undefined, чтобы не перезаписывать существующие данные на null
    // const data: UpdateUserDto = {};

    // if (dto.email !== undefined) data.email = dto.email;
    // if (dto.firstName !== undefined) data.firstName = dto.firstName;
    // if (dto.lastName !== undefined) data.lastName = dto.lastName;
    // if (dto.password !== undefined)
    //   data.password = await this.hashService.hashPassword(dto.password);

    return this.prisma.user.update({
      where: {
        id,
      },
      data: {
        email: dto.email ? dto.email : undefined,
        firstName: dto.firstName ? dto.firstName : undefined,
        lastName: dto.lastName ? dto.lastName : undefined,
        passwordHash: dto.password
          ? await this.hashService.hashPassword(dto.password)
          : undefined,
      },
    });
  }
}
