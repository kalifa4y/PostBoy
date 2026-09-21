import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { getDatabase } from '../db/connection.js';
import {
  getDailyClippingGoal,
  normalizeDateString,
  DailyClippingGoal
} from './clippingGoalService.js';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
  notificationEmail: string;
}

export interface EmailSendResult {
  success: boolean;
  message: string;
  notificationId?: string;
}

/**
 * Nettoie les messages d'erreur pour s'assurer qu'aucun jeton d'accès, secret ou mot de passe
 * n'apparaisse dans les notifications email ou les logs.
 */
export function sanitizeErrorMessage(msg: string | null | undefined): string {
  if (!msg) return 'Erreur inconnue';
  let sanitized = String(msg);

  // Masquer les jetons Bearer
  sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, 'Bearer [REDACTED]');

  // Masquer les paramètres sensibles dans les URLs ou JSON (access_token, client_secret, password, refresh_token, code)
  sanitized = sanitized.replace(/(access_token|client_secret|refresh_token|password|api_key|client_key|token)=([^&\s"']+)/gi, '$1=[REDACTED]');
  sanitized = sanitized.replace(/"(access_token|client_secret|refresh_token|password|api_key|client_key|token)"\s*:\s*"[^"]+"/gi, '"$1":"[REDACTED]"');

  // Tronquer si la taille est excessive pour un email
  if (sanitized.length > 1000) {
    sanitized = sanitized.slice(0, 1000) + '... (tronqué)';
  }

  return sanitized;
}

export class EmailService {
  /**
   * Récupère la configuration SMTP à partir des variables d'environnement.
   */
  getSmtpConfig(): SmtpConfig {
    const host = process.env.SMTP_HOST ? process.env.SMTP_HOST.trim() : '';
    const port = Number(process.env.SMTP_PORT) || 587;
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const user = process.env.SMTP_USER ? process.env.SMTP_USER.trim() : undefined;
    const password = process.env.SMTP_PASSWORD ? process.env.SMTP_PASSWORD.trim() : undefined;
    const from = process.env.SMTP_FROM ? process.env.SMTP_FROM.trim() : 'PostBoy <notifications@example.com>';
    const notificationEmail = process.env.NOTIFICATION_EMAIL ? process.env.NOTIFICATION_EMAIL.trim() : '';

    return {
      host,
      port,
      secure,
      user,
      password,
      from,
      notificationEmail
    };
  }

  /**
   * Vérifie si le service email est correctement configuré.
   */
  isConfigured(): boolean {
    const config = this.getSmtpConfig();
    return Boolean(config.host && config.notificationEmail);
  }

  /**
   * Crée une instance de transporteur nodemailer.
   */
  getTransporter() {
    const config = this.getSmtpConfig();
    return nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? {
        user: config.user,
        pass: config.password || ''
      } : undefined
    } as any);
  }

  /**
   * Notifie l'utilisateur qu'une publication a été publiée avec succès.
   */
  async notifyPublicationPublished(publicationId: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    const db = getDatabase();

    // 1. Récupération des détails de la publication
    const pub = await db.get<any>(`
      SELECT 
        p.*,
        c.name as campaign_name
      FROM publications p
      LEFT JOIN campaigns c ON p.campaign_id = c.id
      WHERE p.id = ?
    `, [publicationId]);

    if (!pub) {
      return false;
    }

    // 2. Vérification d'idempotence : éviter tout doublon d'email de succès
    const existing = await db.get<{ id: string }>(`
      SELECT id FROM notifications 
      WHERE publication_id = ? AND type = 'publication_published' AND status = 'sent'
    `, [publicationId]);

    if (existing) {
      return true; // Déjà notifié avec succès
    }

    const config = this.getSmtpConfig();
    const platformDisplay = pub.platform.charAt(0).toUpperCase() + pub.platform.slice(1);
    const campaignDisplay = pub.campaign_name || 'Aucune campagne';
    const postUrlDisplay = pub.external_url || pub.post_url || 'Non disponible pour le moment';
    const titleDisplay = pub.title || 'Sans titre';
    const publishedAtDisplay = pub.published_at || new Date().toISOString();

    const subject = `PostBoy — Publication réussie — ${platformDisplay} — ${campaignDisplay}`;

    const textContent = `
PostBoy — Notification de publication

Statut : Publication réussie
Campagne : ${campaignDisplay}
Plateforme : ${platformDisplay}
Titre : ${titleDisplay}
Date de publication : ${publishedAtDisplay}

URL du post :
${postUrlDisplay}

---
Message généré automatiquement par PostBoy.
`.trim();

    const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:24px;background-color:#121417;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e5e7eb;">
  <div style="max-width:560px;margin:0 auto;background-color:#1b1f24;border:1px solid #2d333b;border-radius:8px;padding:24px;">
    <div style="border-bottom:1px solid #2d333b;padding-bottom:16px;margin-bottom:20px;">
      <h1 style="margin:0;font-size:18px;font-weight:700;color:#08eb08;letter-spacing:-0.02em;">PostBoy</h1>
      <p style="margin:4px 0 0 0;font-size:12px;color:#9ca3af;">Notification de publication réussie</p>
    </div>
    
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
      <tr>
        <td style="padding:6px 0;color:#9ca3af;width:130px;">Statut :</td>
        <td style="padding:6px 0;color:#08eb08;font-weight:600;">Publié avec succès</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#9ca3af;">Campagne :</td>
        <td style="padding:6px 0;color:#ffffff;font-weight:500;">${campaignDisplay}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#9ca3af;">Plateforme :</td>
        <td style="padding:6px 0;color:#ffffff;font-weight:500;">${platformDisplay}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#9ca3af;">Titre de la vidéo :</td>
        <td style="padding:6px 0;color:#ffffff;">${titleDisplay}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#9ca3af;">Date :</td>
        <td style="padding:6px 0;color:#9ca3af;">${publishedAtDisplay}</td>
      </tr>
    </table>

    <div style="background-color:#121417;border:1px solid #2d333b;border-radius:6px;padding:12px;margin-bottom:20px;">
      <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px;letter-spacing:0.05em;">Lien du post :</div>
      <div style="font-size:13px;word-break:break-all;">
        ${
          pub.external_url || pub.post_url
            ? `<a href="${pub.external_url || pub.post_url}" target="_blank" rel="noopener noreferrer" style="color:#08eb08;text-decoration:underline;">${pub.external_url || pub.post_url}</a>`
            : `<span style="color:#9ca3af;">Non disponible pour le moment</span>`
        }
      </div>
    </div>

    <div style="border-top:1px solid #2d333b;padding-top:12px;font-size:11px;color:#6b7280;text-align:center;">
      PostBoy — Organisation & Suivi de clipping
    </div>
  </div>
</body>
</html>
`.trim();

    const notificationId = crypto.randomUUID();

    try {
      const transporter = this.getTransporter();
      await transporter.sendMail({
        from: config.from,
        to: config.notificationEmail,
        subject,
        text: textContent,
        html: htmlContent
      });

      // Enregistrement succès dans la base (table notifications)
      await db.run(`
        INSERT INTO notifications (id, publication_id, type, recipient, subject, body, status, sent_at, error, created_at)
        VALUES (?, ?, 'publication_published', ?, ?, ?, 'sent', datetime('now'), NULL, datetime('now'))
      `, [notificationId, publicationId, config.notificationEmail, subject, textContent]);

      return true;
    } catch (err: any) {
      console.warn(`[Email] Échec de l'envoi de notification (publicationId=${publicationId}): ${err.message}`);

      try {
        await db.run(`
          INSERT INTO notifications (id, publication_id, type, recipient, subject, body, status, sent_at, error, created_at)
          VALUES (?, ?, 'publication_published', ?, ?, ?, 'failed', NULL, ?, datetime('now'))
        `, [notificationId, publicationId, config.notificationEmail, subject, textContent, sanitizeErrorMessage(err.message)]);
      } catch (dbErr: any) {
        console.error(`[Email] Erreur enregistrement échec notification: ${dbErr.message}`);
      }

      return false;
    }
  }

  /**
   * Notifie l'utilisateur qu'une publication a échoué.
   */
  async notifyPublicationFailed(publicationId: string, rawErrorMessage: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    const db = getDatabase();

    const pub = await db.get<any>(`
      SELECT 
        p.*,
        c.name as campaign_name
      FROM publications p
      LEFT JOIN campaigns c ON p.campaign_id = c.id
      WHERE p.id = ?
    `, [publicationId]);

    if (!pub) {
      return false;
    }

    // Idempotence : ne pas envoyer de doublon pour le même échec
    const existing = await db.get<{ id: string }>(`
      SELECT id FROM notifications 
      WHERE publication_id = ? AND type = 'publication_failed' AND status = 'sent'
    `, [publicationId]);

    if (existing) {
      return true;
    }

    const config = this.getSmtpConfig();
    const platformDisplay = pub.platform ? (pub.platform.charAt(0).toUpperCase() + pub.platform.slice(1)) : 'Inconnue';
    const campaignDisplay = pub.campaign_name || 'Aucune campagne';
    const titleDisplay = pub.title || 'Sans titre';
    const cleanError = sanitizeErrorMessage(rawErrorMessage);
    const dateDisplay = new Date().toISOString();

    const subject = `PostBoy — Publication échouée — ${platformDisplay} — ${campaignDisplay}`;

    const textContent = `
PostBoy — Alerte de publication échouée

Statut : Échec de publication
Campagne : ${campaignDisplay}
Plateforme : ${platformDisplay}
Titre : ${titleDisplay}
Date : ${dateDisplay}

Motif de l'erreur :
${cleanError}

---
Consultez PostBoy pour corriger et republier manuellement si nécessaire.
`.trim();

    const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:24px;background-color:#121417;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e5e7eb;">
  <div style="max-width:560px;margin:0 auto;background-color:#1b1f24;border:1px solid #2d333b;border-radius:8px;padding:24px;">
    <div style="border-bottom:1px solid #2d333b;padding-bottom:16px;margin-bottom:20px;">
      <h1 style="margin:0;font-size:18px;font-weight:700;color:#ef4444;letter-spacing:-0.02em;">PostBoy — Alerte</h1>
      <p style="margin:4px 0 0 0;font-size:12px;color:#9ca3af;">Échec lors de la tentative de publication</p>
    </div>
    
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
      <tr>
        <td style="padding:6px 0;color:#9ca3af;width:130px;">Statut :</td>
        <td style="padding:6px 0;color:#ef4444;font-weight:600;">Échec de publication</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#9ca3af;">Campagne :</td>
        <td style="padding:6px 0;color:#ffffff;font-weight:500;">${campaignDisplay}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#9ca3af;">Plateforme :</td>
        <td style="padding:6px 0;color:#ffffff;font-weight:500;">${platformDisplay}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#9ca3af;">Titre de la vidéo :</td>
        <td style="padding:6px 0;color:#ffffff;">${titleDisplay}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#9ca3af;">Date :</td>
        <td style="padding:6px 0;color:#9ca3af;">${dateDisplay}</td>
      </tr>
    </table>

    <div style="background-color:#181111;border:1px solid #7f1d1d;border-radius:6px;padding:12px;margin-bottom:20px;">
      <div style="font-size:11px;color:#ef4444;text-transform:uppercase;margin-bottom:4px;letter-spacing:0.05em;font-weight:600;">Détail de l'erreur :</div>
      <div style="font-size:12px;color:#fca5a5;font-family:monospace;white-space:pre-wrap;word-break:break-all;">${cleanError}</div>
    </div>

    <div style="border-top:1px solid #2d333b;padding-top:12px;font-size:11px;color:#6b7280;text-align:center;">
      PostBoy — Organisation & Suivi de clipping
    </div>
  </div>
</body>
</html>
`.trim();

    const notificationId = crypto.randomUUID();

    try {
      const transporter = this.getTransporter();
      await transporter.sendMail({
        from: config.from,
        to: config.notificationEmail,
        subject,
        text: textContent,
        html: htmlContent
      });

      await db.run(`
        INSERT INTO notifications (id, publication_id, type, recipient, subject, body, status, sent_at, error, created_at)
        VALUES (?, ?, 'publication_failed', ?, ?, ?, 'sent', datetime('now'), NULL, datetime('now'))
      `, [notificationId, publicationId, config.notificationEmail, subject, textContent]);

      return true;
    } catch (err: any) {
      console.warn(`[Email] Échec de l'envoi d'email d'erreur (publicationId=${publicationId}): ${err.message}`);

      try {
        await db.run(`
          INSERT INTO notifications (id, publication_id, type, recipient, subject, body, status, sent_at, error, created_at)
          VALUES (?, ?, 'publication_failed', ?, ?, ?, 'failed', NULL, ?, datetime('now'))
        `, [notificationId, publicationId, config.notificationEmail, subject, textContent, sanitizeErrorMessage(err.message)]);
      } catch (dbErr: any) {
        console.error(`[Email] Erreur enregistrement échec notification: ${dbErr.message}`);
      }

      return false;
    }
  }

  /**
   * PHASE 6 : Email du matin (06:00 Africa/Bamako)
   * Incite l'utilisateur à planifier ses 5 publications du jour réparties sur 5 campagnes.
   */
  async sendMorningReminder(targetDateStr?: string): Promise<{ success: boolean; alreadySent?: boolean; message: string }> {
    if (!this.isConfigured()) {
      return { success: false, message: 'Service email non configuré' };
    }

    const db = getDatabase();
    const dateStr = normalizeDateString(targetDateStr);

    // Idempotence : 1 seul email du matin par jour
    const existing = await db.get<{ id: string }>(`
      SELECT id FROM notifications 
      WHERE type = 'morning_reminder' AND status = 'sent' AND date(sent_at) = date(?)
    `, [dateStr]);

    if (existing) {
      return { success: true, alreadySent: true, message: "Rappel du matin déjà envoyé pour aujourd'hui." };
    }

    const goal = await getDailyClippingGoal(db, dateStr);

    // Récupération des publications planifiées aujourd'hui
    const planned = await db.all<{
      id: string;
      platform: string;
      title: string;
      scheduled_at: string;
      caption: string | null;
      campaign_name: string | null;
      video_name: string | null;
    }>(`
      SELECT 
        p.id,
        p.platform,
        p.title,
        p.scheduled_at,
        p.caption,
        COALESCE(c.name, 'Sans campagne') as campaign_name,
        COALESCE(v.original_name, v.filename, 'Vidéo non liée') as video_name
      FROM publications p
      LEFT JOIN campaigns c ON p.campaign_id = c.id
      LEFT JOIN videos v ON p.video_id = v.id
      WHERE p.scheduled_at IS NOT NULL AND date(p.scheduled_at) = date(?)
      ORDER BY datetime(p.scheduled_at) ASC
    `, [dateStr]);

    const config = this.getSmtpConfig();
    const clientUrl = process.env.CLIENT_URL || 'https://postboy.vercel.app';
    const subject = `PostBoy — 06:00 : Planification de tes 5 publications du jour`;

    let planSummaryText = '';
    let planSummaryHtml = '';

    if (planned.length === 0) {
      planSummaryText = `Tu n'as encore planifié aucune publication aujourd'hui.\nAccède à PostBoy pour programmer tes 5 clips : ${clientUrl}`;
      planSummaryHtml = `
        <div style="background-color:#181111;border:1px solid #7f1d1d;border-radius:6px;padding:14px;margin-bottom:20px;text-align:center;">
          <p style="margin:0;font-size:13px;color:#fca5a5;font-weight:600;">Tu n'as encore planifié aucune publication aujourd'hui.</p>
          <p style="margin:6px 0 0 0;font-size:12px;color:#9ca3af;">Il est temps d'organiser tes clips pour respecter ta discipline quotidienne.</p>
        </div>
      `;
    } else {
      planSummaryText = planned.map(p => {
        const time = p.scheduled_at ? p.scheduled_at.slice(11, 16) : 'Heure libre';
        return `- [${time}] ${p.platform.toUpperCase()} | ${p.campaign_name} : ${p.title}`;
      }).join('\n');

      planSummaryHtml = `
        <div style="margin-bottom:20px;">
          <h4 style="font-size:12px;text-transform:uppercase;color:#9ca3af;margin:0 0 10px 0;letter-spacing:0.05em;">Publications planifiées (${planned.length}) :</h4>
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            ${planned.map(p => {
              const time = p.scheduled_at ? p.scheduled_at.slice(11, 16) : '--:--';
              return `
                <tr style="border-bottom:1px solid #2d333b;">
                  <td style="padding:6px 0;color:#08eb08;font-family:monospace;width:60px;">${time}</td>
                  <td style="padding:6px 0;color:#ffffff;font-weight:500;">${p.title}</td>
                  <td style="padding:6px 0;color:#9ca3af;text-align:right;">${p.platform} • ${p.campaign_name}</td>
                </tr>
              `;
            }).join('')}
          </table>
        </div>
      `;
    }

    const textContent = `
PostBoy — Rappel de 06:00 (Discipline de Clipping)

Il est temps de planifier tes 5 publications d'aujourd'hui.

---
Objectif quotidien : 5 publications / 5 campagnes différentes
Planifiées aujourd'hui : ${goal.scheduledToday} / 5
Déjà publiées aujourd'hui : ${goal.publishedToday} / 5
Publications restantes pour atteindre l'objectif : ${goal.remainingPosts}
Série en cours (streak) : ${goal.streak} jour(s)
---

${planSummaryText}

Accéder à PostBoy :
${clientUrl}

---
PostBoy — Organisation & Discipline de Clipping
`.trim();

    const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:24px;background-color:#121417;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e5e7eb;">
  <div style="max-width:560px;margin:0 auto;background-color:#1b1f24;border:1px solid #2d333b;border-radius:8px;padding:24px;">
    <div style="border-bottom:1px solid #2d333b;padding-bottom:16px;margin-bottom:20px;">
      <h1 style="margin:0;font-size:18px;font-weight:700;color:#08eb08;letter-spacing:-0.02em;">PostBoy — 06:00</h1>
      <p style="margin:4px 0 0 0;font-size:12px;color:#9ca3af;">Discipline quotidienne de clipping • Objectif 5/5</p>
    </div>

    <p style="font-size:14px;color:#ffffff;line-height:1.5;margin-bottom:18px;">
      Il est temps de planifier tes <strong>5 publications d'aujourd'hui</strong> sur <strong>5 campagnes différentes</strong>.
    </p>

    <!-- Carte des métriques du jour -->
    <div style="background-color:#121417;border:1px solid #2d333b;border-radius:6px;padding:14px;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr>
          <td style="padding:4px 0;color:#9ca3af;">Objectif :</td>
          <td style="padding:4px 0;color:#ffffff;font-weight:600;">5 publications / 5 campagnes</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#9ca3af;">Planifié aujourd'hui :</td>
          <td style="padding:4px 0;color:#ffffff;font-family:monospace;">${goal.scheduledToday} / 5</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#9ca3af;">Déjà publié aujourd'hui :</td>
          <td style="padding:4px 0;color:#08eb08;font-family:monospace;">${goal.publishedToday} / 5</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#9ca3af;">Restant à publier :</td>
          <td style="padding:4px 0;color:#f59e0b;font-weight:600;font-family:monospace;">${goal.remainingPosts}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#9ca3af;">Série en cours (Streak) :</td>
          <td style="padding:4px 0;color:#ffffff;font-family:monospace;">${goal.streak} jour(s)</td>
        </tr>
      </table>
    </div>

    ${planSummaryHtml}

    <div style="text-align:center;margin:24px 0;">
      <a href="${clientUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 20px;background-color:#08eb08;color:#000000;text-decoration:none;font-weight:700;font-size:13px;border-radius:6px;">
        Ouvrir PostBoy pour planifier
      </a>
    </div>

    <div style="border-top:1px solid #2d333b;padding-top:12px;font-size:11px;color:#6b7280;text-align:center;">
      PostBoy — Organisation & Discipline de clipping
    </div>
  </div>
</body>
</html>
`.trim();

    const notificationId = crypto.randomUUID();

    try {
      const transporter = this.getTransporter();
      await transporter.sendMail({
        from: config.from,
        to: config.notificationEmail,
        subject,
        text: textContent,
        html: htmlContent
      });

      await db.run(`
        INSERT INTO notifications (id, publication_id, type, recipient, subject, body, status, sent_at, error, created_at)
        VALUES (?, NULL, 'morning_reminder', ?, ?, ?, 'sent', datetime('now'), NULL, datetime('now'))
      `, [notificationId, config.notificationEmail, subject, textContent]);

      return { success: true, message: 'Rappel du matin envoyé avec succès.' };
    } catch (err: any) {
      console.warn(`[Email] Échec envoi rappel du matin: ${err.message}`);
      try {
        await db.run(`
          INSERT INTO notifications (id, publication_id, type, recipient, subject, body, status, sent_at, error, created_at)
          VALUES (?, NULL, 'morning_reminder', ?, ?, ?, 'failed', NULL, ?, datetime('now'))
        `, [notificationId, config.notificationEmail, subject, textContent, sanitizeErrorMessage(err.message)]);
      } catch (dbErr: any) {
        console.error(`[Email] Erreur enregistrement: ${dbErr.message}`);
      }
      return { success: false, message: `Erreur d'envoi SMTP: ${err.message}` };
    }
  }

  /**
   * PHASE 6 : Alerte de publication en retard
   * Détecte les publications prévues dont l'horaire est dépassé et qui ne sont pas encore publiées.
   */
  async checkAndSendOverdueAlerts(): Promise<{ sentCount: number }> {
    if (!this.isConfigured()) {
      return { sentCount: 0 };
    }

    const db = getDatabase();

    const overduePubs = await db.all<{
      id: string;
      platform: string;
      title: string;
      scheduled_at: string;
      caption: string | null;
      campaign_name: string | null;
      video_name: string | null;
    }>(`
      SELECT 
        p.id,
        p.platform,
        p.title,
        p.scheduled_at,
        p.caption,
        COALESCE(c.name, 'Sans campagne') as campaign_name,
        COALESCE(v.original_name, v.filename, 'Vidéo non liée') as video_name
      FROM publications p
      LEFT JOIN campaigns c ON p.campaign_id = c.id
      LEFT JOIN videos v ON p.video_id = v.id
      WHERE p.status = 'scheduled'
        AND p.scheduled_at IS NOT NULL
        AND datetime(p.scheduled_at) < datetime('now')
    `);

    let sentCount = 0;
    const config = this.getSmtpConfig();
    const clientUrl = process.env.CLIENT_URL || 'https://postboy.vercel.app';
    const goal = await getDailyClippingGoal(db);

    for (const pub of overduePubs) {
      // Idempotence : une seule alerte de retard par publication
      const existing = await db.get<{ id: string }>(`
        SELECT id FROM notifications 
        WHERE publication_id = ? AND type = 'overdue_alert' AND status = 'sent'
      `, [pub.id]);

      if (existing) continue;

      const platformDisplay = pub.platform ? (pub.platform.charAt(0).toUpperCase() + pub.platform.slice(1)) : 'Inconnue';
      const campaignDisplay = pub.campaign_name || 'Sans campagne';
      const titleDisplay = pub.title || 'Sans titre';
      const scheduledDisplay = pub.scheduled_at || 'Heure non définie';

      const subject = `PostBoy — Alerte : Publication en retard — ${platformDisplay} — ${campaignDisplay}`;

      const textContent = `
PostBoy — Alerte de publication en retard

Tu as une publication en retard.

Détails de la publication :
- Campagne : ${campaignDisplay}
- Plateforme : ${platformDisplay}
- Titre : ${titleDisplay}
- Heure prévue : ${scheduledDisplay}

État de l'objectif aujourd'hui :
- Publications encore nécessaires aujourd'hui : ${goal.remainingPosts} (sur 5 au total)
- Campagnes restantes : ${goal.remainingCampaigns}

Accède à PostBoy pour poster manuellement et marquer la publication comme publiée :
${clientUrl}

---
PostBoy — Organisation & Suivi de clipping
`.trim();

      const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:24px;background-color:#121417;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e5e7eb;">
  <div style="max-width:560px;margin:0 auto;background-color:#1b1f24;border:1px solid #7f1d1d;border-radius:8px;padding:24px;">
    <div style="border-bottom:1px solid #2d333b;padding-bottom:16px;margin-bottom:20px;">
      <h1 style="margin:0;font-size:18px;font-weight:700;color:#ef4444;letter-spacing:-0.02em;">PostBoy — Publication en Retard</h1>
      <p style="margin:4px 0 0 0;font-size:12px;color:#fca5a5;">Le créneau prévu est dépassé et le clip n'est pas encore marqué comme publié.</p>
    </div>

    <div style="background-color:#181111;border:1px solid #7f1d1d;border-radius:6px;padding:14px;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr>
          <td style="padding:4px 0;color:#9ca3af;width:120px;">Campagne :</td>
          <td style="padding:4px 0;color:#ffffff;font-weight:600;">${campaignDisplay}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#9ca3af;">Plateforme :</td>
          <td style="padding:4px 0;color:#ffffff;">${platformDisplay}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#9ca3af;">Titre du clip :</td>
          <td style="padding:4px 0;color:#ffffff;">${titleDisplay}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#9ca3af;">Prévu à :</td>
          <td style="padding:4px 0;color:#ef4444;font-family:monospace;font-weight:600;">${scheduledDisplay}</td>
        </tr>
      </table>
    </div>

    <div style="background-color:#121417;border:1px solid #2d333b;border-radius:6px;padding:12px;margin-bottom:20px;font-size:12px;color:#9ca3af;">
      Il te reste encore <strong style="color:#f59e0b;">${goal.remainingPosts} publication(s)</strong> et <strong style="color:#f59e0b;">${goal.remainingCampaigns} campagne(s)</strong> à valider pour atteindre l'objectif du jour.
    </div>

    <div style="text-align:center;margin:24px 0;">
      <a href="${clientUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 20px;background-color:#ef4444;color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;border-radius:6px;">
        Marquer comme publié sur PostBoy
      </a>
    </div>

    <div style="border-top:1px solid #2d333b;padding-top:12px;font-size:11px;color:#6b7280;text-align:center;">
      PostBoy — Organisation & Discipline de clipping
    </div>
  </div>
</body>
</html>
`.trim();

      const notificationId = crypto.randomUUID();

      try {
        const transporter = this.getTransporter();
        await transporter.sendMail({
          from: config.from,
          to: config.notificationEmail,
          subject,
          text: textContent,
          html: htmlContent
        });

        await db.run(`
          INSERT INTO notifications (id, publication_id, type, recipient, subject, body, status, sent_at, error, created_at)
          VALUES (?, ?, 'overdue_alert', ?, ?, ?, 'sent', datetime('now'), NULL, datetime('now'))
        `, [notificationId, pub.id, config.notificationEmail, subject, textContent]);

        sentCount++;
      } catch (err: any) {
        console.warn(`[Email] Échec alerte retard (pubId=${pub.id}): ${err.message}`);
        try {
          await db.run(`
            INSERT INTO notifications (id, publication_id, type, recipient, subject, body, status, sent_at, error, created_at)
            VALUES (?, ?, 'overdue_alert', ?, ?, ?, 'failed', NULL, ?, datetime('now'))
          `, [notificationId, pub.id, config.notificationEmail, subject, textContent, sanitizeErrorMessage(err.message)]);
        } catch {}
      }
    }

    return { sentCount };
  }

  /**
   * PHASE 6 : Rappel de publication approchante (dans les windowMinutes à venir)
   */
  async checkAndSendUpcomingReminders(windowMinutes = 60): Promise<{ sentCount: number }> {
    if (!this.isConfigured()) {
      return { sentCount: 0 };
    }

    const db = getDatabase();

    const upcomingPubs = await db.all<{
      id: string;
      platform: string;
      title: string;
      scheduled_at: string;
      caption: string | null;
      hashtags: string | null;
      campaign_name: string | null;
    }>(`
      SELECT 
        p.id,
        p.platform,
        p.title,
        p.scheduled_at,
        p.caption,
        p.hashtags,
        COALESCE(c.name, 'Sans campagne') as campaign_name
      FROM publications p
      LEFT JOIN campaigns c ON p.campaign_id = c.id
      WHERE p.status = 'scheduled'
        AND p.scheduled_at IS NOT NULL
        AND datetime(p.scheduled_at) >= datetime('now')
        AND datetime(p.scheduled_at) <= datetime('now', '+' || ? || ' minutes')
    `, [windowMinutes]);

    let sentCount = 0;
    const config = this.getSmtpConfig();
    const clientUrl = process.env.CLIENT_URL || 'https://postboy.vercel.app';
    const goal = await getDailyClippingGoal(db);

    for (const pub of upcomingPubs) {
      // Idempotence : un seul rappel par publication
      const existing = await db.get<{ id: string }>(`
        SELECT id FROM notifications 
        WHERE publication_id = ? AND type = 'upcoming_reminder' AND status = 'sent'
      `, [pub.id]);

      if (existing) continue;

      const platformDisplay = pub.platform ? (pub.platform.charAt(0).toUpperCase() + pub.platform.slice(1)) : 'Inconnue';
      const campaignDisplay = pub.campaign_name || 'Sans campagne';
      const titleDisplay = pub.title || 'Sans titre';
      const scheduledDisplay = pub.scheduled_at || '';
      const textToCopy = [pub.caption, pub.hashtags].filter(Boolean).join('\n\n') || titleDisplay;

      const subject = `PostBoy — Rappel : Publication prévue bientôt (${platformDisplay} — ${campaignDisplay})`;

      const textContent = `
PostBoy — Rappel de publication imminente

Ton prochain clip est prévu à ${scheduledDisplay}.

Détails :
- Campagne : ${campaignDisplay}
- Plateforme : ${platformDisplay}
- Titre : ${titleDisplay}

Texte prêt à copier :
${textToCopy}

Objectif du jour : ${goal.publishedToday} / 5 publiés (${goal.remainingPosts} restant(s)).

Poste manuellement puis valide sur PostBoy :
${clientUrl}

---
PostBoy — Organisation & Suivi de clipping
`.trim();

      const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:24px;background-color:#121417;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e5e7eb;">
  <div style="max-width:560px;margin:0 auto;background-color:#1b1f24;border:1px solid #2d333b;border-radius:8px;padding:24px;">
    <div style="border-bottom:1px solid #2d333b;padding-bottom:16px;margin-bottom:20px;">
      <h1 style="margin:0;font-size:18px;font-weight:700;color:#08eb08;letter-spacing:-0.02em;">PostBoy — Rappel de Publication</h1>
      <p style="margin:4px 0 0 0;font-size:12px;color:#9ca3af;">Ton créneau de publication approche dans les ${windowMinutes} prochaines minutes.</p>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:18px;">
      <tr>
        <td style="padding:4px 0;color:#9ca3af;width:120px;">Campagne :</td>
        <td style="padding:4px 0;color:#ffffff;font-weight:600;">${campaignDisplay}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:#9ca3af;">Plateforme :</td>
        <td style="padding:4px 0;color:#ffffff;">${platformDisplay}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:#9ca3af;">Prévu pour :</td>
        <td style="padding:4px 0;color:#08eb08;font-family:monospace;font-weight:600;">${scheduledDisplay}</td>
      </tr>
    </table>

    <div style="background-color:#121417;border:1px solid #2d333b;border-radius:6px;padding:12px;margin-bottom:20px;">
      <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;margin-bottom:6px;letter-spacing:0.05em;">Texte & Hashtags prêts à copier :</div>
      <div style="font-size:12px;color:#e5e7eb;white-space:pre-wrap;font-family:monospace;">${textToCopy}</div>
    </div>

    <div style="text-align:center;margin:24px 0;">
      <a href="${clientUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 20px;background-color:#08eb08;color:#000000;text-decoration:none;font-weight:700;font-size:13px;border-radius:6px;">
        Ouvrir PostBoy pour publier
      </a>
    </div>

    <div style="border-top:1px solid #2d333b;padding-top:12px;font-size:11px;color:#6b7280;text-align:center;">
      PostBoy — Organisation & Discipline de clipping
    </div>
  </div>
</body>
</html>
`.trim();

      const notificationId = crypto.randomUUID();

      try {
        const transporter = this.getTransporter();
        await transporter.sendMail({
          from: config.from,
          to: config.notificationEmail,
          subject,
          text: textContent,
          html: htmlContent
        });

        await db.run(`
          INSERT INTO notifications (id, publication_id, type, recipient, subject, body, status, sent_at, error, created_at)
          VALUES (?, ?, 'upcoming_reminder', ?, ?, ?, 'sent', datetime('now'), NULL, datetime('now'))
        `, [notificationId, pub.id, config.notificationEmail, subject, textContent]);

        sentCount++;
      } catch (err: any) {
        console.warn(`[Email] Échec rappel immanquable (pubId=${pub.id}): ${err.message}`);
      }
    }

    return { sentCount };
  }

  /**
   * PHASE 6 : Notification de victoire (Objectif du jour atteint : 5/5)
   * Envoyé dès que la 5ème publication dans la 5ème campagne différente est validée.
   */
  async notifyDailyGoalAchieved(customGoal?: DailyClippingGoal): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    const db = getDatabase();
    const dateStr = normalizeDateString();

    // Idempotence : 1 seul email d'objectif atteint par jour
    const existing = await db.get<{ id: string }>(`
      SELECT id FROM notifications 
      WHERE type = 'goal_achieved' AND status = 'sent' AND date(sent_at) = date(?)
    `, [dateStr]);

    if (existing) {
      return true;
    }

    const goal = customGoal || (await getDailyClippingGoal(db, dateStr));

    if (!goal.isGoalMet) {
      return false;
    }

    const config = this.getSmtpConfig();
    const clientUrl = process.env.CLIENT_URL || 'https://postboy.vercel.app';
    const subject = `PostBoy — Félicitations ! Objectif du jour atteint (${goal.publishedToday}/5)`;

    const textContent = `
PostBoy — Félicitations !

Objectif du jour atteint : ${goal.publishedToday} publications / ${goal.distinctCampaignsToday} campagnes.

Tu as respecté ta discipline de clipping aujourd'hui !
Série en cours (streak) : ${goal.streak} jour(s) consécutif(s).

Consulter ton tableau de bord :
${clientUrl}

---
PostBoy — Organisation & Discipline de clipping
`.trim();

    const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:24px;background-color:#121417;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e5e7eb;">
  <div style="max-width:560px;margin:0 auto;background-color:#1b1f24;border:1px solid #08eb08;border-radius:8px;padding:24px;">
    <div style="border-bottom:1px solid #2d333b;padding-bottom:16px;margin-bottom:20px;text-align:center;">
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#08eb08;letter-spacing:-0.02em;">Objectif du Jour Atteint !</h1>
      <p style="margin:6px 0 0 0;font-size:13px;color:#e5e7eb;">Félicitations, ta discipline de clipping est validée pour aujourd'hui.</p>
    </div>

    <div style="background-color:#121417;border:1px solid #2d333b;border-radius:6px;padding:16px;margin-bottom:20px;text-align:center;">
      <div style="font-size:32px;font-weight:800;color:#08eb08;font-family:monospace;">
        ${goal.publishedToday} / 5
      </div>
      <div style="font-size:13px;color:#9ca3af;margin-top:4px;">
        publications diffusées sur <strong style="color:#ffffff;">${goal.distinctCampaignsToday} campagnes</strong> différentes
      </div>
      <div style="margin-top:12px;font-size:12px;color:#e5e7eb;">
        Série en cours : <strong style="color:#f59e0b;">${goal.streak} jour(s) consécutif(s)</strong>
      </div>
    </div>

    <div style="text-align:center;margin:24px 0;">
      <a href="${clientUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 20px;background-color:#08eb08;color:#000000;text-decoration:none;font-weight:700;font-size:13px;border-radius:6px;">
        Voir les statistiques sur PostBoy
      </a>
    </div>

    <div style="border-top:1px solid #2d333b;padding-top:12px;font-size:11px;color:#6b7280;text-align:center;">
      PostBoy — Organisation & Discipline de clipping
    </div>
  </div>
