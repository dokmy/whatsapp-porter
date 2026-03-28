export const SOCKET_EVENTS = {
  CONNECTION_STATUS: 'connection:status',
  CONNECTION_QR: 'connection:qr',
  CONNECTION_REQUEST_STATUS: 'connection:request-status',
  LOG_ENTRY: 'log:entry',
  MEDIA_PROCESSING: 'media:processing',
  MEDIA_COMPLETED: 'media:completed',
  GROUPS_UPDATED: 'groups:updated',
  MESSAGE_NEW: 'message:new',
  QUEUE_UPDATE: 'queue:update',
  STATS_UPDATE: 'stats:update',
} as const;

export const MEDIA_TYPES = ['image', 'video', 'audio', 'document'] as const;

export const DEFAULT_SETTINGS = {
  jitterMinMs: 2000,
  jitterMaxMs: 5000,
  globalMaxFileSizeMB: 100,
  defaultSavePath: './media',
  logRetentionDays: 30,
  autoReconnect: true,
  maxConcurrentDownloads: 2,
} as const;

export const CAPTION_TEMPLATES = [
  `📍 Source: {groupName}\n👤 From: {sender}\n📝 Original Caption: {originalCaption}`,
  `From {groupName}\nSent by: {sender}\n{originalCaption}`,
  `{groupName} — {sender}\n{originalCaption}`,
];

export const DEFAULT_CAPTION_TEMPLATE = CAPTION_TEMPLATES[0];
