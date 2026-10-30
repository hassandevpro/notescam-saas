// ─────────────────────────────────────────────────────────────────────────────
// REMPLIR LA PAGE — DANS LES DEUX SENS, PAR LA MESURE
// ─────────────────────────────────────────────────────────────────────────────
//
// ── CE QUI NE MARCHAIT PAS, ET POURQUOI ÇA REVENAIT ──────────────────────────
//
// Deux mécanismes se partageaient la hauteur du bulletin, et aucun ne REGARDAIT
// la page :
//
//   • `core/primCompactDensite.js` ESTIMAIT la hauteur à partir d'un barème de
//     coûts relevés une fois sur un jeu d'essai, puis distribuait le « mou » —
//     lignes plus hautes, case d'observations plus grande.
//   • `fitLiveSheets` mesurait la feuille EN MÉDIA SCREEN, puis appliquait le
//     facteur obtenu EN MÉDIA PRINT, où la feuille n'a ni le même rembourrage
//     (24/28 px contre 4/7 px) ni la même largeur.
//
// Relevé : 1098 px mesurés à l'écran pour 1044 px réellement imprimés — 5 %
// d'erreur. Une estimation calibrée sur une école sans logo ni cachet se trompe
// du même ordre dans l'autre sens. Et quelques millimètres suffisent : le bloc
// signatures porte `break-inside: avoid`, donc dès qu'il ne tient plus
// ENTIÈREMENT dans ce qui reste, il part EN ENTIER sur la page suivante. D'où
// le symptôme rapporté par l'école — page 1 vide aux trois quarts, signatures
// seules en page 2 — qui ressemblait à un débordement sans en être un.
//
// C'est pour cela que le défaut revenait à chaque correctif : on réglait le
// barème, jamais la boucle.
//
// ── CE QUE FAIT CE MODULE ────────────────────────────────────────────────────
//
// Une seule variable CSS, `--nc-d` (0 = plancher de lisibilité, 1 = plafond
// esthétique), pilote par `calc()` tout ce qui occupe de la hauteur : corps du
// tableau, interlignes, rembourrage des cellules, logo, cachet, zones libres.
// On ne l'estime pas : on la CHERCHE par dichotomie, en mesurant la feuille à
// chaque pas, jusqu'à la plus grande densité qui tient encore dans la page.
//
// Garantie tenue par `chercherDensite` et vérifiée par son test : la valeur
// rendue ne déborde JAMAIS — si la dichotomie s'arrête sur une valeur qui
// dépasse (le texte ne se reflue pas toujours de façon monotone), on redescend
// jusqu'à ce que la mesure confirme.
//
// Fonction PURE pour la recherche : elle reçoit une fonction de mesure, donc
// elle se teste sous Node sans DOM. Le pilotage du DOM est en dessous.

import { pageMetrics, DEFAULT_PROFILE, PX_PER_MM } from './printStyles.js';
// LE SECOND FILET, QUAND LA DENSITÉ A DONNÉ TOUT CE QU'ELLE AVAIT.
// `facteurFit` et `--nc-fit` ne sont pas nouveaux : c'est la réduction `zoom`
// que TOUS les autres modèles de bulletin utilisent déjà, avec son plancher de
// lisibilité. Le carnet en était le seul exclu. Voir `fitLiveSheets.js`, et
// surtout son avertissement : `zoom` et non `transform`, parce que Chrome
// pagine sur la boîte de mise en page, pas sur ce qui est peint.
import { facteurFit, FIT_VAR } from './fitLiveSheets.js';

/** Bornes de la densité. 0 = plancher de lisibilité, 1 = plafond esthétique. */
export const D_MIN = 0;
export const D_MAX = 1;

/** Variable CSS lue par la feuille de style. */
export const VAR_D = '--nc-d';

/**
 * Variable CSS du RELIQUAT : les pixels qui restent quand même le plafond de
 * densité ne remplit pas la page. Un carnet de quatre compétences au plafond
 * fait 874 px pour 1062 disponibles — 188 px, soit 5 cm de feuille blanche.
 *
 * Ce reliquat ne va PAS dans la police : à 10 pt le carnet est déjà au plafond
 * de ce qu'un cadre officiel supporte. Il va aux ZONES OÙ L'ON ÉCRIT — case
 * d'observations du titulaire (60 %) et cadres de signature (40 %), cf.
 * `densiteCss` dans printStyles.js. Une case d'observations haute n'est pas du
 * vide : c'est la place que l'école réclamait.
 */
export const VAR_RELIQUAT = '--nc-reliquat';

