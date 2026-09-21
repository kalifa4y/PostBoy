import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getDatabase } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function initializeDatabase(): Promise<void> {
  const db = getDatabase();
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

  // Exécution du schéma
  await db.exec(schemaSql);

  // Migration dynamique non-destructive pour la table campaigns
  const campaignColumns = await db.all<{ name: string }>("PRAGMA table_info(campaigns)");
  const colNames = campaignColumns.map(c => c.name);
  if (!colNames.includes('mentions')) {
    await db.exec("ALTER TABLE campaigns ADD COLUMN mentions TEXT;");
  }
  if (!colNames.includes('hashtags')) {
    await db.exec("ALTER TABLE campaigns ADD COLUMN hashtags TEXT;");
  }
  if (!colNames.includes('status')) {
    await db.exec("ALTER TABLE campaigns ADD COLUMN status TEXT NOT NULL DEFAULT 'active';");
  }

  // Migration dynamique non-destructive pour la table videos
  const videoColumns = await db.all<{ name: string }>("PRAGMA table_info(videos)");
  const videoColNames = videoColumns.map(c => c.name);
  if (!videoColNames.includes('thumbnail_path')) {
    await db.exec("ALTER TABLE videos ADD COLUMN thumbnail_path TEXT;");
  }
  if (!videoColNames.includes('status')) {
    await db.exec("ALTER TABLE videos ADD COLUMN status TEXT NOT NULL DEFAULT 'ready';");
  }

  // Migration dynamique non-destructive pour la table publications
  const publicationColumns = await db.all<{ name: string }>("PRAGMA table_info(publications)");
  const pubColNames = publicationColumns.map(c => c.name);
  if (!pubColNames.includes('caption')) {
    await db.exec("ALTER TABLE publications ADD COLUMN caption TEXT;");
  }
  if (!pubColNames.includes('external_url')) {
    await db.exec("ALTER TABLE publications ADD COLUMN external_url TEXT;");
  }

  // Migration dynamique non-destructive pour la table social_accounts
  const socialAccountColumns = await db.all<{ name: string }>("PRAGMA table_info(social_accounts)");
  const saColNames = socialAccountColumns.map(c => c.name);

  // Si l'ancienne colonne account_name existe encore, on effectue la migration vers le schéma Phase 6
  if (saColNames.includes('account_name')) {
    await db.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE IF NOT EXISTS social_accounts_v6 (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        account_id TEXT NOT NULL,
        username TEXT NOT NULL,
        display_name TEXT,
        access_token_encrypted TEXT NOT NULL,
        refresh_token_encrypted TEXT,
        token_expires_at TEXT,
        status TEXT NOT NULL DEFAULT 'connected',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(platform, account_id)
      );

      INSERT OR IGNORE INTO social_accounts_v6 (
        id, platform, account_id, username, display_name,
        access_token_encrypted, token_expires_at, status, created_at, updated_at
      )
      SELECT
        id, platform, COALESCE(account_id, id), COALESCE(account_name, id), account_name,
        COALESCE(encrypted_credentials, ''), token_expires_at,
        CASE WHEN status = 'active' THEN 'connected' ELSE status END,
        created_at, updated_at
      FROM social_accounts;

      DROP TABLE social_accounts;
      ALTER TABLE social_accounts_v6 RENAME TO social_accounts;
      PRAGMA foreign_keys = ON;
    `);
  }

  await db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_social_accounts_platform_account ON social_accounts(platform, account_id);");

  // Initialisation des paramètres par défaut s'ils n'existent pas encore
  const defaultSettings = [
    { key: 'timezone', value: process.env.DEFAULT_TIMEZONE || 'Africa/Bamako' },
    { key: 'auto_publish_enabled', value: '1' },
    { key: 'email_notifications_enabled', value: '0' },
    { key: 'smtp_host', value: '' },
    { key: 'smtp_port', value: '587' },
    { key: 'smtp_user', value: '' },
    { key: 'smtp_pass', value: '' },
    { key: 'notification_email', value: '' }
  ];

  for (const setting of defaultSettings) {
    const existing = await db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [setting.key]);
    if (!existing) {
      await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [setting.key, setting.value]);
    }
  }

  // Récupération sécurisée des publications interrompues lors du dernier cycle
  await recoverInterruptedPublications();

  console.log('[Database] Schéma initialisé et paramètres par défaut vérifiés avec succès.');
}

/**
 * Récupère les publications restées en statut 'publishing' lors d'un arrêt impromptu du serveur.
 * Les bascule en 'failed' de manière sécurisée pour éviter les blocages permanents ou doubles publications.
 */
export async function recoverInterruptedPublications(): Promise<number> {
  const db = getDatabase();
  const interrupted = await db.all<{ id: string }>(`
    SELECT id FROM publications WHERE status = 'publishing'
  `);

  if (interrupted.length === 0) return 0;

  console.log(`[Database] Récupération de ${interrupted.length} publication(s) interrompue(s) lors du dernier arrêt du serveur.`);

  for (const pub of interrupted) {
    await db.run(`
      UPDATE publications
      SET status = 'failed',
          error_message = 'Interrompu lors du redémarrage du serveur (statut réinitialisé en failed pour sécurité)',
          updated_at = datetime('now')
      WHERE id = ?
    `, [pub.id]);

    await db.run(`
      INSERT INTO publication_logs (id, publication_id, event, message, details, created_at)
      VALUES (?, ?, 'server_restart_recovery', 'Publication interrompue par l arrêt du serveur réinitialisée en failed', NULL, datetime('now'))
    `, [crypto.randomUUID(), pub.id]);
  }

  return interrupted.length;
}

// Exécution directe si appelé via `npm run db:init`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await initializeDatabase();
}
