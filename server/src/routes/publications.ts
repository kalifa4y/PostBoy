import { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { emailService } from '../services/emailService.js';

export const ALLOWED_PLATFORMS = ['tiktok', 'instagram', 'youtube'] as const;
export type AllowedPlatform = typeof ALLOWED_PLATFORMS[number];

export const ALLOWED_STATUSES = ['draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'] as const;
export type AllowedStatus = typeof ALLOWED_STATUSES[number];

export interface PublicationRow {
  id: string;
  video_id: string;
  campaign_id: string | null;
  platform: AllowedPlatform;
  title: string;
  caption: string | null;
  description?: string | null;
  hashtags?: string | null;
  tags?: string | null;
  notes?: string | null;
  status: AllowedStatus;
  scheduled_at: string | null;
  published_at: string | null;
  post_url: string | null;
  external_url?: string | null;
  error_message: string | null;
  is_overdue?: boolean;
  copy_text?: string;
  created_at: string;
  updated_at: string;
  campaign_name: string | null;
  campaign_color: string | null;
  video_original_name: string | null;
  video_filename: string | null;
  video_file_path: string | null;
  video_file_size: number | null;
  video_duration: number | null;
  video_thumbnail_path: string | null;
}

export function formatPublication(row: any): PublicationRow {
  const scheduledAt = row.scheduled_at;
  const isOverdue = row.status === 'scheduled' &&
    !!scheduledAt &&
    !isNaN(new Date(scheduledAt).getTime()) &&
    new Date(scheduledAt).getTime() < Date.now();

  const caption = row.caption || '';
  const hashtags = row.hashtags || row.tags || '';
  const copyText = [caption, hashtags].filter(Boolean).join('\n\n');
  const resolvedUrl = row.post_url ?? row.external_url ?? null;

  return {
    ...row,
    post_url: resolvedUrl,
    external_url: resolvedUrl,
    hashtags: row.hashtags ?? row.tags ?? null,
    tags: row.hashtags ?? row.tags ?? null,
    notes: row.notes ?? null,
    is_overdue: Boolean(isOverdue),
    copy_text: copyText
  };
}

export async function publicationRoutes(fastify: FastifyInstance): Promise<void> {
  // Helper pour récupérer une publication avec ses jointures
  const getPublicationWithDetails = async (id: string): Promise<PublicationRow | undefined> => {
    const db = getDatabase();
    const row = await db.get<any>(`
      SELECT 
        p.*,
        c.name as campaign_name,
        c.color as campaign_color,
        v.original_name as video_original_name,
        v.filename as video_filename,
        v.file_path as video_file_path,
        v.file_size as video_file_size,
        v.duration as video_duration,
        v.thumbnail_path as video_thumbnail_path
      FROM publications p
      LEFT JOIN campaigns c ON p.campaign_id = c.id
      LEFT JOIN videos v ON p.video_id = v.id
      WHERE p.id = ?
    `, [id]);

    if (!row) return undefined;
    return formatPublication(row);
  };

  // GET /api/publications - Liste des publications avec filtres et recherche
  fastify.get<{
    Querystring: {
      platform?: string;
      status?: string;
      campaign_id?: string;
      video_id?: string;
      search?: string;
      scheduled_only?: string;
      start_date?: string;
      end_date?: string;
    };
  }>('/api/publications', async (request, reply) => {
    try {
      const db = getDatabase();
      const { platform, status, campaign_id, video_id, search, scheduled_only, start_date, end_date } = request.query;

      const conditions: string[] = [];
      const params: Array<string | number | null> = [];

      if (platform && platform !== 'all') {
        conditions.push('p.platform = ?');
        params.push(platform.toLowerCase());
      }

      if (status && status !== 'all') {
        conditions.push('p.status = ?');
        params.push(status.toLowerCase());
      }

      if (campaign_id) {
        if (campaign_id === 'unassigned') {
          conditions.push('p.campaign_id IS NULL');
        } else if (campaign_id !== 'all') {
          conditions.push('p.campaign_id = ?');
          params.push(campaign_id);
        }
      }

      if (video_id) {
        conditions.push('p.video_id = ?');
        params.push(video_id);
      }

      if (scheduled_only === 'true' || scheduled_only === '1') {
        conditions.push("((p.scheduled_at IS NOT NULL AND TRIM(p.scheduled_at) != '') OR p.published_at IS NOT NULL)");
      }

      if (start_date && start_date.trim() !== '') {
        conditions.push("p.scheduled_at >= ?");
        params.push(start_date.trim());
      }

      if (end_date && end_date.trim() !== '') {
        conditions.push("p.scheduled_at <= ?");
        params.push(end_date.trim());
      }

      if (search && search.trim() !== '') {
        const queryPattern = `%${search.trim().toLowerCase()}%`;
        conditions.push(`(
          LOWER(p.title) LIKE ? OR 
          LOWER(COALESCE(p.caption, '')) LIKE ? OR 
          LOWER(COALESCE(p.hashtags, '')) LIKE ? OR 
          LOWER(COALESCE(v.original_name, '')) LIKE ? OR 
          LOWER(COALESCE(c.name, '')) LIKE ?
        )`);
        params.push(queryPattern, queryPattern, queryPattern, queryPattern, queryPattern);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const query = `
        SELECT 
          p.*,
          c.name as campaign_name,
          c.color as campaign_color,
          v.original_name as video_original_name,
          v.filename as video_filename,
          v.file_path as video_file_path,
          v.file_size as video_file_size,
          v.duration as video_duration,
          v.thumbnail_path as video_thumbnail_path
        FROM publications p
        LEFT JOIN campaigns c ON p.campaign_id = c.id
        LEFT JOIN videos v ON p.video_id = v.id
        ${whereClause}
        ORDER BY datetime(COALESCE(p.scheduled_at, p.created_at)) DESC
      `;

      const publications = await db.all<any>(query, params);
      const formattedPublications = publications.map(formatPublication);

      return reply.code(200).send({
        status: 'success',
        count: formattedPublications.length,
        publications: formattedPublications
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la récupération des publications';
      fastify.log.error(error);
      return reply.code(500).send({ status: 'error', message });
    }
  });

  // GET /api/publications/:id - Détail d'une publication
  fastify.get<{ Params: { id: string } }>('/api/publications/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const publication = await getPublicationWithDetails(id);

      if (!publication) {
        return reply.code(404).send({
          status: 'error',
          message: `Publication introuvable avec l'identifiant ${id}`
        });
      }

      return reply.code(200).send({
        status: 'success',
        publication
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la consultation de la publication';
      fastify.log.error(error);
      return reply.code(500).send({ status: 'error', message });
    }
  });

  // POST /api/publications - Création unitaire d'une publication (Workflow manuel)
  fastify.post<{
    Body: {
      video_id: string;
      platform: string;
      caption?: string;
      title?: string;
      hashtags?: string;
      tags?: string;
      notes?: string;
      campaign_id?: string | null;
      status?: string;
      scheduled_at?: string | null;
    };
  }>('/api/publications', async (request, reply) => {
    try {
      const db = getDatabase();
      const {
        video_id,
        platform,
        caption,
        title,
        hashtags,
        tags,
        notes,
        campaign_id,
        status = 'draft',
        scheduled_at
      } = request.body || {};

      // 1. Validation de la vidéo
      if (!video_id || typeof video_id !== 'string' || video_id.trim() === '') {
        return reply.code(400).send({
          status: 'error',
          message: 'L\'identifiant de la vidéo (video_id) est obligatoire.'
        });
      }

      const video = await db.get<{
        id: string;
        campaign_id: string | null;
        original_name: string;
      }>('SELECT id, campaign_id, original_name FROM videos WHERE id = ?', [video_id.trim()]);

      if (!video) {
        return reply.code(404).send({
          status: 'error',
          message: `Vidéo introuvable avec l'identifiant ${video_id}`
        });
      }

      // 2. Validation de la plateforme
      if (!platform || typeof platform !== 'string') {
        return reply.code(400).send({
          status: 'error',
          message: 'La plateforme est obligatoire.'
        });
      }

      const normalizedPlatform = platform.toLowerCase().trim() as AllowedPlatform;
      if (!ALLOWED_PLATFORMS.includes(normalizedPlatform)) {
        return reply.code(400).send({
          status: 'error',
          message: `Plateforme non autorisée "${platform}". Valeurs acceptées : ${ALLOWED_PLATFORMS.join(', ')}`
        });
      }

      // 3. Validation du statut
      const normalizedStatus = (status ? status.toLowerCase().trim() : 'draft') as AllowedStatus;
      if (!ALLOWED_STATUSES.includes(normalizedStatus)) {
        return reply.code(400).send({
          status: 'error',
          message: `Statut invalide "${status}". Valeurs acceptées : ${ALLOWED_STATUSES.join(', ')}`
        });
      }

      // 4. Campagne : hérite de la vidéo si non spécifié, ou vérifie existence si fourni
      let assignedCampaignId: string | null = null;
      if (campaign_id !== undefined) {
        if (campaign_id && typeof campaign_id === 'string' && campaign_id.trim() !== '' && campaign_id !== 'unassigned') {
          const campaignExists = await db.get<{ id: string }>('SELECT id FROM campaigns WHERE id = ?', [campaign_id.trim()]);
          if (!campaignExists) {
            return reply.code(400).send({
              status: 'error',
              message: `Campagne introuvable avec l'identifiant ${campaign_id}`
            });
          }
          assignedCampaignId = campaign_id.trim();
        } else {
          assignedCampaignId = null;
        }
      } else {
        assignedCampaignId = video.campaign_id;
      }

      // 5. Titre, caption, hashtags et notes
      const finalCaption = caption ? caption.trim() : '';
      const finalTitle = title && title.trim() !== ''
        ? title.trim()
        : (finalCaption ? finalCaption.split('\n')[0].slice(0, 100) : video.original_name);

      const rawHashtags = hashtags !== undefined ? hashtags : tags;
      const finalHashtags = rawHashtags && typeof rawHashtags === 'string' ? rawHashtags.trim() : null;
      const finalNotes = notes && typeof notes === 'string' ? notes.trim() : null;

      // 6. Date programmée
      let finalScheduledAt: string | null = null;
      if (scheduled_at && typeof scheduled_at === 'string' && scheduled_at.trim() !== '') {
        const parsed = new Date(scheduled_at.trim());
        if (isNaN(parsed.getTime())) {
          return reply.code(400).send({
            status: 'error',
            message: 'Format de date de programmation (scheduled_at) invalide.'
          });
        }
        finalScheduledAt = scheduled_at.trim();
      }

      // 7. Insertion atomique dans la base
      const id = crypto.randomUUID();
      await db.run(`
        INSERT INTO publications (
          id, video_id, campaign_id, platform, title, caption,
          hashtags, notes, status, scheduled_at, published_at,
          post_url, error_message, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, NULL,
          NULL, NULL, datetime('now'), datetime('now')
        )
      `, [
        id,
        video.id,
        assignedCampaignId,
        normalizedPlatform,
        finalTitle,
        finalCaption || null,
        finalHashtags,
        finalNotes,
        normalizedStatus,
        finalScheduledAt
      ]);

      const created = await getPublicationWithDetails(id);

      return reply.code(201).send({
        status: 'success',
        message: 'Publication créée avec succès',
        publication: created
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la création de la publication';
      fastify.log.error(error);
      return reply.code(500).send({ status: 'error', message });
    }
  });

  // POST /api/publications/batch - Création simultanée multi-plateformes
  fastify.post<{
    Body: {
      video_id: string;
      platforms: string[];
      caption?: string;
      title?: string;
      hashtags?: string;
      tags?: string;
      notes?: string;
      campaign_id?: string | null;
      status?: string;
      scheduled_at?: string | null;
    };
  }>('/api/publications/batch', async (request, reply) => {
    try {
      const db = getDatabase();
      const {
        video_id,
        platforms,
        caption,
        title,
        hashtags,
        tags,
        notes,
        campaign_id,
        status = 'draft',
        scheduled_at
      } = request.body || {};

      // 1. Validation de la vidéo
      if (!video_id || typeof video_id !== 'string' || video_id.trim() === '') {
        return reply.code(400).send({
          status: 'error',
          message: 'L\'identifiant de la vidéo (video_id) est obligatoire.'
        });
      }

      const video = await db.get<{
        id: string;
        campaign_id: string | null;
        original_name: string;
      }>('SELECT id, campaign_id, original_name FROM videos WHERE id = ?', [video_id.trim()]);

      if (!video) {
        return reply.code(404).send({
          status: 'error',
          message: `Vidéo introuvable avec l'identifiant ${video_id}`
        });
      }

      // 2. Validation de la liste des plateformes
      if (!Array.isArray(platforms) || platforms.length === 0) {
        return reply.code(400).send({
          status: 'error',
          message: 'Le tableau des plateformes (platforms) doit contenir au moins une plateforme.'
        });
      }

      const normalizedPlatforms: AllowedPlatform[] = [];
      for (const p of platforms) {
        const norm = (typeof p === 'string' ? p.toLowerCase().trim() : '') as AllowedPlatform;
        if (!ALLOWED_PLATFORMS.includes(norm)) {
          return reply.code(400).send({
            status: 'error',
            message: `Plateforme invalide "${p}". Valeurs autorisées : ${ALLOWED_PLATFORMS.join(', ')}`
          });
        }
        if (!normalizedPlatforms.includes(norm)) {
          normalizedPlatforms.push(norm);
        }
      }

      // 3. Statut & dates
      const normalizedStatus = (status ? status.toLowerCase().trim() : 'draft') as AllowedStatus;
      if (!ALLOWED_STATUSES.includes(normalizedStatus)) {
        return reply.code(400).send({
          status: 'error',
          message: `Statut invalide "${status}". Valeurs autorisées : ${ALLOWED_STATUSES.join(', ')}`
        });
      }

      let finalScheduledAt: string | null = null;
      if (scheduled_at && typeof scheduled_at === 'string' && scheduled_at.trim() !== '') {
        const parsed = new Date(scheduled_at.trim());
        if (isNaN(parsed.getTime())) {
          return reply.code(400).send({
            status: 'error',
            message: 'Format de date invalide.'
          });
        }
        finalScheduledAt = scheduled_at.trim();
      }

      // 4. Campagne
      let assignedCampaignId: string | null = null;
      if (campaign_id !== undefined) {
        if (campaign_id && typeof campaign_id === 'string' && campaign_id.trim() !== '' && campaign_id !== 'unassigned') {
          const campaignExists = await db.get<{ id: string }>('SELECT id FROM campaigns WHERE id = ?', [campaign_id.trim()]);
          if (!campaignExists) {
            return reply.code(400).send({
              status: 'error',
              message: `Campagne introuvable avec l'identifiant ${campaign_id}`
            });
          }
          assignedCampaignId = campaign_id.trim();
        } else {
          assignedCampaignId = null;
        }
      } else {
        assignedCampaignId = video.campaign_id;
      }

      const finalCaption = caption ? caption.trim() : '';
      const finalTitle = title && title.trim() !== ''
        ? title.trim()
        : (finalCaption ? finalCaption.split('\n')[0].slice(0, 100) : video.original_name);

      const rawHashtags = hashtags !== undefined ? hashtags : tags;
      const finalHashtags = rawHashtags && typeof rawHashtags === 'string' ? rawHashtags.trim() : null;
      const finalNotes = notes && typeof notes === 'string' ? notes.trim() : null;

      // 5. Création des publications distinctes
      const createdPublications: PublicationRow[] = [];

      for (const plat of normalizedPlatforms) {
        const id = crypto.randomUUID();
        await db.run(`
          INSERT INTO publications (
            id, video_id, campaign_id, platform, title, caption,
            hashtags, notes, status, scheduled_at, published_at,
            post_url, error_message, created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, NULL,
            NULL, NULL, datetime('now'), datetime('now')
          )
        `, [
          id,
          video.id,
          assignedCampaignId,
          plat,
          finalTitle,
          finalCaption || null,
          finalHashtags,
          finalNotes,
          normalizedStatus,
          finalScheduledAt
        ]);
        const p = await getPublicationWithDetails(id);
        if (p) createdPublications.push(p);
      }

      return reply.code(201).send({
        status: 'success',
        message: `${createdPublications.length} publication(s) créée(s) avec succès pour différentes plateformes`,
        count: createdPublications.length,
        publications: createdPublications
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la création par lot des publications';
      fastify.log.error(error);
      return reply.code(500).send({ status: 'error', message });
    }
  });

  // PUT /api/publications/:id - Modification d'une publication existante
  fastify.put<{
    Params: { id: string };
    Body: {
      video_id?: string;
      platform?: string;
      caption?: string | null;
      title?: string;
      hashtags?: string | null;
      tags?: string | null;
      notes?: string | null;
      campaign_id?: string | null;
      status?: string;
      scheduled_at?: string | null;
      published_at?: string | null;
      post_url?: string | null;
      external_url?: string | null;
      error_message?: string | null;
    };
  }>('/api/publications/:id', async (request, reply) => {
    try {
      const db = getDatabase();
      const { id } = request.params;

      const existing = await db.get<PublicationRow>('SELECT * FROM publications WHERE id = ?', [id]);
      if (!existing) {
        return reply.code(404).send({
          status: 'error',
          message: `Publication introuvable avec l'identifiant ${id}`
        });
      }

      const body = request.body || {};
      const updates: string[] = [];
      const params: Array<string | number | null> = [];

      // Modification de la vidéo associée
      if (body.video_id !== undefined) {
        if (!body.video_id || typeof body.video_id !== 'string' || body.video_id.trim() === '') {
          return reply.code(400).send({
            status: 'error',
            message: 'Une publication doit obligatoirement être rattachée à une vidéo valide.'
          });
        }
        const videoExists = await db.get<{ id: string }>('SELECT id FROM videos WHERE id = ?', [body.video_id.trim()]);
        if (!videoExists) {
          return reply.code(404).send({
            status: 'error',
            message: `Vidéo introuvable avec l'identifiant ${body.video_id}`
          });
        }
        updates.push('video_id = ?');
        params.push(body.video_id.trim());
      }

      // Modification de la plateforme
      if (body.platform !== undefined) {
        const normPlat = body.platform.toLowerCase().trim() as AllowedPlatform;
        if (!ALLOWED_PLATFORMS.includes(normPlat)) {
          return reply.code(400).send({
            status: 'error',
            message: `Plateforme non autorisée "${body.platform}". Valeurs acceptées : ${ALLOWED_PLATFORMS.join(', ')}`
          });
        }
        updates.push('platform = ?');
        params.push(normPlat);
      }

      // Modification du statut
      if (body.status !== undefined) {
        const normStatus = body.status.toLowerCase().trim() as AllowedStatus;
        if (!ALLOWED_STATUSES.includes(normStatus)) {
          return reply.code(400).send({
            status: 'error',
            message: `Statut invalide "${body.status}". Valeurs acceptées : ${ALLOWED_STATUSES.join(', ')}`
          });
        }
        updates.push('status = ?');
        params.push(normStatus);
      }

      // Modification de la campagne
      if (body.campaign_id !== undefined) {
        if (body.campaign_id && typeof body.campaign_id === 'string' && body.campaign_id.trim() !== '' && body.campaign_id !== 'unassigned') {
          const campaignExists = await db.get<{ id: string }>('SELECT id FROM campaigns WHERE id = ?', [body.campaign_id.trim()]);
          if (!campaignExists) {
            return reply.code(400).send({
              status: 'error',
              message: `Campagne introuvable avec l'identifiant ${body.campaign_id}`
            });
          }
          updates.push('campaign_id = ?');
          params.push(body.campaign_id.trim());
        } else {
          updates.push('campaign_id = NULL');
        }
      }

      // Modification de la caption
      if (body.caption !== undefined) {
        updates.push('caption = ?');
        params.push(body.caption ? body.caption.trim() : null);
      }

      // Modification des hashtags / tags
      if (body.hashtags !== undefined || body.tags !== undefined) {
        const val = body.hashtags !== undefined ? body.hashtags : body.tags;
        updates.push('hashtags = ?');
        params.push(val && typeof val === 'string' && val.trim() !== '' ? val.trim() : null);
      }

      // Modification des notes
      if (body.notes !== undefined) {
        updates.push('notes = ?');
        params.push(body.notes && typeof body.notes === 'string' && body.notes.trim() !== '' ? body.notes.trim() : null);
      }

      // Modification du titre
      if (body.title !== undefined) {
        if (body.title && body.title.trim() !== '') {
          updates.push('title = ?');
          params.push(body.title.trim());
        }
      } else if (body.caption !== undefined && body.caption) {
        updates.push('title = ?');
        params.push(body.caption.trim().split('\n')[0].slice(0, 100));
      }

      // Modification de la date programmée
      if (body.scheduled_at !== undefined) {
        if (body.scheduled_at && typeof body.scheduled_at === 'string' && body.scheduled_at.trim() !== '') {
          const parsed = new Date(body.scheduled_at.trim());
          if (isNaN(parsed.getTime())) {
            return reply.code(400).send({
              status: 'error',
              message: 'Format de date invalide.'
            });
          }
          updates.push('scheduled_at = ?');
          params.push(body.scheduled_at.trim());
        } else {
          updates.push('scheduled_at = NULL');
        }
      }

      // Modification de la date de publication
      if (body.published_at !== undefined) {
        updates.push('published_at = ?');
        params.push(body.published_at ? body.published_at.trim() : null);
      }

      // Modification de l'URL externe / post_url
      if (body.external_url !== undefined || body.post_url !== undefined) {
        const urlVal = body.external_url ?? body.post_url;
        const cleanUrl = urlVal ? urlVal.trim() : null;
        updates.push('post_url = ?');
        params.push(cleanUrl);
        updates.push('external_url = ?');
        params.push(cleanUrl);
      }

      // Modification du message d'erreur
      if (body.error_message !== undefined) {
        updates.push('error_message = ?');
        params.push(body.error_message ? body.error_message.trim() : null);
      }

      if (updates.length === 0) {
        return reply.code(200).send({
          status: 'success',
          message: 'Aucune modification transmise',
          publication: await getPublicationWithDetails(id)
        });
      }

      updates.push("updated_at = datetime('now')");
      params.push(id);

      await db.run(`UPDATE publications SET ${updates.join(', ')} WHERE id = ?`, params);

      const updated = await getPublicationWithDetails(id);

      // Si le statut passe à 'published', vérifier si l'objectif du jour (5/5) est atteint pour envoyer l'email de victoire
      if (body.status && body.status.toLowerCase().trim() === 'published' && emailService.isConfigured()) {
        emailService.notifyDailyGoalAchieved().catch((err) => {
          fastify.log.warn(`[GoalNotification] Erreur vérification objectif: ${err?.message}`);
        });
      }

      return reply.code(200).send({
        status: 'success',
        message: 'Publication mise à jour avec succès',
        publication: updated
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la mise à jour de la publication';
      fastify.log.error(error);
      return reply.code(500).send({ status: 'error', message });
    }
  });

  // POST /api/publications/:id/publish - Marquer une publication comme publiée manuellement
  fastify.post<{
    Params: { id: string };
    Body?: {
      published_at?: string;
      post_url?: string;
      notes?: string;
    };
  }>('/api/publications/:id/publish', async (request, reply) => {
    try {
      const db = getDatabase();
      const { id } = request.params;
      const existing = await db.get<PublicationRow>('SELECT * FROM publications WHERE id = ?', [id]);
      if (!existing) {
        return reply.code(404).send({
          status: 'error',
          message: `Publication introuvable avec l'identifiant ${id}`
        });
      }

      const now = new Date().toISOString();
      const publishedAt = request.body?.published_at?.trim() || now;
      const postUrl = request.body?.post_url !== undefined
        ? (request.body.post_url ? request.body.post_url.trim() : null)
        : (existing.post_url || existing.external_url || null);
      const notes = request.body?.notes !== undefined
        ? (request.body.notes ? request.body.notes.trim() : null)
        : (existing.notes ?? null);

      await db.run(`
        UPDATE publications 
        SET status = 'published',
            published_at = ?,
            post_url = ?,
            external_url = ?,
            notes = ?,
            error_message = NULL,
            updated_at = datetime('now')
        WHERE id = ?
      `, [publishedAt, postUrl, postUrl, notes, id]);

      const updated = await getPublicationWithDetails(id);

      // Vérifier si l'objectif du jour (5/5) est atteint pour envoyer l'email de célébration
      if (emailService.isConfigured()) {
        emailService.notifyDailyGoalAchieved().catch((err) => {
          fastify.log.warn(`[GoalNotification] Erreur vérification objectif: ${err?.message}`);
        });
      }

      return reply.code(200).send({
        status: 'success',
        message: 'Publication marquée comme publiée avec succès',
        publication: updated
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors du marquage comme publié';
      fastify.log.error(error);
      return reply.code(500).send({ status: 'error', message });
    }
  });

  // DELETE /api/publications/:id - Suppression sécurisée d'une publication
  fastify.delete<{ Params: { id: string } }>('/api/publications/:id', async (request, reply) => {
    try {
      const db = getDatabase();
      const { id } = request.params;

      const existing = await db.get<{
        id: string;
        video_id: string;
        title: string;
      }>('SELECT id, video_id, title FROM publications WHERE id = ?', [id]);

      if (!existing) {
        return reply.code(404).send({
          status: 'error',
          message: `Publication introuvable avec l'identifiant ${id}`
        });
      }

      // Suppression dans la base UNIQUEMENT. La vidéo et le fichier physique ne sont JAMAIS supprimés.
      await db.run('DELETE FROM publications WHERE id = ?', [id]);

      return reply.code(200).send({
        status: 'success',
        message: `Publication "${existing.title}" supprimée avec succès. La vidéo source reste conservée.`
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la suppression de la publication';
      fastify.log.error(error);
      return reply.code(500).send({ status: 'error', message });
    }
  });
}
