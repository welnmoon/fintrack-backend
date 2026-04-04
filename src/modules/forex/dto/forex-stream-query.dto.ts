import { IsIn, IsOptional, IsString } from 'class-validator';
import { FOREX_INTERVALS } from '../forex.types';
import type { ForexInterval } from '../forex.types';

export class ForexStreamQueryDto {
  @IsOptional()
  @IsString()
  symbol?: string;

  @IsOptional()
  @IsIn(FOREX_INTERVALS)
  interval?: ForexInterval;
}
