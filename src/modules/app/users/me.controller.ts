import { Controller, Get, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';

@Controller('me')
export class MeController {
  private usersService: UsersService;
  constructor(usersService: UsersService) {
    this.usersService = usersService;
  }

  @Get('accounts')
  getUserAccounts(@CurrentUser() user: AuthUser) {
    return this.usersService.getUserAccounts(user.id);
  }

  @Post('accounts')
  createAccount(@CurrentUser() user: AuthUser) {
    return this.usersService.createAccount(user.id);
  }
}