</body>
</html>
`.trim();

    const notificationId = crypto.randomUUID();

    try {
      const transporter = this.getTransporter();
      await transporter.sendMail({
        from: config.from,
        to: config.notificationEmail,
        subject,
        text: textContent,
        html: htmlContent
      });

      await db.run(`
        INSERT INTO notifications (id, publication_id, type, recipient, subject, body, status, sent_at, error, created_at)
        VALUES (?, NULL, 'goal_achieved', ?, ?, ?, 'sent', datetime('now'), NULL, datetime('now'))
      `, [notificationId, config.notificationEmail, subject, textContent]);

      return true;
    } catch (err: any) {
      console.warn(`[Email] Échec envoi goal_achieved: ${err.message}`);
      return false;
    }
  }

  /**
   * PHASE 6 : Bilan de fin de journée (22:00 Africa/Bamako)
   */
  async sendDailyRecap(targetDateStr?: string): Promise<{ success: boolean; alreadySent?: boolean; message: string }> {
    if (!this.isConfigured()) {
      return { success: false, message: 'Service email non configuré' };
    }

    const db = getDatabase();
    const dateStr = normalizeDateString(targetDateStr);

    // Idempotence : 1 seul bilan par jour
    const existing = await db.get<{ id: string }>(`
      SELECT id FROM notifications 
      WHERE type = 'daily_recap' AND status = 'sent' AND date(sent_at) = date(?)
    `, [dateStr]);

    if (existing) {
      return { success: true, alreadySent: true, message: 'Bilan quotidien déjà envoyé.' };
    }

    const goal = await getDailyClippingGoal(db, dateStr);
    const config = this.getSmtpConfig();
    const clientUrl = process.env.CLIENT_URL || 'https://postboy.vercel.app';

    const statusTitle = goal.isGoalMet ? 'Objectif Atteint' : 'Objectif Non Atteint';
    const subject = `PostBoy — Bilan du jour : ${statusTitle} (${goal.publishedToday}/5)`;

    const textContent = `
