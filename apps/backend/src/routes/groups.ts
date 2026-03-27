import { Router } from 'express';
import { prisma } from '../db';
import { getWASocket } from '../whatsapp/connection';
import { refreshGroups } from '../whatsapp/groupDiscovery';

const router = Router();

router.get('/', async (req, res) => {
  const search = req.query.search as string | undefined;
  const groups = await prisma.group.findMany({
    where: search
      ? { name: { contains: search } }
      : undefined,
    orderBy: { name: 'asc' },
  });
  res.json(groups);
});

router.post('/refresh', async (_req, res) => {
  const sock = getWASocket();
  if (!sock) {
    return res.status(400).json({ error: 'Not connected to WhatsApp' });
  }
  try {
    await refreshGroups(sock);
    const groups = await prisma.group.findMany({ orderBy: { name: 'asc' } });
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
