import { MiddlewareConsumer, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ClerkAuthGuard } from './clerk-auth/clerk-auth.guard.js';
import { GlobalExceptionFilter } from './filters/global-exception.filter.js';
import { LoggingMiddleware } from './logging/logging.middleware.js';
import { pinoConfig } from './logging/pino.config.js';
import { ALL_ROUTES } from './logging/routes.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { WebhooksModule } from './webhooks/webhooks.module.js';

@Module({
  imports: [
    LoggerModule.forRoot(pinoConfig),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000, // 1 minute
        limit: 100, // 100 requests per minute per client
        // Clerk's middleware attaches the session to `req.auth` (see
        // `getAuth(request)` in the guards); there is no `req.user`.
        // Authenticated requests are tracked by Clerk user ID, anonymous
        // ones fall back to IP.
        getTracker: (req: { auth?: { userId?: string | null }; ip: string }) =>
          req.auth?.userId ?? req.ip,
      },
    ]),
    PrismaModule,
    WebhooksModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    ClerkAuthGuard,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes(ALL_ROUTES);
  }
}
