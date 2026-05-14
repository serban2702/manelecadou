/**
 * Master list de 50 sluguri SEO țintite per categorie. Slug-urile sunt
 * STABILE și aceleași pentru toate site-urile (RO / BG / EL / TR / ...).
 * Conținutul efectiv (title, h1, paragrafe) e generat cu OpenAI PER SITE,
 * în limba site-ului, ținând cont de brand, preț, ocazii, voci proprii.
 *
 * Categorii (pentru breadcrumbs + hub):
 *   - ocazii (12) — zi naștere, nuntă, botez, etc.
 *   - destinatari (8) — pentru șef, prieten, mamă, etc.
 *   - stiluri (8) — clasic, modern, oriental, etc.
 *   - cadou (6) — alternative cadou
 *   - cum-functioneaza (6) — explicative pentru first-time visitors
 *   - long-tail (10) — variații long-tail care convertesc mult
 *
 * Cuvântul-cheie principal e englobat în slug (Google îl folosește direct).
 * Conținutul generat trebuie să includă keyword-ul în <title>, H1, prima H2,
 * primul paragraf și de 2-3 ori în corp (natural).
 */

export type SeoCategory =
  | 'ocazii'
  | 'destinatari'
  | 'stiluri'
  | 'cadou'
  | 'cum-functioneaza'
  | 'long-tail';

export interface SeoSlugTemplate {
  slug: string;
  category: SeoCategory;
  /** Keyword principal (folosit ca hint în prompt OpenAI). */
  primaryKeyword: string;
  /** Intent: ce caută utilizatorul ajuns aici (folosit în prompt). */
  intent: string;
  /** Ocazia/voce/stil mapat la entitățile site-ului (opțional). */
  occasionId?: string;
  voiceId?: string;
  styleId?: string;
}

