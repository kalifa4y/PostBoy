import { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { getDatabase } from '../db/connection.js';

export interface VideoRow {
  id: string;
  filename: string;
  original_name: string;
  file_path: string;
  file_size: number;
  duration: number;
  mime_type: string;
  thumbnail_path: string | null;
  campaign_id: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  campaign_name?: string | null;
  campaign_color?: string | null;
}

export async function videoRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/videos - Liste des vidéos / sources locales référencées avec filtres
  fastify.get('/api/videos', async (request, reply) => {
    try {
      const db = getDatabase();
      const { campaign_id, status, search } = request.query as {
        campaign_id?: string;
        status?: string;
        search?: string;
      };

      let query = `
        SELECT 
          v.*,
          c.name as campaign_name,
          c.color as campaign_color
        FROM videos v
        LEFT JOIN campaigns c ON v.campaign_id = c.id
        WHERE 1=1
      `;
      const params: string[] = [];

      if (campaign_id) {
        if (campaign_id === 'unassigned') {
          query += ' AND v.campaign_id IS NULL';
        } else {
          query += ' AND v.campaign_id = ?';
          params.push(campaign_id);
        }
      }

      if (status && status !== 'all') {
        query += ' AND v.status = ?';
        params.push(status);
      }

      if (search && search.trim()) {
        query += ' AND (LOWER(v.original_name) LIKE ? OR LOWER(COALESCE(v.notes, \'\')) LIKE ?)';
        const term = `%${search.trim().toLowerCase()}%`;
        params.push(term, term);
      }

      query += ' ORDER BY v.created_at DESC';

      const videos = await db.all<VideoRow>(query, params);

      return reply.code(200).send({
        status: 'success',
        count: videos.length,
        videos
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur récupération des vidéos';
      fastify.log.error(error);
      return reply.code(500).send({ status: 'error', message });
    }
  });

  // GET /api/videos/:id - Détails d'une source vidéo
  fastify.get<{ Params: { id: string } }>('/api/videos/:id', async (request, reply) => {
    try {
      const db = getDatabase();
      const { id } = request.params;

      const video = await db.get<VideoRow>(`
        SELECT 
          v.*,
          c.name as campaign_name,
          c.color as campaign_color
        FROM videos v
        LEFT JOIN campaigns c ON v.campaign_id = c.id
        WHERE v.id = ?
      `, [id]);

      if (!video) {
        return reply.code(404).send({
          status: 'error',
          message: `Vidéo introuvable avec l'identifiant ${id}`
        });
      }

      return reply.code(200).send({
        status: 'success',
        video
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur consultation vidéo';
      fastify.log.error(error);
      return reply.code(500).send({ status: 'error', message });
    }
  });

  // POST /api/videos - Déclaration métadonnée d'une vidéo source locale
  fastify.post<{
    Body: {
      original_name: string;
      campaign_id?: string | null;
      notes?: string;
      file_path?: string;
    };
  }>('/api/videos', async (request, reply) => {
    try {
      const db = getDatabase();
      const { original_name, campaign_id, notes, file_path } = request.body || {};

      if (!original_name || typeof original_name !== 'string' || original_name.trim() === '') {
        return reply.code(400).send({
          status: 'error',
          message: 'Le nom de la vidéo source (original_name) est obligatoire.'
        });
      }

      const id = crypto.randomUUID();
      const name = original_name.trim();
      const pathValue = file_path && file_path.trim() !== '' ? file_path.trim() : name;
      const assignedCampaignId = campaign_id && campaign_id !== 'unassigned' && campaign_id.trim() !== ''
        ? campaign_id.trim()
        : null;

      await db.run(`
        INSERT INTO videos (
          id, filename, original_name, file_path, file_size, duration, mime_type,
          thumbnail_path, campaign_id, notes, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 0, 0, 'video/mp4', NULL, ?, ?, 'ready', datetime('now'), datetime('now'))
      `, [id, name, name, pathValue, assignedCampaignId, notes?.trim() || null]);

      const created = await db.get<VideoRow>(`
        SELECT v.*, c.name as campaign_name, c.color as campaign_color
        FROM videos v
        LEFT JOIN campaigns c ON v.campaign_id = c.id
        WHERE v.id = ?
      `, [id]);

      return reply.code(201).send({
        status: 'success',
        message: 'Source vidéo enregistrée avec succès',
        video: created
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur déclaration vidéo';
      fastify.log.error(error);
      return reply.code(500).send({ status: 'error', message });
    }
  });

  // PUT /api/videos/:id - Mise à jour d'une source vidéo (campagne ou notes)
  fastify.put<{ Params: { id: string }; Body: { campaign_id?: string | null; notes?: string; status?: string } }>(
    '/api/videos/:id',
    async (request, reply) => {
      try {
        const db = getDatabase();
        const { id } = request.params;
        const { campaign_id, notes, status } = request.body || {};

        const existing = await db.get<{ id: string }>('SELECT id FROM videos WHERE id = ?', [id]);
        if (!existing) {
          return reply.code(404).send({
            status: 'error',
            message: `Vidéo introuvable avec l'identifiant ${id}`
          });
        }

        const updates: string[] = [];
        const params: any[] = [];

        if (campaign_id !== undefined) {
          updates.push('campaign_id = ?');
          params.push(campaign_id === 'unassigned' || campaign_id === '' ? null : campaign_id);
        }
        if (notes !== undefined) {
          updates.push('notes = ?');
          params.push(notes);
        }
        if (status !== undefined) {
          updates.push('status = ?');
          params.push(status);
        }

        updates.push("updated_at = datetime('now')");
        params.push(id);

        await db.run(`UPDATE videos SET ${updates.join(', ')} WHERE id = ?`, params);

        const updated = await db.get<VideoRow>(`
          SELECT v.*, c.name as campaign_name, c.color as campaign_color
          FROM videos v
          LEFT JOIN campaigns c ON v.campaign_id = c.id
          WHERE v.id = ?
        `, [id]);

        return reply.code(200).send({
          status: 'success',
          message: 'Vidéo mise à jour avec succès',
          video: updated
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erreur mise à jour vidéo';
        fastify.log.error(error);
        return reply.code(500).send({ status: 'error', message });
      }
    }
  );

  // DELETE /api/videos/:id - Suppression protégée d'une source vidéo de la base SQLite
  fastify.delete<{ Params: { id: string } }>('/api/videos/:id', async (request, reply) => {
    try {
      const db = getDatabase();
      const { id } = request.params;

      const video = await db.get<{ id: string; filename: string; original_name: string }>('SELECT id, filename, original_name FROM videos WHERE id = ?', [id]);
      if (!video) {
        return reply.code(404).send({
          status: 'error',
          message: `Vidéo introuvable avec l'identifiant ${id}`
        });
      }

      // Garde-fou essentiel : vérifier si des publications sont rattachées à cette vidéo
      const pubCountRow = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM publications WHERE video_id = ?', [id]);
      if (pubCountRow && pubCountRow.count > 0) {
        return reply.code(400).send({
          status: 'error',
          message: `Impossible de supprimer la vidéo "${video.original_name}" car ${pubCountRow.count} publication(s) lui sont actuellement associées. Supprimez d'abord les publications associées.`
        });
      }

      // Suppression dans la base
      await db.run('DELETE FROM videos WHERE id = ?', [id]);

      return reply.code(200).send({
        status: 'success',
        message: `Vidéo "${video.original_name}" supprimée avec succès.`
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur suppression vidéo';
      fastify.log.error(error);
      return reply.code(500).send({ status: 'error', message });
    }
  });
}
