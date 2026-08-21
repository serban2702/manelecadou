export type CadouStory = { em: string; label: string; msg: string; occ?: string };

const IUBIRE: CadouStory[] = [
  { em: '❤️', label: 'Pentru iubitul meu', occ: 'dragoste', msg: 'Ești totul pentru mine. Îți mulțumesc pentru toate sacrificiile făcute pentru familia noastră. Am trecut împreună prin greutățile vieții, dar nimeni și nimic nu a învins iubirea noastră.' },
  { em: '💕', label: 'Pentru iubita mea', occ: 'dragoste', msg: 'Ești lumina mea. Ți-am construit o casă și o viață, și te iubesc mai mult ca ieri, mai puțin ca mâine. Nu te schimb pe nimeni.' },
  { em: '💍', label: 'Pentru soțul meu', occ: 'cuplu', msg: 'Ești cel mai bun soț și cel mai bun tată. Am ales să stau lângă tine la bine și la greu, ani de zile, și tot ce am, am cu tine.' },
  { em: '👰', label: 'Pentru soția mea', occ: 'cuplu', msg: 'Tu ții casa și copiii. Ești viața mea. Tot ce am făcut, am făcut pentru noi — te iubesc și îți mulțumesc.' },
  { em: '🎂', label: 'La mulți ani, iubirea mea', occ: 'zi', msg: 'La mulți ani! Ești cel mai prețios lucru din viața mea. Mulțumesc pentru iubirea de care dai dovadă în fiecare zi și pentru toate sacrificiile pe care le faci pentru mine.' },
  { em: '👶', label: 'Pentru copilul meu', occ: 'zi', msg: 'Te iubesc din tot sufletul și sunt mândru de tine. Ești minunea mea. Să știi că sunt lângă tine, oricând, oriunde.' },
];

const JALE: CadouStory[] = [
  { em: '🕯️', label: 'Pentru cineva plecat', occ: 'altul', msg: 'Nu te-am uitat. Te plângem și acum, copiii și nepoții. Îmi e dor de tine în fiecare zi și te țin aproape în inimă.' },
  { em: '💔', label: 'Dor de tata', occ: 'altul', msg: 'Tată, ne-ai lăsat cu mare dor. Ai fost cel mai bun om pentru noi și pentru nepoți. Te plâng și te iubesc, oriunde ești.' },
  { em: '🌙', label: 'Dor de mama', occ: 'altul', msg: 'Mamă, îmi e dor de tine. De mâncarea ta, de vorba ta, de liniștea din casă. Te plâng și te iubesc.' },
  { em: '😢', label: 'Inimă frântă', occ: 'dragoste', msg: 'M-ai durut când ai plecat. N-am apucat să-ți spun tot ce aveam pe suflet. Te iubesc și acum, deși nu mai ești lângă mine.' },
  { em: '✈️', label: 'Departe de casă', occ: 'altul', msg: 'Sunt departe, în străinătate, și-mi e dor de voi. Trag pentru familia noastră și mă întorc. Așteptați-mă acasă.' },
  { em: '🤍', label: 'Nu te-am uitat', occ: 'dragoste', msg: 'Nu te-am uitat. Îmi e dor de tine în fiecare noapte. Inima mea tot la tine se întoarce.' },
];

const PAHAR: CadouStory[] = [
  { em: '🎂', label: 'La mulți ani, frate', occ: 'zi', msg: 'La mulți ani, frate. Să te ții pe picioare, să stăm la masă până-n zori, cu paharul sus și cu vorba bună. Te iubesc, frate.' },
  { em: '🥂', label: 'Pentru un prieten', occ: 'zi', msg: 'Ești cel mai bun prieten. Pe tine mă bazez. La mulți ani — să râdem și să ridicăm paharul împreună, ca întotdeauna.' },
  { em: '👨', label: 'Pentru tata', occ: 'zi', msg: 'La mulți ani, tăicuțu. De la copii și de la gineri: sănătate, liniște și o masă ca pe vremuri. Fără tine nu am fi noi.' },
  { em: '👰', label: 'Pentru soție, la zi', occ: 'zi', msg: 'Azi e despre tine. La mulți ani, sănătate și fericire. Ne-ai fost alături, soțul tău și copiii îți mulțumesc din suflet.' },
  { em: '🤝', label: 'Pentru naș / fin', occ: 'nas', msg: 'Să trăiești. Să ne întâlnim la mese și să nu uităm de unde am pornit. Ești de-al nostru, naș / fine, și te respectăm.' },
  { em: '🏡', label: 'Pentru familie', occ: 'altul', msg: 'Să fim sănătoși, să ne strângem la masă și să uităm de griji. Vă iubesc pe toți — casa e plină când sunteți voi.' },
];

