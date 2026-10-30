// ─────────────────────────────────────────────────────────────────────────────
// SOCLE D'IMPRESSION — géométrie de page et CSS. SOURCE UNIQUE DE VÉRITÉ.
// ─────────────────────────────────────────────────────────────────────────────
// Tout document imprimable de NotesCam (relevé, bulletin, procès-verbal,
// certificat, palmarès, tableau d'honneur, pièce administrative) décrit sa page
// ICI et nulle part ailleurs. Aucun générateur ne redéclare @page, ni les règles
// de saut, ni la stratégie de couleur : des règles dispersées finissent toujours
// par se contredire (c'était le cas avant ce module).
//
// PRINCIPE DIRECTEUR — LA MARGE APPARTIENT À @page.
// Un `padding` sur la feuille ne produit une marge que sur la PREMIÈRE page :
// dès qu'un document déborde, la page suivante démarre à 0 mm, dans la zone
// non imprimable des imprimantes (4 à 6 mm). La marge est donc portée par
// `@page`, et la feuille perd son padding à l'impression. À l'écran, la feuille
// garde ce padding pour ressembler à une vraie page : même mesure de texte,
// mêmes retours à la ligne, donc APERÇU = IMPRESSION.
//
// Unités : tout est déclaré en mm (l'unité du papier) ; les conversions en px
// (96 ppp, l'unité de mesure du navigateur) servent aux calculs de pagination.

/** 1 mm en pixels CSS (96 ppp). */
export const PX_PER_MM = 96 / 25.4; // 3,779527…

export const mmToPx = (mm) => mm * PX_PER_MM;
export const pxToMm = (px) => px / PX_PER_MM;

/** Formats papier, en mm. */
export const PAPER = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
};

// ── Profils de page ──────────────────────────────────────────────────────────
// Un profil = format + orientation + marge. C'est le seul vocabulaire que les
// générateurs manipulent : `sheetOpen({ profile: 'standard' })`.
//
//   standard  A4 portrait 12 mm — relevés, certificats, palmarès, attestations
//   large     A4 paysage   8 mm — procès-verbaux, tableaux larges
//   dense     A4 portrait  8 mm — documents à forte densité (listes, paie)
//   bulletin  A4 portrait  8 mm — bulletins (auto-fit : chaque mm compte)
//   compact   A5 portrait 10 mm — convocations, autorisations de sortie
//
// La marge de 12 mm n'est pas arbitraire : elle couvre la zone non imprimable
// de toutes les imprimantes jet d'encre et laser d'entrée de gamme (4 à 6 mm),
// avec la réserve nécessaire à une perforation ou une reliure légère.
//
// Les profils denses descendent à 8 mm — le minimum qui reste au-dessus de la
// zone non imprimable de toutes les imprimantes courantes. Le bulletin était
// auparavant à 6 mm : c'était SOUS ce seuil sur une partie du parc, et le bas
// de bulletin (signatures) pouvait s'y perdre. Les 4 mm de hauteur utile rendus
// (1,4 %) sont absorbés par le moteur d'auto-fit.
export const PAGE_PROFILES = {
  standard: { paper: 'A4', orientation: 'portrait',  margin: 12 },
  large:    { paper: 'A4', orientation: 'landscape', margin: 8 },
  dense:    { paper: 'A4', orientation: 'portrait',  margin: 8 },
  bulletin: { paper: 'A4', orientation: 'portrait',  margin: 8 },
  compact:  { paper: 'A5', orientation: 'portrait',  margin: 10 },
};

export const DEFAULT_PROFILE = 'standard';

/**
 * Géométrie complète d'un profil : page et zone imprimable, en mm et en px.
 * `contentH` est la hauteur utile d'UNE page — la base de tout calcul de
 * pagination, à l'aperçu comme dans les tests.
 */
export function pageMetrics(profile = DEFAULT_PROFILE) {
  const p = PAGE_PROFILES[profile] || PAGE_PROFILES[DEFAULT_PROFILE];
  const paper = PAPER[p.paper] || PAPER.A4;
  const landscape = p.orientation === 'landscape';
  const pageW = landscape ? paper.h : paper.w;
  const pageH = landscape ? paper.w : paper.h;
  const contentW = pageW - 2 * p.margin;
  const contentH = pageH - 2 * p.margin;
  return {
    profile, paper: p.paper, orientation: p.orientation, margin: p.margin,
    pageW, pageH, contentW, contentH,
    pageWpx: mmToPx(pageW), pageHpx: mmToPx(pageH),
    contentWpx: mmToPx(contentW), contentHpx: mmToPx(contentH),
    cssSize: `${p.paper} ${p.orientation}`,
  };
}

