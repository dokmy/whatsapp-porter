import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer } from 'http';
import { config } from './config';
import apiRoutes from './routes/index';

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.frontendUrl }));
  app.use(express.json());

  app.use('/api', apiRoutes);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Serve static frontend build (Next.js export)
  const frontendDir = path.join(__dirname, '..', '..', 'frontend', 'out');
  app.use(express.static(frontendDir));

  // SPA fallback — serve index.html for all non-API routes
  app.get('*', (_req, res) => {
    const indexPath = path.join(frontendDir, 'index.html');
    res.sendFile(indexPath, (err) => {
      if (err) {
        res.status(404).json({ error: 'Frontend not built. Run: npm run build' });
      }
    });
  });

  const httpServer = createServer(app);
  return { app, httpServer };
}
