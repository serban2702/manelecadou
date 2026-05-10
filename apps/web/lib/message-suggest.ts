type Sample = { match: { style?: string; occ?: string }; templates: string[] };

const SAMPLES: Sample[] = [
  {
    match: { occ: 'zi' },
    templates: [
      'La mulți ani, {name}! Să ai parte de tot ce-ți dorești și să fii sănătos.',
      'Pentru {name}, cu drag, la mulți ani! Să-ți dea Domnul tot ce-ți pofteste sufletul.',
    ],
  },
  {
    match: { occ: 'nunta' },
    templates: [
      'La nuntă, dragi miri, vă dorim casă de piatră și viață lungă împreună.',
      'Pentru mirii noștri, {name}, să trăiți, să fiți fericiți, să aveți copii frumoși și sănătoși.',
    ],
  },
  {
    match: { occ: 'botez' },
    templates: [
      'Botez fericit lui {name}! Să crească mare, sănătos și deștept.',
      'La botezul lui {name}, fie ca Domnul să-l aibă în paza Lui.',
    ],
  },
  {
    match: { occ: 'cumatrie' },
    templates: ['Cumătre, sus paharul, să trăiască finii cu bucurie!'],
  },
  {
    match: { occ: 'sef' },
    templates: [
      'La mulți ani, șefule {name}! Să ne dea Domnul bonus de Crăciun și mărire de salariu.',
      'Pentru cel mai tare șef, {name} — să trăiești și să ne conduci spre succes!',
    ],
  },
  {
    match: { occ: 'dragoste' },
    templates: [
      'Pentru tine, {name}, inima mea bate doar pentru tine. Te iubesc.',
      '{name}, ești viața mea, ești sufletul meu. Vreau să fim împreună mereu.',
    ],
  },
  {
    match: { occ: 'roast' },
    templates: [
      'Bă {name}, ești cel mai prost prieten — dar te iubim, n-avem ce-ți face!',
      'Pentru {name} — un roast cu drag, că ești coleg de nădejde.',
    ],
  },
  {
    match: { occ: 'nas' },
    templates: ['Pentru cel mai tare naș/fin, {name} — să-ți dea Domnul sănătate și bani!'],
  },
  {
    match: { occ: 'inmorm' },
    templates: ['Drum bun, {name}. Te-am iubit și nu te vom uita niciodată.'],
  },
  {
    match: { occ: 'motiv' },
    templates: [
      '{name}, hai sus, frate! Tu ești tare, tu poți. Să nu te lași niciodată.',
      'Pentru {name} — manea de motivare. Astăzi e ziua ta să rupi tot.',
    ],
  },
];

const STYLE_HINTS: Record<string, string> = {
  clasic: ' Cu acordeon și voce caldă, ca la lăutari.',
  modern: ' Cu beat tare, trap-manea, pentru club.',
  oriental: ' Cu darbukă și melisme orientale.',
  trompeta: ' Cu trompete, ca la fanfară.',
  romantica: ' De jale, pentru inima frântă.',
  comerciala: ' De club, comercială, de sezon.',
};

export function suggestMessage(
  styleId: string | undefined,
  occId: string | undefined,
  recipient: string,
): string {
  const candidates = SAMPLES.filter((s) => !s.match.occ || s.match.occ === occId);
  const pool = candidates.length
    ? candidates[Math.floor(Math.random() * candidates.length)].templates
    : ['Pentru {name}, cu drag, o manea pe cinste!'];
  const tpl = pool[Math.floor(Math.random() * pool.length)];
  const name = (recipient || 'tine').trim();
  const base = tpl.replaceAll('{name}', name);
  return base + (styleId && STYLE_HINTS[styleId] ? STYLE_HINTS[styleId] : '');
}
