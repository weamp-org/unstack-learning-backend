import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';

import { R2_CLIENT } from './r2-client.token.js';

export interface StoredObject {
  byteSize: number;
  contentType: string | undefined;
}

/**
 * Thin wrapper over R2's S3-compatible API. Uploads and downloads never pass
 * through Nest: callers hand the browser a presigned URL. The bucket is
 * private, so every read URL is short-lived.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket: string;

  constructor(
    @Inject(R2_CLIENT) private readonly client: S3Client,
    config: ConfigService,
  ) {
    this.bucket = config.get<string>('R2_BUCKET') ?? '';
  }

  presignPut(
    key: string,
    contentType: string,
    expiresInSeconds: number,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  presignGet(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  /// Null when the object is missing, so callers can answer "upload incomplete"
  /// rather than 500 on a race with the browser.
  async head(key: string): Promise<StoredObject | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        byteSize: result.ContentLength ?? 0,
        contentType: result.ContentType,
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  /// First bytes of an object, for magic-byte sniffing. Content-Type headers
  /// are client supplied, so the bytes have the final say.
  async readPrefix(key: string, length = 16): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: `bytes=0-${length - 1}`,
      }),
    );
    const body = result.Body as {
      transformToByteArray?: () => Promise<Uint8Array>;
    };
    if (!body?.transformToByteArray) {
      throw new Error(`Could not read object body for ${key}`);
    }
    return Buffer.from(await body.transformToByteArray());
  }

  async copy(fromKey: string, toKey: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${encodeURIComponent(fromKey)}`,
        Key: toKey,
      }),
    );
  }

  async remove(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      if (isNotFound(error)) return;
      throw error;
    }
  }

  /// Best-effort bulk cleanup: a failed delete must never break a user action,
  /// and the bucket's lifecycle rule is the backstop.
  async removeMany(keys: string[]): Promise<void> {
    await Promise.all(
      keys.map(async (key) => {
        try {
          await this.remove(key);
        } catch (error) {
          this.logger.warn(`Could not delete ${key}: ${String(error)}`);
        }
      }),
    );
  }
}

function isNotFound(error: unknown): boolean {
  const candidate = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    candidate?.name === 'NotFound' ||
    candidate?.name === 'NoSuchKey' ||
    candidate?.$metadata?.httpStatusCode === 404
  );
}
