import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config'; // нужно для получения DATABASE_URL из переменных окружения
import { PrismaPg } from '@prisma/adapter-pg'; // npm install @prisma/adapter-pg
import { PrismaClient } from '@prisma/client';

function normalizeConnectionString(url: string) {
  try {
    const parsed = new URL(url);
    const sslmode = parsed.searchParams.get('sslmode')?.toLowerCase();

    if (parsed.searchParams.has('uselibpqcompat')) {
      return parsed.toString();
    }

    if (
      sslmode === 'prefer' ||
      sslmode === 'require' ||
      sslmode === 'verify-ca'
    ) {
      parsed.searchParams.set('sslmode', 'verify-full');
      return parsed.toString();
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleDestroy, OnModuleInit
{
  constructor(configService: ConfigService) {
    const url =
      configService.get<string>('DATABASE_URL') ?? process.env.DATABASE_URL;

    if (!url || typeof url !== 'string') {
      throw new Error('DATABASE_URL is not defined or is not a string');
    }

    super({
      adapter: new PrismaPg({
        connectionString: normalizeConnectionString(url),
      }),
    });
  }

  async onModuleInit() {
    await this.$connect(); // Подключаемся к базе данных при инициализации модуля
  }

  async onModuleDestroy() {
    await this.$disconnect(); // Отключаемся от базы данных при уничтожении модуля
  }

  // Это делается для того, чтобы гарантировать, что при использовании PrismaService в других местах приложения, мы всегда будем работать с подключенной базой данных. Если база данных не будет подключена, то при попытке выполнить запрос будет выброшена ошибка. То есть onModuleInit гарантирует, что база данных будет подключена при инициализации модуля, а onModuleDestroy гарантирует, что база данных будет корректно отключена при уничтожении модуля, что помогает избежать утечек ресурсов и обеспечивает стабильную работу приложения.
}
