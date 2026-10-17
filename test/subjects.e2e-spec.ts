import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { ClerkAuthGuard } from './../src/clerk-auth/clerk-auth.guard';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Subjects (e2e)', () => {
  let app: INestApplication<App>;

  const subjects = [
    {
      id: 'cuid1',
      name: 'Mathematics',
      slug: 'mathematics',
      description: null,
      isActive: true,
    },
  ];

  const prismaMock = {
    subject: {
      findMany: jest.fn().mockResolvedValue(subjects),
      findUnique: jest.fn().mockResolvedValue(subjects[0]),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  async function bootApp(
    options: { deny?: boolean; authUserId?: string } = {},
  ): Promise<INestApplication<App>> {
    const moduleBuilder = Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock);
    if (options.deny) {
      // Stand-in for the real ClerkAuthGuard: e2e never runs main.ts's
      // clerkMiddleware() (it needs Clerk keys), so the real guard's
      // getAuth() call would 500 instead of 401 here. The deny stub proves
      // the route is guard-wired — a 401 surfaces only if the guard chain
      // executes.
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
      // Branded stub-auth middleware (see test/users.e2e-spec.ts): lets the
      // real guard chain and getAuth() callers run keyless.
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

  beforeEach(async () => {
    app = await bootApp();
  });

  it('GET /api/v1/subjects is public', () => {
    return request(app.getHttpServer())
      .get('/api/v1/subjects')
      .expect(200)
      .expect(subjects);
  });

  it('GET /api/v1/subjects ignores includeInactive for anonymous callers', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/subjects?includeInactive=true')
      .expect(200)
      .expect(subjects);
    expect(prismaMock.subject.findMany).toHaveBeenLastCalledWith({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  });
  it('GET /api/v1/subjects/:id is public', () => {
    return request(app.getHttpServer())
      .get('/api/v1/subjects/cuid1')
      .expect(200)
      .expect(subjects[0]);
  });

  it('GET /api/v1/subjects honors includeInactive for admins', async () => {
    const all = [
      ...subjects,
      {
        id: 'cuid2',
        name: 'Physics',
        slug: 'physics',
        description: null,
        isActive: false,
      },
    ];
    prismaMock.subject.findMany.mockResolvedValueOnce(all);
    prismaMock.user.findUnique.mockResolvedValueOnce({ role: 'ADMIN' });
    const authed = await bootApp({ authUserId: 'admin-1' });
    try {
      await request(authed.getHttpServer())
        .get('/api/v1/subjects?includeInactive=true')
        .expect(200)
        .expect(all);
      expect(prismaMock.subject.findMany).toHaveBeenLastCalledWith({
        where: undefined,
        orderBy: { name: 'asc' },
      });
    } finally {
      await authed.close();
    }
  });

  it('POST /api/v1/subjects requires authentication', async () => {
    const guarded = await bootApp({ deny: true });
    try {
      await request(guarded.getHttpServer())
        .post('/api/v1/subjects')
        .send({ name: 'Physics' })
        .expect(401);
    } finally {
      await guarded.close();
    }
  });

  afterEach(async () => {
    await app.close();
  });
});
