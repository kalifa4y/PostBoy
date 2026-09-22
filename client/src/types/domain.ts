// PostBoy - Définitions TypeScript du Domaine Métier

export interface Campaign {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  mentions?: string | null;
  hashtags?: string | null;
  status: 'active' | 'inactive';
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
  thumbnail_path?: string | null;
  campaign_id?: string | null;
  campaign_name?: string | null;
  campaign_color?: string | null;
  notes?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export type SocialPlatform = 'tiktok' | 'instagram' | 'youtube' | 'facebook' | 'twitter' | 'linkedin';

export type PublicationStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled';

export interface Publication {
  id: string;
  video_id: string;
  campaign_id?: string | null;
  platform: SocialPlatform;
  title: string;
  caption?: string | null;
  description?: string | null;
  hashtags?: string | null;
  tags?: string | null;
  notes?: string | null;
  status: PublicationStatus;
  scheduled_at?: string | null;
  published_at?: string | null;
  is_overdue?: boolean;
  copy_text?: string;
  external_post_id?: string | null;
  post_url?: string | null;
  external_url?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
  campaign_name?: string | null;
  campaign_color?: string | null;
  video_original_name?: string | null;
  video_filename?: string | null;
  video_file_path?: string | null;
  video_file_size?: number | null;
  video_duration?: number | null;
  video_thumbnail_path?: string | null;
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
  email_notifications_enabled: string;
  smtp_host?: string;
  smtp_port?: string;
  smtp_user?: string;
  smtp_pass?: string;
  notification_email?: string;
}

export interface DailyClippingGoal {
  date: string;
  targetPosts: number;
  targetCampaigns: number;
  scheduledToday: number;
  publishedToday: number;
  distinctCampaignsToday: number;
  remainingPosts: number;
  remainingCampaigns: number;
  isGoalMet: boolean;
  streak: number;
  bestStreak: number;
}

export interface ClippingHistoryInterval {
  dateKey: string;
  label: string;
  publishedCount: number;
  scheduledCount: number;
  distinctCampaignsCount: number;
  isGoalMet: boolean;
  targetPosts: number;
  targetCampaigns: number;
}

export interface ClippingHistorySummary {
  period: 'day' | 'week' | 'month' | 'year';
  referenceDate: string;
  totalPublished: number;
  totalScheduled: number;
  distinctCampaigns: number;
  goalsMetDays: number;
  goalsMissedDays: number;
  currentStreak: number;
  bestStreak: number;
}

export interface ClippingHistoryResponse {
  status: 'success';
  summary: ClippingHistorySummary;
  intervals: ClippingHistoryInterval[];
}

export interface DashboardStats {
  videosToPublish: number;
  scheduledCount: number;
  publishedCount: number;
  failedCount: number;
  totalVideos: number;
}

export interface UpcomingPublicationItem {
  id: string;
  platform: SocialPlatform | string;
  title: string;
  scheduled_at: string | null;
  status: string;
  campaign_name: string | null;
  campaign_color: string | null;
  video_name: string | null;
}

export interface RecentPublicationItem {
  id: string;
  platform: SocialPlatform | string;
  title: string;
  published_at: string | null;
  status: string;
  post_url: string | null;
  error_message: string | null;
  campaign_name: string | null;
  campaign_color: string | null;
  video_name: string | null;
}

export interface DashboardData {
  status: 'success' | 'error';
  stats: DashboardStats;
  dailyGoal?: DailyClippingGoal;
  upcomingPublications: UpcomingPublicationItem[];
  recentPublications: RecentPublicationItem[];
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
