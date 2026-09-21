import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';
import { initializeDatabase, recoverInterruptedPublications } from '../src/db/init.js';
import { getDatabase, closeDatabase } from '../src/db/connection.js';
import { pollAndPublishDuePublications } from '../src/services/publicationScheduler.js';
import { publicationService, getUploadsDir } from '../src/services/publicationService.js';
import { urlResolverService } from '../src/services/urlResolverService.js';
import { emailService } from '../src/services/emailService.js';
import { encryptData } from '../src/utils/crypto.js';

describe('PHASE 10 - Automatisation complète & Qualité finale (E2E)', () => {
  let sendMailMock: any;
  const originalEnv = { ...process.env };
  const dummyVideoFilename = 'e2e_test_video.mp4';

  beforeAll(() => {
    initializeDatabase();

    // Création d'un fichier vidéo de test réel dans uploads
    const uploadsDir = getUploadsDir();
    const videoPath = path.join(uploadsDir, dummyVideoFilename);
    if (!fs.existsSync(videoPath)) {
      fs.writeFileSync(videoPath, Buffer.from('dummy_mp4_binary_content_for_e2e_tests'));
    }
  });

  afterAll(() => {
    closeDatabase();
    // Nettoyage du fichier vidéo temporaire
    const uploadsDir = getUploadsDir();
    const videoPath = path.join(uploadsDir, dummyVideoFilename);
    if (fs.existsSync(videoPath)) {
      try {
        fs.unlinkSync(videoPath);
      } catch {}
    }
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    process.env.SMTP_HOST = 'smtp.testserver.local';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_SECURE = 'false';
    process.env.NOTIFICATION_EMAIL = 'owner@example.com';
    process.env.SMTP_FROM = 'PostBoy <notifications@postboy.local>';

    // Mock nodemailer
    sendMailMock = vi.fn().mockResolvedValue({ messageId: 'mock_e2e_msg_123' });
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: sendMailMock
    } as any);

    // Reset base de données
    const db = getDatabase();
    db.prepare("DELETE FROM notifications WHERE id LIKE 'notif_%' OR id LIKE '%-%'").run();
    db.prepare("DELETE FROM publication_logs WHERE id LIKE 'log_%' OR id LIKE '%-%'").run();
    db.prepare("DELETE FROM publications WHERE id LIKE 'pub_%'").run();
    db.prepare("DELETE FROM videos WHERE id LIKE 'vid_%'").run();
    db.prepare("DELETE FROM campaigns WHERE id LIKE 'camp_%'").run();
    db.prepare("DELETE FROM social_accounts WHERE id LIKE 'sa_%'").run();
    db.prepare("UPDATE settings SET value = '1' WHERE key = 'auto_publish_enabled'").run();
  });

  afterEach(() => {
    const db = getDatabase();
    db.prepare("UPDATE settings SET value = '1' WHERE key = 'auto_publish_enabled'").run();
  });

  // Helpers de fixtures
  function insertCampaign(id = 'camp_e2e_01', name = 'Campagne Boxabl') {
    const db = getDatabase();
    db.prepare(`
      INSERT OR REPLACE INTO campaigns (id, name, color, status)
      VALUES (?, ?, '#08EB08', 'active')
    `).run(id, name);
  }

  function insertVideo(id = 'vid_e2e_01', campaignId = 'camp_e2e_01') {
    const db = getDatabase();
    db.prepare(`
      INSERT OR REPLACE INTO videos (id, filename, original_name, file_path, file_size, mime_type, campaign_id, status)
      VALUES (?, ?, ?, ?, 1024, 'video/mp4', ?, 'ready')
    `).run(id, dummyVideoFilename, dummyVideoFilename, `uploads/${dummyVideoFilename}`, campaignId);
  }

  function insertSocialAccount(id = 'sa_e2e_yt', platform = 'youtube', username = 'boxabl_channel') {
    const db = getDatabase();
    const tokenEnc = encryptData('valid_oauth_access_token_123');
    db.prepare(`
      INSERT OR REPLACE INTO social_accounts (id, platform, account_id, username, display_name, access_token_encrypted, status)
      VALUES (?, ?, ?, ?, 'Boxabl Channel', ?, 'connected')
    `).run(id, platform, `acc_${id}`, username, tokenEnc);
  }

  function insertScheduledPublication(pub: {
    id: string;
    campaignId?: string;
    videoId?: string;
    socialAccountId?: string;
    platform?: string;
    title?: string;
    scheduledAt?: string | null;
  }) {
    const db = getDatabase();
    const campaignId = pub.campaignId || 'camp_e2e_01';
    const videoId = pub.videoId || 'vid_e2e_01';
    const socialAccountId = pub.socialAccountId || 'sa_e2e_yt';
    const platform = pub.platform || 'youtube';
    const title = pub.title || 'Vidéo automatique de test';

    insertCampaign(campaignId);
    insertVideo(videoId, campaignId);
    insertSocialAccount(socialAccountId, platform);

    db.prepare(`
      INSERT INTO publications (
        id, video_id, campaign_id, social_account_id, platform, title, caption, status,
        scheduled_at, retry_count, max_retries, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 'Super vidéo de clipping #clipping', 'scheduled', ?, 0, 3, datetime('now'), datetime('now'))
    `).run(pub.id, videoId, campaignId, socialAccountId, platform, title, pub.scheduledAt ?? null);
  }

  // =========================================================================
  // 1. Workflow Nominal de Bout en Bout
  // =========================================================================
  describe('1. Workflow nominal complet de bout en bout', () => {
    it('1.1. Planification -> Scheduler -> Publication API -> Résolution URL -> Notification Email', async () => {
      const pubId = 'pub_e2e_nominal';
      const expectedVideoId = 'dQw4w9WgXcQ';
      const expectedUrl = `https://www.youtube.com/watch?v=${expectedVideoId}`;

      insertScheduledPublication({
        id: pubId,
        platform: 'youtube',
        title: 'Maison Boxabl Révolutionnaire',
        scheduledAt: new Date(Date.now() - 60000).toISOString() // Échue depuis 1 min
      });

      // Mocker l'upload YouTube officiel (resumable session + upload binaire)
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('upload/youtube/v3/videos')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ Location: 'https://upload.youtube.local/session_123' })
          } as any;
        }
        if (urlStr.includes('upload.youtube.local/session_123')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: expectedVideoId,
              snippet: { title: 'Maison Boxabl Révolutionnaire' }
            })
          } as any;
        }
        return { ok: false, status: 404 } as any;
      });

      // Déclenchement automatique du scheduler
      const processedCount = await pollAndPublishDuePublications(5);
      expect(processedCount).toBe(1);

      // Vérification SQLite de la publication
      const db = getDatabase();
      const pub = db.prepare('SELECT * FROM publications WHERE id = ?').get(pubId) as any;
      expect(pub).toBeDefined();
      expect(pub.status).toBe('published');
      expect(pub.published_at).not.toBeNull();
      expect(pub.external_post_id).toBe(expectedVideoId);
      expect(pub.external_url).toBe(expectedUrl);
      expect(pub.post_url).toBe(expectedUrl);

      // Vérification de la notification email automatique
      expect(sendMailMock).toHaveBeenCalledTimes(1);
      const emailArgs = sendMailMock.mock.calls[0][0];
      expect(emailArgs.to).toBe('owner@example.com');
      expect(emailArgs.subject).toContain('PostBoy — Publication réussie — Youtube — Campagne Boxabl');
      expect(emailArgs.text).toContain(expectedUrl);
      expect(emailArgs.html).toContain(expectedUrl);

      // Vérification des logs d'audit dans publication_logs
      const logs = db.prepare('SELECT event, message FROM publication_logs WHERE publication_id = ? ORDER BY created_at ASC').all(pubId) as any[];
      const eventNames = logs.map(l => l.event);
      expect(eventNames).toContain('publish_success');
      expect(eventNames).toContain('email_notification_sent');
    });
  });

  // =========================================================================
  // 2. Workflow complet en cas d'échec Publisher
  // =========================================================================
  describe('2. Workflow complet en cas d échec publisher', () => {
    it('2.1. Échec API -> Statut failed -> Log d audit -> Notification email d échec', async () => {
      const pubId = 'pub_e2e_failure';

      insertScheduledPublication({
        id: pubId,
        platform: 'youtube',
        title: 'Vidéo avec échec API',
        scheduledAt: new Date(Date.now() - 60000).toISOString()
      });

      // Mocker une erreur 500 YouTube
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return {
          ok: false,
          status: 500,
          text: async () => JSON.stringify({
            error: {
              message: 'The request cannot be completed because server exceeded quota limit',
              code: 500
            }
          })
        } as any;
      });

      const processedCount = await pollAndPublishDuePublications(5);
      expect(processedCount).toBe(1);

      const db = getDatabase();
      const pub = db.prepare('SELECT * FROM publications WHERE id = ?').get(pubId) as any;
      expect(pub.status).toBe('failed');
      expect(pub.error_message).toContain('exceeded quota limit');

      // Notification d'échec envoyée
      expect(sendMailMock).toHaveBeenCalledTimes(1);
      const emailArgs = sendMailMock.mock.calls[0][0];
      expect(emailArgs.subject).toContain('PostBoy — Publication échouée — Youtube');
      expect(emailArgs.text).toContain('exceeded quota limit');

      // Vérification SQLite notif
      const notif = db.prepare('SELECT * FROM notifications WHERE publication_id = ?').get(pubId) as any;
      expect(notif.type).toBe('publication_failed');
      expect(notif.status).toBe('sent');
    });
  });

  // =========================================================================
  // 3. Idempotence & Résolution d'URL
  // =========================================================================
  describe('3. Idempotence & Résolution d URL', () => {
    it('3.1. Ne duplique pas l URL et conserve l idempotence sur ré-appel', async () => {
      const pubId = 'pub_e2e_idemp_url';
      insertScheduledPublication({
        id: pubId,
        platform: 'youtube',
        title: 'Vidéo Test Idempotence URL'
      });

      const db = getDatabase();
      db.prepare(`
        UPDATE publications
        SET status = 'published',
            external_post_id = 'vid_idemp_123',
            external_url = 'https://www.youtube.com/watch?v=vid_idemp_123'
        WHERE id = ?
      `).run(pubId);

      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const res = await urlResolverService.resolvePublicationUrl(pubId);

      expect(res.success).toBe(true);
      expect(res.alreadyResolved).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 4. Non-duplication des notifications email
  // =========================================================================
  describe('4. Non-duplication des notifications email', () => {
    it('4.1. Un ré-appel de notification ne renvoie pas de second email si status=sent', async () => {
      const pubId = 'pub_e2e_notif_dup';
      insertScheduledPublication({
        id: pubId,
        platform: 'youtube',
        title: 'Vidéo Test Anti-Doublon Email'
      });

      const db = getDatabase();
      db.prepare("UPDATE publications SET status = 'published', external_url = 'https://youtube.com/watch?v=1' WHERE id = ?").run(pubId);

      // Premier envoi
      await emailService.notifyPublicationPublished(pubId);
      expect(sendMailMock).toHaveBeenCalledTimes(1);

      // Deuxième envoi (ex: retry ou cycle suivant)
      await emailService.notifyPublicationPublished(pubId);
      expect(sendMailMock).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 5. Concurrence du Scheduler (Overlap Guard)
  // =========================================================================
  describe('5. Concurrence du scheduler et prévention des collisions', () => {
    it('5.1. Deux cycles scheduler concurrents ne traitent jamais la même publication en double', async () => {
      const pubId = 'pub_e2e_concurrency';
      insertScheduledPublication({
        id: pubId,
        platform: 'youtube',
        title: 'Vidéo Test Concurrence',
        scheduledAt: new Date(Date.now() - 30000).toISOString()
      });

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('upload/youtube/v3/videos')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ Location: 'https://upload.youtube.local/session_conc' })
          } as any;
        }
        if (urlStr.includes('upload.youtube.local/session_conc')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'conc_video_id' })
          } as any;
        }
        return { ok: false, status: 404 } as any;
      });

      // Lancement de 2 ticks en parallèle
      const [res1, res2] = await Promise.all([
        pollAndPublishDuePublications(5),
        pollAndPublishDuePublications(5)
      ]);

      // Une seule exécution a pu revendiquer (claim) la publication
      expect(res1 + res2).toBe(1);

      const db = getDatabase();
      const pub = db.prepare('SELECT status FROM publications WHERE id = ?').get(pubId) as any;
      expect(pub.status).toBe('published');
    });
  });

  // =========================================================================
  // 6. Résilience au redémarrage (Server Restart Recovery)
  // =========================================================================
  describe('6. Résilience au redémarrage du serveur', () => {
    it('6.1. Récupère automatiquement les publications bloquées en publishing lors d un arrêt brutal', () => {
      const pubId = 'pub_e2e_stuck_publishing';
      insertScheduledPublication({
        id: pubId,
        platform: 'youtube',
        title: 'Vidéo Interrompue'
      });

      const db = getDatabase();
      db.prepare("UPDATE publications SET status = 'publishing' WHERE id = ?").run(pubId);

      // Simulation du redémarrage du serveur
      const recoveredCount = recoverInterruptedPublications();
      expect(recoveredCount).toBeGreaterThanOrEqual(1);

      const pub = db.prepare('SELECT status, error_message FROM publications WHERE id = ?').get(pubId) as any;
      expect(pub.status).toBe('failed');
      expect(pub.error_message).toContain('Interrompu lors du redémarrage du serveur');

      // Log d'audit créé
      const log = db.prepare("SELECT * FROM publication_logs WHERE publication_id = ? AND event = 'server_restart_recovery'").get(pubId) as any;
      expect(log).toBeDefined();
    });
  });

  // =========================================================================
  // 7. Tolérance aux pannes SMTP
  // =========================================================================
  describe('7. Tolérance aux pannes SMTP', () => {
    it('7.1. Une panne SMTP ne perturbe pas le statut published de la publication', async () => {
      const pubId = 'pub_e2e_smtp_down';
      insertScheduledPublication({
        id: pubId,
        platform: 'youtube',
        title: 'Vidéo Test SMTP Down',
        scheduledAt: new Date(Date.now() - 30000).toISOString()
      });

      // Mocker le publisher en succès
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('upload/youtube/v3/videos')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ Location: 'https://upload.youtube.local/session_smtp_down' })
          } as any;
        }
        if (urlStr.includes('upload.youtube.local/session_smtp_down')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'yt_smtp_down_id' })
          } as any;
        }
        return { ok: false, status: 404 } as any;
      });

      // Mocker une panne réseau SMTP
      sendMailMock.mockRejectedValueOnce(new Error('SMTP Connection timeout (server down)'));

      await pollAndPublishDuePublications(5);

      const db = getDatabase();
      const pub = db.prepare('SELECT status, external_url FROM publications WHERE id = ?').get(pubId) as any;
      // Le statut métier reste rigoureusement 'published'
      expect(pub.status).toBe('published');
      expect(pub.external_url).toBe('https://www.youtube.com/watch?v=yt_smtp_down_id');

      // La notification SQLite consigne l'échec d'envoi
      const notif = db.prepare('SELECT status, error FROM notifications WHERE publication_id = ?').get(pubId) as any;
      expect(notif.status).toBe('failed');
      expect(notif.error).toContain('SMTP Connection timeout');
    });
  });

  // =========================================================================
  // 8. Sécurité des jetons & Token expiré
  // =========================================================================
  describe('8. Sécurité des jetons OAuth et absence de fuite', () => {
    it('8.1. Détecte les erreurs d autorisation sans divulguer de secrets dans les logs ou emails', async () => {
      const pubId = 'pub_e2e_scope_err';
      insertScheduledPublication({
        id: pubId,
        platform: 'youtube',
        title: 'Vidéo avec Token Expiré',
        scheduledAt: new Date(Date.now() - 30000).toISOString()
      });

      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return new Response(JSON.stringify({
          error: {
            message: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT (token: sec_secret_token_12345)',
            code: 403
          }
        }), { status: 403 });
      });

      await pollAndPublishDuePublications(5);

      const db = getDatabase();
      const pub = db.prepare('SELECT status, error_message FROM publications WHERE id = ?').get(pubId) as any;
      expect(pub.status).toBe('failed');
      expect(pub.error_message).toContain('https://www.googleapis.com/auth/youtube.upload');

      // Vérifier que l'email de failure envoyé ne contient aucun secret brut
      expect(sendMailMock).toHaveBeenCalledTimes(1);
      const emailArgs = sendMailMock.mock.calls[0][0];
      expect(emailArgs.text).not.toContain('sec_secret_token_12345');
    });
  });

  // =========================================================================
  // 9. Respect du paramètre auto_publish_enabled
  // =========================================================================
  describe('9. Paramètre auto_publish_enabled', () => {
    it('9.1. Ne publie rien si auto_publish_enabled est désactivé dans les settings (0)', async () => {
      const pubId = 'pub_e2e_disabled';
      insertScheduledPublication({
        id: pubId,
        platform: 'youtube',
        title: 'Vidéo avec automatisation désactivée',
        scheduledAt: new Date(Date.now() - 30000).toISOString()
      });

      const db = getDatabase();
      db.prepare("UPDATE settings SET value = '0' WHERE key = 'auto_publish_enabled'").run();

      const processedCount = await pollAndPublishDuePublications(5);
      expect(processedCount).toBe(0);

      const pub = db.prepare('SELECT status FROM publications WHERE id = ?').get(pubId) as any;
      expect(pub.status).toBe('scheduled');
      expect(sendMailMock).not.toHaveBeenCalled();
    });
  });
});
