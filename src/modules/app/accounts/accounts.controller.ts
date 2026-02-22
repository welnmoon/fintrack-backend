import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { Get, Param, Post, Controller } from '@nestjs/common';
import { AccountsService } from './accounts.service';

@Controller('accounts')
export class AccountsController {
  private accountsService: AccountsService;
  constructor(accountsService: AccountsService) {
    this.accountsService = accountsService;
  }

  @Get()
  getUserAccounts(@CurrentUser() user: AuthUser) {
    return this.accountsService.getUserAccounts(user.id);
  }

  @Post()
  createAccount(@CurrentUser() user: AuthUser) {
    return this.accountsService.createAccount(user.id);
  }

  @Get(':id')
  getAccountById(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.accountsService.getAccountById(user.id, id);
  }
}
