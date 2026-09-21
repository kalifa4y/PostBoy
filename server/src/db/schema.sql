-- PostBoy - Schéma Relationnel LibSQL / SQLite (Phase 3 : Publication Manuelle)

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
