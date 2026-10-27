import { Test, TestingModule } from '@nestjs/testing';

import { MediaService } from '../media/media.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { HelpRequestsService } from './help-requests.service.js';

// Session times must be in the future; compute them so the suite does not rot.
const FUTURE_ISO = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const FUTURE_DATE = new Date(FUTURE_ISO);

const mockPrismaService = {
  subject: {
    findUnique: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  teacherSubject: {
    findFirst: jest.fn(),
  },
  helpRequest: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  },
  helpLink: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  helpFeedback: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
  },
  helpRequestDecision: {
    upsert: jest.fn(),
  },
  helpSession: {
    create: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn((callback: (tx: TxMock) => unknown) =>
    callback(mockTx),
  ),
};

interface TxMock {
  helpRequest: {
    findUnique: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
  };
  mediaUpload: {
    update: jest.Mock;
  };
  helpLink: {
    deleteMany: jest.Mock;
    createMany: jest.Mock;
  };
  teacherSubject: {
    findFirst: jest.Mock;
  };
  helpRequestDecision: {
    upsert: jest.Mock;
  };
  helpSession: {
    create: jest.Mock;
  };
}

const mockTx: TxMock = {
  helpRequest: {
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  mediaUpload: {
    update: jest.fn(),
  },
  helpLink: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
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

const mediaSelect = {
  select: {
    id: true,
    kind: true,
    contentType: true,
    byteSize: true,
    durationSeconds: true,
    objectKey: true,
  },
};
const mediaSummarySelect = { select: { id: true, kind: true } };

const dto = {
  subjectId: 's-1',
  topic: 'Integration by parts keeps failing',
  details: 'LIATE ordering confuses me',
};

const mockMediaService = {
  sign: jest.fn(),
  assertAttachable: jest.fn(),
  copyIntoRequests: jest.fn(),
  rollbackCopies: jest.fn(),
  dropStagedCopies: jest.fn(),
};

const mockNotificationsService = {
  notifyRequestCreated: jest.fn(),
  notifyRequestAccepted: jest.fn(),
  notifySessionUpdated: jest.fn(),
  notifyFeedbackCreated: jest.fn(),
  escalateStaleRequests: jest.fn(),
};

describe('HelpRequestsService', () => {
  let service: HelpRequestsService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockMediaService.sign.mockResolvedValue([]);
    mockMediaService.assertAttachable.mockResolvedValue([]);
    mockMediaService.copyIntoRequests.mockResolvedValue([]);
    mockMediaService.rollbackCopies.mockResolvedValue(undefined);
    mockMediaService.dropStagedCopies.mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HelpRequestsService,
        { provide: PrismaService, useValue: mockPrismaService },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
        { provide: MediaService, useValue: mockMediaService },
      ],
    }).compile();

    service = module.get<HelpRequestsService>(HelpRequestsService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const subject = { id: 's-1', name: 'Biology', isActive: true };
    const created = { id: 'r-1', topic: dto.topic, media: [] };

    function arrangeRequestCreated() {
      prisma.subject.findUnique.mockResolvedValue(subject);
      mockTx.helpRequest.create.mockResolvedValue({ id: 'r-1' });
      prisma.helpRequest.findUniqueOrThrow.mockResolvedValue(created);
    }

    it('creates the request with subject and links', async () => {
      arrangeRequestCreated();

      await expect(
        service.create('learner-1', {
          ...dto,
          links: [{ url: 'https://example.com/video' }],
        }),
      ).resolves.toEqual(created);
      expect(mockTx.helpRequest.create).toHaveBeenCalledWith({
        data: {
          learnerId: 'learner-1',
          subjectId: 's-1',
          topic: dto.topic,
          details: dto.details,
          links: { create: [{ url: 'https://example.com/video' }] },
        },
      });
      expect(mockTx.mediaUpload.update).not.toHaveBeenCalled();
    });

    it('accepts a link as the only context', async () => {
      arrangeRequestCreated();

      await expect(
        service.create('learner-1', {
          subjectId: 's-1',
          topic: 'Help me',
          links: [{ url: 'https://example.com/video' }],
        }),
      ).resolves.toEqual(created);
      expect(mockTx.helpRequest.create).toHaveBeenCalledWith({
        data: {
          learnerId: 'learner-1',
          subjectId: 's-1',
          topic: 'Help me',
          details: undefined,
          links: { create: [{ url: 'https://example.com/video' }] },
        },
      });
    });

    it('rejects a request with no context at all', async () => {
      prisma.subject.findUnique.mockResolvedValue(subject);

      await expect(
        service.create('learner-1', {
          subjectId: 's-1',
          topic: 'Help me',
          details: '   ',
        }),
      ).rejects.toThrow(
        'Add at least one of: a description, a link, an image, or a voice note.',
      );
      expect(mockTx.helpRequest.create).not.toHaveBeenCalled();
    });

    it('rejects a voice note without a written summary', async () => {
      prisma.subject.findUnique.mockResolvedValue(subject);
      mockMediaService.assertAttachable.mockResolvedValue([
        {
          id: 'm-1',
          kind: 'AUDIO',
          contentType: 'audio/webm',
          objectKey: 'staging/u/m-1',
        },
      ]);

      await expect(
        service.create('learner-1', {
          subjectId: 's-1',
          topic: 'Help me',
          mediaIds: ['m-1'],
        }),
      ).rejects.toThrow('Add a short written summary with your voice note.');
      expect(mockTx.helpRequest.create).not.toHaveBeenCalled();
    });

    it('attaches ready media and moves the objects', async () => {
      arrangeRequestCreated();
      mockMediaService.assertAttachable.mockResolvedValue([
        {
          id: 'm-1',
          kind: 'IMAGE',
          contentType: 'image/jpeg',
          objectKey: 'staging/u/m-1',
        },
      ]);
      mockMediaService.copyIntoRequests.mockResolvedValue([
        { id: 'm-1', fromKey: 'staging/u/m-1', toKey: 'requests/m-1.jpg' },
      ]);

      await service.create('learner-1', {
        subjectId: 's-1',
        topic: 'Help me',
        mediaIds: ['m-1'],
      });

      expect(mockMediaService.assertAttachable).toHaveBeenCalledWith(
        'learner-1',
        ['m-1'],
      );
      expect(mockTx.mediaUpload.update).toHaveBeenCalledWith({
        where: { id: 'm-1' },
        data: { requestId: 'r-1', objectKey: 'requests/m-1.jpg' },
      });
      expect(mockMediaService.dropStagedCopies).toHaveBeenCalled();
    });

    it('rolls the copies back when the request write fails', async () => {
      prisma.subject.findUnique.mockResolvedValue(subject);
      mockMediaService.assertAttachable.mockResolvedValue([
        {
          id: 'm-1',
          kind: 'IMAGE',
          contentType: 'image/jpeg',
          objectKey: 'staging/u/m-1',
        },
      ]);
      mockMediaService.copyIntoRequests.mockResolvedValue([
        { id: 'm-1', fromKey: 'staging/u/m-1', toKey: 'requests/m-1.jpg' },
      ]);
      mockTx.helpRequest.create.mockRejectedValue(new Error('db down'));

      await expect(
        service.create('learner-1', {
          subjectId: 's-1',
          topic: 'Help me',
          mediaIds: ['m-1'],
        }),
      ).rejects.toThrow('db down');
      expect(mockMediaService.rollbackCopies).toHaveBeenCalled();
    });

    it('rejects missing subjects', async () => {
      prisma.subject.findUnique.mockResolvedValue(null);

      await expect(service.create('learner-1', dto)).rejects.toThrow(
        'Subject is not available for help requests',
      );
      expect(mockTx.helpRequest.create).not.toHaveBeenCalled();
    });

    it('rejects inactive subjects', async () => {
      prisma.subject.findUnique.mockResolvedValue({
        id: 's-1',
        isActive: false,
      });

      await expect(service.create('learner-1', dto)).rejects.toThrow(
        'Subject is not available for help requests',
      );
      expect(mockTx.helpRequest.create).not.toHaveBeenCalled();
    });
  });

  describe('findMine', () => {
    it('returns newest first, scoped to the learner', async () => {
      const rows = [{ id: 'r-1', media: [] }];
      prisma.helpRequest.findMany.mockResolvedValue(rows);

      await expect(service.findMine('learner-1')).resolves.toEqual(rows);
      expect(prisma.helpRequest.findMany).toHaveBeenCalledWith({
        where: { learnerId: 'learner-1' },
        include: {
          subject: true,
          links: true,
          media: mediaSelect,
          teacher: { select: { id: true, name: true } },
          session: true,
          feedback: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findOneFor', () => {
    const row = {
      id: 'r-1',
      learnerId: 'learner-1',
      subjectId: 's-1',
      media: [],
    };

    it('returns the request to its owner', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue(row);

      await expect(service.findOneFor('learner-1', 'r-1')).resolves.toEqual(
        row,
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('returns the request to admins', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue(row);
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });

      await expect(service.findOneFor('admin-1', 'r-1')).resolves.toEqual(row);
    });

    it('returns the request to teachers holding the subject', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue(row);
      prisma.user.findUnique.mockResolvedValue({ role: 'TEACHER' });
      prisma.teacherSubject.findFirst.mockResolvedValue({
        teacherId: 'teacher-1',
      });

      await expect(service.findOneFor('teacher-1', 'r-1')).resolves.toEqual(
        row,
      );
      expect(prisma.teacherSubject.findFirst).toHaveBeenCalledWith({
        where: { teacherId: 'teacher-1', subjectId: 's-1' },
      });
    });

    it('404s for unrelated teachers to avoid existence leaks', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue(row);
      prisma.user.findUnique.mockResolvedValue({ role: 'TEACHER' });
      prisma.teacherSubject.findFirst.mockResolvedValue(null);

      await expect(service.findOneFor('teacher-2', 'r-1')).rejects.toThrow(
        'Request r-1 not found',
      );
    });

    it('404s for other learners', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue(row);
      prisma.user.findUnique.mockResolvedValue({ role: 'STUDENT' });
      prisma.teacherSubject.findFirst.mockResolvedValue(null);

      await expect(service.findOneFor('learner-2', 'r-1')).rejects.toThrow(
        'Request r-1 not found',
      );
    });

    it('404s for missing requests', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue(null);

      await expect(service.findOneFor('learner-1', 'nope')).rejects.toThrow(
        'Request nope not found',
      );
    });
  });

  describe('findQueue', () => {
    const subjectFields = {
      id: 's-1',
      name: 'Biology',
      slug: 'biology',
      description: null,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    // Exact include the service must send: the teacher count feeds
    // `hasTeacher` and never leaves the server.
    const queueInclude = {
      subject: {
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { teachers: true } },
        },
      },
      links: true,
      media: mediaSummarySelect,
      learner: { select: { id: true, name: true } },
    };

    it('returns everything oldest-first for admins', async () => {
      const rows = [
        { id: 'r-1', subject: { ...subjectFields, _count: { teachers: 2 } } },
      ];
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.helpRequest.findMany.mockResolvedValue(rows);

      await expect(service.findQueue('admin-1')).resolves.toEqual([
        { id: 'r-1', subject: subjectFields, hasTeacher: true },
      ]);
      expect(prisma.helpRequest.findMany).toHaveBeenCalledWith({
        where: { status: 'OPEN' },
        include: queueInclude,
        orderBy: { createdAt: 'asc' },
      });
    });

    it('flags requests whose subject has no teachers', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.helpRequest.findMany.mockResolvedValue([
        { id: 'r-2', subject: { ...subjectFields, _count: { teachers: 0 } } },
      ]);

      const [row] = await service.findQueue('admin-1');
      expect(row).toEqual({
        id: 'r-2',
        subject: subjectFields,
        hasTeacher: false,
      });
      expect(row).not.toHaveProperty('subject._count');
    });

    it('filters to the teacher subjects', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'TEACHER' });
      prisma.helpRequest.findMany.mockResolvedValue([]);

      await service.findQueue('teacher-1');
      expect(prisma.helpRequest.findMany).toHaveBeenCalledWith({
        where: {
          status: 'OPEN',
          subject: { teachers: { some: { teacherId: 'teacher-1' } } },
          NOT: { decisions: { some: { teacherId: 'teacher-1' } } },
        },
        include: queueInclude,
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  describe('isAdmin', () => {
    it('returns true for admins', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });

      await expect(service.isAdmin('admin-1')).resolves.toBe(true);
    });

    it('returns false otherwise', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'TEACHER' });

      await expect(service.isAdmin('teacher-1')).resolves.toBe(false);
    });
  });

  describe('acceptRequest', () => {
    const openRow = {
      id: 'r-1',
      status: 'OPEN',
      subjectId: 's-1',
      media: [],
    };

    it('accepts an open request with session details', async () => {
      mockTx.helpRequest.findUnique.mockResolvedValue(openRow);
      mockTx.teacherSubject.findFirst.mockResolvedValue({ teacherId: 't-1' });
      const accepted = { ...openRow, status: 'ACCEPTED' };
      mockTx.helpRequest.findUnique.mockResolvedValueOnce(openRow);
      mockTx.helpRequest.findUnique.mockResolvedValue(accepted);

      const result = await service.acceptRequest('t-1', false, 'r-1', {
        sessionUrl: 'https://meet.google.com/abc',
        scheduledAt: FUTURE_ISO,
      });

      expect(result).toEqual(accepted);
      expect(mockTx.helpRequest.update).toHaveBeenCalledWith({
        where: { id: 'r-1' },
        data: { status: 'ACCEPTED', teacherId: 't-1' },
      });
      expect(mockTx.helpRequestDecision.upsert).toHaveBeenCalledWith({
        where: { requestId_teacherId: { requestId: 'r-1', teacherId: 't-1' } },
        update: { decision: 'ACCEPTED' },
        create: { requestId: 'r-1', teacherId: 't-1', decision: 'ACCEPTED' },
      });
      expect(mockTx.helpSession.create).toHaveBeenCalledWith({
        data: {
          requestId: 'r-1',
          sessionUrl: 'https://meet.google.com/abc',
          scheduledAt: FUTURE_DATE,
          source: 'MANUAL',
        },
      });
    });

    it('404s for missing requests', async () => {
      mockTx.helpRequest.findUnique.mockResolvedValue(null);

      await expect(
        service.acceptRequest('t-1', false, 'nope', {}),
      ).rejects.toThrow('Request nope not found');
    });

    it('409s when the request is no longer open', async () => {
      mockTx.helpRequest.findUnique.mockResolvedValue({
        ...openRow,
        status: 'ACCEPTED',
      });

      await expect(
        service.acceptRequest('t-1', false, 'r-1', {}),
      ).rejects.toThrow('Request is no longer open');
      expect(mockTx.helpRequest.update).not.toHaveBeenCalled();
    });

    it('403s for teachers without the subject', async () => {
      mockTx.helpRequest.findUnique.mockResolvedValue(openRow);
      mockTx.teacherSubject.findFirst.mockResolvedValue(null);

      await expect(
        service.acceptRequest('t-2', false, 'r-1', {}),
      ).rejects.toThrow('Only teachers of this subject can accept');
    });

    it('skips the subject check for admins', async () => {
      mockTx.helpRequest.findUnique.mockResolvedValueOnce(openRow);
      const accepted = { ...openRow, status: 'ACCEPTED' };
      mockTx.helpRequest.findUnique.mockResolvedValue(accepted);

      await expect(
        service.acceptRequest('admin-1', true, 'r-1', {}),
      ).resolves.toEqual(accepted);
      expect(mockTx.teacherSubject.findFirst).not.toHaveBeenCalled();
    });

    it('400s for unparseable session times', async () => {
      await expect(
        service.acceptRequest('t-1', false, 'r-1', { scheduledAt: 'soon' }),
      ).rejects.toThrow('scheduledAt must be a valid datetime');
    });

    it('400s for past session times', async () => {
      await expect(
        service.acceptRequest('t-1', false, 'r-1', {
          scheduledAt: '2020-01-01T00:00:00.000Z',
        }),
      ).rejects.toThrow('scheduledAt must be in the future');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('declineRequest', () => {
    const openRow = { id: 'r-1', status: 'OPEN', subjectId: 's-1' };

    it('records the decline and leaves the request open', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue(openRow);
      prisma.teacherSubject.findFirst.mockResolvedValue({ teacherId: 't-1' });
      prisma.helpRequestDecision.upsert.mockResolvedValue({});

      await expect(
        service.declineRequest('t-1', false, 'r-1'),
      ).resolves.toEqual({ id: 'r-1', declined: true });
      expect(prisma.helpRequestDecision.upsert).toHaveBeenCalledWith({
        where: { requestId_teacherId: { requestId: 'r-1', teacherId: 't-1' } },
        update: { decision: 'DECLINED' },
        create: { requestId: 'r-1', teacherId: 't-1', decision: 'DECLINED' },
      });
      expect(prisma.helpRequest.update).not.toHaveBeenCalled();
    });

    it('409s when the request is no longer open', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue({
        ...openRow,
        status: 'CLOSED',
      });

      await expect(service.declineRequest('t-1', false, 'r-1')).rejects.toThrow(
        'Request is no longer open',
      );
    });

    it('403s for teachers without the subject', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue(openRow);
      prisma.teacherSubject.findFirst.mockResolvedValue(null);

      await expect(service.declineRequest('t-2', false, 'r-1')).rejects.toThrow(
        'Only teachers of this subject can decline',
      );
    });
  });

  describe('closeRequest', () => {
    const row = {
      id: 'r-1',
      learnerId: 'learner-1',
      teacherId: null,
      status: 'OPEN',
      media: [],
    };

    it('closes for the owner', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue(row);
      const closed = { ...row, status: 'CLOSED' };
      prisma.helpRequest.update.mockResolvedValue(closed);

      await expect(
        service.closeRequest('learner-1', false, 'r-1'),
      ).resolves.toEqual(closed);
      expect(prisma.helpRequest.update).toHaveBeenCalledWith({
        where: { id: 'r-1' },
        data: { status: 'CLOSED' },
        include: {
          subject: true,
          links: true,
          media: mediaSelect,
          learner: { select: { id: true, name: true } },
          teacher: { select: { id: true, name: true } },
          session: true,
          feedback: true,
        },
      });
    });

    it('closes for the assigned teacher', async () => {
      const assigned = { ...row, teacherId: 'teacher-1', status: 'ACCEPTED' };
      prisma.helpRequest.findUnique.mockResolvedValue(assigned);
      prisma.helpRequest.update.mockResolvedValue({
        ...assigned,
        status: 'CLOSED',
      });

      await expect(
        service.closeRequest('teacher-1', false, 'r-1'),
      ).resolves.toBeDefined();
    });

    it('404s for unauthorized closers without leaking existence', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue(row);
      prisma.user.findUnique.mockResolvedValue({ role: 'STUDENT' });
      prisma.teacherSubject.findFirst.mockResolvedValue(null);

      await expect(
        service.closeRequest('learner-2', false, 'r-1'),
      ).rejects.toThrow('Request r-1 not found');
      expect(prisma.helpRequest.update).not.toHaveBeenCalled();
    });

    it('is idempotent when already closed', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue({
        ...row,
        status: 'CLOSED',
      });

      await expect(
        service.closeRequest('learner-1', false, 'r-1'),
      ).resolves.toBeDefined();
      expect(prisma.helpRequest.update).not.toHaveBeenCalled();
    });
  });

  describe('updateSession', () => {
    const row = {
      id: 'r-1',
      learnerId: 'learner-1',
      teacherId: 'teacher-1',
      status: 'ACCEPTED',
      session: { id: 's-1', requestId: 'r-1' },
      media: [],
    };

    it('updates link and time for the assigned teacher', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue(row);
      const updated = { ...row, status: 'ACCEPTED' };
      prisma.helpRequest.findUnique.mockResolvedValueOnce(row);
      prisma.helpRequest.findUnique.mockResolvedValue(updated);
      prisma.helpSession.update.mockResolvedValue({});

      await expect(
        service.updateSession('teacher-1', false, 'r-1', {
          sessionUrl: 'https://meet.google.com/xyz',
          scheduledAt: FUTURE_ISO,
        }),
      ).resolves.toEqual(updated);
      expect(prisma.helpSession.update).toHaveBeenCalledWith({
        where: { requestId: 'r-1' },
        data: {
          sessionUrl: 'https://meet.google.com/xyz',
          scheduledAt: FUTURE_DATE,
        },
      });
    });

    it('updates link and time for admins', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue(row);
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.helpSession.update.mockResolvedValue({});

      await expect(
        service.updateSession('admin-1', true, 'r-1', {}),
      ).resolves.toBeDefined();
    });

    it('404s for teachers who did not accept', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue(row);
      prisma.user.findUnique.mockResolvedValue({ role: 'TEACHER' });
      prisma.teacherSubject.findFirst.mockResolvedValue(null);

      await expect(
        service.updateSession('teacher-2', false, 'r-1', {}),
      ).rejects.toThrow('Request r-1 not found');
      expect(prisma.helpSession.update).not.toHaveBeenCalled();
    });

    it('404s when no session exists yet', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue({
        ...row,
        teacherId: null,
        session: null,
      });
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });

      await expect(
        service.updateSession('admin-1', true, 'r-1', {}),
      ).rejects.toThrow('Request r-1 has no session yet');
    });

    it('400s for unparseable session times', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue(row);

      await expect(
        service.updateSession('teacher-1', false, 'r-1', {
          scheduledAt: 'soon',
        }),
      ).rejects.toThrow('scheduledAt must be a valid datetime');
    });

    it('400s for past session times', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue(row);

      await expect(
        service.updateSession('teacher-1', false, 'r-1', {
          scheduledAt: '2020-01-01T00:00:00.000Z',
        }),
      ).rejects.toThrow('scheduledAt must be in the future');
      expect(prisma.helpSession.update).not.toHaveBeenCalled();
    });
  });

  describe('updateRequest', () => {
    const openRow = {
      id: 'r-1',
      learnerId: 'learner-1',
      status: 'OPEN',
      subjectId: 's-1',
      media: [],
    };

    it('updates topic and details for the owner', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue(openRow);
      const updated = { ...openRow, topic: 'New topic' };
      prisma.helpRequest.update.mockResolvedValue(updated);
      prisma.helpRequest.findUnique.mockResolvedValueOnce(openRow);
      prisma.helpRequest.findUnique.mockResolvedValue(updated);

      await expect(
        service.updateRequest('learner-1', 'r-1', {
          topic: 'New topic',
          details: 'More context',
        }),
      ).resolves.toEqual(updated);
      expect(prisma.helpRequest.update).toHaveBeenCalledWith({
        where: { id: 'r-1' },
        data: { topic: 'New topic', details: 'More context' },
      });
    });

    it('replaces links in a transaction', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue(openRow);
      const updated = { ...openRow };
      (prisma.$transaction as jest.Mock).mockImplementationOnce(
        (cb: (tx: typeof mockTx) => unknown) => Promise.resolve(cb(mockTx)),
      );
      mockTx.helpLink.deleteMany.mockResolvedValue({});
      mockTx.helpLink.createMany.mockResolvedValue({});
      mockTx.helpRequest.update.mockResolvedValue(updated);
      prisma.helpRequest.findUnique.mockResolvedValueOnce(openRow);
      prisma.helpRequest.findUnique.mockResolvedValue(updated);

      await expect(
        service.updateRequest('learner-1', 'r-1', {
          links: [{ url: 'https://example.com/a' }],
        }),
      ).resolves.toEqual(updated);
      expect(mockTx.helpLink.deleteMany).toHaveBeenCalledWith({
        where: { requestId: 'r-1' },
      });
    });

    it('404s for non-owners without leaking existence', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue(openRow);

      await expect(
        service.updateRequest('learner-2', 'r-1', { topic: 'x' }),
      ).rejects.toThrow('Request r-1 not found');
    });

    it('409s when the request is no longer open', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue({
        ...openRow,
        status: 'ACCEPTED',
      });

      await expect(
        service.updateRequest('learner-1', 'r-1', { topic: 'x' }),
      ).rejects.toThrow('Only open requests can be edited');
    });

    it('400s when nothing changes', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue(openRow);

      await expect(
        service.updateRequest('learner-1', 'r-1', {}),
      ).rejects.toThrow('Nothing to update');
    });
  });

  describe('feedback', () => {
    const acceptedRow = {
      id: 'r-1',
      learnerId: 'learner-1',
      teacherId: 'teacher-1',
      status: 'ACCEPTED',
      subjectId: 's-1',
    };

    it('upserts feedback for the owner after accept', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue(acceptedRow);
      const saved = { id: 'f-1', requestId: 'r-1', rating: 5, comment: null };
      prisma.helpFeedback.upsert.mockResolvedValue(saved);

      await expect(
        service.upsertFeedback('learner-1', 'r-1', { rating: 5 }),
      ).resolves.toEqual(saved);
      expect(prisma.helpFeedback.upsert).toHaveBeenCalledWith({
        where: { requestId: 'r-1' },
        update: { rating: 5, comment: null },
        create: { requestId: 'r-1', rating: 5, comment: null },
      });
    });

    it('pings the assigned teacher best-effort', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue(acceptedRow);
      prisma.helpFeedback.upsert.mockResolvedValue({
        id: 'f-1',
        requestId: 'r-1',
        rating: 5,
        comment: null,
      });

      await service.upsertFeedback('learner-1', 'r-1', { rating: 5 });
      expect(
        mockNotificationsService.notifyFeedbackCreated,
      ).toHaveBeenCalledWith('r-1', 'teacher-1', 'learner-1');
    });

    it('400s while the request is still open', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue({
        ...acceptedRow,
        status: 'OPEN',
      });

      await expect(
        service.upsertFeedback('learner-1', 'r-1', { rating: 4 }),
      ).rejects.toThrow(
        'You can share feedback after a teacher accepts your request.',
      );
    });

    it('404s for non-owners', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue(acceptedRow);

      await expect(
        service.upsertFeedback('learner-2', 'r-1', { rating: 4 }),
      ).rejects.toThrow('Request r-1 not found');
    });

    it('returns feedback to the assigned teacher', async () => {
      prisma.helpRequest.findUnique.mockResolvedValue({
        ...acceptedRow,
        learner: { id: 'learner-1', name: 'Ama' },
        teacher: { id: 'teacher-1', name: 'Kofi' },
      });
      const saved = { id: 'f-1', requestId: 'r-1', rating: 5 };
      prisma.helpFeedback.findUnique.mockResolvedValue(saved);

      await expect(
        service.getFeedback('teacher-1', false, 'r-1'),
      ).resolves.toEqual(saved);
    });
  });
});
