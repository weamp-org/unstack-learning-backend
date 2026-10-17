import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Users (e2e)', () => {
  const me = {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    role: 'STUDENT',
  };

  const admin = {
    id: 'admin-1',
    name: 'Admin User',
    email: 'admin@example.com',
    role: 'ADMIN',
  };

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };

  async function bootApp(authUserId?: string): Promise<INestApplication<App>> {
    const moduleBuilder = Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock);
    const moduleFixture = await moduleBuilder.compile();
    const testApp = moduleFixture.createNestApplication();
    testApp.setGlobalPrefix('api/v1');
    if (authUserId) {
      // Branded stub-auth middleware: lets the real ClerkAuthGuard and
      // RolesGuard run without Clerk keys or network (verified against
      // @clerk/express's requestHasAuthObject check; tokenType must read
      // 'session_token' or getAuth() returns a signed-out object).
      const stubAuth = () => ({
        userId: authUserId,
        tokenType: 'session_token',
      });
      Object.assign(stubAuth, { [Symbol.for('@clerk/express.auth')]: true });
      testApp.use((req: Request, _res: Response, next: NextFunction) => {
        (req as unknown as Record<string, unknown>).auth = stubAuth;
        next();
      });
    }
    await testApp.init();
    return testApp;
  }

  describe('GET /api/v1/users/me', () => {
    let app: INestApplication<App>;

    beforeEach(async () => {
      prismaMock.user.findUnique.mockResolvedValue(me);
      app = await bootApp('user-1');
    });

    afterEach(async () => {
      await app.close();
    });

    it('returns the caller record', () => {
      return request(app.getHttpServer())
        .get('/api/v1/users/me')
        .expect(200)
        .expect(me);
    });
  });

  describe('GET /api/v1/users', () => {
    let app: INestApplication<App>;

    afterEach(async () => {
      await app.close();
    });

    it('returns the user list for admins', async () => {
      prismaMock.user.findUnique.mockResolvedValue(admin);
      prismaMock.user.findMany.mockResolvedValue([me, admin]);
      app = await bootApp('admin-1');

      await request(app.getHttpServer())
        .get('/api/v1/users')
        .expect(200)
        .expect([me, admin]);
    });

    it('forbids non-admins through the real guard chain', async () => {
      prismaMock.user.findUnique.mockResolvedValue(me);
      app = await bootApp('user-1');

      await request(app.getHttpServer()).get('/api/v1/users').expect(403);
    });
  });
});
