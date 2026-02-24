import { IsNumber, IsUUID } from 'class-validator';

export class CreateTransferDto {
  @IsUUID()
  fromAccountId: string;

  @IsUUID()
  toAccountId: string;

  @IsNumber()
  amount: number;
}