/** Classe posée le temps de la mesure : elle donne à la feuille sa géométrie
 *  d'IMPRESSION alors que le document est encore en média `screen`. */
export const CLASSE_MESURE = 'nc-mesure';

/**
 * Taux de remplissage visé. On ne cherche pas 100 % : la dernière fraction de
 * millimètre se perd en arrondis sous-pixel, et un bulletin qui vise le bord
 * exact finit par le franchir sur une machine un peu différente.
 */
export const CIBLE_MIN = 0.97;

/**
 * RÉSERVE DE SÉCURITÉ, en millimètres, retranchée de la hauteur utile avant de
 * chercher la densité.
 *
 * POURQUOI ELLE EXISTE — mesuré sur un bulletin réel de l'école, comparé au
 * même bulletin produit par le banc :
 *
 *   banc   : premier texte à 11,1 mm, dernier à 287,1 mm  → 1 page
 *   école  : premier texte à 15,5 mm, dernier à 256,0 mm  → 2 pages
 *
 * Même contenu, même densité trouvée (8,77 pt contre 8,81 pt). Mais la page
 * de l'école est décalée de 4,4 mm vers le bas, et le banc ne laissait que
 * 1,9 mm sous le dernier trait (287,1 mm pour une limite à 289 mm). Les 4,4 mm
 * ont mangé les 1,9 mm : le bloc signatures, solidaire par `break-inside:
 * avoid`, est parti EN ENTIER sur une 2e page — en laissant 23 mm de blanc.
 *
 * Viser le bord exact revient à parier que la page imprimée est au millimètre
 * celle qu'on a modélisée. Elle ne l'est jamais tout à fait : marge matérielle
 * de l'imprimante, réglage du dialogue, arrondi du pilote. On garde donc une
 * bande au bas de la feuille. 5 mm coûtent environ une ligne de tableau et
 * suppriment la classe entière de ces accidents.
 */
export const RESERVE_MM = 5;

/** La hauteur que la recherche doit réellement viser, réserve déduite. */
export function hauteurVisee(contentHpx) {
  return Math.max(1, contentHpx - RESERVE_MM * PX_PER_MM);
}

/**
 * Cherche la plus grande densité qui tient dans la page.
 *
 * @param {(d:number)=>number} mesurer  rend la hauteur de la feuille, en px,
 *                                      pour la densité `d`
 * @param {object} o
 * @param {number} o.utilePx            hauteur utile d'une page, en px
 * @param {number} [o.iterations=10]    pas de dichotomie
 * @returns {{ d:number, hauteur:number, etat:'plafond'|'ajuste'|'plancher',
 *             remplissage:number, mesures:number }}
 *   `etat` vaut 'plancher' quand MÊME à la densité minimale la feuille
 *   déborde : l'appelant doit alors prévenir, pas écraser le texte.
 */
export function chercherDensite(mesurer, { utilePx, iterations = 10 } = {}) {
  let mesures = 0;
  const h = (d) => { mesures++; return mesurer(d); };

  const fin = (d, hauteur, etat) => ({
    d, hauteur, etat, remplissage: hauteur / utilePx, mesures,
  });

  if (!Number.isFinite(utilePx) || utilePx <= 0) return fin(D_MAX, 0, 'plafond');

  // Le plafond tient-il ? C'est le cas le plus fréquent — un bulletin court.
  const hMax = h(D_MAX);
  if (hMax <= utilePx) return fin(D_MAX, hMax, 'plafond');

  // Le plancher lui-même déborde ? On ne descend pas plus bas : en dessous le
  // bulletin cesse d'être lisible, et un bulletin illisible coûte plus cher
  // qu'un bulletin sur deux pages.
  const hMin = h(D_MIN);
  if (hMin > utilePx) return fin(D_MIN, hMin, 'plancher');

  // Dichotomie : `bas` tient toujours, `haut` ne tient jamais.
  let bas = D_MIN;
  let hautExclu = D_MAX;
  let hBas = hMin;
  for (let i = 0; i < iterations; i++) {
    const milieu = (bas + hautExclu) / 2;
    const hm = h(milieu);
    if (hm <= utilePx) { bas = milieu; hBas = hm; } else { hautExclu = milieu; }
  }

  // VÉRIFICATION FINALE. La hauteur n'est pas strictement monotone en `d` : un
  // mot qui repasse à la ligne peut faire remonter la feuille d'un cran. On
  // re-mesure donc, et on redescend tant que ça dépasse — l'invariant « ne
  // déborde jamais » prime sur le remplissage.
  let d = bas;
  let hauteur = hBas;
  for (let i = 0; i < 6 && hauteur > utilePx && d > D_MIN; i++) {
    d = Math.max(D_MIN, d - (D_MAX - D_MIN) / 20);
    hauteur = h(d);
  }
  if (hauteur > utilePx) return fin(D_MIN, h(D_MIN), 'plancher');
  return fin(d, hauteur, 'ajuste');
}

