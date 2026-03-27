import { Router } from 'express';
import { SOCKET_EVENTS } from '@whatsapp-porter/shared';
import { getWASocket } from '../whatsapp/connection';
import { prisma } from '../db';
import { emit } from '../socket/emitter';

const router = Router();

router.post('/', async (req, res) => {
  const { groupId, text } = req.body;
  if (!groupId || !text) return res.status(400).json({ error: 'groupId and text required' });

  const sock = getWASocket();
  if (!sock) return res.status(400).json({ error: 'Not connected to WhatsApp' });

  try {
    const sent = await sock.sendMessage(groupId, { text });
    const waMessageId = sent.key.id || `sent-${Date.now()}`;
    const now = new Date();

    // Store in DB and emit to frontend immediately (don't wait for Baileys event)
    const stored = await prisma.message.upsert({
      where: { groupId_waMessageId: { groupId, waMessageId } },
      update: {},
      create: {
        waMessageId,
        groupId,
        senderJid: 'me',
        senderName: 'You',
        content: text,
        mediaType: null,
        queueStatus: 'none',
        timestamp: now,
      },
    });

    emit(SOCKET_EVENTS.MESSAGE_NEW, {
      id: stored.id,
      waMessageId,
      groupId,
      senderJid: 'me',
      senderName: 'You',
      content: text,
      mediaType: null,
      fileName: null,
      fileSizeBytes: 0,
      thumbnail: null,
      cachePath: null,
      caption: null,
      queueStatus: 'none',
      forwarded: false,
      savedPath: null,
      error: null,
      timestamp: now.toISOString(),
    });

    res.json({ messageId: waMessageId });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
