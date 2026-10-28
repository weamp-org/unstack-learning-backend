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
  MediaKind,
  UserRole,
} from '../generated/prisma/enums.js';
import { MediaService } from '../media/media.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AcceptHelpRequestDto } from './dtos/accept-help-request.dto.js';
import { CreateHelpRequestDto } from './dtos/create-help-request.dto.js';
import { UpdateHelpRequestDto } from './dtos/update-help-request.dto.js';
import { UpdateHelpSessionDto } from './dtos/update-help-session.dto.js';
import { UpsertFeedbackDto } from './dtos/upsert-feedback.dto.js';

const MEDIA_SELECT = {
  select: {
    id: true,
    kind: true,
    contentType: true,
    byteSize: true,
    durationSeconds: true,
    objectKey: true,
  },
} as const;

const MEDIA_SUMMARY_SELECT = {
  select: { id: true, kind: true },
} as const;

const REQUEST_INCLUDE = {
  subject: true,
  links: true,
  media: MEDIA_SELECT,
  teacher: { select: { id: true, name: true } },
  session: true,
  feedback: true,
} as const;

const QUEUE_INCLUDE = {
  // The teacher count decides `hasTeacher` below. Teachers only ever see
  // subjects they teach, so the flag matters to admins triaging requests
  // that no one has claimed a subject for.
  subject: {
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { teachers: true } },
    },
  },
  links: true,
  // Queue cards only need counts, never bytes or signed URLs.
  media: MEDIA_SUMMARY_SELECT,
  learner: { select: { id: true, name: true } },
} as const;

const DETAIL_INCLUDE = {
  subject: true,
  links: true,
  media: MEDIA_SELECT,
  learner: { select: { id: true, name: true } },
  teacher: { select: { id: true, name: true } },
  session: true,
  feedback: true,
} as const;

