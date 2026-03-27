import { z } from 'zod';

export const mediaTypeSchema = z.enum(['image', 'video', 'audio', 'document']);

export const settingsUpdateSchema = z.object({
  jitterMinMs: z.number().int().min(0).max(30000).optional(),
  jitterMaxMs: z.number().int().min(0).max(60000).optional(),
  globalMaxFileSizeMB: z.number().int().positive().max(2048).optional(),
  defaultSavePath: z.string().min(1).optional(),
  logRetentionDays: z.number().int().positive().max(365).optional(),
  autoReconnect: z.boolean().optional(),
  maxConcurrentDownloads: z.number().int().min(1).max(10).optional(),
  destinationGroupId: z.string().optional(),
  aiSystemPrompt: z.string().optional(),
  jarvisSystemPrompt: z.string().optional(),
});