/**
 * Cherche le plus grand reliquat que les zones libres peuvent absorber sans
 * faire déborder la page.
 *
 * POURQUOI CHERCHER, puisqu'on connaît la place restante ? Parce que les zones
 * libres ne la rendent pas au pixel : la case d'observations est une cellule de
 * tableau, et un tableau arrondit ; agrandir un cadre de signature peut faire
 * repasser son intitulé à la ligne. Poser la place restante « au calcul » et
 * s'en aller, c'est exactement l'erreur que ce module remplace.
 *
 * Le cas courant coûte UNE mesure : on tente la place restante entière, et neuf
 * fois sur dix elle passe.
 *
 * @param {(r:number)=>number} mesurer  hauteur de la feuille pour un reliquat
 *                                      de `r` px
 * @param {object} o
 * @param {number} o.utilePx            hauteur utile d'une page, en px
 * @param {number} o.hauteur            hauteur mesurée AVANT reliquat
 * @param {number} [o.iterations=6]
 * @returns {{ r:number, hauteur:number, remplissage:number, mesures:number }}
 */
export function chercherReliquat(mesurer, { utilePx, hauteur, iterations = 6 } = {}) {
  let mesures = 0;
  const h = (r) => { mesures++; return mesurer(r); };
  const fin = (r, haut) => ({ r, hauteur: haut, remplissage: haut / utilePx, mesures });

  if (!Number.isFinite(utilePx) || utilePx <= 0 || !Number.isFinite(hauteur)) {
    return fin(0, hauteur);
  }
  const place = utilePx - hauteur;
  // Moins de deux pixels à distribuer : on ne touche à rien. Agrandir une case
  // d'un pixel ne se voit pas et peut faire basculer un arrondi.
  if (place < 2) return fin(0, hauteur);

  // Le cas courant : tout passe.
  const hTout = h(place);
  if (hTout <= utilePx) return fin(place, hTout);

  // Sinon, dichotomie : `bas` tient toujours, `hautExclu` ne tient jamais.
  let bas = 0;
  let hautExclu = place;
  let hBas = hauteur;
  for (let i = 0; i < iterations; i++) {
    const milieu = (bas + hautExclu) / 2;
    const hm = h(milieu);
    if (hm <= utilePx) { bas = milieu; hBas = hm; } else { hautExclu = milieu; }
  }

  // Même garantie que pour la densité : on re-descend tant que ça dépasse. La
  // hauteur n'est pas monotone en `r` non plus.
  let r = bas;
  let haut = hBas;
  for (let i = 0; i < 4 && haut > utilePx && r > 0; i++) {
    r = Math.max(0, r - place / 20);
    haut = h(r);
  }
  if (haut > utilePx) return fin(0, h(0));
  return fin(r, haut);
}

// ── Pilotage du DOM ──────────────────────────────────────────────────────────

/**
 * Mesure une feuille DANS LA GÉOMÉTRIE D'IMPRESSION, en posant `CLASSE_MESURE`.
 *
 * POURQUOI UNE CLASSE ET NON UN `emulateMedia`. Une page web ne peut pas se
 * mettre elle-même en média `print` : `window.print()` est le seul chemin, et
 * il est bloquant. La feuille de style émet donc la géométrie d'impression
 * DEUX FOIS — sous `@media print` et sous `.nc-mesure` — à partir du même
 * texte (voir `printStyles.js`), si bien qu'une mesure faite à l'écran décrit
 * exactement ce qui s'imprimera.
 */
function mesurerFeuille(el, contentWmm) {
  const sauve = {
    width: el.style.width, maxWidth: el.style.maxWidth,
    margin: el.style.margin, boxShadow: el.style.boxShadow,
    transform: el.style.transform,
  };
  el.classList.add(CLASSE_MESURE);
  el.style.setProperty('width', `${contentWmm}mm`, 'important');
  el.style.setProperty('max-width', 'none', 'important');
  el.style.setProperty('margin', '0', 'important');
  el.style.setProperty('box-shadow', 'none', 'important');
  el.style.setProperty('transform', 'none', 'important');
  // `scrollHeight` et non `offsetHeight` : la feuille porte `overflow:hidden`
  // une fois ajustée, et `offsetHeight` mentirait alors en rendant la hauteur
  // de la boîte au lieu de celle du contenu.
  const h = Math.max(el.scrollHeight, el.offsetHeight);
  el.classList.remove(CLASSE_MESURE);
  for (const [k, v] of Object.entries(sauve)) el.style[k] = v;
  return h;
}

