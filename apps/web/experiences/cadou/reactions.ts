export type CadouReactionPlatform = 'tiktok' | 'instagram';

export interface CadouReactionClip {
  id: string;
  platform: CadouReactionPlatform;
  videoUrl: string;
  posterUrl?: string;
  audioUrl?: string;
  demoId?: string | null;
  /** Stilul piesei — sursa de adevăr pentru audio pe orice tenant (vezi seed-ul). */
  styleId?: string;
  username: string;
  caption: string;
  song: string;
  likes?: number;
  comments?: number;
  shares?: number;
  avatarUrl?: string;
  previewStartSec?: number;
}

/**
 * Seed-ul unei reacții default: doar structura (video + numere).
 * `username` / `caption` / `song` vin din `cadou.reactions.clips.<id>`, iar
 * audio-ul se rezolvă la runtime din demo-urile / mostrele site-ului curent
 * (vezi `useCadouReactionClips`) — fără ID-uri de producție hardcodate.
 */
export interface CadouReactionSeed {
  id: string;
  platform: CadouReactionPlatform;
  videoUrl: string;
  posterUrl?: string;
  /** Stilul cu care căutăm demo-ul / mostra tenantului curent. */
  styleId: string;
  likes?: number;
  comments?: number;
  shares?: number;
  previewStartSec?: number;
}

/** 8 reacții default. Adminul le poate înlocui prin `catalog.reactionClips`. */
export const CADOU_REACTION_SEEDS: CadouReactionSeed[] = [
  {
    id: 'iubire',
    platform: 'tiktok',
    videoUrl: '/cadou/reactions/iubire.mp4',
    posterUrl: '/cadou/reactions/stills/iubire.jpg',
    styleId: 'iubire',
    previewStartSec: 23,
    likes: 184_200,
    comments: 1420,
    shares: 8600,
  },
  {
    id: 'pahar',
    platform: 'instagram',
    videoUrl: '/cadou/reactions/pahar.mp4',
    posterUrl: '/cadou/reactions/stills/pahar.jpg',
    styleId: 'clasic',
    previewStartSec: 24,
    likes: 96_400,
    comments: 812,
    shares: 4100,
  },
  {
    id: 'jale',
    platform: 'tiktok',
    videoUrl: '/cadou/reactions/jale.mp4',
    posterUrl: '/cadou/reactions/stills/jale.jpg',
    styleId: 'romantica',
    previewStartSec: 98,
    likes: 241_000,
    comments: 3104,
    shares: 19_200,
  },
  {
    id: 'oriental',
    platform: 'instagram',
    videoUrl: '/cadou/reactions/oriental.mp4',
    posterUrl: '/cadou/reactions/stills/oriental.jpg',
    styleId: 'oriental',
    previewStartSec: 12,
    likes: 72_800,
    comments: 640,
    shares: 2100,
  },
  {
    id: 'opulenta',
    platform: 'tiktok',
    videoUrl: '/cadou/reactions/opulenta.mp4',
    posterUrl: '/cadou/reactions/stills/opulenta.jpg',
    styleId: 'opulenta',
    previewStartSec: 37,
    likes: 312_000,
    comments: 5400,
    shares: 28_100,
  },
  {
    id: 'birt',
    platform: 'instagram',
    videoUrl: '/cadou/reactions/birt.mp4',
    posterUrl: '/cadou/reactions/stills/birt.jpg',
    styleId: 'pahar',
    previewStartSec: 7,
    likes: 54_200,
    comments: 488,
    shares: 1900,
  },
  {
    id: 'modern',
    platform: 'tiktok',
    videoUrl: '/cadou/reactions/modern.mp4',
    posterUrl: '/cadou/reactions/stills/modern.jpg',
    styleId: 'modern',
    previewStartSec: 24,
    likes: 128_600,
    comments: 980,
    shares: 6400,
  },
  {
    id: 'nunta',
    platform: 'instagram',
    videoUrl: '/cadou/reactions/nunta.mp4',
    posterUrl: '/cadou/reactions/stills/nunta.jpg',
    styleId: 'trompeta',
    previewStartSec: 0,
    likes: 88_900,
    comments: 720,
    shares: 3500,
  },
];
