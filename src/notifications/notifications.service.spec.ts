import { Test, TestingModule } from '@nestjs/testing';

import { PushService } from '../push/push.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ESCALATION_THRESHOLD_MINUTES,
  NotificationsService,
} from './notifications.service.js';

const mockPrismaService = {
  notification: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    createMany: jest.fn(),
    upsert: jest.fn(),
  },
  teacherSubject: {
    findMany: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  teacherAvailability: {
    findMany: jest.fn(),
  },
  helpRequest: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
};

const mockPushService = {
  sendToUser: jest.fn(),
};

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPushService.sendToUser.mockResolvedValue({
      sent: 1,
      pruned: 0,
      failed: 0,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: PushService, useValue: mockPushService },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listMine', () => {
    const listMineInclude = {
      request: {
        select: {
          id: true,
          topic: true,
          status: true,
          subject: { select: { id: true, name: true } },
        },
      },
      actor: { select: { id: true, name: true } },
    };

    it('returns newest first, scoped to the recipient', async () => {
      const rows = [{ id: 'n-1' }];
      prisma.notification.findMany.mockResolvedValue(rows);

      await expect(service.listMine('user-1')).resolves.toEqual(rows);
      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { recipientId: 'user-1' },
        include: listMineInclude,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('filters to unread when requested', async () => {
      prisma.notification.findMany.mockResolvedValue([]);

      await service.listMine('user-1', true);
      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { recipientId: 'user-1', readAt: null },
        include: listMineInclude,
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('unreadCount', () => {
    it('counts unread rows for the recipient', async () => {
      prisma.notification.count.mockResolvedValue(2);

      await expect(service.unreadCount('user-1')).resolves.toBe(2);
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { recipientId: 'user-1', readAt: null },
      });
    });
  });

  describe('markRead', () => {
    it('marks an unread row read', async () => {
      prisma.notification.findFirst.mockResolvedValue({
        id: 'n-1',
        readAt: null,
      });
      prisma.notification.update.mockResolvedValue({
        id: 'n-1',
        readAt: new Date(),
      });

      await expect(service.markRead('user-1', 'n-1')).resolves.toMatchObject({
        id: 'n-1',
      });
      expect(prisma.notification.findFirst).toHaveBeenCalledWith({
        where: { id: 'n-1', recipientId: 'user-1' },
      });
    });

    it('is idempotent for already-read rows', async () => {
      const row = { id: 'n-1', readAt: new Date() };
      prisma.notification.findFirst.mockResolvedValue(row);

      await expect(service.markRead('user-1', 'n-1')).resolves.toEqual(row);
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    it('404s for other recipients rows without leaking existence', async () => {
      prisma.notification.findFirst.mockResolvedValue(null);

      await expect(service.markRead('user-2', 'n-1')).rejects.toThrow(
        'Notification n-1 not found',
      );
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });
  });

  describe('markAllRead', () => {
    it('marks every unread row read for the recipient', async () => {
      let seenWhere: unknown;
      let seenReadAt: unknown;
      prisma.notification.updateMany.mockImplementation(
        (args: {
          where: { recipientId: string; readAt: null };
          data: { readAt: Date };
        }) => {
          seenWhere = args.where;
          seenReadAt = args.data.readAt;
          return Promise.resolve({ count: 3 });
        },
      );

      await expect(service.markAllRead('user-1')).resolves.toEqual({
        count: 3,
      });
      expect(prisma.notification.updateMany).toHaveBeenCalledTimes(1);
      expect(seenWhere).toEqual({ recipientId: 'user-1', readAt: null });
      expect(seenReadAt).toBeInstanceOf(Date);
    });
  });

  describe('notifyRequestCreated', () => {
    const links = [{ teacherId: 't-1' }, { teacherId: 't-2' }];

    beforeEach(() => {
      prisma.teacherSubject.findMany.mockResolvedValue(links);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.teacherAvailability.findMany.mockResolvedValue([]);
      prisma.notification.createMany.mockResolvedValue({ count: 2 });
    });

    it('notifies teachers with no availability windows set', async () => {
      const result = await service.notifyRequestCreated(
        'r-1',
        's-1',
        'learner-1',
      );

      expect(result).toEqual({ notified: ['t-1', 't-2'], suppressed: [] });
      expect(prisma.notification.createMany).toHaveBeenCalledWith({
        data: [
          {
            recipientId: 't-1',
            type: 'REQUEST_CREATED',
            requestId: 'r-1',
            actorId: 'learner-1',
          },
          {
            recipientId: 't-2',
            type: 'REQUEST_CREATED',
            requestId: 'r-1',
            actorId: 'learner-1',
          },
        ],
        skipDuplicates: true,
      });
    });

    it('never notifies the actor', async () => {
      prisma.teacherSubject.findMany.mockResolvedValue([
        { teacherId: 'learner-1' },
      ]);

      const result = await service.notifyRequestCreated(
        'r-1',
        's-1',
        'learner-1',
      );

      expect(result).toEqual({ notified: [], suppressed: [] });
      expect(prisma.notification.createMany).not.toHaveBeenCalled();
    });

    it('suppresses teachers who are outside their windows', async () => {
      prisma.teacherAvailability.findMany.mockResolvedValue([
        {
          teacherId: 't-1',
          weekday: 1,
          startTime: '09:00',
          endTime: '17:00',
          timezone: 'Africa/Accra',
        },
        // Sunday 00:00 UTC is Sunday 00:00 in Accra (no DST): t-1 is off.
      ]);

      const result = await service.notifyRequestCreated(
        'r-1',
        's-1',
        'learner-1',
        new Date('2026-10-18T00:00:00.000Z'),
      );

      // t-1 has windows but none cover now; t-2 has none at all.
      expect(result).toEqual({ notified: ['t-2'], suppressed: ['t-1'] });
      expect(prisma.notification.createMany).toHaveBeenCalledWith({
        data: [
          {
            recipientId: 't-2',
            type: 'REQUEST_CREATED',
            requestId: 'r-1',
            actorId: 'learner-1',
          },
        ],
        skipDuplicates: true,
      });
    });

    it('notifies teachers inside their windows', async () => {
      prisma.teacherAvailability.findMany.mockResolvedValue([
        {
          teacherId: 't-1',
          weekday: 0,
          startTime: '00:00',
          endTime: '23:59',
          timezone: 'Africa/Accra',
        },
      ]);

      const result = await service.notifyRequestCreated(
        'r-1',
        's-1',
        'learner-1',
        new Date('2026-10-18T12:00:00.000Z'),
      );

      expect(result.notified).toEqual(['t-1', 't-2']);
    });

    it('pushes the request topic to every notified teacher', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue({
        topic: 'Mitosis phases',
        subject: { name: 'Biology' },
      });

      await service.notifyRequestCreated('r-1', 's-1', 'learner-1');

      expect(mockPushService.sendToUser).toHaveBeenCalledTimes(2);
      expect(mockPushService.sendToUser).toHaveBeenCalledWith('t-1', {
        title: 'New request in Biology',
        body: 'Mitosis phases',
        url: '/requests/r-1',
        tag: 'request-r-1',
        vibrate: [150, 75, 150],
      });
      expect(mockPushService.sendToUser).toHaveBeenCalledWith('t-2', {
        title: 'New request in Biology',
        body: 'Mitosis phases',
        url: '/requests/r-1',
        tag: 'request-r-1',
        vibrate: [150, 75, 150],
      });
    });

    it('still fans out when push delivery fails', async () => {
      mockPushService.sendToUser.mockRejectedValueOnce(new Error('offline'));

      const result = await service.notifyRequestCreated(
        'r-1',
        's-1',
        'learner-1',
      );

      expect(result).toEqual({ notified: ['t-1', 't-2'], suppressed: [] });
      expect(prisma.notification.createMany).toHaveBeenCalled();
    });
  });

  describe('learner notifications', () => {
    beforeEach(() => {
      prisma.helpRequest.findUnique.mockResolvedValue({ topic: 'Mitosis' });
      prisma.user.findUnique.mockResolvedValue({ name: 'Tara' });
    });

    it('notifies the learner on accept', async () => {
      prisma.notification.upsert.mockResolvedValue({ id: 'n-1' });

      await service.notifyRequestAccepted('r-1', 'learner-1', 'teacher-1');
      expect(prisma.notification.upsert).toHaveBeenCalledWith({
        where: {
          recipientId_requestId_type: {
            recipientId: 'learner-1',
            requestId: 'r-1',
            type: 'REQUEST_ACCEPTED',
          },
        },
        update: {},
        create: {
          recipientId: 'learner-1',
          type: 'REQUEST_ACCEPTED',
          requestId: 'r-1',
          actorId: 'teacher-1',
        },
      });
    });

    it('notifies the learner on session update', async () => {
      prisma.notification.upsert.mockResolvedValue({ id: 'n-1' });

      await service.notifySessionUpdated('r-1', 'learner-1', 'teacher-1');
      expect(prisma.notification.upsert).toHaveBeenCalledWith({
        where: {
          recipientId_requestId_type: {
            recipientId: 'learner-1',
            requestId: 'r-1',
            type: 'SESSION_UPDATED',
          },
        },
        update: {},
        create: {
          recipientId: 'learner-1',
          type: 'SESSION_UPDATED',
          requestId: 'r-1',
          actorId: 'teacher-1',
        },
      });
    });

    it('pushes the acceptance to the learner', async () => {
      prisma.notification.upsert.mockResolvedValue({ id: 'n-1' });

      await service.notifyRequestAccepted('r-1', 'learner-1', 'teacher-1');
      expect(mockPushService.sendToUser).toHaveBeenCalledWith('learner-1', {
        title: 'Your request was accepted',
        body: 'Tara will help with "Mitosis".',
        url: '/requests/r-1',
        tag: 'request-r-1',
        vibrate: [100],
      });
    });

    it('pushes session updates to the learner', async () => {
      prisma.notification.upsert.mockResolvedValue({ id: 'n-1' });

      await service.notifySessionUpdated('r-1', 'learner-1', 'teacher-1');
      expect(mockPushService.sendToUser).toHaveBeenCalledWith('learner-1', {
        title: 'Session details updated',
        body: 'New time or link for "Mitosis".',
        url: '/requests/r-1',
        tag: 'request-r-1',
        vibrate: [100, 50, 100],
        renotify: true,
        requireInteraction: true,
      });
    });

    it('skips self-notifies', async () => {
      await service.notifyRequestAccepted('r-1', 'admin-1', 'admin-1');
      expect(prisma.notification.upsert).not.toHaveBeenCalled();
      expect(mockPushService.sendToUser).not.toHaveBeenCalled();
    });
  });

  describe('escalateStaleRequests', () => {
    it('returns zero when nothing is stale', async () => {
      prisma.helpRequest.findMany.mockResolvedValue([]);

      await expect(service.escalateStaleRequests()).resolves.toEqual({
        escalated: 0,
      });
      expect(prisma.notification.createMany).not.toHaveBeenCalled();
    });

    it('notifies eligible recipients missing a row, regardless of availability', async () => {
      const now = new Date('2026-10-18T12:00:00.000Z');
      prisma.helpRequest.findMany.mockResolvedValue([
        {
          id: 'r-1',
          subjectId: 's-1',
          learnerId: 'learner-1',
          topic: 'Mitosis',
          subject: { name: 'Biology' },
        },
      ]);
      prisma.teacherSubject.findMany.mockResolvedValue([
        { teacherId: 't-1', subjectId: 's-1' },
        { teacherId: 't-2', subjectId: 's-1' },
      ]);
      prisma.user.findMany.mockResolvedValue([]);
      // t-1 was notified at creation; t-2 was suppressed.
      prisma.notification.findMany.mockResolvedValue([
        { recipientId: 't-1', requestId: 'r-1' },
      ]);
      prisma.notification.createMany.mockResolvedValue({ count: 1 });

      await expect(service.escalateStaleRequests(45, now)).resolves.toEqual({
        escalated: 1,
      });
      expect(prisma.notification.createMany).toHaveBeenCalledWith({
        data: [
          {
            recipientId: 't-2',
            type: 'REQUEST_CREATED',
            requestId: 'r-1',
            actorId: 'learner-1',
          },
        ],
        skipDuplicates: true,
      });
      expect(prisma.helpRequest.findMany).toHaveBeenCalledWith({
        where: {
          status: 'OPEN',
          createdAt: {
            lt: new Date(now.getTime() - ESCALATION_THRESHOLD_MINUTES * 60_000),
          },
        },
        select: {
          id: true,
          subjectId: true,
          learnerId: true,
          topic: true,
          subject: { select: { name: true } },
        },
      });
      expect(mockPushService.sendToUser).toHaveBeenCalledTimes(1);
      expect(mockPushService.sendToUser).toHaveBeenCalledWith('t-2', {
        title: 'New request in Biology',
        body: 'Mitosis',
        url: '/requests/r-1',
        tag: 'request-r-1',
        vibrate: [150, 75, 150],
        silent: true,
      });
    });
  });
});
