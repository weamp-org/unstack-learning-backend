import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('AdminStats (e2e)', () => {
  const admin = { id: 'admin-1', role: 'ADMIN' };
  const student = { id: 'user-1', role: 'STUDENT' };

  const prismaMock = {
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    helpRequest: { count: jest.fn(), findFirst: jest.fn(), groupBy: jest.fn() },
    helpSession: { count: jest.fn() },
    helpRequestDecision: { findMany: jest.fn(), groupBy: jest.fn() },
    helpFeedback: {
      count: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    subject: { findMany: jest.fn() },
  };

  async function bootApp(authUserId?: string): Promise<INestApplication<App>> {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();
    const testApp = moduleFixture.createNestApplication();
    testApp.setGlobalPrefix('api/v1');
    if (authUserId) {
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

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.helpRequest.count.mockResolvedValue(0);
    prismaMock.helpSession.count.mockResolvedValue(0);
    prismaMock.helpRequest.findFirst.mockResolvedValue(null);
    prismaMock.helpRequest.groupBy.mockResolvedValue([]);
    prismaMock.helpRequestDecision.findMany.mockResolvedValue([]);
    prismaMock.helpRequestDecision.groupBy.mockResolvedValue([]);
    prismaMock.helpFeedback.count.mockResolvedValue(0);
    prismaMock.helpFeedback.aggregate.mockResolvedValue({
      _avg: { rating: null },
    });
    prismaMock.helpFeedback.groupBy.mockResolvedValue([]);
    prismaMock.helpFeedback.findMany.mockResolvedValue([]);
    prismaMock.subject.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([]);
  });

  it('returns stats for admins', async () => {
    prismaMock.user.findUnique.mockResolvedValue(admin);
    const app = await bootApp('admin-1');
    try {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/stats')
        .expect(200);
      expect(res.body).toMatchObject({
        overview: { total: 0, open: 0 },
        bySubject: [],
        byTeacher: [],
        feedback: { total: 0, coverage: null, averageRating: null },
      });
      expect(res.body).toHaveProperty('responsiveness');
    } finally {
      await app.close();
    }
  });

  it('forbids non-admins through the real guard chain', async () => {
    prismaMock.user.findUnique.mockResolvedValue(student);
    const app = await bootApp('user-1');
    try {
      await request(app.getHttpServer()).get('/api/v1/admin/stats').expect(403);
    } finally {
      await app.close();
    }
  });
});