// ── Contrat de classes ───────────────────────────────────────────────────────
// Les générateurs n'écrivent QUE ces classes ; le CSS ci-dessous s'occupe du
// reste. Aucune règle d'impression en style inline : un style inline gagne
// toujours contre la feuille de style et rendrait ce socle inopérant.
export const CLASS = {
  sheet:   'nc-sheet',        // un document = une feuille (démarre sur une page neuve)
  flow:    'nc-flow',         // contenu qui a le droit de couler sur plusieurs pages
  keep:    'nc-keep',         // bloc solidaire : ne doit jamais être coupé
  keepRow: 'nc-keep-row',     // ligne de tableau solidaire
  breakBefore: 'nc-break-before',
  breakAfter:  'nc-break-after',
  footer:  'nc-footer',       // pied de document (fin de la dernière page)
  ink:     'nc-ink',          // aplat de couleur : doit sortir à l'encre
};

/**
 * CSS d'impression partagé.
 *
 * @param {object}  o
 * @param {string}  [o.profile]      profil de page (voir PAGE_PROFILES)
 * @param {boolean} [o.screen=true]  inclure les règles d'aperçu écran
 *                                   (fenêtre d'impression, panneau d'aperçu)
 * @param {boolean} [o.page=true]    émettre la règle @page. À DÉSACTIVER quand
 *                                   on injecte ce CSS dans l'application : les
 *                                   bulletins y déclarent déjà leur propre
 *                                   géométrie (marge 6 mm, auto-fit) et deux
 *                                   règles @page se contrediraient.
 * @param {string}  [o.scope='']     préfixe de portée — l'application injecte
 *                                   ce CSS dans SA page, il ne doit alors pas
 *                                   déborder sur l'interface.
 */
/**
 * LA GÉOMÉTRIE D'IMPRESSION DE LA FEUILLE DE BULLETIN, ÉCRITE UNE FOIS.
 *
 * Elle est émise DEUX FOIS à partir de ce même texte : sous `@media print`,
 * et sous la classe `.nc-mesure` que `lib/print/fitDensity.js` pose le temps
 * de mesurer. Sans cela, l'ajustement mesure une feuille — celle de l'écran,
 * rembourrage 24/28 px et largeur max 820 px — et en imprime une autre —
 * rembourrage 4/7 px, largeur de la zone imprimable. Relevé : 1098 px mesurés
 * pour 1044 px imprimés, 5 % d'erreur, dans le sens qui veut. Quelques
 * millimètres suffisent à expédier le bloc signatures sur une deuxième page,
 * puisqu'il est solidaire (break-inside: avoid) : il part alors EN ENTIER, en
 * laissant la première page vide aux trois quarts.
 *
 * @param {string} sel  sélecteur de la feuille, portée comprise
 */
function geometrieFeuille(sel, m) {
  return `
    ${sel} {
      box-sizing: border-box;
      width: ${m.contentW}mm;
      max-width: none;
      margin: 0;
      padding: 0;
      box-shadow: none;
      border-radius: 0;
      background: #fff;
    }`;
}

/**
 * LE CONTRAT DE DENSITÉ — une seule variable, `--nc-d`, de 0 à 1.
 *
 * 0 = plancher de LISIBILITÉ (corps à 7 pt) ; 1 = plafond ESTHÉTIQUE (corps à
 * 10 pt, lignes hautes, zones libres généreuses). Tout ce qui occupe de la
 * hauteur en dérive par `calc()` : le gabarit n'a plus de taille écrite en
 * dur, et `fitDensity` n'a plus qu'un seul bouton à tourner.
 *
 * Défaut : 1. Une feuille sur laquelle personne n'a lancé la recherche garde
 * donc la mise en page la plus aérée — jamais une version resserrée par
 * accident.
 *
 * `--nc-reliquat` reçoit, APRÈS convergence, les pixels qui restent. Ils vont
 * aux zones où quelqu'un ÉCRIT — observations du titulaire, cadres de
 * signature — jamais au décor : c'est ce qui fait qu'un bulletin de quatre
 * compétences remplit sa page au lieu de flotter en haut d'un grand vide.
 */
