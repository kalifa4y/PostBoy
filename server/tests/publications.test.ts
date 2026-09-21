import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { getDatabase, closeDatabase } from '../src/db/connection.js';
import { initializeDatabase } from '../src/db/init.js';
import { publicationRoutes } from '../src/routes/publications.js';

describe('PHASE 4 - CRUD Publications API', () => {
  let app: FastifyInstance;
  const testCampaignId = 'camp_test_p4';
  const testVideoId = 'vid_test_p4';

  beforeAll(async () => {
    await initializeDatabase();
    app = Fastify({ logger: false });
    await app.register(publicationRoutes);
    await app.ready();

    const db = getDatabase();
    // Nettoyage préalable des données de test
    await db.run("DELETE FROM publications WHERE title LIKE 'TEST_%' OR id LIKE 'pub_test_%'");
    await db.run('DELETE FROM videos WHERE id = ?', [testVideoId]);
    await db.run('DELETE FROM campaigns WHERE id = ?', [testCampaignId]);

    // Création d'une campagne de test
    await db.run(`
      INSERT INTO campaigns (id, name, description, color, mentions, hashtags, status, created_at, updated_at)
      VALUES (?, 'TEST_BOXABL_CAMPAIGN', 'Campagne de test phase 4', '#08EB08', '@boxabl', '#boxabl #shorts', 'active', datetime('now'), datetime('now'))
    `, [testCampaignId]);

    // Création d'une vidéo source de test
    await db.run(`
      INSERT INTO videos (id, filename, original_name, file_path, file_size, duration, mime_type, campaign_id, status, created_at, updated_at)
      VALUES (?, 'test_clip_p4.mp4', 'TEST_BOXABL_CLIP_01.mp4', '/uploads/test_clip_p4.mp4', 1048576, 15.5, 'video/mp4', ?, 'ready', datetime('now'), datetime('now'))
    `, [testVideoId, testCampaignId]);
  });

  afterAll(async () => {
    const db = getDatabase();
    await db.run("DELETE FROM publications WHERE title LIKE 'TEST_%' OR id LIKE 'pub_test_%'");
    await db.run('DELETE FROM publications WHERE video_id = ?', [testVideoId]);
    await db.run('DELETE FROM videos WHERE id = ?', [testVideoId]);
    await db.run('DELETE FROM campaigns WHERE id = ?', [testCampaignId]);
    await app.close();
    closeDatabase();
  });

  let createdPublicationId = '';
  let batchPubId1 = '';
  let batchPubId2 = '';

  // 1. GET /api/publications - Liste
  it('1. GET /api/publications doit renvoyer une liste avec statut success', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/publications'
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('success');
    expect(Array.isArray(body.publications)).toBe(true);
  });

  // 2. POST /api/publications - Création valide
  it('2. POST /api/publications doit créer une publication valide et retourner 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/publications',
      payload: {
        video_id: testVideoId,
        platform: 'tiktok',
        title: 'TEST_BOXABL TikTok Post',
        caption: 'Découvrez la maison pliable Boxabl ! #boxabl #innovation @boxabl',
        status: 'draft',
        scheduled_at: '2026-09-25T14:30:00Z'
      }
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('success');
    expect(body.publication).toBeDefined();
    expect(body.publication.video_id).toBe(testVideoId);
    expect(body.publication.platform).toBe('tiktok');
    expect(body.publication.status).toBe('draft');
    expect(body.publication.caption).toContain('maison pliable');
    expect(body.publication.campaign_id).toBe(testCampaignId); // Hérité automatiquement de la vidéo
    expect(body.publication.video_original_name).toBe('TEST_BOXABL_CLIP_01.mp4');
    expect(body.publication.campaign_name).toBe('TEST_BOXABL_CAMPAIGN');

    createdPublicationId = body.publication.id;
  });

  // 3. POST /api/publications - Vidéo inexistante
  it('3. POST /api/publications doit refuser une vidéo inexistante avec code 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/publications',
      payload: {
        video_id: 'non_existent_video_id',
        platform: 'instagram',
        caption: 'Test fail'
      }
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('error');
    expect(body.message).toContain('Vidéo introuvable');
  });

  // 4. POST /api/publications - Plateforme invalide
  it('4. POST /api/publications doit refuser une plateforme non autorisée', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/publications',
      payload: {
        video_id: testVideoId,
        platform: 'myspace_invalid',
        caption: 'Test'
      }
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('error');
    expect(body.message).toContain('Plateforme non autorisée');
  });

  // 5. POST /api/publications - Statut invalide
  it('5. POST /api/publications doit refuser un statut inconnu', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/publications',
      payload: {
        video_id: testVideoId,
        platform: 'youtube',
        status: 'status_fantaisiste'
      }
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('error');
    expect(body.message).toContain('Statut invalide');
  });

  // 6. GET /api/publications/:id - Détail
  it('6. GET /api/publications/:id doit retourner les informations complètes de la publication', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/publications/${createdPublicationId}`
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('success');
    expect(body.publication.id).toBe(createdPublicationId);
    expect(body.publication.platform).toBe('tiktok');
    expect(body.publication.video_original_name).toBe('TEST_BOXABL_CLIP_01.mp4');
  });

  // 7. GET /api/publications/:id - Introuvable
  it('7. GET /api/publications/:id doit retourner 404 si introuvable', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/publications/pub_inexistante_999'
    });

    expect(res.statusCode).toBe(404);
  });

  // 8. POST /api/publications/batch - Duplication multi-plateformes
  it('8. POST /api/publications/batch doit créer plusieurs publications indépendantes pour une même vidéo', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/publications/batch',
      payload: {
        video_id: testVideoId,
        platforms: ['instagram', 'youtube'],
        caption: 'TEST_MULTI Déclinaison multi-réseaux pour la même vidéo #boxabl',
        status: 'scheduled',
        scheduled_at: '2026-09-26T18:00:00Z'
      }
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('success');
    expect(body.count).toBe(2);
    expect(body.publications.length).toBe(2);

    const platforms = body.publications.map((p: { platform: string }) => p.platform);
    expect(platforms).toContain('instagram');
    expect(platforms).toContain('youtube');

    batchPubId1 = body.publications[0].id;
    batchPubId2 = body.publications[1].id;
  });

  // 9. Indépendance des publications pour une même vidéo
  it('9. Modifier une publication (Instagram) ne doit pas altérer l\'autre publication (YouTube)', async () => {
    // Modification de la publication Instagram
    const updateRes = await app.inject({
      method: 'PUT',
      url: `/api/publications/${batchPubId1}`,
      payload: {
        caption: 'Caption spécifique Instagram avec filtre et hashtag exclusif #instagram',
        status: 'draft'
      }
    });
    expect(updateRes.statusCode).toBe(200);

    // Vérification de la publication YouTube (doit rester inchangée)
    const ytRes = await app.inject({
      method: 'GET',
      url: `/api/publications/${batchPubId2}`
    });
    expect(ytRes.statusCode).toBe(200);
    const ytBody = JSON.parse(ytRes.body);
    expect(ytBody.publication.status).toBe('scheduled');
    expect(ytBody.publication.caption).toContain('TEST_MULTI Déclinaison multi-réseaux');
  });

  // 10. Filtres et Recherche
  it('10. GET /api/publications doit filtrer par plateforme, statut et recherche', async () => {
    // Filtre par plateforme
    const platRes = await app.inject({
      method: 'GET',
      url: '/api/publications?platform=tiktok'
    });
    expect(platRes.statusCode).toBe(200);
    const platBody = JSON.parse(platRes.body);
    expect(platBody.publications.every((p: { platform: string }) => p.platform === 'tiktok')).toBe(true);

    // Filtre par statut
    const statusRes = await app.inject({
      method: 'GET',
      url: '/api/publications?status=scheduled'
    });
    expect(statusRes.statusCode).toBe(200);
    const statusBody = JSON.parse(statusRes.body);
    expect(statusBody.publications.every((p: { status: string }) => p.status === 'scheduled')).toBe(true);

    // Recherche textuelle
    const searchRes = await app.inject({
      method: 'GET',
      url: '/api/publications?search=maison pliable'
    });
    expect(searchRes.statusCode).toBe(200);
    const searchBody = JSON.parse(searchRes.body);
    expect(searchBody.publications.length).toBeGreaterThanOrEqual(1);
    expect(searchBody.publications[0].caption).toContain('maison pliable');
  });

  // 11. PUT /api/publications/:id - Modification
  it('11. PUT /api/publications/:id doit mettre à jour les métadonnées et persister dans SQLite', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/publications/${createdPublicationId}`,
      payload: {
        status: 'scheduled',
        caption: 'Légende mise à jour avec hashtags enrichis #boxabl #futureOfLiving',
        scheduled_at: '2026-09-30T20:00:00Z',
        external_url: 'https://www.tiktok.com/@postboy/video/123456789'
      }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('success');
    expect(body.publication.status).toBe('scheduled');
    expect(body.publication.caption).toContain('#futureOfLiving');
    expect(body.publication.external_url).toBe('https://www.tiktok.com/@postboy/video/123456789');

    // Vérification directe dans la base
    const db = getDatabase();
    const row = await db.get<{
      status: string;
      caption: string;
      external_url: string;
    }>('SELECT status, caption, external_url FROM publications WHERE id = ?', [createdPublicationId]);
    expect(row).toBeDefined();
    expect(row?.status).toBe('scheduled');
    expect(row?.caption).toContain('#futureOfLiving');
  });

  // 12. DELETE /api/publications/:id - Suppression sécurisée
  it('12. DELETE /api/publications/:id doit supprimer la publication sans supprimer la vidéo source', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/publications/${createdPublicationId}`
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('success');

    // Vérification que la publication a disparu
    const checkRes = await app.inject({
      method: 'GET',
      url: `/api/publications/${createdPublicationId}`
    });
    expect(checkRes.statusCode).toBe(404);

    // Vérification essentielle : la vidéo source existe toujours dans la base !
    const db = getDatabase();
    const videoRow = await db.get('SELECT id, original_name FROM videos WHERE id = ?', [testVideoId]);
    expect(videoRow).toBeDefined();
  });

  // 13. DELETE /api/publications/:id - Erreur 404
  it('13. DELETE /api/publications/:id doit renvoyer 404 sur un identifiant introuvable', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/publications/pub_inconnue_999'
    });

    expect(res.statusCode).toBe(404);
  });
});
