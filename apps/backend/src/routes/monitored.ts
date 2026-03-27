import { Router } from 'express';
import { prisma } from '../db';

const router = Router();

// List monitored groups
router.get('/', async (_req, res) => {
  const monitored = await prisma.monitoredGroup.findMany({
    include: { group: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(monitored);
});

// Add a group to monitor
router.post('/', async (req, res) => {
  const { groupId, savePath } = req.body;
  if (!groupId) return res.status(400).json({ error: 'groupId is required' });

  const existing = await prisma.monitoredGroup.findUnique({ where: { groupId } });
  if (existing) return res.status(409).json({ error: 'Group already monitored' });

  const monitored = await prisma.monitoredGroup.create({
    data: { groupId, savePath: savePath || '' },
    include: { group: true },
  });
  res.status(201).json(monitored);
});

// Update a monitored group (save path, enabled)
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

// Remove a group from monitoring
router.delete('/:groupId', async (req, res) => {
  await prisma.monitoredGroup.delete({ where: { groupId: req.params.groupId } });
  res.json({ message: 'Removed' });
});

export default router;
