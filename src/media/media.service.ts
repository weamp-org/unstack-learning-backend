import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { MediaKind, MediaStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { CreateMediaUploadDto } from './dtos/create-media-upload.dto.js';
import {
  extensionFor,
  isAllowedContentType,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_PER_REQUEST,
  MAX_AUDIO_SECONDS,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_REQUEST,
  MAX_MEDIA_PER_REQUEST,
  MIN_AUDIO_SECONDS,
  normalizeContentType,
  PRESIGN_GET_TTL_SECONDS,
  PRESIGN_GET_TTL_SECONDS_AUDIO,
  PRESIGN_PUT_TTL_SECONDS,
  STAGED_UPLOAD_TTL_MS,
} from './media.constants.js';

export interface MovedMedia {
  id: string;
  fromKey: string;
  toKey: string;
}

export interface SignedMedia {
  id: string;
  kind: MediaKind;
  contentType: string;
  byteSize: number;
  durationSeconds: number | null;
  url: string;
  expiresAt: string;
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async createUpload(ownerId: string, dto: CreateMediaUploadDto) {
    const contentType = normalizeContentType(dto.contentType);
    if (!isAllowedContentType(dto.kind, contentType)) {
      throw new BadRequestException(
        dto.kind === MediaKind.IMAGE
          ? 'Images must be JPEG, PNG, or WebP'
          : 'Audio must be WebM, OGG, MP4, or MP3',
      );
    }

    const sizeLimit =
      dto.kind === MediaKind.IMAGE ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
    if (dto.byteSize > sizeLimit) {
      throw new BadRequestException(
        `That file is too large (limit ${Math.round(sizeLimit / (1024 * 1024))} MB)`,
      );
    }

    if (dto.kind === MediaKind.AUDIO) {
      if (dto.durationSeconds === undefined) {
        throw new BadRequestException('Audio needs its length in seconds');
      }
      if (
        dto.durationSeconds < MIN_AUDIO_SECONDS ||
        dto.durationSeconds > MAX_AUDIO_SECONDS
      ) {
        throw new BadRequestException(
          `Voice notes must be between ${MIN_AUDIO_SECONDS} second and ${MAX_AUDIO_SECONDS / 60} minutes`,
        );
      }
    } else if (dto.durationSeconds !== undefined) {
      throw new BadRequestException('Only audio has a duration');
    }

    await this.purgeStaged(ownerId);

    const objectKey = `staging/${ownerId}/${randomUUID()}`;
    const upload = await this.prisma.mediaUpload.create({
      data: {
        ownerId,
        kind: dto.kind,
        objectKey,
        contentType,
        byteSize: dto.byteSize,
        durationSeconds: dto.durationSeconds ?? null,
      },
    });

    const uploadUrl = await this.storage.presignPut(
      objectKey,
      contentType,
      PRESIGN_PUT_TTL_SECONDS,
    );

    return {
      id: upload.id,
      kind: upload.kind,
      uploadUrl,
      expiresAt: new Date(
        Date.now() + PRESIGN_PUT_TTL_SECONDS * 1000,
      ).toISOString(),
    };
  }

  /// Called after the browser PUTs the bytes. Verifies the object actually
  /// exists and matches what was declared, then flips it READY so a request
  /// can reference it. Idempotent: retries after a flaky response are safe.
  async complete(ownerId: string, id: string) {
    const upload = await this.findOwned(ownerId, id);
    if (upload.status === MediaStatus.READY) return this.toView(upload);

    const object = await this.storage.head(upload.objectKey);
    if (!object) {
      throw new BadRequestException(
        'Upload has not reached storage yet; try again',
      );
    }
    if (object.byteSize !== upload.byteSize) {
      throw new BadRequestException(
        'Uploaded file does not match the size we expected',
      );
    }
    if (
      object.contentType &&
      normalizeContentType(object.contentType) !== upload.contentType
    ) {
      throw new BadRequestException('Uploaded file type does not match');
    }

    const prefix = await this.storage.readPrefix(upload.objectKey);
    if (sniffKind(prefix) !== upload.kind) {
      throw new BadRequestException('Uploaded file is not valid media');
    }

    const ready = await this.prisma.mediaUpload.update({
      where: { id },
      data: { status: MediaStatus.READY, completedAt: new Date() },
    });
    return this.toView(ready);
  }

  /// Drops a file the learner removed before submitting. Attached media is
  /// deleted with its request, never through this path.
  async abandon(ownerId: string, id: string) {
    const upload = await this.findOwned(ownerId, id);
    if (upload.requestId !== null) {
      throw new BadRequestException(
        'That attachment is already part of a request',
      );
    }
    await this.storage.remove(upload.objectKey);
    await this.prisma.mediaUpload.delete({ where: { id } });
    return { id, deleted: true as const };
  }

  /// Fetches the rows a request may attach: owned, READY, not already used.
  async assertAttachable(ownerId: string, ids: string[]) {
    const unique = [...new Set(ids)];
    const rows = await this.prisma.mediaUpload.findMany({
      where: {
        id: { in: unique },
        ownerId,
        requestId: null,
        status: MediaStatus.READY,
      },
    });
    if (rows.length !== unique.length) {
      throw new BadRequestException(
        'Some attachments are missing or already used',
      );
    }

    const images = rows.filter((row) => row.kind === MediaKind.IMAGE).length;
    const audio = rows.filter((row) => row.kind === MediaKind.AUDIO).length;
    if (images > MAX_IMAGES_PER_REQUEST) {
      throw new BadRequestException(
        `Attach at most ${MAX_IMAGES_PER_REQUEST} images`,
      );
    }
    if (audio > MAX_AUDIO_PER_REQUEST) {
      throw new BadRequestException(
        `Attach at most ${MAX_AUDIO_PER_REQUEST} voice notes`,
      );
    }
    if (rows.length > MAX_MEDIA_PER_REQUEST) {
      throw new BadRequestException(
        `Attach at most ${MAX_MEDIA_PER_REQUEST} files`,
      );
    }
    return rows;
  }

  /// Copies staged objects to their permanent keys. Destinations do not depend
  /// on the request id, so this can run before the request row exists and the
  /// transaction stays free of network calls.
  async copyIntoRequests(
    media: { id: string; objectKey: string; contentType: string }[],
  ): Promise<MovedMedia[]> {
    const moved: MovedMedia[] = [];
    try {
      for (const item of media) {
        const toKey = `requests/${item.id}${extensionFor(item.contentType)}`;
        await this.storage.copy(item.objectKey, toKey);
        moved.push({ id: item.id, fromKey: item.objectKey, toKey });
      }
      return moved;
    } catch (error) {
      await this.storage.removeMany(moved.map((item) => item.toKey));
      throw error;
    }
  }

  /// Deletes the now-duplicate staging objects. Best effort: the `staging/`
  /// lifecycle rule cleans up whatever this misses.
  async dropStagedCopies(moved: MovedMedia[]): Promise<void> {
    await this.storage.removeMany(moved.map((item) => item.fromKey));
  }

  /// Compensating delete when the request write fails after the copy.
  async rollbackCopies(moved: MovedMedia[]): Promise<void> {
    await this.storage.removeMany(moved.map((item) => item.toKey));
  }

  /// Signs read URLs for display. Called on every read so a short TTL never
  /// leaves a stale link in the UI.
  async sign(
    media: {
      id: string;
      kind: MediaKind;
      contentType: string;
      byteSize: number;
      durationSeconds: number | null;
      objectKey: string;
    }[],
  ): Promise<SignedMedia[]> {
    return Promise.all(
      media.map(async (item) => {
        const ttl =
          item.kind === MediaKind.AUDIO
            ? PRESIGN_GET_TTL_SECONDS_AUDIO
            : PRESIGN_GET_TTL_SECONDS;
        return {
          id: item.id,
          kind: item.kind,
          contentType: item.contentType,
          byteSize: item.byteSize,
          durationSeconds: item.durationSeconds,
          url: await this.storage.presignGet(item.objectKey, ttl),
          expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
        };
      }),
    );
  }

  private async purgeStaged(ownerId: string) {
    const cutoff = new Date(Date.now() - STAGED_UPLOAD_TTL_MS);
    const stale = await this.prisma.mediaUpload.findMany({
      where: {
        ownerId,
        requestId: null,
        status: MediaStatus.PENDING,
        createdAt: { lt: cutoff },
      },
      select: { id: true, objectKey: true },
    });
    if (stale.length === 0) return;
    await this.storage.removeMany(stale.map((row) => row.objectKey));
    await this.prisma.mediaUpload.deleteMany({
      where: { id: { in: stale.map((row) => row.id) } },
    });
  }

  private async findOwned(ownerId: string, id: string) {
    const upload = await this.prisma.mediaUpload.findFirst({
      where: { id, ownerId },
    });
    // Scoped lookup: someone else's upload reads as missing rather than
    // leaking its existence.
    if (!upload) throw new NotFoundException(`Upload ${id} not found`);
    return upload;
  }

  private toView(upload: {
    id: string;
    kind: MediaKind;
    contentType: string;
    byteSize: number;
    durationSeconds: number | null;
    status: MediaStatus;
  }) {
    return {
      id: upload.id,
      kind: upload.kind,
      contentType: upload.contentType,
      byteSize: upload.byteSize,
      durationSeconds: upload.durationSeconds,
      status: upload.status,
    };
  }
}

/// Content-Type is client supplied, so the first bytes decide the kind.
export function sniffKind(prefix: Buffer): MediaKind | null {
  if (
    prefix.length >= 3 &&
    prefix[0] === 0xff &&
    prefix[1] === 0xd8 &&
    prefix[2] === 0xff
  ) {
    return MediaKind.IMAGE;
  }
  if (
    prefix.length >= 8 &&
    prefix
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return MediaKind.IMAGE;
  }
  if (
    prefix.length >= 12 &&
    prefix.subarray(0, 4).toString('ascii') === 'RIFF' &&
    prefix.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return MediaKind.IMAGE;
  }
  if (
    prefix.length >= 4 &&
    prefix.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
  ) {
    return MediaKind.AUDIO;
  }
  if (
    prefix.length >= 4 &&
    ['OggS', 'fLaC'].includes(prefix.subarray(0, 4).toString('ascii'))
  ) {
    return MediaKind.AUDIO;
  }
  if (
    prefix.length >= 8 &&
    prefix.subarray(4, 8).toString('ascii') === 'ftyp'
  ) {
    return MediaKind.AUDIO;
  }
  if (prefix.length >= 3 && prefix.subarray(0, 3).toString('ascii') === 'ID3') {
    return MediaKind.AUDIO;
  }
  // Bare MPEG frame sync: MP3 without an ID3 tag.
  if (prefix.length >= 2 && prefix[0] === 0xff && (prefix[1] & 0xe0) === 0xe0) {
    return MediaKind.AUDIO;
  }
  return null;
}
