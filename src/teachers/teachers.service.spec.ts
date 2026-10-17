import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service.js';
import { TeachersService } from './teachers.service.js';

const mockTx = {
  teacherSubject: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
    findMany: jest.fn(),
  },
};

const mockPrismaService = {
  subject: {
    findMany: jest.fn(),
  },
  teacherSubject: {
    findMany: jest.fn(),
  },
  teacherAvailability: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn((callback: (tx: typeof mockTx) => unknown) =>
    callback(mockTx),
  ),
};

describe('TeachersService', () => {
  let service: TeachersService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeachersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<TeachersService>(TeachersService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMyAvailability', () => {
    it('returns windows ordered by weekday then start', async () => {
      const windows = [{ id: 'w-1' }];
      prisma.teacherAvailability.findMany.mockResolvedValue(windows);

      await expect(service.getMyAvailability('t-1')).resolves.toEqual(windows);
      expect(prisma.teacherAvailability.findMany).toHaveBeenCalledWith({
        where: { teacherId: 't-1' },
        orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
      });
    });
  });

  describe('addMyAvailability', () => {
    const dto = {
      weekday: 1,
      startTime: '14:00',
      endTime: '18:00',
    };

    it('creates the window with the default timezone', async () => {
      prisma.teacherAvailability.findMany.mockResolvedValue([]);
      const created = { id: 'w-1', teacherId: 't-1', ...dto };
      prisma.teacherAvailability.create.mockResolvedValue(created);

      await expect(service.addMyAvailability('t-1', dto)).resolves.toEqual(
        created,
      );
      expect(prisma.teacherAvailability.create).toHaveBeenCalledWith({
        data: { teacherId: 't-1', ...dto, timezone: 'Africa/Accra' },
      });
    });

    it('rejects overnight windows', async () => {
      await expect(
        service.addMyAvailability('t-1', {
          ...dto,
          startTime: '18:00',
          endTime: '14:00',
        }),
      ).rejects.toThrow('End time must be after start time');
      expect(prisma.teacherAvailability.create).not.toHaveBeenCalled();
    });

    it('rejects unknown timezones', async () => {
      await expect(
        service.addMyAvailability('t-1', { ...dto, timezone: 'Mars/Olympus' }),
      ).rejects.toThrow('Unknown timezone: Mars/Olympus');
      expect(prisma.teacherAvailability.create).not.toHaveBeenCalled();
    });

    it('rejects windows overlapping the same weekday', async () => {
      prisma.teacherAvailability.findMany.mockResolvedValue([
        { startTime: '16:00', endTime: '20:00' },
      ]);

      await expect(service.addMyAvailability('t-1', dto)).rejects.toThrow(
        'Overlaps with existing window 16:00–20:00',
      );
      expect(prisma.teacherAvailability.create).not.toHaveBeenCalled();
    });

    it('allows adjacent windows and other weekdays', async () => {
      prisma.teacherAvailability.findMany.mockResolvedValue([
        { startTime: '10:00', endTime: '14:00' },
      ]);
      prisma.teacherAvailability.create.mockResolvedValue({ id: 'w-1' });

      await expect(service.addMyAvailability('t-1', dto)).resolves.toEqual({
        id: 'w-1',
      });
    });
  });

  describe('removeMyAvailability', () => {
    it('deletes an owned window', async () => {
      const window = { id: 'w-1', teacherId: 't-1' };
      prisma.teacherAvailability.findFirst.mockResolvedValue(window);
      prisma.teacherAvailability.delete.mockResolvedValue(window);

      await expect(service.removeMyAvailability('t-1', 'w-1')).resolves.toEqual(
        window,
      );
      expect(prisma.teacherAvailability.findFirst).toHaveBeenCalledWith({
        where: { id: 'w-1', teacherId: 't-1' },
      });
      expect(prisma.teacherAvailability.delete).toHaveBeenCalledWith({
        where: { id: 'w-1' },
      });
    });

    it('throws 404 for missing or foreign windows', async () => {
      prisma.teacherAvailability.findFirst.mockResolvedValue(null);

      await expect(service.removeMyAvailability('t-1', 'nope')).rejects.toThrow(
        'Availability window nope not found',
      );
      expect(prisma.teacherAvailability.delete).not.toHaveBeenCalled();
    });
  });

  describe('getMySubjects', () => {
    it('returns the teacher subjects with details, ordered by name', async () => {
      const rows = [{ teacherId: 't-1' }];
      prisma.teacherSubject.findMany.mockResolvedValue(rows);

      await expect(service.getMySubjects('t-1')).resolves.toEqual(rows);
      expect(prisma.teacherSubject.findMany).toHaveBeenCalledWith({
        where: { teacherId: 't-1' },
        include: { subject: true },
        orderBy: { subject: { name: 'asc' } },
      });
    });
  });

  describe('setMySubjects', () => {
    it('replaces the set transactionally and returns the new list', async () => {
      prisma.subject.findMany.mockResolvedValue([{ id: 's-1' }, { id: 's-2' }]);
      const rows = [{ teacherId: 't-1' }];
      mockTx.teacherSubject.findMany.mockResolvedValue(rows);

      await expect(
        service.setMySubjects('t-1', ['s-1', 's-2']),
      ).resolves.toEqual(rows);
      expect(prisma.subject.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['s-1', 's-2'] } },
        select: { id: true },
      });
      expect(mockTx.teacherSubject.deleteMany).toHaveBeenCalledWith({
        where: { teacherId: 't-1' },
      });
      expect(mockTx.teacherSubject.createMany).toHaveBeenCalledWith({
        data: [
          { teacherId: 't-1', subjectId: 's-1' },
          { teacherId: 't-1', subjectId: 's-2' },
        ],
      });
    });

    it('clears all without touching the subject table', async () => {
      mockTx.teacherSubject.findMany.mockResolvedValue([]);

      await expect(service.setMySubjects('t-1', [])).resolves.toEqual([]);
      expect(prisma.subject.findMany).not.toHaveBeenCalled();
      expect(mockTx.teacherSubject.deleteMany).toHaveBeenCalledWith({
        where: { teacherId: 't-1' },
      });
      expect(mockTx.teacherSubject.createMany).not.toHaveBeenCalled();
    });

    it('rejects unknown subject IDs without writing anything', async () => {
      prisma.subject.findMany.mockResolvedValue([{ id: 's-1' }]);

      await expect(
        service.setMySubjects('t-1', ['s-1', 'nope']),
      ).rejects.toThrow('Unknown subject IDs: nope');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
