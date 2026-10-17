import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { UserRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateHelpRequestDto } from './dtos/create-help-request.dto.js';

const REQUEST_INCLUDE = {
  subject: true,
  links: true,
} as const;

const QUEUE_INCLUDE = {
  subject: true,
  links: true,
  learner: { select: { id: true, name: true } },
} as const;

@Injectable()
export class HelpRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(clerkId: string, dto: CreateHelpRequestDto) {
    const subject = await this.prisma.subject.findUnique({
      where: { id: dto.subjectId },
    });
    if (!subject || !subject.isActive) {
      throw new BadRequestException(
        'Subject is not available for help requests',
      );
    }

    const details = dto.details?.trim() ? dto.details.trim() : undefined;
    const links = dto.links ?? [];
    // A request with no context teaches the queue nothing.
    if (!details && links.length === 0) {
      throw new BadRequestException('Provide details or at least one link');
    }

    return this.prisma.helpRequest.create({
      data: {
        learnerId: clerkId,
        subjectId: dto.subjectId,
        topic: dto.topic,
        details,
        links: { create: links },
      },
      include: REQUEST_INCLUDE,
    });
  }

  findMine(clerkId: string) {
    return this.prisma.helpRequest.findMany({
      where: { learnerId: clerkId },
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneFor(clerkId: string, id: string) {
    const request = await this.prisma.helpRequest.findUnique({
      where: { id },
      include: QUEUE_INCLUDE,
    });
    if (!request) throw new NotFoundException(`Request ${id} not found`);
    if (request.learnerId === clerkId) return request;

    const user = await this.prisma.user.findUnique({
      where: { id: clerkId },
      select: { role: true },
    });
    if (user?.role === UserRole.ADMIN) return request;

    const teaches = await this.prisma.teacherSubject.findFirst({
      where: { teacherId: clerkId, subjectId: request.subjectId },
    });
    // 404 rather than 403: learners must not be able to probe whether
    // another learner's request exists.
    if (!teaches) throw new NotFoundException(`Request ${id} not found`);
    return request;
  }

  async findQueue(clerkId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: clerkId },
      select: { role: true },
    });
    // Oldest first: longest-waiting learners get reviewed first.
    // All requests are open by construction (no status yet).
    return this.prisma.helpRequest.findMany({
      where:
        user?.role === UserRole.ADMIN
          ? {}
          : { subject: { teachers: { some: { teacherId: clerkId } } } },
      include: QUEUE_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }
}
