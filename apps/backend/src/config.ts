import 'dotenv/config';

export const config = {
  port: parseInt(process.env.BACKEND_PORT || '3001', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  authDir: './auth_info',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
};
