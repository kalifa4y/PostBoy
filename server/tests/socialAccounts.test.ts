import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { getDatabase, closeDatabase } from '../src/db/connection.js';
import { initializeDatabase } from '../src/db/init.js';
import { socialAccountRoutes } from '../src/routes/socialAccounts.js';
import { encryptData, decryptData } from '../src/utils/crypto.js';
import {
  createOAuthState,
  verifyAndConsumeOAuthState,
  clearAllOAuthStates
} from '../src/utils/oauthState.js';

describe('PHASE 6 - Social Accounts & OAuth API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    initializeDatabase();
    app = Fastify({ logger: false });
    await app.register(socialAccountRoutes);
    await app.ready();

    // Nettoyage préalable des données de test
    const db = getDatabase();
    db.prepare(`
      DELETE FROM social_accounts
      WHERE username LIKE 'test_%'
         OR username LIKE '%postboy%'
         OR id LIKE 'test_%'
         OR account_id LIKE '%999%'
         OR account_id LIKE '%001%'
         OR account_id LIKE '%888%'
    `).run();
  });

  afterAll(async () => {
    const db = getDatabase();
    db.prepare("DELETE FROM publications WHERE title LIKE 'TEST_PUB_%'").run();
    db.prepare("DELETE FROM videos WHERE original_name LIKE 'TEST_VID_%'").run();
    db.prepare(`
      DELETE FROM social_accounts
      WHERE username LIKE 'test_%'
         OR username LIKE '%postboy%'
         OR id LIKE 'test_%'
         OR account_id LIKE '%999%'
         OR account_id LIKE '%001%'
         OR account_id LIKE '%888%'
    `).run();
    await app.close();
    closeDatabase();
  });

  // =========================================================================
  // 1. BASE DE DONNÉES & INTÉGRITÉ RELATIONNELLE
  // =========================================================================
  describe('1. Base de données & Intégrité relationnelle', () => {
    it('1.1. Doit insérer et relire un compte social avec tokens chiffrés', () => {
      const db = getDatabase();
      const id = 'test_sa_1';
      const plainAccessToken = 'secret_access_token_12345';
      const plainRefreshToken = 'secret_refresh_token_67890';

      const encryptedAccess = encryptData(plainAccessToken);
      const encryptedRefresh = encryptData(plainRefreshToken);

      db.prepare(`
        INSERT INTO social_accounts (
          id, platform, account_id, username, display_name,
          access_token_encrypted, refresh_token_encrypted,
          status, token_expires_at
        ) VALUES (?, 'tiktok', 'tt_user_1', 'test_tiktok_user', 'Test TikTok User', ?, ?, 'connected', datetime('now', '+1 hour'))
      `).run(id, encryptedAccess, encryptedRefresh);

      const row = db.prepare('SELECT * FROM social_accounts WHERE id = ?').get(id) as any;
      expect(row).toBeDefined();
      expect(row.platform).toBe('tiktok');
      expect(row.username).toBe('test_tiktok_user');
      expect(row.status).toBe('connected');

      // Vérification du chiffrement AES-256-GCM
      expect(row.access_token_encrypted).not.toBe(plainAccessToken);
      expect(row.access_token_encrypted.split(':').length).toBe(3); // format iv:authTag:cipher
      expect(decryptData(row.access_token_encrypted)).toBe(plainAccessToken);
      expect(decryptData(row.refresh_token_encrypted)).toBe(plainRefreshToken);
    });

    it('1.2. Doit empêcher les doublons directs sur (platform, account_id)', () => {
      const db = getDatabase();
      const duplicateInsert = () => {
        db.prepare(`
          INSERT INTO social_accounts (
            id, platform, account_id, username, display_name,
            access_token_encrypted, status
          ) VALUES ('test_sa_dup', 'tiktok', 'tt_user_1', 'another_user', 'Another User', 'enc_token', 'connected')
        `).run();
      };

      expect(duplicateInsert).toThrow(); // Contrainte UNIQUE(platform, account_id)
    });

    it('1.3. La suppression d un compte social doit mettre social_account_id à NULL dans les publications (ON DELETE SET NULL)', () => {
      const db = getDatabase();
      const accountId = 'test_sa_cascade';
      const videoId = 'test_vid_cascade';
      const pubId = 'test_pub_cascade';

      // 1. Création compte social
      db.prepare(`
        INSERT INTO social_accounts (id, platform, account_id, username, access_token_encrypted, status)
        VALUES (?, 'youtube', 'yt_cascade', 'test_yt_cascade', 'enc', 'connected')
      `).run(accountId);

      // 2. Création vidéo
      db.prepare(`
        INSERT INTO videos (id, filename, original_name, file_path, file_size, mime_type, status)
        VALUES (?, 'vid.mp4', 'TEST_VID_CASCADE', '/tmp/vid.mp4', 1024, 'video/mp4', 'ready')
      `).run(videoId);

      // 3. Création publication liée
      db.prepare(`
        INSERT INTO publications (id, video_id, platform, title, status, social_account_id)
        VALUES (?, ?, 'youtube', 'TEST_PUB_CASCADE', 'draft', ?)
      `).run(pubId, videoId, accountId);

      // Vérification lien initial
      let pub = db.prepare('SELECT id, social_account_id FROM publications WHERE id = ?').get(pubId) as any;
      expect(pub.social_account_id).toBe(accountId);

      // 4. Suppression du compte social
      db.prepare('DELETE FROM social_accounts WHERE id = ?').run(accountId);

      // 5. Vérification que la publication existe toujours et que son social_account_id est NULL
      pub = db.prepare('SELECT id, social_account_id FROM publications WHERE id = ?').get(pubId) as any;
      expect(pub).toBeDefined();
      expect(pub.social_account_id).toBeNull();
    });
  });

  // =========================================================================
  // 2. SÉCURITÉ & PROTECTION CSRF OAUTH STATE
  // =========================================================================
  describe('2. Sécurité & Protection CSRF OAuth State', () => {
    it('2.1. Doit générer un state sécurisé et le valider une seule fois (one-time use)', () => {
      const state = createOAuthState('tiktok');
      expect(state).toHaveLength(64); // 32 octets en hex

      // Première vérification : valide
      const isValid = verifyAndConsumeOAuthState(state, 'tiktok');
      expect(isValid).toBe(true);

      // Seconde vérification avec le même state : doit échouer (consommé)
      const isReusedValid = verifyAndConsumeOAuthState(state, 'tiktok');
      expect(isReusedValid).toBe(false);
    });

    it('2.2. Doit rejeter un state associé à une autre plateforme', () => {
      const state = createOAuthState('instagram');
      const isValidForYoutube = verifyAndConsumeOAuthState(state, 'youtube');
      expect(isValidForYoutube).toBe(false);
    });

    it('2.3. Doit rejeter un state expiré', () => {
      // State avec TTL négatif (déjà expiré)
      const expiredState = createOAuthState('youtube', undefined, -1000);
      const isValid = verifyAndConsumeOAuthState(expiredState, 'youtube');
      expect(isValid).toBe(false);
    });
  });

  // =========================================================================
  // 3. API ENDPOINTS & ZERO-LEAK TEST
  // =========================================================================
  describe('3. API Endpoints & Absence de fuite de tokens', () => {
    it('3.1. GET /api/social-accounts ne doit JAMAIS retourner les tokens (access/refresh)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/social-accounts'
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.accounts)).toBe(true);

      for (const account of body.accounts) {
        expect(account.access_token_encrypted).toBeUndefined();
        expect(account.refresh_token_encrypted).toBeUndefined();
        expect(account.access_token).toBeUndefined();
        expect(account.refresh_token).toBeUndefined();
        expect(account.encrypted_credentials).toBeUndefined();
      }

      // Vérification de la présence des états de configuration de plateforme
      expect(body.platforms).toBeDefined();
      expect(body.platforms.tiktok).toBeDefined();
      expect(body.platforms.instagram).toBeDefined();
      expect(body.platforms.youtube).toBeDefined();
    });

    it('3.2. GET /api/social-accounts/:id ne doit JAMAIS retourner les tokens', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/social-accounts/test_sa_1'
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      const acc = body.account;
      expect(acc.id).toBe('test_sa_1');
      expect(acc.access_token_encrypted).toBeUndefined();
      expect(acc.refresh_token_encrypted).toBeUndefined();
      expect(acc.access_token).toBeUndefined();
      expect(acc.refresh_token).toBeUndefined();
    });

    it('3.3. GET /api/social-accounts/:id retourne 404 pour un compte inexistant', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/social-accounts/non_existent_id'
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('NOT_FOUND');
    });

    it('3.4. GET /api/social-accounts/:platform/connect rejette une plateforme inconnue', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/social-accounts/unknown_platform/connect'
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('INVALID_PLATFORM');
    });

    it('3.5. GET /api/social-accounts/:platform/connect échoue proprement si les clés manquent', async () => {
      // Sauvegarde des variables
      const oldKey = process.env.TIKTOK_CLIENT_KEY;
      const oldSecret = process.env.TIKTOK_CLIENT_SECRET;
      delete process.env.TIKTOK_CLIENT_KEY;
      delete process.env.TIKTOK_CLIENT_SECRET;

      const res = await app.inject({
        method: 'GET',
        url: '/api/social-accounts/tiktok/connect'
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('MISSING_CONFIGURATION');

      // Restauration
      if (oldKey) process.env.TIKTOK_CLIENT_KEY = oldKey;
      if (oldSecret) process.env.TIKTOK_CLIENT_SECRET = oldSecret;
    });

    it('3.6. GET /api/social-accounts/:platform/connect génère une URL officielle valide avec les clés configurées', async () => {
      process.env.YOUTUBE_CLIENT_ID = 'test_google_client_id_123';
      process.env.YOUTUBE_CLIENT_SECRET = 'test_google_client_secret_456';

      const res = await app.inject({
        method: 'GET',
        url: '/api/social-accounts/youtube/connect'
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.authorizationUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(body.authorizationUrl).toContain('client_id=test_google_client_id_123');
      expect(body.authorizationUrl).toContain('state=');
      expect(body.state).toBeDefined();

      delete process.env.YOUTUBE_CLIENT_ID;
      delete process.env.YOUTUBE_CLIENT_SECRET;
    });

    it('3.7. DELETE /api/social-accounts/:id supprime un compte existant', async () => {
      const db = getDatabase();
      db.prepare(`
        INSERT INTO social_accounts (id, platform, account_id, username, access_token_encrypted, status)
        VALUES ('test_sa_to_delete', 'instagram', 'ig_del_1', 'test_ig_delete', 'enc', 'connected')
      `).run();

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/social-accounts/test_sa_to_delete'
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);

      const check = db.prepare('SELECT id FROM social_accounts WHERE id = ?').get('test_sa_to_delete');
      expect(check).toBeUndefined();
    });
  });

  // =========================================================================
  // 4. FLUX OAUTH CALLBACK & RECONNEXION SANS DOUBLON
  // =========================================================================
  describe('4. Flux OAuth Callback avec Mocks & Mise à jour sans doublon', () => {
    it('4.1. Rejette un callback avec un state invalide en redirigeant vers le client avec erreur', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/social-accounts/youtube/callback?code=mock_code&state=fake_state'
      });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain('error=invalid_state');
    });

    it('4.2. Traite un flux callback OAuth complet avec succès et stocke les tokens chiffrés', async () => {
      process.env.YOUTUBE_CLIENT_ID = 'test_yt_client_id';
      process.env.YOUTUBE_CLIENT_SECRET = 'test_yt_client_secret';

      const state = createOAuthState('youtube');

      // Mock de fetch pour les APIs Google OAuth et YouTube Channels
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('oauth2.googleapis.com/token')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              access_token: 'mock_yt_access_token_abc',
              refresh_token: 'mock_yt_refresh_token_xyz',
              expires_in: 3600,
              token_type: 'Bearer'
            })
          } as any;
        }

        if (url.includes('youtube/v3/channels')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              items: [
                {
                  id: 'YT_CHANNEL_999',
                  snippet: {
                    title: 'PostBoy Gaming Channel',
                    customUrl: '@postboy_gaming'
                  }
                }
              ]
            })
          } as any;
        }

        return { ok: false, status: 404 } as any;
      });

      try {
        const res = await app.inject({
          method: 'GET',
          url: `/api/social-accounts/youtube/callback?code=valid_test_code&state=${state}`
        });

        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toContain('status=success');
        expect(res.headers.location).toContain('platform=youtube');

        // Vérification en base
        const db = getDatabase();
        const account = db.prepare(`
          SELECT * FROM social_accounts WHERE platform = 'youtube' AND account_id = 'YT_CHANNEL_999'
        `).get() as any;

        expect(account).toBeDefined();
        expect(account.username).toBe('@postboy_gaming');
        expect(account.display_name).toBe('PostBoy Gaming Channel');
        expect(account.status).toBe('connected');

        // Vérification du chiffrement
        expect(decryptData(account.access_token_encrypted)).toBe('mock_yt_access_token_abc');
        expect(decryptData(account.refresh_token_encrypted)).toBe('mock_yt_refresh_token_xyz');

        // Test 4.3 : Reconnexion du même compte (doit mettre à jour SANS créer de doublon)
        const secondState = createOAuthState('youtube');
        const secondRes = await app.inject({
          method: 'GET',
          url: `/api/social-accounts/youtube/callback?code=another_code&state=${secondState}`
        });

        expect(secondRes.statusCode).toBe(302);

        // Vérifier qu'il n'y a toujours qu'UN seul enregistrement
        const count = db.prepare(`
          SELECT COUNT(*) as total FROM social_accounts WHERE platform = 'youtube' AND account_id = 'YT_CHANNEL_999'
        `).get() as { total: number };

        expect(count.total).toBe(1);
      } finally {
        global.fetch = originalFetch;
        delete process.env.YOUTUBE_CLIENT_ID;
        delete process.env.YOUTUBE_CLIENT_SECRET;
      }
    });

    it('4.3. Traite un flux OAuth TikTok avec succès', async () => {
      process.env.TIKTOK_CLIENT_KEY = 'test_tt_key';
      process.env.TIKTOK_CLIENT_SECRET = 'test_tt_secret';

      const state = createOAuthState('tiktok');
      const originalFetch = global.fetch;

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('open.tiktokapis.com/v2/oauth/token')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                access_token: 'mock_tt_token_123',
                refresh_token: 'mock_tt_refresh_456',
                expires_in: 86400,
                open_id: 'TT_OPEN_ID_001'
              }
            })
          } as any;
        }
        if (url.includes('open.tiktokapis.com/v2/user/info')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                user: {
                  open_id: 'TT_OPEN_ID_001',
                  username: 'postboy_clips',
                  display_name: 'PostBoy Clips'
                }
              }
            })
          } as any;
        }
        return { ok: false, status: 404 } as any;
      });

      try {
        const res = await app.inject({
          method: 'GET',
          url: `/api/social-accounts/tiktok/callback?code=tt_code&state=${state}`
        });

        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toContain('status=success');
        expect(res.headers.location).toContain('platform=tiktok');

        const db = getDatabase();
        const account = db.prepare(`
          SELECT * FROM social_accounts WHERE platform = 'tiktok' AND account_id = 'TT_OPEN_ID_001'
        `).get() as any;

        expect(account).toBeDefined();
        expect(account.username).toBe('postboy_clips');
        expect(account.display_name).toBe('PostBoy Clips');
        expect(decryptData(account.access_token_encrypted)).toBe('mock_tt_token_123');
      } finally {
        global.fetch = originalFetch;
        delete process.env.TIKTOK_CLIENT_KEY;
        delete process.env.TIKTOK_CLIENT_SECRET;
      }
    });

    it('4.4. Traite un flux OAuth Instagram avec succès', async () => {
      process.env.INSTAGRAM_CLIENT_ID = 'test_ig_id';
      process.env.INSTAGRAM_CLIENT_SECRET = 'test_ig_secret';

      const state = createOAuthState('instagram');
      const originalFetch = global.fetch;

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('api.instagram.com/oauth/access_token')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              access_token: 'mock_ig_short_token',
              user_id: 'IG_USER_888'
            })
          } as any;
        }
        if (url.includes('graph.instagram.com/access_token')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              access_token: 'mock_ig_long_token_60d',
              expires_in: 5184000
            })
          } as any;
        }
        if (url.includes('graph.instagram.com/v21.0/me')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 'IG_USER_888',
              username: 'postboy_insta'
            })
          } as any;
        }
        return { ok: false, status: 404 } as any;
      });

      try {
        const res = await app.inject({
          method: 'GET',
          url: `/api/social-accounts/instagram/callback?code=ig_code&state=${state}`
        });

        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toContain('status=success');
        expect(res.headers.location).toContain('platform=instagram');

        const db = getDatabase();
        const account = db.prepare(`
          SELECT * FROM social_accounts WHERE platform = 'instagram' AND account_id = 'IG_USER_888'
        `).get() as any;

        expect(account).toBeDefined();
        expect(account.username).toBe('postboy_insta');
        expect(decryptData(account.access_token_encrypted)).toBe('mock_ig_long_token_60d');
      } finally {
        global.fetch = originalFetch;
        delete process.env.INSTAGRAM_CLIENT_ID;
        delete process.env.INSTAGRAM_CLIENT_SECRET;
      }
    });

    it('4.5. Gère une erreur ou refus transmise par le provider OAuth', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/social-accounts/tiktok/callback?error=access_denied&error_description=User+denied+access'
      });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain('error=access_denied');
      expect(res.headers.location).toContain('platform=tiktok');
    });
  });
});

