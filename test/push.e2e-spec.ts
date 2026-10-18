import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';
import webpush from 'web-push';

import { AppModule } from './../src/app.module';
import { ClerkAuthGuard } from './../src/clerk-auth/clerk-auth.guard';
import { PrismaService } from './../src/prisma/prisma.service';

jest.mock('web-push', () => ({
  __esModule: true,
  default: { setVapidDetails: jest.fn(), sendNotification: jest.fn() },
}));

const mockWebpush = webpush as unknown as {
  sendNotification: jest.Mock;
};

describe('Push (e2e)', () => {
  const row = {
    id: 'ps-1',
    userId: 'user-1',
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    p256dh: 'p256dh-key',
    auth: 'auth-key',
  };

  const dto = {
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
  };

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
    },
    pushSubscription: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
  };

  async function bootApp(
    options: { deny?: boolean; authUserId?: string } = {},
  ): Promise<INestApplication<App>> {
    const moduleBuilder = Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock);
    if (options.deny) {
      // Stand-in for the real ClerkAuthGuard: proves the route is
      // guard-wired without Clerk keys.
      moduleBuilder.overrideGuard(ClerkAuthGuard).useValue({
        canActivate: () => {
          throw new UnauthorizedException();
        },
      });
    }
    const moduleFixture = await moduleBuilder.compile();
    const testApp = moduleFixture.createNestApplication();
    testApp.setGlobalPrefix('api/v1');
    if (options.authUserId) {
      // Branded stub-auth middleware: lets the real guard chain run without
      // Clerk keys or network.
      const userId = options.authUserId;
      const stubAuth = () => ({ userId, tokenType: 'session_token' });
      Object.assign(stubAuth, { [Symbol.for('@clerk/express.auth')]: true });
      testApp.use((req: Request, _res: Response, next: NextFunction) => {
        (req as unknown as Record<string, unknown>).auth = stubAuth;
        next();
      });
    }
    await testApp.init();
    return testApp;
  }

  describe('as a signed-in user', () => {
    let app: INestApplication<App>;

    beforeEach(async () => {
      jest.clearAllMocks();
      prismaMock.user.findUnique.mockResolvedValue({ role: 'STUDENT' });
      mockWebpush.sendNotification.mockResolvedValue(undefined);
      app = await bootApp({ authUserId: 'user-1' });
    });

    afterEach(async () => {
      await app.close();
    });

    it('POST /api/v1/push/subscriptions registers the caller endpoint', async () => {
      prismaMock.pushSubscription.upsert.mockResolvedValue(row);

      await request(app.getHttpServer())
        .post('/api/v1/push/subscriptions')
        .send(dto)
        .expect(201)
        .expect(row);
      expect(prismaMock.pushSubscription.upsert).toHaveBeenLastCalledWith({
        where: { endpoint: dto.endpoint },
        update: {
          userId: 'user-1',
          p256dh: row.p256dh,
          auth: row.auth,
        },
        create: {
          userId: 'user-1',
          endpoint: dto.endpoint,
          p256dh: row.p256dh,
          auth: row.auth,
        },
      });
    });

    it('DELETE /api/v1/push/subscriptions removes the caller endpoint', async () => {
      prismaMock.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });

      await request(app.getHttpServer())
        .delete('/api/v1/push/subscriptions')
        .send({ endpoint: dto.endpoint })
        .expect(200)
        .expect({ count: 1 });
    });

    it('GET /api/v1/push/subscriptions/me returns the caller rows', async () => {
      prismaMock.pushSubscription.findMany.mockResolvedValue([row]);

      await request(app.getHttpServer())
        .get('/api/v1/push/subscriptions/me')
        .expect(200)
        .expect([row]);
    });

    it('POST /api/v1/push/test sends to the caller devices', async () => {
      prismaMock.pushSubscription.findMany.mockResolvedValue([row]);

      await request(app.getHttpServer())
        .post('/api/v1/push/test')
        .expect(201)
        .expect({ sent: 1, pruned: 0, failed: 0 });
    });

    it('POST /api/v1/push/test prunes expired endpoints', async () => {
      prismaMock.pushSubscription.findMany.mockResolvedValue([row]);
      mockWebpush.sendNotification.mockRejectedValueOnce(
        Object.assign(new Error('Gone'), { statusCode: 410 }),
      );
      prismaMock.pushSubscription.delete.mockResolvedValue(row);

      await request(app.getHttpServer())
        .post('/api/v1/push/test')
        .expect(201)
        .expect({ sent: 0, pruned: 1, failed: 0 });
    });
  });

  describe('anonymous', () => {
    let app: INestApplication<App>;

    beforeEach(async () => {
      app = await bootApp({ deny: true });
    });

    afterEach(async () => {
      await app.close();
    });

    it('POST /api/v1/push/subscriptions requires authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/push/subscriptions')
        .send(dto)
        .expect(401);
    });
  });
});
