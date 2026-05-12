import type {
  SiteOccasionEntry,
  SiteStyleEntry,
  SiteVoiceEntry,
} from './api/sites.api';

// Listă default folosită pe site-ul public când DB nu are categorii configurate
// (vezi apps/web/lib/seed-data.ts + apps/web/components/Generator.tsx fallback).
// E duplicată aici intenționat ca admin-ul să poată pre-completa tab-ul
// „Categorii & Mostre" cu același conținut, fără să scrie nimic în DB până când
// userul editează / salvează efectiv.

export const SEED_STYLES: SiteStyleEntry[] = [
  { id: 'clasic', em: '🎻', nm: 'Clasică de pahar', ds: 'Acordeon, lăutărească', heat: '🔥 #1' },
  { id: 'modern', em: '🎹', nm: 'Modernă', ds: 'Trap-manea, beat tare', heat: '🔥 hot' },
  { id: 'oriental', em: '🪘', nm: 'Orientală', ds: 'Darbuka, melisme' },
  { id: 'trompeta', em: '🎺', nm: 'Cu trompetă', ds: 'Banda de fanfare' },
  { id: 'romantica', em: '💔', nm: 'De jale', ds: 'Pentru inimi frânte' },
  { id: 'comerciala', em: '💃', nm: 'Comercială', ds: 'De club, de sezon' },
  { id: 'opulenta', em: '👑', nm: 'De opulență', ds: 'Banii curg, lux total', heat: '🔥 new' },
  { id: 'iubire', em: '❤️', nm: 'De iubire', ds: 'Romantic pur, dulce' },
  { id: 'tallava', em: '🎷', nm: 'Tallava', ds: 'Ritm balcanic, BG/MK' },
  { id: 'kuchek', em: '🥁', nm: 'Kuchek', ds: 'Ritm rom bulgăresc' },
  { id: 'trapanele', em: '🎧', nm: 'Trapanele', ds: 'Trap × manea, hard' },
  { id: 'pahar', em: '🍷', nm: 'De pahar', ds: 'Petrecere, voie bună' },
];

export const SEED_VOICES: SiteVoiceEntry[] = [
  { id: 'florinel', nm: 'Florinel de Aur', tg: 'Voce caldă, clasic', av: 'FA' },
  { id: 'adi', nm: 'Adi Șampanie', tg: 'Modern, club', av: 'AȘ' },
  { id: 'ticu', nm: 'Țicu Diamante', tg: 'Trap-manea, tânăr', av: 'ȚD' },
  { id: 'mariana', nm: 'Mariana Trandafir', tg: 'Voce feminină', av: 'MT' },
  { id: 'nicu', nm: 'Nicu Mercedes', tg: 'Orientală, plâns', av: 'NM' },
  { id: 'gigi', nm: 'Gigi Cash', tg: 'Comercial, voios', av: 'GC' },
];

export const SEED_OCCASIONS: SiteOccasionEntry[] = [
  { id: 'zi', em: '🎂', nm: 'Zi naștere' },
  { id: 'nunta', em: '💒', nm: 'Nuntă' },
  { id: 'botez', em: '👶', nm: 'Botez' },
  { id: 'cumatrie', em: '🍷', nm: 'Cumătrie' },
  { id: 'cuplu', em: '❤️', nm: 'Aniv. cuplu' },
  { id: 'sef', em: '💼', nm: 'Pentru șef' },
  { id: 'dragoste', em: '😍', nm: 'Declarație' },
  { id: 'roast', em: '🤡', nm: 'Roast prieten' },
  { id: 'nas', em: '🤝', nm: 'Naș / fin' },
  { id: 'inmorm', em: '🕯️', nm: 'Înmormântare' },
  { id: 'motiv', em: '💪', nm: 'Motivațională' },
  { id: 'altul', em: '✨', nm: 'Altă ocazie' },
];
