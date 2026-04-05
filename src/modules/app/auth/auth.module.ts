import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { HashService } from '../../crypto/hash.service';
import { AuthController } from './auth.controller';
import { ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    PassportModule,
    PrismaModule,

    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
    }),
  ],
  providers: [
    JwtStrategy,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    AuthService,
    HashService,
  ],
  controllers: [AuthController],
})
export class AuthModule {}
