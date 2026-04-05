import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/jwt.strategy';
import {
  Get,
  Param,
  Post,
  Controller,
  Body,
  Patch,
  Delete,
} from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { SetAccountBalanceDto } from './dto/set-account-balance.dto';
import { UpdateAccountBackgroundDto } from './dto/update-account-background.dto';

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

  @Patch(':id/background')
  updateAccountBackground(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAccountBackgroundDto,
  ) {
    return this.accountsService.updateAccountBackground(user.id, id, dto);
  }

  @Post(':id/set-balance')
  setAccountBalance(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetAccountBalanceDto,
  ) {
    return this.accountsService.setAccountBalance(user.id, id, dto);
  }

  @Get(':id')
  getAccountById(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.accountsService.getAccountById(user.id, id);
  }

  @Delete(':id')
  deleteAccount(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.accountsService.deleteAccount(user.id, id);
  }
}
