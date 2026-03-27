import { Router } from 'express';
import { prisma } from '../db';

const router = Router();

// Get messages for a group (paginated, newest first)
router.get('/:groupId', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  const before = req.query.before as string | undefined;

  const where: Record<string, unknown> = { groupId: req.params.groupId };
  if (before) {
    where.timestamp = { lt: new Date(before) };
  }

  const messages = await prisma.message.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: limit,
  });

  // Return in chronological order
  res.json(messages.reverse());
});

export default router;
