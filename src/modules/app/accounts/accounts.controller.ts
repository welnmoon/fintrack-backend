import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/jwt.strategy';
import { Get, Param, Post, Controller, Body } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';

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
  createAccount(@CurrentUser() user: AuthUser, @Body() dto: CreateAccountDto) {
    return this.accountsService.createAccount(user.id, dto);
  }

  @Get('options')
  getAccountOptions(@CurrentUser() user: AuthUser) {
    return this.accountsService.getAccountOptions(user.id);
  }

  @Get(':id')
  getAccountById(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.accountsService.getAccountById(user.id, id);
  }
}
