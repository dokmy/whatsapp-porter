import { Router } from 'express';
import { prisma } from '../db';
import { forwardQueuedMessage, forwardAlbum } from '../automation/engine';

const router = Router();

// List queued media messages
router.get('/', async (req, res) => {
  const status = (req.query.status as string) || 'queued';
  const groupId = req.query.groupId as string | undefined;
  const sortBy = (req.query.sortBy as string) || 'recency'; // 'recency' | 'group'

  const where: Record<string, unknown> = { mediaType: { not: null } };
  if (status === 'all') {
    where.queueStatus = { not: 'none' };
  } else {
    where.queueStatus = status;
  }
  if (groupId) where.groupId = groupId;

  const orderBy = sortBy === 'group'
    ? [{ groupId: 'asc' as const }, { timestamp: 'desc' as const }]
    : [{ timestamp: 'desc' as const }];

  const messages = await prisma.message.findMany({
    where,
    include: { group: { select: { name: true } } },
    orderBy,
    take: 500,
  });

  res.json(messages);
});

// Update caption for a queued message
router.put('/:id/caption', async (req, res) => {
  const { caption } = req.body;
  const updated = await prisma.message.update({
    where: { id: req.params.id },
    data: { caption },
  });
  res.json({ id: updated.id, caption: updated.caption });
});

// Forward a single queued message
router.post('/:id/forward', async (req, res) => {
  try {
    const customCaption = req.body?.caption as string | undefined;
    await forwardQueuedMessage(req.params.id, customCaption);
    res.json({ message: 'Forwarded' });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Forward an entire album
router.post('/album/:albumId/forward', async (req, res) => {
  try {
    const customCaption = req.body?.caption as string | undefined;
    const count = await forwardAlbum(req.params.albumId, customCaption);
    res.json({ forwarded: count });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Dismiss a queued message
router.post('/:id/dismiss', async (req, res) => {
  await prisma.message.update({
    where: { id: req.params.id },
    data: { queueStatus: 'none' },
  });
  res.json({ message: 'Dismissed' });
});

// Dismiss an entire album
router.post('/album/:albumId/dismiss', async (req, res) => {
  await prisma.message.updateMany({
    where: { albumId: req.params.albumId },
    data: { queueStatus: 'none' },
  });
  res.json({ message: 'Album dismissed' });
});

export default router;
