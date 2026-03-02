import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { FxModule } from 'src/modules/fx/fx.module';

@Module({
  controllers: [AccountsController],
  providers: [AccountsService],
  imports: [FxModule],
  exports: [AccountsService],
})
export class AccountsModule {}
