import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { ClerkAuthGuard } from './../src/clerk-auth/clerk-auth.guard';
import { PrismaService } from './../src/prisma/prisma.service';
import { StorageService } from './../src/storage/storage.service';

describe('Media (e2e)', () => {
  const uploadRow = {
    id: 'm-1',
    ownerId: 'user-1',
    requestId: null,
    kind: 'IMAGE',
    objectKey: 'staging/user-1/m-1',
    contentType: 'image/jpeg',
    byteSize: 1000,
    durationSeconds: null,
    status: 'PENDING',
  };

  const prismaMock = {
    // ClerkAuthGuard provisions the user on first sight.
    user: {
      findUnique: jest.fn(),
    },
    mediaUpload: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const storageMock = {
    presignPut: jest.fn(),
    presignGet: jest.fn(),
    head: jest.fn(),
    readPrefix: jest.fn(),
    copy: jest.fn(),
    remove: jest.fn(),
    removeMany: jest.fn(),
  };

  async function bootApp(
    options: { deny?: boolean; authUserId?: string } = {},
  ): Promise<INestApplication<App>> {
    const moduleBuilder = Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(StorageService)
      .useValue(storageMock);
    if (options.deny) {
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

  beforeEach(() => {
    jest.clearAllMocks();
    storageMock.presignPut.mockResolvedValue('https://r2.example/put');
    storageMock.presignGet.mockResolvedValue('https://r2.example/get');
    storageMock.removeMany.mockResolvedValue(undefined);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1' });
    storageMock.remove.mockResolvedValue(undefined);
    prismaMock.mediaUpload.findMany.mockResolvedValue([]);
    prismaMock.mediaUpload.deleteMany.mockResolvedValue({ count: 0 });
  });

  describe('as a signed-in learner', () => {
    let app: INestApplication<App>;

    beforeEach(async () => {
      app = await bootApp({ authUserId: 'user-1' });
    });

    afterEach(async () => {
      await app.close();
    });

    it('POST /api/v1/media/uploads reserves an upload and presigns it', async () => {
      let created: { objectKey: string } | undefined;
      prismaMock.mediaUpload.create.mockImplementation(
        (args: { data: { objectKey: string } }) => {
          created = args.data;
          return Promise.resolve(uploadRow);
        },
      );

      await request(app.getHttpServer())
        .post('/api/v1/media/uploads')
        .send({ kind: 'IMAGE', contentType: 'image/jpeg', byteSize: 1000 })
        .expect(201)
        .expect((response) => {
          const body = response.body as { id: string; uploadUrl: string };
          expect(body.id).toBe('m-1');
          expect(body.uploadUrl).toBe('https://r2.example/put');
        });

      expect(created?.objectKey).toMatch(/^staging\/user-1\//);
    });

    it('POST rejects an unsupported image type', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/media/uploads')
        .send({ kind: 'IMAGE', contentType: 'application/pdf', byteSize: 1000 })
        .expect(400);
    });

    it('POST /complete verifies the object and marks it ready', async () => {
      prismaMock.mediaUpload.findFirst.mockResolvedValue(uploadRow);
      storageMock.head.mockResolvedValue({
        byteSize: 1000,
        contentType: 'image/jpeg',
      });
      storageMock.readPrefix.mockResolvedValue(
        Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      );
      prismaMock.mediaUpload.update.mockResolvedValue({
        ...uploadRow,
        status: 'READY',
      });

      await request(app.getHttpServer())
        .post('/api/v1/media/uploads/m-1/complete')
        .expect(201)
        .expect((response) => {
          const body = response.body as { status: string };
          expect(body.status).toBe('READY');
        });
    });

    it('POST /complete rejects a body that is not the declared kind', async () => {
      prismaMock.mediaUpload.findFirst.mockResolvedValue(uploadRow);
      storageMock.head.mockResolvedValue({
        byteSize: 1000,
        contentType: 'image/jpeg',
      });
      storageMock.readPrefix.mockResolvedValue(
        Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
      );

      await request(app.getHttpServer())
        .post('/api/v1/media/uploads/m-1/complete')
        .expect(400);
    });

    it('DELETE /api/v1/media/uploads/:id discards an unattached upload', async () => {
      prismaMock.mediaUpload.findFirst.mockResolvedValue(uploadRow);

      await request(app.getHttpServer())
        .delete('/api/v1/media/uploads/m-1')
        .expect(200)
        .expect({ id: 'm-1', deleted: true });
    });
  });

  it('rejects callers the guard turns away', async () => {
    const app = await bootApp({ deny: true, authUserId: 'user-1' });
    await request(app.getHttpServer())
      .post('/api/v1/media/uploads')
      .send({ kind: 'IMAGE', contentType: 'image/jpeg', byteSize: 1000 })
      .expect(401);
    await app.close();
  });
});
