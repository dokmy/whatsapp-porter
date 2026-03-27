import { downloadMediaMessage } from '@whiskeysockets/baileys';
import type { WASocket, WAMessage } from '@whiskeysockets/baileys';
import type { MediaType } from '@whatsapp-porter/shared';
import { SOCKET_EVENTS } from '@whatsapp-porter/shared';
import { prisma } from '../db';
import { emit } from '../socket/emitter';
import { logger } from '../utils/logger';
import { buildCaption } from '../automation/captionBuilder';
import path from 'path';
import fs from 'fs-extra';

const CACHE_DIR = path.join(process.cwd(), '.media-cache');
const ALBUM_WINDOW_MS = 30_000; // 30s window to group album items

// Track recent media for album detection
const recentMedia: Map<string, { albumId: string; timestamp: number }> = new Map();

function getMediaType(message: WAMessage): MediaType | null {
  const msg = message.message;
  if (!msg) return null;
  if (msg.imageMessage) return 'image';
  if (msg.videoMessage) return 'video';
  if (msg.audioMessage) return 'audio';
  if (msg.documentMessage) return 'document';
  return null;
}

function getTextContent(message: WAMessage): string {
  const msg = message.message;
  if (!msg) return '';
  if (msg.conversation) return msg.conversation;
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
  if (msg.imageMessage?.caption) return msg.imageMessage.caption;
  if (msg.videoMessage?.caption) return msg.videoMessage.caption;
  if (msg.documentMessage?.caption) return msg.documentMessage.caption;
  return '';
}

function getMediaInfo(message: WAMessage): {
  fileName?: string;
  mimetype?: string;
  fileSizeBytes: number;
  thumbnail?: string;
} {
  const msg = message.message;
  if (!msg) return { fileSizeBytes: 0 };
  const media = msg.imageMessage || msg.videoMessage || msg.audioMessage || msg.documentMessage;
  if (!media) return { fileSizeBytes: 0 };

  let thumbnail: string | undefined;
  const jpegThumb = (media as { jpegThumbnail?: Uint8Array }).jpegThumbnail;
  if (jpegThumb && jpegThumb.length > 0) {
    thumbnail = Buffer.from(jpegThumb).toString('base64');
  }

  return {
    fileName: (media as { fileName?: string }).fileName || undefined,
    mimetype: media.mimetype || undefined,
    fileSizeBytes: Number((media as { fileLength?: number | Long }).fileLength || 0),
    thumbnail,
  };
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

function detectAlbumId(groupId: string, senderJid: string, timestamp: number): string {
  const key = `${groupId}:${senderJid}`;
  const recent = recentMedia.get(key);

  if (recent && (timestamp - recent.timestamp) < ALBUM_WINDOW_MS) {
    // Part of existing album
    recentMedia.set(key, { albumId: recent.albumId, timestamp });
    return recent.albumId;
  }

  // New album
  const albumId = `album-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  recentMedia.set(key, { albumId, timestamp });
  return albumId;
}

async function storeMessage(sock: WASocket, message: WAMessage, isHistory: boolean = false) {
  const remoteJid = message.key.remoteJid;
  if (!remoteJid || !remoteJid.endsWith('@g.us')) return;

  const isFromMe = !!message.key.fromMe;
  const mediaType = getMediaType(message);
  const content = getTextContent(message);
  const { fileName, mimetype, fileSizeBytes, thumbnail } = getMediaInfo(message);
  const senderJid = message.key.participant || remoteJid;
  const senderName = isFromMe ? 'You' : (message.pushName || senderJid.split('@')[0]);
  const waMessageId = message.key.id!;
  const timestamp = message.messageTimestamp
    ? new Date(Number(message.messageTimestamp) * 1000)
    : new Date();

  const monitored = await prisma.monitoredGroup.findUnique({ where: { groupId: remoteJid } });
  const shouldQueue = !isFromMe && monitored?.enabled && mediaType && !isHistory;

  // Detect album grouping for media messages
  let albumId: string | null = null;
  if (mediaType && !isFromMe) {
    albumId = detectAlbumId(remoteJid, senderJid, timestamp.getTime());
  }

  // Download media immediately for monitored groups
  let cachePath: string | undefined;
  let generatedCaption: string | undefined;

  if (shouldQueue && mediaType) {
    try {
      const buffer = await downloadMediaMessage(message, 'buffer', {}) as Buffer;
      await fs.ensureDir(CACHE_DIR);
      const ext = getExtFromMime(mimetype, mediaType);
      const cacheFileName = `${waMessageId}.${ext}`;
      cachePath = path.join(CACHE_DIR, cacheFileName);
      await fs.writeFile(cachePath, buffer);

      const group = await prisma.group.findUnique({ where: { id: remoteJid } });
      generatedCaption = buildCaption(null, {
        groupName: group?.name || remoteJid,
        sender: senderName,
        originalCaption: content || '',
      });

      logger.info(`Cached ${mediaType} from "${group?.name || remoteJid}"`, undefined, 'download');
    } catch (err) {
      logger.error(`Failed to cache media: ${err instanceof Error ? err.message : String(err)}`, undefined, 'error');
    }
  }

  try {
    const stored = await prisma.message.upsert({
      where: { groupId_waMessageId: { groupId: remoteJid, waMessageId } },
      update: {},
      create: {
        waMessageId,
        groupId: remoteJid,
        senderJid,
        senderName,
        content: content || (mediaType ? `[${mediaType}]` : ''),
        mediaType: mediaType || null,
        fileName,
        mimetype,
        fileSizeBytes,
        thumbnail: thumbnail || null,
        cachePath: cachePath || null,
        albumId,
        caption: generatedCaption || null,
        queueStatus: shouldQueue ? 'queued' : 'none',
        timestamp,
      },
    });

    if (!isHistory) {
      emit(SOCKET_EVENTS.MESSAGE_NEW, {
        id: stored.id,
        waMessageId,
        groupId: remoteJid,
        senderJid,
        senderName,
        content: stored.content,
        mediaType,
        fileName,
        fileSizeBytes,
        thumbnail: stored.thumbnail,
        cachePath: stored.cachePath,
        albumId: stored.albumId,
        caption: stored.caption,
        queueStatus: stored.queueStatus,
        forwarded: false,
        savedPath: null,
        error: null,
        timestamp: timestamp.toISOString(),
      });

      if (shouldQueue) {
        logger.info(`Queued ${mediaType} for forwarding`, undefined, 'queue');
      }
    }
  } catch {
    // Duplicate or group not in DB
  }
}

export function registerMessageHandler(sock: WASocket): void {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    const isHistory = type !== 'notify';
    for (const message of messages) {
      try {
        await storeMessage(sock, message, isHistory);
      } catch (err) {
        logger.error(`Error handling message: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  });

  logger.info('Message handler registered');
}
