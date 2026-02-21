import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { HashService } from 'src/modules/crypto/hash.service';
import { AuthController } from './auth.controller';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    PassportModule,
    // Это нужно для того, чтобы можно было инжектить JwtService в AuthService. JwtModule предоставляет JwtService, который используется для создания и проверки JWT токенов. Мы настраиваем JwtModule асинхронно, чтобы иметь доступ к ConfigService для получения секрета из переменных окружения.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: '15m' },
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
