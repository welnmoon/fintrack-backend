import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { BalanceHistoryInterval } from '../dashboard.service';

export class GetBalanceHistoryQueryDto {
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
  @Max(120)
  points?: number;
}
