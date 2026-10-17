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
