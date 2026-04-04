import { Module } from '@nestjs/common';
import { TransfersService } from './transfers.service';
import { TransfersController } from './transfers.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { FxModule } from '../../fx/fx.module';

@Module({
  imports: [PrismaModule, FxModule],
  controllers: [TransfersController],
  providers: [TransfersService],
})
export class TransfersModule {}
