import type { SiteIconConfig } from './icon-registry';

export type StyleOption = {
  id: string;
  em: string;
  nm: string;
  ds: string;
  heat?: string;
  ic?: SiteIconConfig;
};

export const STYLES: StyleOption[] = [
  { id: 'clasic', em: '🎻', nm: 'Clasică de pahar', ds: 'Acordeon, lăutărească', heat: '🔥 #1', ic: { name: 'Music2', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 } },
  { id: 'modern', em: '🎹', nm: 'Modernă', ds: 'Trap-manea, beat tare', heat: '🔥 hot', ic: { name: 'Zap', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 } },
  { id: 'oriental', em: '🪘', nm: 'Orientală', ds: 'Darbuka, melisme', ic: { name: 'AudioWaveform', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 } },
  { id: 'trompeta', em: '🎺', nm: 'Cu trompetă', ds: 'Banda de fanfare', ic: { name: 'Music4', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 } },
  { id: 'romantica', em: '💔', nm: 'De jale', ds: 'Pentru inimi frânte', ic: { name: 'HeartCrack', fill: 'none', stroke: '#ef4444', strokeWidth: 2 } },
  { id: 'comerciala', em: '💃', nm: 'Comercială', ds: 'De club, de sezon', ic: { name: 'TrendingUp', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 } },
  { id: 'opulenta', em: '👑', nm: 'De opulență', ds: 'Banii curg, lux total', heat: '🔥 new', ic: { name: 'Crown', fill: '#f59e0b', stroke: '#d97706', strokeWidth: 1.5 } },
  { id: 'iubire', em: '❤️', nm: 'De iubire', ds: 'Romantic pur, dulce', ic: { name: 'Heart', fill: '#ef4444', stroke: '#dc2626', strokeWidth: 1.5 } },
  { id: 'tallava', em: '🎷', nm: 'Tallava', ds: 'Ritm balcanic, BG/MK', ic: { name: 'Flame', fill: 'none', stroke: '#f97316', strokeWidth: 2 } },
  { id: 'kuchek', em: '🥁', nm: 'Kuchek', ds: 'Ritm rom bulgăresc', ic: { name: 'Disc3', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 } },
  { id: 'trapanele', em: '🎧', nm: 'Trapanele', ds: 'Trap × manea, hard', ic: { name: 'Headphones', fill: 'none', stroke: '#8b5cf6', strokeWidth: 2 } },
  { id: 'pahar', em: '🍷', nm: 'De pahar', ds: 'Petrecere, voie bună', ic: { name: 'Wine', fill: 'none', stroke: '#ef4444', strokeWidth: 2 } },
];

export const OCC = [
  { id: 'zi', em: '🎂', nm: 'Zi naștere', ic: { name: 'Cake', fill: 'none', stroke: '#ec4899', strokeWidth: 2 } },
  { id: 'nunta', em: '💒', nm: 'Nuntă', ic: { name: 'Gem', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 } },
  { id: 'botez', em: '👶', nm: 'Botez', ic: { name: 'Baby', fill: 'none', stroke: '#3b82f6', strokeWidth: 2 } },
  { id: 'cumatrie', em: '🍷', nm: 'Cumătrie', ic: { name: 'Wine', fill: 'none', stroke: '#ef4444', strokeWidth: 2 } },
  { id: 'cuplu', em: '❤️', nm: 'Aniv. cuplu', ic: { name: 'Heart', fill: '#ef4444', stroke: '#dc2626', strokeWidth: 1.5 } },
  { id: 'sef', em: '💼', nm: 'Pentru șef', ic: { name: 'Briefcase', fill: 'none', stroke: '#6b7280', strokeWidth: 2 } },
  { id: 'dragoste', em: '😍', nm: 'Declarație', ic: { name: 'Sparkles', fill: 'none', stroke: '#ec4899', strokeWidth: 2 } },
  { id: 'roast', em: '🤡', nm: 'Roast prieten', ic: { name: 'Laugh', fill: 'none', stroke: '#f97316', strokeWidth: 2 } },
  { id: 'nas', em: '🤝', nm: 'Naș / fin', ic: { name: 'Handshake', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 } },
  { id: 'inmorm', em: '🕯️', nm: 'Înmormântare', ic: { name: 'Feather', fill: 'none', stroke: '#6b7280', strokeWidth: 2 } },
  { id: 'motiv', em: '💪', nm: 'Motivațională', ic: { name: 'Zap', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 } },
  { id: 'altul', em: '✨', nm: 'Altă ocazie', ic: { name: 'Star', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 } },
];

