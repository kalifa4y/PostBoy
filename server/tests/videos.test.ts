import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { getDatabase, closeDatabase } from '../src/db/connection.js';
import { initializeDatabase } from '../src/db/init.js';
import { videoRoutes } from '../src/routes/videos.js';

describe('PHASE 10 - Référencement & Métadonnées des Vidéos Sources Locales', () => {
  let app: FastifyInstance;
  const testCampaignId = 'camp_test_v10';
  let createdVideoId = '';

  beforeAll(async () => {
    await initializeDatabase();

    app = Fastify({ logger: false });
    await app.register(videoRoutes);
    await app.ready();

    // Nettoyage préalable des données de test
    const db = getDatabase();
    await db.run("DELETE FROM publications WHERE title LIKE 'TEST_V10_%'");
    await db.run("DELETE FROM videos WHERE original_name LIKE 'test_clip_%'");
    await db.run("DELETE FROM campaigns WHERE id = ?", [testCampaignId]);

    // Création d'une campagne de test
    await db.run(`
      INSERT OR REPLACE INTO campaigns (id, name, color)
      VALUES (?, 'V10_CAMPAIGN', '#08EB08')
    `, [testCampaignId]);
  });

  afterAll(async () => {
    const db = getDatabase();
    await db.run("DELETE FROM publications WHERE title LIKE 'TEST_V10_%'");
    await db.run("DELETE FROM videos WHERE original_name LIKE 'test_clip_%'");
    await db.run("DELETE FROM campaigns WHERE id = ?", [testCampaignId]);
    await app.close();
    closeDatabase();
  });

  // 1. Liste des vidéos
  it('1. GET /api/videos doit renvoyer une liste de vidéos avec statut success', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/videos'
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('success');
    expect(Array.isArray(body.videos)).toBe(true);
  });

  // 2. Déclaration d'une source vidéo
  it('2. POST /api/videos doit enregistrer une référence de vidéo locale', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/videos',
      payload: {
        original_name: 'test_clip_01.mp4',
        campaign_id: testCampaignId,
        notes: 'Vidéo source locale'
      }
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('success');
    expect(body.video).toBeDefined();
    expect(body.video.original_name).toBe('test_clip_01.mp4');
    expect(body.video.campaign_id).toBe(testCampaignId);
    expect(body.video.status).toBe('ready');

    createdVideoId = body.video.id;
  });

  // 3. Validation champ obligatoire
  it('3. POST /api/videos doit refuser une création sans original_name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/videos',
      payload: {
        campaign_id: testCampaignId
      }
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('error');
    expect(body.message).toContain('original_name');
  });

  // 4. Consultation des détails
  it('4. GET /api/videos/:id doit récupérer la vidéo et ses infos de campagne', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/videos/${createdVideoId}`
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('success');
    expect(body.video.id).toBe(createdVideoId);
    expect(body.video.campaign_name).toBe('V10_CAMPAIGN');
  });

  // 5. Filtrage par campagne et recherche
  it('5. GET /api/videos avec query params doit filtrer correctement', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/videos?campaign_id=${testCampaignId}`
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.videos.some((v: any) => v.id === createdVideoId)).toBe(true);

    const resSearch = await app.inject({
      method: 'GET',
      url: '/api/videos?search=test_clip_01'
    });
    expect(resSearch.statusCode).toBe(200);
    expect(JSON.parse(resSearch.body).videos.length).toBeGreaterThanOrEqual(1);
  });

  // 6. Mise à jour des métadonnées
  it('6. PUT /api/videos/:id doit mettre à jour les notes et la campagne', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/videos/${createdVideoId}`,
      payload: {
        campaign_id: 'unassigned',
        notes: 'Clip déplacé sans campagne'
      }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.video.campaign_id).toBeNull();
    expect(body.video.notes).toBe('Clip déplacé sans campagne');
  });

  // 7. Refus de suppression si publication associée
  it('7. DELETE /api/videos/:id doit refuser la suppression si une publication lui est rattachée', async () => {
    const db = getDatabase();
    await db.run(`
      INSERT INTO publications (id, video_id, platform, title, status)
      VALUES ('pub_test_v10_link', ?, 'tiktok', 'TEST_V10_Clip', 'scheduled')
    `, [createdVideoId]);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/videos/${createdVideoId}`
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('publication(s) lui sont actuellement associées');

    // Nettoyage de la publication liée
    await db.run("DELETE FROM publications WHERE id = 'pub_test_v10_link'");
  });

  // 8. Suppression en base
  it('8. DELETE /api/videos/:id doit supprimer l\'entrée SQLite quand aucune publication n\'est liée', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/videos/${createdVideoId}`
    });

    expect(res.statusCode).toBe(200);

    const db = getDatabase();
    const row = await db.get('SELECT id FROM videos WHERE id = ?', [createdVideoId]);
    expect(row).toBeUndefined();
  });
});
