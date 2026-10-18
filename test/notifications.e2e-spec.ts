import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { ClerkAuthGuard } from './../src/clerk-auth/clerk-auth.guard';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Notifications (e2e)', () => {
  const row = {
    id: 'n-1',
    recipientId: 'user-1',
    type: 'REQUEST_CREATED',
    requestId: 'r-1',
    readAt: null,
  };

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    teacherSubject: {
      findMany: jest.fn(),
    },
    teacherAvailability: {
      findMany: jest.fn(),
    },
    helpRequest: {
      findMany: jest.fn(),
    },
    notification: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      createMany: jest.fn(),
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
      prismaMock.user.findUnique.mockResolvedValue({ role: 'STUDENT' });
      app = await bootApp({ authUserId: 'user-1' });
    });

    afterEach(async () => {
      await app.close();
    });

    it('GET /api/v1/notifications/me returns the caller inbox', async () => {
      prismaMock.notification.findMany.mockResolvedValue([row]);

      await request(app.getHttpServer())
        .get('/api/v1/notifications/me')
        .expect(200)
        .expect([row]);
      expect(prismaMock.notification.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { recipientId: 'user-1' } }),
      );
    });

    it('GET /api/v1/notifications/me/unread-count returns the count', async () => {
      prismaMock.notification.count.mockResolvedValue(2);

      await request(app.getHttpServer())
        .get('/api/v1/notifications/me/unread-count')
        .expect(200)
        .expect({ count: 2 });
    });

    it('PATCH /api/v1/notifications/:id/read marks a row read', async () => {
      prismaMock.notification.findFirst.mockResolvedValue({
        ...row,
        readAt: null,
      });
      prismaMock.notification.update.mockResolvedValue({
        ...row,
        readAt: '2026-10-18T12:00:00.000Z',
      });

      await request(app.getHttpServer())
        .patch('/api/v1/notifications/n-1/read')
        .expect(200);
      expect(prismaMock.notification.findFirst).toHaveBeenLastCalledWith({
        where: { id: 'n-1', recipientId: 'user-1' },
      });
    });

    it('PATCH read hides other recipients rows', async () => {
      prismaMock.notification.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch('/api/v1/notifications/n-9/read')
        .expect(404);
    });

    it('PATCH /api/v1/notifications/me/read-all marks everything read', async () => {
      let seenWhere: unknown;
      let seenReadAt: unknown;
      prismaMock.notification.updateMany.mockImplementation(
        (args: {
          where: { recipientId: string; readAt: null };
          data: { readAt: Date };
        }) => {
          seenWhere = args.where;
          seenReadAt = args.data.readAt;
          return Promise.resolve({ count: 2 });
        },
      );

      await request(app.getHttpServer())
        .patch('/api/v1/notifications/me/read-all')
        .expect(200);
      expect(seenWhere).toEqual({ recipientId: 'user-1', readAt: null });
      expect(seenReadAt).toBeInstanceOf(Date);
    });

    it('POST /api/v1/notifications/escalate forbids non-admins', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/notifications/escalate')
        .expect(403);
    });
  });

  describe('as an admin', () => {
    let app: INestApplication<App>;

    beforeEach(async () => {
      prismaMock.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      app = await bootApp({ authUserId: 'admin-1' });
    });

    afterEach(async () => {
      await app.close();
    });

    it('POST /api/v1/notifications/escalate runs without stale requests', async () => {
      prismaMock.helpRequest.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .post('/api/v1/notifications/escalate')
        .expect(201)
        .expect({ escalated: 0 });
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

    it('GET /api/v1/notifications/me requires authentication', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/notifications/me')
        .expect(401);
    });
  });
});
