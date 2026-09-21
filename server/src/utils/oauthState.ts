import crypto from 'node:crypto';

export interface OAuthStateData {
  platform: 'tiktok' | 'instagram' | 'youtube';
  createdAt: number;
  expiresAt: number;
  redirectUri?: string;
}

// TTL par défaut : 10 minutes (600 000 ms)
const DEFAULT_STATE_TTL_MS = 10 * 60 * 1000;

// Stockage éphémère en mémoire pour les states CSRF
const statesMap = new Map<string, OAuthStateData>();

/**
 * Nettoie les states expirés pour éviter les fuites de mémoire.
 */
export function cleanupExpiredOAuthStates(): void {
  const now = Date.now();
  for (const [state, data] of statesMap.entries()) {
    if (data.expiresAt < now) {
      statesMap.delete(state);
    }
  }
}

/**
 * Génère un state CSRF cryptographiquement fort (32 octets aléatoires)
 * lié à une plateforme spécifique et assorti d'une date d'expiration.
 */
export function createOAuthState(
  platform: 'tiktok' | 'instagram' | 'youtube',
  redirectUri?: string,
  ttlMs: number = DEFAULT_STATE_TTL_MS
): string {
  cleanupExpiredOAuthStates();

  const state = crypto.randomBytes(32).toString('hex');
  const now = Date.now();

  statesMap.set(state, {
    platform,
    createdAt: now,
    expiresAt: now + ttlMs,
    redirectUri
  });

  return state;
}

/**
 * Vérifie la validité d'un state CSRF pour une plateforme donnée.
 * - Le state doit exister
 * - Le state doit correspondre à la plateforme
 * - Le state ne doit pas être expiré
 * - RÈGLE STRICTE : Dès vérification, le state est consommé (supprimé) pour usage unique.
 */
export function verifyAndConsumeOAuthState(state: string, platform: string): boolean {
  cleanupExpiredOAuthStates();

  if (!state || typeof state !== 'string') {
    return false;
  }

  const data = statesMap.get(state);
  if (!data) {
    return false;
  }

  // Suppression immédiate : usage unique strict (one-time use)
  statesMap.delete(state);

  const now = Date.now();
  if (data.expiresAt < now) {
    return false;
  }

  if (data.platform !== platform) {
    return false;
  }

  return true;
}

/**
 * Pour les tests : vide l'ensemble des states enregistrés.
 */
export function clearAllOAuthStates(): void {
  statesMap.clear();
}
