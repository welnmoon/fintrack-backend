import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PrismaModule } from 'src/modules/prisma/prisma.module';
import { CryptoModule } from 'src/modules/crypto/crypto.module';
import { MeController } from './me.controller';

@Module({
  imports: [PrismaModule, CryptoModule],
  controllers: [UsersController, MeController],
  providers: [UsersService],
})
export class UsersModule {}
