type Sample = { match: { style?: string; occ?: string }; templates: string[] };

/**
 * Fallback local — folosit doar dacă API-ul de sugestii e indisponibil.
 * Mesaje mai vii, cu vocativ, imagini concrete, fără clișee gen
 * „să-ți dea Domnul tot ce-ți pofteste sufletul".
 */
const SAMPLES: Sample[] = [
  {
    match: { occ: 'zi' },
    templates: [
      '{name}, azi e ziua ta — sus paharele, aprinde tortul,\nsă cânte trompetele pentru tine pe stradă.\nSă trăiești cât munții, sănătos și iubit,\niar ce-ți pofteste inima să-ți cadă-n mână.',
      'La mulți ani, {name}! Soarele răsare doar pentru tine,\nmasa e plină, prietenii toți te-așteaptă.\nÎncă un an în care lumea ți s-a închinat —\nsă vină alți o sută, fix la fel.',
    ],
  },
  {
    match: { occ: 'nunta' },
    templates: [
      '{name}, azi ești regele zilei, inelele scapără pe deget,\nmireasa-i ca o regină, lăutarii sunt în formă.\nSă vă iubiți cum cântă manelele,\nși să nu vă lipsească nimic — nici copii, nici vin, nici prieteni.',
      'Dragii mei {name}, casă de piatră vă urez,\ndar nu casă de oameni săraci — palat să fie.\nIar dragostea voastră să curgă cum curge aurul,\nplină, sigură, fără sfârșit.',
    ],
  },
  {
    match: { occ: 'botez' },
    templates: [
      'Micuțule {name}, lumea-ți deschide brațele azi,\ncu nașii la spate și cu îngerul pe umăr.\nSă crești mare, deștept, cu inima curată,\niar viața să-ți fie dulce cum e cozonacul.',
      'Pentru micul {name}, intri în lume cu noroc,\ncu masa plină și cu lăutarii la sufrageria casei.\nSă fii sănătos, iubit, deștept ca tatăl tău,\nși gata de viață cum suntem noi toți alături.',
    ],
  },
  {
    match: { occ: 'cumatrie' },
    templates: [
      'Cumătre {name}, sus paharul, sus inima,\nfinii noștri să crească cu noroc și sănătate.\nSă bem până dimineața, să cântăm până ne răgușim,\nașa cum scrie la cartea cumătriei.',
    ],
  },
  {
    match: { occ: 'sef' },
    templates: [
      'Șefule {name}, ești omul care ne ține pe toți pe picioare,\nfără tine biroul ar fi mort, banii ar fi nicăieri.\nSă-ți dea anul ăsta bonus mare și clienți buni,\niar noi te urmăm oriunde — că ești șef cum scrie la carte.',
      '{name}, șeful nostru de fier — ce zici, ce facem?\nTu ne-ai învățat să rupem, nu să stăm.\nLa mulți ani și să vină cifrele de care visezi,\niar concurența să tremure când te vede.',
    ],
  },
  {
    match: { occ: 'dragoste' },
    templates: [
      '{name}, pentru tine bate inima asta,\npentru tine se face seara mai blândă.\nFie că-i greu, fie că-i frumos —\ntu ești locul meu, restul nu contează.',
      'Iubirea mea, {name}, ești sufletul casei,\nfără tine tăcerea ar fi prea mare.\nSă rămânem împreună până-n adâncul anilor,\ncu aceeași dragoste, cu aceleași glume.',
    ],
  },
  {
    match: { occ: 'roast' },
    templates: [
      'Bă {name}, ești cel mai prost prieten din lume —\nuiți să răspunzi la telefon, întârzii la beri, dispari pe stradă.\nDar te iubim, frate, n-avem ce-ți face,\nașa cum ești, fără tine n-am fi noi.',
      '{name}, ai chef numai când plătim noi,\nrâzi numai la glumele tale, mănânci ca pentru trei.\nȘi totuși, cu toate că ești o belea —\nești belea-a noastră și nu te dăm pe nimeni.',
    ],
  },
  {
    match: { occ: 'nas' },
    templates: [
      'Nașule {name}, ai mâna de aur și inima largă,\nfinii tăi sunt mereu sub paza ta.\nSă-ți dea sănătate, bani, copii fericiți,\niar noi să-ți ridicăm paharele până ne crapă buzele.',
    ],
  },
  {
    match: { occ: 'inmorm' },
    templates: [
      'Drum bun, {name}. Ne lași cu inima goală,\ndar cu amintirea ta caldă cum era cafeaua dimineața.\nTe-am iubit, te iubim, nu te uităm niciodată —\niar de acolo de sus, veghează-ne, ca-ntotdeauna.',
    ],
  },
  {
    match: { occ: 'motiv' },
    templates: [
      'Hai {name}, ridică-te, nu te lăsa,\nlumea n-are timp pentru cei care stau jos.\nTu poți, tu ai dat-o-n cap și înainte —\nși acum tot tu trebuie să rupi.',
      '{name}, ești dintre ăia care nu se opresc,\nchiar dacă lumea zice „gata, ajunge".\nMai sus de obstacole, mai sus de „nu se poate" —\nacolo-i locul tău și acolo te aștept.',
    ],
  },
];

const STYLE_HINTS: Record<string, string> = {
  clasic: ' (cu acordeon și voce caldă)',
  modern: ' (cu beat tare, trap-manea de club)',
  oriental: ' (cu darbukă și melisme orientale)',
  trompeta: ' (cu trompete, ca la fanfară)',
  romantica: ' (de jale, pentru inima frântă)',
  comerciala: ' (de club, comercială, de sezon)',
};

export function suggestMessage(
  styleId: string | undefined,
  occId: string | undefined,
  recipient: string,
): string {
  const candidates = SAMPLES.filter((s) => !s.match.occ || s.match.occ === occId);
  const pool = candidates.length
    ? candidates[Math.floor(Math.random() * candidates.length)].templates
    : [
        '{name}, manaua asta e scrisă pentru tine,\nsă-ți rămână-n cap, pe buze și-n suflet.\nEști dintre ăia pe care nu-i uiți o viață,\nși meriți o piesă care să-ți spună asta tare.',
      ];
  const tpl = pool[Math.floor(Math.random() * pool.length)];
  const name = (recipient || 'tine').trim();
  return tpl.replaceAll('{name}', name);
}
