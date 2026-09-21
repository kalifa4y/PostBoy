import { PlatformPublisher, PublishContext, PublishResult } from './types.js';

export class InstagramPublisher implements PlatformPublisher {
  async publish(ctx: PublishContext): Promise<PublishResult> {
    const timeoutMs = ctx.timeoutMs || 60000;
    const finalCaption = ctx.caption || ctx.title || 'Clip PostBoy';

    // 1. Vérification des exigences de l'API officielle Meta / Instagram Graph
    // Meta Instagram Graph API exige une URL publique accessible pour télécharger la vidéo
    // (ou un hébergement public distant / tunnel pour que les serveurs Meta puissent récupérer le conteneur).
    let publicVideoUrl = '';

    // Si une URL externe a été spécifiée pour la publication ou si le fichier est servi sur une URL publique
    if ((ctx as any).externalUrl && (ctx as any).externalUrl.startsWith('http')) {
      publicVideoUrl = (ctx as any).externalUrl;
    }

    if (!publicVideoUrl) {
      return {
        success: false,
        errorMessage: "[Instagram] L'API officielle Meta Instagram Graph exige une URL vidéo publique accessible pour la création du conteneur de média (media_type=REELS). Un fichier local pur ne peut pas être ingéré directement par les serveurs de Meta sans URL d'hébergement public."
      };
    }

    try {
      // 2. Création du conteneur de média Instagram (Media Container)
      const containerUrl = `https://graph.facebook.com/v21.0/${ctx.accountId}/media`;
      const containerParams = new URLSearchParams({
        media_type: 'REELS',
        video_url: publicVideoUrl,
        caption: finalCaption,
        access_token: ctx.decryptedAccessToken
      });

      const containerRes = await fetch(`${containerUrl}?${containerParams.toString()}`, {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!containerRes.ok) {
        if (containerRes.status === 401 || containerRes.status === 403) {
          return {
            success: false,
            errorMessage: "[Instagram] Autorisation insuffisante ou compte non éligible. La permission 'instagram_content_publish' et un compte Instagram Business/Creator relié sont requis."
          };
        }
        const errorText = await containerRes.text();
        return {
          success: false,
          errorMessage: `[Instagram] Échec création conteneur média (HTTP ${containerRes.status}): ${errorText}`
        };
      }

      const containerData = await containerRes.json() as any;
      const creationId = containerData.id;

      if (!creationId) {
        return {
          success: false,
          errorMessage: "[Instagram] Identifiant de conteneur média absent de la réponse Meta"
        };
      }

      // 3. Publication du conteneur (Media Publish)
      const publishUrl = `https://graph.facebook.com/v21.0/${ctx.accountId}/media_publish`;
      const publishParams = new URLSearchParams({
        creation_id: creationId,
        access_token: ctx.decryptedAccessToken
      });

      const publishRes = await fetch(`${publishUrl}?${publishParams.toString()}`, {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!publishRes.ok) {
        const errorText = await publishRes.text();
        return {
          success: false,
          errorMessage: `[Instagram] Échec de la publication du conteneur (HTTP ${publishRes.status}): ${errorText}`
        };
      }

      const publishData = await publishRes.json() as any;
      const publishedId = publishData.id || creationId;

      return {
        success: true,
        externalPostId: publishedId
      };
    } catch (err: any) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        return {
          success: false,
          errorMessage: `[Instagram] Délai d'attente réseau dépassé (${timeoutMs}ms)`
        };
      }
      return {
        success: false,
        errorMessage: `[Instagram] Erreur: ${err.message || 'Erreur réseau'}`
      };
    }
  }
}
