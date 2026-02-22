import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CategoryType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @ApiProperty()
  name: string;

  @IsEnum(CategoryType)
  @ApiProperty({ enum: CategoryType })
  type: CategoryType;

  @IsOptional()
  @ApiPropertyOptional()
  color: string;

  @IsOptional()
  @ApiPropertyOptional()
  icon: string;
}
