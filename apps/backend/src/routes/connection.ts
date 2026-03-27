import { Router } from 'express';
import {
  getConnectionStatus,
  connectToWhatsApp,
  disconnectWhatsApp,
  clearSession,
} from '../whatsapp/connection';

const router = Router();

router.get('/status', (_req, res) => {
  res.json(getConnectionStatus());
});

router.post('/reconnect', async (_req, res) => {
  try {
    await connectToWhatsApp();
    res.json({ message: 'Reconnecting...' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/disconnect', async (_req, res) => {
  try {
    await disconnectWhatsApp();
    res.json({ message: 'Disconnected' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/session', async (_req, res) => {
  try {
    await clearSession();
    res.json({ message: 'Session cleared' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
