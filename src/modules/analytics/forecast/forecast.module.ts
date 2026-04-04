import { Module } from '@nestjs/common';
import { AccountsModule } from '../../app/accounts/accounts.module';
import { TransactionsModule } from '../../app/transactions/transactions.module';
import { ForecastService } from './forecast.service';

@Module({
  imports: [AccountsModule, TransactionsModule],
  providers: [ForecastService],
  exports: [ForecastService],
})
export class ForecastModule {}
