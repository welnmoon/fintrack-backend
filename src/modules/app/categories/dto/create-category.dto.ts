import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CategoryType } from '@prisma/client';
import {
  CategoryIconKey,
  CategoryColorKey,
} from 'src/common/constants/category-presets';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name!: string;

  @IsEnum(CategoryType)
  type!: CategoryType;

  @IsOptional()
  @IsString()
  iconKey?: CategoryIconKey;

  @IsOptional()
  @IsString()
  colorKey?: CategoryColorKey;
}
