import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { ClerkAuthGuard } from './../src/clerk-auth/clerk-auth.guard';
import { NotificationsService } from './../src/notifications/notifications.service';
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

  const txMock = {
    helpRequest: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    teacherSubject: {
      findFirst: jest.fn(),
    },
    helpRequestDecision: {
      upsert: jest.fn(),
    },
    helpSession: {
      create: jest.fn(),
    },
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
      update: jest.fn(),
    },
    helpSession: {
      create: jest.fn(),
      update: jest.fn(),
    },
    helpRequestDecision: {
      upsert: jest.fn(),
    },
    $transaction: jest.fn((callback: (tx: typeof txMock) => unknown) =>
      callback(txMock),
    ),
  };

  const notificationsMock = {
    notifyRequestCreated: jest.fn(),
    notifyRequestAccepted: jest.fn(),
    notifySessionUpdated: jest.fn(),
    escalateStaleRequests: jest.fn(),
  };

  async function bootApp(
    options: { deny?: boolean; authUserId?: string } = {},
  ): Promise<INestApplication<App>> {
    const moduleBuilder = Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(NotificationsService)
      .useValue(notificationsMock);
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
            status: 'OPEN',
            subject: { teachers: { some: { teacherId: 'teacher-1' } } },
            NOT: { decisions: { some: { teacherId: 'teacher-1' } } },
          },
        }),
      );
    });
  });

  describe('accepting and declining', () => {
    let app: INestApplication<App>;

    const openRow = {
      ...row,
      status: 'OPEN',
      teacherId: null,
    };

    beforeEach(async () => {
      prismaMock.user.findUnique.mockResolvedValue({ role: 'TEACHER' });
      app = await bootApp({ authUserId: 'teacher-1' });
    });

    afterEach(async () => {
      await app.close();
    });

    it('PATCH /api/v1/requests/:id/accept accepts an open request', async () => {
      const accepted = {
        ...openRow,
        status: 'ACCEPTED',
        teacherId: 'teacher-1',
      };
      txMock.helpRequest.findUnique.mockResolvedValueOnce(openRow);
      txMock.helpRequest.findUnique.mockResolvedValue(accepted);
      txMock.teacherSubject.findFirst.mockResolvedValue({
        teacherId: 'teacher-1',
      });

      await request(app.getHttpServer())
        .patch('/api/v1/requests/r-1/accept')
        .send({ sessionUrl: 'https://meet.google.com/abc' })
        .expect(200)
        .expect(accepted);
    });

    it('PATCH accept 400s for past session times', async () => {
      txMock.helpRequest.findUnique.mockResolvedValue({
        ...openRow,
        status: 'OPEN',
      });

      await request(app.getHttpServer())
        .patch('/api/v1/requests/r-1/accept')
        .send({ scheduledAt: '2020-01-01T00:00:00.000Z' })
        .expect(400);
    });

    it('PATCH accept 409s once taken', async () => {
      txMock.helpRequest.findUnique.mockResolvedValue({
        ...openRow,
        status: 'ACCEPTED',
      });

      await request(app.getHttpServer())
        .patch('/api/v1/requests/r-1/accept')
        .send({})
        .expect(409);
    });

    it('PATCH /api/v1/requests/:id/decline keeps the request open', async () => {
      prismaMock.helpRequest.findUnique.mockResolvedValue(openRow);
      prismaMock.teacherSubject.findFirst.mockResolvedValue({
        teacherId: 'teacher-1',
      });
      prismaMock.helpRequestDecision.upsert.mockResolvedValue({});

      await request(app.getHttpServer())
        .patch('/api/v1/requests/r-1/decline')
        .expect(200)
        .expect({ id: 'r-1', declined: true });
    });

    it('PATCH accept forbids teachers without the subject', async () => {
      txMock.helpRequest.findUnique.mockResolvedValue(openRow);
      txMock.teacherSubject.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch('/api/v1/requests/r-1/accept')
        .send({})
        .expect(403);
    });
  });

  describe('updating the session', () => {
    let app: INestApplication<App>;

    const acceptedRow = {
      ...row,
      status: 'ACCEPTED',
      teacherId: 'teacher-1',
      session: { id: 'sess-1', requestId: 'r-1' },
    };

    beforeEach(async () => {
      prismaMock.user.findUnique.mockResolvedValue({ role: 'TEACHER' });
      app = await bootApp({ authUserId: 'teacher-1' });
    });

    afterEach(async () => {
      await app.close();
    });

    it('PATCH /api/v1/requests/:id/session updates link and time', async () => {
      prismaMock.helpRequest.findUnique.mockResolvedValue(acceptedRow);
      prismaMock.helpSession.update.mockResolvedValue({});

      await request(app.getHttpServer())
        .patch('/api/v1/requests/r-1/session')
        .send({ sessionUrl: 'https://meet.google.com/abc' })
        .expect(200);
      expect(prismaMock.helpSession.update).toHaveBeenCalledWith({
        where: { requestId: 'r-1' },
        data: {
          sessionUrl: 'https://meet.google.com/abc',
          scheduledAt: undefined,
        },
      });
    });

    it('PATCH session 404s for uninvolved teachers', async () => {
      prismaMock.helpRequest.findUnique.mockResolvedValue(acceptedRow);
      prismaMock.user.findUnique.mockResolvedValue({ role: 'TEACHER' });
      prismaMock.teacherSubject.findFirst.mockResolvedValue(null);

      const otherApp = await bootApp({ authUserId: 'teacher-2' });
      try {
        await request(otherApp.getHttpServer())
          .patch('/api/v1/requests/r-1/session')
          .send({})
          .expect(404);
      } finally {
        await otherApp.close();
      }
    });
  });

  describe('closing', () => {
    let app: INestApplication<App>;

    beforeEach(async () => {
      prismaMock.user.findUnique.mockResolvedValue({ role: 'STUDENT' });
      app = await bootApp({ authUserId: 'learner-1' });
    });

    afterEach(async () => {
      await app.close();
    });

    it('PATCH /api/v1/requests/:id/close closes for the owner', async () => {
      prismaMock.helpRequest.findUnique.mockResolvedValue(row);
      prismaMock.helpRequest.update.mockResolvedValue({
        ...row,
        status: 'CLOSED',
      });

      await request(app.getHttpServer())
        .patch('/api/v1/requests/r-1/close')
        .expect(200);
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