PostBoy — Bilan de fin de journée (${dateStr})

Statut : ${statusTitle}
- Publications réalisées : ${goal.publishedToday} / 5
- Campagnes différentes : ${goal.distinctCampaignsToday} / 5
${goal.isGoalMet ? '' : `- Publications manquantes : ${goal.remainingPosts}\n- Campagnes manquantes : ${goal.remainingCampaigns}\n`}
Série en cours (streak) : ${goal.streak} jour(s)

Consulter PostBoy :
${clientUrl}

---
PostBoy — Organisation & Discipline de clipping
`.trim();

    const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:24px;background-color:#121417;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e5e7eb;">
  <div style="max-width:560px;margin:0 auto;background-color:#1b1f24;border:1px solid ${goal.isGoalMet ? '#08eb08' : '#7f1d1d'};border-radius:8px;padding:24px;">
    <div style="border-bottom:1px solid #2d333b;padding-bottom:16px;margin-bottom:20px;">
      <h1 style="margin:0;font-size:18px;font-weight:700;color:${goal.isGoalMet ? '#08eb08' : '#ef4444'};letter-spacing:-0.02em;">
        PostBoy — Bilan de Fin de Journée
      </h1>
      <p style="margin:4px 0 0 0;font-size:12px;color:#9ca3af;">Synthèse de la discipline de clipping pour le ${dateStr}</p>
    </div>

    <div style="background-color:#121417;border:1px solid #2d333b;border-radius:6px;padding:16px;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr>
          <td style="padding:4px 0;color:#9ca3af;width:150px;">Statut :</td>
          <td style="padding:4px 0;color:${goal.isGoalMet ? '#08eb08' : '#ef4444'};font-weight:700;">${statusTitle}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#9ca3af;">Publications publiées :</td>
          <td style="padding:4px 0;color:#ffffff;font-family:monospace;font-weight:600;">${goal.publishedToday} / 5</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#9ca3af;">Campagnes distinctes :</td>
          <td style="padding:4px 0;color:#ffffff;font-family:monospace;font-weight:600;">${goal.distinctCampaignsToday} / 5</td>
        </tr>
        ${!goal.isGoalMet ? `
        <tr>
          <td style="padding:4px 0;color:#9ca3af;">Posts manquants :</td>
          <td style="padding:4px 0;color:#f59e0b;font-family:monospace;">${goal.remainingPosts}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#9ca3af;">Campagnes manquantes :</td>
          <td style="padding:4px 0;color:#f59e0b;font-family:monospace;">${goal.remainingCampaigns}</td>
        </tr>` : ''}
        <tr>
          <td style="padding:4px 0;color:#9ca3af;">Série en cours (Streak) :</td>
          <td style="padding:4px 0;color:#ffffff;font-family:monospace;">${goal.streak} jour(s)</td>
        </tr>
      </table>
    </div>

    <div style="text-align:center;margin:24px 0;">
      <a href="${clientUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 20px;background-color:#08eb08;color:#000000;text-decoration:none;font-weight:700;font-size:13px;border-radius:6px;">
        Accéder à PostBoy
      </a>
    </div>

    <div style="border-top:1px solid #2d333b;padding-top:12px;font-size:11px;color:#6b7280;text-align:center;">
      PostBoy — Organisation & Discipline de clipping
    </div>
  </div>
</body>
</html>
`.trim();

    const notificationId = crypto.randomUUID();

    try {
      const transporter = this.getTransporter();
      await transporter.sendMail({
        from: config.from,
        to: config.notificationEmail,
        subject,
        text: textContent,
        html: htmlContent
      });

      await db.run(`
        INSERT INTO notifications (id, publication_id, type, recipient, subject, body, status, sent_at, error, created_at)
        VALUES (?, NULL, 'daily_recap', ?, ?, ?, 'sent', datetime('now'), NULL, datetime('now'))
      `, [notificationId, config.notificationEmail, subject, textContent]);

      return { success: true, message: 'Bilan quotidien envoyé avec succès.' };
    } catch (err: any) {
      console.warn(`[Email] Échec bilan quotidien: ${err.message}`);
      return { success: false, message: `Erreur d'envoi: ${err.message}` };
    }
  }

  /**
   * Envoie un email de test pour vérifier la connexion et configuration SMTP.
   */
  async sendTestEmail(targetEmail?: string): Promise<EmailSendResult> {
    const config = this.getSmtpConfig();
    const recipient = targetEmail ? targetEmail.trim() : config.notificationEmail;

    if (!config.host) {
      return {
        success: false,
        message: 'Serveur SMTP non configuré (variable SMTP_HOST manquante).'
      };
    }

    if (!recipient) {
      return {
        success: false,
        message: 'Adresse email destinataire manquante (variable NOTIFICATION_EMAIL manquante).'
      };
    }

    const subject = 'PostBoy — Email de test SMTP';
    const textContent = `
PostBoy — Test de configuration SMTP

Ce message confirme que votre serveur SMTP (${config.host}:${config.port}) est correctement configuré et opérationnel.
Date du test : ${new Date().toISOString()}

---
PostBoy — Notification système
`.trim();

    const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:24px;background-color:#121417;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e5e7eb;">
  <div style="max-width:560px;margin:0 auto;background-color:#1b1f24;border:1px solid #2d333b;border-radius:8px;padding:24px;">
    <div style="border-bottom:1px solid #2d333b;padding-bottom:16px;margin-bottom:20px;">
      <h1 style="margin:0;font-size:18px;font-weight:700;color:#08eb08;letter-spacing:-0.02em;">PostBoy</h1>
      <p style="margin:4px 0 0 0;font-size:12px;color:#9ca3af;">Test de notification SMTP</p>
    </div>
    
    <p style="font-size:14px;color:#ffffff;line-height:1.5;">
      Votre serveur SMTP est correctement configuré et prêt à relayer les alertes de publication.
    </p>

    <table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0;">
      <tr>
        <td style="padding:6px 0;color:#9ca3af;width:130px;">Hôte SMTP :</td>
        <td style="padding:6px 0;color:#ffffff;font-family:monospace;">${config.host}:${config.port}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#9ca3af;">Sécurité :</td>
        <td style="padding:6px 0;color:#ffffff;">${config.secure ? 'SSL/TLS (sécurisé)' : 'STARTTLS / Standard'}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#9ca3af;">Destinataire :</td>
        <td style="padding:6px 0;color:#ffffff;">${recipient}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#9ca3af;">Date du test :</td>
        <td style="padding:6px 0;color:#9ca3af;">${new Date().toISOString()}</td>
      </tr>
    </table>

    <div style="border-top:1px solid #2d333b;padding-top:12px;font-size:11px;color:#6b7280;text-align:center;">
      PostBoy — Automatisation locale de clipping
    </div>
  </div>
</body>
</html>
`.trim();

    try {
      const transporter = this.getTransporter();
      await transporter.sendMail({
        from: config.from,
        to: recipient,
        subject,
        text: textContent,
        html: htmlContent
      });

      return {
        success: true,
        message: `Email de test envoyé avec succès à ${recipient}.`
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Erreur d'envoi SMTP: ${sanitizeErrorMessage(err.message)}`
      };
    }
  }
}

export const emailService = new EmailService();
