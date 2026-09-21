import { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import crypto from 'node:crypto';
import { getDatabase } from '../db/connection.js';

interface VideoRow {
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

const ALLOWED_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.avi', '.mkv']);
const ALLOWED_MIME_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'video/x-matroska',
  'application/octet-stream' // Cas où le navigateur ne transmet pas le MIME précis
]);

/**
 * Obtient le chemin absolu du dossier uploads par rapport à la racine du projet.
 */
function getUploadsDir(): string {
  const projectRoot = path.basename(process.cwd()) === 'server'
    ? path.resolve(process.cwd(), '..')
    : process.cwd();
  
  const rawDir = process.env.UPLOADS_DIR || './uploads';
  const uploadsDir = path.isAbsolute(rawDir) ? rawDir : path.resolve(projectRoot, rawDir);

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  return uploadsDir;
}

export async function videoRoutes(fastify: FastifyInstance): Promise<void> {
  const uploadsDir = getUploadsDir();

  // GET /api/videos - Liste des vidéos avec filtres
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
        query += ' AND (LOWER(v.original_name) LIKE ? OR LOWER(v.notes) LIKE ?)';
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

  // GET /api/videos/:id - Détails d'une vidéo
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

  // POST /api/videos/upload - Upload en streaming (unique ou multiple)
  fastify.post('/api/videos/upload', async (request, reply) => {
    try {
      const db = getDatabase();
      const parts = request.files();
      
      const { campaign_id: queryCampaignId } = request.query as { campaign_id?: string };
      let defaultCampaignId: string | null = queryCampaignId && queryCampaignId !== 'unassigned' ? queryCampaignId : null;

      const uploaded: VideoRow[] = [];
      const failed: Array<{ filename: string; reason: string }> = [];

      for await (const part of parts) {
        const originalName = part.filename || 'unnamed_video.mp4';
        const ext = path.extname(originalName).toLowerCase();
        const mimeType = part.mimetype || 'video/mp4';

        // 1. Validation de l'extension
        if (!ALLOWED_EXTENSIONS.has(ext)) {
          failed.push({
            filename: originalName,
            reason: `Format non supporté (${ext}). Formats acceptés : .mp4, .mov, .webm, .avi, .mkv`
          });
          // Vider le flux pour ne pas bloquer les fichiers suivants
          part.file.resume();
          continue;
        }

        // 2. Validation du type MIME
        if (!ALLOWED_MIME_TYPES.has(mimeType)) {
          failed.push({
            filename: originalName,
            reason: `Type MIME non valide (${mimeType}).`
          });
          part.file.resume();
          continue;
        }

        // 3. Génération d'un nom de stockage sécurisé (anti-collision et anti-path-traversal)
        const id = crypto.randomUUID();
        const safeFilename = `vid_${id}${ext}`;
        const targetPath = path.join(uploadsDir, safeFilename);

        // Vérification de sécurité supplémentaire sur le chemin de destination
        if (!targetPath.startsWith(uploadsDir)) {
          failed.push({
            filename: originalName,
            reason: 'Tentative de chemin invalide (Path Traversal détecté).'
          });
          part.file.resume();
          continue;
        }

        // 4. Écriture directe en streaming sur disque
        try {
          const writeStream = fs.createWriteStream(targetPath);
          await pipeline(part.file, writeStream);

          // Récupération de la taille réelle du fichier écrit
          const stats = fs.statSync(targetPath);

          // Validation taille minimum (rejeter les fichiers complètement vides de 0 octet)
          if (stats.size === 0) {
            fs.unlinkSync(targetPath);
            failed.push({
              filename: originalName,
              reason: 'Fichier vide (0 octet).'
            });
            continue;
          }

          // Récupération du campaign_id associé aux champs du formulaire si présent
          const fields = part.fields as Record<string, { value: string }> | undefined;
          const assignedCampaignId = fields?.campaign_id?.value || defaultCampaignId;

          // 5. Enregistrement dans SQLite
          await db.run(`
            INSERT INTO videos (
              id, filename, original_name, file_path, file_size, duration, mime_type, 
              thumbnail_path, campaign_id, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?, 'ready', datetime('now'), datetime('now'))
          `, [id, safeFilename, originalName, `/uploads/${safeFilename}`, stats.size, mimeType, assignedCampaignId]);

          const savedVideo = await db.get<VideoRow>(`
            SELECT v.*, c.name as campaign_name, c.color as campaign_color
            FROM videos v
            LEFT JOIN campaigns c ON v.campaign_id = c.id
            WHERE v.id = ?
          `, [id]);

          if (savedVideo) {
            uploaded.push(savedVideo);
          }
        } catch (streamErr: unknown) {
          // En cas d'erreur de flux, nettoyer le fichier partiel
          if (fs.existsSync(targetPath)) {
            try { fs.unlinkSync(targetPath); } catch {}
          }
          const msg = streamErr instanceof Error ? streamErr.message : 'Erreur d\'écriture disque';
          failed.push({
            filename: originalName,
            reason: `Erreur d'écriture : ${msg}`
          });
        }
      }

      return reply.code(200).send({
        status: 'success',
        uploadedCount: uploaded.length,
        failedCount: failed.length,
        uploaded,
        failed
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur upload de vidéos';
      fastify.log.error(error);
      return reply.code(500).send({ status: 'error', message });
    }
  });

  // PUT /api/videos/:id - Mise à jour d'une vidéo (campagne ou notes)
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

  // DELETE /api/videos/:id - Suppression protégée d'une vidéo et de son fichier disque
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

      // 1. Suppression du fichier physique dans uploads
      const physicalPath = path.join(uploadsDir, video.filename);
      if (fs.existsSync(physicalPath)) {
        try {
          fs.unlinkSync(physicalPath);
        } catch (unlinkErr) {
          fastify.log.warn(unlinkErr, `Avertissement: Impossible d'effacer le fichier physique ${physicalPath}`);
        }
      }

      // 2. Suppression dans la base
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
