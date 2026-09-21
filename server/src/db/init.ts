import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabase } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function initializeDatabase(): Promise<void> {
  const db = getDatabase();
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

  // Exécution du schéma (CREATE TABLE IF NOT EXISTS)
  await db.exec(schemaSql);

  // 1. Migration dynamique non-destructive pour la table campaigns
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

  // 2. Migration dynamique non-destructive pour la table videos
  const videoColumns = await db.all<{ name: string }>("PRAGMA table_info(videos)");
  const videoColNames = videoColumns.map(c => c.name);
  if (!videoColNames.includes('thumbnail_path')) {
    await db.exec("ALTER TABLE videos ADD COLUMN thumbnail_path TEXT;");
  }
  if (!videoColNames.includes('status')) {
    await db.exec("ALTER TABLE videos ADD COLUMN status TEXT NOT NULL DEFAULT 'ready';");
  }

  // 3. Migration dynamique non-destructive pour la table publications (Phase 3 : Workflow Manuel)
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

  // 4. Suppression propre des tables d'automatisation sociale devenues obsolètes (Phase 3)
  await db.exec("DROP TABLE IF EXISTS publication_logs;");
  await db.exec("DROP TABLE IF EXISTS social_accounts;");

  // 5. Initialisation des paramètres par défaut s'ils n'existent pas encore
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

  // 6. Récupération sécurisée des publications restées dans un statut temporaire obsolète
  await recoverInterruptedPublications();

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
  await initializeDatabase();
}
