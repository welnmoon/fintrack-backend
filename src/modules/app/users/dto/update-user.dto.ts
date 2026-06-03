import { Currency } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEnum(Currency)
  defaultCurrency?: Currency;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  defaultAccountId?: string | null;
}
