import { CacheModule } from '@nestjs/cache-manager';
import { FxService } from './fx.service';
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule, CacheModule.register({ ttl: 3600 })],
  providers: [FxService],
  exports: [FxService],
})
export class FxModule {}
