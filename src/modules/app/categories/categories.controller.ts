import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { CategoryType } from '@prisma/client';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CategoryResponse } from './prisma/categories.select';
import { ApiBody, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { CategoryResponseDto } from './dto/category.response.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Post()
  @ApiBody({ type: CreateCategoryDto })
  @ApiCreatedResponse({ type: CategoryResponseDto })
  @HttpCode(201)
  createCategory(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.categoriesService.create(dto.name, dto.type, user.id);
  }

  @Get()
  @ApiOkResponse({ type: CategoryResponseDto, isArray: true })
  getCategories(
    @CurrentUser() user: AuthUser,
    @Query('type') type: CategoryType | 'ALL' = 'ALL',
  ): Promise<CategoryResponse[]> {
    return this.categoriesService.getUserCategories(user.id, type);
  }
}
