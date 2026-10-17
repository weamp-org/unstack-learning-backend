import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Users (e2e)', () => {
  let app: INestApplication<App>;

  const me = {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    role: 'STUDENT',
  };

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        user: { findUnique: jest.fn().mockResolvedValue(me) },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    // Stand-in for main.ts's clerkMiddleware(): it attaches a branded
    // req.auth function, which is all the guards read (verified against
    // @clerk/express's requestHasAuthObject check; tokenType must read
    // 'session_token' or getAuth() returns a signed-out object). Lets the
    // real ClerkAuthGuard and RolesGuard run without Clerk keys or network.
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const stubAuth = () => ({
        userId: 'user-1',
        tokenType: 'session_token',
      });
      Object.assign(stubAuth, { [Symbol.for('@clerk/express.auth')]: true });
      (req as unknown as Record<string, unknown>).auth = stubAuth;
      next();
    });
    await app.init();
  });

  it('GET /api/v1/users/me returns the caller record', () => {
    return request(app.getHttpServer())
      .get('/api/v1/users/me')
      .expect(200)
      .expect(me);
  });

  afterEach(async () => {
    await app.close();
  });
});
