import { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { publicationService } from '../services/publicationService.js';
import { urlResolverService } from '../services/urlResolverService.js';

export const ALLOWED_PLATFORMS = ['tiktok', 'instagram', 'youtube'] as const;
export type AllowedPlatform = typeof ALLOWED_PLATFORMS[number];

export const ALLOWED_STATUSES = ['draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'] as const;
export type AllowedStatus = typeof ALLOWED_STATUSES[number];

export interface PublicationRow {
  id: string;
  video_id: string;
  campaign_id: string | null;
  social_account_id: string | null;
  platform: AllowedPlatform;
  title: string;
  caption: string | null;
  description: string | null;
  tags: string | null;
  status: AllowedStatus;
  scheduled_at: string | null;
  published_at: string | null;
  external_post_id: string | null;
  post_url: string | null;
  external_url: string | null;
  error_message: string | null;
  retry_count: number;
  max_retries: number;
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
  social_account_username?: string | null;
  social_account_display_name?: string | null;
}

export async function publicationRoutes(fastify: FastifyInstance): Promise<void> {
  // Helper pour récupérer une publication avec ses jointures
  const getPublicationWithDetails = (id: string): PublicationRow | undefined => {
    const db = getDatabase();
    return db.prepare(`
      SELECT 
        p.*,
        c.name as campaign_name,
        c.color as campaign_color,
        v.original_name as video_original_name,
        v.filename as video_filename,
        v.file_path as video_file_path,
        v.file_size as video_file_size,
        v.duration as video_duration,
        v.thumbnail_path as video_thumbnail_path,
        sa.username as social_account_username,
        sa.display_name as social_account_display_name
      FROM publications p
      LEFT JOIN campaigns c ON p.campaign_id = c.id
      LEFT JOIN videos v ON p.video_id = v.id
      LEFT JOIN social_accounts sa ON p.social_account_id = sa.id
      WHERE p.id = ?
    `).get(id) as unknown as PublicationRow | undefined;
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
        conditions.push("p.scheduled_at IS NOT NULL AND TRIM(p.scheduled_at) != ''");
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
          LOWER(COALESCE(v.original_name, '')) LIKE ? OR 
          LOWER(COALESCE(c.name, '')) LIKE ?
        )`);
        params.push(queryPattern, queryPattern, queryPattern, queryPattern);
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
          v.thumbnail_path as video_thumbnail_path,
          sa.username as social_account_username,
          sa.display_name as social_account_display_name
        FROM publications p
        LEFT JOIN campaigns c ON p.campaign_id = c.id
        LEFT JOIN videos v ON p.video_id = v.id
        LEFT JOIN social_accounts sa ON p.social_account_id = sa.id
        ${whereClause}
        ORDER BY datetime(COALESCE(p.scheduled_at, p.created_at)) DESC
      `;

      const publications = db.prepare(query).all(...params) as unknown as PublicationRow[];

      return reply.code(200).send({
        status: 'success',
        count: publications.length,
        publications
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
      const publication = getPublicationWithDetails(id);

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

  // POST /api/publications - Création unitaire d'une publication
  fastify.post<{
    Body: {
      video_id: string;
      platform: string;
      caption?: string;
      title?: string;
      campaign_id?: string | null;
      status?: string;
      scheduled_at?: string | null;
      social_account_id?: string | null;
    };
  }>('/api/publications', async (request, reply) => {
    try {
      const db = getDatabase();
      const {
        video_id,
        platform,
        caption,
        title,
        campaign_id,
        status = 'draft',
        scheduled_at,
        social_account_id
      } = request.body || {};

      // 1. Validation de la vidéo
      if (!video_id || typeof video_id !== 'string' || video_id.trim() === '') {
        return reply.code(400).send({
          status: 'error',
          message: 'L\'identifiant de la vidéo (video_id) est obligatoire.'
        });
      }

      const video = db.prepare('SELECT id, campaign_id, original_name FROM videos WHERE id = ?').get(video_id.trim()) as unknown as {
        id: string;
        campaign_id: string | null;
        original_name: string;
      } | undefined;

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
          const campaignExists = db.prepare('SELECT id FROM campaigns WHERE id = ?').get(campaign_id.trim());
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

      // 5. Titre et caption
      const finalCaption = caption ? caption.trim() : '';
      const finalTitle = title && title.trim() !== ''
        ? title.trim()
        : (finalCaption ? finalCaption.split('\n')[0].slice(0, 100) : video.original_name);

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

      // 7. Insertion atomique dans SQLite
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO publications (
          id, video_id, campaign_id, social_account_id, platform, title, caption,
          description, tags, status, scheduled_at, published_at, external_post_id,
          post_url, external_url, error_message, retry_count, max_retries, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          NULL, NULL, ?, ?, NULL, NULL,
          NULL, NULL, NULL, 0, 3, datetime('now'), datetime('now')
        )
      `).run(
        id,
        video.id,
        assignedCampaignId,
        social_account_id && social_account_id.trim() !== '' ? social_account_id.trim() : null,
        normalizedPlatform,
        finalTitle,
        finalCaption || null,
        normalizedStatus,
        finalScheduledAt
      );

      const created = getPublicationWithDetails(id);

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

      const video = db.prepare('SELECT id, campaign_id, original_name FROM videos WHERE id = ?').get(video_id.trim()) as unknown as {
        id: string;
        campaign_id: string | null;
        original_name: string;
      } | undefined;

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
          const campaignExists = db.prepare('SELECT id FROM campaigns WHERE id = ?').get(campaign_id.trim());
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

      // 5. Création des publications distinctes
      const createdPublications: PublicationRow[] = [];
      const insertStmt = db.prepare(`
        INSERT INTO publications (
          id, video_id, campaign_id, social_account_id, platform, title, caption,
          description, tags, status, scheduled_at, published_at, external_post_id,
          post_url, external_url, error_message, retry_count, max_retries, created_at, updated_at
        ) VALUES (
          ?, ?, ?, NULL, ?, ?, ?,
          NULL, NULL, ?, ?, NULL, NULL,
          NULL, NULL, NULL, 0, 3, datetime('now'), datetime('now')
        )
      `);

      for (const plat of normalizedPlatforms) {
        const id = crypto.randomUUID();
        insertStmt.run(
          id,
          video.id,
          assignedCampaignId,
          plat,
          finalTitle,
          finalCaption || null,
          normalizedStatus,
          finalScheduledAt
        );
        const p = getPublicationWithDetails(id);
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
      campaign_id?: string | null;
      status?: string;
      scheduled_at?: string | null;
      published_at?: string | null;
      post_url?: string | null;
      external_url?: string | null;
      error_message?: string | null;
      social_account_id?: string | null;
    };
  }>('/api/publications/:id', async (request, reply) => {
    try {
      const db = getDatabase();
      const { id } = request.params;

      const existing = db.prepare('SELECT * FROM publications WHERE id = ?').get(id) as unknown as PublicationRow | undefined;
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
        const videoExists = db.prepare('SELECT id FROM videos WHERE id = ?').get(body.video_id.trim());
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
          const campaignExists = db.prepare('SELECT id FROM campaigns WHERE id = ?').get(body.campaign_id.trim());
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

      // Modification du titre
      if (body.title !== undefined) {
        if (body.title && body.title.trim() !== '') {
          updates.push('title = ?');
          params.push(body.title.trim());
        }
      } else if (body.caption !== undefined && body.caption) {
        // Maintien de title synchronisé si fourni
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
        updates.push('external_url = ?');
        updates.push('post_url = ?');
        params.push(urlVal ? urlVal.trim() : null);
        params.push(urlVal ? urlVal.trim() : null);
      }

      // Modification du message d'erreur
      if (body.error_message !== undefined) {
        updates.push('error_message = ?');
        params.push(body.error_message ? body.error_message.trim() : null);
      }

      // Modification du compte social
      if (body.social_account_id !== undefined) {
        if (body.social_account_id && typeof body.social_account_id === 'string' && body.social_account_id.trim() !== '' && body.social_account_id !== 'unassigned') {
          updates.push('social_account_id = ?');
          params.push(body.social_account_id.trim());
        } else {
          updates.push('social_account_id = NULL');
        }
      }

      if (updates.length === 0) {
        return reply.code(200).send({
          status: 'success',
          message: 'Aucune modification transmise',
          publication: getPublicationWithDetails(id)
        });
      }

      updates.push("updated_at = datetime('now')");
      params.push(id);

      db.prepare(`UPDATE publications SET ${updates.join(', ')} WHERE id = ?`).run(...params);

      const updated = getPublicationWithDetails(id);

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

  // POST /api/publications/:id/publish - Déclenchement manuel de la publication
  fastify.post<{ Params: { id: string } }>('/api/publications/:id/publish', async (request, reply) => {
    try {
      const { id } = request.params;
      const db = getDatabase();

      const publication = db.prepare('SELECT id, status, published_at FROM publications WHERE id = ?').get(id) as unknown as PublicationRow | undefined;
      if (!publication) {
        return reply.code(404).send({
          status: 'error',
          message: `Publication introuvable avec l'identifiant ${id}`
        });
      }

      if (publication.status === 'published') {
        return reply.code(400).send({
          status: 'error',
          message: `Cette publication a déjà été publiée avec succès le ${publication.published_at}`
        });
      }

      if (publication.status === 'cancelled') {
        return reply.code(400).send({
          status: 'error',
          message: 'Impossible de publier une publication annulée.'
        });
      }

      if (publication.status === 'publishing') {
        return reply.code(409).send({
          status: 'error',
          message: "Cette publication est déjà en cours d'envoi."
        });
      }

      // Déclenchement via le moteur PublicationService
      const result = await publicationService.publishPublication(id, { forceManual: true });

      const updated = getPublicationWithDetails(id);

      if (result.success) {
        return reply.code(200).send({
          status: 'success',
          message: 'Publication effectuée avec succès !',
          publication: updated,
          result
        });
      } else {
        return reply.code(400).send({
          status: 'error',
          message: result.errorMessage || "Échec lors de l'envoi de la publication",
          publication: updated
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la publication';
      fastify.log.error(error);
      return reply.code(500).send({ status: 'error', message });
    }
  });

  // POST /api/publications/:id/resolve-url - Résolution de l'URL publique officielle (Phase 8)
  fastify.post<{ Params: { id: string } }>('/api/publications/:id/resolve-url', async (request, reply) => {
    try {
      const { id } = request.params;
      const db = getDatabase();

      const publication = db.prepare('SELECT id, status, external_post_id, external_url FROM publications WHERE id = ?').get(id) as unknown as PublicationRow | undefined;
      if (!publication) {
        return reply.code(404).send({
          status: 'error',
          message: `Publication introuvable avec l'identifiant ${id}`
        });
      }

      if (publication.status !== 'published') {
        return reply.code(400).send({
          status: 'error',
          message: `Impossible de résoudre l'URL : la publication est en statut '${publication.status}' (seul le statut 'published' est éligible).`
        });
      }

      if (!publication.external_post_id) {
        return reply.code(400).send({
          status: 'error',
          message: "Aucun identifiant de publication externe (external_post_id) n'est enregistré pour cette publication."
        });
      }

      const result = await urlResolverService.resolvePublicationUrl(id);
      const updated = getPublicationWithDetails(id);

      if (result.success) {
        return reply.code(200).send({
          status: 'success',
          message: result.message,
          external_url: result.externalUrl,
          already_resolved: result.alreadyResolved || false,
          publication: updated
        });
      } else {
        return reply.code(400).send({
          status: 'error',
          message: result.message,
          publication: updated
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erreur lors de la résolution de l'URL";
      fastify.log.error(error);
      return reply.code(500).send({ status: 'error', message });
    }
  });

  // DELETE /api/publications/:id - Suppression sécurisée d'une publication
  fastify.delete<{ Params: { id: string } }>('/api/publications/:id', async (request, reply) => {
    try {
      const db = getDatabase();
      const { id } = request.params;

      const existing = db.prepare('SELECT id, video_id, title FROM publications WHERE id = ?').get(id) as unknown as {
        id: string;
        video_id: string;
        title: string;
      } | undefined;

      if (!existing) {
        return reply.code(404).send({
          status: 'error',
          message: `Publication introuvable avec l'identifiant ${id}`
        });
      }

      // Suppression dans SQLite UNIQUEMENT. La vidéo et le fichier physique ne sont JAMAIS supprimés.
      db.prepare('DELETE FROM publications WHERE id = ?').run(id);

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
