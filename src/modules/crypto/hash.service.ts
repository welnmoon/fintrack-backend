import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class HashService {
  hashPassword(password: string) {
    return argon2.hash(password);
  }

  verifyPassword(hash: string, password: string) {
    return argon2.verify(hash, password);
  }
}
