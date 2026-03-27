import { Router } from 'express';
import { prisma } from '../db';

const router = Router();

router.get('/', async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const level = req.query.level as string | undefined;
  const eventType = req.query.eventType as string | undefined;

  const where: Record<string, unknown> = {};
  if (level) where.level = level;
  if (eventType) where.eventType = eventType;

  const [logs, total] = await Promise.all([
    prisma.logEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.logEntry.count({ where }),
  ]);

  res.json({
    logs: logs.map((l) => ({
      ...l,
      context: l.context ? JSON.parse(l.context) : null,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

router.delete('/', async (_req, res) => {
  await prisma.logEntry.deleteMany();
  res.json({ message: 'Logs cleared' });
});

export default router;
