import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import { createOcpiRouter } from './src/server/ocpiRouter.js';
import { createAdminRouter } from './src/server/adminRouter.js';
import { OcppServer } from './src/server/ocppServer.js';
import { dataStore } from './src/server/dataStore.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Attach WebSocketServer to the HTTP server
const wss = new WebSocketServer({ server });
const ocppServer = new OcppServer(wss);

// Mount standard OCPI 2.2 / 2.0 routes at /ocpi wired directly to CSMS and chargers
const ocpiRouterInstance = createOcpiRouter(ocppServer);
app.use(['/ocpi', '/EV_Charging/ocpi', '/cpo'], ocpiRouterInstance);

// Mount Admin & Management API at /api
app.use('/api', createAdminRouter(ocppServer));

// Requirement 17: in / home page simple <p> tag with text satmat ev
app.get(['/', '/index.php', '/index.html'], (req, res, next) => {
  if (req.path === '/' || req.path === '/index.php' || req.path === '/index.html') {
    res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    return res.send('<p>satmat ev</p>');
  }
  next();
});

// Public endpoint for general health and info
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    project: 'SATMAT EV',
    domain: 'https://evcharger.satmatgroup.com/',
    time: new Date().toISOString()
  });
});

async function startServer() {
  try {
    await dataStore.initDb();
  } catch (err: any) {
    console.warn('[Server] Database initialization note:', err.message);
  }

  const isProd = process.env.NODE_ENV === 'production';
  const distPath = path.resolve(process.cwd(), 'dist');
  const distIndex = path.join(distPath, 'index.html');

  if (isProd && fs.existsSync(distIndex)) {
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/ocpi')) {
        return next();
      }
      res.sendFile(distIndex);
    });
  } else {
    // Development or production fallback when dist has not been pre-built
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: ['evcharger.satmatgroup.com', 'localhost', '.satmatgroup.com'],
        hmr: process.env.DISABLE_HMR !== 'true'
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`⚡ SATMAT EV Server running on http://0.0.0.0:${PORT}`);
    console.log(`🔌 WebSocket OCPP Endpoint: ws://localhost:${PORT}/ocpp/:machineId`);
    console.log(`🌐 Production Domain: https://evcharger.satmatgroup.com`);
    console.log(`🚗 OCPI Base URL: https://evcharger.satmatgroup.com/ocpi`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting SATMAT EV server:', err);
  process.exit(1);
});
