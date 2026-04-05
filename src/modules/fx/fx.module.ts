import { FxService } from './fx.service';
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FxCacheService } from './fx-cache.service';
import { MoneyConversionService } from './money-conversion.service';

@Module({
  imports: [HttpModule],
  providers: [FxService, FxCacheService, MoneyConversionService],
  exports: [FxService, MoneyConversionService],
})
export class FxModule {}
