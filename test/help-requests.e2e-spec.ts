import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { ClerkAuthGuard } from './../src/clerk-auth/clerk-auth.guard';
import { PrismaService } from './../src/prisma/prisma.service';

describe('HelpRequests (e2e)', () => {
  const subject = { id: 's-1', name: 'Biology', isActive: true };
  const row = {
    id: 'r-1',
    learnerId: 'learner-1',
    subjectId: 's-1',
    topic: 'Mitosis phases',
    details: 'Prophase vs metaphase?',
    links: [],
    subject,
  };

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
    },
    subject: {
      findUnique: jest.fn(),
    },
    teacherSubject: {
      findFirst: jest.fn(),
    },
    helpRequest: {
      create: jest.fn(),
      findMany: jest.fn(),
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
      // Stand-in for the real ClerkAuthGuard (see test/subjects.e2e-spec.ts):
      // proves the route is guard-wired without Clerk keys.
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
      // real guard chain run without Clerk keys or network.
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

  describe('as a learner', () => {
    let app: INestApplication<App>;

    beforeEach(async () => {
      prismaMock.user.findUnique.mockResolvedValue({ role: 'STUDENT' });
      app = await bootApp({ authUserId: 'learner-1' });
    });

    afterEach(async () => {
      await app.close();
    });

    it('POST /api/v1/requests creates a request', async () => {
      prismaMock.subject.findUnique.mockResolvedValue(subject);
      prismaMock.helpRequest.create.mockResolvedValue(row);

      await request(app.getHttpServer())
        .post('/api/v1/requests')
        .send({
          subjectId: 's-1',
          topic: 'Mitosis phases',
          details: 'Prophase vs metaphase?',
        })
        .expect(201)
        .expect(row);
    });

    it('POST rejects context-free requests', async () => {
      prismaMock.subject.findUnique.mockResolvedValue(subject);

      await request(app.getHttpServer())
        .post('/api/v1/requests')
        .send({ subjectId: 's-1', topic: 'Help me' })
        .expect(400);
    });

    it('POST rejects inactive subjects', async () => {
      prismaMock.subject.findUnique.mockResolvedValue({
        ...subject,
        isActive: false,
      });

      await request(app.getHttpServer())
        .post('/api/v1/requests')
        .send({ subjectId: 's-1', topic: 'Help me', details: 'Stuck' })
        .expect(400);
    });

    it('GET /api/v1/requests/me returns only the caller requests', async () => {
      prismaMock.helpRequest.findMany.mockResolvedValue([row]);

      await request(app.getHttpServer())
        .get('/api/v1/requests/me')
        .expect(200)
        .expect([row]);
      expect(prismaMock.helpRequest.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { learnerId: 'learner-1' } }),
      );
    });

    it('GET /api/v1/requests/:id hides other learners requests', async () => {
      prismaMock.helpRequest.findUnique.mockResolvedValue({
        ...row,
        learnerId: 'learner-2',
      });
      prismaMock.user.findUnique.mockResolvedValue({ role: 'STUDENT' });
      prismaMock.teacherSubject.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/v1/requests/r-1')
        .expect(404);
    });
  });

  describe('as a teacher', () => {
    let app: INestApplication<App>;

    beforeEach(async () => {
      prismaMock.user.findUnique.mockResolvedValue({ role: 'TEACHER' });
      app = await bootApp({ authUserId: 'teacher-1' });
    });

    afterEach(async () => {
      await app.close();
    });

    it('GET /api/v1/requests/queue returns matching requests', async () => {
      prismaMock.helpRequest.findMany.mockResolvedValue([row]);

      await request(app.getHttpServer())
        .get('/api/v1/requests/queue')
        .expect(200)
        .expect([row]);
      expect(prismaMock.helpRequest.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: {
            subject: { teachers: { some: { teacherId: 'teacher-1' } } },
          },
        }),
      );
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

    it('POST /api/v1/requests requires authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/requests')
        .send({ subjectId: 's-1', topic: 'Help me', details: 'Stuck' })
        .expect(401);
    });
  });
});
