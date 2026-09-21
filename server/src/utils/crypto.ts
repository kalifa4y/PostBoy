import crypto from 'node:crypto';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 12 bytes recommandé pour GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Obtient la clé secrète de 32 octets à partir de APP_SECRET.
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('[Security] APP_SECRET doit être défini dans .env et comporter au moins 16 caractères.');
  }
  // Dérivation d'une clé 32 octets consistante via SHA-256
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Chiffre une chaîne sensible (token, secret, credentials).
 * Retourne une chaîne formatée: "iv:authTag:ciphertext" en hexadécimal.
 */
export function encryptData(plainText: string): string {
  if (!plainText) return '';
  
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Déchiffre une chaîne chiffrée avec encryptData.
 */
export function decryptData(encryptedString: string): string {
  if (!encryptedString) return '';
  
  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    throw new Error('[Security] Format de chaîne chiffrée invalide.');
  }
  
  const [ivHex, authTagHex, cipherTextHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(cipherTextHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
