import { Router } from 'express';
import { prisma } from '../db';
import { settingsUpdateSchema, DEFAULT_SETTINGS } from '@whatsapp-porter/shared';

const router = Router();

router.get('/', async (_req, res) => {
  const rows = await prisma.setting.findMany();
  const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS };

  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }

  res.json(settings);
});

router.put('/', async (req, res) => {
  const parsed = settingsUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const updates = parsed.data;

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      await prisma.setting.upsert({
        where: { key },
        update: { value: JSON.stringify(value) },
        create: { key, value: JSON.stringify(value) },
      });
    }
  }

  // Return updated settings
  const rows = await prisma.setting.findMany();
  const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }

  res.json(settings);
});

export default router;
