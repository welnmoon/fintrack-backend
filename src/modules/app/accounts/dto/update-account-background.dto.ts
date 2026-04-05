import { IsIn, IsString } from 'class-validator';
import { ACCOUNT_BACKGROUND_KEYS } from '../../../../common/constants/account-backgrounds';

export class UpdateAccountBackgroundDto {
  @IsString()
  @IsIn(ACCOUNT_BACKGROUND_KEYS)
  backgroundKey: string;
}
