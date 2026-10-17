import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service.js';
import { HelpRequestsService } from './help-requests.service.js';

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
  },
};

const dto = {
  subjectId: 's-1',
  topic: 'Integration by parts keeps failing',
  details: 'LIATE ordering confuses me',
};

describe('HelpRequestsService', () => {
  let service: HelpRequestsService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HelpRequestsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<HelpRequestsService>(HelpRequestsService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates the request with subject and links', async () => {
      prisma.subject.findUnique.mockResolvedValue({
        id: 's-1',
        isActive: true,
      });
      const created = { id: 'r-1', ...dto };
      prisma.helpRequest.create.mockResolvedValue(created);

      await expect(
        service.create('learner-1', {
          ...dto,
          links: [{ url: 'https://example.com/video', label: 'Lost at 6:12' }],
        }),
      ).resolves.toEqual(created);
      expect(prisma.helpRequest.create).toHaveBeenCalledWith({
        data: {
          learnerId: 'learner-1',
          subjectId: 's-1',
          topic: dto.topic,
          details: dto.details,
          links: {
            create: [
              { url: 'https://example.com/video', label: 'Lost at 6:12' },
            ],
          },
        },
        include: { subject: true, links: true },
      });
    });

    it('rejects missing subjects', async () => {
      prisma.subject.findUnique.mockResolvedValue(null);

      await expect(service.create('learner-1', dto)).rejects.toThrow(
        'Subject is not available for help requests',
      );
      expect(prisma.helpRequest.create).not.toHaveBeenCalled();
    });

    it('rejects inactive subjects', async () => {
      prisma.subject.findUnique.mockResolvedValue({
        id: 's-1',
        isActive: false,
      });

      await expect(service.create('learner-1', dto)).rejects.toThrow(
        'Subject is not available for help requests',
      );
      expect(prisma.helpRequest.create).not.toHaveBeenCalled();
    });

    it('rejects requests with no context', async () => {
      prisma.subject.findUnique.mockResolvedValue({
        id: 's-1',
        isActive: true,
      });

      await expect(
        service.create('learner-1', {
          subjectId: 's-1',
          topic: 'Help me',
          details: '   ',
        }),
      ).rejects.toThrow('Provide details or at least one link');
      expect(prisma.helpRequest.create).not.toHaveBeenCalled();
    });
  });

  describe('findMine', () => {
    it('returns newest first, scoped to the learner', async () => {
      const rows = [{ id: 'r-1' }];
      prisma.helpRequest.findMany.mockResolvedValue(rows);

      await expect(service.findMine('learner-1')).resolves.toEqual(rows);
      expect(prisma.helpRequest.findMany).toHaveBeenCalledWith({
        where: { learnerId: 'learner-1' },
        include: { subject: true, links: true },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findOneFor', () => {
    const row = {
      id: 'r-1',
      learnerId: 'learner-1',
      subjectId: 's-1',
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
    it('returns everything oldest-first for admins', async () => {
      const rows = [{ id: 'r-1' }];
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.helpRequest.findMany.mockResolvedValue(rows);

      await expect(service.findQueue('admin-1')).resolves.toEqual(rows);
      expect(prisma.helpRequest.findMany).toHaveBeenCalledWith({
        where: {},
        include: {
          subject: true,
          links: true,
          learner: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('filters to the teacher subjects', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'TEACHER' });
      prisma.helpRequest.findMany.mockResolvedValue([]);

      await service.findQueue('teacher-1');
      expect(prisma.helpRequest.findMany).toHaveBeenCalledWith({
        where: { subject: { teachers: { some: { teacherId: 'teacher-1' } } } },
        include: {
          subject: true,
          links: true,
          learner: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
    });
  });
});
