export type CadouReactionPlatform = 'tiktok' | 'instagram';

export interface CadouReactionClip {
  id: string;
  platform: CadouReactionPlatform;
  videoUrl: string;
  posterUrl?: string;
  audioUrl?: string;
  demoId?: string | null;
  username: string;
  caption: string;
  song: string;
  likes?: number;
  comments?: number;
  shares?: number;
  avatarUrl?: string;
  previewStartSec?: number;
}

/** 8 reacții default — povești + demo-uri reale din producție. Adminul le poate înlocui. */
export const CADOU_REACTIONS: CadouReactionClip[] = [
  {
    id: 'iubire',
    platform: 'tiktok',
    videoUrl: '/cadou/reactions/iubire.mp4',
    posterUrl: '/cadou/reactions/stills/iubire.jpg',
    demoId: '085fde14-0f3d-4600-af93-63395c76151f',
    audioUrl: '/uploads/site-samples/default/style-iubire.mp3',
    previewStartSec: 23,
    username: 'andreea.m',
    caption: 'Mihai mi-a pus-o pe boxă. Am început să plâng din prima. Te iubesc 😭❤️ #manelecadou #deiubire',
    song: 'De iubire · Pentru Andreea',
    likes: 184_200,
    comments: 1420,
    shares: 8600,
  },
  {
    id: 'pahar',
    platform: 'instagram',
    videoUrl: '/cadou/reactions/pahar.mp4',
    posterUrl: '/cadou/reactions/stills/pahar.jpg',
    demoId: '49f36c9a-3e21-44ab-a4e2-042fc98b95b0',
    audioUrl: '/uploads/site-samples/default/style-clasic.mp3',
    previewStartSec: 24,
    username: 'costel.la.masa',
    caption: 'Fratele meu Marian mi-a făcut surpriza la zi. N-am mai putut. La mulți ani mie 🥂',
    song: 'Clasică de pahar · Pentru Costel',
    likes: 96_400,
    comments: 812,
    shares: 4100,
  },
  {
    id: 'jale',
    platform: 'tiktok',
    videoUrl: '/cadou/reactions/jale.mp4',
    posterUrl: '/cadou/reactions/stills/jale.jpg',
    demoId: '460feec8-659c-4f05-9db9-7b59065fc8af',
    audioUrl: '/uploads/site-samples/default/style-romantica.mp3',
    previewStartSec: 98,
    username: 'noapte.pe.centura',
    caption: 'Am ascultat-o în mașină și a trebuit să opresc. Elena… cineva nu te-a uitat.',
    song: 'De jale · Pentru Elena',
    likes: 241_000,
    comments: 3104,
    shares: 19_200,
  },
  {
    id: 'oriental',
    platform: 'instagram',
    videoUrl: '/cadou/reactions/oriental.mp4',
    posterUrl: '/cadou/reactions/stills/oriental.jpg',
    demoId: 'fcfde1a8-6b11-4fbc-9de1-b62538ea42d3',
    audioUrl: '/uploads/site-samples/default/style-oriental.mp3',
    previewStartSec: 12,
    username: 'roxana.acasă',
    caption: 'Daniel mi-a pus-o în bucătărie, lângă oala cu ciorbă. Am plâns de fericire.',
    song: 'Orientală · Pentru Roxana',
    likes: 72_800,
    comments: 640,
    shares: 2100,
  },
  {
    id: 'opulenta',
    platform: 'tiktok',
    videoUrl: '/cadou/reactions/opulenta.mp4',
    posterUrl: '/cadou/reactions/stills/opulenta.jpg',
    demoId: 'e9d24b30-c0b7-4937-8da6-3a6bf1c4b7b1',
    audioUrl: '/uploads/site-samples/default/style-opulenta.mp3',
    previewStartSec: 37,
    username: 'bogdan.leu',
    caption: 'Mi-au pus-o la masă. A rămas fără cuvinte. Așa se face o manea 👑 #deopulenta',
    song: 'De opulență · Pentru Bogdan Leu',
    likes: 312_000,
    comments: 5400,
    shares: 28_100,
  },
  {
    id: 'birt',
    platform: 'instagram',
    videoUrl: '/cadou/reactions/birt.mp4',
    posterUrl: '/cadou/reactions/stills/birt.jpg',
    demoId: '243dc758-a641-4898-93ef-d3dd008f109f',
    audioUrl: '/uploads/site-samples/default/style-pahar.mp3',
    previewStartSec: 7,
    username: 'baietii.dela.birt',
    caption: 'I-am pus-o lu’ Sorin la tejghea. S-a spart masa. 😂🍺',
    song: 'De pahar · Pentru Sorin',
    likes: 54_200,
    comments: 488,
    shares: 1900,
  },
  {
    id: 'modern',
    platform: 'tiktok',
    videoUrl: '/cadou/reactions/modern.mp4',
    posterUrl: '/cadou/reactions/stills/modern.jpg',
    demoId: '8b9132fe-015b-462f-9470-2331608a7bc4',
    audioUrl: '/uploads/site-samples/default/style-modern.mp3',
    previewStartSec: 24,
    username: 'gasca.lui.alex',
    caption: 'Surpriza lu’ Alex. Mașina, manea, tot. La mulți ani frate 🔥',
    song: 'Modernă · Pentru Alex',
    likes: 128_600,
    comments: 980,
    shares: 6400,
  },
  {
    id: 'nunta',
    platform: 'instagram',
    videoUrl: '/cadou/reactions/nunta.mp4',
    posterUrl: '/cadou/reactions/stills/nunta.jpg',
    demoId: 'bbcb3594-94bf-4cb8-ad65-9f6692c3093d',
    audioUrl: '/uploads/site-samples/default/style-trompeta.mp3',
    previewStartSec: 0,
    username: 'finii.lui.nelu',
    caption: 'I-am cântat lu’ Nelu la nuntă. Nașu’ a plâns. Asta e cadoul care nu se uită.',
    song: 'Cu trompetă · Pentru Nelu',
    likes: 88_900,
    comments: 720,
    shares: 3500,
  },
];
