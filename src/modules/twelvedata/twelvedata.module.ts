import { Module } from '@nestjs/common';
import { TwelvedataService } from './twelvedata.service';

@Module({
  imports: [],
  providers: [],
  exports: [TwelvedataService],
})
export class TwelvedataModule {}
