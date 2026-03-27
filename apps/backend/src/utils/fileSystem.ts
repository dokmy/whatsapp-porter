import fs from 'fs-extra';
import path from 'path';

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.ensureDir(dirPath);
}

export function sanitizePath(inputPath: string): string {
  const resolved = path.resolve(inputPath);
  // Prevent path traversal — must be absolute
  if (!path.isAbsolute(resolved)) {
    throw new Error(`Invalid path: ${inputPath}`);
  }
  return resolved;
}

export function buildFileName(originalName: string | undefined, ext: string, mediaType: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = originalName || mediaType;
  return `${timestamp}_${name}.${ext}`;
}

export async function saveFile(dirPath: string, fileName: string, buffer: Buffer): Promise<string> {
  const safePath = sanitizePath(dirPath);
  await ensureDir(safePath);
  const filePath = path.join(safePath, fileName);
  await fs.writeFile(filePath, buffer);
  return filePath;
}
