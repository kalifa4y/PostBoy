import { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { getDatabase } from '../db/connection.js';

interface CampaignRow {
  id: string;
  name: string;
  description: string | null;
  color: string;
  mentions: string | null;
  hashtags: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

interface CreateCampaignBody {
  name: string;
  description?: string;
  color?: string;
  mentions?: string;
  hashtags?: string;
  status?: 'active' | 'inactive';
}

interface UpdateCampaignBody {
  name?: string;
  description?: string;
  color?: string;
  mentions?: string;
  hashtags?: string;
  status?: 'active' | 'inactive';
}

export async function campaignRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/campaigns - Liste toutes les campagnes
  fastify.get('/api/campaigns', async (request, reply) => {
    try {
      const db = getDatabase();
      const { status } = request.query as { status?: string };

      let query = 'SELECT * FROM campaigns';
      const params: string[] = [];

      if (status && (status === 'active' || status === 'inactive')) {
        query += ' WHERE status = ?';
        params.push(status);
      }

      query += ' ORDER BY updated_at DESC';

      const campaigns = await db.all<CampaignRow>(query, params);

      return reply.code(200).send({
        status: 'success',
        count: campaigns.length,
        campaigns
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur récupération des campagnes';
      fastify.log.error(error);
      return reply.code(500).send({ status: 'error', message });
    }
  });

  // GET /api/campaigns/:id - Détail d'une campagne
  fastify.get<{ Params: { id: string } }>('/api/campaigns/:id', async (request, reply) => {
    try {
      const db = getDatabase();
      const { id } = request.params;

      const campaign = await db.get<CampaignRow>('SELECT * FROM campaigns WHERE id = ?', [id]);

      if (!campaign) {
        return reply.code(404).send({
          status: 'error',
          message: `Campagne introuvable avec l'identifiant ${id}`
        });
      }

      return reply.code(200).send({
        status: 'success',
        campaign
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur consultation campagne';
      fastify.log.error(error);
      return reply.code(500).send({ status: 'error', message });
    }
  });

  // POST /api/campaigns - Création d'une campagne
  fastify.post<{ Body: CreateCampaignBody }>('/api/campaigns', async (request, reply) => {
    try {
      const db = getDatabase();
      const body = request.body || ({} as CreateCampaignBody);
      const name = (body.name || '').trim();

      if (!name) {
        return reply.code(400).send({
          status: 'error',
          message: 'Le nom de la campagne est obligatoire et ne peut être vide.'
        });
      }

      // Vérification de doublon (insensible à la casse)
      const existing = await db.get<{ id: string }>('SELECT id FROM campaigns WHERE LOWER(name) = LOWER(?)', [name]);
      if (existing) {
        return reply.code(409).send({
          status: 'error',
          message: `Une campagne nommée "${name}" existe déjà.`
        });
      }

      const id = crypto.randomUUID();
      const description = body.description ? body.description.trim() : null;
      const color = body.color || '#08EB08';
      const mentions = body.mentions ? body.mentions.trim() : null;
      const hashtags = body.hashtags ? body.hashtags.trim() : null;
      const status = body.status === 'inactive' ? 'inactive' : 'active';

      await db.run(`
        INSERT INTO campaigns (id, name, description, color, mentions, hashtags, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `, [id, name, description, color, mentions, hashtags, status]);

      const created = await db.get<CampaignRow>('SELECT * FROM campaigns WHERE id = ?', [id]);

      return reply.code(201).send({
        status: 'success',
        message: 'Campagne créée avec succès',
        campaign: created
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur création de campagne';
      fastify.log.error(error);
      return reply.code(500).send({ status: 'error', message });
    }
  });

  // PUT /api/campaigns/:id - Modification d'une campagne
  fastify.put<{ Params: { id: string }; Body: UpdateCampaignBody }>('/api/campaigns/:id', async (request, reply) => {
    try {
      const db = getDatabase();
      const { id } = request.params;
      const body = request.body || {};

      const existing = await db.get<CampaignRow>('SELECT * FROM campaigns WHERE id = ?', [id]);
      if (!existing) {
        return reply.code(404).send({
          status: 'error',
          message: `Campagne introuvable avec l'identifiant ${id}`
        });
      }

      // Si le nom est modifié, valider qu'il n'est pas vide et qu'il n'entre pas en conflit
      let newName = existing.name;
      if (body.name !== undefined) {
        newName = body.name.trim();
        if (!newName) {
          return reply.code(400).send({
            status: 'error',
            message: 'Le nom de la campagne ne peut pas être vide.'
          });
        }
        const duplicate = await db.get<{ id: string }>('SELECT id FROM campaigns WHERE LOWER(name) = LOWER(?) AND id != ?', [newName, id]);
        if (duplicate) {
          return reply.code(409).send({
            status: 'error',
            message: `Une autre campagne nommée "${newName}" existe déjà.`
          });
        }
      }

      const newDescription = body.description !== undefined ? (body.description ? body.description.trim() : null) : existing.description;
      const newColor = body.color !== undefined ? body.color : existing.color;
      const newMentions = body.mentions !== undefined ? (body.mentions ? body.mentions.trim() : null) : existing.mentions;
      const newHashtags = body.hashtags !== undefined ? (body.hashtags ? body.hashtags.trim() : null) : existing.hashtags;
      const newStatus = body.status !== undefined ? (body.status === 'inactive' ? 'inactive' : 'active') : existing.status;

      await db.run(`
        UPDATE campaigns 
        SET name = ?, description = ?, color = ?, mentions = ?, hashtags = ?, status = ?, updated_at = datetime('now')
        WHERE id = ?
      `, [newName, newDescription, newColor, newMentions, newHashtags, newStatus, id]);

      const updated = await db.get<CampaignRow>('SELECT * FROM campaigns WHERE id = ?', [id]);

      return reply.code(200).send({
        status: 'success',
        message: 'Campagne mise à jour avec succès',
        campaign: updated
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur mise à jour campagne';
      fastify.log.error(error);
      return reply.code(500).send({ status: 'error', message });
    }
  });

  // DELETE /api/campaigns/:id - Suppression protégée d'une campagne
  fastify.delete<{ Params: { id: string } }>('/api/campaigns/:id', async (request, reply) => {
    try {
      const db = getDatabase();
      const { id } = request.params;

      const existing = await db.get<{ id: string; name: string }>('SELECT id, name FROM campaigns WHERE id = ?', [id]);
      if (!existing) {
        return reply.code(404).send({
          status: 'error',
          message: `Campagne introuvable avec l'identifiant ${id}`
        });
      }

      // Garde-fou essentiel : vérifier si des vidéos sont rattachées à cette campagne
      const videoCountRow = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM videos WHERE campaign_id = ?', [id]);
      if (videoCountRow && videoCountRow.count > 0) {
        return reply.code(400).send({
          status: 'error',
          message: `Impossible de supprimer la campagne "${existing.name}" car ${videoCountRow.count} vidéo(s) lui sont actuellement associées. Dissociez les vidéos avant de supprimer la campagne.`
        });
      }

      // Suppression effective
      await db.run('DELETE FROM campaigns WHERE id = ?', [id]);

      return reply.code(200).send({
        status: 'success',
        message: `Campagne "${existing.name}" supprimée avec succès.`
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur suppression de la campagne';
      fastify.log.error(error);
      return reply.code(500).send({ status: 'error', message });
    }
  });
}
