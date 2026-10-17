import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Teachers (e2e)', () => {
  const rows = [
    {
      teacherId: 'teacher-1',
      subjectId: 's-1',
      subject: { id: 's-1', name: 'Biology', slug: 'biology' },
    },
  ];

  const txMock = {
    teacherSubject: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue(rows),
    },
  };

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
    },
    subject: {
      findMany: jest.fn(),
    },
    teacherSubject: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    teacherAvailability: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn((callback: (tx: typeof txMock) => unknown) =>
      callback(txMock),
    ),
  };

  async function bootApp(authUserId?: string): Promise<INestApplication<App>> {
    const moduleBuilder = Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock);
    const moduleFixture = await moduleBuilder.compile();
    const testApp = moduleFixture.createNestApplication();
    testApp.setGlobalPrefix('api/v1');
    if (authUserId) {
      // Branded stub-auth middleware (see test/users.e2e-spec.ts): lets the
      // real guard chain run without Clerk keys or network.
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

  describe('as a teacher', () => {
    let app: INestApplication<App>;

    beforeEach(async () => {
      prismaMock.user.findUnique.mockResolvedValue({ role: 'TEACHER' });
      app = await bootApp('teacher-1');
    });

    afterEach(async () => {
      await app.close();
    });

    it('GET /api/v1/teachers/me/subjects returns the selection', async () => {
      prismaMock.teacherSubject.findMany.mockResolvedValue(rows);

      await request(app.getHttpServer())
        .get('/api/v1/teachers/me/subjects')
        .expect(200)
        .expect(rows);
    });

    it('PUT /api/v1/teachers/me/subjects replaces the selection', async () => {
      prismaMock.subject.findMany.mockResolvedValue([{ id: 's-1' }]);

      await request(app.getHttpServer())
        .put('/api/v1/teachers/me/subjects')
        .send({ subjectIds: ['s-1'] })
        .expect(200)
        .expect(rows);
    });

    it('PUT rejects unknown subject IDs', async () => {
      prismaMock.subject.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .put('/api/v1/teachers/me/subjects')
        .send({ subjectIds: ['nope'] })
        .expect(400);
    });

    it('GET /api/v1/teachers/me/availability returns the windows', async () => {
      const windows = [
        {
          id: 'w-1',
          teacherId: 'teacher-1',
          weekday: 1,
          startTime: '14:00',
          endTime: '18:00',
          timezone: 'Africa/Accra',
        },
      ];
      prismaMock.teacherAvailability.findMany.mockResolvedValue(windows);

      await request(app.getHttpServer())
        .get('/api/v1/teachers/me/availability')
        .expect(200)
        .expect(windows);
    });

    it('POST /api/v1/teachers/me/availability adds a window', async () => {
      const created = {
        id: 'w-1',
        teacherId: 'teacher-1',
        weekday: 1,
        startTime: '14:00',
        endTime: '18:00',
        timezone: 'Africa/Accra',
      };
      prismaMock.teacherAvailability.findMany.mockResolvedValue([]);
      prismaMock.teacherAvailability.create.mockResolvedValue(created);

      await request(app.getHttpServer())
        .post('/api/v1/teachers/me/availability')
        .send({ weekday: 1, startTime: '14:00', endTime: '18:00' })
        .expect(201)
        .expect(created);
    });

    it('POST rejects overlapping windows', async () => {
      prismaMock.teacherAvailability.findMany.mockResolvedValue([
        { startTime: '16:00', endTime: '20:00' },
      ]);

      await request(app.getHttpServer())
        .post('/api/v1/teachers/me/availability')
        .send({ weekday: 1, startTime: '14:00', endTime: '18:00' })
        .expect(409);
    });

    it('DELETE /api/v1/teachers/me/availability/:id removes a window', async () => {
      const window = { id: 'w-1', teacherId: 'teacher-1' };
      prismaMock.teacherAvailability.findFirst.mockResolvedValue(window);
      prismaMock.teacherAvailability.delete.mockResolvedValue(window);

      await request(app.getHttpServer())
        .delete('/api/v1/teachers/me/availability/w-1')
        .expect(200)
        .expect(window);
    });
  });

  describe('as a student', () => {
    let app: INestApplication<App>;

    beforeEach(async () => {
      prismaMock.user.findUnique.mockResolvedValue({ role: 'STUDENT' });
      app = await bootApp('student-1');
    });

    afterEach(async () => {
      await app.close();
    });

    it('PUT /api/v1/teachers/me/subjects is forbidden', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/teachers/me/subjects')
        .send({ subjectIds: [] })
        .expect(403);
    });

    it('POST /api/v1/teachers/me/availability is forbidden', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/teachers/me/availability')
        .send({ weekday: 1, startTime: '14:00', endTime: '18:00' })
        .expect(403);
    });
  });
});