/**
 * Ajuste toutes les feuilles du sélecteur, chacune INDÉPENDAMMENT (un élève =
 * sa propre densité), et rend le bilan.
 *
 * Idempotent : la variable est remise à zéro avant chaque recherche, donc deux
 * impressions successives ne cumulent rien.
 *
 * @returns {{ total, ajustees, debordantes, remplissageMin }}
 */
export function ajusterDensite(selector = '.bulletin-paper', profile = DEFAULT_PROFILE, opts = {}) {
  if (typeof document === 'undefined') {
    return { total: 0, ajustees: 0, debordantes: 0, remplissageMin: 1 };
  }
  const { contentW, contentHpx } = pageMetrics(profile);
  // On ne vise JAMAIS le bord exact de la page : voir RESERVE_MM.
  const vise = hauteurVisee(contentHpx);
  const feuilles = Array.from(document.querySelectorAll(selector));

  // ── POURQUOI CE MOTEUR NE DOIT JAMAIS ÉCHOUER EN SILENCE ────────────────
  //
  // Deux pannes donnent le MÊME symptôme qu'avant le correctif — un bulletin
  // sur deux pages — sans rien signaler :
  //
  //   • aucune feuille ne porte la classe attendue (le gabarit n'a pas
  //     demandé `vars`, ou l'écran affiche un autre modèle) ;
  //   • la couche d'impression n'est pas dans le document, ou elle y est dans
  //     une version antérieure — typiquement un onglet laissé ouvert depuis
  //     avant la mise à jour, dont le <style id="nc-print-styles"> a été
  //     injecté une seule fois, au montage de l'écran.
  //
  // Dans les deux cas la recherche tournerait à vide et rendrait un bilan
  // parfaitement vert. On le DIT, dans la console, en nommant la cause.
  if (feuilles.length === 0) {
    console.warn(`[NotesCam/impression] aucune feuille « ${selector} » : `
      + `le contrat de densité n'est pas posé sur ce modèle de bulletin. `
      + `Rien n'a été ajusté.`);
    return { total: 0, ajustees: 0, debordantes: 0, remplissageMin: 1 };
  }
  // La variable est déclarée par `densiteCss` (printStyles.js). Si elle est
  // vide, le document ne porte pas la couche d'impression à jour : chercher
  // une densité ne changerait alors AUCUNE taille, et la feuille sortirait
  // telle quelle. Un rechargement complet de la page la repose.
  if (!getComputedStyle(feuilles[0]).getPropertyValue('--nc-body').trim()) {
    console.warn(`[NotesCam/impression] le contrat de densité (--nc-body) est `
      + `absent du document : la couche d'impression n'est pas à jour. `
      + `Rechargez la page (Ctrl+Shift+R). Rien n'a été ajusté.`);
    return { total: feuilles.length, ajustees: 0, debordantes: 0, remplissageMin: 1 };
  }
  let ajustees = 0;
  let debordantes = 0;
  let remplissageMin = 1;
  // Une ligne par feuille : densite trouvee, hauteur obtenue, reliquat pose.
  // Sert au relevé d'impression (voir Bulletins.jsx, ?ncdebug=1).
  const details = [];

  for (const el of feuilles) {
    // IDEMPOTENCE : on repart de zéro, sinon la deuxième impression mesurerait
    // une feuille déjà élargie par le reliquat de la première.
    el.style.removeProperty(VAR_D);
    el.style.removeProperty(VAR_RELIQUAT);
    // La réduction `zoom` se purge AUSSI, sinon une feuille redevenue courte
    // — l'école retire une matière, puis réimprime — garderait le facteur de
    // la fois d'avant et sortirait rétrécie sans raison.
    el.style.removeProperty(FIT_VAR);
    el.removeAttribute('data-nc-d');
    el.removeAttribute('data-nc-fit');

    const r = chercherDensite((d) => {
      el.style.setProperty(VAR_D, String(d));
      return mesurerFeuille(el, contentW);
    }, { utilePx: vise, iterations: opts.iterations ?? 10 });

    el.style.setProperty(VAR_D, String(r.d));
    el.setAttribute('data-nc-d', r.d.toFixed(3));
    if (r.etat === 'plancher') {
      // ── LE BLOC SIGNATURES NE DOIT PAS PARTIR SEUL SUR UNE 2e PAGE ──────
      //
      // CE QU'ON VOYAIT. Au plancher de densité (corps à 7 pt), une feuille
      // peut rester un peu plus haute que la page : 1 084 px mesurés pour
      // 1 043 px utiles sur une classe bilingue — 4 % de trop. Le bloc
      // signatures est pourtant COLLÉ au reste (écart mesuré : 0 px entre son
      // bas et le bas de la feuille) ; c'est la feuille entière qui dépasse, et
      // Chrome coupe donc juste au-dessus de lui. Le parent reçoit une seconde
      // page portant la seule barre « Visa du Parent · L'Enseignant(e) ·
      // Le Directeur ».
      //
      // CE QU'ON FAIT. On applique la réduction `zoom` que tous les autres
      // modèles utilisent déjà, par-dessus la densité au plancher, et avec SON
      // plancher de lisibilité (`MIN_FIT_SCALE`). Le carnet en était le seul
      // exclu : il n'avait qu'un filet, les autres en avaient un aussi.
      //
      // On vise `vise` et non la hauteur utile brute : la réserve de
      // `RESERVE_MM` existe parce que viser le bord exact de la page rend
      // encore deux pages (sous-pixels, arrondis d'imprimante). La même
      // prudence vaut ici.
      const s = facteurFit(r.hauteur, vise);
      if (s != null) {
        el.style.setProperty(FIT_VAR, String(s));
        el.setAttribute('data-nc-fit', String(s));
        ajustees++;
        details.push({ d: r.d, h: Math.round(r.hauteur), r: 0, etat: `${r.etat}+fit${s}` });
        continue;
      }
      // TROP LONGUE POUR ÊTRE RÉDUITE SANS DEVENIR ILLISIBLE (sous
      // `MIN_FIT_SCALE`). On ne tronque pas et on n'écrase pas : la feuille
      // reprend un débordement visible, le bloc signatures restant solidaire.
      // L'appelant doit le DIRE à l'utilisateur — c'est la règle du dépôt,
      // avertir plutôt qu'écraser.
      debordantes++;
      el.setAttribute('data-nc-fit', 'flow');
      details.push({ d: r.d, h: Math.round(r.hauteur), r: 0, etat: r.etat });
      continue;
    }

    // LA PLACE QUI RESTE VA AUX ZONES OÙ L'ON ÉCRIT. Au plafond de densité, un
    // carnet court laisse jusqu'à 5 cm de blanc en bas de feuille ; on les
    // donne à la case d'observations et aux cadres de signature.
    const q = chercherReliquat((px) => {
      el.style.setProperty(VAR_RELIQUAT, `${px}px`);
      return mesurerFeuille(el, contentW);
    }, { utilePx: vise, hauteur: r.hauteur });

    el.style.setProperty(VAR_RELIQUAT, `${q.r}px`);
    ajustees++;
    remplissageMin = Math.min(remplissageMin, q.remplissage);
    details.push({ d: r.d, h: Math.round(q.hauteur), r: Math.round(q.r), etat: r.etat });
  }
  return {
    total: feuilles.length, ajustees, debordantes, remplissageMin,
    vise: Math.round(vise), utile: Math.round(contentHpx), details,
  };
}

