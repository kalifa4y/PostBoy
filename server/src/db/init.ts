import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabase } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

-- Table des paramètres globaux de l'application
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Table des campagnes
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#08EB08',
  mentions TEXT,
  hashtags TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Table des vidéos locales (métadonnées)
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  duration REAL DEFAULT 0,
  mime_type TEXT NOT NULL,
  thumbnail_path TEXT,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ready',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Table des publications (tâches de publication manuelle)
CREATE TABLE IF NOT EXISTS publications (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  title TEXT NOT NULL,
  caption TEXT,
  hashtags TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TEXT,
  published_at TEXT,
  post_url TEXT,
  external_url TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Table des notifications (email / rappels)
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  publication_id TEXT REFERENCES publications(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'email',
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index pour optimiser les recherches fréquentes
CREATE INDEX IF NOT EXISTS idx_videos_campaign ON videos(campaign_id);
CREATE INDEX IF NOT EXISTS idx_publications_video ON publications(video_id);
CREATE INDEX IF NOT EXISTS idx_publications_campaign ON publications(campaign_id);
CREATE INDEX IF NOT EXISTS idx_publications_status_scheduled ON publications(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_notifications_pub ON notifications(publication_id);
`.trim();

let isInitialized = false;

export async function initializeDatabase(): Promise<void> {
  const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
  if (isInitialized && !isTest) {
    return;
  }

  const db = getDatabase();
  let schemaSql = '';

  // 1. Chargement du schéma physique si présent, sinon fallback statique
  try {
    const schemaPath = path.resolve(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    }
  } catch {
    // Si l'accès au système de fichiers échoue dans un environnement serverless bundlé
  }

  if (!schemaSql) {
    schemaSql = DEFAULT_SCHEMA_SQL;
  }

  // Exécution du schéma (CREATE TABLE IF NOT EXISTS)
  await db.exec(schemaSql);

  // 2. Migration dynamique non-destructive pour la table campaigns
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

  // 3. Migration dynamique non-destructive pour la table videos
  const videoColumns = await db.all<{ name: string }>("PRAGMA table_info(videos)");
  const videoColNames = videoColumns.map(c => c.name);
  if (!videoColNames.includes('thumbnail_path')) {
    await db.exec("ALTER TABLE videos ADD COLUMN thumbnail_path TEXT;");
  }
  if (!videoColNames.includes('status')) {
    await db.exec("ALTER TABLE videos ADD COLUMN status TEXT NOT NULL DEFAULT 'ready';");
  }

  // 4. Migration dynamique non-destructive pour la table publications (Phase 3 : Workflow Manuel)
  const publicationColumns = await db.all<{ name: string }>("PRAGMA table_info(publications)");
  const pubColNames = publicationColumns.map(c => c.name);
  if (!pubColNames.includes('caption')) {
    await db.exec("ALTER TABLE publications ADD COLUMN caption TEXT;");
  }
  if (!pubColNames.includes('hashtags')) {
    await db.exec("ALTER TABLE publications ADD COLUMN hashtags TEXT;");
  }
  if (!pubColNames.includes('notes')) {
    await db.exec("ALTER TABLE publications ADD COLUMN notes TEXT;");
  }
  if (!pubColNames.includes('post_url')) {
    await db.exec("ALTER TABLE publications ADD COLUMN post_url TEXT;");
  }
  if (!pubColNames.includes('external_url')) {
    await db.exec("ALTER TABLE publications ADD COLUMN external_url TEXT;");
  }
  if (!pubColNames.includes('error_message')) {
    await db.exec("ALTER TABLE publications ADD COLUMN error_message TEXT;");
  }

  // Si l'ancienne colonne tags contenait des données et hashtags est vide, migrer automatiquement
  if (pubColNames.includes('tags')) {
    await db.exec("UPDATE publications SET hashtags = tags WHERE (hashtags IS NULL OR hashtags = '') AND tags IS NOT NULL;");
  }

  // 5. Suppression propre des tables d'automatisation sociale devenues obsolètes (Phase 3)
  await db.exec("DROP TABLE IF EXISTS publication_logs;");
  await db.exec("DROP TABLE IF EXISTS social_accounts;");

  // 6. Initialisation des paramètres par défaut s'ils n'existent pas encore
  const defaultSettings = [
    { key: 'timezone', value: process.env.DEFAULT_TIMEZONE || 'Africa/Bamako' },
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

  // 7. Récupération sécurisée des publications restées dans un statut temporaire obsolète
  await recoverInterruptedPublications();

  isInitialized = true;
  console.log('[Database] Schéma initialisé et paramètres par défaut vérifiés avec succès.');
}

/**
 * Récupère les publications restées en statut 'publishing' lors d'un arrêt impromptu du serveur.
 * Dans le workflow manuel, ces publications sont réinitialisées en 'draft' pour pouvoir être reprises.
 */
export async function recoverInterruptedPublications(): Promise<number> {
  const db = getDatabase();
  const interrupted = await db.all<{ id: string }>(`
    SELECT id FROM publications WHERE status = 'publishing'
  `);

  if (interrupted.length === 0) return 0;

  console.log(`[Database] Récupération de ${interrupted.length} publication(s) en cours : réinitialisation en 'draft'.`);

  for (const pub of interrupted) {
    await db.run(`
      UPDATE publications
      SET status = 'draft',
          updated_at = datetime('now')
      WHERE id = ?
    `, [pub.id]);
  }

  return interrupted.length;
}

// Exécution directe si appelé via `npm run db:init`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initializeDatabase().catch(console.error);
}
