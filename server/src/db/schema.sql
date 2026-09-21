-- PostBoy - Schéma SQLite Relationnel

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

-- Table des vidéos importées
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  duration REAL DEFAULT 0,
  mime_type TEXT NOT NULL,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Table des comptes sociaux connectés
CREATE TABLE IF NOT EXISTS social_accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  token_expires_at TEXT,
  encrypted_credentials TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Table des publications
CREATE TABLE IF NOT EXISTS publications (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  social_account_id TEXT REFERENCES social_accounts(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  tags TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TEXT,
  published_at TEXT,
  external_post_id TEXT,
  post_url TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Table des logs d'exécution des publications
CREATE TABLE IF NOT EXISTS publication_logs (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  message TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Table des notifications
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
CREATE INDEX IF NOT EXISTS idx_publication_logs_pub ON publication_logs(publication_id);
