import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import path from 'node:path';
import dotenv from 'dotenv';
import { initializeDatabase } from './db/init.js';
import { healthRoutes } from './routes/health.js';
import { settingsRoutes } from './routes/settings.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { campaignRoutes } from './routes/campaigns.js';
import { videoRoutes } from './routes/videos.js';
import { publicationRoutes } from './routes/publications.js';
import { notificationsRoutes } from './routes/notifications.js';
import { cronRoutes } from './routes/cron.js';

/**
 * Construit et configure l'application Fastify avec tous ses plugins et routes.
 * Utilisable aussi bien en serveur autonome local (src/index.ts)
 * qu'en fonction serverless Vercel (api/index.ts).
 */
export async function buildApp(): Promise<FastifyInstance> {
  const projectRoot = path.basename(process.cwd()) === 'server'
    ? path.resolve(process.cwd(), '..')
    : process.cwd();

  dotenv.config({ path: path.resolve(projectRoot, '.env') });
  dotenv.config();

  // Initialisation sécurisée de la base de données (Turso / LibSQL)
  await initializeDatabase();

  const server = Fastify({
    logger: process.env.NODE_ENV !== 'test'
  });

  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

  // Configuration CORS pour le développement local et la production Vercel
  await server.register(cors, {
    origin: [
      clientUrl,
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'https://pbplan.vercel.app',
      'https://postboy.vercel.app',
      'https://postboy-inky.vercel.app',
      'https://postboy-kalifas-projects.vercel.app'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
  });

  // Enregistrement de toutes les routes API
  await server.register(healthRoutes);
  await server.register(settingsRoutes);
  await server.register(dashboardRoutes);
  await server.register(campaignRoutes);
  await server.register(videoRoutes);
  await server.register(publicationRoutes);
  await server.register(notificationsRoutes);
  await server.register(cronRoutes);

  return server;
}
