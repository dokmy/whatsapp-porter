import { downloadMediaMessage } from '@whiskeysockets/baileys';
import type { WASocket } from '@whiskeysockets/baileys';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { buildCaption } from '../automation/captionBuilder';
import path from 'path';
import fs from 'fs-extra';

const CACHE_DIR = path.join(process.cwd(), '.media-cache');

function getExtFromMime(mimetype: string | undefined, mediaType: string): string {
  if (!mimetype) {
    const defaults: Record<string, string> = { image: 'jpg', video: 'mp4', audio: 'ogg', document: 'bin' };
    return defaults[mediaType] || 'bin';
  }
  const ext = mimetype.split('/')[1]?.split(';')[0];
  if (!ext) return 'bin';
  const map: Record<string, string> = { jpeg: 'jpg', webp: 'webp' };
  return map[ext] || ext;
}

/**
 * On startup, find any media messages in monitored groups that arrived
 * while offline and weren't cached/queued. Queue them now.
 *
 * This catches messages that came through history sync (isHistory=true)
 * which are stored but not queued by the message handler.
 */
export async function catchUpQueue(sock: WASocket): Promise<void> {
  const monitored = await prisma.monitoredGroup.findMany({ where: { enabled: true } });
  if (monitored.length === 0) return;

  const groupIds = monitored.map(m => m.groupId);

  // Find media messages that have no cache and aren't queued yet
  // These are messages that arrived via history sync while offline
  const uncached = await prisma.message.findMany({
    where: {
      groupId: { in: groupIds },
      mediaType: { not: null },
      queueStatus: 'none',
      cachePath: null,
      senderName: { not: 'You' },
      // Only catch up messages from the last 24 hours
      timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    include: { group: true },
    orderBy: { timestamp: 'asc' },
    take: 100,
  });

  if (uncached.length === 0) {
    logger.info('Catch-up: no unprocessed media found', undefined, 'system');
    return;
  }

  logger.info(`Catch-up: found ${uncached.length} unprocessed media messages`, undefined, 'queue');

  let queued = 0;
  for (const msg of uncached) {
    try {
      // Try to download the media (may fail if too old)
      const fakeMessage = {
        key: {
          remoteJid: msg.groupId,
          id: msg.waMessageId,
          fromMe: false,
          participant: msg.senderJid,
        },
        message: null, // We don't have the original message object
      };

      // We can't re-download without the original message object,
      // but we can still queue it and mark it — the forward will fail
      // with a clear error if the cache doesn't exist.
      // For now, just mark as queued so the user sees it in the queue.
      const caption = buildCaption(null, {
        groupName: msg.group.name,
        sender: msg.senderName,
        originalCaption: msg.content.startsWith('[') ? '' : msg.content,
      });

      await prisma.message.update({
        where: { id: msg.id },
        data: { queueStatus: 'queued', caption },
      });

      queued++;
    } catch {
      // Skip failed items
    }
  }

  if (queued > 0) {
    logger.info(`Catch-up: queued ${queued} media items for review`, undefined, 'queue');
  }
}
