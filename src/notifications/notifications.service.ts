import { Injectable, NotFoundException } from '@nestjs/common';

import {
  HelpRequestStatus,
  NotificationType,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushPayload, PushService } from '../push/push.service.js';
import { isAvailableNow, overrideCutoff } from './availability.js';

/// A stale OPEN request re-notifies the teachers who were suppressed by the
/// availability filter. Replaced by a real cron once scheduling exists; until
/// then it runs opportunistically off the teacher queue read.
export const ESCALATION_THRESHOLD_MINUTES = 45;

/// Archived rows are a safety net, not a record: purge them on read once they
/// stop being useful (same opportunistic pattern as expired availability
/// overrides). No cron needed yet.
export const ARCHIVE_RETENTION_DAYS = 30;

const MINE_INCLUDE = {
  request: {
    select: {
      id: true,
      topic: true,
      status: true,
      subject: { select: { id: true, name: true } },
    },
  },
  actor: { select: { id: true, name: true } },
} as const;

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
  ) {}

  /// Best-effort push: the inbox row is the durable signal, so a push
  /// failure (including unconfigured VAPID) must never break the caller.
  private async pushToUsers(
    userIds: string[],
    payload: PushPayload,
  ): Promise<void> {
    if (userIds.length === 0) return;
    await Promise.all(
      userIds.map(async (userId) => {
        try {
          await this.pushService.sendToUser(userId, payload);
        } catch {
          // Push is enhancement; the inbox row already exists.
        }
      }),
    );
  }

  /// Inbox reads always exclude archived rows; the archive view is the only
  /// caller that asks for them. Purge rides on the read so no cron is needed.
  async listMine(
    recipientId: string,
    options: { archived?: boolean; unreadOnly?: boolean } = {},
  ) {
    const { archived = false, unreadOnly = false } = options;
    await this.purgeArchived(recipientId);
    return this.prisma.notification.findMany({
      where: {
        recipientId,
        archivedAt: archived ? { not: null } : null,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      include: MINE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  unreadCount(recipientId: string) {
    return this.prisma.notification.count({
      where: { recipientId, readAt: null, archivedAt: null },
    });
  }

  /// Scoped lookup: other recipients' rows read as missing rather than
  /// leaking their existence.
  private async scoped(recipientId: string, id: string) {
    const row = await this.prisma.notification.findFirst({
      where: { id, recipientId },
    });
    if (!row) throw new NotFoundException(`Notification ${id} not found`);
    return row;
  }

  async markRead(recipientId: string, id: string) {
    const row = await this.scoped(recipientId, id);
    if (row.readAt !== null) return row;
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  markAllRead(recipientId: string) {
    return this.prisma.notification.updateMany({
      where: { recipientId, readAt: null, archivedAt: null },
      data: { readAt: new Date() },
    });
  }

  /// Soft delete: archived rows leave the inbox but keep the
  /// `[recipientId, requestId, type]` key, so a repeat event (a second session
  /// update, an escalated request) cannot resurrect what was put away.
  /// Idempotent: re-archiving returns the row unchanged.
  async archive(recipientId: string, id: string) {
    const row = await this.scoped(recipientId, id);
    if (row.archivedAt !== null) return row;
    return this.prisma.notification.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }

  async restore(recipientId: string, id: string) {
    const row = await this.scoped(recipientId, id);
    if (row.archivedAt === null) return row;
    return this.prisma.notification.update({
      where: { id },
      data: { archivedAt: null },
    });
  }

  /// The inbox's "archive read" / "archive all". Read rows are the common
  /// case, matching the old clear-read default; `readOnly: false` puts
  /// everything away.
  archiveMine(recipientId: string, readOnly = true) {
    return this.prisma.notification.updateMany({
      where: {
        recipientId,
        archivedAt: null,
        ...(readOnly ? { readAt: { not: null } } : {}),
      },
      data: { archivedAt: new Date() },
    });
  }

  /// Hard delete, reachable only from the archive view.
  async deleteOne(recipientId: string, id: string) {
    await this.scoped(recipientId, id);
    await this.prisma.notification.delete({ where: { id } });
    return { id, deleted: true as const };
  }

  deleteArchived(recipientId: string) {
    return this.prisma.notification.deleteMany({
      where: { recipientId, archivedAt: { not: null } },
    });
  }

  /// Bounded to the caller's rows: cheaper than a global sweep and keeps the
  /// index useful.
  purgeArchived(recipientId: string, now: Date = new Date()) {
    const cutoff = new Date(
      now.getTime() - ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    return this.prisma.notification.deleteMany({
      where: { recipientId, archivedAt: { not: null, lt: cutoff } },
    });
  }

  /// Fans out REQUEST_CREATED to the subject's teachers + admins. Teachers
  /// with no availability windows set are always notified (they haven't
  /// opted into filtering); teachers with windows are notified only when a
  /// window covers `now`. Suppressed teachers are picked up later by
  /// escalation. Returns both sets so callers and tests can observe routing.
  async notifyRequestCreated(
    requestId: string,
    subjectId: string,
    actorId: string,
    now: Date = new Date(),
  ): Promise<{ notified: string[]; suppressed: string[] }> {
    const [teacherLinks, admins] = await Promise.all([
      this.prisma.teacherSubject.findMany({
        where: { subjectId },
        select: { teacherId: true },
      }),
      this.prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true },
      }),
    ]);
    const recipientIds = [
      ...new Set([
        ...teacherLinks.map((link) => link.teacherId),
        ...admins.map((admin) => admin.id),
      ]),
    ].filter((id) => id !== actorId);
    if (recipientIds.length === 0) return { notified: [], suppressed: [] };

    const [windows, assigned] = await Promise.all([
      this.prisma.teacherAvailability.findMany({
        where: { teacherId: { in: recipientIds } },
      }),
      // Busy = holding a request that isn't closed yet. Busy teachers sit
      // out this round entirely (neither notified nor suppressed); the
      // escalation fallback still reaches them if nobody else picks it up.
      this.prisma.helpRequest.findMany({
        where: {
          teacherId: { in: recipientIds },
          status: { not: HelpRequestStatus.CLOSED },
        },
        select: { teacherId: true },
      }),
    ]);
    const busyIds = new Set(
      assigned
        .map((request) => request.teacherId)
        .filter((id): id is string => id !== null),
    );
    const cutoff = overrideCutoff(now);
    // Expired overrides are purged on read; only today + future rows can
    // still match, so only those are loaded.
    await this.prisma.teacherAvailabilityOverride.deleteMany({
      where: { teacherId: { in: recipientIds }, date: { lt: cutoff } },
    });
    const overrides = await this.prisma.teacherAvailabilityOverride.findMany({
      where: { teacherId: { in: recipientIds }, date: { gte: cutoff } },
    });
    const byTeacher = new Map<string, typeof windows>();
    for (const window of windows) {
      const list = byTeacher.get(window.teacherId) ?? [];
      list.push(window);
      byTeacher.set(window.teacherId, list);
    }
    const overridesByTeacher = new Map<string, typeof overrides>();
    for (const override of overrides) {
      const list = overridesByTeacher.get(override.teacherId) ?? [];
      list.push(override);
      overridesByTeacher.set(override.teacherId, list);
    }

    const notified: string[] = [];
    const suppressed: string[] = [];
    for (const id of recipientIds) {
      if (busyIds.has(id)) continue;
      const teacherWindows = byTeacher.get(id) ?? [];
      const teacherOverrides = overridesByTeacher.get(id) ?? [];
      if (
        teacherWindows.length === 0 ||
        isAvailableNow(teacherWindows, teacherOverrides, now)
      ) {
        notified.push(id);
      } else {
        suppressed.push(id);
      }
    }

    if (notified.length > 0) {
      await this.prisma.notification.createMany({
        data: notified.map((recipientId) => ({
          recipientId,
          type: NotificationType.REQUEST_CREATED,
          requestId,
          actorId,
        })),
        skipDuplicates: true,
      });
      const context = await this.prisma.helpRequest.findUnique({
        where: { id: requestId },
        select: { topic: true, subject: { select: { name: true } } },
      });
      await this.pushToUsers(notified, {
        title: `New request in ${context?.subject.name ?? 'a subject'}`,
        body: context?.topic ?? 'A learner needs help.',
        url: `/requests/${requestId}`,
        // One live card per request; the double buzz marks teacher urgency.
        tag: `request-${requestId}`,
        vibrate: [150, 75, 150],
      });
    }
    return { notified, suppressed };
  }

  private async notifyLearner(
    type: 'REQUEST_ACCEPTED' | 'SESSION_UPDATED',
    requestId: string,
    learnerId: string,
    actorId: string,
  ) {
    // No self-notify: an admin accepting their own request needs no inbox row.
    if (learnerId === actorId) return null;
    const row = await this.prisma.notification.upsert({
      where: {
        recipientId_requestId_type: {
          recipientId: learnerId,
          requestId,
          type,
        },
      },
      update: {},
      create: { recipientId: learnerId, type, requestId, actorId },
    });
    const [request, actor] = await Promise.all([
      this.prisma.helpRequest.findUnique({
        where: { id: requestId },
        select: { topic: true },
      }),
      this.prisma.user.findUnique({
        where: { id: actorId },
        select: { name: true },
      }),
    ]);
    const topic = request?.topic ?? 'your request';
    if (type === NotificationType.REQUEST_ACCEPTED) {
      await this.pushToUsers([learnerId], {
        title: 'Your request was accepted',
        body: `${actor?.name ?? 'A teacher'} will help with "${topic}".`,
        url: `/requests/${requestId}`,
        tag: `request-${requestId}`,
        vibrate: [100],
      });
    } else {
      await this.pushToUsers([learnerId], {
        title: 'Session details updated',
        body: `New time or link for "${topic}".`,
        url: `/requests/${requestId}`,
        // Replaces the accept card (same tag) but re-alerts and sticks
        // around: a missed reschedule means a no-show.
        tag: `request-${requestId}`,
        vibrate: [100, 50, 100],
        renotify: true,
        requireInteraction: true,
      });
    }
    return row;
  }

  notifyRequestAccepted(requestId: string, learnerId: string, actorId: string) {
    return this.notifyLearner(
      NotificationType.REQUEST_ACCEPTED,
      requestId,
      learnerId,
      actorId,
    );
  }

  notifySessionUpdated(requestId: string, learnerId: string, actorId: string) {
    return this.notifyLearner(
      NotificationType.SESSION_UPDATED,
      requestId,
      learnerId,
      actorId,
    );
  }

  /// Pings the assigned teacher when the learner shares session feedback.
  /// One row per (teacher, request) — edits re-push but keep the same row.
  async notifyFeedbackCreated(
    requestId: string,
    teacherId: string,
    actorId: string,
  ) {
    if (teacherId === actorId) return null;
    const row = await this.prisma.notification.upsert({
      where: {
        recipientId_requestId_type: {
          recipientId: teacherId,
          requestId,
          type: NotificationType.FEEDBACK_CREATED,
        },
      },
      update: {},
      create: {
        recipientId: teacherId,
        type: NotificationType.FEEDBACK_CREATED,
        requestId,
        actorId,
      },
    });
    const [request, actor] = await Promise.all([
      this.prisma.helpRequest.findUnique({
        where: { id: requestId },
        select: { topic: true },
      }),
      this.prisma.user.findUnique({
        where: { id: actorId },
        select: { name: true },
      }),
    ]);
    await this.pushToUsers([teacherId], {
      title: 'New feedback on your session',
      body: `${actor?.name ?? 'A learner'} rated "${request?.topic ?? 'your session'}".`,
      url: `/requests/${requestId}`,
      tag: `request-${requestId}-feedback`,
      vibrate: [100],
    });
    return row;
  }

  /// Notifies every eligible teacher/admin who still lacks a REQUEST_CREATED
  /// row for each stale OPEN request, regardless of availability. One row per
  /// (recipient, request, type) keeps re-runs idempotent.
  async escalateStaleRequests(
    thresholdMinutes: number = ESCALATION_THRESHOLD_MINUTES,
    now: Date = new Date(),
  ): Promise<{ escalated: number }> {
    const cutoff = new Date(now.getTime() - thresholdMinutes * 60_000);
    const stale = await this.prisma.helpRequest.findMany({
      where: { status: 'OPEN', createdAt: { lt: cutoff } },
      select: {
        id: true,
        subjectId: true,
        learnerId: true,
        topic: true,
        subject: { select: { name: true } },
      },
    });
    if (stale.length === 0) return { escalated: 0 };

    const requestIds = stale.map((request) => request.id);
    const subjectIds = [...new Set(stale.map((request) => request.subjectId))];
    const [teacherLinks, admins, existing] = await Promise.all([
      this.prisma.teacherSubject.findMany({
        where: { subjectId: { in: subjectIds } },
        select: { teacherId: true, subjectId: true },
      }),
      this.prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true },
      }),
      this.prisma.notification.findMany({
        where: {
          requestId: { in: requestIds },
          type: NotificationType.REQUEST_CREATED,
        },
        select: { recipientId: true, requestId: true },
      }),
    ]);

    const have = new Set(
      existing.map((row) => `${row.requestId}:${row.recipientId}`),
    );
    const teachersBySubject = new Map<string, string[]>();
    for (const link of teacherLinks) {
      const list = teachersBySubject.get(link.subjectId) ?? [];
      list.push(link.teacherId);
      teachersBySubject.set(link.subjectId, list);
    }
    const adminIds = admins.map((admin) => admin.id);

    const data: {
      recipientId: string;
      type: NotificationType;
      requestId: string;
      actorId: string;
    }[] = [];
    const pushByRequest = new Map<string, string[]>();
    for (const request of stale) {
      const candidates = [
        ...new Set([
          ...(teachersBySubject.get(request.subjectId) ?? []),
          ...adminIds,
        ]),
      ];
      for (const recipientId of candidates) {
        if (!have.has(`${request.id}:${recipientId}`)) {
          data.push({
            recipientId,
            type: NotificationType.REQUEST_CREATED,
            requestId: request.id,
            // Escalation is a system action: attribute it to the learner so
            // the row still names who needs help.
            actorId: request.learnerId,
          });
          const recipients = pushByRequest.get(request.id) ?? [];
          recipients.push(recipientId);
          pushByRequest.set(request.id, recipients);
        }
      }
    }
    if (data.length > 0) {
      await this.prisma.notification.createMany({
        data,
        skipDuplicates: true,
      });
      await Promise.all(
        stale.map(async (request) => {
          const recipients = pushByRequest.get(request.id) ?? [];
          if (recipients.length > 0) {
            await this.pushToUsers(recipients, {
              title: `New request in ${request.subject.name}`,
              body: request.topic,
              url: `/requests/${request.id}`,
              tag: `request-${request.id}`,
              vibrate: [150, 75, 150],
              // Escalation is a backstop, not an alarm: inbox-first, no buzz.
              silent: true,
            });
          }
        }),
      );
    }
    return { escalated: data.length };
  }
}
