import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { HashService } from 'src/modules/crypto/hash.service';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { AuthResponseDto } from './dto/auth-response-dto';
import { AuthUser } from './jwt.strategy';

type JwtRefreshPayload = {
  sub: string;
  iat: number;
  exp: number;
};

type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
};
type RefreshResponse = {
  accessToken: string;
  refreshToken: string;
};

@Injectable()
export class AuthService {
  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
    private hashService: HashService,
  ) {}

  private async issueTokens(user: AuthUser) {
    const payload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET!,
      expiresIn: '15m',
    });

    const refreshToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET!,
      expiresIn: '30d',
    });

    return { accessToken, refreshToken };
  }

  private async setRefreshToken(userId: string, refreshToken: string) {
    const hash = await this.hashService.hashPassword(refreshToken);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: hash },
    });
  }

  async login(email: string, password: string): Promise<AuthResponseDto> {
    try {
      const user = await this.prisma.user.findUnique({ where: { email } });
      if (!user) throw new UnauthorizedException();

      const isPasswordValid = await this.hashService.verifyPassword(
        user.passwordHash,
        password,
      );

      if (!isPasswordValid) throw new UnauthorizedException();

      const { accessToken, refreshToken } = await this.issueTokens(user);
      await this.setRefreshToken(user.id, refreshToken);

      return {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
      };
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      console.error('Error during login:', e);
      throw e;
    }
  }

  async register(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
  ): Promise<AuthResponseDto> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) throw new UnauthorizedException('Email already in use');

    const passwordHash = await this.hashService.hashPassword(password);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
      },
    });

    const { accessToken, refreshToken } = await this.issueTokens(user);
    await this.setRefreshToken(user.id, refreshToken);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }

  private async verifyRefreshToken(token: string): Promise<JwtRefreshPayload> {
    return this.jwt.verifyAsync<JwtRefreshPayload>(token, {
      secret: process.env.JWT_REFRESH_SECRET!,
    });
  }

  async refresh(refreshToken: string): Promise<IssuedTokens> {
    let payload: JwtRefreshPayload;

    try {
      payload = await this.verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: payload.sub,
      },
    });

    if (!user?.refreshTokenHash) {
      throw new UnauthorizedException();
    }

    const isValid = await this.hashService.verifyPassword(
      user.refreshTokenHash,
      refreshToken,
    );

    if (!isValid) {
      throw new UnauthorizedException();
    }

    const tokens = await this.issueTokens({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    await this.setRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }
}
