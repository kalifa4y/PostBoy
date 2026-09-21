import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import nodemailer from 'nodemailer';
import Fastify, { FastifyInstance } from 'fastify';
import { initializeDatabase } from '../src/db/init.js';
import { getDatabase, closeDatabase } from '../src/db/connection.js';
import { emailService, sanitizeErrorMessage } from '../src/services/emailService.js';
import { notificationsRoutes } from '../src/routes/notifications.js';
import { cronRoutes } from '../src/routes/cron.js';

describe('PHASE 9 - Notifications Email (SMTP)', () => {
  let app: FastifyInstance;
  let sendMailMock: any;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    await initializeDatabase();
    app = Fastify({ logger: false });
    await app.register(notificationsRoutes);
    await app.register(cronRoutes);
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
    await db.run("DELETE FROM publications WHERE id LIKE 'pub_%'");
    await db.run("DELETE FROM videos WHERE id LIKE 'vid_%'");
    await db.run("DELETE FROM campaigns WHERE id LIKE 'camp_%'");
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

  async function insertPublication(pub: {
    id: string;
    videoId?: string;
    campaignId?: string | null;
    platform: string;
    title: string;
    status: string;
    scheduledAt?: string | null;
    publishedAt?: string | null;
    caption?: string | null;
    hashtags?: string | null;
    notes?: string | null;
    externalUrl?: string | null;
    errorMessage?: string | null;
  }) {
    const db = getDatabase();
    const videoId = pub.videoId || `vid_${pub.id}`;
    await insertTestVideo(videoId, pub.campaignId ?? undefined);

    await db.run(`
      INSERT INTO publications (
        id, video_id, campaign_id, platform, title, status,
        scheduled_at, published_at, caption, hashtags, notes,
        post_url, error_message, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [
      pub.id,
      videoId,
      pub.campaignId ?? null,
      pub.platform,
      pub.title,
      pub.status,
      pub.scheduledAt ?? null,
      pub.publishedAt ?? null,
      pub.caption ?? null,
      pub.hashtags ?? null,
      pub.notes ?? null,
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
    });

    it('3.1. Envoie un email formaté avec l URL du post si disponible', async () => {
      const pubId = 'pub_success_01';
      const expectedUrl = 'https://www.tiktok.com/@boxabl_official/video/71234567890';
      await insertPublication({
        id: pubId,
        campaignId: 'camp_boxabl',
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
      expect(mailArgs.html).toContain(expectedUrl);

      // Vérification de la persistance dans la base
      const db = getDatabase();
      const notif = await db.get<any>('SELECT * FROM notifications WHERE publication_id = ?', [pubId]);
      expect(notif).toBeDefined();
      expect(notif.type).toBe('publication_published');
      expect(notif.status).toBe('sent');
      expect(notif.recipient).toBe('admin@example.com');
    });

    it('3.2. Affiche "Non disponible pour le moment" si external_url est NULL', async () => {
      const pubId = 'pub_no_url';
      await insertPublication({
        id: pubId,
        campaignId: 'camp_boxabl',
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
    });

    it('4.1. Envoie une alerte avec le motif de l erreur assaini', async () => {
      const pubId = 'pub_failed_01';
      const rawError = 'Error 401 Unauthorized: token Bearer sec_tok_999 is expired';
      await insertPublication({
        id: pubId,
        campaignId: 'camp_boxabl',
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
    });

    it('5.1. N envoie pas de deuxième email si un email de succès est déjà enregistré (status sent)', async () => {
      const pubId = 'pub_idempotent_test';
      await insertPublication({
        id: pubId,
        campaignId: 'camp_idemp',
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

  // =========================================================================
  // PHASE 6 : Discipline quotidienne, Emails et Rappels (PostBoy Manual Flow)
  // =========================================================================
  describe('PHASE 6 — Discipline quotidienne & Rappels Email', () => {
    const todayStr = new Date().toISOString().slice(0, 10);

    // 8. Email du matin (06:00)
    describe('8. Email du matin (06:00)', () => {
      it('8.1. Envoie un email incitatif si rien n est encore planifié aujourd hui', async () => {
        const result = await emailService.sendMorningReminder(todayStr);

        expect(result.success).toBe(true);
        expect(result.alreadySent).toBeFalsy();
        expect(sendMailMock).toHaveBeenCalledTimes(1);

        const callArgs = sendMailMock.mock.calls[0][0];
        expect(callArgs.subject).toContain('06:00 : Planification de tes 5 publications');
        expect(callArgs.text).toContain("Tu n'as encore planifié aucune publication aujourd'hui.");
        expect(callArgs.html).toContain('Objectif 5/5');

        // Vérification de l'enregistrement dans la table notifications
        const db = getDatabase();
        const recorded = await db.get<any>("SELECT * FROM notifications WHERE type = 'morning_reminder'");
        expect(recorded).toBeDefined();
        expect(recorded.status).toBe('sent');
      });

      it('8.2. Idempotence : un second appel le même jour ne renvoie pas d email', async () => {
        // Premier envoi
        await emailService.sendMorningReminder(todayStr);
        expect(sendMailMock).toHaveBeenCalledTimes(1);

        // Deuxième appel
        const second = await emailService.sendMorningReminder(todayStr);
        expect(second.success).toBe(true);
        expect(second.alreadySent).toBe(true);
        expect(second.message).toContain('déjà envoyé');
        // Toujours 1 seul appel au transporteur SMTP
        expect(sendMailMock).toHaveBeenCalledTimes(1);
      });

      it('8.3. Affiche la liste détaillée des clips si des publications sont planifiées', async () => {
        await insertTestCampaign('camp_p6_01', 'Campagne A');
        await insertPublication({
          id: 'pub_p6_plan_01',
          campaignId: 'camp_p6_01',
          platform: 'tiktok',
          title: 'Clip Matin 1',
          status: 'scheduled',
          scheduledAt: `${todayStr}T10:00:00Z`
        });

        const result = await emailService.sendMorningReminder(todayStr);
        expect(result.success).toBe(true);
        expect(sendMailMock).toHaveBeenCalledTimes(1);

        const callArgs = sendMailMock.mock.calls[0][0];
        expect(callArgs.text).toContain('Clip Matin 1');
        expect(callArgs.text).toContain('Campagne A');
        expect(callArgs.text).toContain('TIKTOK');
      });
    });

    // 9. Alertes de publications en retard
    describe('9. Alertes de publications en retard', () => {
      it('9.1. Détecte les publications passées encore au statut scheduled et envoie une alerte', async () => {
        await insertTestCampaign('camp_p6_02', 'Campagne Retard');
        // Publication planifiée il y a 2 heures
        const pastTime = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
        await insertPublication({
          id: 'pub_p6_late_01',
          campaignId: 'camp_p6_02',
          platform: 'instagram',
          title: 'Clip en retard',
          status: 'scheduled',
          scheduledAt: pastTime
        });

        const result = await emailService.checkAndSendOverdueAlerts();
        expect(result.sentCount).toBe(1);
        expect(sendMailMock).toHaveBeenCalledTimes(1);

        const callArgs = sendMailMock.mock.calls[0][0];
        expect(callArgs.subject).toContain('Publication en retard');
        expect(callArgs.subject).toContain('Instagram');
        expect(callArgs.subject).toContain('Campagne Retard');
        expect(callArgs.text).toContain('Tu as une publication en retard.');
      });

      it('9.2. Idempotence : une seule alerte par publication en retard', async () => {
        const pastTime = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
        await insertPublication({
          id: 'pub_p6_late_02',
          platform: 'tiktok',
          title: 'Clip retard unique',
          status: 'scheduled',
          scheduledAt: pastTime
        });

        const res1 = await emailService.checkAndSendOverdueAlerts();
        expect(res1.sentCount).toBe(1);
        expect(sendMailMock).toHaveBeenCalledTimes(1);

        // Second appel : pas de doublon
        const res2 = await emailService.checkAndSendOverdueAlerts();
        expect(res2.sentCount).toBe(0);
        expect(sendMailMock).toHaveBeenCalledTimes(1);
      });

      it('9.3. N envoie pas d alerte pour les publications déjà publiées ou dans le futur', async () => {
        const pastTime = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
        const futureTime = new Date(Date.now() + 2 * 3600 * 1000).toISOString();

        // Passée mais publiée
        await insertPublication({
          id: 'pub_p6_pub_past',
          platform: 'youtube',
          title: 'Clip déjà fait',
          status: 'published',
          scheduledAt: pastTime,
          publishedAt: pastTime
        });

        // Dans le futur
        await insertPublication({
          id: 'pub_p6_sched_future',
          platform: 'youtube',
          title: 'Clip plus tard',
          status: 'scheduled',
          scheduledAt: futureTime
        });

        const result = await emailService.checkAndSendOverdueAlerts();
        expect(result.sentCount).toBe(0);
        expect(sendMailMock).not.toHaveBeenCalled();
      });
    });

    // 10. Rappels de publications approchantes
    describe('10. Rappels de publications approchantes', () => {
      it('10.1. Détecte une publication dans les 60 prochaines minutes et envoie le texte à copier', async () => {
        await insertTestCampaign('camp_p6_03', 'Campagne Bientôt');
        const in30Min = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        await insertPublication({
          id: 'pub_p6_soon_01',
          campaignId: 'camp_p6_03',
          platform: 'tiktok',
          title: 'Clip du midi',
          caption: 'Superbe clip de test pour PostBoy !',
          hashtags: '#clipping #viral #postboy',
          status: 'scheduled',
          scheduledAt: in30Min
        });

        const result = await emailService.checkAndSendUpcomingReminders(60);
        expect(result.sentCount).toBe(1);
        expect(sendMailMock).toHaveBeenCalledTimes(1);

        const callArgs = sendMailMock.mock.calls[0][0];
        expect(callArgs.subject).toContain('Rappel : Publication prévue bientôt');
        expect(callArgs.text).toContain('Superbe clip de test pour PostBoy !');
        expect(callArgs.text).toContain('#clipping #viral #postboy');
      });

      it('10.2. Idempotence : un seul rappel par publication', async () => {
        const in45Min = new Date(Date.now() + 45 * 60 * 1000).toISOString();
        await insertPublication({
          id: 'pub_p6_soon_02',
          platform: 'instagram',
          title: 'Clip bientôt',
          status: 'scheduled',
          scheduledAt: in45Min
        });

        const res1 = await emailService.checkAndSendUpcomingReminders(60);
        expect(res1.sentCount).toBe(1);

        const res2 = await emailService.checkAndSendUpcomingReminders(60);
        expect(res2.sentCount).toBe(0);
        expect(sendMailMock).toHaveBeenCalledTimes(1);
      });
    });

    // 11. Notification d'objectif atteint (5/5 sur 5 campagnes)
    describe('11. Notification Objectif Quotidien Atteint (5/5)', () => {
      it('11.1. Ne notifie pas si l objectif n est pas encore atteint (ex: 3 publications)', async () => {
        await insertTestCampaign('camp_p6_g1', 'Campagne G1');
        await insertPublication({ id: 'pub_g1', campaignId: 'camp_p6_g1', platform: 'tiktok', title: 'Post 1', status: 'published', publishedAt: `${todayStr}T10:00:00Z` });

        const sent = await emailService.notifyDailyGoalAchieved();
        expect(sent).toBe(false);
        expect(sendMailMock).not.toHaveBeenCalled();
      });

      it('11.2. Envoie l email de félicitations dès que 5 publications sur 5 campagnes différentes sont validées', async () => {
        for (let i = 1; i <= 5; i++) {
          await insertTestCampaign(`camp_p6_win_${i}`, `Campagne Win ${i}`);
          await insertPublication({
            id: `pub_p6_win_${i}`,
            campaignId: `camp_p6_win_${i}`,
            platform: 'tiktok',
            title: `Clip Gagnant ${i}`,
            status: 'published',
            publishedAt: `${todayStr}T1${i}:00:00Z`
          });
        }

        const sent = await emailService.notifyDailyGoalAchieved();
        expect(sent).toBe(true);
        expect(sendMailMock).toHaveBeenCalledTimes(1);

        const callArgs = sendMailMock.mock.calls[0][0];
        expect(callArgs.subject).toContain('Objectif du jour atteint (5/5)');
        expect(callArgs.text).toContain('Objectif du jour atteint : 5 publications / 5 campagnes');
      });

      it('11.3. Idempotence : 1 seul email goal_achieved par jour', async () => {
        for (let i = 1; i <= 5; i++) {
          await insertTestCampaign(`camp_p6_idemp_${i}`, `Campagne Idemp ${i}`);
          await insertPublication({
            id: `pub_p6_idemp_${i}`,
            campaignId: `camp_p6_idemp_${i}`,
            platform: 'tiktok',
            title: `Clip Idemp ${i}`,
            status: 'published',
            publishedAt: `${todayStr}T1${i}:00:00Z`
          });
        }

        const sent1 = await emailService.notifyDailyGoalAchieved();
        expect(sent1).toBe(true);
        expect(sendMailMock).toHaveBeenCalledTimes(1);

        // Deuxième appel
        const sent2 = await emailService.notifyDailyGoalAchieved();
        expect(sent2).toBe(true);
        expect(sendMailMock).toHaveBeenCalledTimes(1);
      });
    });

    // 12. Bilan de fin de journée (22:00)
    describe('12. Bilan de fin de journée (22:00)', () => {
      it('12.1. Envoie un bilan récapitulatif avec métriques exactes quand non atteint', async () => {
        await insertTestCampaign('camp_p6_recap_1', 'Campagne Recap 1');
        await insertPublication({
          id: 'pub_p6_recap_1',
          campaignId: 'camp_p6_recap_1',
          platform: 'tiktok',
          title: 'Seul clip du jour',
          status: 'published',
          publishedAt: `${todayStr}T12:00:00Z`
        });

        const result = await emailService.sendDailyRecap(todayStr);
        expect(result.success).toBe(true);
        expect(sendMailMock).toHaveBeenCalledTimes(1);

        const callArgs = sendMailMock.mock.calls[0][0];
        expect(callArgs.subject).toContain('Objectif Non Atteint (1/5)');
        expect(callArgs.text).toContain('Publications réalisées : 1 / 5');
        expect(callArgs.text).toContain('Campagnes différentes : 1 / 5');
      });

      it('12.2. Envoie le bilan avec statut Objectif Atteint quand atteint', async () => {
        for (let i = 1; i <= 5; i++) {
          await insertTestCampaign(`camp_p6_rc_ok_${i}`, `Campagne OK ${i}`);
          await insertPublication({
            id: `pub_p6_rc_ok_${i}`,
            campaignId: `camp_p6_rc_ok_${i}`,
            platform: 'youtube',
            title: `Clip OK ${i}`,
            status: 'published',
            publishedAt: `${todayStr}T1${i}:00:00Z`
          });
        }

        const result = await emailService.sendDailyRecap(todayStr);
        expect(result.success).toBe(true);
        expect(sendMailMock).toHaveBeenCalledTimes(1);

        const callArgs = sendMailMock.mock.calls[0][0];
        expect(callArgs.subject).toContain('Objectif Atteint (5/5)');
      });

      it('12.3. Idempotence : 1 seul bilan quotidien envoyé par jour', async () => {
        await emailService.sendDailyRecap(todayStr);
        expect(sendMailMock).toHaveBeenCalledTimes(1);

        const res2 = await emailService.sendDailyRecap(todayStr);
        expect(res2.success).toBe(true);
        expect(res2.alreadySent).toBe(true);
        expect(sendMailMock).toHaveBeenCalledTimes(1);
      });
    });

    // 13. Endpoints HTTP Cron & Sécurité CRON_SECRET
    describe('13. Endpoints Cron & Sécurité CRON_SECRET', () => {
      it('13.1. En mode dev (sans CRON_SECRET), autorise les requêtes sans authentification', async () => {
        delete process.env.CRON_SECRET;

        const res = await app.inject({
          method: 'GET',
          url: `/api/cron/morning?date=${todayStr}`
        });

        expect(res.statusCode).toBe(200);
        const data = res.json();
        expect(data.status).toBe('success');
        expect(data.job).toBe('morning');
      });

      it('13.2. Avec CRON_SECRET défini, rejette les requêtes sans authentification avec 401', async () => {
        process.env.CRON_SECRET = 'secret_phase6_test';

        const res = await app.inject({
          method: 'GET',
          url: '/api/cron/morning'
        });

        expect(res.statusCode).toBe(401);
        const data = res.json();
        expect(data.status).toBe('error');
        expect(data.message).toContain('CRON_SECRET');
      });

      it('13.3. Avec CRON_SECRET défini, rejette un mauvais Bearer token avec 401', async () => {
        process.env.CRON_SECRET = 'secret_phase6_test';

        const res = await app.inject({
          method: 'GET',
          url: '/api/cron/morning',
          headers: {
            authorization: 'Bearer wrong_token'
          }
        });

        expect(res.statusCode).toBe(401);
      });

      it('13.4. Avec CRON_SECRET défini, autorise avec Bearer valide', async () => {
        process.env.CRON_SECRET = 'secret_phase6_test';

        const res = await app.inject({
          method: 'GET',
          url: `/api/cron/evening?date=${todayStr}`,
          headers: {
            authorization: 'Bearer secret_phase6_test'
          }
        });

        expect(res.statusCode).toBe(200);
        const data = res.json();
        expect(data.status).toBe('success');
        expect(data.job).toBe('evening');
      });

      it('13.5. Avec CRON_SECRET défini, autorise avec le paramètre d URL ?key=', async () => {
        process.env.CRON_SECRET = 'secret_phase6_test';

        const res = await app.inject({
          method: 'GET',
          url: '/api/cron/check-reminders?key=secret_phase6_test'
        });

        expect(res.statusCode).toBe(200);
        const data = res.json();
        expect(data.status).toBe('success');
        expect(data.job).toBe('check-reminders');
      });

      it('13.6. POST /api/cron/trigger permet le déclenchement contrôlé de n importe quel job', async () => {
        delete process.env.CRON_SECRET;

        const res = await app.inject({
          method: 'POST',
          url: '/api/cron/trigger',
          payload: {
            job: 'reminders'
          }
        });

        expect(res.statusCode).toBe(200);
        const data = res.json();
        expect(data.status).toBe('success');
        expect(data.job).toBe('reminders');
        expect(data.result).toHaveProperty('upcomingRemindersSent');
        expect(data.result).toHaveProperty('overdueAlertsSent');
      });
    });
  });
});
