// PostBoy - Définitions TypeScript du Domaine Métier

export interface Campaign {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface Video {
  id: string;
  filename: string;
  original_name: string;
  file_path: string;
  file_size: number;
  duration: number;
  mime_type: string;
  campaign_id?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export type SocialPlatform = 'tiktok' | 'instagram' | 'youtube' | 'facebook' | 'twitter' | 'linkedin';

export interface SocialAccount {
  id: string;
  platform: SocialPlatform;
  account_name: string;
  account_id?: string | null;
  status: 'active' | 'disconnected' | 'expired';
  token_expires_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type PublicationStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';

export interface Publication {
  id: string;
  video_id: string;
  campaign_id?: string | null;
  social_account_id?: string | null;
  platform: SocialPlatform;
  title: string;
  description?: string | null;
  tags?: string | null;
  status: PublicationStatus;
  scheduled_at?: string | null;
  published_at?: string | null;
  external_post_id?: string | null;
  post_url?: string | null;
  error_message?: string | null;
  retry_count: number;
  max_retries: number;
  created_at: string;
  updated_at: string;
}

export interface PublicationLog {
  id: string;
  publication_id: string;
  event: 'status_change' | 'publish_attempt' | 'publish_success' | 'publish_failed' | 'retry';
  message: string;
  details?: string | null;
  created_at: string;
}

export interface NotificationRecord {
  id: string;
  publication_id?: string | null;
  type: 'email';
  recipient: string;
  subject: string;
  body: string;
  status: 'pending' | 'sent' | 'failed';
  sent_at?: string | null;
  error?: string | null;
  created_at: string;
}

export interface AppSettings {
  timezone: string;
  auto_publish_enabled: string;
  email_notifications_enabled: string;
  smtp_host?: string;
  smtp_port?: string;
  smtp_user?: string;
  smtp_pass?: string;
  notification_email?: string;
}

export interface HealthStatus {
  status: 'ok' | 'error';
  service: string;
  version: string;
  timestamp: string;
  database: 'connected' | 'error' | 'disconnected';
  activeTimezone: string;
  tablesCount: number;
  tables: string[];
}
