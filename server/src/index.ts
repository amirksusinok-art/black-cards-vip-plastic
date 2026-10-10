import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { initDatabase } from './db.js';
import { authMiddleware } from './auth.js';
import { apiRouter } from './routes.js';
import { setupTelegramBot } from './bot.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize Telegram Bot & Stars Webhook
setupTelegramBot(app);

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path.startsWith('/api')) {
      console.log(`[API] ${req.method} ${req.path} -> ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Protect all /api routes (except /api/health and /api/telegram/webhook) with auth middleware
app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path === '/telegram/webhook') {
    return next();
  }
  return authMiddleware(req as any, res, next);
}, apiRouter);

// Serve static frontend build
const clientDistPath = path.resolve(process.cwd(), 'client/dist');
app.use(express.static(clientDistPath));

// Fallback to index.html for SPA routing
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, error: 'Endpoint not found' });
  }
  const indexPath = path.join(clientDistPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
          <head><title>CardDrop</title></head>
          <body style="background:#08090C;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;">
            <div style="text-align:center;">
              <h2>CardDrop — Black Cards & VIP Plastic</h2>
              <p>Client build is initializing...</p>
            </div>
          </body>
        </html>
      `);
    }
  });
});

async function startServer() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`===============================================`);
      console.log(`CardDrop Server running on http://localhost:${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`===============================================`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
