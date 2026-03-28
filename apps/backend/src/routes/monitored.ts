import { Router } from 'express';
import { prisma } from '../db';
import { getWASocket } from '../whatsapp/connection';
import { logger } from '../utils/logger';

const router = Router();

router.get('/', async (_req, res) => {
  const monitored = await prisma.monitoredGroup.findMany({
    include: { group: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(monitored);
});

// Add one or more groups to monitor
router.post('/', async (req, res) => {
  const { groupId, groupIds, savePath } = req.body;
  const ids: string[] = groupIds || (groupId ? [groupId] : []);
  if (ids.length === 0) return res.status(400).json({ error: 'groupId or groupIds required' });

  const results = [];
  for (const gid of ids) {
    const existing = await prisma.monitoredGroup.findUnique({ where: { groupId: gid } });
    if (existing) continue;

    const monitored = await prisma.monitoredGroup.create({
      data: { groupId: gid, savePath: savePath || '' },
      include: { group: true },
    });
    results.push(monitored);
  }

  // Request message history from WhatsApp for newly added groups
  const sock = getWASocket();
  if (sock) {
    for (const gid of ids) {
      try {
        // Request on-demand history sync for this chat
        // We use a dummy anchor — earliest possible message
        await sock.fetchMessageHistory(50, {
          remoteJid: gid,
          fromMe: false,
          id: '',
        }, 0);
        logger.info(`Requested history for group ${gid}`, undefined, 'system');
      } catch (err) {
        logger.debug(`History fetch not available: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  res.status(201).json(results);
});

// Manual history load for a group
router.post('/:groupId/load-history', async (req, res) => {
  const sock = getWASocket();
  if (!sock) return res.status(400).json({ error: 'Not connected' });

  try {
    // Check if we have any existing messages to use as anchor
    const oldest = await prisma.message.findFirst({
      where: { groupId: req.params.groupId },
      orderBy: { timestamp: 'asc' },
    });

    await sock.fetchMessageHistory(50, {
      remoteJid: req.params.groupId,
      fromMe: false,
      id: oldest?.waMessageId || '',
    }, oldest ? Math.floor(new Date(oldest.timestamp).getTime() / 1000) : 0);

    res.json({ message: 'History request sent. Messages will appear shortly.' });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.put('/:groupId', async (req, res) => {
  const { savePath, enabled } = req.body;
  const data: Record<string, unknown> = {};
  if (savePath !== undefined) data.savePath = savePath;
  if (enabled !== undefined) data.enabled = enabled;

  const monitored = await prisma.monitoredGroup.update({
    where: { groupId: req.params.groupId },
    data,
    include: { group: true },
  });
  res.json(monitored);
});

router.delete('/:groupId', async (req, res) => {
  await prisma.monitoredGroup.delete({ where: { groupId: req.params.groupId } });
  res.json({ message: 'Removed' });
});

export default router;
