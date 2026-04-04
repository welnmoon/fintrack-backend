import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AccountsModule } from '../accounts/accounts.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { CategoriesModule } from '../categories/categories.module';
import { FxModule } from '../../fx/fx.module';
import { ForecastModule } from '../../analytics/forecast/forecast.module';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
  imports: [
    PrismaModule,
    AccountsModule,
    TransactionsModule,
    CategoriesModule,
    FxModule,
    ForecastModule,
  ],
})
export class DashboardModule {}
