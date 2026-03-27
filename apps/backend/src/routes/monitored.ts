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

  // Try to load message history for newly added groups
  const sock = getWASocket();
  if (sock) {
    for (const gid of ids) {
      try {
        // Request messages from WhatsApp for this chat
        // This triggers message history fetch for the specific chat
        const messages = await sock.fetchMessageHistory(50, { remoteJid: gid, fromMe: false, id: '' } as any, {});
        if (messages && messages.length > 0) {
          logger.info(`Loaded ${messages.length} history messages for group`, undefined, 'system');
        }
      } catch {
        // fetchMessageHistory may not be available in all Baileys versions
        // History will come through normal sync instead
      }
    }
  }

  res.status(201).json(results);
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
