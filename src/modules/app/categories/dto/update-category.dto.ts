import { CategoryType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import type {
  CategoryColorKey,
  CategoryIconKey,
} from '../../../../common/constants/category-presets';

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  name?: string;

  @IsOptional()
  @IsEnum(CategoryType)
  type?: CategoryType;

  @IsOptional()
  @IsString()
  iconKey?: CategoryIconKey | null;

  @IsOptional()
  @IsString()
  colorKey?: CategoryColorKey | null;
}