export const DENSITE = {
  bodyMin: 7,    bodyMax: 10,    // pt — corps du tableau
  headMin: 8,    headMax: 11,    // pt — en-têtes
  smallMin: 6.5, smallMax: 9,    // pt — mentions, légendes
  padMin: 0,     padMax: 5,      // px — rembourrage vertical d'une cellule
  gapMin: 1,     gapMax: 6,      // px — interstice entre deux blocs
  logoMin: 30,   logoMax: 62,    // px
  stampMin: 32,  stampMax: 56,   // px
  signMin: 46,   signMax: 98,    // px — hauteur d'un cadre de signature
  observMin: 14, observMax: 52,  // px — case d'observations, hors reliquat
};

function densiteCss(sel) {
  const d = DENSITE;
  const entre = (min, max, u) => `calc(${min}${u} + var(--nc-d) * ${+(max - min).toFixed(3)}${u})`;
  return `
    ${sel} {
      --nc-d: 1;
      --nc-reliquat: 0px;
      --nc-body:   ${entre(d.bodyMin, d.bodyMax, 'pt')};
      --nc-head:   ${entre(d.headMin, d.headMax, 'pt')};
      --nc-small:  ${entre(d.smallMin, d.smallMax, 'pt')};
      --nc-pad-v:  ${entre(d.padMin, d.padMax, 'px')};
      --nc-gap:    ${entre(d.gapMin, d.gapMax, 'px')};
      --nc-logo:   ${entre(d.logoMin, d.logoMax, 'px')};
      --nc-stamp:  ${entre(d.stampMin, d.stampMax, 'px')};
      --nc-sign:   calc(${entre(d.signMin, d.signMax, 'px')} + var(--nc-reliquat) * 0.4);
      --nc-observ: calc(${entre(d.observMin, d.observMax, 'px')} + var(--nc-reliquat) * 0.6);
    }`;
}

export function printCss({ profile = DEFAULT_PROFILE, screen = true, page = true, scope = '' } = {}) {
  const m = pageMetrics(profile);
  const S = scope ? `${scope} ` : '';

  const screenCss = screen ? `
  /* ── Aperçu écran : la feuille imite la page, marge comprise ────────────── */
  ${S}.${CLASS.sheet} {
    width: ${m.pageW}mm;
    min-height: ${m.pageH}mm;
    padding: ${m.margin}mm;
    margin: 0 auto;
    background: #fff;
    box-sizing: border-box;
  }
  @media screen {
    body.nc-print-body { background: #f1f5f9; }
    body.nc-print-body .${CLASS.sheet} { box-shadow: 0 1px 6px rgba(0,0,0,.12); margin: 8mm auto; }
  }` : '';

  return `
  /* ═══ SOCLE D'IMPRESSION NOTESCAM — profil « ${profile} » (${m.cssSize}, marge ${m.margin} mm) ═══ */
  ${S}* { box-sizing: border-box; }

  /* Le contrat de densité vaut à l'écran COMME à l'impression : l'aperçu doit
     montrer la mise en page qui sortira, sinon on valide autre chose que ce
     qu'on imprime. */
  ${densiteCss(`${S}.bulletin-paper`)}

  /* LA BOÎTE DE LA FEUILLE APPARTIENT ICI, ET NULLE PART AILLEURS.
     « bulletin.css » compacte historiquement le carnet APC à l'impression avec
     « @media print { .apc-sheet { padding: 4px 7px !important } } ». Cette
     règle ne vaut QU'en média print : la feuille y devenait 8 px plus haute et
     son contenu 14 px plus étroit qu'à l'écran, là où l'ajustement la mesure.
     Mesurer 1090 px et imprimer 1098 px, c'est imprimer une 2e page.
     Une feuille qui déclare « nc-densite » annule donc ce compactage : son
     rembourrage vient de « --nc-pad-v », cherché par la mesure. Les gabarits
     qui ne le déclarent pas ne sont pas touchés. */
  ${S}.bulletin-paper.nc-densite { padding: 0 !important; }

  /* La géométrie d'IMPRESSION, hors média, sous la classe de mesure. */
  ${geometrieFeuille(`${S}.bulletin-paper.nc-mesure`, m)}

  ${screenCss}

  @media print {
    /* … et la même, pour de vrai. */
    ${geometrieFeuille(`${S}.bulletin-paper`, m)}

    /* 1. Géométrie — la marge appartient à la page, pas à la feuille. */
    ${page ? `@page { size: ${m.cssSize}; margin: ${m.margin}mm; }` : '/* @page : laissé au document hôte */'}

    ${S}html, ${S}body { background: #fff; margin: 0; padding: 0; }

    /* 2. Couleur — Chrome n'imprime PAS les aplats sans cette déclaration ;
          un bandeau institutionnel sortirait blanc et son texte blanc en gris.
          La propriété est héritée, mais on la pose aussi sur « body * » : les
          documents rendus DANS l'application (bulletins) ne sont pas dans une
          feuille .nc-sheet, et un document officiel ne doit pas dépendre d'une
          subtilité d'héritage pour sortir en couleur. */
    ${S}html, ${S}body, ${S}body *, ${S}.${CLASS.sheet}, ${S}.${CLASS.sheet} *,
    ${S}.${CLASS.ink}, ${S}.${CLASS.ink} * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }

    /* 3. La feuille rend sa marge à @page et démarre sur une page neuve. */
    ${S}.${CLASS.sheet} {
      width: auto !important;
      max-width: none !important;
      min-height: 0 !important;
      height: auto !important;
      padding: 0 !important;
      margin: 0 !important;
      box-shadow: none !important;
      background: #fff;
      break-after: page;
      page-break-after: always;
    }
    /* Pas de page blanche finale : la dernière feuille ne force pas de saut. */
    ${S}.${CLASS.sheet}:last-child,
    ${S}.${CLASS.sheet}:last-of-type {
      break-after: auto;
      page-break-after: auto;
    }

    /* 4. Blocs solidaires — signature, cachet, QR, vérification, pied. */
    ${S}.${CLASS.keep}, ${S}.${CLASS.footer} {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
    ${S}.${CLASS.breakBefore} { break-before: page; page-break-before: always; }
    ${S}.${CLASS.breakAfter}  { break-after: page;  page-break-after: always; }

    /* 5. Tableaux — en-têtes répétés sur chaque page, lignes jamais coupées. */
    ${S}thead { display: table-header-group; }
    ${S}tfoot { display: table-footer-group; }
    ${S}tr, ${S}.${CLASS.keepRow} {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    ${S}table { border-collapse: collapse; }

    /* 6. Typographie — pas de titre orphelin en bas de page, pas de ligne seule. */
    ${S}h1, ${S}h2, ${S}h3, ${S}h4 { break-after: avoid; page-break-after: avoid; }
    ${S}p, ${S}li, ${S}td { orphans: 3; widows: 3; }
    ${S}img { break-inside: avoid; page-break-inside: avoid; max-width: 100%; }

    /* 7. Rien ne doit sortir de la zone imprimable par la droite. */
    ${S}.${CLASS.sheet} { overflow: visible; }
    ${S}.nc-scroll { overflow: visible !important; }
    ${S}.no-print { display: none !important; }
  }`;
}

