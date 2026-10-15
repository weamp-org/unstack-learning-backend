import { Test, TestingModule } from '@nestjs/testing';

import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../generated/prisma/enums.js';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      update: jest.Mock;
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
