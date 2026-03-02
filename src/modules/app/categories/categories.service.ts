import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import {
  CATEGORY_COLOR_PRESETS,
  COLOR_KEYS,
  EXPENSE_ICON_PRESETS,
  INCOME_ICON_PRESETS,
  ICON_KEYS_BY_TYPE,
} from '../../../common/constants/category-presets';
import { CategoryType } from '@prisma/client';
import { getCurrentMonthRange } from 'src/common/helpers/get-current-month-range';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  private validatePresets(
    type: CategoryType,
    dto: { iconKey?: string; colorKey?: string },
  ) {
    if (dto.iconKey) {
      const allowed = ICON_KEYS_BY_TYPE[type];
      if (!allowed.includes(dto.iconKey))
        throw new BadRequestException('Invalid iconKey for category type');
    }

    if (dto.colorKey) {
      if (!COLOR_KEYS.includes(dto.colorKey as any))
        throw new BadRequestException('Invalid colorKey');
    }
  }

  async create(userId: string, dto: CreateCategoryDto) {
    this.validatePresets(dto.type, dto);

    return this.prisma.category.create({
      data: {
        userId,
        name: dto.name.trim(),
        type: dto.type,
        iconKey: dto.iconKey ?? null,
        colorKey: dto.colorKey ?? null,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.category.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, userId },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async update(userId: string, id: string, dto: UpdateCategoryDto) {
    const current = await this.findOne(userId, id);

    const nextType = dto.type ?? current.type;
    this.validatePresets(nextType, dto);

    return this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        type: dto.type,
        iconKey: dto.iconKey === undefined ? undefined : (dto.iconKey ?? null),
        colorKey:
          dto.colorKey === undefined ? undefined : (dto.colorKey ?? null),
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.category.delete({ where: { id } });
  }

  private async getTopCategoryByType(
    userId: string,
    type: 'INCOME' | 'EXPENSE',
    periodStart: Date,
    periodEnd: Date,
  ) {
    const [top] = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        type,
        categoryId: { not: null },
        occurredAt: { gte: periodStart, lte: periodEnd },
      },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 1,
    });

    if (!top?.categoryId) return null;

    const category = await this.prisma.category.findFirst({
      where: { id: top.categoryId, userId },
      select: {
        id: true,
        name: true,
        type: true,
        iconKey: true,
        colorKey: true,
      },
    });

    if (!category) return null;

    return {
      ...category,
      amount: Number(top._sum.amount ?? 0),
    };
  }

  async getTopIncomeExpenseCategories(
    userId: string,
    periodStart: Date,
    periodEnd: Date,
  ) {
    const [topExpenseCategory, topIncomeCategory] = await Promise.all([
      this.getTopCategoryByType(userId, 'EXPENSE', periodStart, periodEnd),
      this.getTopCategoryByType(userId, 'INCOME', periodStart, periodEnd),
    ]);

    return {
      topExpenseCategory,
      topIncomeCategory,
    };
  }

  async getExpensePie(
    userId: string,
    limit: number,
    periodStart?: Date,
    periodEnd?: Date,
  ) {
    const periodStartDate = periodStart ?? getCurrentMonthRange().periodStart;
    const periodEndDate = periodEnd ?? getCurrentMonthRange().periodEnd;

    const grouped = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        type: 'EXPENSE',
        categoryId: { not: null },
        occurredAt: { gte: periodStartDate, lte: periodEndDate },
      },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
    });

    if (!grouped.length) return [];

    const categoryIds = grouped.map((g) => g.categoryId!) as string[];

    const categories = await this.prisma.category.findMany({
      where: { userId, id: { in: categoryIds } },
      select: { id: true, name: true, iconKey: true, colorKey: true },
    });

    const merged = grouped.map((g) => {
      const cat = categories.find((c) => c.id === g.categoryId);
      return {
        id: g.categoryId!,
        name: cat?.name ?? 'Unknown',
        iconKey: cat?.iconKey ?? null,
        colorKey: cat?.colorKey ?? null,
        amount: Number(g._sum.amount ?? 0),
      };
    });

    merged.sort((a, b) => b.amount - a.amount);

    const top = merged.slice(0, limit);
    const rest = merged.slice(limit);

    if (rest.length) {
      top.push({
        id: 'other',
        name: 'Other',
        iconKey: null,
        colorKey: null,
        amount: rest.reduce((s, x) => s + x.amount, 0),
      });
    }

    return top;
  }

  async presets() {
    return {
      icons: {
        INCOME: INCOME_ICON_PRESETS,
        EXPENSE: EXPENSE_ICON_PRESETS,
      },
      colors: CATEGORY_COLOR_PRESETS,
    };
  }
}
