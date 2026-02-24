import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';

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

  @Get()
  getUserTransactions(@CurrentUser() user: AuthUser) {
    return this.transactionsService.getUserTransactions(user.id);
  }
}