export const VOICES = [
  { id: 'florinel', nm: 'Florinel de Aur', tg: 'Voce caldă, clasic', av: 'FA', ic: { name: 'Mic', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 } },
  { id: 'adi', nm: 'Adi Șampanie', tg: 'Modern, club', av: 'AȘ', ic: { name: 'MicVocal', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 } },
  { id: 'ticu', nm: 'Țicu Diamante', tg: 'Trap-manea, tânăr', av: 'ȚD', ic: { name: 'Headphones', fill: 'none', stroke: '#8b5cf6', strokeWidth: 2 } },
  { id: 'mariana', nm: 'Mariana Trandafir', tg: 'Voce feminină', av: 'MT', ic: { name: 'Flower2', fill: '#ec4899', stroke: '#db2777', strokeWidth: 1.5 } },
  { id: 'nicu', nm: 'Nicu Mercedes', tg: 'Orientală, plâns', av: 'NM', ic: { name: 'HeartCrack', fill: 'none', stroke: '#ef4444', strokeWidth: 2 } },
  { id: 'gigi', nm: 'Gigi Cash', tg: 'Comercial, voios', av: 'GC', ic: { name: 'Sparkles', fill: 'none', stroke: '#f59e0b', strokeWidth: 2 } },
];

export const DEMOS = [
  { id: 'd1', ttl: 'La mulți ani, Mariane', by: 'Florinel de Aur', heat: '🔥 124' },
  { id: 'd2', ttl: 'Pentru șeful meu', by: 'Adi Șampanie', heat: '🔥 89' },
  { id: 'd3', ttl: 'Fina mea cea dulce', by: 'Mariana Trandafir', heat: '🔥 76' },
  { id: 'd4', ttl: 'Bă Florine, hai!', by: 'Țicu Diamante', heat: '🔥 64' },
  { id: 'd5', ttl: 'Cumătre, sus paharul', by: 'Nicu Mercedes', heat: '🔥 58' },
  { id: 'd6', ttl: 'Iubire de pahar', by: 'Gigi Cash', heat: '🔥 41' },
];

export const TOP = [
  { rk: 1, ttl: 'Manea pentru Costel șeful', by: 'Adi Șampanie', pl: '12.4K' },
  { rk: 2, ttl: 'La mulți ani, soacră!', by: 'Florinel de Aur', pl: '8.9K' },
  { rk: 3, ttl: 'Bă fine, ești tare', by: 'Țicu Diamante', pl: '7.1K' },
  { rk: 4, ttl: 'Pentru Geta de la birou', by: 'Mariana Trandafir', pl: '5.6K' },
  { rk: 5, ttl: 'Cumătrie la Gigi', by: 'Nicu Mercedes', pl: '4.3K' },
];

export const FEED = [
  { em: '🎉', av: 'AM', tx: '<b>Andrei M.</b> tocmai a făcut o manea pentru <b>Mihaela</b>', when: 'acum câteva secunde' },
  { em: '🔥', av: 'GP', tx: '<b>Gabi P.</b> a comandat o manea de nuntă', when: 'acum 12 sec' },
  { em: '💃', av: 'MS', tx: '<b>Maria S.</b> i-a făcut surpriză șefului', when: 'acum 28 sec' },
  { em: '🎂', av: 'IC', tx: '<b>Ionuț C.</b> a făcut manea pentru ziua mamei', when: 'acum 41 sec' },
  { em: '😂', av: 'CV', tx: '<b>Cristi V.</b> i-a făcut roast colegului', when: 'acum 1 min' },
  { em: '❤️', av: 'EL', tx: '<b>Elena L.</b> a comandat o declarație de dragoste', when: 'acum 2 min' },
  { em: '🍷', av: 'DR', tx: '<b>Dan R.</b> a făcut o manea de cumătrie', when: 'acum 3 min' },
  { em: '👶', av: 'AT', tx: '<b>Alina T.</b> a comandat manea de botez', when: 'acum 4 min' },
];

export const TESTI = [
  { stars: 5, q: '"Frate, șeful a plâns. Mărire de salariu garantată."', nm: 'Costel B.', rl: 'Buzău', av: 'CB' },
  { stars: 5, q: '"I-am pus-o socrului la nuntă. Acum mă iubește."', nm: 'Andreea M.', rl: 'Pitești', av: 'AM' },
  { stars: 5, q: '"Naș de top. Finu\' a leșinat de bucurie. 10/10."', nm: 'Vasile P.', rl: 'Cluj', av: 'VP' },
  { stars: 5, q: '"Soțul meu nu mai vorbește decât în versuri de manea."', nm: 'Geta D.', rl: 'București', av: 'GD' },
  { stars: 5, q: '"Am dat-o pe TikTok. 200K vizualizări în 2 zile."', nm: 'Robert T.', rl: 'Iași', av: 'RT' },
];
