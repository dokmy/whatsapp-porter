export type MediaType = 'image' | 'video' | 'audio' | 'document';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'qr_pending' | 'open';

export type QueueStatus = 'none' | 'queued' | 'forwarding' | 'forwarded' | 'failed';

export interface Group {
  id: string;
  name: string;
  participantCount: number;
  pictureUrl?: string | null;
}

export interface MonitoredGroup {
  id: string;
  groupId: string;
  group: Group;
  savePath: string;
  enabled: boolean;
}

export interface ChatMessage {
  id: string;
  waMessageId: string;
  groupId: string;
  senderJid: string;
  senderName: string;
  content: string;
  mediaType: MediaType | null;
  fileName: string | null;
  fileSizeBytes: number;
  thumbnail: string | null;
  cachePath: string | null;
  albumId: string | null;
  caption: string | null;
  queueStatus: QueueStatus;
  forwarded: boolean;
  savedPath: string | null;
  error: string | null;
  timestamp: string;
}

export interface LogEntry {
  id: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  eventType: string;
  context?: Record<string, unknown>;
  createdAt: string;
}

export interface Settings {
  jitterMinMs: number;
  jitterMaxMs: number;
  globalMaxFileSizeMB: number;
  defaultSavePath: string;
  logRetentionDays: number;
  autoReconnect: boolean;
  maxConcurrentDownloads: number;
  destinationGroupId: string;
}

export interface LogStats {
  totalForwarded: number;
  totalMessages: number;
}
