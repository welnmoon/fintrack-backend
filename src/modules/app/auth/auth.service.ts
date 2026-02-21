// access & refresh token
// Разница между ними в том, что access token имеет короткий срок жизни (обычно 15 минут), а refresh token - более длительный (обычно 7 дней). Access token используется для доступа к защищенным ресурсам, а refresh token - для получения нового access token, когда он истекает. Это повышает безопасность, так как даже если access token будет скомпрометирован, злоумышленник не сможет долго использовать его без refresh token.

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { HashService } from 'src/modules/crypto/hash.service';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { AuthResponseDto } from './dto/auth-response-dto';

// Можно ли украсть refresh token? Да, теоретически это возможно, если злоумышленник получит доступ к устройству пользователя или перехватит токен. Поэтому важно хранить refresh token в безопасном месте (например, в HttpOnly cookie) и использовать дополнительные меры безопасности, такие как двухфакторная аутентификация и мониторинг подозрительной активности.

// Можно ли украсть access token? Да, access token также может быть украден, если злоумышленник получит доступ к устройству пользователя или перехватит токен. Поэтому важно использовать безопасные методы хранения (например, в памяти приложения) и передачи (например, через HTTPS) для защиты access token от кражи.

// Важно отметить, что даже если access token будет украден, злоумышленник сможет использовать его только в течение короткого времени, так как access token имеет ограниченный срок жизни. Поэтому использование refresh token позволяет минимизировать риски, связанные с кражей access token, и обеспечивает более безопасный механизм аутентификации.

// Почему в NestJs используются классы?
// В NestJS используются классы для создания компонентов, таких как контроллеры, сервисы и модули, потому что классы предоставляют удобный способ организации и инкапсуляции логики приложения. Классы позволяют создавать объекты с определенными свойствами и методами, что способствует лучшей структуре кода и облегчает его поддержку. Кроме того, использование классов позволяет использовать возможности объектно-ориентированного программирования, такие как наследование и полиморфизм, что может улучшить гибкость и расширяемость приложения.

@Injectable()
export class AuthService {
  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
    private hashService: HashService,
  ) {}

  async login(email: string, password: string): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException();

    const isPasswordValid = await this.hashService.verifyPassword(
      user.passwordHash,
      password,
    );

    if (!isPasswordValid) throw new UnauthorizedException();

    const accessToken = this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    }; // refresh token тоже нужно возвращать, но для простоты примера мы его не реализуем сейчас
    // TODO: Реализовать refresh token, чтобы не заставлять пользователя логиниться каждый раз при истечении access token. Для этого нужно создать отдельную сущность в базе данных для хранения refresh token, а также реализовать эндпоинт для его обновления.
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

    const accessToken = this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }
}
