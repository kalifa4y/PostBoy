import crypto from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { decryptData } from '../utils/crypto.js';

export interface UrlResolveResult {
  success: boolean;
  externalUrl?: string | null;
  externalPostId?: string | null;
  alreadyResolved?: boolean;
  message: string;
}

/**
 * Valide strictement qu'une URL est bien formée et utilise le protocole HTTP ou HTTPS.
 * Empêche l'injection de schémas arbitraires (javascript:, data:, file:, etc.).
 */
export function isValidHttpUrl(candidate: string | null | undefined): boolean {
  if (!candidate || typeof candidate !== 'string') return false;
  const trimmed = candidate.trim();
  if (!trimmed) return false;

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export class UrlResolverService {
  /**
   * Résout et stocke l'URL publique officielle d'une publication publiée.
   * L'opération est idempotente : si une URL valide est déjà stockée, aucun appel réseau inutile n'est effectué.
   */
  async resolvePublicationUrl(publicationId: string): Promise<UrlResolveResult> {
    const db = getDatabase();

    // 1. Récupération de la publication et des informations du compte social rattaché
    const pub = db.prepare(`
      SELECT 
        p.*,
        sa.platform as sa_platform,
        sa.account_id as sa_account_id,
        sa.access_token_encrypted as sa_access_token_encrypted,
        sa.refresh_token_encrypted as sa_refresh_token_encrypted
      FROM publications p
      LEFT JOIN social_accounts sa ON p.social_account_id = sa.id
      WHERE p.id = ?
    `).get(publicationId) as any;

    if (!pub) {
      return {
        success: false,
        message: `Publication introuvable avec l'identifiant ${publicationId}`
      };
    }

    // 2. Vérification du statut : la résolution n'a de sens que si la publication a été publiée
    if (pub.status !== 'published') {
      return {
        success: false,
        message: `Impossible de résoudre l'URL : la publication est en statut '${pub.status}' (seul le statut 'published' est éligible).`
      };
    }

    // 3. Idempotence : si external_url est déjà valide, on la conserve sans refaire d'appel externe
    if (pub.external_url && isValidHttpUrl(pub.external_url)) {
      return {
        success: true,
        externalUrl: pub.external_url,
        externalPostId: pub.external_post_id,
        alreadyResolved: true,
        message: 'L\'URL officielle est déjà enregistrée.'
      };
    }

    // 4. Vérification de l'identifiant externe officiel retourné par la plateforme lors de la publication
    const externalPostId = pub.external_post_id ? String(pub.external_post_id).trim() : '';
    if (!externalPostId) {
      return {
        success: false,
        message: 'Aucun identifiant de publication externe (external_post_id) enregistré pour cette publication.'
      };
    }

    // 5. Déchiffrement du token du compte si nécessaire (pour Instagram / TikTok)
    let decryptedAccessToken = '';
    if (pub.sa_access_token_encrypted) {
      try {
        decryptedAccessToken = decryptData(pub.sa_access_token_encrypted);
      } catch (err: any) {
        console.error(`[UrlResolver] Erreur déchiffrement jeton: ${err.message}`);
      }
    }

    // 6. Résolution selon la plateforme
    let resolvedUrl: string | null = null;
    let statusMessage = '';

    switch (pub.platform) {
      case 'youtube': {
        // YouTube Data API v3 : l'URL de visionnage est déterministe et officielle à partir du videoId
        resolvedUrl = this.resolveYouTubeUrl(externalPostId);
        statusMessage = 'URL YouTube résolue avec succès.';
        break;
      }

      case 'instagram': {
        // Meta Instagram Graph API : récupération du permalink officiel via GET /{media-id}?fields=id,permalink
        if (!decryptedAccessToken) {
          return {
            success: false,
            message: '[Instagram] Jeton d\'accès manquant pour interroger l\'API Meta Graph.'
          };
        }
        const igResult = await this.resolveInstagramUrl(externalPostId, decryptedAccessToken);
        resolvedUrl = igResult.url;
        statusMessage = igResult.message;
        break;
      }

      case 'tiktok': {
        // TikTok Content Posting API v2 / Display API
        if (!decryptedAccessToken) {
          return {
            success: false,
            message: '[TikTok] Jeton d\'accès manquant pour interroger l\'API TikTok.'
          };
        }
        const ttResult = await this.resolveTikTokUrl(externalPostId, decryptedAccessToken);
        resolvedUrl = ttResult.url;
        statusMessage = ttResult.message;
        break;
      }

      default: {
        return {
          success: false,
          message: `Plateforme '${pub.platform}' non prise en charge pour la résolution d'URL.`
        };
      }
    }

    // 7. Validation et persistance
    if (resolvedUrl && isValidHttpUrl(resolvedUrl)) {
      db.prepare(`
        UPDATE publications
        SET external_url = ?,
            post_url = COALESCE(post_url, ?),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(resolvedUrl, resolvedUrl, publicationId);

      // Audit log
      const logId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO publication_logs (id, publication_id, event, message, details, created_at)
        VALUES (?, ?, 'url_resolved', ?, ?, datetime('now'))
      `).run(
        logId,
        publicationId,
        `URL officielle résolue pour ${pub.platform}`,
        JSON.stringify({ externalPostId, externalUrl: resolvedUrl })
      );

      return {
        success: true,
        externalUrl: resolvedUrl,
        externalPostId,
        message: statusMessage || 'URL publique officielle enregistrée avec succès.'
      };
    } else {
      // Si l'API officielle ne fournit pas d'URL (ou pas encore disponible)
      return {
        success: false,
        externalUrl: null,
        externalPostId,
        message: statusMessage || 'URL publique non disponible via l\'API officielle de la plateforme.'
      };
    }
  }

  /**
   * Résout l'URL YouTube de manière déterministe et officielle.
   */
  resolveYouTubeUrl(videoId: string): string | null {
    if (!videoId || videoId.trim() === '') return null;
    const cleanId = videoId.trim();
    return `https://www.youtube.com/watch?v=${cleanId}`;
  }

  /**
   * Interroge l'API officielle Meta Instagram Graph pour récupérer le permalink officiel d'un Reel.
   * Endpoint: GET https://graph.facebook.com/v21.0/{media_id}?fields=id,permalink&access_token={token}
   */
  async resolveInstagramUrl(mediaId: string, accessToken: string): Promise<{ url: string | null; message: string }> {
    const cleanId = mediaId.trim();
    const url = `https://graph.facebook.com/v21.0/${cleanId}?fields=id,permalink&access_token=${encodeURIComponent(accessToken)}`;

    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(15000)
      });

      if (!res.ok) {
        const errText = await res.text();
        return {
          url: null,
          message: `[Instagram] Échec interrogation permalink (HTTP ${res.status}): ${errText}`
        };
      }

      const data = await res.json() as any;
      if (data.permalink && isValidHttpUrl(data.permalink)) {
        return {
          url: data.permalink,
          message: 'Permalink Instagram récupéré avec succès.'
        };
      }

      return {
        url: null,
        message: '[Instagram] Champ permalink non présent dans la réponse Meta.'
      };
    } catch (err: any) {
      return {
        url: null,
        message: `[Instagram] Erreur réseau lors de la récupération du permalink: ${err.message}`
      };
    }
  }

  /**
   * Interroge l'API TikTok pour obtenir le statut et le share_url officiel.
   * 1. Interrogation de POST /v2/post/publish/status/fetch/ avec { publish_id }
   * 2. Si publish complete et publicaly_available_post_id présent, interrogation du Display API /v2/video/query/?fields=id,title,share_url
   */
  async resolveTikTokUrl(publishId: string, accessToken: string): Promise<{ url: string | null; message: string }> {
    const cleanId = publishId.trim();

    try {
      // 1. Vérification du statut de publication
      const statusUrl = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/';
      const statusRes = await fetch(statusUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8'
        },
        body: JSON.stringify({ publish_id: cleanId }),
        signal: AbortSignal.timeout(15000)
      });

      if (!statusRes.ok) {
        const errText = await statusRes.text();
        return {
          url: null,
          message: `[TikTok] Échec vérification statut (HTTP ${statusRes.status}): ${errText}`
        };
      }

      const statusData = await statusRes.json() as any;
      const pubData = statusData.data || {};
      const status = pubData.status;

      if (status === 'PROCESSING_DOWNLOAD' || status === 'PROCESSING_UPLOAD') {
        return {
          url: null,
          message: '[TikTok] Vidéo encore en cours de traitement par TikTok. Veuillez réessayer dans un instant.'
        };
      }

      if (status === 'FAILED') {
        return {
          url: null,
          message: `[TikTok] Échec du traitement chez TikTok: ${pubData.fail_reason || 'Raison inconnue'}`
        };
      }

      const availablePostIds = pubData.publicaly_available_post_id;
      const videoId = Array.isArray(availablePostIds) && availablePostIds.length > 0 ? String(availablePostIds[0]) : null;

      if (!videoId) {
        return {
          url: null,
          message: '[TikTok] Le post n\'est pas encore publiquement disponible ou est en attente de modération (aucun publicaly_available_post_id).'
        };
      }

      // 2. Récupération de l'URL officielle (share_url) via l'endpoint officiel Display API
      const videoQueryUrl = 'https://open.tiktokapis.com/v2/video/query/?fields=id,title,share_url';
      const videoRes = await fetch(videoQueryUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8'
        },
        body: JSON.stringify({
          filters: {
            video_ids: [videoId]
          }
        }),
        signal: AbortSignal.timeout(15000)
      });

      if (videoRes.ok) {
        const videoData = await videoRes.json() as any;
        const videos = videoData.data?.videos;
        if (Array.isArray(videos) && videos.length > 0 && videos[0].share_url && isValidHttpUrl(videos[0].share_url)) {
          return {
            url: videos[0].share_url,
            message: 'URL officielle TikTok (share_url) récupérée avec succès.'
          };
        }
      }

      // Si le scope video.list n'est pas activé ou si share_url n'est pas retourné :
      // Conformément à la Règle 3 & 9, on n'invente PAS l'URL
      return {
        url: null,
        message: `[TikTok] Post identifié (${videoId}), mais l'URL publique n'a pas pu être extraite officiellement via l'API.`
      };
    } catch (err: any) {
      return {
        url: null,
        message: `[TikTok] Erreur réseau lors de la résolution de l'URL: ${err.message}`
      };
    }
  }
}

export const urlResolverService = new UrlResolverService();
