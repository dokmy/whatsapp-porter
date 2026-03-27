import type { MediaType } from '@whatsapp-porter/shared';
import { SOCKET_EVENTS } from '@whatsapp-porter/shared';
import { prisma } from '../db';
import { emit } from '../socket/emitter';
import { logger } from '../utils/logger';
import { buildFileName, saveFile } from '../utils/fileSystem';
import { applyJitter } from './jitter';
import { getWASocket } from '../whatsapp/connection';
import fs from 'fs-extra';

async function getDestinationGroupId(): Promise<string | null> {
  const setting = await prisma.setting.findUnique({ where: { key: 'destinationGroupId' } });
  if (!setting) return null;
  try { return JSON.parse(setting.value); } catch { return setting.value; }
}

function getExtFromMime(mimetype: string | undefined, mediaType: MediaType): string {
  if (!mimetype) {
    const defaults: Record<MediaType, string> = { image: 'jpg', video: 'mp4', audio: 'ogg', document: 'bin' };
    return defaults[mediaType];
  }
  const ext = mimetype.split('/')[1]?.split(';')[0];
  if (!ext) return 'bin';
  const map: Record<string, string> = { jpeg: 'jpg', webp: 'webp' };
  return map[ext] || ext;
}

/**
 * Forward a queued message by its DB id.
 * Reads media from the local cache (downloaded when the message arrived).
 * Uses the editable caption stored on the message.
 */
export async function forwardQueuedMessage(messageId: string, customCaption?: string): Promise<void> {
  const sock = getWASocket();
  if (!sock) throw new Error('Not connected to WhatsApp');

  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    include: { group: true },
  });
  if (!msg) throw new Error('Message not found');
  if (!msg.mediaType) throw new Error('Not a media message');
  if (!msg.cachePath) throw new Error('Media not cached — it was not downloaded when received');

  const destinationId = await getDestinationGroupId();
  if (!destinationId) throw new Error('No destination group configured');

  // Check cache file exists
  const cacheExists = await fs.pathExists(msg.cachePath);
  if (!cacheExists) throw new Error('Cached media file not found — it may have been cleaned up');

  // Mark as forwarding
  await prisma.message.update({ where: { id: messageId }, data: { queueStatus: 'forwarding' } });
  emit(SOCKET_EVENTS.QUEUE_UPDATE, { id: messageId, queueStatus: 'forwarding' });

  try {
    const buffer = await fs.readFile(msg.cachePath);

    // Save to user's folder if configured
    const monitored = await prisma.monitoredGroup.findUnique({ where: { groupId: msg.groupId } });
    let savedPath: string | undefined;

    if (monitored?.savePath && monitored.savePath.trim()) {
      const ext = getExtFromMime(msg.mimetype || undefined, msg.mediaType as MediaType);
      const saveName = buildFileName(msg.fileName || undefined, ext, msg.mediaType);
      savedPath = await saveFile(monitored.savePath, saveName, buffer);
      logger.info(`Saved ${msg.mediaType} to ${savedPath}`, undefined, 'save');
    }

    // Apply jitter
    await applyJitter();

    // Use custom caption if provided, otherwise use the stored one
    const caption = customCaption ?? msg.caption ?? '';

    // Build send payload
    const mediaType = msg.mediaType as MediaType;
    const mediaContent: Record<string, unknown> = { caption };

    if (mediaType === 'image') {
      mediaContent.image = buffer;
      mediaContent.mimetype = msg.mimetype || 'image/jpeg';
    } else if (mediaType === 'video') {
      mediaContent.video = buffer;
      mediaContent.mimetype = msg.mimetype || 'video/mp4';
    } else if (mediaType === 'audio') {
      mediaContent.audio = buffer;
      mediaContent.mimetype = msg.mimetype || 'audio/ogg; codecs=opus';
    } else if (mediaType === 'document') {
      mediaContent.document = buffer;
      mediaContent.mimetype = msg.mimetype || 'application/octet-stream';
      mediaContent.fileName = msg.fileName || 'document';
    }

    await sock.sendMessage(destinationId, mediaContent);

    // Update status
    await prisma.message.update({
      where: { id: messageId },
      data: {
        queueStatus: 'forwarded',
        forwarded: true,
        savedPath: savedPath || msg.savedPath,
        caption,
      },
    });

    emit(SOCKET_EVENTS.QUEUE_UPDATE, { id: messageId, queueStatus: 'forwarded' });
    logger.info(`Forwarded ${msg.mediaType} from "${msg.group.name}"`, undefined, 'forward');

    // Clean up cache file after successful forward
    await fs.remove(msg.cachePath).catch(() => {});

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await prisma.message.update({
      where: { id: messageId },
      data: { queueStatus: 'failed', error: errorMsg },
    });
    emit(SOCKET_EVENTS.QUEUE_UPDATE, { id: messageId, queueStatus: 'failed', error: errorMsg });
    logger.error(`Forward failed: ${errorMsg}`, undefined, 'error');
    throw err;
  }
}
