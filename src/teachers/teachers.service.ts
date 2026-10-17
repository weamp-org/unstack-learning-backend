import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

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
