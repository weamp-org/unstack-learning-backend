import { Test, TestingModule } from '@nestjs/testing';

import {
  AdminStatsService,
  median,
  percentile,
} from './admin-stats.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const mockPrismaService = {
  helpRequest: {
    count: jest.fn(),
    findFirst: jest.fn(),
    groupBy: jest.fn(),
  },
  helpSession: {
    count: jest.fn(),
  },
  helpRequestDecision: {
    findMany: jest.fn(),
    groupBy: jest.fn(),
  },
  subject: {
    findMany: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
  },
};

describe('median/percentile helpers', () => {
  it('returns null for empty samples', () => {
    expect(median([])).toBeNull();
    expect(percentile([], 90)).toBeNull();
  });

  it('computes median for odd and even samples', () => {
    expect(median([30])).toBe(30);
    expect(median([10, 30, 20])).toBe(20);
    expect(median([10, 20, 30, 40])).toBe(25);
  });

  it('computes nearest-rank p90', () => {
    expect(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 90)).toBe(90);
  });
});

describe('AdminStatsService', () => {
  let service: AdminStatsService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminStatsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AdminStatsService>(AdminStatsService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('aggregates empty-database stats with null timings', async () => {
    prisma.helpRequest.count.mockResolvedValue(0);
    prisma.helpSession.count.mockResolvedValue(0);
    prisma.helpRequest.findFirst.mockResolvedValue(null);
    prisma.helpRequest.groupBy.mockResolvedValue([]);
    prisma.helpRequestDecision.findMany.mockResolvedValue([]);
    prisma.helpRequestDecision.groupBy.mockResolvedValue([]);
    prisma.subject.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);

    const now = new Date('2026-10-18T12:00:00.000Z');
    await expect(service.getStats(now)).resolves.toEqual({
      overview: {
        total: 0,
        open: 0,
        accepted: 0,
        closed: 0,
        learnersHelped: 0,
        sessionsArranged: 0,
        oldestOpenWaitMinutes: null,
      },
      responsiveness: {
        medianSecondsToAccept: null,
        p90SecondsToAccept: null,
        pctAcceptedUnder1h: null,
        staleOver45m: 0,
        unansweredOver24h: 0,
      },
      bySubject: [],
      byTeacher: [],
    });
  });

  it('computes waits, subject and teacher breakdowns', async () => {
    const now = new Date('2026-10-18T12:00:00.000Z');
    prisma.helpRequest.count
      .mockResolvedValueOnce(3) // total
      .mockResolvedValueOnce(1) // open
      .mockResolvedValueOnce(2) // accepted
      .mockResolvedValueOnce(0) // closed
      .mockResolvedValueOnce(1) // stale
      .mockResolvedValueOnce(0); // unanswered
    prisma.helpSession.count.mockResolvedValue(2);
    prisma.helpRequest.findFirst.mockResolvedValue({
      createdAt: new Date('2026-10-18T11:30:00.000Z'),
    });
    prisma.helpRequest.groupBy
      .mockResolvedValueOnce([{ learnerId: 'l-1' }, { learnerId: 'l-2' }])
      .mockResolvedValueOnce([{ subjectId: 's-1', _count: { _all: 3 } }])
      .mockResolvedValueOnce([{ subjectId: 's-1', _count: { _all: 2 } }]);
    prisma.helpRequestDecision.findMany.mockResolvedValue([
      {
        teacherId: 't-1',
        createdAt: new Date('2026-10-18T10:30:00.000Z'),
        request: { createdAt: new Date('2026-10-18T10:00:00.000Z') },
      },
      {
        teacherId: 't-1',
        createdAt: new Date('2026-10-18T11:10:00.000Z'),
        request: { createdAt: new Date('2026-10-18T11:00:00.000Z') },
      },
    ]);
    prisma.helpRequestDecision.groupBy.mockResolvedValue([
      { teacherId: 't-1', _count: { _all: 1 } },
    ]);
    prisma.subject.findMany.mockResolvedValue([{ id: 's-1', name: 'Maths' }]);
    prisma.user.findMany.mockResolvedValue([{ id: 't-1', name: 'Ama' }]);

    const stats = await service.getStats(now);

    expect(stats.overview).toEqual({
      total: 3,
      open: 1,
      accepted: 2,
      closed: 0,
      learnersHelped: 2,
      sessionsArranged: 2,
      oldestOpenWaitMinutes: 30,
    });
    expect(stats.responsiveness.medianSecondsToAccept).toBe(1200);
    expect(stats.responsiveness.p90SecondsToAccept).toBe(1800);
    expect(stats.responsiveness.pctAcceptedUnder1h).toBe(1);
    expect(stats.bySubject).toEqual([
      { subjectId: 's-1', subjectName: 'Maths', total: 3, accepted: 2 },
    ]);
    expect(stats.byTeacher).toEqual([
      {
        teacherId: 't-1',
        teacherName: 'Ama',
        accepts: 2,
        declines: 1,
        medianSecondsToAccept: 1200,
      },
    ]);
  });
});
