import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { CreateAvailabilityDto } from './dtos/create-availability.dto.js';

@Injectable()
export class TeachersService {
  constructor(private readonly prisma: PrismaService) {}

  getMySubjects(clerkId: string) {
    return this.prisma.teacherSubject.findMany({
      where: { teacherId: clerkId },
      include: { subject: true },
      orderBy: { subject: { name: 'asc' } },
    });
  }

  getMyAvailability(clerkId: string) {
    return this.prisma.teacherAvailability.findMany({
      where: { teacherId: clerkId },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    });
  }

  async addMyAvailability(clerkId: string, dto: CreateAvailabilityDto) {
    const { weekday, startTime, endTime } = dto;
    const timezone = dto.timezone ?? 'Africa/Accra';

    // Zero-padded HH:MM compares lexicographically, so no parsing needed.
    if (endTime <= startTime) {
      throw new BadRequestException(
        'End time must be after start time (overnight windows are not supported)',
      );
    }
    try {
      new Intl.DateTimeFormat('en', { timeZone: timezone });
    } catch {
      throw new BadRequestException(`Unknown timezone: ${timezone}`);
    }

    const existing = await this.prisma.teacherAvailability.findMany({
      where: { teacherId: clerkId, weekday },
    });
    const clash = existing.find(
      (window) => window.startTime < endTime && startTime < window.endTime,
    );
    if (clash) {
      throw new ConflictException(
        `Overlaps with existing window ${clash.startTime}–${clash.endTime}`,
      );
    }

    return this.prisma.teacherAvailability.create({
      data: { teacherId: clerkId, weekday, startTime, endTime, timezone },
    });
  }

  async removeMyAvailability(clerkId: string, id: string) {
    // Scoped lookup: other teachers' windows read as missing rather than
    // leaking their existence.
    const window = await this.prisma.teacherAvailability.findFirst({
      where: { id, teacherId: clerkId },
    });
    if (!window) {
      throw new NotFoundException(`Availability window ${id} not found`);
    }
    return this.prisma.teacherAvailability.delete({ where: { id } });
  }

  async setMySubjects(clerkId: string, subjectIds: string[]) {
    // Every ID must reference a real subject: without this check a bogus
    // ID would surface as a raw FK violation instead of a named 400.
    if (subjectIds.length > 0) {
      const found = await this.prisma.subject.findMany({
        where: { id: { in: subjectIds } },
        select: { id: true },
      });
      const known = new Set(found.map((subject) => subject.id));
      const unknown = subjectIds.filter((id) => !known.has(id));
      if (unknown.length > 0) {
        throw new BadRequestException(
          `Unknown subject IDs: ${unknown.join(', ')}`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.teacherSubject.deleteMany({ where: { teacherId: clerkId } });
      if (subjectIds.length > 0) {
        await tx.teacherSubject.createMany({
          data: subjectIds.map((subjectId) => ({
            teacherId: clerkId,
            subjectId,
          })),
        });
      }
      return tx.teacherSubject.findMany({
        where: { teacherId: clerkId },
        include: { subject: true },
        orderBy: { subject: { name: 'asc' } },
      });
    });
  }
}
