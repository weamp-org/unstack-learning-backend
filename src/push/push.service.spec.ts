import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';

import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from './push.service.js';

jest.mock('web-push', () => ({
  __esModule: true,
  default: { setVapidDetails: jest.fn(), sendNotification: jest.fn() },
}));

const mockWebpush = webpush as unknown as {
  setVapidDetails: jest.Mock;
  sendNotification: jest.Mock;
};

const vapidEnv: Record<string, string | undefined> = {
  VAPID_PUBLIC_KEY: 'test-public-key',
  VAPID_PRIVATE_KEY: 'test-private-key',
  VAPID_SUBJECT: 'mailto:test@example.com',
};

const mockConfigService = {
  get: jest.fn((key: string): string | undefined => vapidEnv[key]),
};

const mockPrismaService = {
  pushSubscription: {
    upsert: jest.fn(),
    deleteMany: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
  },
};

const dto = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
};

describe('PushService', () => {
  let service: PushService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfigService.get.mockImplementation(
      (key: string): string | undefined => vapidEnv[key],
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<PushService>(PushService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('subscribe', () => {
    it('upserts keyed by endpoint so re-login reassigns the device', async () => {
      const row = { id: 'ps-1', userId: 'user-1', ...dto };
      mockPrismaService.pushSubscription.upsert.mockResolvedValue(row);

      await expect(service.subscribe('user-1', dto)).resolves.toEqual(row);
      expect(mockPrismaService.pushSubscription.upsert).toHaveBeenCalledWith({
        where: { endpoint: dto.endpoint },
        update: {
          userId: 'user-1',
          p256dh: 'p256dh-key',
          auth: 'auth-key',
        },
        create: {
          userId: 'user-1',
          endpoint: dto.endpoint,
          p256dh: 'p256dh-key',
          auth: 'auth-key',
        },
      });
    });
  });

  describe('unsubscribe', () => {
    it('deletes only the caller endpoint', async () => {
      mockPrismaService.pushSubscription.deleteMany.mockResolvedValue({
        count: 1,
      });

      await expect(
        service.unsubscribe('user-1', dto.endpoint),
      ).resolves.toEqual({ count: 1 });
      expect(
        mockPrismaService.pushSubscription.deleteMany,
      ).toHaveBeenCalledWith({
        where: { userId: 'user-1', endpoint: dto.endpoint },
      });
    });
  });

  describe('listMine', () => {
    it('returns the caller subscriptions newest first', async () => {
      const rows = [{ id: 'ps-1' }];
      mockPrismaService.pushSubscription.findMany.mockResolvedValue(rows);

      await expect(service.listMine('user-1')).resolves.toEqual(rows);
      expect(mockPrismaService.pushSubscription.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('sendToUser', () => {
    const subscriptions = [
      { id: 'ps-1', endpoint: 'https://push.example/1' },
      { id: 'ps-2', endpoint: 'https://push.example/2' },
    ];

    beforeEach(() => {
      mockPrismaService.pushSubscription.findMany.mockResolvedValue(
        subscriptions,
      );
      mockWebpush.sendNotification.mockResolvedValue(undefined);
    });

    it('sends to every subscription and reports counts', async () => {
      await expect(
        service.sendToUser('user-1', { title: 'Hi', body: 'Hello' }),
      ).resolves.toEqual({ sent: 2, pruned: 0, failed: 0 });
      expect(mockWebpush.sendNotification).toHaveBeenCalledTimes(2);
      expect(mockWebpush.setVapidDetails).toHaveBeenCalledWith(
        'mailto:test@example.com',
        'test-public-key',
        'test-private-key',
      );
    });

    it('prunes expired endpoints and keeps sending to the rest', async () => {
      mockWebpush.sendNotification.mockRejectedValueOnce(
        Object.assign(new Error('Gone'), { statusCode: 410 }),
      );
      mockPrismaService.pushSubscription.delete.mockResolvedValue({});

      await expect(
        service.sendToUser('user-1', { title: 'Hi', body: 'Hello' }),
      ).resolves.toEqual({ sent: 1, pruned: 1, failed: 0 });
      expect(mockPrismaService.pushSubscription.delete).toHaveBeenCalledWith({
        where: { id: 'ps-1' },
      });
    });

    it('counts failures without pruning or throwing', async () => {
      mockWebpush.sendNotification.mockRejectedValueOnce(new Error('boom'));

      await expect(
        service.sendToUser('user-1', { title: 'Hi', body: 'Hello' }),
      ).resolves.toEqual({ sent: 1, pruned: 0, failed: 1 });
      expect(mockPrismaService.pushSubscription.delete).not.toHaveBeenCalled();
    });

    it('503s when VAPID is not configured', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      await expect(
        service.sendToUser('user-1', { title: 'Hi', body: 'Hello' }),
      ).rejects.toThrow('Push notifications are not configured');
      expect(mockWebpush.sendNotification).not.toHaveBeenCalled();
    });
  });

  describe('sendTest', () => {
    it('sends the onboarding payload to the caller devices', async () => {
      mockPrismaService.pushSubscription.findMany.mockResolvedValue([]);
      mockWebpush.sendNotification.mockResolvedValue(undefined);

      await expect(service.sendTest('user-1')).resolves.toEqual({
        sent: 0,
        pruned: 0,
        failed: 0,
      });
      expect(mockPrismaService.pushSubscription.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });
  });
});
