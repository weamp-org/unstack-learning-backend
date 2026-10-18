import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Logger as PinoLogger, LoggerErrorInterceptor } from 'nestjs-pino';
import { clerkMiddleware } from '@clerk/express';

import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));
  app.useGlobalInterceptors(new LoggerErrorInterceptor());

  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('NODE_ENV') ?? 'development';
  const isProduction = nodeEnv === 'production';

  // Fail fast on missing configuration. Local development keeps working
  // with the localhost defaults from `.env.local.example`. DATABASE_URL is
  // validated in ConfigModule.forRoot (see app.module.ts) because providers
  // are constructed before this function continues.
  if (isProduction) {
    for (const key of [
      'CLERK_PUBLISHABLE_KEY',
      'CLERK_SECRET_KEY',
      'FRONTEND_BASE_URL',
      'VAPID_PUBLIC_KEY',
      'VAPID_PRIVATE_KEY',
      'VAPID_SUBJECT',
    ]) {
      if (!configService.get<string>(key)) {
        throw new Error(`${key} environment variable is not set`);
      }
    }
    if (!configService.get<string>('CLERK_WEBHOOK_SIGNING_SECRET')) {
      logger.warn(
        'CLERK_WEBHOOK_SIGNING_SECRET is not set: Clerk webhook verification will reject requests',
      );
    }
  }

  const frontendBaseUrl =
    configService.get<string>('FRONTEND_BASE_URL') ?? 'http://localhost:3001';
  if (!configService.get<string>('FRONTEND_BASE_URL')) {
    logger.warn(
      `FRONTEND_BASE_URL is not set: using default CORS origin ${frontendBaseUrl}`,
    );
  }

  app.enableCors({ origin: frontendBaseUrl });
  app.setGlobalPrefix('api/v1');
  app.use(clerkMiddleware());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('Unstack Learning')
      .setDescription('API documentation for Unstack Learning')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();

    const options = {
      operationIdFactory: (_controllerKey: string, methodKey: string) =>
        methodKey,
    };

    const documentFactory = () =>
      SwaggerModule.createDocument(app, config, options);

    SwaggerModule.setup('api/v1/documentation', app, documentFactory);
  }

  const port = Number(configService.get<string>('PORT')) || 3000;
  await app.listen(port);
}

void bootstrap();
