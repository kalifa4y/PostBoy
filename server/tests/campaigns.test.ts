import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { getDatabase, closeDatabase } from '../src/db/connection.js';
import { initializeDatabase } from '../src/db/init.js';
import { campaignRoutes } from '../src/routes/campaigns.js';

describe('PHASE 2 - CRUD Campaigns API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    initializeDatabase();
    app = Fastify({ logger: false });
    await app.register(campaignRoutes);
    await app.ready();

    // S'assurer de partir d'un état propre
    const db = getDatabase();
    db.prepare("DELETE FROM campaigns WHERE name LIKE 'TEST_%'").run();
  });

  afterAll(async () => {
    const db = getDatabase();
    db.prepare("DELETE FROM campaigns WHERE name LIKE 'TEST_%'").run();
    await app.close();
    closeDatabase();
  });

  let createdCampaignId = '';

  // 1. Récupération d'une liste
  it('1. GET /api/campaigns doit retourner une liste', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/campaigns'
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('success');
    expect(Array.isArray(body.campaigns)).toBe(true);
  });

  // 2. Création d'une campagne
  it('2. POST /api/campaigns doit créer une campagne et retourner 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      payload: {
        name: 'TEST_BOXABL',
        description: 'Campagne de maisons modulaires',
        color: '#08EB08',
        mentions: '@boxabl @elonmusk',
        hashtags: '#boxabl #housing #future',
        status: 'active'
      }
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('success');
    expect(body.campaign).toBeDefined();
    expect(body.campaign.id).toBeDefined();
    expect(body.campaign.name).toBe('TEST_BOXABL');
    expect(body.campaign.mentions).toBe('@boxabl @elonmusk');
    expect(body.campaign.hashtags).toBe('#boxabl #housing #future');
    expect(body.campaign.status).toBe('active');

    createdCampaignId = body.campaign.id;
  });

  // 3. Récupération d'une campagne par ID
  it('3. GET /api/campaigns/:id doit récupérer la campagne créée', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/campaigns/${createdCampaignId}`
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('success');
    expect(body.campaign.id).toBe(createdCampaignId);
    expect(body.campaign.name).toBe('TEST_BOXABL');
  });

  // 4. Modification d'une campagne
  it('4. PUT /api/campaigns/:id doit mettre à jour les métadonnées', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/campaigns/${createdCampaignId}`,
      payload: {
        name: 'TEST_BOXABL_UPDATED',
        description: 'Description mise à jour',
        color: '#3b82f6'
      }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('success');
    expect(body.campaign.name).toBe('TEST_BOXABL_UPDATED');
    expect(body.campaign.color).toBe('#3b82f6');
    expect(body.campaign.description).toBe('Description mise à jour');
  });

  // 5. Activation / Désactivation
  it('5. PUT /api/campaigns/:id doit permettre de basculer le statut active / inactive', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/campaigns/${createdCampaignId}`,
      payload: {
        status: 'inactive'
      }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.campaign.status).toBe('inactive');

    // Réactivation
    const resReact = await app.inject({
      method: 'PUT',
      url: `/api/campaigns/${createdCampaignId}`,
      payload: {
        status: 'active'
      }
    });

    expect(resReact.statusCode).toBe(200);
    expect(JSON.parse(resReact.body).campaign.status).toBe('active');
  });

  // 6. Validation du nom obligatoire
  it('6. POST /api/campaigns doit refuser un nom vide ou constitué uniquement despaces', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      payload: {
        name: '   ',
        description: 'Invalid'
      }
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('error');
    expect(body.message).toContain('obligatoire');
  });

  // 7. Détection des doublons de noms
  it('7. POST /api/campaigns doit refuser un nom déjà existant (doublon)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      payload: {
        name: 'test_boxabl_updated' // insensible à la casse
      }
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('error');
    expect(body.message).toContain('existe déjà');
  });

  // 8. Comportement avec un ID inexistant (404)
  it('8. GET /api/campaigns/:id doit renvoyer 404 sur un identifiant introuvable', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/campaigns/non-existent-uuid-9999'
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('error');
  });

  // 9. Protection contre la suppression si vidéos rattachées
  it('9. DELETE /api/campaigns/:id doit refuser la suppression si des vidéos lui sont associées', async () => {
    const db = getDatabase();
    // Liaison temporaire d'une vidéo
    db.prepare(`
      INSERT INTO videos (id, filename, original_name, file_path, file_size, mime_type, campaign_id)
      VALUES ('vid_linked_test', 'test.mp4', 'test.mp4', '/uploads/test.mp4', 1024, 'video/mp4', ?)
    `).run(createdCampaignId);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/campaigns/${createdCampaignId}`
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.message).toContain('vidéo(s) lui sont actuellement associées');

    // Nettoyage de la vidéo
    db.prepare("DELETE FROM videos WHERE id = 'vid_linked_test'").run();
  });

  // 10. Suppression effective et persistance SQLite
  it('10. DELETE /api/campaigns/:id doit supprimer la campagne sans vidéos associées', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/campaigns/${createdCampaignId}`
    });

    expect(res.statusCode).toBe(200);

    // Vérification directe dans SQLite
    const db = getDatabase();
    const row = db.prepare('SELECT id FROM campaigns WHERE id = ?').get(createdCampaignId);
    expect(row).toBeUndefined();
  });
});
