import { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { encryptData } from '../utils/crypto.js';
import {
  createOAuthState,
  verifyAndConsumeOAuthState
} from '../utils/oauthState.js';
import {
  SupportedPlatform,
  isPlatformConfigured,
  generateAuthorizationUrl,
  exchangeCodeAndGetProfile
} from '../services/oauthService.js';

export interface SocialAccountPublic {
  id: string;
  platform: SupportedPlatform;
  account_id: string;
  username: string;
  display_name: string | null;
  status: 'connected' | 'expired' | 'disconnected' | 'error';
  token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SocialAccountDbRow {
  id: string;
  platform: string;
  account_id: string;
  username: string;
  display_name: string | null;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

/**
 * Assainit un compte pour la réponse API : supprime strictement les tokens chiffrés.
 */
function sanitizeSocialAccount(row: SocialAccountDbRow): SocialAccountPublic {
  return {
    id: row.id,
    platform: row.platform as SupportedPlatform,
    account_id: row.account_id,
    username: row.username,
    display_name: row.display_name,
    status: row.status as 'connected' | 'expired' | 'disconnected' | 'error',
    token_expires_at: row.token_expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export async function socialAccountRoutes(fastify: FastifyInstance): Promise<void> {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

  // GET /api/social-accounts - Liste des comptes connectés et état de configuration
  fastify.get('/api/social-accounts', async (_request, reply) => {
    try {
      const db = getDatabase();
      const rows = db.prepare(`
        SELECT id, platform, account_id, username, display_name,
               token_expires_at, status, created_at, updated_at
        FROM social_accounts
        ORDER BY created_at DESC
      `).all() as unknown as SocialAccountDbRow[];

      const sanitizedAccounts = rows.map(sanitizeSocialAccount);

      // Statut de configuration pour chaque plateforme
      const platformsConfig = {
        tiktok: {
          name: 'TikTok',
          configured: isPlatformConfigured('tiktok')
        },
        instagram: {
          name: 'Instagram',
          configured: isPlatformConfigured('instagram')
        },
        youtube: {
          name: 'YouTube',
          configured: isPlatformConfigured('youtube')
        }
      };

      return reply.code(200).send({
        success: true,
        accounts: sanitizedAccounts,
        platforms: platformsConfig
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Erreur lors de la récupération des comptes sociaux'
      });
    }
  });

  // GET /api/social-accounts/:id - Récupération d'un compte spécifique
  fastify.get('/api/social-accounts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const db = getDatabase();
      const row = db.prepare(`
        SELECT id, platform, account_id, username, display_name,
               token_expires_at, status, created_at, updated_at
        FROM social_accounts
        WHERE id = ?
      `).get(id) as unknown as SocialAccountDbRow | undefined;

      if (!row) {
        return reply.code(404).send({
          error: 'NOT_FOUND',
          message: 'Compte social introuvable'
        });
      }

      return reply.code(200).send({
        success: true,
        account: sanitizeSocialAccount(row)
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Erreur lors de la récupération du compte social'
      });
    }
  });

  // DELETE /api/social-accounts/:id - Déconnexion et suppression d'un compte
  fastify.delete('/api/social-accounts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const db = getDatabase();
      const existing = db.prepare('SELECT id, platform, username FROM social_accounts WHERE id = ?').get(id) as any;
      if (!existing) {
        return reply.code(404).send({
          error: 'NOT_FOUND',
          message: 'Compte social introuvable'
        });
      }

      // Suppression du compte social
      // Les publications liées verront leur `social_account_id` passer à NULL grâce à ON DELETE SET NULL
      db.prepare('DELETE FROM social_accounts WHERE id = ?').run(id);

      return reply.code(200).send({
        success: true,
        message: `Compte ${existing.username} (${existing.platform}) déconnecté avec succès.`
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Erreur lors de la déconnexion du compte social'
      });
    }
  });

  // GET /api/social-accounts/:platform/connect - Initialise la connexion OAuth
  fastify.get('/api/social-accounts/:platform/connect', async (request, reply) => {
    const { platform } = request.params as { platform: string };
    const query = request.query as { redirect?: string };

    const validPlatforms: SupportedPlatform[] = ['tiktok', 'instagram', 'youtube'];
    if (!validPlatforms.includes(platform as SupportedPlatform)) {
      return reply.code(400).send({
        error: 'INVALID_PLATFORM',
        message: `Plateforme inconnue : ${platform}. Plateformes supportées : tiktok, instagram, youtube`
      });
    }

    const targetPlatform = platform as SupportedPlatform;

    if (!isPlatformConfigured(targetPlatform)) {
      return reply.code(400).send({
        error: 'MISSING_CONFIGURATION',
        message: `Configuration OAuth manquante pour ${targetPlatform}. Veuillez renseigner les clés dans .env.`
      });
    }

    try {
      // Génération d'un state CSRF sécurisé
      const state = createOAuthState(targetPlatform);
      const authUrl = generateAuthorizationUrl(targetPlatform, state);

      if (query.redirect === 'true' || query.redirect === '1') {
        return reply.redirect(authUrl);
      }

      return reply.code(200).send({
        success: true,
        platform: targetPlatform,
        authorizationUrl: authUrl,
        state
      });
    } catch (err: any) {
      fastify.log.error(err);
      return reply.code(500).send({
        error: 'OAUTH_INIT_FAILED',
        message: err.message || "Impossible d'initialiser le flux OAuth"
      });
    }
  });

  // GET /api/social-accounts/:platform/callback - Réception du retour d'autorisation OAuth
  fastify.get('/api/social-accounts/:platform/callback', async (request, reply) => {
    const { platform } = request.params as { platform: string };
    const { code, state, error, error_description } = request.query as {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
    };

    const validPlatforms: SupportedPlatform[] = ['tiktok', 'instagram', 'youtube'];
    if (!validPlatforms.includes(platform as SupportedPlatform)) {
      return reply.redirect(`${clientUrl}/?tab=accounts&error=invalid_platform`);
    }

    const targetPlatform = platform as SupportedPlatform;

    // Gestion d'une annulation ou d'une erreur transmise par le provider OAuth
    if (error) {
      fastify.log.warn(`[OAuth] Erreur retournée par ${targetPlatform}: ${error} - ${error_description}`);
      return reply.redirect(`${clientUrl}/?tab=accounts&error=${encodeURIComponent(error)}&platform=${targetPlatform}`);
    }

    // Validation stricte du state CSRF à usage unique
    if (!state || !verifyAndConsumeOAuthState(state, targetPlatform)) {
      fastify.log.warn(`[OAuth] State CSRF invalide ou expiré pour ${targetPlatform}`);
      return reply.redirect(`${clientUrl}/?tab=accounts&error=invalid_state&platform=${targetPlatform}`);
    }

    // Vérification de la présence du code d'autorisation
    if (!code) {
      return reply.redirect(`${clientUrl}/?tab=accounts&error=missing_code&platform=${targetPlatform}`);
    }

    try {
      // Échange du code contre les tokens officiels et récupération des métadonnées du profil
      const result = await exchangeCodeAndGetProfile(targetPlatform, code);

      // Chiffrement des tokens en AES-256-GCM avant toute insertion en base
      const accessTokenEncrypted = encryptData(result.accessToken);
      const refreshTokenEncrypted = result.refreshToken ? encryptData(result.refreshToken) : null;

      let tokenExpiresAt: string | null = null;
      if (result.expiresInSeconds && result.expiresInSeconds > 0) {
        tokenExpiresAt = new Date(Date.now() + result.expiresInSeconds * 1000).toISOString();
      }

      const db = getDatabase();

      // Vérification si le compte existe déjà (par unicité platform + account_id)
      const existingAccount = db.prepare(`
        SELECT id FROM social_accounts WHERE platform = ? AND account_id = ?
      `).get(result.platform, result.accountId) as { id: string } | undefined;

      if (existingAccount) {
        // Mise à jour du compte existant avec nouveaux tokens chiffrés et statut connected
        db.prepare(`
          UPDATE social_accounts
          SET username = ?,
              display_name = ?,
              access_token_encrypted = ?,
              refresh_token_encrypted = COALESCE(?, refresh_token_encrypted),
              token_expires_at = ?,
              status = 'connected',
              updated_at = datetime('now')
          WHERE id = ?
        `).run(
          result.username,
          result.displayName || null,
          accessTokenEncrypted,
          refreshTokenEncrypted,
          tokenExpiresAt,
          existingAccount.id
        );
      } else {
        // Insertion d'un nouveau compte
        const newId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO social_accounts (
            id, platform, account_id, username, display_name,
            access_token_encrypted, refresh_token_encrypted,
            token_expires_at, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'connected', datetime('now'), datetime('now'))
        `).run(
          newId,
          result.platform,
          result.accountId,
          result.username,
          result.displayName || null,
          accessTokenEncrypted,
          refreshTokenEncrypted,
          tokenExpiresAt
        );
      }

      // Redirection réussie vers l'interface PostBoy
      return reply.redirect(`${clientUrl}/?tab=accounts&status=success&platform=${targetPlatform}`);
    } catch (err: any) {
      fastify.log.error(err, `[OAuth] Erreur lors de l'échange de token pour ${targetPlatform}`);
      return reply.redirect(`${clientUrl}/?tab=accounts&error=token_exchange_failed&platform=${targetPlatform}`);
    }
  });
}
