import { buildApp } from './app.js';
import { closeDatabase } from './db/connection.js';

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || '127.0.0.1';

const server = await buildApp();

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

// Démarrage du serveur local
try {
  await server.listen({ port, host });
  console.log(`[PostBoy Server] Prêt et à l'écoute sur http://${host}:${port}`);
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
