import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/jwt.strategy';
import { GetBalanceHistoryQueryDto } from './dto/get-balance-history.query.dto';
import { GetExpensePieQueryDto } from './dto/get-expense-pie.query.dto';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  getDashboard(@CurrentUser() user: AuthUser) {
    return this.dashboardService.getDashboard(user.id);
  }

  @Get('balance-history')
  getBalanceHistory(
    @CurrentUser() user: AuthUser,
    @Query() query: GetBalanceHistoryQueryDto,
  ) {
    return this.dashboardService.getBalanceHistory(
      user.id,
      query.interval,
      query.points,
    );
  }

  @Get('expense-pie')
  getExpensePie(
    @CurrentUser() user: AuthUser,
    @Query() query: GetExpensePieQueryDto,
  ) {
    const from = query.from ? new Date(`${query.from}T00:00:00.000Z`) : undefined;
    const to = query.to ? new Date(`${query.to}T00:00:00.000Z`) : undefined;

    return this.dashboardService.getExpensePie(
      user.id,
      query.interval,
      query.limit,
      from,
      to,
    );
  }
}