const OPULENTA: CadouStory[] = [
  { em: '💼', label: 'Pentru șeful meu', occ: 'sef', msg: 'Te respect. Ai vorba grea și fără tine nu s-ar mișca nimic. Îți mulțumesc că m-ai ținut aproape și că ești omul de la masă.' },
  { em: '🤝', label: 'Pentru naș / fin', occ: 'nas', msg: 'Să ai noroc și bani curați. Nu uita cine ți-a stat alături. Ești finul / nașul nostru și te ținem la inimă.' },
  { em: '👊', label: 'Pentru fratele meu', occ: 'zi', msg: 'Ești cel mai bun frate din lume. Ai fost lângă mine la bune și la rele. Te iubesc, frate, și meriți tot ce e mai bun.' },
  { em: '👑', label: 'La mulți ani, șefu\'', occ: 'zi', msg: 'La mulți ani, șefu\'. Ești omul de la masă, cel mai șmecher din cercul nostru. Să-ți meargă totul din plin.' },
  { em: '💰', label: 'Pentru cine a reușit', occ: 'altul', msg: 'Ai pornit de jos și acum stai la masă cu banii pe față. Meriți tot ce ai. Sunt mândru de tine.' },
  { em: '👨', label: 'Pentru tata, omul casei', occ: 'zi', msg: 'Tată, ai muncit de dimineață până noaptea ca noi să nu simțim greul. Te iubim infinit. Ești omul casei noastre.' },
];

const TROMPETA: CadouStory[] = [
  { em: '💒', label: 'La nuntă', occ: 'nunta', msg: 'Azi e nunta voastră. Vă doresc ani mulți împreună, copii și nepoți. Ridicați-vă, că masa e a voastră.' },
  { em: '🥂', label: 'Pentru un prieten', occ: 'zi', msg: 'La mulți ani, prietene. De când te-am cunoscut, ești omul pe care ne putem baza. Îți spun din suflet, cu drag.' },
  { em: '💍', label: 'Ani de căsătorie', occ: 'cuplu', msg: 'Am trecut împreună prin bune și prin rele. Rămân lângă tine până la adânci bătrâneți — iubiți de copii și de nepoți.' },
  { em: '🎂', label: 'Pentru băiatul nostru', occ: 'zi', msg: 'La mulți ani, băiatul nostru. Urmează-ți visurile cu curaj. Ești minunea casei și mândria noastră.' },
  { em: '🤝', label: 'Pentru naș', occ: 'nunta', msg: 'Ești omul de onoare. Nunta e mai nuntă cu tine la masă. Te respectăm și-ți mulțumim că ești al nostru.' },
  { em: '🎺', label: 'Pentru familia la masă', occ: 'altul', msg: 'Azi suntem toți adunați. Să răsune sala, să fie voie bună și sănătate. Vă iubesc — masa e a noastră.' },
];

const ORIENTAL: CadouStory[] = [
  { em: '👰', label: 'Pentru soția mea', occ: 'cuplu', msg: 'Ești regina casei. Cu tine pe masă e pace. Te iubesc, ești tot ce am, la bine și la rău.' },
  { em: '💍', label: 'Pentru soțul meu', occ: 'cuplu', msg: 'Ești soțul meu minunat, taticul copiilor. Te iubesc infinit. Ești toată viața noastră.' },
  { em: '🎂', label: 'La mulți ani în familie', occ: 'zi', msg: 'La mulți ani, sănătate și fericire. Să retrăim clipele frumoase împreună — tu, eu, copiii, toată casa.' },
  { em: '💕', label: 'Iubire de departe', occ: 'dragoste', msg: 'Iubirea mea, îmi e dor de tine. Îi mulțumesc lui Dumnezeu că suntem împreună. Te iubesc enorm, oriunde am fi.' },
  { em: '👶', label: 'Pentru copilul meu', occ: 'zi', msg: 'La mulți ani. Parcă ieri te purtam în brațe. Mami și tati sunt mândri de tine — crești frumos și sănătos.' },
  { em: '🌍', label: 'Pentru cine e în străinătate', occ: 'altul', msg: 'Ești departe, dar inima e acasă. Să-ți meargă mașina, casa și familia. Te așteptăm cu masa pusă.' },
];

const BY_ID: Record<string, CadouStory[]> = {
  iubire: IUBIRE,
  romantica: JALE,
  clasic: PAHAR,
  pahar: PAHAR,
  opulenta: OPULENTA,
  trompeta: TROMPETA,
  oriental: ORIENTAL,
};

export function storiesForStyle(styleId: string): CadouStory[] {
  return BY_ID[styleId] ?? IUBIRE;
}

/** Povestea preselectată — cea mai cerută pe stil, din comenzile reale. */
const DEFAULT_LABEL: Record<string, string> = {
  iubire: 'La mulți ani, iubirea mea',
  romantica: 'Pentru cineva plecat',
  clasic: 'La mulți ani, frate',
  pahar: 'La mulți ani, frate',
  opulenta: 'Pentru fratele meu',
  trompeta: 'La nuntă',
  oriental: 'La mulți ani în familie',
};

export function defaultStoryForStyle(styleId: string): CadouStory {
  const list = storiesForStyle(styleId);
  const label = DEFAULT_LABEL[styleId];
  return list.find((s) => s.label === label) ?? list[0];
}

export function isPresetStoryMsg(msg: string): boolean {
  const t = msg.trim();
  if (!t) return false;
  return Object.values(BY_ID).some((list) => list.some((s) => s.msg === t));
}
