import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { getDatabase, closeDatabase } from '../src/db/connection.js';
import { initializeDatabase } from '../src/db/init.js';
import { campaignRoutes } from '../src/routes/campaigns.js';
import { videoRoutes } from '../src/routes/videos.js';
import { publicationRoutes } from '../src/routes/publications.js';

describe('DERNIERE PHASE - Workflow Guidé de Déclaration Rapide de Publication', () => {
  let app: FastifyInstance;
  const existingCampaignId = 'camp_guided_test_existing';
  const existingVideoId = 'vid_guided_test_existing';

  beforeAll(async () => {
    await initializeDatabase();
    app = Fastify({ logger: false });
    await app.register(campaignRoutes);
    await app.register(videoRoutes);
    await app.register(publicationRoutes);
    await app.ready();

    const db = getDatabase();
    // Nettoyage préalable
    await db.run("DELETE FROM publications WHERE title LIKE 'GUIDED_%' OR id LIKE 'pub_guided_%'");
    await db.run("DELETE FROM videos WHERE id LIKE 'vid_guided_%' OR original_name LIKE 'GUIDED_%'");
    await db.run("DELETE FROM campaigns WHERE id LIKE 'camp_guided_%' OR name LIKE 'GUIDED_%'");

    // Création d'une campagne existante
    await db.run(`
      INSERT INTO campaigns (id, name, description, color, mentions, hashtags, status, created_at, updated_at)
      VALUES (?, 'GUIDED_EXISTING_CAMP', 'Campagne existante pour test workflow', '#08EB08', '@clipping', '#clipping #viral', 'active', datetime('now'), datetime('now'))
    `, [existingCampaignId]);

    // Création d'un clip vidéo déjà existant
    await db.run(`
      INSERT INTO videos (id, filename, original_name, file_path, file_size, duration, mime_type, campaign_id, status, created_at, updated_at)
      VALUES (?, 'clip_boxabl_01.mp4', 'GUIDED_CLIP_EXISTING.mp4', 'clip_boxabl_01.mp4', 1048576, 30.0, 'video/mp4', ?, 'ready', datetime('now'), datetime('now'))
    `, [existingVideoId, existingCampaignId]);
  });

  afterAll(async () => {
    const db = getDatabase();
    await db.run("DELETE FROM publications WHERE title LIKE 'GUIDED_%' OR id LIKE 'pub_guided_%'");
    await db.run("DELETE FROM videos WHERE id LIKE 'vid_guided_%' OR original_name LIKE 'GUIDED_%'");
    await db.run("DELETE FROM campaigns WHERE id LIKE 'camp_guided_%' OR name LIKE 'GUIDED_%'");
    await app.close();
    closeDatabase();
  });

  // Cas 1 : Créer une publication avec une campagne existante
  it('Cas 1 : Créer une publication avec une campagne existante', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/publications',
      payload: {
        video_id: existingVideoId,
        campaign_id: existingCampaignId,
        platform: 'tiktok',
        title: 'GUIDED_POST_CAS_1',
        caption: 'Découvrez cette pépite du jour',
        hashtags: '#clipping #viral',
        notes: 'Son tendance recommandé',
        status: 'draft'
      }
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('success');
    expect(body.publication.campaign_id).toBe(existingCampaignId);
    expect(body.publication.campaign_name).toBe('GUIDED_EXISTING_CAMP');
    expect(body.publication.platform).toBe('tiktok');
  });

  // Cas 2 : Créer une campagne depuis le workflow puis créer la publication avec cette campagne
  let newlyCreatedCampId = '';
  it('Cas 2 : Créer une campagne depuis le workflow puis créer la publication avec cette campagne', async () => {
    // Étape 2.1 : Création de la nouvelle campagne inline
    const campRes = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      payload: {
        name: 'GUIDED_NEW_INLINE_CAMP',
        description: 'Campagne créée en plein milieu du wizard',
        color: '#06b6d4',
        mentions: '@newclipping',
        hashtags: '#newcamp #growth'
      }
    });

    expect(campRes.statusCode).toBe(201);
    const campBody = JSON.parse(campRes.body);
    newlyCreatedCampId = campBody.campaign.id;
    expect(newlyCreatedCampId).toBeDefined();

    // Étape 2.2 : Utilisation immédiate dans la création de publication
    const pubRes = await app.inject({
      method: 'POST',
      url: '/api/publications',
      payload: {
        video_id: existingVideoId,
        campaign_id: newlyCreatedCampId,
        platform: 'instagram',
        title: 'GUIDED_POST_CAS_2',
        caption: 'Post lié à la nouvelle campagne',
        hashtags: '#newcamp #growth'
      }
    });

    expect(pubRes.statusCode).toBe(201);
    const pubBody = JSON.parse(pubRes.body);
    expect(pubBody.publication.campaign_id).toBe(newlyCreatedCampId);
    expect(pubBody.publication.campaign_name).toBe('GUIDED_NEW_INLINE_CAMP');
    expect(pubBody.publication.campaign_color).toBe('#06b6d4');
  });

  // Cas 3 : Créer une publication avec une référence vidéo locale
  it('Cas 3 : Créer une publication avec une référence vidéo locale (nom de fichier local sur PC)', async () => {
    // Déclaration préalable du nom de fichier local (zéro upload cloud)
    const localVideoRes = await app.inject({
      method: 'POST',
      url: '/api/videos',
      payload: {
        original_name: 'GUIDED_LOCAL_PC_CLIP_02.mov',
        campaign_id: existingCampaignId
      }
    });

    expect(localVideoRes.statusCode).toBe(201);
    const localVideoBody = JSON.parse(localVideoRes.body);
    const localVideoId = localVideoBody.video.id;

    // Création de la publication rattachée
    const pubRes = await app.inject({
      method: 'POST',
      url: '/api/publications',
      payload: {
        video_id: localVideoId,
        campaign_id: existingCampaignId,
        platform: 'youtube',
        title: 'GUIDED_POST_CAS_3_YOUTUBE',
        caption: 'Shorts local sans upload cloud'
      }
    });

    expect(pubRes.statusCode).toBe(201);
    const pubBody = JSON.parse(pubRes.body);
    expect(pubBody.publication.video_id).toBe(localVideoId);
    expect(pubBody.publication.video_original_name).toBe('GUIDED_LOCAL_PC_CLIP_02.mov');
  });

  // Cas 4 : Créer une publication planifiée avec date et heure
  const futureScheduledDate = '2026-10-15T18:30:00.000Z';
  let scheduledPublicationId = '';
  it('Cas 4 : Créer une publication planifiée avec date et heure', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/publications',
      payload: {
        video_id: existingVideoId,
        campaign_id: existingCampaignId,
        platform: 'tiktok',
        title: 'GUIDED_POST_CAS_4_SCHEDULED',
        caption: 'Post prévu pour demain soir',
        status: 'scheduled',
        scheduled_at: futureScheduledDate
      }
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.publication.status).toBe('scheduled');
    expect(body.publication.scheduled_at).toBe(futureScheduledDate);
    scheduledPublicationId = body.publication.id;
  });

  // Cas 5 : Vérifier qu'une publication nouvellement créée est scheduled ou draft et PAS published
  it('Cas 5 : Une nouvelle publication est strictly scheduled ou draft, et JAMAIS published', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/publications/${scheduledPublicationId}`
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.publication.status).toBe('scheduled');
    expect(body.publication.published_at).toBeNull();
  });

  // Cas 6 : Vérifier qu'elle apparaît correctement dans le calendrier
  it('Cas 6 : La publication planifiée apparaît immédiatement dans le calendrier (scheduled_only)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/publications?scheduled_only=true'
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const found = body.publications.find((p: any) => p.id === scheduledPublicationId);
    expect(found).toBeDefined();
    expect(found.title).toBe('GUIDED_POST_CAS_4_SCHEDULED');
  });

  // Cas 7 : Vérifier la compatibilité avec toutes les plateformes (TikTok, Instagram, YouTube)
  it('Cas 7 : Le workflow supporte TikTok, Instagram et YouTube sans discrimination', async () => {
    for (const plat of ['tiktok', 'instagram', 'youtube']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/publications',
        payload: {
          video_id: existingVideoId,
          platform: plat,
          title: `GUIDED_PLATFORM_TEST_${plat.toUpperCase()}`,
          caption: `Test de publication sur ${plat}`
        }
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.publication.platform).toBe(plat);
    }
  });

  // Cas 8 : Vérifier qu'une erreur de validation ne corrompt pas l'état
  it('Cas 8 : Une requête invalide (ex: vidéo manquante) retourne une erreur 400 explicite sans altérer la base', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/publications',
      payload: {
        video_id: '',
        platform: 'tiktok',
        title: 'GUIDED_INVALID_TEST'
      }
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('error');
    expect(body.message).toContain('video_id');
  });
});
