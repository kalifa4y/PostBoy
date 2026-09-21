import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { getDatabase, closeDatabase } from '../src/db/connection.js';
import { initializeDatabase } from '../src/db/init.js';
import { publicationRoutes } from '../src/routes/publications.js';
import { urlResolverService, isValidHttpUrl } from '../src/services/urlResolverService.js';
import { encryptData } from '../src/utils/crypto.js';

describe('PHASE 8 - Récupération et Stockage des URLs des Publications', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    initializeDatabase();
    app = Fastify({ logger: false });
    await app.register(publicationRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeDatabase();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    const db = getDatabase();
    db.prepare("DELETE FROM publications WHERE id LIKE 'pub_%'").run();
    db.prepare("DELETE FROM social_accounts WHERE id LIKE 'sa_%'").run();
    db.prepare("DELETE FROM videos WHERE id LIKE 'vid_p8_%'").run();
    db.prepare("DELETE FROM campaigns WHERE id = 'camp_p8_01'").run();
  });

  // Helper pour insérer une campagne et une vidéo
  function insertTestVideo(videoId = 'vid_p8_01') {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO campaigns (id, name, color, status)
      VALUES ('camp_p8_01', 'Campagne Phase 8', '#08EB08', 'active')
    `).run();

    db.prepare(`
      INSERT INTO videos (id, filename, original_name, file_path, file_size, mime_type, campaign_id, status)
      VALUES (?, 'clip_p8.mp4', 'clip_p8.mp4', 'uploads/clip_p8.mp4', 1048576, 'video/mp4', 'camp_p8_01', 'ready')
    `).run(videoId);
  }

  // Helper pour insérer un compte social connecté avec tokens chiffrés
  function insertTestAccount(accId = 'sa_p8_01', platform = 'youtube', username = 'testcreator') {
    const db = getDatabase();
    const tokenEnc = encryptData(`token_secret_${accId}`);
    db.prepare(`
      INSERT INTO social_accounts (id, platform, account_id, username, display_name, access_token_encrypted, status)
      VALUES (?, ?, ?, ?, ?, ?, 'connected')
    `).run(accId, platform, `acc_platform_${accId}`, username, `Creator ${username}`, tokenEnc);
  }

  // Helper pour insérer une publication
  function insertPublication(pub: {
    id: string;
    videoId?: string;
    socialAccountId?: string | null;
    platform: string;
    status: string;
    externalPostId?: string | null;
    externalUrl?: string | null;
    postUrl?: string | null;
  }) {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO publications (
        id, video_id, campaign_id, social_account_id, platform, title, caption,
        status, scheduled_at, published_at, external_post_id, post_url, external_url,
        created_at, updated_at
      ) VALUES (
        ?, ?, 'camp_p8_01', ?, ?, 'Titre Test', 'Légende Test',
        ?, datetime('now'), datetime('now'), ?, ?, ?,
        datetime('now'), datetime('now')
      )
    `).run(
      pub.id,
      pub.videoId || 'vid_p8_01',
      pub.socialAccountId || null,
      pub.platform,
      pub.status,
      pub.externalPostId || null,
      pub.postUrl || null,
      pub.externalUrl || null
    );
  }

  // =========================================================================
  // 1. Validation des URLs (Sécurité & Format)
  // =========================================================================
  describe('1. Validation stricte des URLs (isValidHttpUrl)', () => {
    it('1.1. Accepte les URLs HTTPS et HTTP valides', () => {
      expect(isValidHttpUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
      expect(isValidHttpUrl('https://www.instagram.com/reel/C_abc123/')).toBe(true);
      expect(isValidHttpUrl('https://www.tiktok.com/@creator/video/1234567890')).toBe(true);
      expect(isValidHttpUrl('http://localhost:3000/post/1')).toBe(true);
    });

    it('1.2. Rejette les schémas arbitraires ou malveillants', () => {
      expect(isValidHttpUrl('javascript:alert(1)')).toBe(false);
      expect(isValidHttpUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')).toBe(false);
      expect(isValidHttpUrl('file:///etc/passwd')).toBe(false);
      expect(isValidHttpUrl('ftp://ftp.example.com/video.mp4')).toBe(false);
      expect(isValidHttpUrl('')).toBe(false);
      expect(isValidHttpUrl('   ')).toBe(false);
      expect(isValidHttpUrl(null)).toBe(false);
      expect(isValidHttpUrl(undefined)).toBe(false);
      expect(isValidHttpUrl('not_an_url')).toBe(false);
    });
  });

  // =========================================================================
  // 2. Préconditions & Rejet des publications non éligibles
  // =========================================================================
  describe('2. Préconditions de Résolution', () => {
    beforeEach(() => {
      insertTestVideo();
      insertTestAccount('sa_yt_01', 'youtube');
    });

    it('2.1. Échoue si la publication n existe pas', async () => {
      const result = await urlResolverService.resolvePublicationUrl('non_existent_id');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Publication introuvable');
    });

    it('2.2. Échoue si la publication est en statut draft, scheduled, failed ou cancelled', async () => {
      for (const status of ['draft', 'scheduled', 'failed', 'cancelled', 'publishing']) {
        const pubId = `pub_status_${status}`;
        insertPublication({
          id: pubId,
          socialAccountId: 'sa_yt_01',
          platform: 'youtube',
          status,
          externalPostId: 'yt_123'
        });

        const result = await urlResolverService.resolvePublicationUrl(pubId);
        expect(result.success).toBe(false);
        expect(result.message).toContain('seul le statut \'published\' est éligible');
      }
    });

    it('2.3. Échoue si la publication est published mais n a aucun external_post_id', async () => {
      insertPublication({
        id: 'pub_no_ext_id',
        socialAccountId: 'sa_yt_01',
        platform: 'youtube',
        status: 'published',
        externalPostId: null
      });

      const result = await urlResolverService.resolvePublicationUrl('pub_no_ext_id');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Aucun identifiant de publication externe');
    });
  });

  // =========================================================================
  // 3. Idempotence & Préservation d'URL existante
  // =========================================================================
  describe('3. Idempotence de la résolution', () => {
    beforeEach(() => {
      insertTestVideo();
      insertTestAccount('sa_yt_01', 'youtube');
    });

    it('3.1. Ne fait aucun appel externe si external_url est déjà valide et la retourne directement', async () => {
      const existingUrl = 'https://www.youtube.com/watch?v=already_resolved_id';
      insertPublication({
        id: 'pub_idempotent_01',
        socialAccountId: 'sa_yt_01',
        platform: 'youtube',
        status: 'published',
        externalPostId: 'already_resolved_id',
        externalUrl: existingUrl
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const result = await urlResolverService.resolvePublicationUrl('pub_idempotent_01');
      expect(result.success).toBe(true);
      expect(result.alreadyResolved).toBe(true);
      expect(result.externalUrl).toBe(existingUrl);
      // Zéro appel fetch externe
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('3.2. Une URL déjà enregistrée n est jamais effacée par une tentative infructueuse', async () => {
      const existingUrl = 'https://www.instagram.com/reel/C_secure123/';
      insertTestAccount('sa_ig_01', 'instagram');
      insertPublication({
        id: 'pub_idempotent_ig',
        socialAccountId: 'sa_ig_01',
        platform: 'instagram',
        status: 'published',
        externalPostId: 'ig_media_secure',
        externalUrl: existingUrl
      });

      const result = await urlResolverService.resolvePublicationUrl('pub_idempotent_ig');
      expect(result.success).toBe(true);
      expect(result.externalUrl).toBe(existingUrl);

      const db = getDatabase();
      const pub = db.prepare('SELECT external_url FROM publications WHERE id = ?').get('pub_idempotent_ig') as any;
      expect(pub.external_url).toBe(existingUrl);
    });
  });

  // =========================================================================
  // 4. Résolution YouTube
  // =========================================================================
  describe('4. Plateforme YouTube', () => {
    beforeEach(() => {
      insertTestVideo();
      insertTestAccount('sa_yt_test', 'youtube');
    });

    it('4.1. Résout et enregistre l URL déterministe YouTube officielle', async () => {
      const videoId = 'dQw4w9WgXcQ';
      insertPublication({
        id: 'pub_yt_resolve',
        socialAccountId: 'sa_yt_test',
        platform: 'youtube',
        status: 'published',
        externalPostId: videoId,
        externalUrl: null
      });

      const result = await urlResolverService.resolvePublicationUrl('pub_yt_resolve');
      expect(result.success).toBe(true);
      expect(result.externalUrl).toBe(`https://www.youtube.com/watch?v=${videoId}`);

      // Vérification SQLite
      const db = getDatabase();
      const pub = db.prepare('SELECT external_url, post_url FROM publications WHERE id = ?').get('pub_yt_resolve') as any;
      expect(pub.external_url).toBe(`https://www.youtube.com/watch?v=${videoId}`);
      expect(pub.post_url).toBe(`https://www.youtube.com/watch?v=${videoId}`);

      // Vérification log d'audit
      const log = db.prepare('SELECT * FROM publication_logs WHERE publication_id = ? AND event = ?').get('pub_yt_resolve', 'url_resolved') as any;
      expect(log).toBeDefined();
      expect(log.message).toContain('URL officielle résolue pour youtube');
    });
  });

  // =========================================================================
  // 5. Résolution Instagram (Meta Graph API)
  // =========================================================================
  describe('5. Plateforme Instagram (Meta Graph API)', () => {
    beforeEach(() => {
      insertTestVideo();
      insertTestAccount('sa_ig_test', 'instagram');
    });

    it('5.1. Résout avec succès le permalink officiel retourné par Meta', async () => {
      const mediaId = '17998877665544332';
      const expectedPermalink = 'https://www.instagram.com/reel/C8XYZ123/';

      insertPublication({
        id: 'pub_ig_resolve_ok',
        socialAccountId: 'sa_ig_test',
        platform: 'instagram',
        status: 'published',
        externalPostId: mediaId,
        externalUrl: null
      });

      // Mocker l'appel fetch à l'API Meta Graph
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        if (String(url).includes(`graph.facebook.com/v21.0/${mediaId}`)) {
          return new Response(JSON.stringify({
            id: mediaId,
            permalink: expectedPermalink
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('Not Found', { status: 404 });
      });

      const result = await urlResolverService.resolvePublicationUrl('pub_ig_resolve_ok');
      expect(result.success).toBe(true);
      expect(result.externalUrl).toBe(expectedPermalink);

      const db = getDatabase();
      const pub = db.prepare('SELECT external_url FROM publications WHERE id = ?').get('pub_ig_resolve_ok') as any;
      expect(pub.external_url).toBe(expectedPermalink);
    });

    it('5.2. Gère proprement le cas où Meta ne renvoie pas de permalink', async () => {
      const mediaId = '17998877000000000';
      insertPublication({
        id: 'pub_ig_no_permalink',
        socialAccountId: 'sa_ig_test',
        platform: 'instagram',
        status: 'published',
        externalPostId: mediaId,
        externalUrl: null
      });

      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return new Response(JSON.stringify({
          id: mediaId
          // pas de permalink
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      });

      const result = await urlResolverService.resolvePublicationUrl('pub_ig_no_permalink');
      expect(result.success).toBe(false);
      expect(result.externalUrl).toBeNull();
      expect(result.message).toContain('Champ permalink non présent');

      // external_url reste NULL en base
      const db = getDatabase();
      const pub = db.prepare('SELECT external_url FROM publications WHERE id = ?').get('pub_ig_no_permalink') as any;
      expect(pub.external_url).toBeNull();
    });

    it('5.3. Gère proprement une erreur HTTP de Meta Graph API', async () => {
      const mediaId = '17998877_err';
      insertPublication({
        id: 'pub_ig_api_err',
        socialAccountId: 'sa_ig_test',
        platform: 'instagram',
        status: 'published',
        externalPostId: mediaId,
        externalUrl: null
      });

      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return new Response(JSON.stringify({
          error: { message: 'Invalid OAuth access token.', code: 190 }
        }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      });

      const result = await urlResolverService.resolvePublicationUrl('pub_ig_api_err');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Échec interrogation permalink (HTTP 401)');
    });
  });

  // =========================================================================
  // 6. Résolution TikTok (Content Posting & Display API)
  // =========================================================================
  describe('6. Plateforme TikTok (Content Posting & Display API)', () => {
    beforeEach(() => {
      insertTestVideo();
      insertTestAccount('sa_tt_test', 'tiktok');
    });

    it('6.1. Indique un traitement en cours si le statut TikTok est PROCESSING_DOWNLOAD, PROCESSING_UPLOAD ou IN_REVIEW', async () => {
      for (const procStatus of ['PROCESSING_DOWNLOAD', 'PROCESSING_UPLOAD', 'IN_REVIEW']) {
        const pubId = `pub_tt_proc_${procStatus}`;
        insertPublication({
          id: pubId,
          socialAccountId: 'sa_tt_test',
          platform: 'tiktok',
          status: 'published',
          externalPostId: `v_pub_${procStatus}`,
          externalUrl: null
        });

        vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
          if (String(url).includes('status/fetch')) {
            return new Response(JSON.stringify({
              data: { status: procStatus }
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          return new Response('Not Found', { status: 404 });
        });

        const result = await urlResolverService.resolvePublicationUrl(pubId);
        expect(result.success).toBe(false);
        expect(result.externalUrl).toBeNull();
        expect(result.message).toContain('Vidéo encore en cours de traitement par TikTok');
        expect(result.message).toContain(procStatus);
      }
    });

    it('6.2. Indique un échec si le statut TikTok est FAILED avec fail_reason', async () => {
      const pubId = 'pub_tt_failed';
      insertPublication({
        id: pubId,
        socialAccountId: 'sa_tt_test',
        platform: 'tiktok',
        status: 'published',
        externalPostId: 'v_pub_failed',
        externalUrl: null
      });

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        if (String(url).includes('status/fetch')) {
          return new Response(JSON.stringify({
            data: { status: 'FAILED', fail_reason: 'Transcoding error' }
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('Not Found', { status: 404 });
      });

      const result = await urlResolverService.resolvePublicationUrl(pubId);
      expect(result.success).toBe(false);
      expect(result.externalUrl).toBeNull();
      expect(result.message).toContain('Échec du traitement chez TikTok: Transcoding error');
    });

    it('6.3. Indique une absence de post_id public si PUBLISH_COMPLETE mais publicaly_available_post_id est vide ou absent', async () => {
      const publishId = 'v_pub_moderation_123';
      insertPublication({
        id: 'pub_tt_moderation',
        socialAccountId: 'sa_tt_test',
        platform: 'tiktok',
        status: 'published',
        externalPostId: publishId,
        externalUrl: null
      });

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        if (String(url).includes('status/fetch')) {
          return new Response(JSON.stringify({
            data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: [] }
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('Not Found', { status: 404 });
      });

      const result = await urlResolverService.resolvePublicationUrl('pub_tt_moderation');
      expect(result.success).toBe(false);
      expect(result.externalUrl).toBeNull();
      expect(result.message).toContain('publicaly_available_post_id manquant ou post privé');
    });

    it('6.4. Résout avec succès l URL officielle share_url via video/query avec PUBLISH_COMPLETE et publicaly_available_post_id', async () => {
      const publishId = 'v_pub_success_123';
      const videoId = '7123456789012345678';
      const expectedShareUrl = `https://www.tiktok.com/@testcreator/video/${videoId}`;

      insertPublication({
        id: 'pub_tt_full_success',
        socialAccountId: 'sa_tt_test',
        platform: 'tiktok',
        status: 'published',
        externalPostId: publishId,
        externalUrl: null
      });

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, options: any) => {
        const urlStr = String(url);
        if (urlStr.includes('status/fetch')) {
          return new Response(JSON.stringify({
            data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: [videoId] }
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.includes('video/query')) {
          const body = JSON.parse(options?.body || '{}');
          expect(body.filters.video_ids).toEqual([videoId]);
          return new Response(JSON.stringify({
            data: {
              videos: [
                {
                  id: videoId,
                  title: 'Test Video',
                  share_url: expectedShareUrl
                }
              ]
            }
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('Not Found', { status: 404 });
      });

      const result = await urlResolverService.resolvePublicationUrl('pub_tt_full_success');
      expect(result.success).toBe(true);
      expect(result.externalUrl).toBe(expectedShareUrl);

      const db = getDatabase();
      const pub = db.prepare('SELECT external_url FROM publications WHERE id = ?').get('pub_tt_full_success') as any;
      expect(pub.external_url).toBe(expectedShareUrl);
    });

    it('6.5. Gère proprement le cas où le scope video.list est manquant (scope_not_authorized ou HTTP 403)', async () => {
      const publishId = 'v_pub_scope_err_123';
      const videoId = '7123456789012345678';

      insertPublication({
        id: 'pub_tt_scope_err',
        socialAccountId: 'sa_tt_test',
        platform: 'tiktok',
        status: 'published',
        externalPostId: publishId,
        externalUrl: null
      });

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('status/fetch')) {
          return new Response(JSON.stringify({
            data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: [videoId] }
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.includes('video/query')) {
          return new Response(JSON.stringify({
            error: {
              code: 'scope_not_authorized',
              message: 'Scope video.list is required'
            }
          }), { status: 403, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('Not Found', { status: 404 });
      });

      const result = await urlResolverService.resolvePublicationUrl('pub_tt_scope_err');
      expect(result.success).toBe(false);
      expect(result.externalUrl).toBeNull();
      expect(result.message).toContain("Scope 'video.list' manquant");
    });

    it('6.6. Idempotence TikTok : ne fait aucun appel réseau si external_url est déjà renseignée', async () => {
      const existingUrl = 'https://www.tiktok.com/@testcreator/video/7123456789012345678';
      insertPublication({
        id: 'pub_tt_idempotent',
        socialAccountId: 'sa_tt_test',
        platform: 'tiktok',
        status: 'published',
        externalPostId: 'v_pub_idempotent',
        externalUrl: existingUrl
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const result = await urlResolverService.resolvePublicationUrl('pub_tt_idempotent');

      expect(result.success).toBe(true);
      expect(result.alreadyResolved).toBe(true);
      expect(result.externalUrl).toBe(existingUrl);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 7. Endpoint HTTP Fastify POST /api/publications/:id/resolve-url
  // =========================================================================
  describe('7. Endpoint API POST /api/publications/:id/resolve-url', () => {
    beforeEach(() => {
      insertTestVideo();
      insertTestAccount('sa_api_yt', 'youtube');
    });

    it('7.1. Retourne 404 si la publication est introuvable', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/publications/non_existent_uuid/resolve-url'
      });

      expect(res.statusCode).toBe(404);
      const data = res.json();
      expect(data.status).toBe('error');
      expect(data.message).toContain('introuvable');
    });

    it('7.2. Retourne 400 si la publication n est pas en statut published', async () => {
      insertPublication({
        id: 'pub_api_draft',
        socialAccountId: 'sa_api_yt',
        platform: 'youtube',
        status: 'draft',
        externalPostId: '123'
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/publications/pub_api_draft/resolve-url'
      });

      expect(res.statusCode).toBe(400);
      const data = res.json();
      expect(data.status).toBe('error');
      expect(data.message).toContain('seul le statut \'published\' est éligible');
    });

    it('7.3. Résout l URL et retourne 200 avec la publication mise à jour', async () => {
      const videoId = 'yt_api_vid_999';
      insertPublication({
        id: 'pub_api_resolve_ok',
        socialAccountId: 'sa_api_yt',
        platform: 'youtube',
        status: 'published',
        externalPostId: videoId,
        externalUrl: null
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/publications/pub_api_resolve_ok/resolve-url'
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.status).toBe('success');
      expect(data.external_url).toBe(`https://www.youtube.com/watch?v=${videoId}`);
      expect(data.publication.external_url).toBe(`https://www.youtube.com/watch?v=${videoId}`);
    });

    it('7.4. Idempotence API : deuxième appel retourne 200 avec already_resolved: true', async () => {
      const videoId = 'yt_api_vid_999';
      insertPublication({
        id: 'pub_api_idempotent',
        socialAccountId: 'sa_api_yt',
        platform: 'youtube',
        status: 'published',
        externalPostId: videoId,
        externalUrl: `https://www.youtube.com/watch?v=${videoId}`
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/publications/pub_api_idempotent/resolve-url'
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.status).toBe('success');
      expect(data.already_resolved).toBe(true);
      expect(data.external_url).toBe(`https://www.youtube.com/watch?v=${videoId}`);
    });
  });
});
