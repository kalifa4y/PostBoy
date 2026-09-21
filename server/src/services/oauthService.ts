import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

export type SupportedPlatform = 'tiktok' | 'instagram' | 'youtube';

export interface SocialAccountOAuthResult {
  platform: SupportedPlatform;
  accountId: string;
  username: string;
  displayName: string;
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds?: number;
}

export interface PlatformConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Récupère la configuration OAuth pour une plateforme donnée.
 */
export function getPlatformConfig(platform: SupportedPlatform): PlatformConfig {
  const host = process.env.HOST || '127.0.0.1';
  const port = process.env.PORT || '3001';
  const defaultBaseCallback = `http://${host}:${port}/api/social-accounts`;

  switch (platform) {
    case 'tiktok':
      return {
        clientId: process.env.TIKTOK_CLIENT_KEY || '',
        clientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
        redirectUri: process.env.TIKTOK_REDIRECT_URI || `${defaultBaseCallback}/tiktok/callback`
      };
    case 'instagram':
      return {
        clientId: process.env.INSTAGRAM_CLIENT_ID || '',
        clientSecret: process.env.INSTAGRAM_CLIENT_SECRET || '',
        redirectUri: process.env.INSTAGRAM_REDIRECT_URI || `${defaultBaseCallback}/instagram/callback`
      };
    case 'youtube':
      return {
        clientId: process.env.YOUTUBE_CLIENT_ID || '',
        clientSecret: process.env.YOUTUBE_CLIENT_SECRET || '',
        redirectUri: process.env.YOUTUBE_REDIRECT_URI || `${defaultBaseCallback}/youtube/callback`
      };
    default:
      throw new Error(`Plateforme non supportée: ${platform}`);
  }
}

/**
 * Vérifie si les identifiants OAuth d'une plateforme sont bien configurés.
 */
export function isPlatformConfigured(platform: SupportedPlatform): boolean {
  try {
    const config = getPlatformConfig(platform);
    return Boolean(config.clientId && config.clientSecret);
  } catch {
    return false;
  }
}

/**
 * Génère l'URL d'autorisation officielle selon la plateforme.
 */
export function generateAuthorizationUrl(platform: SupportedPlatform, state: string): string {
  const config = getPlatformConfig(platform);
  if (!config.clientId) {
    throw new Error(`Identifiant client manquant pour la plateforme ${platform}`);
  }

  switch (platform) {
    case 'tiktok': {
      const params = new URLSearchParams({
        client_key: config.clientId,
        scope: 'user.info.basic',
        response_type: 'code',
        redirect_uri: config.redirectUri,
        state
      });
      return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
    }
    case 'instagram': {
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        scope: 'user_profile,user_media',
        response_type: 'code',
        state
      });
      return `https://api.instagram.com/oauth/authorize?${params.toString()}`;
    }
    case 'youtube': {
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/youtube.readonly',
        access_type: 'offline',
        prompt: 'consent',
        state
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }
    default:
      throw new Error(`Plateforme non supportée: ${platform}`);
  }
}

/**
 * Échange le code d'autorisation contre les tokens et récupère le profil du compte.
 */
export async function exchangeCodeAndGetProfile(
  platform: SupportedPlatform,
  code: string
): Promise<SocialAccountOAuthResult> {
  const config = getPlatformConfig(platform);
  if (!config.clientId || !config.clientSecret) {
    throw new Error(`Configuration OAuth incomplète pour ${platform}`);
  }

  switch (platform) {
    case 'tiktok':
      return await handleTikTokOAuth(code, config);
    case 'instagram':
      return await handleInstagramOAuth(code, config);
    case 'youtube':
      return await handleYouTubeOAuth(code, config);
    default:
      throw new Error(`Plateforme non supportée: ${platform}`);
  }
}

/**
 * Flux OAuth TikTok officiel
 */