export const SEO_SLUG_TEMPLATES: SeoSlugTemplate[] = [
  // ====== OCAZII (12) ======
  {
    slug: 'manea-zi-nastere',
    category: 'ocazii',
    primaryKeyword: 'manea zi de naștere',
    intent: 'Caută cadou muzical original pentru cineva care își aniversează ziua de naștere.',
    occasionId: 'zi',
  },
  {
    slug: 'manea-nunta',
    category: 'ocazii',
    primaryKeyword: 'manea nuntă personalizată',
    intent: 'Caută cadou de nuntă neașteptat, de pus la masă sau de oferit mirilor.',
    occasionId: 'nunta',
  },
  {
    slug: 'manea-botez',
    category: 'ocazii',
    primaryKeyword: 'manea botez personalizată',
    intent: 'Naș, nașă, părinte sau invitat ce caută cadou unic la botez.',
    occasionId: 'botez',
  },
  {
    slug: 'manea-cumatrie',
    category: 'ocazii',
    primaryKeyword: 'manea pentru cumătrie',
    intent: 'Cumătru/cumătră ce vrea să surprindă cu o piesă personalizată la cumătrie.',
    occasionId: 'cumatrie',
  },
  {
    slug: 'manea-aniversare-casatorie',
    category: 'ocazii',
    primaryKeyword: 'manea aniversare căsătorie',
    intent: 'Soț/soție care vrea cadou romantic la aniversarea căsătoriei (1, 5, 10, 25 ani).',
  },
  {
    slug: 'manea-ziua-numelui',
    category: 'ocazii',
    primaryKeyword: 'manea ziua numelui (onomastica)',
    intent: 'Cadou pentru cineva care își sărbătorește onomastica (Maria, Ion, Gheorghe).',
  },
  {
    slug: 'manea-bachelor-party',
    category: 'ocazii',
    primaryKeyword: 'manea pentru burlăcie',
    intent: 'Cavaler de onoare ce caută faza serii la petrecerea de burlăcie / mireasă.',
  },
  {
    slug: 'manea-pensionare',
    category: 'ocazii',
    primaryKeyword: 'manea pensionare',
    intent: 'Coleg sau familie ce dorește cadou special la ieșirea la pensie a cuiva.',
  },
  {
    slug: 'manea-promovare-job',
    category: 'ocazii',
    primaryKeyword: 'manea promovare la job',
    intent: 'Felicitare audio pentru cineva promovat sau care a luat un job mare.',
  },
  {
    slug: 'manea-casa-noua',
    category: 'ocazii',
    primaryKeyword: 'manea pentru casă nouă',
    intent: 'Inaugurare casă, mutare, primă casă cumpărată — felicitare cu stil.',
  },
  {
    slug: 'manea-masina-noua',
    category: 'ocazii',
    primaryKeyword: 'manea pentru mașină nouă',
    intent: 'Felicitare pentru achiziția unei mașini noi (BMW, Mercedes, AMG, etc.).',
  },
  {
    slug: 'manea-craciun-revelion',
    category: 'ocazii',
    primaryKeyword: 'manea de Crăciun sau Revelion',
    intent: 'Cadou de sezon pentru familie, prieteni, colegi de Crăciun / Anul Nou.',
  },

  // ====== DESTINATARI (8) ======
  {
    slug: 'manea-pentru-sef',
    category: 'destinatari',
    primaryKeyword: 'manea pentru șef',
    intent: 'Angajat care vrea să facă o impresie sau să roage politicos pentru bonus.',
    occasionId: 'sef',
  },
  {
    slug: 'manea-pentru-prieten',
    category: 'destinatari',
    primaryKeyword: 'cadou amuzant pentru prieten',
    intent: 'Cel mai bun prieten / gașca — cadou care îl ia prin surprindere și-l face să râdă.',
  },
  {
    slug: 'manea-pentru-iubita',
    category: 'destinatari',
    primaryKeyword: 'manea de dragoste pentru iubita',
    intent: 'Cadou romantic pentru iubită — Valentine, aniversare, propunere.',
  },
  {
    slug: 'manea-pentru-iubit',
    category: 'destinatari',
    primaryKeyword: 'cadou pentru iubit',
    intent: 'Cadou pentru iubit, dificil de surprins — o manea cu numele lui îl ia prin surprindere.',
  },
  {
    slug: 'manea-pentru-mama',
    category: 'destinatari',
    primaryKeyword: 'manea pentru mama',
    intent: 'Cadou pentru mamă de 8 Martie, ziua mamei, ziua ei de naștere.',
  },
  {
    slug: 'manea-pentru-tata',
    category: 'destinatari',
    primaryKeyword: 'manea pentru tata',
    intent: 'Cadou pentru tată — ziua tatălui, aniversare, pensionare.',
  },
  {
    slug: 'manea-pentru-frate',
    category: 'destinatari',
    primaryKeyword: 'cadou pentru frate',
    intent: 'Cadou între frați — roast prietenesc, aniversare, etapă majoră.',
  },
  {
    slug: 'manea-pentru-coleg',
    category: 'destinatari',
    primaryKeyword: 'cadou pentru coleg de muncă',
    intent: 'Cadou de echipă pentru un coleg — ziua lui, plecare, promovare.',
  },

  // ====== STILURI (8) ======
  {
    slug: 'manea-clasica-lautareasca',
    category: 'stiluri',
    primaryKeyword: 'manea clasică lăutărească',
    intent: 'Iubitor de muzică tradițională — vrea manea cu acordeon, voce caldă, ca odinioară.',
    styleId: 'clasic',
  },
  {
    slug: 'manea-moderna-trap',
    category: 'stiluri',
    primaryKeyword: 'manea modernă trap',
    intent: 'Tineri ce vor sound modern — trap-manea, beat tare, pentru club și TikTok.',
    styleId: 'modern',
  },
  {
    slug: 'manea-orientala',
    category: 'stiluri',
    primaryKeyword: 'manea orientală',
    intent: 'Vor melodie cu darbuka, melisme, sound oriental autentic.',
    styleId: 'oriental',
  },
  {
    slug: 'manea-cu-trompete',
    category: 'stiluri',
    primaryKeyword: 'manea cu trompete',
    intent: 'Caută sound de fanfară, trompete, atmosferă de petrecere mare.',
    styleId: 'trompeta',
  },
  {
    slug: 'manea-de-jale',
    category: 'stiluri',
    primaryKeyword: 'manea de jale',
    intent: 'Inimă frântă, despărțire, dor de cineva — manea sentimentală.',
    styleId: 'romantica',
  },
  {
    slug: 'manea-de-iubire',
    category: 'stiluri',
    primaryKeyword: 'manea de iubire',
    intent: 'Iubire pură, romantism — manea pentru declarație de dragoste.',
  },
  {
    slug: 'manea-comerciala-club',
    category: 'stiluri',
    primaryKeyword: 'manea comercială de club',
    intent: 'Hit-uri de club, manea cu producție mare, sound radio.',
    styleId: 'comerciala',
  },
  {
    slug: 'manea-de-opulenta',
    category: 'stiluri',
    primaryKeyword: 'manea de opulență (bani, lux)',
    intent: 'Sound de șmecher cu bani, prosperitate, lux — Adi de la Vâlcea style.',
  },

  // ====== CADOU (6) ======
  {
    slug: 'manea-cadou-personalizata',
    category: 'cadou',
    primaryKeyword: 'manea cadou personalizată',
    intent: 'Caută alternativă originală la cadou clasic — vrea ceva care impresionează imediat.',
  },
  {
    slug: 'manea-cu-numele-meu',
    category: 'cadou',
    primaryKeyword: 'manea cu numele meu',
    intent: 'Vrea pentru sine sau pentru cineva — o manea care are numele cuiva în versuri.',
  },
  {
    slug: 'manea-amuzanta',
    category: 'cadou',
    primaryKeyword: 'manea amuzantă',
    intent: 'Cadou de roast / glumă — manea care îl ia peste picior pe destinatar prietenos.',
  },
  {
    slug: 'idei-cadou-original',
    category: 'cadou',
    primaryKeyword: 'idei de cadou original',
    intent: 'Lista de idei pentru cadouri unice — pagina argumentează că maneaua e top.',
  },
  {
    slug: 'cadou-care-il-da-pe-spate',
    category: 'cadou',
    primaryKeyword: 'cadou care îl dă pe spate',
    intent: 'Vrea cadou wow, neașteptat, despre care se va vorbi la masă.',
  },
  {
    slug: 'alternativa-la-cadou-bani',
    category: 'cadou',
    primaryKeyword: 'alternativă la a oferi bani cadou',
    intent: 'Nu-i convine să dea bani plic — caută ceva mai personal dar nu scump.',
  },

  // ====== CUM FUNCTIONEAZA (6) ======
  {
    slug: 'cum-fac-o-manea-online',
    category: 'cum-functioneaza',
    primaryKeyword: 'cum fac o manea online',
    intent: 'Curios cum funcționează — vrea să înțeleagă pașii înainte să comande.',
  },
  {
    slug: 'generator-manele-ai',
    category: 'cum-functioneaza',
    primaryKeyword: 'generator de manele cu AI',
    intent: 'A auzit de AI music generation — vrea să încerce un generator în română.',
  },
  {
    slug: 'manea-cu-versuri-pe-comanda',
    category: 'cum-functioneaza',
    primaryKeyword: 'manea cu versuri pe comandă',
    intent: 'Vrea versuri scrise special pentru el — întreabă cum se scrie textul.',
  },
  {
    slug: 'manea-cu-voce-de-artist',
    category: 'cum-functioneaza',
    primaryKeyword: 'manea cu voce de artist cunoscut',
    intent: 'Vrea voce care sună ca un manelist celebru — explică opțiunile de voce.',
  },
  {
    slug: 'manea-livrare-rapida',
    category: 'cum-functioneaza',
    primaryKeyword: 'manea livrare rapidă',
    intent: 'A uitat de aniversare — vrea cadou ASAP, ideal în 2 minute pe email.',
  },
  {
    slug: 'exemple-manele-personalizate',
    category: 'cum-functioneaza',
    primaryKeyword: 'exemple manele personalizate',
    intent: 'Vrea să asculte câteva exemple înainte să comande — leagă la /asculta.',
  },

  // ====== LONG-TAIL (10) ======
  {
    slug: 'ce-cadou-iei-la-nunta',
    category: 'long-tail',
    primaryKeyword: 'ce cadou iei la nuntă',
    intent: 'Invitat la nuntă, nu știe ce să ia — articol care prezintă maneaua ca opțiune mișto.',
  },
  {
    slug: 'ce-cadou-iei-la-botez',
    category: 'long-tail',
    primaryKeyword: 'ce cadou iei la botez',
    intent: 'Invitat la botez ce caută inspirație — manea ca alternativă peste plic.',
  },
  {
    slug: 'cadou-pentru-nas',
    category: 'long-tail',
    primaryKeyword: 'cadou pentru naș',
    intent: 'Fin sau finii caută cadou special pentru nași — manea cu numele lor.',
  },
  {
    slug: 'cadou-pentru-fin',
    category: 'long-tail',
    primaryKeyword: 'cadou pentru fin',
    intent: 'Naș sau nașă vor ceva memorabil pentru fini — atât la botez cât și ulterior.',
  },
  {
    slug: 'mesaj-zi-nastere-sef',
    category: 'long-tail',
    primaryKeyword: 'mesaj de zi de naștere pentru șef',
    intent: 'Vrea text de felicitare pentru șef — pagina sugerează manea în loc de mesaj.',
  },
  {
    slug: 'cadou-50-100-lei',
    category: 'long-tail',
    primaryKeyword: 'cadou între 50 și 100 lei',
    intent: 'Buget mic-mediu, vrea ceva valoros la prețul ăsta.',
  },
  {
    slug: 'cadou-ultimul-moment',
    category: 'long-tail',
    primaryKeyword: 'cadou de ultimul moment',
    intent: 'A uitat aniversarea — vrea cadou care se livrează în câteva minute.',
  },
  {
    slug: 'cadou-distractiv-petrecere',
    category: 'long-tail',
    primaryKeyword: 'cadou distractiv de petrecere',
    intent: 'Organizator de petrecere — caută ceva care animă atmosfera (manea live).',
  },
  {
    slug: 'manea-de-petrecere',
    category: 'long-tail',
    primaryKeyword: 'manea de petrecere',
    intent: 'Pregătește o petrecere — vrea ca finalul de seară să fie nebun cu o manea custom.',
  },
  {
    slug: 'cadou-pentru-cineva-care-are-tot',
    category: 'long-tail',
    primaryKeyword: 'cadou pentru cineva care are de toate',
    intent: 'Destinatar greu de surprins (părinți bogați, șef cu de toate) — manea e UNICĂ.',
  },
];

export function findSlugTemplate(slug: string): SeoSlugTemplate | undefined {
  return SEO_SLUG_TEMPLATES.find((t) => t.slug === slug);
}

export function slugsByCategory(): Record<SeoCategory, SeoSlugTemplate[]> {
  const out: Record<string, SeoSlugTemplate[]> = {};
  for (const t of SEO_SLUG_TEMPLATES) {
    (out[t.category] ??= []).push(t);
  }
  return out as Record<SeoCategory, SeoSlugTemplate[]>;
}
