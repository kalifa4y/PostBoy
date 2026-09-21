import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import path from 'node:path';
import { initializeDatabase } from './db/init.js';
import { closeDatabase } from './db/connection.js';
import { healthRoutes } from './routes/health.js';
import { settingsRoutes } from './routes/settings.js';
import { dashboardRoutes } from './routes/dashboard.js';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || '127.0.0.1';
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

// Initialisation de la base SQLite au démarrage
initializeDatabase();

const server = Fastify({
  logger: true
});

// Enregistrement CORS pour autoriser l'interface locale
await server.register(cors, {
  origin: [clientUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
});

// Enregistrement des routes API
await server.register(healthRoutes);
await server.register(settingsRoutes);
await server.register(dashboardRoutes);

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
