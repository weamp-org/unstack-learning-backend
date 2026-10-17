import { Test, TestingModule } from '@nestjs/testing';

import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../generated/prisma/enums.js';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      update: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              update: jest.fn(),
              findUnique: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get(UsersService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findMe', () => {
    it('returns the user record when found', async () => {
      const user = {
        id: 'clerk_123',
        email: 'john@example.com',
        name: 'John Doe',
        role: UserRole.STUDENT,
      };
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(service.findMe('clerk_123')).resolves.toEqual(user);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'clerk_123' },
      });
    });

    it('throws 404 when missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findMe('missing')).rejects.toThrow(
        'User missing not found',
      );
    });
  });

  describe('updateRole', () => {
    it('calls prisma.user.update with id and role', async () => {
      const updated = {
        id: 'clerk_123',
        email: 'john@example.com',
        name: 'John Doe',
        role: UserRole.TEACHER,
      };
      prisma.user.update.mockResolvedValue(updated);

      const result = await service.updateRole('clerk_123', UserRole.TEACHER);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'clerk_123' },
        data: { role: UserRole.TEACHER },
      });
      expect(result).toEqual(updated);
    });
  });
});
