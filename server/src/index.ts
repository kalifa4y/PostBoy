import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import path from 'node:path';
import { initializeDatabase } from './db/init.js';
import { closeDatabase } from './db/connection.js';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import { healthRoutes } from './routes/health.js';
import { settingsRoutes } from './routes/settings.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { campaignRoutes } from './routes/campaigns.js';
import { videoRoutes } from './routes/videos.js';
import { publicationRoutes } from './routes/publications.js';
import { notificationsRoutes } from './routes/notifications.js';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || '127.0.0.1';
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

const projectRoot = path.basename(process.cwd()) === 'server'
  ? path.resolve(process.cwd(), '..')
  : process.cwd();
const uploadsDir = path.resolve(projectRoot, process.env.UPLOADS_DIR || './uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Initialisation de la base de données (Turso / LibSQL) au démarrage
await initializeDatabase();

const server = Fastify({
  logger: true
});

// Enregistrement CORS pour autoriser l'interface locale
await server.register(cors, {
  origin: [clientUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
});

// Support de l'upload multipart en streaming
await server.register(multipart, {
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1 Go maximum par vidéo
    files: 100 // Supporte des imports de 100 fichiers simultanés
  }
});

// Exposition statique sécurisée du dossier uploads pour prévisualisation HTML5
await server.register(fastifyStatic, {
  root: uploadsDir,
  prefix: '/uploads/'
});

// Enregistrement des routes API
await server.register(healthRoutes);
await server.register(settingsRoutes);
await server.register(dashboardRoutes);
await server.register(campaignRoutes);
await server.register(videoRoutes);
await server.register(publicationRoutes);
await server.register(notificationsRoutes);

// Gestion de l'arrêt gracieux
const handleShutdown = async (signal: string) => {
  server.log.info(`Signal ${signal} reçu, arrêt gracieux du serveur...`);
  try {
    await server.close();
    closeDatabase();
    process.exit(0);
  } catch (err) {
    server.log.error(err, "Erreur lors de l'arrêt");
    process.exit(1);
  }
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// Démarrage du serveur
try {
  await server.listen({ port, host });
  console.log(`[PostBoy Server] Prêt et à l'écoute sur http://${host}:${port}`);
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
