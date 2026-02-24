import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // app.useGlobalFilters(new PrismaExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('Categories API')
    .setDescription('API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  });

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
