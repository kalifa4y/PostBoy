import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDatabase, closeDatabase } from '../src/db/connection.js';
import { initializeDatabase } from '../src/db/init.js';
import { publicationRoutes } from '../src/routes/publications.js';
import { publicationService, getUploadsDir } from '../src/services/publicationService.js';
import { pollAndPublishDuePublications } from '../src/services/publicationScheduler.js';
import { encryptData } from '../src/utils/crypto.js';

describe('PHASE 7 - Moteur de Publication Automatique', () => {
  let app: FastifyInstance;
  let testVideoPath: string;
  const testVideoFilename = 'engine_test_video.mp4';

  beforeAll(async () => {
    initializeDatabase();
    app = Fastify({ logger: false });
    await app.register(publicationRoutes);
    await app.ready();

    // Création d'un vrai fichier vidéo factice dans uploads/ pour tester les validations
    const uploadsDir = getUploadsDir();
    testVideoPath = path.resolve(uploadsDir, testVideoFilename);
    fs.writeFileSync(testVideoPath, Buffer.from('FAKE_MP4_VIDEO_HEADER_DATA_12345'));

    // Nettoyage préalable des données de test
    const db = getDatabase();
    db.prepare("DELETE FROM publication_logs WHERE publication_id LIKE 'test_pub_engine_%'").run();
    db.prepare("DELETE FROM publications WHERE id LIKE 'test_pub_engine_%'").run();
    db.prepare("DELETE FROM videos WHERE id LIKE 'test_vid_engine_%'").run();
    db.prepare("DELETE FROM social_accounts WHERE id LIKE 'test_sa_engine_%'").run();
  });

  afterAll(async () => {
    // Nettoyage final
    const db = getDatabase();
    db.prepare("DELETE FROM publication_logs WHERE publication_id LIKE 'test_pub_engine_%'").run();
    db.prepare("DELETE FROM publications WHERE id LIKE 'test_pub_engine_%'").run();
    db.prepare("DELETE FROM videos WHERE id LIKE 'test_vid_engine_%'").run();
    db.prepare("DELETE FROM social_accounts WHERE id LIKE 'test_sa_engine_%'").run();

    if (fs.existsSync(testVideoPath)) {
      try {
        fs.unlinkSync(testVideoPath);
      } catch {}
    }

    await app.close();
    closeDatabase();
  });

  // Helper pour insérer les dépendances de test
  const setupTestEntities = (options: {
    pubId: string;
    platform: 'tiktok' | 'instagram' | 'youtube';
    status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled';
    scheduledAt?: string | null;
    accountPlatform?: 'tiktok' | 'instagram' | 'youtube';
    withAccount?: boolean;
    withVideoFile?: boolean;
    externalUrl?: string;
  }) => {
    const db = getDatabase();
    const vidId = `test_vid_engine_${options.pubId}`;
    const saId = `test_sa_engine_${options.pubId}`;

    // 1. Vidéo
    const filename = options.withVideoFile === false ? 'non_existent_file.mp4' : testVideoFilename;
    db.prepare(`
      INSERT OR REPLACE INTO videos (
        id, filename, original_name, file_path, file_size, mime_type, status
      ) VALUES (?, ?, 'TEST_VIDEO', ?, 1024, 'video/mp4', 'ready')
    `).run(vidId, filename, `/uploads/${filename}`);

    // 2. Compte social
    let assignedAccountId: string | null = null;
    if (options.withAccount !== false) {
      assignedAccountId = saId;
      const accountPlatform = options.accountPlatform || options.platform;
      const encAccess = encryptData('mock_test_token_secret');
      const encRefresh = encryptData('mock_refresh_token_secret');

      db.prepare(`
        INSERT OR REPLACE INTO social_accounts (
          id, platform, account_id, username, display_name,
          access_token_encrypted, refresh_token_encrypted, status
        ) VALUES (?, ?, ?, 'test_engine_user', 'Test Engine User', ?, ?, 'connected')
      `).run(saId, accountPlatform, `acc_${options.pubId}`, encAccess, encRefresh);
    }

    // 3. Publication
    db.prepare(`
      INSERT OR REPLACE INTO publications (
        id, video_id, social_account_id, platform, title, caption,
        status, scheduled_at, external_url
      ) VALUES (?, ?, ?, ?, 'Test Engine Pub', 'Caption test engine', ?, ?, ?)
    `).run(
      options.pubId,
      vidId,
      assignedAccountId,
      options.platform,
      options.status,
      options.scheduledAt || null,
      options.externalUrl || null
    );
  };

  // =========================================================================
  // 1. SCHEDULER & CONDITIONS D'ÉCHÉANCE
  // =========================================================================
  describe('1. Planificateur périodique & Détection des échéances', () => {
    it('1.1. Ignore les publications programmées dans le futur', async () => {
      const pubId = 'test_pub_engine_future';
      setupTestEntities({
        pubId,
        platform: 'youtube',
        status: 'scheduled',
        scheduledAt: new Date(Date.now() + 2 * 3600 * 1000).toISOString() // +2 heures
      });

      const polled = await pollAndPublishDuePublications(10);
      const db = getDatabase();
      const pub = db.prepare('SELECT status FROM publications WHERE id = ?').get(pubId) as any;

      expect(pub.status).toBe('scheduled');
    });

    it('1.2. Ignore les publications avec statut draft ou cancelled', async () => {
      const draftId = 'test_pub_engine_draft';
      const cancelledId = 'test_pub_engine_cancelled';

      setupTestEntities({ pubId: draftId, platform: 'youtube', status: 'draft', scheduledAt: null });
      setupTestEntities({ pubId: cancelledId, platform: 'youtube', status: 'cancelled', scheduledAt: null });

      await pollAndPublishDuePublications(10);
      const db = getDatabase();

      const draftPub = db.prepare('SELECT status FROM publications WHERE id = ?').get(draftId) as any;
      const cancelledPub = db.prepare('SELECT status FROM publications WHERE id = ?').get(cancelledId) as any;

      expect(draftPub.status).toBe('draft');
      expect(cancelledPub.status).toBe('cancelled');
    });

    it('1.3. Détecte et traite une publication échue (scheduled_at <= maintenant)', async () => {
      const pubId = 'test_pub_engine_due';
      setupTestEntities({
        pubId,
        platform: 'youtube',
        status: 'scheduled',
        scheduledAt: new Date(Date.now() - 60 * 1000).toISOString() // -1 minute
      });

      // Mock de YouTube pour valider le traitement
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('upload/youtube/v3/videos')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ Location: 'https://upload-peer.youtube.com/upload-session-xyz' })
          } as any;
        }
        if (url.includes('upload-peer.youtube.com')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'YT_PUBLISHED_VID_123' })
          } as any;
        }
        return { ok: false, status: 404 } as any;
      });

      try {
        const polled = await pollAndPublishDuePublications(10);
        expect(polled).toBeGreaterThanOrEqual(1);

        const db = getDatabase();
        const pub = db.prepare('SELECT status, published_at, external_post_id FROM publications WHERE id = ?').get(pubId) as any;

        expect(pub.status).toBe('published');
        expect(pub.published_at).toBeDefined();
        expect(pub.external_post_id).toBe('YT_PUBLISHED_VID_123');
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  // =========================================================================
  // 2. PROTECTION ANTI-DOUBLE PUBLICATION & CLAIM ATOMIQUE
  // =========================================================================
  describe('2. Protection anti-double publication & Claim atomique', () => {
    it('2.1. Deux exécutions simultanées ne publient qu une seule fois la même publication', async () => {
      const pubId = 'test_pub_engine_concurrency';
      setupTestEntities({
        pubId,
        platform: 'youtube',
        status: 'scheduled',
        scheduledAt: new Date(Date.now() - 10000).toISOString()
      });

      let callCount = 0;
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        // Simuler un temps de réseau
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          ok: true,
          status: 200,
          headers: new Headers({ Location: 'https://upload.youtube.com/loc' }),
          json: async () => ({ id: 'VID_CONCURRENCY_1' })
        } as any;
      });

      try {
        // Déclenchement de 2 appels simultanés (ex: scheduler + appel manuel en même temps)
        const [res1, res2] = await Promise.all([
          publicationService.publishPublication(pubId, { forceManual: false }),
          publicationService.publishPublication(pubId, { forceManual: false })
        ]);

        // Un seul des deux doit avoir réussi le claim
        const successes = [res1.success, res2.success].filter(Boolean);
        expect(successes.length).toBe(1);

        const db = getDatabase();
        const pub = db.prepare('SELECT status FROM publications WHERE id = ?').get(pubId) as any;
        expect(pub.status).toBe('published');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('2.2. Refuse de republier une publication déjà publiée', async () => {
      const pubId = 'test_pub_engine_already_published';
      setupTestEntities({
        pubId,
        platform: 'youtube',
        status: 'published'
      });

      const res = await publicationService.publishPublication(pubId, { forceManual: true });
      expect(res.success).toBe(false);
      expect(res.errorMessage).toContain('déjà été publiée');
    });

    it('2.3. Refuse de publier une publication annulée', async () => {
      const pubId = 'test_pub_engine_refuse_cancelled';
      setupTestEntities({
        pubId,
        platform: 'youtube',
        status: 'cancelled'
      });

      const res = await publicationService.publishPublication(pubId, { forceManual: true });
      expect(res.success).toBe(false);
      expect(res.errorMessage).toContain('annulée');
    });
  });

  // =========================================================================
  // 3. VALIDATION FICHIERS LOCAUX & SÉCURITÉ TOKENS
  // =========================================================================
  describe('3. Validation fichiers locaux & Sécurité', () => {
    it('3.1. Échoue si le fichier vidéo physique est introuvable', async () => {
      const pubId = 'test_pub_engine_missing_video';
      setupTestEntities({
        pubId,
        platform: 'youtube',
        status: 'scheduled',
        withVideoFile: false
      });

      const res = await publicationService.publishPublication(pubId, { forceManual: true });
      expect(res.success).toBe(false);
      expect(res.errorMessage).toContain('Fichier vidéo local introuvable');

      const db = getDatabase();
      const pub = db.prepare('SELECT status, error_message FROM publications WHERE id = ?').get(pubId) as any;
      expect(pub.status).toBe('failed');
      expect(pub.error_message).toContain('introuvable');
    });

    it('3.2. Échoue si aucun compte social n est rattaché', async () => {
      const pubId = 'test_pub_engine_no_account';
      setupTestEntities({
        pubId,
        platform: 'youtube',
        status: 'scheduled',
        withAccount: false
      });

      const res = await publicationService.publishPublication(pubId, { forceManual: true });
      expect(res.success).toBe(false);
      expect(res.errorMessage).toContain('Aucun compte social associé');

      const db = getDatabase();
      const pub = db.prepare('SELECT status FROM publications WHERE id = ?').get(pubId) as any;
      expect(pub.status).toBe('failed');
    });

    it('3.3. Échoue si la plateforme du compte ne correspond pas à la publication', async () => {
      const pubId = 'test_pub_engine_mismatch';
      setupTestEntities({
        pubId,
        platform: 'youtube',
        accountPlatform: 'tiktok', // Discordance
        status: 'scheduled'
      });

      const res = await publicationService.publishPublication(pubId, { forceManual: true });
      expect(res.success).toBe(false);
      expect(res.errorMessage).toContain('Incohérence de plateforme');
    });
  });

  // =========================================================================
  // 4. PUBLISHERS PAR PLATEFORME (TIKTOK, INSTAGRAM, YOUTUBE) AVEC MOCKS
  // =========================================================================
  describe('4. Publishers officiels par plateforme (Mocks)', () => {
    it('4.1. TikTok : publication complète via Content Posting API', async () => {
      const pubId = 'test_pub_engine_tt_success';
      setupTestEntities({ pubId, platform: 'tiktok', status: 'draft' });

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/creator_info/query')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ error: { code: 'ok' }, data: { creator_avatar_url: 'https://avatar' } })
          } as any;
        }
        if (url.includes('/video/init')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ data: { publish_id: 'TT_DIRECT_POST_777', upload_url: 'https://tt-upload.tiktok.com/chunk' } })
          } as any;
        }
        if (url.includes('tt-upload.tiktok.com')) {
          return { ok: true, status: 200 } as any;
        }
        return { ok: false, status: 404 } as any;
      });

      try {
        const res = await publicationService.publishPublication(pubId, { forceManual: true });
        expect(res.success).toBe(true);
        expect(res.externalPostId).toBe('TT_DIRECT_POST_777');

        const db = getDatabase();
        const pub = db.prepare('SELECT status, published_at FROM publications WHERE id = ?').get(pubId) as any;
        expect(pub.status).toBe('published');
        expect(pub.published_at).toBeDefined();
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('4.2. TikTok : détection de scope insuffisant ou non autorisé', async () => {
      const pubId = 'test_pub_engine_tt_scope_err';
      setupTestEntities({ pubId, platform: 'tiktok', status: 'draft' });

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/creator_info/query')) {
          return {
            ok: false,
            status: 403,
            text: async () => JSON.stringify({ error: { code: 'scope_not_authorized' } })
          } as any;
        }
        return { ok: false, status: 404 } as any;
      });

      try {
        const res = await publicationService.publishPublication(pubId, { forceManual: true });
        expect(res.success).toBe(false);
        expect(res.errorMessage).toContain('video.publish');

        const db = getDatabase();
        const pub = db.prepare('SELECT status, error_message FROM publications WHERE id = ?').get(pubId) as any;
        expect(pub.status).toBe('failed');
        expect(pub.error_message).toContain('video.publish');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('4.3. Instagram : échec propre si aucune URL publique n est disponible', async () => {
      const pubId = 'test_pub_engine_ig_no_url';
      setupTestEntities({ pubId, platform: 'instagram', status: 'draft' });

      const res = await publicationService.publishPublication(pubId, { forceManual: true });
      expect(res.success).toBe(false);
      expect(res.errorMessage).toContain('URL vidéo publique');
    });

    it('4.4. Instagram : publication réussie avec URL publique et mocks Meta Container', async () => {
      const pubId = 'test_pub_engine_ig_success';
      setupTestEntities({
        pubId,
        platform: 'instagram',
        status: 'draft',
        externalUrl: 'https://cdn.example.com/clips/video.mp4'
      });

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/media_publish')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'IG_PUBLISHED_REEL_999' })
          } as any;
        }
        if (url.includes('/media')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'IG_CONTAINER_555' })
          } as any;
        }
        return { ok: false, status: 404 } as any;
      });

      try {
        const res = await publicationService.publishPublication(pubId, { forceManual: true });
        expect(res.success).toBe(true);
        expect(res.externalPostId).toBe('IG_PUBLISHED_REEL_999');

        const db = getDatabase();
        const pub = db.prepare('SELECT status, published_at FROM publications WHERE id = ?').get(pubId) as any;
        expect(pub.status).toBe('published');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('4.5. YouTube : détection du scope insuffisant (youtube.readonly)', async () => {
      const pubId = 'test_pub_engine_yt_scope_err';
      setupTestEntities({ pubId, platform: 'youtube', status: 'draft' });

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('upload/youtube/v3/videos')) {
          return {
            ok: false,
            status: 403,
            text: async () => JSON.stringify({ error: { message: 'insufficientPermissions' } })
          } as any;
        }
        return { ok: false, status: 404 } as any;
      });

      try {
        const res = await publicationService.publishPublication(pubId, { forceManual: true });
        expect(res.success).toBe(false);
        expect(res.errorMessage).toContain('youtube.upload');
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  // =========================================================================
  // 5. API ENDPOINT : POST /api/publications/:id/publish
  // =========================================================================
  describe('5. API Endpoint POST /api/publications/:id/publish', () => {
    it('5.1. Déclenche manuellement la publication avec succès via HTTP', async () => {
      const pubId = 'test_pub_engine_api_success';
      setupTestEntities({
        pubId,
        platform: 'youtube',
        status: 'draft'
      });

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('upload/youtube/v3/videos')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ Location: 'https://yt.upload.url' })
          } as any;
        }
        if (url.includes('yt.upload.url')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'YT_API_VIDEO_ID_456' })
          } as any;
        }
        return { ok: false, status: 404 } as any;
      });

      try {
        const res = await app.inject({
          method: 'POST',
          url: `/api/publications/${pubId}/publish`
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.status).toBe('success');
        expect(body.publication.status).toBe('published');
        expect(body.publication.external_post_id).toBe('YT_API_VIDEO_ID_456');

        // Vérification de la création d'un journal dans publication_logs
        const db = getDatabase();
        const logs = db.prepare('SELECT * FROM publication_logs WHERE publication_id = ?').all(pubId);
        expect(logs.length).toBeGreaterThanOrEqual(1);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('5.2. Retourne 400 si la publication est déjà publiée', async () => {
      const pubId = 'test_pub_engine_api_already_done';
      setupTestEntities({ pubId, platform: 'youtube', status: 'published' });

      const res = await app.inject({
        method: 'POST',
        url: `/api/publications/${pubId}/publish`
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toContain('déjà été publiée');
    });

    it('5.3. Retourne 404 si la publication n existe pas', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/publications/non_existent_pub_id/publish'
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
