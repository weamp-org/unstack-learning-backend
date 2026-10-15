import { Injectable } from '@nestjs/common';

import { UserRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

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
}
