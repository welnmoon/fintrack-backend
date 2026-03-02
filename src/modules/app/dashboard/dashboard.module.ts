import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PrismaModule } from 'src/modules/prisma/prisma.module';
import { AccountsModule } from '../accounts/accounts.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
  imports: [PrismaModule, AccountsModule, TransactionsModule, CategoriesModule],
})
export class DashboardModule {}
