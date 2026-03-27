import { Router } from 'express';
import connectionRoutes from './connection';
import groupRoutes from './groups';
import monitoredRoutes from './monitored';
import messageRoutes from './messages';
import queueRoutes from './queue';
import logRoutes from './logs';
import settingsRoutes from './settings';
import sendRoutes from './send';
import aiRoutes from './ai';

const router = Router();

router.use('/connection', connectionRoutes);
router.use('/groups', groupRoutes);
router.use('/monitored', monitoredRoutes);
router.use('/messages', messageRoutes);
router.use('/queue', queueRoutes);
router.use('/logs', logRoutes);
router.use('/settings', settingsRoutes);
router.use('/send', sendRoutes);
router.use('/ai', aiRoutes);

export default router;
