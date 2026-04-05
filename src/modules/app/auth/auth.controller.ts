import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from '../../../common/decorators/public.decorator';
import { AuthResponseDto } from './dto/auth-response-dto';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthUser } from './jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private prisma: PrismaService,
  ) {}

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    const isProd = process.env.NODE_ENV === 'production';
    const sameSite: 'lax' | 'none' = isProd ? 'none' : 'lax';

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite,
      path: '/',
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite,
      path: '/auth/refresh',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }

  @Post('login')
  @HttpCode(200)
  @Public()
  async login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, user, refreshToken } = await this.auth.login(
      body.email,
      body.password,
    );

    this.setAuthCookies(res, accessToken, refreshToken);

    return { user };
  }

  @Post('register')
  @HttpCode(201)
  @Public()
  async register(
    @Body()
    body: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
    },
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const { accessToken, user, refreshToken } = await this.auth.register(
      body.email,
      body.password,
      body.firstName,
      body.lastName,
    );

    this.setAuthCookies(res, accessToken, refreshToken);

    return { user, accessToken, refreshToken };
  }

  @Post('logout')
  async logout(
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthUser,
  ) {
    res.clearCookie('access_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    });

    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/auth/refresh',
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshTokenHash: null,
      },
    });

    return { message: 'Logged out' };
  }

  @Post('refresh')
  @HttpCode(200)
  @Public()
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) throw new UnauthorizedException();

    const { accessToken, refreshToken: newRefreshToken } =
      await this.auth.refresh(refreshToken);

    this.setAuthCookies(res, accessToken, newRefreshToken);
  }
}
