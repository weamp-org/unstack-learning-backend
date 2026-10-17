import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { UserRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateSubjectDto } from './dtos/create-subject.dto.js';
import { UpdateSubjectDto } from './dtos/update-subject.dto.js';

@Injectable()
export class SubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSubjectDto) {
    // The slug is derived server-side so clients can never squat, collide,
    // or smuggle one in (the global ValidationPipe rejects unknown fields).
    // A slug clash with an existing subject raises P2002, translated to 409
    // by GlobalExceptionFilter.
    return this.prisma.subject.create({
      data: { ...dto, slug: slugify(dto.name) },
    });
  }

  async findAll(options?: {
    includeInactive?: boolean;
    clerkId?: string | null;
  }) {
    const { includeInactive = false, clerkId = null } = options ?? {};
    // includeInactive is admin-only; anyone else silently gets the
    // active-only list. The role lookup runs only when the flag is set.
    let showAll = false;
    if (includeInactive && clerkId) {
      const user = await this.prisma.user.findUnique({
        where: { id: clerkId },
        select: { role: true },
      });
      showAll = user?.role === UserRole.ADMIN;
    }
    // This list feeds the help-request form and may be shown publicly, so
    // deactivated subjects stay hidden unless an admin asked for them.
    // Admins reactivate via PATCH /subjects/:id.
    return this.prisma.subject.findMany({
      where: showAll ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const subject = await this.prisma.subject.findUnique({ where: { id } });
    if (!subject) throw new NotFoundException(`Subject ${id} not found`);
    return subject;
  }

  update(id: string, dto: UpdateSubjectDto) {
    // The slug is frozen after creation so renames never break links.
    // A missing subject raises P2025, translated to 404 by
    // GlobalExceptionFilter.
    return this.prisma.subject.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    // Deletion is refused (P2003 → 400) once teachers or help requests
    // reference the subject — deactivate via PATCH instead.
    await this.findOne(id);
    return this.prisma.subject.delete({ where: { id } });
  }
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) {
    throw new BadRequestException(
      'Subject name must contain at least one letter or number',
    );
  }
  return slug;
}
