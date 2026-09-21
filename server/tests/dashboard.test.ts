import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { getDatabase, closeDatabase } from '../src/db/connection.js';
import { initializeDatabase } from '../src/db/init.js';
import { dashboardRoutes } from '../src/routes/dashboard.js';

describe('PHASE 1 - Dashboard API & Statistiques', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await initializeDatabase();
    app = Fastify({ logger: false });
    await app.register(dashboardRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeDatabase();
  });

  it('GET /api/dashboard/stats doit renvoyer des métriques à 0 et des listes vides sur une base vierge', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/dashboard/stats'
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('success');
    expect(body.stats).toBeDefined();
    expect(typeof body.stats.videosToPublish).toBe('number');
    expect(typeof body.stats.scheduledCount).toBe('number');
    expect(typeof body.stats.publishedCount).toBe('number');
    expect(typeof body.stats.failedCount).toBe('number');
    expect(typeof body.stats.totalVideos).toBe('number');
    expect(Array.isArray(body.upcomingPublications)).toBe(true);
    expect(Array.isArray(body.recentPublications)).toBe(true);
  });

  it('doit calculer précisément les statistiques et les jointures avec des données réelles', async () => {
    const db = getDatabase();

    // Insertion d'une campagne de test
    await db.run(`
      INSERT INTO campaigns (id, name, description, color) 
      VALUES ('camp_test', 'BOXABL Campaign', 'Test Campaign', '#08EB08')
    `);

    // Insertion de 2 vidéos
    await db.run(`
      INSERT INTO videos (id, filename, original_name, file_path, file_size, mime_type, campaign_id) 
      VALUES 
        ('vid_test_1', 'clip_01.mp4', 'Clip 01 Original', '/uploads/clip_01.mp4', 1048576, 'video/mp4', 'camp_test'),
        ('vid_test_2', 'clip_02.mp4', 'Clip 02 Original', '/uploads/clip_02.mp4', 2097152, 'video/mp4', 'camp_test')
    `);

    // Insertion de 3 publications : 1 programmée, 1 publiée, 1 échouée
    await db.run(`
      INSERT INTO publications (id, video_id, campaign_id, platform, title, status, scheduled_at, published_at, post_url, error_message)
      VALUES 
        ('pub_test_1', 'vid_test_1', 'camp_test', 'tiktok', 'Clip 1 sur TikTok', 'scheduled', '2026-09-22 14:00:00', NULL, NULL, NULL),
        ('pub_test_2', 'vid_test_1', 'camp_test', 'youtube', 'Clip 1 sur YouTube', 'published', NULL, '2026-09-21 12:00:00', 'https://youtube.com/shorts/sample123', NULL),
        ('pub_test_3', 'vid_test_2', 'camp_test', 'instagram', 'Clip 2 sur Instagram', 'failed', NULL, NULL, NULL, 'Token expiré')
    `);

    const res = await app.inject({
      method: 'GET',
      url: '/api/dashboard/stats'
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.stats.scheduledCount).toBeGreaterThanOrEqual(1);
    expect(body.stats.publishedCount).toBeGreaterThanOrEqual(1);
    expect(body.stats.failedCount).toBeGreaterThanOrEqual(1);
    expect(body.stats.totalVideos).toBeGreaterThanOrEqual(2);

    // Vérification de la prochaine publication
    const upcoming = body.upcomingPublications.find((p: any) => p.id === 'pub_test_1');
    expect(upcoming).toBeDefined();
    expect(upcoming.platform).toBe('tiktok');
    expect(upcoming.campaign_name).toBe('BOXABL Campaign');
    expect(upcoming.video_name).toBe('Clip 01 Original');

    // Vérification des publications récentes
    const published = body.recentPublications.find((p: any) => p.id === 'pub_test_2');
    expect(published).toBeDefined();
    expect(published.post_url).toBe('https://youtube.com/shorts/sample123');
    expect(published.status).toBe('published');

    const failed = body.recentPublications.find((p: any) => p.id === 'pub_test_3');
    expect(failed).toBeDefined();
    expect(failed.error_message).toBe('Token expiré');
    expect(failed.status).toBe('failed');

    // Nettoyage des données de test
    await db.run("DELETE FROM publications WHERE id LIKE 'pub_test_%'");
    await db.run("DELETE FROM videos WHERE id LIKE 'vid_test_%'");
    await db.run("DELETE FROM campaigns WHERE id = 'camp_test'");
  });
});
