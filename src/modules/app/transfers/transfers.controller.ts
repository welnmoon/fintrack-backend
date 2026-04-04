import { Body, Controller, Get, Patch, Post, Put } from '@nestjs/common';
import { TransfersService } from './transfers.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/jwt.strategy';
import { CreateTransferDto } from './dto/create-transfer.dto';

@Controller('transfers')
export class TransfersController {
  constructor(private transfersService: TransfersService) {}

  @Get()
  getUserTransfers(@CurrentUser() user: AuthUser) {
    return this.transfersService.getUserTransfers(user.id);
  }

  @Post()
  createUserTransfers(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTransferDto,
  ) {
    return this.transfersService.createUserTransfer(user.id, dto);
  }

  @Patch()
  cancelUserTransfer(
    @CurrentUser() user: AuthUser,
    @Body() transferId: string,
  ) {
    return this.transfersService.cancelUserTransfer(transferId);
  }
}
