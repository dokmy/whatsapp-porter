import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import type { WASocket, ConnectionState } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { SOCKET_EVENTS } from '@whatsapp-porter/shared';
import type { ConnectionStatus } from '@whatsapp-porter/shared';
import { emit } from '../socket/emitter';
import { usePrismaAuthState } from './authStore';
import { logger } from '../utils/logger';
import { onGroupsDiscovered } from './groupDiscovery';
import { registerMessageHandler } from './messageHandler';

let sock: WASocket | null = null;
let currentStatus: ConnectionStatus = 'disconnected';

export function getWASocket(): WASocket | null {
  return sock;
}

export function getConnectionStatus(): { status: ConnectionStatus } {
  return { status: currentStatus };
}

function setStatus(status: ConnectionStatus) {
  currentStatus = status;
  emit(SOCKET_EVENTS.CONNECTION_STATUS, { status });
}

export async function connectToWhatsApp(): Promise<void> {
  const { state, saveCreds } = await usePrismaAuthState();
  const { version } = await fetchLatestBaileysVersion();

  setStatus('connecting');
  logger.info('Connecting to WhatsApp...', { version });

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, console),
    },
    generateHighQualityLinkPreview: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      setStatus('qr_pending');
      emit(SOCKET_EVENTS.CONNECTION_QR, { qr });
      logger.info('QR code generated — scan with WhatsApp');
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      setStatus('disconnected');
      logger.warn('Connection closed', { statusCode, shouldReconnect });

      if (shouldReconnect) {
        setTimeout(() => connectToWhatsApp(), 3000);
      } else {
        logger.info('Logged out. Clear session to reconnect.');
      }
    }

    if (connection === 'open') {
      setStatus('open');
      logger.info('Connected to WhatsApp');

      // Discover groups after connection
      if (sock) {
        try {
          await onGroupsDiscovered(sock);
        } catch (err) {
          logger.error('Failed to discover groups', { error: String(err) });
        }
      }
    }
  });

  // Register message handler for automation
  registerMessageHandler(sock);
}

export async function disconnectWhatsApp(): Promise<void> {
  if (sock) {
    await sock.logout();
    sock = null;
    setStatus('disconnected');
    logger.info('Disconnected from WhatsApp');
  }
}

export async function clearSession(): Promise<void> {
  if (sock) {
    await sock.logout();
    sock = null;
  }
  const { prisma } = await import('../db');
  await prisma.authState.deleteMany();
  setStatus('disconnected');
  logger.info('Session cleared — QR scan required');
}
