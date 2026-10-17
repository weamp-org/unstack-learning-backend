import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  HelpDecision,
  HelpRequestStatus,
  UserRole,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AcceptHelpRequestDto } from './dtos/accept-help-request.dto.js';
import { CreateHelpRequestDto } from './dtos/create-help-request.dto.js';
import { UpdateHelpSessionDto } from './dtos/update-help-session.dto.js';

const REQUEST_INCLUDE = {
  subject: true,
  links: true,
} as const;

const QUEUE_INCLUDE = {
  subject: true,
  links: true,
  learner: { select: { id: true, name: true } },
} as const;

const DETAIL_INCLUDE = {
  subject: true,
  links: true,
  learner: { select: { id: true, name: true } },
  teacher: { select: { id: true, name: true } },
  session: true,
} as const;

@Injectable()
export class HelpRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async isAdmin(clerkId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: clerkId },
      select: { role: true },
    });
    return user?.role === UserRole.ADMIN;
  }

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
      include: DETAIL_INCLUDE,
    });
    if (!request) throw new NotFoundException(`Request ${id} not found`);
    if (request.learnerId === clerkId) return request;
    if (request.teacherId === clerkId) return request;

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
    // Oldest first: longest-waiting learners get reviewed first. Only OPEN
    // requests, minus rows the viewer already declined.
    return this.prisma.helpRequest.findMany({
      where: {
        status: HelpRequestStatus.OPEN,
        ...(user?.role === UserRole.ADMIN
          ? {}
          : {
              subject: { teachers: { some: { teacherId: clerkId } } },
              NOT: { decisions: { some: { teacherId: clerkId } } },
            }),
      },
      include: QUEUE_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  private async requireEligibleTeacher(
    teaches: Promise<unknown>,
    action: string,
  ) {
    if (!(await teaches)) {
      throw new ForbiddenException(
        `Only teachers of this subject can ${action} this request`,
      );
    }
  }

  async acceptRequest(
    clerkId: string,
    isAdmin: boolean,
    id: string,
    dto: AcceptHelpRequestDto,
  ) {
    let scheduledAt: Date | undefined;
    if (dto.scheduledAt !== undefined) {
      scheduledAt = new Date(dto.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) {
        throw new BadRequestException('scheduledAt must be a valid datetime');
      }
    }

    // First accepter wins: the status check and writes share a transaction,
    // so a simultaneous second accept sees ACCEPTED and gets a 409.
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.helpRequest.findUnique({ where: { id } });
      if (!request) throw new NotFoundException(`Request ${id} not found`);
      if (request.status !== HelpRequestStatus.OPEN) {
        throw new ConflictException('Request is no longer open');
      }
      if (!isAdmin) {
        await this.requireEligibleTeacher(
          tx.teacherSubject.findFirst({
            where: { teacherId: clerkId, subjectId: request.subjectId },
          }),
          'accept',
        );
      }

      await tx.helpRequest.update({
        where: { id },
        data: { status: HelpRequestStatus.ACCEPTED, teacherId: clerkId },
      });
      await tx.helpRequestDecision.upsert({
        where: { requestId_teacherId: { requestId: id, teacherId: clerkId } },
        update: { decision: HelpDecision.ACCEPTED },
        create: {
          requestId: id,
          teacherId: clerkId,
          decision: HelpDecision.ACCEPTED,
        },
      });
      await tx.helpSession.create({
        data: {
          requestId: id,
          sessionUrl: dto.sessionUrl,
          scheduledAt,
          source: 'MANUAL',
        },
      });
      return tx.helpRequest.findUnique({
        where: { id },
        include: DETAIL_INCLUDE,
      });
    });
  }

  async declineRequest(clerkId: string, isAdmin: boolean, id: string) {
    const request = await this.prisma.helpRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException(`Request ${id} not found`);
    if (request.status !== HelpRequestStatus.OPEN) {
      throw new ConflictException('Request is no longer open');
    }
    if (!isAdmin) {
      await this.requireEligibleTeacher(
        this.prisma.teacherSubject.findFirst({
          where: { teacherId: clerkId, subjectId: request.subjectId },
        }),
        'decline',
      );
    }

    // The request stays OPEN for the other subject teachers; it only leaves
    // this viewer's queue. Repeat declines are idempotent.
    await this.prisma.helpRequestDecision.upsert({
      where: { requestId_teacherId: { requestId: id, teacherId: clerkId } },
      update: { decision: HelpDecision.DECLINED },
      create: {
        requestId: id,
        teacherId: clerkId,
        decision: HelpDecision.DECLINED,
      },
    });
    return { id, declined: true };
  }

  async closeRequest(clerkId: string, isAdmin: boolean, id: string) {
    const request = await this.findOneFor(clerkId, id);
    const canClose =
      isAdmin || request.learnerId === clerkId || request.teacherId === clerkId;
    // Same existence-hiding rule as reads: unauthorized closers get a 404.
    if (!canClose) throw new NotFoundException(`Request ${id} not found`);
    if (request.status === HelpRequestStatus.CLOSED) return request;
    return this.prisma.helpRequest.update({
      where: { id },
      data: { status: HelpRequestStatus.CLOSED },
      include: DETAIL_INCLUDE,
    });
  }

  async updateSession(
    clerkId: string,
    isAdmin: boolean,
    id: string,
    dto: UpdateHelpSessionDto,
  ) {
    const request = await this.findOneFor(clerkId, id);
    // Only the accepting teacher (or an admin) may touch the session.
    if (!isAdmin && request.teacherId !== clerkId) {
      throw new NotFoundException(`Request ${id} not found`);
    }
    if (!request.session) {
      throw new NotFoundException(`Request ${id} has no session yet`);
    }

    let scheduledAt: Date | undefined;
    if (dto.scheduledAt !== undefined) {
      scheduledAt = new Date(dto.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) {
        throw new BadRequestException('scheduledAt must be a valid datetime');
      }
    }

    await this.prisma.helpSession.update({
      where: { requestId: id },
      data: { sessionUrl: dto.sessionUrl, scheduledAt },
    });
    return this.prisma.helpRequest.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
  }
}
