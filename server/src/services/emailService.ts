import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { getDatabase } from '../db/connection.js';

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
   * Décorrélation totale : en cas d'erreur SMTP, la fonction loggue l'erreur et retourne false
   * sans jamais lever d'exception ni altérer la publication.
   */
  async notifyPublicationPublished(publicationId: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    const db = getDatabase();

    // 1. Récupération des détails de la publication
    const pub = db.prepare(`
      SELECT 
        p.*,
        c.name as campaign_name,
        sa.username as sa_username,
        sa.display_name as sa_display_name
      FROM publications p
      LEFT JOIN campaigns c ON p.campaign_id = c.id
      LEFT JOIN social_accounts sa ON p.social_account_id = sa.id
      WHERE p.id = ?
    `).get(publicationId) as any;

    if (!pub) {
      return false;
    }

    // 2. Vérification d'idempotence : éviter tout doublon d'email de succès
    const existing = db.prepare(`
      SELECT id FROM notifications 
      WHERE publication_id = ? AND type = 'publication_published' AND status = 'sent'
    `).get(publicationId);

    if (existing) {
      return true; // Déjà notifié avec succès
    }

    const config = this.getSmtpConfig();
    const platformDisplay = pub.platform.charAt(0).toUpperCase() + pub.platform.slice(1);
    const campaignDisplay = pub.campaign_name || 'Aucune campagne';
    const accountDisplay = pub.sa_username ? `@${pub.sa_username}` : (pub.sa_display_name || 'Non renseigné');
    const postUrlDisplay = pub.external_url || pub.post_url || 'Non disponible pour le moment';
    const titleDisplay = pub.title || 'Sans titre';
    const publishedAtDisplay = pub.published_at || new Date().toISOString();

    const subject = `PostBoy — Publication réussie — ${platformDisplay} — ${campaignDisplay}`;

    const textContent = `
PostBoy — Notification de publication

Statut : Publication réussie
Campagne : ${campaignDisplay}
Plateforme : ${platformDisplay}
Compte : ${accountDisplay}
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
        <td style="padding:6px 0;color:#9ca3af;">Compte social :</td>
        <td style="padding:6px 0;color:#ffffff;">${accountDisplay}</td>
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
      PostBoy — Automatisation locale de clipping
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

      // Enregistrement succès dans SQLite
      db.prepare(`
        INSERT INTO notifications (id, publication_id, type, recipient, subject, body, status, sent_at, error, created_at)
        VALUES (?, ?, 'publication_published', ?, ?, ?, 'sent', datetime('now'), NULL, datetime('now'))
      `).run(notificationId, publicationId, config.notificationEmail, subject, textContent);

      db.prepare(`
        INSERT INTO publication_logs (id, publication_id, event, message, details, created_at)
        VALUES (?, ?, 'email_notification_sent', ?, ?, datetime('now'))
      `).run(crypto.randomUUID(), publicationId, `Notification email de succès envoyée à ${config.notificationEmail}`, JSON.stringify({ notificationId, recipient: config.notificationEmail }));

      return true;
    } catch (err: any) {
      console.warn(`[Email] Échec de l'envoi de notification (publicationId=${publicationId}): ${err.message}`);

      // Enregistrement de l'échec dans SQLite
      try {
        db.prepare(`
          INSERT INTO notifications (id, publication_id, type, recipient, subject, body, status, sent_at, error, created_at)
          VALUES (?, ?, 'publication_published', ?, ?, ?, 'failed', NULL, ?, datetime('now'))
        `).run(notificationId, publicationId, config.notificationEmail, subject, textContent, sanitizeErrorMessage(err.message));
      } catch (dbErr: any) {
        console.error(`[Email] Erreur enregistrement échec notification: ${dbErr.message}`);
      }

      return false;
    }
  }

  /**
   * Notifie l'utilisateur qu'une publication a échoué.
   * Décorrélation totale : l'échec d'envoi SMTP ne perturbe pas le statut de la publication.
   */
  async notifyPublicationFailed(publicationId: string, rawErrorMessage: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    const db = getDatabase();

    const pub = db.prepare(`
      SELECT 
        p.*,
        c.name as campaign_name,
        sa.username as sa_username,
        sa.display_name as sa_display_name
      FROM publications p
      LEFT JOIN campaigns c ON p.campaign_id = c.id
      LEFT JOIN social_accounts sa ON p.social_account_id = sa.id
      WHERE p.id = ?
    `).get(publicationId) as any;

    if (!pub) {
      return false;
    }

    // Idempotence : ne pas envoyer de doublon pour le même échec
    const existing = db.prepare(`
      SELECT id FROM notifications 
      WHERE publication_id = ? AND type = 'publication_failed' AND status = 'sent'
    `).get(publicationId);

    if (existing) {
      return true;
    }

    const config = this.getSmtpConfig();
    const platformDisplay = pub.platform ? (pub.platform.charAt(0).toUpperCase() + pub.platform.slice(1)) : 'Inconnue';
    const campaignDisplay = pub.campaign_name || 'Aucune campagne';
    const accountDisplay = pub.sa_username ? `@${pub.sa_username}` : (pub.sa_display_name || 'Non renseigné');
    const titleDisplay = pub.title || 'Sans titre';
    const cleanError = sanitizeErrorMessage(rawErrorMessage);
    const dateDisplay = new Date().toISOString();

    const subject = `PostBoy — Publication échouée — ${platformDisplay} — ${campaignDisplay}`;

    const textContent = `
PostBoy — Alerte de publication échouée

Statut : Échec de publication
Campagne : ${campaignDisplay}
Plateforme : ${platformDisplay}
Compte : ${accountDisplay}
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
        <td style="padding:6px 0;color:#9ca3af;">Compte social :</td>
        <td style="padding:6px 0;color:#ffffff;">${accountDisplay}</td>
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
      PostBoy — Automatisation locale de clipping
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

      // Enregistrement succès d'envoi dans SQLite
      db.prepare(`
        INSERT INTO notifications (id, publication_id, type, recipient, subject, body, status, sent_at, error, created_at)
        VALUES (?, ?, 'publication_failed', ?, ?, ?, 'sent', datetime('now'), NULL, datetime('now'))
      `).run(notificationId, publicationId, config.notificationEmail, subject, textContent);

      db.prepare(`
        INSERT INTO publication_logs (id, publication_id, event, message, details, created_at)
        VALUES (?, ?, 'email_notification_sent', ?, ?, datetime('now'))
      `).run(crypto.randomUUID(), publicationId, `Notification email d'échec envoyée à ${config.notificationEmail}`, JSON.stringify({ notificationId, recipient: config.notificationEmail }));

      return true;
    } catch (err: any) {
      console.warn(`[Email] Échec de l'envoi d'email d'erreur (publicationId=${publicationId}): ${err.message}`);

      try {
        db.prepare(`
          INSERT INTO notifications (id, publication_id, type, recipient, subject, body, status, sent_at, error, created_at)
          VALUES (?, ?, 'publication_failed', ?, ?, ?, 'failed', NULL, ?, datetime('now'))
        `).run(notificationId, publicationId, config.notificationEmail, subject, textContent, sanitizeErrorMessage(err.message));
      } catch (dbErr: any) {
        console.error(`[Email] Erreur enregistrement échec notification: ${dbErr.message}`);
      }

      return false;
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
