import { prisma } from '../db';
import { DEFAULT_SETTINGS } from '@whatsapp-porter/shared';

export async function applyJitter(): Promise<void> {
  let minMs = DEFAULT_SETTINGS.jitterMinMs;
  let maxMs = DEFAULT_SETTINGS.jitterMaxMs;

  try {
    const minSetting = await prisma.setting.findUnique({ where: { key: 'jitterMinMs' } });
    const maxSetting = await prisma.setting.findUnique({ where: { key: 'jitterMaxMs' } });
    if (minSetting) minMs = parseInt(minSetting.value, 10);
    if (maxSetting) maxMs = parseInt(maxSetting.value, 10);
  } catch {
    // Use defaults
  }

  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await new Promise((resolve) => setTimeout(resolve, delay));
}
