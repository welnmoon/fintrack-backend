import { AccountType, Currency } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateAccountDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(AccountType)
  type: AccountType;

  @IsEnum(Currency)
  currency: Currency;
}
