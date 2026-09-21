import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabase } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function initializeDatabase(): void {
  const db = getDatabase();
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

  // Exécution du schéma
  db.exec(schemaSql);

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

  const checkStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const insertStmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');

  for (const setting of defaultSettings) {
    const existing = checkStmt.get(setting.key);
    if (!existing) {
      insertStmt.run(setting.key, setting.value);
    }
  }

  console.log('[Database] Schéma initialisé et paramètres par défaut vérifiés avec succès.');
}

// Exécution directe si appelé via `npm run db:init`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initializeDatabase();
}
