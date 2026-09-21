import { FastifyInstance } from 'fastify';
import { getDatabase } from '../db/connection.js';

interface UpdateSettingsBody {
  timezone?: string;
  auto_publish_enabled?: string;
  email_notifications_enabled?: string;
  smtp_host?: string;
  smtp_port?: string;
  smtp_user?: string;
  smtp_pass?: string;
  notification_email?: string;
}

export async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/settings - Récupère tous les paramètres (mot de passe masqué)
  fastify.get('/api/settings', async (_request, reply) => {
    try {
      const db = getDatabase();
      const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
      
      const settingsMap: Record<string, string> = {};
      for (const row of rows) {
        if (row.key === 'smtp_pass') {
          // Masquage sécurisé du mot de passe
          settingsMap[row.key] = row.value ? '••••••••' : '';
        } else {
          settingsMap[row.key] = row.value;
        }
      }

      return reply.code(200).send({
        status: 'success',
        settings: settingsMap
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la récupération des paramètres';
      return reply.code(500).send({
        status: 'error',
        message
      });
    }
  });

  // PUT /api/settings - Met à jour les paramètres
  fastify.put<{ Body: UpdateSettingsBody }>('/api/settings', async (request, reply) => {
    try {
      const db = getDatabase();
      const updates = request.body || {};

      const upsertStmt = db.prepare(`
        INSERT INTO settings (key, value, updated_at) 
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET 
          value = excluded.value, 
          updated_at = excluded.updated_at
      `);

      for (const [key, val] of Object.entries(updates)) {
        if (val !== undefined) {
          // Si le mot de passe est '••••••••', on ne l'écrase pas
          if (key === 'smtp_pass' && val === '••••••••') {
            continue;
          }
          upsertStmt.run(key, String(val));
        }
      }

      return reply.code(200).send({
        status: 'success',
        message: 'Paramètres mis à jour avec succès'
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la mise à jour des paramètres';
      return reply.code(500).send({
        status: 'error',
        message
      });
    }
  });
}
