import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';

type JwtPayload = {
  sub: string;
  email?: string;
  role?: string;
};

export type AuthUser = {
  id: string;
  email?: string;
  role?: string;
};

const cookieExtractor = (req: Request): string | null => {
  return req?.cookies?.access_token ?? null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor]),
      secretOrKey: process.env.JWT_ACCESS_SECRET!,
      ignoreExpiration: false,
    });
  }

  validate(payload: JwtPayload): AuthUser {
    if (!payload?.sub) throw new UnauthorizedException('Invalid JWT payload');
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }
}
