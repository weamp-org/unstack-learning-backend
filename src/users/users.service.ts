import { Injectable, NotFoundException } from '@nestjs/common';

import { UserRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ListUsersDto } from './dtos/list-users.dto.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async updateRole(id: string, role: UserRole) {
    // A missing user raises P2025, translated to 404 by GlobalExceptionFilter.
    return this.prisma.user.update({
      where: { id },
      data: { role },
    });
  }

  async findMe(clerkId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: clerkId } });
    if (!user) throw new NotFoundException(`User ${clerkId} not found`);
    return user;
  }

  async findAll(query: ListUsersDto) {
    const { q, role } = query;
    // Founder-stage roster: newest first, capped at 50, no pagination yet.
    return this.prisma.user.findMany({
      where: {
        ...(role ? { role } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
