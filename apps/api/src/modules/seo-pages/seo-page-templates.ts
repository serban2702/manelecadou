/**
 * Master list de ~286 sluguri SEO țintite per categorie (50 inițiale + extinderea 2026-06). Slug-urile sunt
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
  | 'sarbatori'
  | 'aniversari'
  | 'nume'
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

  // ====== OCAZII — EXTINDERE 2026-06 ======
  {
    slug: 'manea-majorat',
    category: 'ocazii',
    primaryKeyword: 'manea de majorat',
    intent: 'Organizează sau merge la un majorat — vrea cadou sau moment surpriză care aprinde petrecerea de 18 ani.',
    occasionId: 'zi',
  },
  {
    slug: 'manea-banchet',
    category: 'ocazii',
    primaryKeyword: 'manea pentru banchet',
    intent: 'Elev sau profesor caută piesa serii pentru banchetul de final de liceu — dedicată clasei sau dirigintei.',
  },
  {
    slug: 'manea-absolvire',
    category: 'ocazii',
    primaryKeyword: 'manea de absolvire',
    intent: 'Absolvent de liceu sau facultate, ori părinte mândru — vrea piesă care marchează reușita.',
  },
  {
    slug: 'manea-zi-nastere-copil',
    category: 'ocazii',
    primaryKeyword: 'manea de ziua copilului',
    intent: 'Părinte care vrea surpriză muzicală cu numele copilului la aniversarea lui.',
    occasionId: 'zi',
  },
  {
    slug: 'manea-logodna',
    category: 'ocazii',
    primaryKeyword: 'manea de logodnă',
    intent: 'S-au logodit — vor piesă personalizată pentru petrecerea de logodnă.',
  },
  {
    slug: 'manea-cerere-in-casatorie',
    category: 'ocazii',
    primaryKeyword: 'manea pentru cerere în căsătorie',
    intent: 'Plănuiește cererea în căsătorie — vrea moment unic cu melodie personalizată cu numele ei.',
  },
  {
    slug: 'manea-cununie-civila',
    category: 'ocazii',
    primaryKeyword: 'manea pentru cununia civilă',
    intent: 'Cuplu sau invitați la cununia civilă — piesă pentru petrecerea restrânsă de după.',
    occasionId: 'nunta',
  },
  {
    slug: 'manea-dragobete',
    category: 'ocazii',
    primaryKeyword: 'manea de Dragobete',
    intent: 'Vrea cadou romantic de Dragobete (24 februarie) — alternativa românească la Valentine\'s Day.',
  },
  {
    slug: 'manea-valentines-day',
    category: 'ocazii',
    primaryKeyword: 'manea de Valentine\'s Day',
    intent: 'Caută cadou de Ziua Îndrăgostiților (14 februarie) care să nu fie un clișeu.',
  },
  {
    slug: 'manea-1-martie',
    category: 'ocazii',
    primaryKeyword: 'cadou de 1 Martie (mărțișor)',
    intent: 'Caută mărțișor inedit — o manea personalizată în loc de mărțișorul clasic.',
  },
  {
    slug: 'manea-8-martie',
    category: 'ocazii',
    primaryKeyword: 'manea de 8 Martie',
    intent: 'Cadou de Ziua Femeii pentru mamă, soție sau colege — emoționant sau amuzant.',
  },
  {
    slug: 'manea-ziua-mamei',
    category: 'ocazii',
    primaryKeyword: 'manea de Ziua Mamei',
    intent: 'Cadou pentru mama de Ziua Mamei (prima duminică din mai) — cu numele ei în versuri.',
  },
  {
    slug: 'manea-ziua-tatalui',
    category: 'ocazii',
    primaryKeyword: 'manea de Ziua Tatălui',
    intent: 'Cadou pentru tata de Ziua Tatălui — piesă cu numele lui care îl face mândru.',
  },
  {
    slug: 'manea-ziua-copilului',
    category: 'ocazii',
    primaryKeyword: 'manea de 1 Iunie',
    intent: 'Cadou de Ziua Copilului — piesă veselă cu numele copilului în versuri.',
  },
  {
    slug: 'manea-paste',
    category: 'ocazii',
    primaryKeyword: 'manea de Paște',
    intent: 'Masa de Paște cu familia — piesă personalizată care animă petrecerea de sărbători.',
  },
  {
    slug: 'manea-bacalaureat',
    category: 'ocazii',
    primaryKeyword: 'manea pentru luat BAC-ul',
    intent: 'A luat BAC-ul — părinții sau prietenii vor piesă de sărbătoare cu numele absolventului.',
  },
  {
    slug: 'manea-licenta',
    category: 'ocazii',
    primaryKeyword: 'manea de licență',
    intent: 'A terminat facultatea — cadou pentru petrecerea de licență sau dizertație.',
  },
  {
    slug: 'manea-permis-auto',
    category: 'ocazii',
    primaryKeyword: 'manea pentru luat permisul',
    intent: 'A luat permisul auto — piesă amuzantă despre noul șofer și mașina lui.',
  },
  {
    slug: 'manea-insanatosire',
    category: 'ocazii',
    primaryKeyword: 'manea de însănătoșire',
    intent: 'Cineva drag a ieșit din spital sau s-a recuperat — piesă de încurajare și sărbătoare.',
  },
  {
    slug: 'manea-lansare-afacere',
    category: 'ocazii',
    primaryKeyword: 'manea pentru afacere nouă',
    intent: 'Și-a deschis firmă sau afacere — piesă de succes și prosperitate cu numele firmei.',
  },
  {
    slug: 'manea-inaugurare-local',
    category: 'ocazii',
    primaryKeyword: 'manea pentru inaugurare',
    intent: 'Deschide restaurant, salon sau local nou — piesă pentru petrecerea de inaugurare.',
  },
  {
    slug: 'manea-petrecere-firma',
    category: 'ocazii',
    primaryKeyword: 'manea pentru petrecerea firmei',
    intent: 'Organizator de petrecere corporate sau teambuilding — piesă cu numele firmei care sparge gheața.',
  },
  {
    slug: 'manea-plecare-strainatate',
    category: 'ocazii',
    primaryKeyword: 'manea de plecare în străinătate',
    intent: 'Cineva pleacă la muncă în străinătate — piesă de rămas-bun cu dor și urări de bine.',
  },
  {
    slug: 'manea-revenire-acasa',
    category: 'ocazii',
    primaryKeyword: 'manea de bun venit acasă',
    intent: 'S-a întors acasă din străinătate — piesă de bun venit pentru petrecerea de revedere.',
  },
  {
    slug: 'manea-despartire',
    category: 'ocazii',
    primaryKeyword: 'manea de despărțire',
    intent: 'Despărțire grea — vrea piesă de jale personalizată care spune povestea lui.',
    styleId: 'romantica',
  },
  {
    slug: 'manea-impacare',
    category: 'ocazii',
    primaryKeyword: 'manea de împăcare',
    intent: 'Vrea să se împace cu iubita sau iubitul — piesă personalizată care înmoaie inima.',
  },
  {
    slug: 'manea-nasterea-copilului',
    category: 'ocazii',
    primaryKeyword: 'manea pentru nașterea copilului',
    intent: 'I s-a născut copil — felicitare muzicală pentru proaspeții părinți.',
  },
  {
    slug: 'manea-taierea-motului',
    category: 'ocazii',
    primaryKeyword: 'manea pentru tăierea moțului',
    intent: 'Petrecerea de 1 an a copilului (tăierea moțului) — piesă cu numele bebelușului.',
  },
  {
    slug: 'manea-petrecere-divort',
    category: 'ocazii',
    primaryKeyword: 'manea pentru petrecerea de divorț',
    intent: 'Divorce party — piesă amuzantă de eliberare pentru petrecerea de după divorț.',
  },

  // ====== SĂRBĂTORI & ONOMASTICI (nou) ======
  {
    slug: 'manea-sfantul-vasile',
    category: 'sarbatori',
    primaryKeyword: 'manea de Sfântul Vasile',
    intent: 'Onomastică pe 1 ianuarie — cadou pentru Vasile sau Vasilica, combinat cu petrecerea de Anul Nou.',
  },
  {
    slug: 'manea-sfantul-ion',
    category: 'sarbatori',
    primaryKeyword: 'manea de Sfântul Ion',
    intent: 'Onomastică pe 7 ianuarie — cadou pentru Ion, Ioana, Ionuț, Ionela sau Nelu.',
  },
  {
    slug: 'manea-sfantul-gheorghe',
    category: 'sarbatori',
    primaryKeyword: 'manea de Sfântul Gheorghe',
    intent: 'Onomastică pe 23 aprilie — cadou pentru Gheorghe, George, Georgiana sau Gina.',
  },
  {
    slug: 'manea-florii',
    category: 'sarbatori',
    primaryKeyword: 'manea de Florii',
    intent: 'Duminica Floriilor — sărbătoresc toți cei cu nume de flori: Florin, Florentina, Viorel, Viorica, Camelia.',
  },
  {
    slug: 'manea-sfantul-constantin-si-elena',
    category: 'sarbatori',
    primaryKeyword: 'manea de Sfinții Constantin și Elena',
    intent: 'Onomastică pe 21 mai — cadou pentru Constantin, Elena, Costel sau Nuți.',
  },
  {
    slug: 'manea-sfantul-petru-si-pavel',
    category: 'sarbatori',
    primaryKeyword: 'manea de Sfinții Petru și Pavel',
    intent: 'Onomastică pe 29 iunie — cadou pentru Petre, Petru, Paul sau Paula.',
  },
  {
    slug: 'manea-sfantul-ilie',
    category: 'sarbatori',
    primaryKeyword: 'manea de Sfântul Ilie',
    intent: 'Onomastică pe 20 iulie — cadou pentru Ilie sau Iliana.',
  },
  {
    slug: 'manea-sfanta-ana',
    category: 'sarbatori',
    primaryKeyword: 'manea de Sfânta Ana',
    intent: 'Onomastică pe 25 iulie — cadou pentru Ana, Anca sau Ani.',
  },
  {
    slug: 'manea-sfanta-maria',
    category: 'sarbatori',
    primaryKeyword: 'manea de Sfânta Maria',
    intent: '15 august — cea mai mare onomastică din România: Maria, Mariana, Marian, Mioara, Mărioara.',
  },
  {
    slug: 'manea-sfantul-alexandru',
    category: 'sarbatori',
    primaryKeyword: 'manea de Sfântul Alexandru',
    intent: 'Onomastică pe 30 august — cadou pentru Alexandru, Alexandra, Sandu sau Alex.',
  },
  {
    slug: 'manea-sfanta-parascheva',
    category: 'sarbatori',
    primaryKeyword: 'manea de Sfânta Parascheva',
    intent: 'Onomastică pe 14 octombrie — cadou pentru Paraschiva sau Parascheva.',
  },
  {
    slug: 'manea-sfantul-dumitru',
    category: 'sarbatori',
    primaryKeyword: 'manea de Sfântul Dumitru',
    intent: 'Onomastică pe 26 octombrie — cadou pentru Dumitru, Mitică sau Dumitra.',
  },
  {
    slug: 'manea-sfintii-mihail-si-gavriil',
    category: 'sarbatori',
    primaryKeyword: 'manea de Sfinții Mihail și Gavriil',
    intent: 'Onomastică pe 8 noiembrie — cadou pentru Mihai, Mihaela, Gabriel, Gabriela sau Gabi.',
  },
  {
    slug: 'manea-sfantul-andrei',
    category: 'sarbatori',
    primaryKeyword: 'manea de Sfântul Andrei',
    intent: 'Onomastică pe 30 noiembrie — cadou pentru Andrei, Andreea sau Andra.',
  },
  {
    slug: 'manea-sfantul-nicolae',
    category: 'sarbatori',
    primaryKeyword: 'manea de Sfântul Nicolae',
    intent: 'Onomastică pe 6 decembrie — cadou pentru Nicolae, Nicoleta sau Nicu, plus Moș Nicolae.',
  },
  {
    slug: 'manea-sfantul-stefan',
    category: 'sarbatori',
    primaryKeyword: 'manea de Sfântul Ștefan',
    intent: 'Onomastică pe 27 decembrie — cadou pentru Ștefan, Ștefania sau Fane.',
  },

  // ====== ANIVERSĂRI ROTUNDE (nou) ======
  {
    slug: 'manea-18-ani',
    category: 'aniversari',
    primaryKeyword: 'manea de 18 ani',
    intent: 'Împlinește 18 ani — piesă despre intrarea în rândul adulților, cadou de la familie sau prieteni.',
  },
  {
    slug: 'manea-20-ani',
    category: 'aniversari',
    primaryKeyword: 'manea de 20 de ani',
    intent: 'Împlinește 20 de ani — primul prag rotund, piesă cu numele sărbătoritului.',
  },
  {
    slug: 'manea-25-ani',
    category: 'aniversari',
    primaryKeyword: 'manea de 25 de ani',
    intent: 'Un sfert de secol — piesă aniversară amuzantă sau emoționantă pentru 25 de ani.',
  },
  {
    slug: 'manea-30-ani',
    category: 'aniversari',
    primaryKeyword: 'manea de 30 de ani',
    intent: 'Intră în clubul 30 — roast prietenos sau piesă emoționantă de bilanț.',
  },
  {
    slug: 'manea-40-ani',
    category: 'aniversari',
    primaryKeyword: 'manea de 40 de ani',
    intent: '40 de ani — piesă de sărbătoare pentru un prag important, cu realizările lui în versuri.',
  },
  {
    slug: 'manea-50-ani',
    category: 'aniversari',
    primaryKeyword: 'manea de 50 de ani',
    intent: 'Jubileu de 50 de ani — piesă de cinste și respect pentru jumătate de secol.',
  },
  {
    slug: 'manea-60-ani',
    category: 'aniversari',
    primaryKeyword: 'manea de 60 de ani',
    intent: '60 de ani — piesă caldă despre o viață frumoasă, cadou de la copii și nepoți.',
  },
  {
    slug: 'manea-70-ani',
    category: 'aniversari',
    primaryKeyword: 'manea de 70 de ani',
    intent: '70 de ani — omagiu muzical de la întreaga familie pentru bunici sau părinți.',
  },
  {
    slug: 'manea-1-an-relatie',
    category: 'aniversari',
    primaryKeyword: 'cadou 1 an de relație',
    intent: 'Aniversează 1 an de relație — piesă cu povestea cuplului de la început până azi.',
  },
  {
    slug: 'manea-1-an-casatorie',
    category: 'aniversari',
    primaryKeyword: 'manea 1 an de căsătorie',
    intent: 'Primul an de căsnicie (nunta de hârtie) — piesă romantică pentru soț sau soție.',
  },
  {
    slug: 'manea-5-ani-casatorie',
    category: 'aniversari',
    primaryKeyword: 'manea 5 ani de căsătorie',
    intent: 'Nunta de lemn — 5 ani împreună, piesă cu amintirile cuplului.',
  },
  {
    slug: 'manea-10-ani-casatorie',
    category: 'aniversari',
    primaryKeyword: 'manea 10 ani de căsătorie',
    intent: 'Un deceniu de căsnicie — piesă aniversară cu povestea familiei.',
  },
  {
    slug: 'manea-nunta-de-argint',
    category: 'aniversari',
    primaryKeyword: 'manea nunta de argint 25 de ani',
    intent: '25 de ani de căsătorie — piesă de cinste pentru părinți la nunta de argint.',
  },
  {
    slug: 'manea-nunta-de-aur',
    category: 'aniversari',
    primaryKeyword: 'manea nunta de aur 50 de ani',
    intent: '50 de ani de căsătorie — omagiu muzical pentru bunici la nunta de aur.',
  },

  // ====== DESTINATARI — EXTINDERE 2026-06 ======
  {
    slug: 'manea-pentru-sotie',
    category: 'destinatari',
    primaryKeyword: 'manea pentru soție',
    intent: 'Soț care vrea să-și surprindă soția — aniversare, 8 Martie sau pur și simplu o declarație.',
  },
  {
    slug: 'manea-pentru-sot',
    category: 'destinatari',
    primaryKeyword: 'manea pentru soț',
    intent: 'Soție care caută cadou pentru soțul greu de impresionat — piesă cu numele lui.',
  },
  {
    slug: 'manea-pentru-bunica',
    category: 'destinatari',
    primaryKeyword: 'manea pentru bunica',
    intent: 'Nepoți care vor să o emoționeze pe bunica — piesă cu numele ei și amintirile familiei.',
  },
  {
    slug: 'manea-pentru-bunicul',
    category: 'destinatari',
    primaryKeyword: 'manea pentru bunicul',
    intent: 'Cadou pentru bunicul — piesă de cinste și respect de la nepoți.',
  },
  {
    slug: 'manea-pentru-sora',
    category: 'destinatari',
    primaryKeyword: 'manea pentru soră',
    intent: 'Cadou între frați — piesă emoționantă sau roast prietenos pentru sora lui.',
  },
  {
    slug: 'manea-pentru-fiu',
    category: 'destinatari',
    primaryKeyword: 'manea pentru fiul meu',
    intent: 'Părinte mândru de băiatul lui — aniversare, majorat sau reușită.',
  },
  {
    slug: 'manea-pentru-fiica',
    category: 'destinatari',
    primaryKeyword: 'manea pentru fiica mea',
    intent: 'Părinte care vrea să-și emoționeze fata — aniversare, majorat, nuntă.',
  },
  {
    slug: 'manea-pentru-nepot',
    category: 'destinatari',
    primaryKeyword: 'manea pentru nepot',
    intent: 'Bunic, unchi sau mătușă — cadou muzical pentru nepotul lor la aniversare.',
  },
  {
    slug: 'manea-pentru-nepoata',
    category: 'destinatari',
    primaryKeyword: 'manea pentru nepoată',
    intent: 'Cadou pentru nepoată — piesă veselă cu numele ei.',
  },
  {
    slug: 'manea-pentru-cumnat',
    category: 'destinatari',
    primaryKeyword: 'manea pentru cumnat',
    intent: 'Cadou pentru cumnat — roast prietenos la aniversare sau la petrecerea de familie.',
  },
  {
    slug: 'manea-pentru-cumnata',
    category: 'destinatari',
    primaryKeyword: 'manea pentru cumnată',
    intent: 'Cadou pentru cumnată — piesă amuzantă sau emoționantă la zi aniversară.',
  },
  {
    slug: 'manea-pentru-soacra',
    category: 'destinatari',
    primaryKeyword: 'manea pentru soacră',
    intent: 'Ginere sau noră — piesă cu umor pentru soacră, hit garantat la petrecerile de familie.',
  },
  {
    slug: 'manea-pentru-socru',
    category: 'destinatari',
    primaryKeyword: 'manea pentru socru',
    intent: 'Cadou pentru socru — piesă de respect cu un strop de umor.',
  },
  {
    slug: 'manea-pentru-nasi',
    category: 'destinatari',
    primaryKeyword: 'manea pentru nași',
    intent: 'Finii vor să-și impresioneze nașii — piesă de mulțumire cu numele lor.',
  },
  {
    slug: 'manea-pentru-fini',
    category: 'destinatari',
    primaryKeyword: 'manea pentru fini',
    intent: 'Nașii caută cadou pentru fini — la nuntă, botez sau aniversare.',
  },
  {
    slug: 'manea-pentru-verisoara',
    category: 'destinatari',
    primaryKeyword: 'manea pentru verișoară',
    intent: 'Cadou pentru verișoară — piesă veselă pentru petrecerile de familie.',
  },
  {
    slug: 'manea-pentru-prietena',
    category: 'destinatari',
    primaryKeyword: 'manea pentru cea mai bună prietenă',
    intent: 'Cadou pentru cea mai bună prietenă — piesă despre prietenia lor.',
  },
  {
    slug: 'manea-pentru-sefa',
    category: 'destinatari',
    primaryKeyword: 'manea pentru șefa',
    intent: 'Echipa caută cadou pentru șefa lor — piesă cu umor fin, safe for work.',
  },
  {
    slug: 'manea-pentru-colega',
    category: 'destinatari',
    primaryKeyword: 'manea pentru colegă',
    intent: 'Cadou de la colectiv pentru o colegă — zi de naștere, plecare sau pensionare.',
  },
  {
    slug: 'manea-pentru-vecin',
    category: 'destinatari',
    primaryKeyword: 'manea pentru vecin',
    intent: 'Cadou amuzant pentru vecinul de pahar — piesă despre prietenia de la bloc sau de la țară.',
  },
  {
    slug: 'manea-pentru-cuscri',
    category: 'destinatari',
    primaryKeyword: 'manea pentru cuscri',
    intent: 'Cadou pentru cuscri — piesă care unește familiile la nuntă sau la petreceri.',
  },
  {
    slug: 'manea-pentru-parinti',
    category: 'destinatari',
    primaryKeyword: 'manea pentru părinți',
    intent: 'Copiii vor să-și sărbătorească părinții — aniversare de căsătorie sau mulțumire.',
  },
  {
    slug: 'manea-pentru-echipa',
    category: 'destinatari',
    primaryKeyword: 'manea pentru echipă',
    intent: 'Piesă pentru echipa de fotbal, gașca de prieteni sau echipa de la muncă.',
  },
  {
    slug: 'manea-pentru-patron',
    category: 'destinatari',
    primaryKeyword: 'manea pentru patron',
    intent: 'Angajații caută cadou pentru patron — piesă de cinste în cel mai autentic stil de manele.',
  },
  {
    slug: 'manea-pentru-angajati',
    category: 'destinatari',
    primaryKeyword: 'manea pentru angajați',
    intent: 'Patron care vrea să-și surprindă echipa la petrecerea firmei — piesă despre echipa lui.',
  },
  {
    slug: 'manea-pentru-profesor',
    category: 'destinatari',
    primaryKeyword: 'manea pentru profesor',
    intent: 'Elevi sau studenți — cadou de mulțumire pentru un profesor drag.',
  },
  {
    slug: 'manea-pentru-diriginta',
    category: 'destinatari',
    primaryKeyword: 'manea pentru dirigintă',
    intent: 'Clasa caută surpriză pentru dirigintă la banchet sau la final de an.',
  },
  {
    slug: 'manea-pentru-medic',
    category: 'destinatari',
    primaryKeyword: 'manea pentru medic',
    intent: 'Pacient recunoscător — piesă de mulțumire pentru medicul care l-a ajutat.',
  },
  {
    slug: 'manea-pentru-antrenor',
    category: 'destinatari',
    primaryKeyword: 'manea pentru antrenor',
    intent: 'Echipa își sărbătorește antrenorul — piesă de respect la final de sezon.',
  },
  {
    slug: 'manea-pentru-mire',
    category: 'destinatari',
    primaryKeyword: 'manea pentru mire',
    intent: 'Cavalerii de onoare sau nașii — piesă surpriză pentru mire la nuntă sau burlăcie.',
  },
  {
    slug: 'manea-pentru-mireasa',
    category: 'destinatari',
    primaryKeyword: 'manea pentru mireasă',
    intent: 'Domnișoarele de onoare — piesă surpriză pentru mireasă la nuntă sau burlăcițe.',
  },

  // ====== STILURI — EXTINDERE 2026-06 ======
  {
    slug: 'manele-vechi',
    category: 'stiluri',
    primaryKeyword: 'manele vechi',
    intent: 'Nostalgie după sound-ul anilor \'90–2000 — vrea piesă personalizată cu vibe retro de casetofon.',
    styleId: 'clasic',
  },
  {
    slug: 'manea-lenta',
    category: 'stiluri',
    primaryKeyword: 'manea lentă',
    intent: 'Caută piesă lentă, de suflet — nu de dans, ci de ascultare cu paharul în mână.',
    styleId: 'romantica',
  },
  {
    slug: 'manea-de-ascultare',
    category: 'stiluri',
    primaryKeyword: 'manele de ascultare',
    intent: 'Manele de ascultare — pentru momente de gânduri, pahar și suflet.',
    styleId: 'romantica',
  },
  {
    slug: 'manea-de-inima-albastra',
    category: 'stiluri',
    primaryKeyword: 'manele de inimă albastră',
    intent: 'Suferință în dragoste — vrea piesă de inimă albastră personalizată cu povestea lui.',
    styleId: 'romantica',
  },
  {
    slug: 'manea-de-dusmani',
    category: 'stiluri',
    primaryKeyword: 'manele de dușmani',
    intent: 'Mesaj pentru dușmani și invidioși — piesă personalizată despre cei care nu-i vor binele.',
  },
  {
    slug: 'manea-de-familie',
    category: 'stiluri',
    primaryKeyword: 'manea despre familie',
    intent: 'Mândru de familia lui — piesă despre copii, părinți și casa plină.',
  },
  {
    slug: 'manea-pentru-baieti',
    category: 'stiluri',
    primaryKeyword: 'manele de băieți',
    intent: 'Pentru gașca de băieți — șmecherie, frăție și loialitate în versuri personalizate.',
  },
  {
    slug: 'manea-pentru-femei',
    category: 'stiluri',
    primaryKeyword: 'manele pentru femei puternice',
    intent: 'Piesă de divă — femeie independentă, regină, care își sărbătorește puterea.',
  },
  {
    slug: 'manea-cu-saxofon',
    category: 'stiluri',
    primaryKeyword: 'manea cu saxofon',
    intent: 'Vrea sound cu saxofon — instrumentul vedetă al petrecerilor cu manele.',
    styleId: 'comerciala',
  },
  {
    slug: 'manea-cu-acordeon',
    category: 'stiluri',
    primaryKeyword: 'manea cu acordeon',
    intent: 'Acordeonul în față — lăutărie autentică în variantă personalizată.',
    styleId: 'clasic',
  },
  {
    slug: 'manea-cu-vioara',
    category: 'stiluri',
    primaryKeyword: 'manea cu vioară',
    intent: 'Vioară plângăcioasă — emoție maximă pentru o piesă de suflet.',
    styleId: 'clasic',
  },
  {
    slug: 'manea-de-sistem',
    category: 'stiluri',
    primaryKeyword: 'manele de sistem',
    intent: 'Frăție, loialitate și forță — piesă de sistem personalizată pentru gașca lui.',
  },
  {
    slug: 'manea-usoara-pop',
    category: 'stiluri',
    primaryKeyword: 'pop manea',
    intent: 'Fuziune pop-manea — pentru cei care zic că nu ascultă manele, dar fredonează refrenul.',
    styleId: 'modern',
  },
  {
    slug: 'manea-de-dans',
    category: 'stiluri',
    primaryKeyword: 'manea de dans',
    intent: 'Beat de dans — piesa care umple ringul la orice petrecere.',
    styleId: 'comerciala',
  },
  {
    slug: 'manea-de-viata',
    category: 'stiluri',
    primaryKeyword: 'manele de viață',
    intent: 'Despre viața grea, muncă și reușită — manele de viață cu povestea lui reală.',
  },
  {
    slug: 'manea-live',
    category: 'stiluri',
    primaryKeyword: 'manea ca la nuntă',
    intent: 'Vrea sound live, ca la nuntă cu taraf — atmosferă de petrecere adevărată.',
    styleId: 'clasic',
  },
  {
    slug: 'manele-noi',
    category: 'stiluri',
    primaryKeyword: 'manele noi',
    intent: 'Caută manele noi — descoperă că poate avea propria manea nouă, unică, cu numele lui.',
    styleId: 'modern',
  },
  {
    slug: 'manea-cu-dedicatie',
    category: 'stiluri',
    primaryKeyword: 'manea cu dedicație',
    intent: 'Vrea dedicație muzicală — dar aici piesa întreagă e dedicată, nu doar strigată.',
  },
  {
    slug: 'manea-de-liberare',
    category: 'stiluri',
    primaryKeyword: 'manea de liberare',
    intent: 'Petrecere de bun venit acasă după o perioadă grea — temă clasică de liberare, tratată cu umor.',
  },

  // ====== CADOU — EXTINDERE 2026-06 ======
  {
    slug: 'cadou-personalizat-online',
    category: 'cadou',
    primaryKeyword: 'cadou personalizat online',
    intent: 'Caută cadouri personalizate online — maneaua personalizată e rapidă, unică și accesibilă.',
  },
  {
    slug: 'cadou-emotionant',
    category: 'cadou',
    primaryKeyword: 'cadou emoționant',
    intent: 'Vrea să-l facă să plângă de emoție — piesă cu povestea și amintirile lor.',
  },
  {
    slug: 'cadou-de-la-distanta',
    category: 'cadou',
    primaryKeyword: 'cadou de la distanță',
    intent: 'E departe de sărbătorit — cadou digital trimis instant pe email sau WhatsApp.',
  },
  {
    slug: 'cadou-pentru-diaspora',
    category: 'cadou',
    primaryKeyword: 'cadou pentru români din diaspora',
    intent: 'Are rude plecate în Italia, Spania, UK sau Germania — piesă cu dor de casă.',
  },
  {
    slug: 'cadou-sub-50-lei',
    category: 'cadou',
    primaryKeyword: 'cadou sub 50 lei',
    intent: 'Buget mic — caută cadou sub 50 de lei care să nu pară ieftin.',
  },
  {
    slug: 'cadou-ieftin-si-bun',
    category: 'cadou',
    primaryKeyword: 'cadou ieftin și bun',
    intent: 'Vrea raport calitate-preț maxim — efect wow la preț mic.',
  },
  {
    slug: 'cadou-de-ziua-lui',
    category: 'cadou',
    primaryKeyword: 'cadou de ziua lui',
    intent: 'Caută idei de cadou pentru EL — soț, iubit, tată sau prieten.',
  },
  {
    slug: 'cadou-de-ziua-ei',
    category: 'cadou',
    primaryKeyword: 'cadou de ziua ei',
    intent: 'Caută idei de cadou pentru EA — soție, iubită, mamă sau prietenă.',
  },
  {
    slug: 'cadou-inedit',
    category: 'cadou',
    primaryKeyword: 'cadou inedit',
    intent: 'Sătul de parfumuri, cămăși și flori — vrea ceva cu adevărat inedit.',
  },
  {
    slug: 'cadou-experienta',
    category: 'cadou',
    primaryKeyword: 'cadou experiență',
    intent: 'Preferă experiențe în loc de obiecte — maneaua personalizată e o experiență memorabilă.',
  },
  {
    slug: 'cadou-secret-santa',
    category: 'cadou',
    primaryKeyword: 'cadou Secret Santa',
    intent: 'Schimb de cadouri între colegi cu buget fix — vrea să fie vedeta extragerii.',
  },
  {
    slug: 'cadou-de-multumire',
    category: 'cadou',
    primaryKeyword: 'cadou de mulțumire',
    intent: 'Vrea să mulțumească cuiva — medic, profesor, prieten care l-a ajutat la greu.',
  },
  {
    slug: 'cadou-de-ramas-bun',
    category: 'cadou',
    primaryKeyword: 'cadou de rămas-bun',
    intent: 'Un coleg sau prieten pleacă — piesă de adio amuzantă sau emoționantă.',
  },
  {
    slug: 'cadou-burlacite',
    category: 'cadou',
    primaryKeyword: 'cadou pentru petrecerea burlacițelor',
    intent: 'Domnișoarele de onoare pregătesc burlăcițele — piesă surpriză pentru mireasă.',
  },
  {
    slug: 'felicitare-muzicala',
    category: 'cadou',
    primaryKeyword: 'felicitare muzicală',
    intent: 'În loc de felicitare clasică scrisă — felicitare cântată, personalizată cu numele lui.',
  },
  {
    slug: 'dedicatie-muzicala-online',
    category: 'cadou',
    primaryKeyword: 'dedicație muzicală online',
    intent: 'Vrea să comande o dedicație muzicală online — primește piesă întreagă dedicată.',
  },
  {
    slug: 'melodie-personalizata-cadou',
    category: 'cadou',
    primaryKeyword: 'melodie personalizată cadou',
    intent: 'Caută melodie personalizată cadou — explică stilurile disponibile și procesul.',
  },
  {
    slug: 'cantec-personalizat',
    category: 'cadou',
    primaryKeyword: 'cântec personalizat',
    intent: 'Caută cântec personalizat cu numele și povestea destinatarului.',
  },

  // ====== CUM FUNCȚIONEAZĂ — EXTINDERE 2026-06 ======
  {
    slug: 'cat-costa-o-manea-personalizata',
    category: 'cum-functioneaza',
    primaryKeyword: 'cât costă o manea personalizată',
    intent: 'Vrea preț concret înainte să comande — transparență totală despre cost și ce include.',
  },
  {
    slug: 'manele-la-comanda',
    category: 'cum-functioneaza',
    primaryKeyword: 'manele la comandă',
    intent: 'Caută serviciu de manele la comandă — cum comanzi, cât durează, ce primești.',
  },
  {
    slug: 'cine-canta-maneaua',
    category: 'cum-functioneaza',
    primaryKeyword: 'cine cântă maneaua',
    intent: 'Curios ce voce va avea piesa lui — explică vocile disponibile și cum alegi.',
  },
  {
    slug: 'manea-drepturi-de-autor',
    category: 'cum-functioneaza',
    primaryKeyword: 'manea personalizată drepturi de autor',
    intent: 'Întreabă dacă poate posta piesa pe TikTok sau YouTube — explică licența personală.',
  },
  {
    slug: 'cum-scriu-versuri-de-manea',
    category: 'cum-functioneaza',
    primaryKeyword: 'cum se scriu versuri de manea',
    intent: 'Vrea să înțeleagă cum ies versurile — ce detalii să dea ca piesa să fie personală.',
  },
  {
    slug: 'versuri-manele-personalizate',
    category: 'cum-functioneaza',
    primaryKeyword: 'versuri manele personalizate',
    intent: 'Caută versuri personalizate de manele — serviciul scrie versurile pentru tine.',
  },
  {
    slug: 'manea-demo-gratis',
    category: 'cum-functioneaza',
    primaryKeyword: 'manea demo gratis',
    intent: 'Vrea să încerce înainte să plătească — explică demo-ul gratuit de 30 de secunde.',
  },
  {
    slug: 'aplicatie-de-facut-manele',
    category: 'cum-functioneaza',
    primaryKeyword: 'aplicație de făcut manele',
    intent: 'Caută aplicație de făcut manele — merge direct din browser, fără instalare.',
  },
  {
    slug: 'site-de-facut-manele',
    category: 'cum-functioneaza',
    primaryKeyword: 'site de făcut manele',
    intent: 'Caută site unde își poate face o manea — pașii și avantajele serviciului.',
  },
  {
    slug: 'program-de-facut-manele',
    category: 'cum-functioneaza',
    primaryKeyword: 'program de făcut manele',
    intent: 'Caută program de făcut manele pe PC — nu are nevoie de program, totul e online.',
  },
  {
    slug: 'manea-mp3-download',
    category: 'cum-functioneaza',
    primaryKeyword: 'manea personalizată mp3 download',
    intent: 'Vrea fișierul piesei lui — primește MP3 de descărcat plus link de trimis.',
  },

  // ====== LONG-TAIL — EXTINDERE 2026-06 ======
  {
    slug: 'ce-cadou-iei-la-majorat',
    category: 'long-tail',
    primaryKeyword: 'ce cadou iei la majorat',
    intent: 'Invitat la un majorat, nu știe ce să ducă — maneaua personalizată ca alternativă la plic.',
  },
  {
    slug: 'ce-cadou-iei-la-cumatrie',
    category: 'long-tail',
    primaryKeyword: 'ce cadou iei la cumătrie',
    intent: 'Invitat la cumătrie — idei de cadouri, cu maneaua personalizată ca vedetă.',
  },
  {
    slug: 'ce-cadou-iei-la-zi-de-nastere',
    category: 'long-tail',
    primaryKeyword: 'ce cadou iei la o zi de naștere',
    intent: 'Caută idei generale de cadou de zi de naștere — ghid cu opțiuni pe buget.',
  },
  {
    slug: 'cadou-craciun-parinti',
    category: 'long-tail',
    primaryKeyword: 'cadou de Crăciun pentru părinți',
    intent: 'Caută cadou de Crăciun pentru părinți — ceva personal, nu obiecte generice.',
  },
  {
    slug: 'cadou-craciun-bunici',
    category: 'long-tail',
    primaryKeyword: 'cadou de Crăciun pentru bunici',
    intent: 'Cadou de Crăciun pentru bunici — piesă emoționantă de la nepoți.',
  },
  {
    slug: 'idei-cadou-sot',
    category: 'long-tail',
    primaryKeyword: 'idei cadou soț',
    intent: 'Caută idei de cadou pentru soț — bărbatul care zice că nu-i trebuie nimic.',
  },
  {
    slug: 'idei-cadou-sotie',
    category: 'long-tail',
    primaryKeyword: 'idei cadou soție',
    intent: 'Caută idei de cadou pentru soție — ceva personal care arată atenție.',
  },
  {
    slug: 'idei-cadou-iubit',
    category: 'long-tail',
    primaryKeyword: 'idei cadou iubit',
    intent: 'Caută idei de cadou pentru iubit — aniversare, ziua lui sau ocazie specială.',
  },
  {
    slug: 'idei-cadou-iubita',
    category: 'long-tail',
    primaryKeyword: 'idei cadou iubită',
    intent: 'Caută idei de cadou pentru iubită — romantic, personal, memorabil.',
  },
  {
    slug: 'idei-cadou-mama',
    category: 'long-tail',
    primaryKeyword: 'idei cadou mama',
    intent: 'Caută idei de cadou pentru mama — ziua ei, 8 Martie sau Crăciun.',
  },
  {
    slug: 'idei-cadou-tata',
    category: 'long-tail',
    primaryKeyword: 'idei cadou tata',
    intent: 'Caută idei de cadou pentru tata — bărbatul care are deja tot ce-i trebuie.',
  },
  {
    slug: 'idei-cadou-bunici',
    category: 'long-tail',
    primaryKeyword: 'idei cadou bunici',
    intent: 'Caută cadou pentru bunici — aniversare, sărbători sau nunta de aur.',
  },
  {
    slug: 'idei-cadou-frate',
    category: 'long-tail',
    primaryKeyword: 'idei cadou frate',
    intent: 'Caută idei de cadou pentru frate — de la roast amuzant la piesă emoționantă.',
  },
  {
    slug: 'idei-cadou-sora',
    category: 'long-tail',
    primaryKeyword: 'idei cadou soră',
    intent: 'Caută idei de cadou pentru soră — ziua ei, majorat sau nuntă.',
  },
  {
    slug: 'surpriza-zi-de-nastere',
    category: 'long-tail',
    primaryKeyword: 'surpriză de zi de naștere',
    intent: 'Vrea să organizeze o surpriză de zi de naștere — momentul muzical care încununează seara.',
  },
  {
    slug: 'surpriza-pentru-sotie',
    category: 'long-tail',
    primaryKeyword: 'surpriză pentru soție',
    intent: 'Vrea să-și surprindă soția fără ocazie specială — gestul care o emoționează.',
  },
  {
    slug: 'surpriza-pentru-sot',
    category: 'long-tail',
    primaryKeyword: 'surpriză pentru soț',
    intent: 'Vrea să-și surprindă soțul — idei de surprize, cu piesa personalizată în frunte.',
  },
  {
    slug: 'surpriza-nunta',
    category: 'long-tail',
    primaryKeyword: 'surpriză la nuntă',
    intent: 'Caută moment surpriză la nuntă — pentru miri, părinți sau nași.',
  },
  {
    slug: 'dedicatie-nunta-parinti',
    category: 'long-tail',
    primaryKeyword: 'dedicație pentru părinți la nuntă',
    intent: 'Mirii vor să mulțumească părinților la nuntă — piesă dedicată cu numele lor.',
  },
  {
    slug: 'dedicatie-zi-de-nastere',
    category: 'long-tail',
    primaryKeyword: 'dedicație de zi de naștere',
    intent: 'Caută dedicație de zi de naștere — piesă întreagă cu numele sărbătoritului.',
  },
  {
    slug: 'mesaj-la-multi-ani-haios',
    category: 'long-tail',
    primaryKeyword: 'mesaj haios de la mulți ani',
    intent: 'Caută mesaj amuzant de la mulți ani — upgrade: manea haioasă cu numele lui.',
  },
  {
    slug: 'urari-zi-de-nastere',
    category: 'long-tail',
    primaryKeyword: 'urări de zi de naștere',
    intent: 'Caută urări de zi de naștere — idei de texte plus varianta cântată.',
  },
  {
    slug: 'melodie-la-multi-ani-cu-nume',
    category: 'long-tail',
    primaryKeyword: 'melodie la mulți ani cu nume',
    intent: 'Caută melodie de la mulți ani cu numele sărbătoritului — varianta manea personalizată.',
  },
  {
    slug: 'manea-pentru-tiktok',
    category: 'long-tail',
    primaryKeyword: 'manea pentru TikTok',
    intent: 'Vrea piesă proprie pentru TikTok — sunet original cu numele lui pentru clipuri.',
  },
  {
    slug: 'idei-petrecere-aniversare',
    category: 'long-tail',
    primaryKeyword: 'idei pentru petrecere aniversară',
    intent: 'Organizează o petrecere aniversară — idei ca seara să fie memorabilă.',
  },
  {
    slug: 'cum-sa-impresionezi-nasii',
    category: 'long-tail',
    primaryKeyword: 'cum să impresionezi nașii',
    intent: 'Finii vor să-și impresioneze nașii — gesturi care contează, cu piesa personalizată în top.',
  },
  {
    slug: 'cum-sa-impresionezi-socrii',
    category: 'long-tail',
    primaryKeyword: 'cum să impresionezi socrii',
    intent: 'Vrea să-și impresioneze socrii — de la atenții clasice la maneaua dedicată lor.',
  },
  {
    slug: 'cantec-de-dragoste-personalizat',
    category: 'long-tail',
    primaryKeyword: 'cântec de dragoste personalizat',
    intent: 'Caută cântec de dragoste personalizat — declarație muzicală cu povestea cuplului.',
  },
  {
    slug: 'cum-imi-cer-iertare-de-la-iubita',
    category: 'long-tail',
    primaryKeyword: 'cum îmi cer iertare de la iubită',
    intent: 'A greșit și vrea să se revanșeze — piesa de împăcare ca gest mare.',
  },
  {
    slug: 'cerere-de-nasie',
    category: 'long-tail',
    primaryKeyword: 'cerere de nășie',
    intent: 'Vrea să-i ceară pe nași într-un mod special — piesa personalizată de cerere de nășie.',
  },
  {
    slug: 'cat-costa-lautarii-la-nunta',
    category: 'long-tail',
    primaryKeyword: 'cât costă lăutarii la nuntă',
    intent: 'Compară costurile muzicii de nuntă — și descoperă alternativa personalizată accesibilă.',
  },
  {
    slug: 'anunt-sarcina-inedit',
    category: 'long-tail',
    primaryKeyword: 'anunț de sarcină inedit',
    intent: 'Vrea să anunțe sarcina într-un mod creativ — piesă personalizată pentru viitorii bunici.',
  },
  {
    slug: 'gender-reveal-inedit',
    category: 'long-tail',
    primaryKeyword: 'idee gender reveal inedită',
    intent: 'Caută idee de gender reveal — melodia care dezvăluie dacă e fată sau băiat.',
  },
  {
    slug: 'melodie-multumire-parinti',
    category: 'long-tail',
    primaryKeyword: 'melodie de mulțumire pentru părinți',
    intent: 'Vrea să le mulțumească părinților — la nuntă, aniversare sau pur și simplu.',
  },
  {
    slug: 'imn-pentru-echipa',
    category: 'long-tail',
    primaryKeyword: 'imn pentru echipă',
    intent: 'Vrea imn pentru echipa de fotbal, firmă sau gașca lui — piesă cu numele echipei.',
  },
  {
    slug: 'cantece-cu-nume',
    category: 'long-tail',
    primaryKeyword: 'cântece cu nume',
    intent: 'Caută cântece care conțin un nume anume — aici își face piesa cu orice nume.',
  },
  {
    slug: 'cat-se-da-darul-la-nunta',
    category: 'long-tail',
    primaryKeyword: 'cât se dă darul la nuntă',
    intent: 'Invitat la nuntă, întreabă cât se dă darul — ghid practic plus ideea de cadou memorabil.',
  },
  {
    slug: 'cat-se-da-darul-la-botez',
    category: 'long-tail',
    primaryKeyword: 'cât se dă darul la botez',
    intent: 'Invitat la botez, întreabă cât se dă — ghid practic plus cadoul care rămâne amintire.',
  },

  // ====== MANELE CU NUME (nou) ======
  {
    slug: 'manea-pentru-ion',
    category: 'nume',
    primaryKeyword: 'manea pentru Ion',
    intent: 'Caută o manea personalizată cu numele Ion — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-ionut',
    category: 'nume',
    primaryKeyword: 'manea pentru Ionuț',
    intent: 'Caută o manea personalizată cu numele Ionuț — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-andrei',
    category: 'nume',
    primaryKeyword: 'manea pentru Andrei',
    intent: 'Caută o manea personalizată cu numele Andrei — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-alexandru',
    category: 'nume',
    primaryKeyword: 'manea pentru Alexandru',
    intent: 'Caută o manea personalizată cu numele Alexandru — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-mihai',
    category: 'nume',
    primaryKeyword: 'manea pentru Mihai',
    intent: 'Caută o manea personalizată cu numele Mihai — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-gheorghe',
    category: 'nume',
    primaryKeyword: 'manea pentru Gheorghe',
    intent: 'Caută o manea personalizată cu numele Gheorghe — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-george',
    category: 'nume',
    primaryKeyword: 'manea pentru George',
    intent: 'Caută o manea personalizată cu numele George — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-vasile',
    category: 'nume',
    primaryKeyword: 'manea pentru Vasile',
    intent: 'Caută o manea personalizată cu numele Vasile — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-constantin',
    category: 'nume',
    primaryKeyword: 'manea pentru Constantin',
    intent: 'Caută o manea personalizată cu numele Constantin — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-cristian',
    category: 'nume',
    primaryKeyword: 'manea pentru Cristian',
    intent: 'Caută o manea personalizată cu numele Cristian — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-daniel',
    category: 'nume',
    primaryKeyword: 'manea pentru Daniel',
    intent: 'Caută o manea personalizată cu numele Daniel — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-florin',
    category: 'nume',
    primaryKeyword: 'manea pentru Florin',
    intent: 'Caută o manea personalizată cu numele Florin — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-gabriel',
    category: 'nume',
    primaryKeyword: 'manea pentru Gabriel',
    intent: 'Caută o manea personalizată cu numele Gabriel — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-marian',
    category: 'nume',
    primaryKeyword: 'manea pentru Marian',
    intent: 'Caută o manea personalizată cu numele Marian — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-nicolae',
    category: 'nume',
    primaryKeyword: 'manea pentru Nicolae',
    intent: 'Caută o manea personalizată cu numele Nicolae — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-stefan',
    category: 'nume',
    primaryKeyword: 'manea pentru Ștefan',
    intent: 'Caută o manea personalizată cu numele Ștefan — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-adrian',
    category: 'nume',
    primaryKeyword: 'manea pentru Adrian',
    intent: 'Caută o manea personalizată cu numele Adrian — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-catalin',
    category: 'nume',
    primaryKeyword: 'manea pentru Cătălin',
    intent: 'Caută o manea personalizată cu numele Cătălin — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-cosmin',
    category: 'nume',
    primaryKeyword: 'manea pentru Cosmin',
    intent: 'Caută o manea personalizată cu numele Cosmin — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-marius',
    category: 'nume',
    primaryKeyword: 'manea pentru Marius',
    intent: 'Caută o manea personalizată cu numele Marius — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-bogdan',
    category: 'nume',
    primaryKeyword: 'manea pentru Bogdan',
    intent: 'Caută o manea personalizată cu numele Bogdan — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-vlad',
    category: 'nume',
    primaryKeyword: 'manea pentru Vlad',
    intent: 'Caută o manea personalizată cu numele Vlad — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-razvan',
    category: 'nume',
    primaryKeyword: 'manea pentru Răzvan',
    intent: 'Caută o manea personalizată cu numele Răzvan — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-radu',
    category: 'nume',
    primaryKeyword: 'manea pentru Radu',
    intent: 'Caută o manea personalizată cu numele Radu — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-sorin',
    category: 'nume',
    primaryKeyword: 'manea pentru Sorin',
    intent: 'Caută o manea personalizată cu numele Sorin — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-lucian',
    category: 'nume',
    primaryKeyword: 'manea pentru Lucian',
    intent: 'Caută o manea personalizată cu numele Lucian — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-valentin',
    category: 'nume',
    primaryKeyword: 'manea pentru Valentin',
    intent: 'Caută o manea personalizată cu numele Valentin — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-robert',
    category: 'nume',
    primaryKeyword: 'manea pentru Robert',
    intent: 'Caută o manea personalizată cu numele Robert — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-tudor',
    category: 'nume',
    primaryKeyword: 'manea pentru Tudor',
    intent: 'Caută o manea personalizată cu numele Tudor — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-petre',
    category: 'nume',
    primaryKeyword: 'manea pentru Petre',
    intent: 'Caută o manea personalizată cu numele Petre — pentru ziua lui, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-maria',
    category: 'nume',
    primaryKeyword: 'manea pentru Maria',
    intent: 'Caută o manea personalizată cu numele Maria — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-ioana',
    category: 'nume',
    primaryKeyword: 'manea pentru Ioana',
    intent: 'Caută o manea personalizată cu numele Ioana — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-andreea',
    category: 'nume',
    primaryKeyword: 'manea pentru Andreea',
    intent: 'Caută o manea personalizată cu numele Andreea — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-alexandra',
    category: 'nume',
    primaryKeyword: 'manea pentru Alexandra',
    intent: 'Caută o manea personalizată cu numele Alexandra — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-mihaela',
    category: 'nume',
    primaryKeyword: 'manea pentru Mihaela',
    intent: 'Caută o manea personalizată cu numele Mihaela — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-elena',
    category: 'nume',
    primaryKeyword: 'manea pentru Elena',
    intent: 'Caută o manea personalizată cu numele Elena — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-georgiana',
    category: 'nume',
    primaryKeyword: 'manea pentru Georgiana',
    intent: 'Caută o manea personalizată cu numele Georgiana — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-cristina',
    category: 'nume',
    primaryKeyword: 'manea pentru Cristina',
    intent: 'Caută o manea personalizată cu numele Cristina — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-daniela',
    category: 'nume',
    primaryKeyword: 'manea pentru Daniela',
    intent: 'Caută o manea personalizată cu numele Daniela — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-florentina',
    category: 'nume',
    primaryKeyword: 'manea pentru Florentina',
    intent: 'Caută o manea personalizată cu numele Florentina — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-gabriela',
    category: 'nume',
    primaryKeyword: 'manea pentru Gabriela',
    intent: 'Caută o manea personalizată cu numele Gabriela — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-mariana',
    category: 'nume',
    primaryKeyword: 'manea pentru Mariana',
    intent: 'Caută o manea personalizată cu numele Mariana — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-nicoleta',
    category: 'nume',
    primaryKeyword: 'manea pentru Nicoleta',
    intent: 'Caută o manea personalizată cu numele Nicoleta — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-ana',
    category: 'nume',
    primaryKeyword: 'manea pentru Ana',
    intent: 'Caută o manea personalizată cu numele Ana — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-stefania',
    category: 'nume',
    primaryKeyword: 'manea pentru Ștefania',
    intent: 'Caută o manea personalizată cu numele Ștefania — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-adriana',
    category: 'nume',
    primaryKeyword: 'manea pentru Adriana',
    intent: 'Caută o manea personalizată cu numele Adriana — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-catalina',
    category: 'nume',
    primaryKeyword: 'manea pentru Cătălina',
    intent: 'Caută o manea personalizată cu numele Cătălina — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-denisa',
    category: 'nume',
    primaryKeyword: 'manea pentru Denisa',
    intent: 'Caută o manea personalizată cu numele Denisa — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-diana',
    category: 'nume',
    primaryKeyword: 'manea pentru Diana',
    intent: 'Caută o manea personalizată cu numele Diana — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-ionela',
    category: 'nume',
    primaryKeyword: 'manea pentru Ionela',
    intent: 'Caută o manea personalizată cu numele Ionela — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-loredana',
    category: 'nume',
    primaryKeyword: 'manea pentru Loredana',
    intent: 'Caută o manea personalizată cu numele Loredana — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-madalina',
    category: 'nume',
    primaryKeyword: 'manea pentru Mădălina',
    intent: 'Caută o manea personalizată cu numele Mădălina — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-monica',
    category: 'nume',
    primaryKeyword: 'manea pentru Monica',
    intent: 'Caută o manea personalizată cu numele Monica — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-raluca',
    category: 'nume',
    primaryKeyword: 'manea pentru Raluca',
    intent: 'Caută o manea personalizată cu numele Raluca — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-ramona',
    category: 'nume',
    primaryKeyword: 'manea pentru Ramona',
    intent: 'Caută o manea personalizată cu numele Ramona — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-roxana',
    category: 'nume',
    primaryKeyword: 'manea pentru Roxana',
    intent: 'Caută o manea personalizată cu numele Roxana — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-simona',
    category: 'nume',
    primaryKeyword: 'manea pentru Simona',
    intent: 'Caută o manea personalizată cu numele Simona — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-valentina',
    category: 'nume',
    primaryKeyword: 'manea pentru Valentina',
    intent: 'Caută o manea personalizată cu numele Valentina — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-bianca',
    category: 'nume',
    primaryKeyword: 'manea pentru Bianca',
    intent: 'Caută o manea personalizată cu numele Bianca — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
  },
  {
    slug: 'manea-pentru-oana',
    category: 'nume',
    primaryKeyword: 'manea pentru Oana',
    intent: 'Caută o manea personalizată cu numele Oana — pentru ziua ei, onomastică sau orice ocazie specială. Pe site-urile non-românești: dacă numele are echivalent local cunoscut, adaptează numele și conținutul la echivalentul local; altfel păstrează numele ca atare.',
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
