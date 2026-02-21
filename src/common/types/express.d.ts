import { AuthUser } from '../../modules/app/auth/jwt.strategy';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
