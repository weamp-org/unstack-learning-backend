import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';

import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePushSubscriptionDto } from './dtos/push-subscription.dto.js';

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    if (!this.isConfigured) {
      // Subscribing works without keys (rows are just stored), but nothing
      // can be sent until VAPID is configured — warn loudly at startup.
      this.logger.warn(
        'VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT are not all set: push delivery is disabled until they are',
      );
    }
  }

  private get isConfigured(): boolean {
    return (
      !!this.config.get<string>('VAPID_PUBLIC_KEY') &&
      !!this.config.get<string>('VAPID_PRIVATE_KEY') &&
      !!this.config.get<string>('VAPID_SUBJECT')
    );
  }

  /// Throws 503 unless VAPID is fully configured. Lazy (not in the
  /// constructor) so subscribing and unrelated e2e suites keep working
  /// without keys; only sending requires them.
  private ensureSender(): void {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT');
    if (!publicKey || !privateKey || !subject) {
      throw new ServiceUnavailableException(
        'Push notifications are not configured',
      );
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);
  }

  subscribe(userId: string, dto: CreatePushSubscriptionDto) {
    // One row per endpoint: a re-login on the same device reassigns it
    // instead of duplicating it.
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      update: { userId, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
      create: {
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
    });
  }

  unsubscribe(userId: string, endpoint: string) {
    // Scoped delete: other users' rows are untouched (and the count tells
    // the caller whether this device was actually subscribed).
    return this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
  }

  listMine(userId: string) {
    return this.prisma.pushSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /// Sends a payload to every subscription of a user. Best-effort per
  /// endpoint: expired endpoints (410/404 from the push service) are pruned,
  /// other failures are counted, and nothing throws.
  async sendToUser(
    userId: string,
    payload: PushPayload,
  ): Promise<{ sent: number; pruned: number; failed: number }> {
    this.ensureSender();
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });
    const body = JSON.stringify({
      icon: '/icon-192x192.png',
      url: '/notifications',
      ...payload,
    });
    let sent = 0;
    let pruned = 0;
    let failed = 0;
    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
              },
            },
            body,
          );
          sent += 1;
        } catch (error) {
          const statusCode =
            typeof error === 'object' && error !== null && 'statusCode' in error
              ? (error as { statusCode: unknown }).statusCode
              : undefined;
          if (statusCode === 404 || statusCode === 410) {
            await this.prisma.pushSubscription
              .delete({ where: { id: subscription.id } })
              .catch(() => undefined);
            pruned += 1;
          } else {
            failed += 1;
          }
        }
      }),
    );
    return { sent, pruned, failed };
  }

  sendTest(userId: string) {
    return this.sendToUser(userId, {
      title: 'Unstack Learning',
      body: 'Push notifications are on for this device.',
      url: '/notifications',
    });
  }
}
