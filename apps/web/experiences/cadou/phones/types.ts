export type PhoneClip = {
  id: string;
  platform: 'tiktok' | 'instagram';
  videoUrl: string;
  posterUrl?: string;
  avatarUrl?: string;
  username: string;
  caption: string;
  song: string;
  likes?: number;
  comments?: number;
  shares?: number;
  bookmarks?: number;
  verified?: boolean;
};
