import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';
import type { BalanceHistoryInterval } from '../dashboard.service';

export class GetExpensePieQueryDto {
  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  interval?: BalanceHistoryInterval;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return Number(value);
  })
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}
