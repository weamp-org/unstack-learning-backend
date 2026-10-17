import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service.js';
import { SubjectsService } from './subjects.service.js';

const mockPrismaService = {
  subject: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('SubjectsService', () => {
  let service: SubjectsService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubjectsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<SubjectsService>(SubjectsService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('derives the slug from the name', async () => {
      const created = {
        id: '1',
        name: 'Mathematics',
        slug: 'mathematics',
        description: null,
        isActive: true,
      };
      prisma.subject.create.mockResolvedValue(created);

      await expect(service.create({ name: 'Mathematics' })).resolves.toEqual(
        created,
      );
      expect(prisma.subject.create).toHaveBeenCalledWith({
        data: { name: 'Mathematics', slug: 'mathematics' },
      });
    });

    it('normalizes names into URL-safe slugs', async () => {
      prisma.subject.create.mockResolvedValue({});
      await service.create({ name: '  Computer Science & IT!  ' });
      expect(prisma.subject.create).toHaveBeenCalledWith({
        data: {
          name: '  Computer Science & IT!  ',
          slug: 'computer-science-it',
        },
      });
    });

    it('rejects names with no slugable characters', async () => {
      await expect(service.create({ name: '!!!' })).rejects.toThrow(
        'Subject name must contain at least one letter or number',
      );
      expect(prisma.subject.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('returns active subjects ordered by name', async () => {
      const subjects = [{ id: '1', name: 'Mathematics' }];
      prisma.subject.findMany.mockResolvedValue(subjects);

      await expect(service.findAll()).resolves.toEqual(subjects);
      expect(prisma.subject.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('findOne', () => {
    it('returns the subject when found', async () => {
      const subject = { id: '1', name: 'Mathematics' };
      prisma.subject.findUnique.mockResolvedValue(subject);

      await expect(service.findOne('1')).resolves.toEqual(subject);
    });

    it('throws 404 when missing', async () => {
      prisma.subject.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(
        'Subject missing not found',
      );
    });
  });

  describe('update', () => {
    it('passes data through without touching the slug', async () => {
      const updated = { id: '1', name: 'Maths', slug: 'mathematics' };
      prisma.subject.update.mockResolvedValue(updated);

      await expect(
        service.update('1', { name: 'Maths', isActive: false }),
      ).resolves.toEqual(updated);
      expect(prisma.subject.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { name: 'Maths', isActive: false },
      });
    });
  });

  describe('remove', () => {
    it('checks existence before deleting', async () => {
      const subject = { id: '1', name: 'Mathematics' };
      prisma.subject.findUnique.mockResolvedValue(subject);
      prisma.subject.delete.mockResolvedValue(subject);

      await expect(service.remove('1')).resolves.toEqual(subject);
      expect(prisma.subject.delete).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });

    it('throws 404 when missing instead of deleting', async () => {
      prisma.subject.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(
        'Subject missing not found',
      );
      expect(prisma.subject.delete).not.toHaveBeenCalled();
    });
  });
});
