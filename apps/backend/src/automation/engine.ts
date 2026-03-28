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
 */
export async function forwardQueuedMessage(messageId: string, customCaption?: string, skipJitter?: boolean): Promise<void> {
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

  const cacheExists = await fs.pathExists(msg.cachePath);
  if (!cacheExists) throw new Error('Cached media file not found — it may have been cleaned up');

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

    if (!skipJitter) await applyJitter();

    const caption = customCaption !== undefined ? customCaption : (msg.caption ?? '');
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

/**
 * Forward all messages in an album as a real WhatsApp album.
 * Sends all images nearly simultaneously so WhatsApp groups them.
 */
export async function forwardAlbum(albumId: string, customCaption?: string): Promise<number> {
  const sock = getWASocket();
  if (!sock) throw new Error('Not connected to WhatsApp');

  const messages = await prisma.message.findMany({
    where: { albumId, queueStatus: { in: ['queued', 'failed'] } },
    include: { group: true },
    orderBy: { timestamp: 'asc' },
  });

  if (messages.length === 0) throw new Error('No queued messages in this album');

  const destinationId = await getDestinationGroupId();
  if (!destinationId) throw new Error('No destination group configured');

  // Mark all as forwarding
  for (const msg of messages) {
    await prisma.message.update({ where: { id: msg.id }, data: { queueStatus: 'forwarding' } });
    emit(SOCKET_EVENTS.QUEUE_UPDATE, { id: msg.id, queueStatus: 'forwarding' });
  }

  // Apply jitter once before the album
  await applyJitter();

  // Read all buffers first
  const mediaItems: { msg: typeof messages[0]; buffer: Buffer }[] = [];
  for (const msg of messages) {
    if (!msg.cachePath) continue;
    const exists = await fs.pathExists(msg.cachePath);
    if (!exists) continue;
    const buffer = await fs.readFile(msg.cachePath);
    mediaItems.push({ msg, buffer });
  }

  // Save all locally first
  for (const { msg, buffer } of mediaItems) {
    const monitored = await prisma.monitoredGroup.findUnique({ where: { groupId: msg.groupId } });
    if (monitored?.savePath && monitored.savePath.trim()) {
      const ext = getExtFromMime(msg.mimetype || undefined, msg.mediaType as MediaType);
      const saveName = buildFileName(msg.fileName || undefined, ext, msg.mediaType!);
      const savedPath = await saveFile(monitored.savePath, saveName, buffer);
      await prisma.message.update({ where: { id: msg.id }, data: { savedPath } });
    }
  }

  // Send all images as fast as possible — fire them all without waiting
  const caption = customCaption !== undefined ? customCaption : (messages[0].caption ?? '');
  const sendPromises = mediaItems.map(({ msg, buffer }, i) => {
    const mediaType = msg.mediaType as MediaType;
    const content: Record<string, unknown> = {
      caption: i === 0 ? caption : '', // Only first gets caption
    };

    if (mediaType === 'image') {
      content.image = buffer;
      content.mimetype = msg.mimetype || 'image/jpeg';
    } else if (mediaType === 'video') {
      content.video = buffer;
      content.mimetype = msg.mimetype || 'video/mp4';
    }

    return sock.sendMessage(destinationId, content);
  });

  // Fire all sends concurrently
  const results = await Promise.allSettled(sendPromises);

  let forwarded = 0;
  for (let i = 0; i < mediaItems.length; i++) {
    const { msg } = mediaItems[i];
    const result = results[i];

    if (result.status === 'fulfilled') {
      await prisma.message.update({
        where: { id: msg.id },
        data: { queueStatus: 'forwarded', forwarded: true },
      });
      emit(SOCKET_EVENTS.QUEUE_UPDATE, { id: msg.id, queueStatus: 'forwarded' });
      await fs.remove(msg.cachePath!).catch(() => {});
      forwarded++;
    } else {
      const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      await prisma.message.update({
        where: { id: msg.id },
        data: { queueStatus: 'failed', error: errorMsg },
      });
      emit(SOCKET_EVENTS.QUEUE_UPDATE, { id: msg.id, queueStatus: 'failed', error: errorMsg });
    }
  }

  logger.info(`Forwarded album (${forwarded}/${mediaItems.length} items)`, undefined, 'forward');
  return forwarded;
}
