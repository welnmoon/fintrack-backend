import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { CategoryType } from '@prisma/client';

@Controller('categories')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Post()
  @HttpCode(201)
  createCategory(
    @Body() dto: { name: string; type: 'INCOME' | 'EXPENSE' },
    @CurrentUser() user: AuthUser,
  ) {
    return this.categoriesService.create(dto.name, dto.type, user.id);
  }

  @Get()
  getCategories(
    @CurrentUser() user: AuthUser,
    @Body() dto: { type: CategoryType | 'ALL' },
  ) {
    return this.categoriesService.getUserCategories(user.id, dto.type);
  }
}
