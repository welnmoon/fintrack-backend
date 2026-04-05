import { AccountType, Currency } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { ACCOUNT_BACKGROUND_KEYS } from '../../../../common/constants/account-backgrounds';

export class CreateAccountDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(AccountType)
  type: AccountType;

  @IsEnum(Currency)
  currency: Currency;

  @IsOptional()
  @IsString()
  @IsIn(ACCOUNT_BACKGROUND_KEYS)
  backgroundKey?: string;
}
