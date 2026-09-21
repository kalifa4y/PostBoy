export interface PublishContext {
  publicationId: string;
  platform: 'tiktok' | 'instagram' | 'youtube';
  title: string;
  caption?: string | null;
  tags?: string | null;
  externalUrl?: string | null;
  videoFilePath: string;
  videoMimeType: string;
  videoFileSize: number;
  accountId: string;
  accountUsername: string;
  accountDisplayName?: string | null;
  decryptedAccessToken: string;
  decryptedRefreshToken?: string;
  timeoutMs?: number;
}

export interface PublishResult {
  success: boolean;
  externalPostId?: string;
  postUrl?: string;
  errorMessage?: string;
}

export interface PlatformPublisher {
  publish(context: PublishContext): Promise<PublishResult>;
}
