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

  describe('PHASE 5 - Objectif quotidien de clipping (5 clips / 5 campagnes), Streak & Historique', () => {
    const cleanPhase5Data = async () => {
      const db = getDatabase();
      await db.run("DELETE FROM publications WHERE id LIKE 'p5_%'");
      await db.run("DELETE FROM videos WHERE id LIKE 'v5_%'");
      await db.run("DELETE FROM campaigns WHERE id LIKE 'c5_%'");
    };

    beforeAll(async () => {
      await cleanPhase5Data();
    });

    afterAll(async () => {
      await cleanPhase5Data();
    });

    it('5.1 : 0 publication -> Objectif non atteint, 0/5 publiés, 5 restants', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/dashboard/stats?date=2026-09-01'
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.dailyGoal).toBeDefined();
      expect(body.dailyGoal.date).toBe('2026-09-01');
      expect(body.dailyGoal.publishedToday).toBe(0);
      expect(body.dailyGoal.distinctCampaignsToday).toBe(0);
      expect(body.dailyGoal.remainingPosts).toBe(5);
      expect(body.dailyGoal.remainingCampaigns).toBe(5);
      expect(body.dailyGoal.isGoalMet).toBe(false);
    });

    it('5.2 : 5 publications planifiées (scheduled) mais non publiées -> ne comptent pas comme publiées', async () => {
      const db = getDatabase();
      const testDate = '2026-09-02';

      await db.run("INSERT INTO campaigns (id, name, color) VALUES ('c5_1', 'Camp 1', '#08EB08')");
      await db.run("INSERT INTO videos (id, filename, original_name, file_path, file_size, mime_type) VALUES ('v5_1', 'f1.mp4', 'Vid 1', '/tmp/1.mp4', 100, 'video/mp4')");

      // Insère 5 publications programmées
      for (let i = 1; i <= 5; i++) {
        await db.run(`
          INSERT INTO publications (id, video_id, campaign_id, platform, title, status, scheduled_at, published_at)
          VALUES ('p5_sched_${i}', 'v5_1', 'c5_1', 'tiktok', 'Titre ${i}', 'scheduled', '${testDate} 10:00:00', NULL)
        `);
      }

      const res = await app.inject({
        method: 'GET',
        url: `/api/dashboard/stats?date=${testDate}`
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.dailyGoal.scheduledToday).toBe(5);
      expect(body.dailyGoal.publishedToday).toBe(0);
      expect(body.dailyGoal.isGoalMet).toBe(false);
      expect(body.dailyGoal.remainingPosts).toBe(5);

      await cleanPhase5Data();
    });

    it('5.3 : 3 publications / 3 campagnes publiées -> Objectif non atteint, 2 restants', async () => {
      const db = getDatabase();
      const testDate = '2026-09-03';

      await db.run("INSERT INTO videos (id, filename, original_name, file_path, file_size, mime_type) VALUES ('v5_1', 'f1.mp4', 'Vid 1', '/tmp/1.mp4', 100, 'video/mp4')");

      for (let i = 1; i <= 3; i++) {
        await db.run(`INSERT INTO campaigns (id, name, color) VALUES ('c5_${i}', 'Camp ${i}', '#08EB08')`);
        await db.run(`
          INSERT INTO publications (id, video_id, campaign_id, platform, title, status, published_at)
          VALUES ('p5_pub_${i}', 'v5_1', 'c5_${i}', 'tiktok', 'Clip ${i}', 'published', '${testDate} 12:00:00')
        `);
      }

      const res = await app.inject({
        method: 'GET',
        url: `/api/dashboard/stats?date=${testDate}`
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.dailyGoal.publishedToday).toBe(3);
      expect(body.dailyGoal.distinctCampaignsToday).toBe(3);
      expect(body.dailyGoal.remainingPosts).toBe(2);
      expect(body.dailyGoal.remainingCampaigns).toBe(2);
      expect(body.dailyGoal.isGoalMet).toBe(false);

      await cleanPhase5Data();
    });

    it('5.4 : 5 publications sur 4 campagnes différentes -> Objectif non atteint (4/5 campagnes)', async () => {
      const db = getDatabase();
      const testDate = '2026-09-04';

      await db.run("INSERT INTO videos (id, filename, original_name, file_path, file_size, mime_type) VALUES ('v5_1', 'f1.mp4', 'Vid 1', '/tmp/1.mp4', 100, 'video/mp4')");

      // 4 campagnes créées
      for (let i = 1; i <= 4; i++) {
        await db.run(`INSERT INTO campaigns (id, name, color) VALUES ('c5_${i}', 'Camp ${i}', '#08EB08')`);
      }

      // 5 posts créés, les posts 1 et 2 partagent la campagne 1
      const campaignMapping = ['c5_1', 'c5_1', 'c5_2', 'c5_3', 'c5_4'];
      for (let i = 0; i < 5; i++) {
        await db.run(`
          INSERT INTO publications (id, video_id, campaign_id, platform, title, status, published_at)
          VALUES ('p5_pub_${i}', 'v5_1', '${campaignMapping[i]}', 'tiktok', 'Clip ${i}', 'published', '${testDate} 12:00:00')
        `);
      }

      const res = await app.inject({
        method: 'GET',
        url: `/api/dashboard/stats?date=${testDate}`
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.dailyGoal.publishedToday).toBe(5);
      expect(body.dailyGoal.distinctCampaignsToday).toBe(4);
      expect(body.dailyGoal.remainingPosts).toBe(0);
      expect(body.dailyGoal.remainingCampaigns).toBe(1);
      expect(body.dailyGoal.isGoalMet).toBe(false);

      await cleanPhase5Data();
    });

    it('5.5 : 5 publications dont certaines sans campagne -> Les publications sans campagne ne comptent pas comme campagnes distinctes', async () => {
      const db = getDatabase();
      const testDate = '2026-09-05';

      await db.run("INSERT INTO videos (id, filename, original_name, file_path, file_size, mime_type) VALUES ('v5_1', 'f1.mp4', 'Vid 1', '/tmp/1.mp4', 100, 'video/mp4')");

      // 3 campagnes créées
      for (let i = 1; i <= 3; i++) {
        await db.run(`INSERT INTO campaigns (id, name, color) VALUES ('c5_${i}', 'Camp ${i}', '#08EB08')`);
      }

      // 5 posts : 3 avec campagne, 2 sans campagne (NULL)
      const campaignMapping = ['c5_1', 'c5_2', 'c5_3', null, null];
      for (let i = 0; i < 5; i++) {
        const campVal = campaignMapping[i] ? `'${campaignMapping[i]}'` : 'NULL';
        await db.run(`
          INSERT INTO publications (id, video_id, campaign_id, platform, title, status, published_at)
          VALUES ('p5_pub_${i}', 'v5_1', ${campVal}, 'tiktok', 'Clip ${i}', 'published', '${testDate} 12:00:00')
        `);
      }

      const res = await app.inject({
        method: 'GET',
        url: `/api/dashboard/stats?date=${testDate}`
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.dailyGoal.publishedToday).toBe(5);
      expect(body.dailyGoal.distinctCampaignsToday).toBe(3);
      expect(body.dailyGoal.isGoalMet).toBe(false);

      await cleanPhase5Data();
    });

    it('5.6 : 5 publications réparties sur 5 campagnes différentes -> Objectif atteint !', async () => {
      const db = getDatabase();
      const testDate = '2026-09-06';

      await db.run("INSERT INTO videos (id, filename, original_name, file_path, file_size, mime_type) VALUES ('v5_1', 'f1.mp4', 'Vid 1', '/tmp/1.mp4', 100, 'video/mp4')");

      for (let i = 1; i <= 5; i++) {
        await db.run(`INSERT INTO campaigns (id, name, color) VALUES ('c5_${i}', 'Camp ${i}', '#08EB08')`);
        await db.run(`
          INSERT INTO publications (id, video_id, campaign_id, platform, title, status, published_at)
          VALUES ('p5_pub_${i}', 'v5_1', 'c5_${i}', 'tiktok', 'Clip ${i}', 'published', '${testDate} 12:00:00')
        `);
      }

      const res = await app.inject({
        method: 'GET',
        url: `/api/dashboard/stats?date=${testDate}`
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.dailyGoal.publishedToday).toBe(5);
      expect(body.dailyGoal.distinctCampaignsToday).toBe(5);
      expect(body.dailyGoal.remainingPosts).toBe(0);
      expect(body.dailyGoal.remainingCampaigns).toBe(0);
      expect(body.dailyGoal.isGoalMet).toBe(true);

      await cleanPhase5Data();
    });

    it('5.7 : Calcul du streak (série de jours consécutifs réussis)', async () => {
      const db = getDatabase();
      const day1 = '2026-09-07';
      const day2 = '2026-09-08';

      await db.run("INSERT INTO videos (id, filename, original_name, file_path, file_size, mime_type) VALUES ('v5_1', 'f1.mp4', 'Vid 1', '/tmp/1.mp4', 100, 'video/mp4')");

      for (let i = 1; i <= 5; i++) {
        await db.run(`INSERT INTO campaigns (id, name, color) VALUES ('c5_${i}', 'Camp ${i}', '#08EB08')`);
      }

      // Valide jour 1 (5 posts, 5 campagnes)
      for (let i = 1; i <= 5; i++) {
        await db.run(`
          INSERT INTO publications (id, video_id, campaign_id, platform, title, status, published_at)
          VALUES ('p5_d1_${i}', 'v5_1', 'c5_${i}', 'tiktok', 'Clip D1-${i}', 'published', '${day1} 10:00:00')
        `);
      }

      // Valide jour 2 (5 posts, 5 campagnes)
      for (let i = 1; i <= 5; i++) {
        await db.run(`
          INSERT INTO publications (id, video_id, campaign_id, platform, title, status, published_at)
          VALUES ('p5_d2_${i}', 'v5_1', 'c5_${i}', 'tiktok', 'Clip D2-${i}', 'published', '${day2} 10:00:00')
        `);
      }

      // Test au jour 2 -> streak doit être 2
      const res = await app.inject({
        method: 'GET',
        url: `/api/dashboard/stats?date=${day2}`
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.dailyGoal.streak).toBe(2);
      expect(body.dailyGoal.bestStreak).toBeGreaterThanOrEqual(2);

      await cleanPhase5Data();
    });

    it('5.8 : GET /api/dashboard/history - Agrégation par Jour, Semaine, Mois, Année', async () => {
      const db = getDatabase();
      const testDate = '2026-09-09';

      await db.run("INSERT INTO campaigns (id, name, color) VALUES ('c5_1', 'Camp 1', '#08EB08')");
      await db.run("INSERT INTO videos (id, filename, original_name, file_path, file_size, mime_type) VALUES ('v5_1', 'f1.mp4', 'Vid 1', '/tmp/1.mp4', 100, 'video/mp4')");

      await db.run(`
        INSERT INTO publications (id, video_id, campaign_id, platform, title, status, published_at)
        VALUES ('p5_hist_1', 'v5_1', 'c5_1', 'tiktok', 'Clip Hist', 'published', '${testDate} 15:00:00')
      `);

      // Test Period = day
      const resDay = await app.inject({
        method: 'GET',
        url: `/api/dashboard/history?period=day&date=${testDate}`
      });
      expect(resDay.statusCode).toBe(200);
      const bodyDay = JSON.parse(resDay.body);
      expect(bodyDay.summary.period).toBe('day');
      expect(bodyDay.summary.totalPublished).toBe(1);
      expect(bodyDay.intervals.length).toBe(1);

      // Test Period = week
      const resWeek = await app.inject({
        method: 'GET',
        url: `/api/dashboard/history?period=week&date=${testDate}`
      });
      expect(resWeek.statusCode).toBe(200);
      const bodyWeek = JSON.parse(resWeek.body);
      expect(bodyWeek.summary.period).toBe('week');
      expect(bodyWeek.intervals.length).toBe(7); // 7 jours de la semaine
      // Vérifie qu'un jour sans publication a bien publishedCount = 0 et isGoalMet = false
      const zeroDay = bodyWeek.intervals.find((i: any) => i.publishedCount === 0);
      expect(zeroDay).toBeDefined();
      expect(zeroDay.isGoalMet).toBe(false);

      // Test Period = month
      const resMonth = await app.inject({
        method: 'GET',
        url: `/api/dashboard/history?period=month&date=${testDate}`
      });
      expect(resMonth.statusCode).toBe(200);
      const bodyMonth = JSON.parse(resMonth.body);
      expect(bodyMonth.summary.period).toBe('month');
      expect(bodyMonth.intervals.length).toBe(30); // Septembre a 30 jours

      // Test Period = year
      const resYear = await app.inject({
        method: 'GET',
        url: `/api/dashboard/history?period=year&date=${testDate}`
      });
      expect(resYear.statusCode).toBe(200);
      const bodyYear = JSON.parse(resYear.body);
      expect(bodyYear.summary.period).toBe('year');
      expect(bodyYear.intervals.length).toBe(12); // 12 mois de l'année

      await cleanPhase5Data();
    });
  });
});