/** Retire tout ajustement posé par `ajusterDensite`. */
export function reinitialiserDensite(selector = '.bulletin-paper') {
  if (typeof document === 'undefined') return;
  for (const el of document.querySelectorAll(selector)) {
    el.style.removeProperty(VAR_D);
    el.style.removeProperty(VAR_RELIQUAT);
    el.style.removeProperty(FIT_VAR);
    el.removeAttribute('data-nc-d');
    el.removeAttribute('data-nc-fit');
    el.classList.remove(CLASSE_MESURE);
  }
}

/**
 * Attend que les POLICES et les IMAGES soient chargées avant de mesurer.
 *
 * Mesurer avant que la police du bulletin soit disponible donne les métriques
 * de la police de repli : le texte se replace ensuite, et la feuille mesurée ne
 * ressemble plus à celle qui s'imprime. Même chose pour le logo et le cachet,
 * dont la hauteur n'est connue qu'une fois l'image décodée.
 */
export async function attendreRessources(racine = document) {
  if (typeof document === 'undefined') return;
  try { await document.fonts.ready; } catch { /* navigateur sans l'API */ }
  const images = Array.from(racine.querySelectorAll('img')).filter((i) => !i.complete);
  if (images.length === 0) return;
  await Promise.all(images.map((img) => new Promise((resolve) => {
    const fini = () => resolve();
    img.addEventListener('load', fini, { once: true });
    img.addEventListener('error', fini, { once: true });
    // Filet : une image qui ne répond pas ne doit pas bloquer une impression.
    setTimeout(fini, 3000);
  })));
}
