import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ForexCacheService } from './forex-cache.service';
import { ForexController } from './forex.controller';
import { ForexService } from './forex.service';

@Module({
  imports: [HttpModule],
  controllers: [ForexController],
  providers: [ForexService, ForexCacheService],
  exports: [ForexService],
})
export class ForexModule {}
