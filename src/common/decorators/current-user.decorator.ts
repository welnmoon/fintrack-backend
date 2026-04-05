import { createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../../modules/app/auth/jwt.strategy';

type RequestWithUser = Request & { user?: AuthUser };

export const CurrentUser = createParamDecorator<
  keyof AuthUser | undefined,
  AuthUser | AuthUser[keyof AuthUser] | undefined
>((data, ctx) => {
  const request = ctx.switchToHttp().getRequest<RequestWithUser>();
  const user = request.user;
  if (!data) {
    return user;
  }
  return user?.[data];
});
