import { config } from './config';
import { createApp } from './server';
import { initSocketServer } from './socket/index';
import { connectToWhatsApp } from './whatsapp/connection';
import { prisma } from './db';
import { DEFAULT_SETTINGS } from '@whatsapp-porter/shared';

async function seedSettings() {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value: JSON.stringify(value) },
    });
  }
}

async function main() {
  const { httpServer } = createApp();

  // Initialize Socket.io
  initSocketServer(httpServer);

  // Seed default settings
  await seedSettings();

  // Start HTTP server
  httpServer.listen(config.port, () => {
    console.log(`[Server] Backend running on http://localhost:${config.port}`);
  });

  // Connect to WhatsApp
  await connectToWhatsApp();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
