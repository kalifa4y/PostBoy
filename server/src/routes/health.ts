import { FastifyInstance } from 'fastify';
import { getDatabase } from '../db/connection.js';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/health', async (_request, reply) => {
    try {
      const db = getDatabase();
      const testQuery = await db.get<{ alive: number }>('SELECT 1 as alive');
      
      const tablesResult = await db.all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
      );
      
      const tzRow = await db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'timezone'");

      return reply.code(200).send({
        status: 'ok',
        service: 'PostBoy API',
        version: '0.1.0',
        timestamp: new Date().toISOString(),
        database: testQuery?.alive === 1 ? 'connected' : 'error',
        activeTimezone: tzRow?.value || 'Africa/Bamako',
        tablesCount: tablesResult.length,
        tables: tablesResult.map(t => t.name)
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur interne inconnue';
      return reply.code(500).send({
        status: 'error',
        service: 'PostBoy API',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        error: message
      });
    }
  });
}