@Injectable()
export class HelpRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly mediaService: MediaService,
  ) {}

  /// Media rows carry the object key; the API exposes short-lived URLs
  /// instead, regenerated on every read.
  private async withSignedMedia<
    T extends {
      media: {
        id: string;
        kind: MediaKind;
        contentType: string;
        byteSize: number;
        durationSeconds: number | null;
        objectKey: string;
      }[];
    },
  >(request: T) {
    const { media, ...rest } = request;
    return { ...rest, media: await this.mediaService.sign(media) };
  }

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
    const mediaIds = dto.mediaIds ?? [];

    // Context can be words, links, images, or a voice note. Audio always needs
    // a written summary so the request stays scannable and accessible.
    const media =
      mediaIds.length > 0
        ? await this.mediaService.assertAttachable(clerkId, mediaIds)
        : [];
    if (
      media.some((item) => item.kind === MediaKind.AUDIO) &&
      details === undefined
    ) {
      throw new BadRequestException(
        'Add a short written summary with your voice note.',
      );
    }
    if (details === undefined && links.length === 0 && media.length === 0) {
      throw new BadRequestException(
        'Add at least one of: a description, a link, an image, or a voice note.',
      );
    }

    // Copy before the insert so the transaction holds no network calls; the
    // destination key depends on the media id, not the request id.
    const moved =
      media.length > 0 ? await this.mediaService.copyIntoRequests(media) : [];

    let requestId: string;
    try {
      requestId = await this.prisma.$transaction(async (tx) => {
        const created = await tx.helpRequest.create({
          data: {
            learnerId: clerkId,
            subjectId: dto.subjectId,
            topic: dto.topic,
            details,
            links: { create: links },
          },
        });
        for (const item of moved) {
          await tx.mediaUpload.update({
            where: { id: item.id },
            data: { requestId: created.id, objectKey: item.toKey },
          });
        }
        return created.id;
      });
    } catch (error) {
      // Never leave orphaned copies behind if the row write fails.
      await this.mediaService.rollbackCopies(moved);
      throw error;
    }
    await this.mediaService.dropStagedCopies(moved);

    const request = await this.prisma.helpRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: REQUEST_INCLUDE,
    });

    // Best-effort: the request exists either way, so a fan-out failure must
    // not turn creation into a 500.
    try {
      await this.notificationsService.notifyRequestCreated(
        request.id,
        dto.subjectId,
        clerkId,
      );
    } catch {
      // Notification fan-out is retried via escalation; ignore here.
    }
    return this.withSignedMedia(request);
  }

  async findMine(clerkId: string) {
    const requests = await this.prisma.helpRequest.findMany({
      where: { learnerId: clerkId },
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      requests.map((request) => this.withSignedMedia(request)),
    );
  }

  async findOneFor(clerkId: string, id: string) {
    const request = await this.prisma.helpRequest.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    if (!request) throw new NotFoundException(`Request ${id} not found`);
    if (request.learnerId === clerkId) return this.withSignedMedia(request);
    if (request.teacherId === clerkId) return this.withSignedMedia(request);

    const user = await this.prisma.user.findUnique({
      where: { id: clerkId },
      select: { role: true },
    });
    if (user?.role === UserRole.ADMIN) return this.withSignedMedia(request);

    const teaches = await this.prisma.teacherSubject.findFirst({
      where: { teacherId: clerkId, subjectId: request.subjectId },
    });
    // 404 rather than 403: learners must not be able to probe whether
    // another learner's request exists.
    if (!teaches) throw new NotFoundException(`Request ${id} not found`);
    return this.withSignedMedia(request);
  }

  async findQueue(clerkId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: clerkId },
      select: { role: true },
    });
    // Oldest first: longest-waiting learners get reviewed first. Only OPEN
    // requests, minus rows the viewer already declined.
    const queue = await this.prisma.helpRequest.findMany({
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
    // Opportunistic fallback for the availability filter: any stale OPEN
    // request re-notifies the teachers suppression skipped. Runs off the
    // read until a real cron exists; failures must not break the queue.
    try {
      await this.notificationsService.escalateStaleRequests();
    } catch {
      // Escalation retries on the next queue read; ignore here.
    }
    // `hasTeacher` answers "can anyone act on this?" — a request in a subject
    // with no teachers is visible to admins only, and is the one most likely
    // to go unanswered. The raw count stays server-side.
    return queue.map(({ subject: { _count, ...subject }, ...request }) => ({
      ...request,
      subject,
      hasTeacher: _count.teachers > 0,
    }));
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
      if (scheduledAt.getTime() <= Date.now()) {
        throw new BadRequestException('scheduledAt must be in the future');
      }
    }

    // First accepter wins: the status check and writes share a transaction,
    // so a simultaneous second accept sees ACCEPTED and gets a 409.
    const accepted = await this.prisma.$transaction(async (tx) => {
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
    // Best-effort like creation: the accept stands even if the inbox row
    // fails; the learner still sees ACCEPTED on their request page.
    try {
      if (accepted?.learnerId !== undefined) {
        await this.notificationsService.notifyRequestAccepted(
          id,
          accepted.learnerId,
          clerkId,
        );
      }
    } catch {
      // The learner sees the accepted state on refresh; ignore here.
    }
    return accepted ? this.withSignedMedia(accepted) : accepted;
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
    const updated = await this.prisma.helpRequest.update({
      where: { id },
      data: { status: HelpRequestStatus.CLOSED },
      include: DETAIL_INCLUDE,
    });
    return this.withSignedMedia(updated);
  }

  async updateRequest(clerkId: string, id: string, dto: UpdateHelpRequestDto) {
    const request = await this.prisma.helpRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException(`Request ${id} not found`);
    // Owner-only: admins cannot rewrite a learner's words. 404 to hide
    // existence from everyone else.
    if (request.learnerId !== clerkId) {
      throw new NotFoundException(`Request ${id} not found`);
    }
    if (request.status !== HelpRequestStatus.OPEN) {
      throw new ConflictException('Only open requests can be edited');
    }
    if (
      dto.topic === undefined &&
      dto.details === undefined &&
      dto.links === undefined
    ) {
      throw new BadRequestException('Nothing to update');
    }

    let details: string | undefined;
    if (dto.details !== undefined) {
      details = dto.details.trim();
      if (!details) {
        throw new BadRequestException(
          "Tell us a bit more about what you're stuck on.",
        );
      }
    }

    // Links replace the whole set so the learner's edit is the source of
    // truth; subject stays frozen to keep teacher routing stable.
    if (dto.links !== undefined) {
      await this.prisma.$transaction(async (tx) => {
        await tx.helpLink.deleteMany({ where: { requestId: id } });
        if (dto.links!.length > 0) {
          await tx.helpLink.createMany({
            data: dto.links!.map((link) => ({
              requestId: id,
              url: link.url,
            })),
          });
        }
        await tx.helpRequest.update({
          where: { id },
          data: {
            ...(dto.topic !== undefined ? { topic: dto.topic } : {}),
            ...(details !== undefined ? { details } : {}),
          },
        });
      });
    } else {
      await this.prisma.helpRequest.update({
        where: { id },
        data: {
          ...(dto.topic !== undefined ? { topic: dto.topic } : {}),
          ...(details !== undefined ? { details } : {}),
        },
      });
    }

    const updated = await this.prisma.helpRequest.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    if (!updated) throw new NotFoundException(`Request ${id} not found`);
    return this.withSignedMedia(updated);
  }

  async upsertFeedback(clerkId: string, id: string, dto: UpsertFeedbackDto) {
    const request = await this.prisma.helpRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException(`Request ${id} not found`);
    if (request.learnerId !== clerkId) {
      throw new NotFoundException(`Request ${id} not found`);
    }
    if (request.status === HelpRequestStatus.OPEN) {
      throw new BadRequestException(
        'You can share feedback after a teacher accepts your request.',
      );
    }

    const comment = dto.comment?.trim() ? dto.comment.trim() : null;
    const saved = await this.prisma.helpFeedback.upsert({
      where: { requestId: id },
      update: { rating: dto.rating, comment },
      create: { requestId: id, rating: dto.rating, comment },
    });
    // Best-effort: feedback stands even if the teacher ping fails.
    try {
      if (request.teacherId) {
        await this.notificationsService.notifyFeedbackCreated(
          id,
          request.teacherId,
          clerkId,
        );
      }
    } catch {
      // The teacher sees feedback on the request page; ignore here.
    }
    return saved;
  }

  async getFeedback(clerkId: string, isAdmin: boolean, id: string) {
    const request = await this.findOneFor(clerkId, id);
    const canSee =
      isAdmin || request.learnerId === clerkId || request.teacherId === clerkId;
    if (!canSee) throw new NotFoundException(`Request ${id} not found`);
    const feedback = await this.prisma.helpFeedback.findUnique({
      where: { requestId: id },
    });
    if (!feedback) throw new NotFoundException(`Request ${id} has no feedback`);
    return feedback;
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
      if (scheduledAt.getTime() <= Date.now()) {
        throw new BadRequestException('scheduledAt must be in the future');
      }
    }

    await this.prisma.helpSession.update({
      where: { requestId: id },
      data: { sessionUrl: dto.sessionUrl, scheduledAt },
    });
    const updated = await this.prisma.helpRequest.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    // Best-effort: the session stands even if the inbox row fails.
    try {
      if (updated?.learnerId !== undefined) {
        await this.notificationsService.notifySessionUpdated(
          id,
          updated.learnerId,
          clerkId,
        );
      }
    } catch {
      // The learner sees the latest session on refresh; ignore here.
    }
    return updated ? this.withSignedMedia(updated) : updated;
  }
}