async function handleTikTokOAuth(code: string, config: PlatformConfig): Promise<SocialAccountOAuthResult> {
  const tokenUrl = 'https://open.tiktokapis.com/v2/oauth/token/';
  const body = new URLSearchParams({
    client_key: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri
  });

  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  if (!tokenRes.ok) {
    const errorText = await tokenRes.text();
    throw new Error(`Échec de l'échange de jeton TikTok (HTTP ${tokenRes.status}): ${errorText}`);
  }

  const tokenData = await tokenRes.json() as any;
  const payload = tokenData.data || tokenData;
  const accessToken = payload.access_token;
  const refreshToken = payload.refresh_token;
  const expiresIn = payload.expires_in;
  const openId = payload.open_id;

  if (!accessToken) {
    throw new Error("Jeton d'accès TikTok manquant dans la réponse officielle");
  }

  // Récupération des informations de profil
  const userInfoUrl = 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username';
  const userRes = await fetch(userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  let username = 'tiktok_user';
  let displayName = 'TikTok User';
  let accountId = openId || '';

  if (userRes.ok) {
    const userData = await userRes.json() as any;
    const user = userData.data?.user || {};
    if (user.open_id) accountId = user.open_id;
    if (user.username) username = user.username;
    if (user.display_name) displayName = user.display_name;
  }

  if (!accountId) {
    accountId = `tiktok_${Date.now()}`;
  }

  return {
    platform: 'tiktok',
    accountId,
    username: username || displayName || accountId,
    displayName: displayName || username || 'TikTok Account',
    accessToken,
    refreshToken,
    expiresInSeconds: typeof expiresIn === 'number' ? expiresIn : undefined
  };
}

/**
 * Flux OAuth Instagram officiel (Instagram Graph / Basic Display)
 */
async function handleInstagramOAuth(code: string, config: PlatformConfig): Promise<SocialAccountOAuthResult> {
  const tokenUrl = 'https://api.instagram.com/oauth/access_token';
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri,
    code
  });

  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  if (!tokenRes.ok) {
    const errorText = await tokenRes.text();
    throw new Error(`Échec de l'échange de jeton Instagram (HTTP ${tokenRes.status}): ${errorText}`);
  }

  const tokenData = await tokenRes.json() as any;
  let accessToken = tokenData.access_token;
  const initialUserId = tokenData.user_id ? String(tokenData.user_id) : '';
  let expiresIn: number | undefined = tokenData.expires_in;

  if (!accessToken) {
    throw new Error("Jeton d'accès Instagram manquant dans la réponse");
  }

  // Échange optionnel pour un jeton longue durée (Long-Lived Token valide 60 jours)
  try {
    const longLivedUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(config.clientSecret)}&access_token=${encodeURIComponent(accessToken)}`;
    const longLivedRes = await fetch(longLivedUrl);
    if (longLivedRes.ok) {
      const longLivedData = await longLivedRes.json() as any;
      if (longLivedData.access_token) {
        accessToken = longLivedData.access_token;
        expiresIn = longLivedData.expires_in || 5184000; // 60 jours par défaut
      }
    }
  } catch (err) {
    // Si l'échange long-lived échoue, on conserve le token de courte durée
    console.warn("[Instagram OAuth] Long-lived token exchange bypassed:", err);
  }

  // Récupération du profil Instagram
  let username = 'instagram_user';
  let accountId = initialUserId;

  try {
    const profileUrl = 'https://graph.instagram.com/v21.0/me?fields=id,username,account_type';
    const profileRes = await fetch(profileUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (profileRes.ok) {
      const profileData = await profileRes.json() as any;
      if (profileData.id) accountId = String(profileData.id);
      if (profileData.username) username = profileData.username;
    }
  } catch (err) {
    console.warn("[Instagram OAuth] Profile fetch bypassed:", err);
  }

  if (!accountId) {
    accountId = `ig_${Date.now()}`;
  }

  return {
    platform: 'instagram',
    accountId,
    username: username || accountId,
    displayName: username || 'Instagram Account',
    accessToken,
    expiresInSeconds: typeof expiresIn === 'number' ? expiresIn : undefined
  };
}

/**
 * Flux OAuth YouTube officiel (Google OAuth 2.0)
 */
async function handleYouTubeOAuth(code: string, config: PlatformConfig): Promise<SocialAccountOAuthResult> {
  const tokenUrl = 'https://oauth2.googleapis.com/token';
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri
  });

  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  if (!tokenRes.ok) {
    const errorText = await tokenRes.text();
    throw new Error(`Échec de l'échange de jeton Google/YouTube (HTTP ${tokenRes.status}): ${errorText}`);
  }

  const tokenData = await tokenRes.json() as any;
  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token;
  const expiresIn = tokenData.expires_in;

  if (!accessToken) {
    throw new Error("Jeton d'accès YouTube manquant dans la réponse");
  }

  // Récupération de l'identité de la chaîne YouTube
  const channelsUrl = 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true';
  const channelRes = await fetch(channelsUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  let accountId = '';
  let username = 'youtube_channel';
  let displayName = 'YouTube Channel';

  if (channelRes.ok) {
    const channelData = await channelRes.json() as any;
    const item = channelData.items?.[0];
    if (item) {
      accountId = item.id;
      if (item.snippet?.title) displayName = item.snippet.title;
      if (item.snippet?.customUrl) username = item.snippet.customUrl;
      else if (item.snippet?.title) username = item.snippet.title;
    }
  }

  if (!accountId) {
    accountId = `yt_${Date.now()}`;
  }

  return {
    platform: 'youtube',
    accountId,
    username: username || displayName || accountId,
    displayName: displayName || username || 'YouTube Channel',
    accessToken,
    refreshToken,
    expiresInSeconds: typeof expiresIn === 'number' ? expiresIn : undefined
  };
}
