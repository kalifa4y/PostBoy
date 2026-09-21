import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { decryptData } from '../utils/crypto.js';
import { PlatformPublisher, PublishContext, PublishResult } from './publishers/types.js';
import { TikTokPublisher } from './publishers/tiktokPublisher.js';
import { InstagramPublisher } from './publishers/instagramPublisher.js';
import { YouTubePublisher } from './publishers/youtubePublisher.js';
import { emailService } from './emailService.js';

export function getUploadsDir(): string {
  const projectRoot = path.basename(process.cwd()) === 'server'
    ? path.resolve(process.cwd(), '..')
    : process.cwd();

  const rawDir = process.env.UPLOADS_DIR || './uploads';
  const uploadsDir = path.isAbsolute(rawDir) ? rawDir : path.resolve(projectRoot, rawDir);

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  return uploadsDir;
}

export class PublicationService {
  private tiktokPublisher: PlatformPublisher = new TikTokPublisher();
  private instagramPublisher: PlatformPublisher = new InstagramPublisher();
  private youtubePublisher: PlatformPublisher = new YouTubePublisher();

  /**
   * Tente de verrouiller (claim atomique) et publier une publication.
   */
  async publishPublication(
    publicationId: string,
    options: { forceManual?: boolean } = {}
  ): Promise<PublishResult> {
    const db = getDatabase();
    const isManual = Boolean(options.forceManual);

    // 1. Verrouillage atomique (Claim transactionnel SQLite)
    if (isManual) {
      const pub = db.prepare('SELECT status, published_at FROM publications WHERE id = ?').get(publicationId) as any;
      if (!pub) {
        return { success: false, errorMessage: `Publication introuvable (ID ${publicationId})` };
      }
      if (pub.status === 'published') {
        return { success: false, errorMessage: `Cette publication a déjà été publiée avec succès le ${pub.published_at}` };
      }
      if (pub.status === 'cancelled') {
        return { success: false, errorMessage: 'Impossible de publier une publication annulée.' };
      }
      if (pub.status === 'publishing') {
        return { success: false, errorMessage: "Cette publication est déjà en cours d'envoi." };
      }

      // Claim manuel pour les statuts draft, scheduled ou failed
      const claimResult = db.prepare(`
        UPDATE publications
        SET status = 'publishing',
            updated_at = datetime('now')
        WHERE id = ? AND status IN ('draft', 'scheduled', 'failed')
      `).run(publicationId);

      if (claimResult.changes === 0) {
        return { success: false, errorMessage: "Impossible de verrouiller la publication pour l'envoi." };
      }
    } else {
      // Claim automatique du scheduler : strictement scheduled et date échue
      const claimResult = db.prepare(`
        UPDATE publications
        SET status = 'publishing',
            updated_at = datetime('now')
        WHERE id = ?
          AND status = 'scheduled'
          AND (scheduled_at IS NULL OR datetime(scheduled_at) <= datetime('now'))
      `).run(publicationId);

      if (claimResult.changes === 0) {
        return {
          success: false,
          errorMessage: 'Publication non éligible au déclenchement automatique (déjà en cours, non échue ou modifiée).'
        };
      }
    }

    console.log(`[Publication] Début de l'envoi pour la publication ${publicationId} (Mode: ${isManual ? 'Manuel' : 'Automatique'})`);

    // 2. Chargement des données détaillées
    const pubDetails = db.prepare(`
      SELECT 
        p.*,
        v.filename as video_filename,
        v.file_path as video_file_path,
        v.file_size as video_file_size,
        v.mime_type as video_mime_type,
        sa.platform as sa_platform,
        sa.account_id as sa_account_id,
        sa.username as sa_username,
        sa.display_name as sa_display_name,
        sa.access_token_encrypted as sa_access_token_encrypted,
        sa.refresh_token_encrypted as sa_refresh_token_encrypted,
        sa.status as sa_status
      FROM publications p
      LEFT JOIN videos v ON p.video_id = v.id
      LEFT JOIN social_accounts sa ON p.social_account_id = sa.id
      WHERE p.id = ?
    `).get(publicationId) as any;

    if (!pubDetails) {
      return this.failPublication(publicationId, 'Publication introuvable après verrouillage.');
    }

    // 3. Validation de la vidéo locale
    if (!pubDetails.video_id || !pubDetails.video_filename) {
      return this.failPublication(publicationId, 'Aucune vidéo rattachée à cette publication.');
    }

    const uploadsDir = getUploadsDir();
    // Résolution sécurisée contre le path traversal
    const safeVideoPath = path.resolve(uploadsDir, path.basename(pubDetails.video_filename));

    if (!safeVideoPath.startsWith(uploadsDir) || !fs.existsSync(safeVideoPath)) {
      return this.failPublication(
        publicationId,
        `Fichier vidéo local introuvable sur le disque (${pubDetails.video_filename}).`
      );
    }

    const stat = fs.statSync(safeVideoPath);
    if (!stat.isFile() || stat.size === 0) {
      return this.failPublication(publicationId, 'Le fichier vidéo est vide ou corrompu.');
    }

    // 4. Validation du compte social et des identifiants
    if (!pubDetails.social_account_id || !pubDetails.sa_account_id) {
      return this.failPublication(
        publicationId,
        'Aucun compte social associé. Veuillez assigner un compte social connecté avant de publier.'
      );
    }

    if (pubDetails.platform !== pubDetails.sa_platform) {
      return this.failPublication(
        publicationId,
        `Incohérence de plateforme : la publication cible '${pubDetails.platform}' alors que le compte associé est '${pubDetails.sa_platform}'.`
      );
    }

    if (!pubDetails.sa_access_token_encrypted) {
      return this.failPublication(
        publicationId,
        'Jeton d accès manquant pour ce compte social. Veuillez reconnecter le compte.'
      );
    }

    let decryptedAccessToken = '';
    let decryptedRefreshToken: string | undefined;

    try {
      decryptedAccessToken = decryptData(pubDetails.sa_access_token_encrypted);
      if (pubDetails.sa_refresh_token_encrypted) {
        decryptedRefreshToken = decryptData(pubDetails.sa_refresh_token_encrypted);
      }
    } catch (err: any) {
      return this.failPublication(
        publicationId,
        `Erreur de déchiffrement local du jeton OAuth: ${err.message}`
      );
    }

    if (!decryptedAccessToken) {
      return this.failPublication(
        publicationId,
        "Le déchiffrement du jeton d'accès a retourné une valeur vide."
      );
    }

    // 5. Sélection du publisher par plateforme
    let publisher: PlatformPublisher;
    switch (pubDetails.platform) {
      case 'tiktok':
        publisher = this.tiktokPublisher;
        break;
      case 'instagram':
        publisher = this.instagramPublisher;
        break;
      case 'youtube':
        publisher = this.youtubePublisher;
        break;
      default:
        return this.failPublication(
          publicationId,
          `Plateforme '${pubDetails.platform}' non prise en charge par le moteur de publication.`
        );
    }

    const context: PublishContext = {
      publicationId: pubDetails.id,
      platform: pubDetails.platform,
      title: pubDetails.title,
      caption: pubDetails.caption,
      tags: pubDetails.tags,
      externalUrl: pubDetails.external_url || pubDetails.post_url || null,
      videoFilePath: safeVideoPath,
      videoMimeType: pubDetails.video_mime_type || 'video/mp4',
      videoFileSize: stat.size,
      accountId: pubDetails.sa_account_id,
      accountUsername: pubDetails.sa_username,
      accountDisplayName: pubDetails.sa_display_name,
      decryptedAccessToken,
      decryptedRefreshToken,
      timeoutMs: Number(process.env.SOCIAL_API_TIMEOUT_MS) || 60000
    };

    // 6. Exécution de la publication vers la plateforme
    try {
      const result = await publisher.publish(context);

      if (result.success) {
        // Succès : passage en published
        db.prepare(`
          UPDATE publications
          SET status = 'published',
              published_at = datetime('now'),
              external_post_id = COALESCE(?, external_post_id),
              post_url = COALESCE(?, post_url),
              external_url = COALESCE(?, external_url),
              error_message = NULL,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(result.externalPostId || null, result.postUrl || null, result.postUrl || null, publicationId);

        // Ajout log d'exécution
        const logId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO publication_logs (id, publication_id, event, message, details, created_at)
          VALUES (?, ?, 'publish_success', ?, ?, datetime('now'))
        `).run(
          logId,
          publicationId,
          `Publication réussie sur ${pubDetails.platform}`,
          JSON.stringify({ externalPostId: result.externalPostId, postUrl: result.postUrl })
        );

        console.log(`[Publication] Succès pour la publication ${publicationId} sur ${pubDetails.platform}`);

        // Déclenchement de la notification email (non bloquante & décorrélée)
        emailService.notifyPublicationPublished(publicationId).catch((err) => {
          console.warn(`[Publication] Erreur notification email succès: ${err.message}`);
        });

        return result;
      } else {
        return this.failPublication(publicationId, result.errorMessage || 'Échec de publication inconnu');
      }
    } catch (err: any) {
      return this.failPublication(publicationId, `Erreur inattendue lors de la publication: ${err.message}`);
    }
  }

  /**
   * Marque une publication comme failed et enregistre un log d'échec.
   */
  private failPublication(publicationId: string, errorMessage: string): PublishResult {
    const db = getDatabase();
    db.prepare(`
      UPDATE publications
      SET status = 'failed',
          error_message = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(errorMessage, publicationId);

    const logId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO publication_logs (id, publication_id, event, message, details, created_at)
      VALUES (?, ?, 'publish_failed', ?, NULL, datetime('now'))
    `).run(logId, publicationId, errorMessage);

    console.warn(`[Publication] Échec pour la publication ${publicationId}: ${errorMessage}`);

    // Déclenchement de la notification email d'échec (non bloquante & décorrélée)
    emailService.notifyPublicationFailed(publicationId, errorMessage).catch((err) => {
      console.warn(`[Publication] Erreur notification email échec: ${err.message}`);
    });

    return { success: false, errorMessage };
  }
}

export const publicationService = new PublicationService();
