import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { getDatabase, closeDatabase } from '../src/db/connection.js';
import { initializeDatabase } from '../src/db/init.js';
import { publicationRoutes } from '../src/routes/publications.js';

describe('PHASE 5 - Calendrier & Scheduling Manuel API', () => {
  let app: FastifyInstance;
  const testCampaignId = 'camp_test_p5';
  const testVideoId = 'vid_test_p5';

  beforeAll(async () => {
    initializeDatabase();
    app = Fastify({ logger: false });
    await app.register(publicationRoutes);
    await app.ready();

    const db = getDatabase();
    // Nettoyage préalable des données de test
    db.prepare("DELETE FROM publications WHERE title LIKE 'TEST_CAL_%' OR id LIKE 'pub_cal_%'").run();
    db.prepare('DELETE FROM videos WHERE id = ?').run(testVideoId);
    db.prepare('DELETE FROM campaigns WHERE id = ?').run(testCampaignId);

    // Création d'une campagne de test
    db.prepare(`
      INSERT INTO campaigns (id, name, description, color, mentions, hashtags, status, created_at, updated_at)
      VALUES (?, 'TEST_CAL_CAMPAIGN', 'Campagne de test calendrier', '#08EB08', '@boxabl', '#boxabl', 'active', datetime('now'), datetime('now'))
    `).run(testCampaignId);

    // Création d'une vidéo source de test
    db.prepare(`
      INSERT INTO videos (id, filename, original_name, file_path, file_size, duration, mime_type, campaign_id, status, created_at, updated_at)
      VALUES (?, 'test_cal.mp4', 'TEST_CAL_CLIP_01.mp4', '/uploads/test_cal.mp4', 2048576, 25.0, 'video/mp4', ?, 'ready', datetime('now'), datetime('now'))
    `).run(testVideoId, testCampaignId);
  });

  afterAll(async () => {
    const db = getDatabase();
    db.prepare("DELETE FROM publications WHERE title LIKE 'TEST_CAL_%' OR id LIKE 'pub_cal_%'").run();
    db.prepare('DELETE FROM publications WHERE video_id = ?').run(testVideoId);
    db.prepare('DELETE FROM videos WHERE id = ?').run(testVideoId);
    db.prepare('DELETE FROM campaigns WHERE id = ?').run(testCampaignId);
    await app.close();
    closeDatabase();
  });

  let pubScheduled1 = '';
  let pubScheduled2Midnight = '';
  let pubScheduled3SameDay = '';
  let pubUnscheduled = '';

  // 1. Création de publications variées (avec et sans scheduled_at)
  it('1. Préparation des publications programmées et non programmées', async () => {
    // Publication programmée en journée (14:30)
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/publications',
      payload: {
        video_id: testVideoId,
        platform: 'tiktok',
        title: 'TEST_CAL_Pub1',
        caption: 'Clip TikTok programmé en journée #boxabl',
        status: 'scheduled',
        scheduled_at: '2026-09-25T14:30:00Z'
      }
    });
    expect(res1.statusCode).toBe(201);
    pubScheduled1 = JSON.parse(res1.body).publication.id;

    // Publication programmée à minuit pile (00:00:00Z)
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/publications',
      payload: {
        video_id: testVideoId,
        platform: 'instagram',
        title: 'TEST_CAL_Pub2_Midnight',
        caption: 'Clip Instagram programmé à minuit pile',
        status: 'scheduled',
        scheduled_at: '2026-09-25T00:00:00Z'
      }
    });
    expect(res2.statusCode).toBe(201);
    pubScheduled2Midnight = JSON.parse(res2.body).publication.id;

    // Publication programmée le même jour à la même heure qu'une autre (ex: YouTube à 14:30)
    const res3 = await app.inject({
      method: 'POST',
      url: '/api/publications',
      payload: {
        video_id: testVideoId,
        platform: 'youtube',
        title: 'TEST_CAL_Pub3_SameTime',
        caption: 'Clip YouTube programmé le même jour à 14:30',
        status: 'scheduled',
        scheduled_at: '2026-09-25T14:30:00Z'
      }
    });
    expect(res3.statusCode).toBe(201);
    pubScheduled3SameDay = JSON.parse(res3.body).publication.id;

    // Publication SANS date de programmation (brouillon)
    const res4 = await app.inject({
      method: 'POST',
      url: '/api/publications',
      payload: {
        video_id: testVideoId,
        platform: 'tiktok',
        title: 'TEST_CAL_Pub4_Unscheduled',
        caption: 'Brouillon sans date',
        status: 'draft',
        scheduled_at: null
      }
    });
    expect(res4.statusCode).toBe(201);
    pubUnscheduled = JSON.parse(res4.body).publication.id;
  });

  // 2. Filtre scheduled_only=true
  it('2. GET /api/publications?scheduled_only=true doit retourner uniquement les publications ayant scheduled_at', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/publications?scheduled_only=true'
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('success');
    expect(Array.isArray(body.publications)).toBe(true);

    // Vérifier que chaque publication retournée a un scheduled_at non null et non vide
    expect(
      body.publications.every((p: { scheduled_at: string | null }) => p.scheduled_at !== null && p.scheduled_at.trim() !== '')
    ).toBe(true);

    // Vérifier que pubUnscheduled n'est PAS dans la liste
    const ids = body.publications.map((p: { id: string }) => p.id);
    expect(ids).toContain(pubScheduled1);
    expect(ids).toContain(pubScheduled2Midnight);
    expect(ids).toContain(pubScheduled3SameDay);
    expect(ids).not.toContain(pubUnscheduled);
  });

  // 3. Gestion de plusieurs publications le même jour et à la même heure
  it('3. Plusieurs publications le même jour à la même heure sont bien distinguées', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/publications?start_date=2026-09-25T00:00:00Z&end_date=2026-09-25T23:59:59Z'
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.publications.length).toBeGreaterThanOrEqual(3);

    // Vérifier que les 3 publications créées le 25 septembre sont présentes
    const dayIds = body.publications.map((p: { id: string }) => p.id);
    expect(dayIds).toContain(pubScheduled1);
    expect(dayIds).toContain(pubScheduled2Midnight);
    expect(dayIds).toContain(pubScheduled3SameDay);
  });

  // 4. Reprogrammation manuelle (PUT /api/publications/:id)
  it('4. Modification manuelle de scheduled_at persiste immédiatement dans SQLite', async () => {
    const newDate = '2026-09-28T16:00:00Z';
    const res = await app.inject({
      method: 'PUT',
      url: `/api/publications/${pubScheduled1}`,
      payload: {
        scheduled_at: newDate
      }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('success');
    expect(body.publication.scheduled_at).toBe(newDate);

    // Vérification directe dans SQLite
    const db = getDatabase();
    const row = db.prepare('SELECT scheduled_at FROM publications WHERE id = ?').get(pubScheduled1) as { scheduled_at: string };
    expect(row.scheduled_at).toBe(newDate);
  });

  // 5. Déprogrammation (scheduled_at = null)
  it('5. Déprogrammer une publication (scheduled_at: null) la retire du calendrier', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/publications/${pubScheduled3SameDay}`,
      payload: {
        scheduled_at: null,
        status: 'draft'
      }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.publication.scheduled_at).toBeNull();
    expect(body.publication.status).toBe('draft');

    // Vérifier que GET /api/publications?scheduled_only=true ne la renvoie plus
    const calRes = await app.inject({
      method: 'GET',
      url: '/api/publications?scheduled_only=true'
    });
    const calBody = JSON.parse(calRes.body);
    const ids = calBody.publications.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(pubScheduled3SameDay);
  });

  // 6. Préservation des relations vidéo et campagne lors de la reprogrammation
  it('6. Les relations vidéo et campagne restent intactes après reprogrammation', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/publications/${pubScheduled1}`
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.publication.video_id).toBe(testVideoId);
    expect(body.publication.video_original_name).toBe('TEST_CAL_CLIP_01.mp4');
    expect(body.publication.campaign_id).toBe(testCampaignId);
    expect(body.publication.campaign_name).toBe('TEST_CAL_CAMPAIGN');
  });
});
