import fs from 'node:fs';
import { PlatformPublisher, PublishContext, PublishResult } from './types.js';

export class TikTokPublisher implements PlatformPublisher {
  async publish(ctx: PublishContext): Promise<PublishResult> {
    const timeoutMs = ctx.timeoutMs || 60000;
    const finalCaption = ctx.caption || ctx.title || 'Clip PostBoy';

    try {
      // 1. Vérification des permissions créateur (Creator Info Query)
      const creatorInfoUrl = 'https://open.tiktokapis.com/v2/post/publish/creator_info/query/';
      const creatorRes = await fetch(creatorInfoUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ctx.decryptedAccessToken}`,
          'Content-Type': 'application/json; charset=UTF-8'
        },
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!creatorRes.ok) {
        if (creatorRes.status === 401 || creatorRes.status === 403) {
          return {
            success: false,
            errorMessage: "[TikTok] Autorisation insuffisante ou token expiré. La permission 'video.publish' est requise pour le Direct Post. Veuillez reconnecter votre compte."
          };
        }
        const errorText = await creatorRes.text();
        return {
          success: false,
          errorMessage: `[TikTok] Erreur vérification créateur (HTTP ${creatorRes.status}): ${errorText}`
        };
      }

      const creatorData = await creatorRes.json() as any;
      if (creatorData.error && creatorData.error.code && creatorData.error.code !== 'ok') {
        if (creatorData.error.code === 'scope_not_authorized' || creatorData.error.code.includes('scope')) {
          return {
            success: false,
            errorMessage: "[TikTok] Scope 'video.publish' manquant. Veuillez reconnecter votre compte TikTok avec les autorisations de publication."
          };
        }
        return {
          success: false,
          errorMessage: `[TikTok] Erreur API créateur: ${creatorData.error.message || creatorData.error.code}`
        };
      }

      // 2. Initialisation du Direct Post Vidéo (Video Init)
      const initUrl = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
      const initBody = {
        post_info: {
          title: finalCaption.slice(0, 2200), // Limite TikTok
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: ctx.videoFileSize,
          chunk_size: ctx.videoFileSize,
          total_chunk_count: 1
        }
      };

      const initRes = await fetch(initUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ctx.decryptedAccessToken}`,
          'Content-Type': 'application/json; charset=UTF-8'
        },
        body: JSON.stringify(initBody),
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!initRes.ok) {
        const errorText = await initRes.text();
        return {
          success: false,
          errorMessage: `[TikTok] Échec initialisation vidéo (HTTP ${initRes.status}): ${errorText}`
        };
      }

      const initData = await initRes.json() as any;
      const publishData = initData.data || initData;

      if (!publishData || !publishData.upload_url) {
        const msg = initData.error?.message || "URL d'upload non fournie par TikTok";
        return {
          success: false,
          errorMessage: `[TikTok] ${msg}`
        };
      }

      const uploadUrl = publishData.upload_url;
      const publishId = publishData.publish_id || `tt_pub_${Date.now()}`;

      // 3. Upload binaire du fichier vidéo vers l'URL fournie par TikTok
      const fileBuffer = await fs.promises.readFile(ctx.videoFilePath);

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Range': `bytes 0-${ctx.videoFileSize - 1}/${ctx.videoFileSize}`,
          'Content-Type': ctx.videoMimeType || 'video/mp4',
          'Content-Length': String(ctx.videoFileSize)
        },
        body: fileBuffer,
        signal: AbortSignal.timeout(timeoutMs * 2) // Plus de temps pour le transfert binaire
      });

      if (!uploadRes.ok && uploadRes.status !== 200 && uploadRes.status !== 201) {
        const uploadError = await uploadRes.text();
        return {
          success: false,
          errorMessage: `[TikTok] Échec du transfert de la vidéo (HTTP ${uploadRes.status}): ${uploadError}`
        };
      }

      return {
        success: true,
        externalPostId: publishId
      };
    } catch (err: any) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        return {
          success: false,
          errorMessage: `[TikTok] Délai d'attente réseau dépassé (${timeoutMs}ms)`
        };
      }
      return {
        success: false,
        errorMessage: `[TikTok] Erreur inattendue: ${err.message || 'Erreur réseau'}`
      };
    }
  }
}
