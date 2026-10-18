import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

export const STATS_STALE_MINUTES = 45;
export const STATS_UNANSWERED_HOURS = 24;

/// Median of a numeric sample. Returns null when empty.
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/// Nearest-rank percentile (p90 etc.). Returns null when empty.
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[rank] ?? null;
}

export interface StatsOverview {
  total: number;
  open: number;
  accepted: number;
  closed: number;
  learnersHelped: number;
  sessionsArranged: number;
  oldestOpenWaitMinutes: number | null;
}

export interface StatsResponsiveness {
  medianSecondsToAccept: number | null;
  p90SecondsToAccept: number | null;
  pctAcceptedUnder1h: number | null;
  staleOver45m: number;
  unansweredOver24h: number;
}

export interface StatsBySubject {
  subjectId: string;
  subjectName: string;
  total: number;
  accepted: number;
}

export interface StatsByTeacher {
  teacherId: string;
  teacherName: string;
  accepts: number;
  declines: number;
  medianSecondsToAccept: number | null;
}

export interface AdminStats {
  overview: StatsOverview;
  responsiveness: StatsResponsiveness;
  bySubject: StatsBySubject[];
  byTeacher: StatsByTeacher[];
}

@Injectable()
export class AdminStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(now: Date = new Date()): Promise<AdminStats> {
    const staleCutoff = new Date(now.getTime() - STATS_STALE_MINUTES * 60_000);
    const unansweredCutoff = new Date(
      now.getTime() - STATS_UNANSWERED_HOURS * 3_600_000,
    );

    const [
      total,
      open,
      accepted,
      closed,
      sessionsArranged,
      oldestOpen,
      staleOver45m,
      unansweredOver24h,
      helpedGroups,
      acceptedDecisions,
      declineGroups,
      subjectTotals,
      subjectAccepted,
    ] = await Promise.all([
      this.prisma.helpRequest.count(),
      this.prisma.helpRequest.count({ where: { status: 'OPEN' } }),
      this.prisma.helpRequest.count({ where: { status: 'ACCEPTED' } }),
      this.prisma.helpRequest.count({ where: { status: 'CLOSED' } }),
      this.prisma.helpSession.count(),
      this.prisma.helpRequest.findFirst({
        where: { status: 'OPEN' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.prisma.helpRequest.count({
        where: { status: 'OPEN', createdAt: { lt: staleCutoff } },
      }),
      this.prisma.helpRequest.count({
        where: { status: 'OPEN', createdAt: { lt: unansweredCutoff } },
      }),
      this.prisma.helpRequest.groupBy({
        by: ['learnerId'],
        where: { status: { in: ['ACCEPTED', 'CLOSED'] } },
      }),
      this.prisma.helpRequestDecision.findMany({
        where: { decision: 'ACCEPTED' },
        select: {
          teacherId: true,
          createdAt: true,
          request: { select: { createdAt: true } },
        },
      }),
      this.prisma.helpRequestDecision.groupBy({
        by: ['teacherId'],
        where: { decision: 'DECLINED' },
        _count: { _all: true },
      }),
      this.prisma.helpRequest.groupBy({
        by: ['subjectId'],
        _count: { _all: true },
      }),
      this.prisma.helpRequest.groupBy({
        by: ['subjectId'],
        where: { status: { in: ['ACCEPTED', 'CLOSED'] } },
        _count: { _all: true },
      }),
    ]);

    const waitSeconds = acceptedDecisions
      .map(
        (d) => (d.createdAt.getTime() - d.request.createdAt.getTime()) / 1000,
      )
      .filter((s) => s >= 0);
    const under1h =
      waitSeconds.length === 0
        ? null
        : waitSeconds.filter((s) => s <= 3600).length / waitSeconds.length;

    const subjectIds = [...new Set(subjectTotals.map((g) => g.subjectId))];
    const acceptedBySubject = new Map(
      subjectAccepted.map((g) => [g.subjectId, g._count._all]),
    );
    const subjects =
      subjectIds.length === 0
        ? []
        : await this.prisma.subject.findMany({
            where: { id: { in: subjectIds } },
            select: { id: true, name: true },
          });
    const subjectNames = new Map(subjects.map((s) => [s.id, s.name]));
    const bySubject: StatsBySubject[] = subjectTotals
      .map((g) => ({
        subjectId: g.subjectId,
        subjectName: subjectNames.get(g.subjectId) ?? g.subjectId,
        total: g._count._all,
        accepted: acceptedBySubject.get(g.subjectId) ?? 0,
      }))
      .sort((a, b) => b.total - a.total);

    const declinesByTeacher = new Map(
      declineGroups.map((g) => [g.teacherId, g._count._all]),
    );
    const waitsByTeacher = new Map<string, number[]>();
    const acceptsByTeacher = new Map<string, number>();
    for (const d of acceptedDecisions) {
      const s = (d.createdAt.getTime() - d.request.createdAt.getTime()) / 1000;
      if (s < 0) continue;
      acceptsByTeacher.set(
        d.teacherId,
        (acceptsByTeacher.get(d.teacherId) ?? 0) + 1,
      );
      const list = waitsByTeacher.get(d.teacherId) ?? [];
      list.push(s);
      waitsByTeacher.set(d.teacherId, list);
    }
    const teacherIds = [
      ...new Set([...acceptsByTeacher.keys(), ...declinesByTeacher.keys()]),
    ];
    const teachers =
      teacherIds.length === 0
        ? []
        : await this.prisma.user.findMany({
            where: { id: { in: teacherIds } },
            select: { id: true, name: true },
          });
    const teacherNames = new Map(teachers.map((t) => [t.id, t.name]));
    const byTeacher: StatsByTeacher[] = teacherIds
      .map((teacherId) => ({
        teacherId,
        teacherName: teacherNames.get(teacherId) ?? teacherId,
        accepts: acceptsByTeacher.get(teacherId) ?? 0,
        declines: declinesByTeacher.get(teacherId) ?? 0,
        medianSecondsToAccept: median(waitsByTeacher.get(teacherId) ?? []),
      }))
      .sort((a, b) => b.accepts - a.accepts || b.declines - a.declines);

    return {
      overview: {
        total,
        open,
        accepted,
        closed,
        learnersHelped: helpedGroups.length,
        sessionsArranged,
        oldestOpenWaitMinutes:
          oldestOpen === null
            ? null
            : Math.max(
                0,
                Math.round(
                  (now.getTime() - oldestOpen.createdAt.getTime()) / 60_000,
                ),
              ),
      },
      responsiveness: {
        medianSecondsToAccept: median(waitSeconds),
        p90SecondsToAccept: percentile(waitSeconds, 90),
        pctAcceptedUnder1h: under1h,
        staleOver45m,
        unansweredOver24h,
      },
      bySubject,
      byTeacher,
    };
  }
}
