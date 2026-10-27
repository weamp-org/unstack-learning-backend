import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';

import { R2_CLIENT } from './r2-client.token.js';
import { StorageService } from './storage.service.js';

/**
 * R2 is configured through env, like Prisma. A missing config fails here with
 * a message naming the keys instead of surfacing later as an opaque AWS error.
 */
@Global()
@Module({
  providers: [
    {
      provide: R2_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const accountId = config.get<string>('R2_ACCOUNT_ID');
        const endpoint =
          config.get<string>('R2_ENDPOINT') ??
          (accountId
            ? `https://${accountId}.r2.cloudflarestorage.com`
            : undefined);
        const accessKeyId = config.get<string>('R2_ACCESS_KEY_ID');
        const secretAccessKey = config.get<string>('R2_SECRET_ACCESS_KEY');
        const bucket = config.get<string>('R2_BUCKET');
        const missing: string[] = [];
        if (!endpoint) missing.push('R2_ACCOUNT_ID (or R2_ENDPOINT)');
        if (!accessKeyId) missing.push('R2_ACCESS_KEY_ID');
        if (!secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
        if (!bucket) missing.push('R2_BUCKET');

        if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
          throw new Error(
            `R2 storage is not configured; missing ${missing.join(', ')}`,
          );
        }

        return new S3Client({
          region: 'auto',
          endpoint,
          // R2 presigned URLs use path style (bucket in the path).
          forcePathStyle: true,
          credentials: { accessKeyId, secretAccessKey },
        });
      },
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
