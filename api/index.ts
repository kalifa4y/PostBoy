import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from '../server/src/app.js';
import type { FastifyInstance } from 'fastify';

let appPromise: Promise<FastifyInstance> | null = null;

async function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = buildApp().then(async (app) => {
      await app.ready();
      return app;
    });
  }
  return appPromise;
}

/**
 * Point d'entrée Serverless Function pour Vercel.
 * Redirige les requêtes HTTP Node.js vers l'instance Fastify en réutilisant l'application préparée.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await getApp();
  app.server.emit('request', req, res);
}
