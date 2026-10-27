import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { MediaService, sniffKind } from './media.service.js';

const mockPrisma = {
  mediaUpload: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const mockStorage = {
  presignPut: jest.fn(),
  presignGet: jest.fn(),
  head: jest.fn(),
  readPrefix: jest.fn(),
  copy: jest.fn(),
  remove: jest.fn(),
  removeMany: jest.fn(),
};

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00]);

describe('MediaService', () => {
  let service: MediaService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockStorage.presignPut.mockResolvedValue('https://r2.example/put');
    mockStorage.presignGet.mockResolvedValue('https://r2.example/get');
    mockStorage.removeMany.mockResolvedValue(undefined);
    mockStorage.remove.mockResolvedValue(undefined);
    mockPrisma.mediaUpload.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.mediaUpload.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile();
    service = module.get(MediaService);
  });

  describe('createUpload', () => {
    it('rejects a content type that does not match the kind', async () => {
      await expect(
        service.createUpload('user-1', {
          kind: 'IMAGE',
          contentType: 'application/pdf',
          byteSize: 100,
        }),
      ).rejects.toThrow('Images must be JPEG, PNG, or WebP');
    });

    it('rejects files over the size limit', async () => {
      await expect(
        service.createUpload('user-1', {
          kind: 'IMAGE',
          contentType: 'image/jpeg',
          byteSize: 11 * 1024 * 1024,
        }),
      ).rejects.toThrow('too large');
    });

    it('rejects audio without a duration', async () => {
      await expect(
        service.createUpload('user-1', {
          kind: 'AUDIO',
          contentType: 'audio/webm',
          byteSize: 1000,
        }),
      ).rejects.toThrow('Audio needs its length in seconds');
    });

    it('rejects a duration on an image', async () => {
      await expect(
        service.createUpload('user-1', {
          kind: 'IMAGE',
          contentType: 'image/jpeg',
          byteSize: 1000,
          durationSeconds: 10,
        }),
      ).rejects.toThrow('Only audio has a duration');
    });

    it('creates a staged row and presigns the PUT', async () => {
      let created: { objectKey: string; contentType: string } | undefined;
      mockPrisma.mediaUpload.create.mockImplementation(
        (args: { data: { objectKey: string; contentType: string } }) => {
          created = args.data;
          return Promise.resolve({
            id: 'm-1',
            kind: 'IMAGE',
            contentType: 'image/jpeg',
            byteSize: 1000,
            durationSeconds: null,
          });
        },
      );

      const result = await service.createUpload('user-1', {
        kind: 'IMAGE',
        contentType: 'image/jpeg; charset=binary',
        byteSize: 1000,
      });

      expect(result.uploadUrl).toBe('https://r2.example/put');
      expect(result.id).toBe('m-1');
      expect(created?.objectKey).toMatch(/^staging\/user-1\//);
      expect(created?.contentType).toBe('image/jpeg');
    });
  });

  describe('complete', () => {
    const upload = {
      id: 'm-1',
      ownerId: 'user-1',
      objectKey: 'staging/user-1/m-1',
      kind: 'IMAGE',
      contentType: 'image/jpeg',
      byteSize: 1000,
      durationSeconds: null,
      status: 'PENDING',
      requestId: null,
    };

    it('is idempotent for ready rows', async () => {
      mockPrisma.mediaUpload.findFirst.mockResolvedValue({
        ...upload,
        status: 'READY',
      });

      await expect(service.complete('user-1', 'm-1')).resolves.toMatchObject({
        status: 'READY',
      });
      expect(mockStorage.head).not.toHaveBeenCalled();
    });

    it('rejects when the object never arrived', async () => {
      mockPrisma.mediaUpload.findFirst.mockResolvedValue(upload);
      mockStorage.head.mockResolvedValue(null);

      await expect(service.complete('user-1', 'm-1')).rejects.toThrow(
        'Upload has not reached storage yet',
      );
    });

    it('rejects a size mismatch', async () => {
      mockPrisma.mediaUpload.findFirst.mockResolvedValue(upload);
      mockStorage.head.mockResolvedValue({
        byteSize: 999,
        contentType: 'image/jpeg',
      });

      await expect(service.complete('user-1', 'm-1')).rejects.toThrow(
        'does not match the size',
      );
    });

    it('rejects bytes that are not the declared kind', async () => {
      mockPrisma.mediaUpload.findFirst.mockResolvedValue(upload);
      mockStorage.head.mockResolvedValue({
        byteSize: 1000,
        contentType: 'image/jpeg',
      });
      mockStorage.readPrefix.mockResolvedValue(WEBM);

      await expect(service.complete('user-1', 'm-1')).rejects.toThrow(
        'not valid media',
      );
    });

    it('marks the row ready when everything matches', async () => {
      mockPrisma.mediaUpload.findFirst.mockResolvedValue(upload);
      mockStorage.head.mockResolvedValue({
        byteSize: 1000,
        contentType: 'image/jpeg',
      });
      mockStorage.readPrefix.mockResolvedValue(JPEG);
      let updateData: { status: string; completedAt: Date } | undefined;
      mockPrisma.mediaUpload.update.mockImplementation(
        (args: { data: { status: string; completedAt: Date } }) => {
          updateData = args.data;
          return Promise.resolve({ ...upload, status: 'READY' });
        },
      );

      await expect(service.complete('user-1', 'm-1')).resolves.toMatchObject({
        status: 'READY',
      });
      expect(updateData?.status).toBe('READY');
      expect(updateData?.completedAt).toBeInstanceOf(Date);
    });

    it('scopes lookups to the owner', async () => {
      mockPrisma.mediaUpload.findFirst.mockResolvedValue(null);

      await expect(service.complete('user-2', 'm-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('abandon', () => {
    it('rejects media that already belongs to a request', async () => {
      mockPrisma.mediaUpload.findFirst.mockResolvedValue({
        id: 'm-1',
        objectKey: 'requests/m-1.jpg',
        requestId: 'r-1',
      });

      await expect(service.abandon('user-1', 'm-1')).rejects.toThrow(
        'already part of a request',
      );
      expect(mockStorage.remove).not.toHaveBeenCalled();
    });

    it('deletes the object and row', async () => {
      mockPrisma.mediaUpload.findFirst.mockResolvedValue({
        id: 'm-1',
        objectKey: 'staging/user-1/m-1',
        requestId: null,
      });

      await expect(service.abandon('user-1', 'm-1')).resolves.toEqual({
        id: 'm-1',
        deleted: true,
      });
      expect(mockStorage.remove).toHaveBeenCalledWith('staging/user-1/m-1');
      expect(mockPrisma.mediaUpload.delete).toHaveBeenCalledWith({
        where: { id: 'm-1' },
      });
    });
  });

  describe('assertAttachable', () => {
    it('rejects ids that are missing, used, or not ready', async () => {
      mockPrisma.mediaUpload.findMany.mockResolvedValue([]);

      await expect(service.assertAttachable('user-1', ['m-1'])).rejects.toThrow(
        'missing or already used',
      );
    });

    it('enforces the audio count cap', async () => {
      const audio = (id: string) => ({
        id,
        kind: 'AUDIO',
        objectKey: `staging/${id}`,
        contentType: 'audio/webm',
      });
      mockPrisma.mediaUpload.findMany.mockResolvedValue([
        audio('a-1'),
        audio('a-2'),
        audio('a-3'),
      ]);

      await expect(
        service.assertAttachable('user-1', ['a-1', 'a-2', 'a-3']),
      ).rejects.toThrow('at most 2 voice notes');
    });
  });

  describe('copyIntoRequests', () => {
    it('copies each object to its request key', async () => {
      const moved = await service.copyIntoRequests([
        { id: 'm-1', objectKey: 'staging/u/m-1', contentType: 'image/jpeg' },
      ]);

      expect(moved).toEqual([
        {
          id: 'm-1',
          fromKey: 'staging/u/m-1',
          toKey: 'requests/m-1.jpg',
        },
      ]);
      expect(mockStorage.copy).toHaveBeenCalledWith(
        'staging/u/m-1',
        'requests/m-1.jpg',
      );
    });

    it('removes the copies when a later copy fails', async () => {
      mockStorage.copy
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('boom'));

      await expect(
        service.copyIntoRequests([
          { id: 'm-1', objectKey: 'staging/u/m-1', contentType: 'image/jpeg' },
          { id: 'm-2', objectKey: 'staging/u/m-2', contentType: 'image/png' },
        ]),
      ).rejects.toThrow('boom');
      expect(mockStorage.removeMany).toHaveBeenCalledWith(['requests/m-1.jpg']);
    });
  });

  describe('sign', () => {
    it('signs images shorter than audio', async () => {
      const [image, audio] = await service.sign([
        {
          id: 'm-1',
          kind: 'IMAGE',
          contentType: 'image/jpeg',
          byteSize: 10,
          durationSeconds: null,
          objectKey: 'requests/m-1.jpg',
        },
        {
          id: 'm-2',
          kind: 'AUDIO',
          contentType: 'audio/webm',
          byteSize: 10,
          durationSeconds: 30,
          objectKey: 'requests/m-2.webm',
        },
      ]);

      expect(image.url).toBe('https://r2.example/get');
      expect(audio.durationSeconds).toBe(30);
      expect(mockStorage.presignGet).toHaveBeenNthCalledWith(
        1,
        'requests/m-1.jpg',
        15 * 60,
      );
      expect(mockStorage.presignGet).toHaveBeenNthCalledWith(
        2,
        'requests/m-2.webm',
        60 * 60,
      );
    });
  });

  it('rejects audio with a negative-looking duration', async () => {
    await expect(
      service.createUpload('user-1', {
        kind: 'AUDIO',
        contentType: 'audio/webm',
        byteSize: 1000,
        durationSeconds: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('sniffKind', () => {
  it('recognises images and audio, and rejects anything else', () => {
    expect(sniffKind(JPEG)).toBe('IMAGE');
    expect(sniffKind(WEBM)).toBe('AUDIO');
    expect(sniffKind(Buffer.from('GIF89a'))).toBeNull();
  });
});