/**
 * Injecte le CSS d'impression dans le document de l'APPLICATION (impression en
 * page : bulletins, conseil de classe, emploi du temps). Appelé une fois au
 * démarrage, comme installDocumentScaleVars — les documents rendus en React
 * héritent ainsi des mêmes règles que ceux rendus en chaîne HTML.
 *
 * `page` reste FAUX par défaut : l'application n'a pas de géométrie de page
 * globale, chaque écran imprimable déclare la sienne à l'affichage (voir
 * `usePrintProfile`). Émettre `@page` ici imposerait une marge à des écrans qui
 * n'en veulent pas.
 *
 * @param {string} profile
 * @param {{ page?: boolean }} [opts]
 */
export function installPrintStyles(profile = DEFAULT_PROFILE, { page = false } = {}) {
  if (typeof document === 'undefined') return;
  const id = 'nc-print-styles';
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('style');
    el.id = id;
  }
  el.dataset.profile = page ? profile : '';
  el.textContent = printCss({ profile, screen: false, page });
  // Toujours réinsérer EN FIN de <head>. Les feuilles de style des écrans sont
  // chargées à la volée (une route = un import CSS) et certaines déclarent leur
  // propre `@page` ; à spécificité égale, c'est la dernière règle du document
  // qui gagne. L'écran actif doit donc parler en dernier.
  document.head.appendChild(el);
}

/**
 * Déclare la géométrie de page d'un ÉCRAN imprimable (bulletins, conseil de
 * classe, emploi du temps) et la retire quand l'écran est quitté.
 *
 *   useEffect(() => setPrintProfile('bulletin'), []);
 *
 * Renvoie la fonction de nettoyage — utilisable telle quelle comme retour de
 * `useEffect`. Sans elle, la marge d'un écran resterait imposée aux suivants.
 */
export function setPrintProfile(profile) {
  installPrintStyles(profile, { page: true });
  return () => installPrintStyles(DEFAULT_PROFILE, { page: false });
}

export default printCss;
