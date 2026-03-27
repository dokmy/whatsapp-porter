import { prisma } from '../db';
import { emit } from '../socket/emitter';
import { SOCKET_EVENTS } from '@whatsapp-porter/shared';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';
type EventType = 'download' | 'save' | 'forward' | 'queue' | 'system' | 'error';

async function writeLog(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
  eventType: EventType = 'system'
) {
  const contextStr = context ? JSON.stringify(context) : null;
  const now = new Date();

  try {
    const entry = await prisma.logEntry.create({
      data: { level, message, eventType, context: contextStr, createdAt: now },
    });

    emit(SOCKET_EVENTS.LOG_ENTRY, {
      id: entry.id,
      level,
      message,
      eventType,
      context,
      createdAt: now.toISOString(),
    });
  } catch {
    // DB not ready yet
  }

  const prefix = `[${level.toUpperCase()}]`;
  if (level === 'error') {
    console.error(prefix, message, context || '');
  } else if (level === 'warn') {
    console.warn(prefix, message, context || '');
  } else {
    console.log(prefix, message, context || '');
  }
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>, eventType?: EventType) =>
    writeLog('info', message, context, eventType),
  warn: (message: string, context?: Record<string, unknown>, eventType?: EventType) =>
    writeLog('warn', message, context, eventType),
  error: (message: string, context?: Record<string, unknown>, eventType?: EventType) =>
    writeLog('error', message, context, eventType || 'error'),
  debug: (message: string, context?: Record<string, unknown>, eventType?: EventType) =>
    writeLog('debug', message, context, eventType),
};
