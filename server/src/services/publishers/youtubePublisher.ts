import fs from 'node:fs';
import { PlatformPublisher, PublishContext, PublishResult } from './types.js';

export class YouTubePublisher implements PlatformPublisher {
  async publish(ctx: PublishContext): Promise<PublishResult> {
    const timeoutMs = ctx.timeoutMs || 60000;
    const finalTitle = (ctx.title || 'Clip PostBoy').slice(0, 100);
    const finalDescription = ctx.caption || '';
    const tags = ctx.tags ? ctx.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];

    try {
      // 1. Initialisation de la session d'upload résumable Google YouTube Data API v3
      const initUrl = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
      const metadata = {
        snippet: {
          title: finalTitle,
          description: finalDescription,
          tags: tags.length > 0 ? tags : undefined
        },
        status: {
          privacyStatus: 'private', // Privé par défaut pour éviter toute publication publique accidentelle
          selfDeclaredMadeForKids: false
        }
      };

      const initRes = await fetch(initUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ctx.decryptedAccessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Length': String(ctx.videoFileSize),
          'X-Upload-Content-Type': ctx.videoMimeType || 'video/mp4'
        },
        body: JSON.stringify(metadata),
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!initRes.ok) {
        if (initRes.status === 401 || initRes.status === 403) {
          const errBody = await initRes.text();
          if (errBody.includes('insufficientPermissions') || errBody.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
            return {
              success: false,
              errorMessage: "[YouTube] Autorisation insuffisante. Le scope 'https://www.googleapis.com/auth/youtube.upload' est requis pour uploader des vidéos. Veuillez reconnecter votre compte YouTube avec les permissions d'upload."
            };
          }
          return {
            success: false,
            errorMessage: "[YouTube] Jeton d'accès invalide ou expiré. Veuillez reconnecter votre compte YouTube."
          };
        }

        const errorText = await initRes.text();
        return {
          success: false,
          errorMessage: `[YouTube] Échec initialisation upload (HTTP ${initRes.status}): ${errorText}`
        };
      }

      const uploadUrl = initRes.headers.get('Location');
      if (!uploadUrl) {
        return {
          success: false,
          errorMessage: "[YouTube] URL d'upload résumable manquante dans les en-têtes Google"
        };
      }

      // 2. Transfert du binaire de la vidéo vers l'URL résumable
      const fileBuffer = await fs.promises.readFile(ctx.videoFilePath);

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': ctx.videoMimeType || 'video/mp4',
          'Content-Length': String(ctx.videoFileSize)
        },
        body: fileBuffer,
        signal: AbortSignal.timeout(timeoutMs * 2)
      });

      if (!uploadRes.ok && uploadRes.status !== 200 && uploadRes.status !== 201) {
        const uploadError = await uploadRes.text();
        return {
          success: false,
          errorMessage: `[YouTube] Échec transfert binaire vidéo (HTTP ${uploadRes.status}): ${uploadError}`
        };
      }

      const videoData = await uploadRes.json() as any;
      const videoId = videoData.id || `yt_vid_${Date.now()}`;

      return {
        success: true,
        externalPostId: videoId,
        postUrl: `https://www.youtube.com/watch?v=${videoId}`
      };
    } catch (err: any) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        return {
          success: false,
          errorMessage: `[YouTube] Délai d'attente réseau dépassé (${timeoutMs}ms)`
        };
      }
      return {
        success: false,
        errorMessage: `[YouTube] Erreur inattendue: ${err.message || 'Erreur réseau'}`
      };
    }
  }
}
