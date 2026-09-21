import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import nodemailer from 'nodemailer';
import Fastify, { FastifyInstance } from 'fastify';
import { initializeDatabase } from '../src/db/init.js';
import { getDatabase, closeDatabase } from '../src/db/connection.js';
import { emailService, sanitizeErrorMessage } from '../src/services/emailService.js';
import { notificationsRoutes } from '../src/routes/notifications.js';

describe('PHASE 9 - Notifications Email (SMTP)', () => {
  let app: FastifyInstance;
  let sendMailMock: any;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    await initializeDatabase();
    app = Fastify({ logger: false });
    await app.register(notificationsRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeDatabase();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    process.env.SMTP_HOST = 'smtp.testserver.local';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_SECURE = 'false';
    process.env.SMTP_USER = 'testuser';
    process.env.SMTP_PASSWORD = 'testpassword';
    process.env.SMTP_FROM = 'PostBoy <notifications@postboy.local>';
    process.env.NOTIFICATION_EMAIL = 'admin@example.com';

    // Mocker le transporteur nodemailer
    sendMailMock = vi.fn().mockResolvedValue({ messageId: 'mock_msg_123' });
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: sendMailMock
    } as any);

    // Nettoyage base avant chaque test
    const db = getDatabase();
    await db.run("DELETE FROM notifications WHERE id LIKE 'notif_%' OR id LIKE '%-%'");
    await db.run("DELETE FROM publication_logs WHERE id LIKE 'log_%' OR id LIKE '%-%'");
    await db.run("DELETE FROM publications WHERE id LIKE 'pub_%'");
    await db.run("DELETE FROM videos WHERE id LIKE 'vid_%'");
    await db.run("DELETE FROM campaigns WHERE id LIKE 'camp_%'");
    await db.run("DELETE FROM social_accounts WHERE id LIKE 'sa_%'");
  });

  // Helpers pour insérer les données de test
  async function insertTestCampaign(id = 'camp_p9_01', name = 'Campagne Test') {
    const db = getDatabase();
    await db.run(`
      INSERT OR REPLACE INTO campaigns (id, name, color, status)
      VALUES (?, ?, '#08EB08', 'active')
    `, [id, name]);
  }

  async function insertTestVideo(videoId = 'vid_p9_01', campaignId?: string) {
    const db = getDatabase();
    await db.run(`
      INSERT OR REPLACE INTO videos (id, filename, original_name, file_path, file_size, mime_type, campaign_id, status)
      VALUES (?, 'clip_p9.mp4', 'clip_p9.mp4', 'uploads/clip_p9.mp4', 1048576, 'video/mp4', ?, 'ready')
    `, [videoId, campaignId ?? null]);
  }

  async function insertTestAccount(id = 'sa_p9_01', platform = 'tiktok', username = 'testcreator') {
    const db = getDatabase();
    await db.run(`
      INSERT OR REPLACE INTO social_accounts (id, platform, account_id, username, display_name, access_token_encrypted, status)
      VALUES (?, ?, ?, ?, 'Test Creator', 'dummy_enc_token', 'connected')
    `, [id, platform, `acc_${id}`, username]);
  }

  async function insertPublication(pub: {
    id: string;
    videoId?: string;
    campaignId?: string | null;
    socialAccountId?: string | null;
    platform: string;
    title: string;
    status: string;
    externalUrl?: string | null;
    errorMessage?: string | null;
  }) {
    const db = getDatabase();
    const videoId = pub.videoId || `vid_${pub.id}`;
    await insertTestVideo(videoId, pub.campaignId ?? undefined);

    await db.run(`
      INSERT INTO publications (
        id, video_id, campaign_id, social_account_id, platform, title, status,
        external_url, error_message, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [
      pub.id,
      videoId,
      pub.campaignId ?? null,
      pub.socialAccountId ?? null,
      pub.platform,
      pub.title,
      pub.status,
      pub.externalUrl ?? null,
      pub.errorMessage ?? null
    ]);
  }

  // =========================================================================
  // 1. Configuration & Initialisation SMTP
  // =========================================================================
  describe('1. Configuration SMTP', () => {
    it('1.1. isConfigured() retourne true si SMTP_HOST et NOTIFICATION_EMAIL sont définis', () => {
      expect(emailService.isConfigured()).toBe(true);
      const config = emailService.getSmtpConfig();
      expect(config.host).toBe('smtp.testserver.local');
      expect(config.port).toBe(587);
      expect(config.secure).toBe(false);
      expect(config.notificationEmail).toBe('admin@example.com');
    });

    it('1.2. isConfigured() retourne false si SMTP_HOST est manquant', () => {
      delete process.env.SMTP_HOST;
      expect(emailService.isConfigured()).toBe(false);
    });

    it('1.3. isConfigured() retourne false si NOTIFICATION_EMAIL est manquant', () => {
      delete process.env.NOTIFICATION_EMAIL;
      expect(emailService.isConfigured()).toBe(false);
    });
  });

  // =========================================================================
  // 2. Sécurité & Sanitisation des erreurs
  // =========================================================================
  describe('2. Sécurité & Sanitisation des messages', () => {
    it('2.1. Masque les jetons Bearer', () => {
      const raw = 'Échec API: Authorization header Bearer ya29.a0AfH6SMD123_invalid_token failed';
      const clean = sanitizeErrorMessage(raw);
      expect(clean).not.toContain('ya29.a0AfH6SMD123_invalid_token');
      expect(clean).toContain('Bearer [REDACTED]');
    });

    it('2.2. Masque les secrets dans les query params d URL', () => {
      const raw = 'https://api.instagram.com/oauth/access_token?client_secret=super_secret_key_123&code=auth_code_456';
      const clean = sanitizeErrorMessage(raw);
      expect(clean).not.toContain('super_secret_key_123');
      expect(clean).toContain('client_secret=[REDACTED]');
    });

    it('2.3. Masque les clés sensibles dans les payloads JSON', () => {
      const raw = '{"error": "invalid_grant", "password": "my_secret_password_99", "access_token": "act_888"}';
      const clean = sanitizeErrorMessage(raw);
      expect(clean).not.toContain('my_secret_password_99');
      expect(clean).not.toContain('act_888');
      expect(clean).toContain('"password":"[REDACTED]"');
      expect(clean).toContain('"access_token":"[REDACTED]"');
    });

    it('2.4. Tronque les messages excessivement longs', () => {
      const raw = 'A'.repeat(1500);
      const clean = sanitizeErrorMessage(raw);
      expect(clean.length).toBeLessThan(1100);
      expect(clean).toContain('(tronqué)');
    });
  });

  // =========================================================================
  // 3. Notification de publication réussie (published)
  // =========================================================================
  describe('3. Notification de publication réussie', () => {
    beforeEach(async () => {
      await insertTestCampaign('camp_boxabl', 'BOXABL Campaign');
      await insertTestAccount('sa_tt_01', 'tiktok', 'boxabl_official');
    });

    it('3.1. Envoie un email formaté avec l URL du post si disponible', async () => {
      const pubId = 'pub_success_01';
      const expectedUrl = 'https://www.tiktok.com/@boxabl_official/video/71234567890';
      await insertPublication({
        id: pubId,
        campaignId: 'camp_boxabl',
        socialAccountId: 'sa_tt_01',
        platform: 'tiktok',
        title: 'Maison Pliable Boxabl en 1h',
        status: 'published',
        externalUrl: expectedUrl
      });

      const result = await emailService.notifyPublicationPublished(pubId);
      expect(result).toBe(true);

      // Vérification de l'appel nodemailer
      expect(sendMailMock).toHaveBeenCalledTimes(1);
      const mailArgs = sendMailMock.mock.calls[0][0];
      expect(mailArgs.to).toBe('admin@example.com');
      expect(mailArgs.subject).toContain('PostBoy — Publication réussie — Tiktok — BOXABL Campaign');
      expect(mailArgs.text).toContain(expectedUrl);
      expect(mailArgs.text).toContain('BOXABL Campaign');
      expect(mailArgs.text).toContain('@boxabl_official');
      expect(mailArgs.html).toContain(expectedUrl);

      // Vérification de la persistance dans la base
      const db = getDatabase();
      const notif = await db.get<any>('SELECT * FROM notifications WHERE publication_id = ?', [pubId]);
      expect(notif).toBeDefined();
      expect(notif.type).toBe('publication_published');
      expect(notif.status).toBe('sent');
      expect(notif.recipient).toBe('admin@example.com');

      // Vérification des logs d'audit
      const log = await db.get<any>('SELECT * FROM publication_logs WHERE publication_id = ? AND event = ?', [pubId, 'email_notification_sent']);
      expect(log).toBeDefined();
    });

    it('3.2. Affiche "Non disponible pour le moment" si external_url est NULL', async () => {
      const pubId = 'pub_no_url';
      await insertPublication({
        id: pubId,
        campaignId: 'camp_boxabl',
        socialAccountId: 'sa_tt_01',
        platform: 'tiktok',
        title: 'Vidéo en attente d URL',
        status: 'published',
        externalUrl: null
      });

      const result = await emailService.notifyPublicationPublished(pubId);
      expect(result).toBe(true);

      const mailArgs = sendMailMock.mock.calls[0][0];
      expect(mailArgs.text).toContain('Non disponible pour le moment');
      expect(mailArgs.html).toContain('Non disponible pour le moment');
    });

    it('3.3. Ne tente aucun envoi si SMTP n est pas configuré', async () => {
      delete process.env.SMTP_HOST;
      const pubId = 'pub_smtp_off';
      await insertPublication({
        id: pubId,
        platform: 'youtube',
        title: 'Vidéo sans SMTP',
        status: 'published'
      });

      const result = await emailService.notifyPublicationPublished(pubId);
      expect(result).toBe(false);
      expect(sendMailMock).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 4. Notification de publication échouée (failed)
  // =========================================================================
  describe('4. Notification de publication échouée', () => {
    beforeEach(async () => {
      await insertTestCampaign('camp_boxabl', 'BOXABL Campaign');
      await insertTestAccount('sa_ig_01', 'instagram', 'boxabl_ig');
    });

    it('4.1. Envoie une alerte avec le motif de l erreur assaini', async () => {
      const pubId = 'pub_failed_01';
      const rawError = 'Error 401 Unauthorized: token Bearer sec_tok_999 is expired';
      await insertPublication({
        id: pubId,
        campaignId: 'camp_boxabl',
        socialAccountId: 'sa_ig_01',
        platform: 'instagram',
        title: 'Reels Instagram Boxabl',
        status: 'failed',
        errorMessage: rawError
      });

      const result = await emailService.notifyPublicationFailed(pubId, rawError);
      expect(result).toBe(true);

      expect(sendMailMock).toHaveBeenCalledTimes(1);
      const mailArgs = sendMailMock.mock.calls[0][0];
      expect(mailArgs.to).toBe('admin@example.com');
      expect(mailArgs.subject).toContain('PostBoy — Publication échouée — Instagram — BOXABL Campaign');
      expect(mailArgs.text).toContain('Bearer [REDACTED]');
      expect(mailArgs.text).not.toContain('sec_tok_999');

      // Vérification base
      const db = getDatabase();
      const notif = await db.get<any>('SELECT * FROM notifications WHERE publication_id = ?', [pubId]);
      expect(notif).toBeDefined();
      expect(notif.type).toBe('publication_failed');
      expect(notif.status).toBe('sent');
    });
  });

  // =========================================================================
  // 5. Idempotence & Prévention des doublons
  // =========================================================================
  describe('5. Idempotence des notifications', () => {
    beforeEach(async () => {
      await insertTestCampaign('camp_idemp', 'Campagne Idempotence');
      await insertTestAccount('sa_idemp', 'youtube', 'yt_channel');
    });

    it('5.1. N envoie pas de deuxième email si un email de succès est déjà enregistré (status sent)', async () => {
      const pubId = 'pub_idempotent_test';
      await insertPublication({
        id: pubId,
        campaignId: 'camp_idemp',
        socialAccountId: 'sa_idemp',
        platform: 'youtube',
        title: 'Titre Test',
        status: 'published',
        externalUrl: 'https://youtube.com/watch?v=12345'
      });

      // Premier envoi
      const res1 = await emailService.notifyPublicationPublished(pubId);
      expect(res1).toBe(true);
      expect(sendMailMock).toHaveBeenCalledTimes(1);

      // Deuxième tentative identique
      const res2 = await emailService.notifyPublicationPublished(pubId);
      expect(res2).toBe(true);
      // Toujours 1 seul appel effectif à sendMail
      expect(sendMailMock).toHaveBeenCalledTimes(1);
    });

    it('5.2. N envoie pas de deuxième email si un email d échec a déjà été transmis', async () => {
      const pubId = 'pub_idempotent_failed';
      await insertPublication({
        id: pubId,
        campaignId: 'camp_idemp',
        socialAccountId: 'sa_idemp',
        platform: 'youtube',
        title: 'Titre Failed',
        status: 'failed'
      });

      await emailService.notifyPublicationFailed(pubId, 'Erreur de connexion');
      expect(sendMailMock).toHaveBeenCalledTimes(1);

      await emailService.notifyPublicationFailed(pubId, 'Erreur de connexion');
      expect(sendMailMock).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 6. Tolérance aux pannes SMTP & Décorrélation métier
  // =========================================================================
  describe('6. Tolérance aux erreurs SMTP', () => {
    it('6.1. Une erreur SMTP ne fait pas crasher le service et enregistre le statut failed dans SQLite', async () => {
      sendMailMock.mockRejectedValueOnce(new Error('Connection refused by SMTP server on port 587'));

      const pubId = 'pub_smtp_crash_test';
      await insertPublication({
        id: pubId,
        platform: 'youtube',
        title: 'Vidéo Test Crash',
        status: 'published'
      });

      const result = await emailService.notifyPublicationPublished(pubId);
      expect(result).toBe(false);

      const db = getDatabase();
      const notif = await db.get<any>('SELECT * FROM notifications WHERE publication_id = ?', [pubId]);
      expect(notif).toBeDefined();
      expect(notif.status).toBe('failed');
      expect(notif.error).toContain('Connection refused');
    });
  });

  // =========================================================================
  // 7. Route HTTP de test et statut (/api/notifications)
  // =========================================================================
  describe('7. Endpoints API Notifications', () => {
    it('7.1. GET /api/notifications/status retourne l état de configuration', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/notifications/status'
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.status).toBe('success');
      expect(data.configured).toBe(true);
      expect(data.host).toBe('smtp.testserver.local');
      expect(data.recipient).toBe('admin@example.com');
    });

    it('7.2. POST /api/notifications/test envoie un email de test avec succès', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/notifications/test',
        payload: {}
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.status).toBe('success');
      expect(data.message).toContain('Email de test envoyé avec succès');
      expect(sendMailMock).toHaveBeenCalledTimes(1);
    });

    it('7.3. POST /api/notifications/test retourne 400 si SMTP non configuré', async () => {
      delete process.env.SMTP_HOST;

      const res = await app.inject({
        method: 'POST',
        url: '/api/notifications/test',
        payload: {}
      });

      expect(res.statusCode).toBe(400);
      const data = res.json();
      expect(data.status).toBe('error');
      expect(data.message).toContain('Serveur SMTP non configuré');
    });
  });
});
