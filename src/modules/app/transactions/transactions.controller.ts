import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/jwt.strategy';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

@Controller('transactions')
export class TransactionsController {
  constructor(private transactionsService: TransactionsService) {}

  @Post()
  @HttpCode(201)
  createTransaction(
    @Body() dto: CreateTransactionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.transactionsService.create(dto, user.id);
  }

  @Patch(':id')
  updateTransaction(
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.transactionsService.update(id, dto, user.id);
  }

  @Get()
  getUserTransactions(@CurrentUser() user: AuthUser) {
    return this.transactionsService.getUserTransactions(user.id);
  }

  @Get('last-month-summary')
  getLastMonthIncomeExpense(@CurrentUser() user: AuthUser) {
    return this.transactionsService.getCurrentMonthIncomeExpense(user.id);
  }
}
