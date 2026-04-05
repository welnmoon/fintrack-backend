import { ApiProperty } from '@nestjs/swagger'; // npm install @nestjs/swagger
import { CategoryType } from '@prisma/client';

export class CategoryResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: CategoryType }) type: CategoryType;
  @ApiProperty({ nullable: true, required: false }) color: string | null;
  @ApiProperty({ nullable: true, required: false }) icon: string | null;
}
