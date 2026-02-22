import { Injectable } from '@nestjs/common';
import { CategoryType } from '@prisma/client';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { CategoryResponse } from './prisma/categories.select';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(name: string, type: CategoryType, userId: string) {
    try {
      return this.prisma.category.create({
        data: {
          name,
          type,
          userId,
        },
        select: {
          id: true,
          name: true,
          type: true,
          color: true,
          icon: true,
        },
      });
    } catch (e) {
      console.error('Error creating category:', e);
      throw e;
    }
  }

  async getUserCategories(
    userId: string,
    type: CategoryType | 'ALL',
  ): Promise<CategoryResponse[]> {
    return this.prisma.category.findMany({
      where: {
        userId,
        ...(type !== 'ALL' ? { type } : {}),
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        name: true,
        type: true,
        color: true,
        icon: true,
      },
    });
  }
}
