import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  getDashboard(@CurrentUser() user: AuthUser) {
    return this.dashboardService.getDashboard(user.id);
  }
}
