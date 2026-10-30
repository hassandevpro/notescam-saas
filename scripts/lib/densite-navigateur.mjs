// Pilote la recherche de densité (`src/lib/print/fitDensity.js`) depuis Node,
// sur une page Playwright, EXACTEMENT comme l'application le fait dans le
// navigateur : mesure en média `screen` avec la classe `.nc-mesure`, puis
// impression en média `print`.
//
// POURQUOI MESURER EN SCREEN ALORS QU'ON IMPRIME EN PRINT. Parce que c'est ce
// que fait l'application : une page web ne peut pas se mettre elle-même en
// média print — `window.print()` est le seul chemin, et il bloque. Mesurer ici
// en média print rendrait le banc PLUS FACILE que la réalité, et c'est
// exactement l'erreur qui a laissé passer le défaut des deux pages : le banc
// mesurait en print, l'application en screen, et personne ne voyait l'écart.
//
// La classe `.nc-mesure` donne à la feuille sa géométrie d'impression pendant
// la mesure (cf. `geometrieFeuille` dans printStyles.js). Si les deux
// géométries divergent, le comptage de pages du banc le dit aussitôt — c'est
// ainsi qu'on a trouvé les 8 px de `@media print { .apc-sheet { padding … } }`.

import {
  chercherDensite, chercherReliquat, hauteurVisee,
} from '../../src/lib/print/fitDensity.js';

// Sentinelle de rejeu : un symbole, pas une Error — une Error se confondrait
// avec une vraie panne du navigateur, et on avalerait le bug au lieu de le voir.
const ARRET = Symbol('mesure-manquante');

// Borne dure. Les deux recherches promettent au plus 18 et 11 mesures ;
// au-delà, c'est un défaut de la recherche, pas une page difficile.
const MAX_MESURES = 24;

/** Attend les polices et les images : sans elles, on mesure une autre page. */
export async function attendreRessources(page) {
  await page.evaluate(async () => {
    try { await document.fonts.ready; } catch { /* navigateur sans l'API */ }
    const img = [...document.images].filter((i) => !i.complete);
    await Promise.all(img.map((i) => new Promise((ok) => {
      i.addEventListener('load', ok, { once: true });
      i.addEventListener('error', ok, { once: true });
      setTimeout(ok, 3000);
    })));
  });
}

/**
 * Exécute une recherche SYNCHRONE de `fitDensity` avec une mesure ASYNCHRONE.
 *
 * Les deux recherches sont synchrones — c'est voulu : dans le navigateur la
 * mesure du DOM l'est aussi, et une recherche asynchrone laisserait la page
 * changer entre deux essais. Ici la mesure passe par Playwright, donc elle est
 * asynchrone. Plutôt que de réécrire les recherches (on testerait une copie, et
 * pas le code livré), on les REJOUE : chaque passe sert depuis le cache les
 * valeurs déjà mesurées et s'interrompt sur la première inconnue, qu'on mesure
 * avant de repasser. Les recherches étant des fonctions pures, chaque passe
 * redemande exactement la même suite : elle avance d'une mesure par passe, sans
 * jamais diverger.
 *
 * @param {(mesureSync:(x:number)=>number)=>object} chercher
 * @param {(x:number)=>Promise<number>} mesurer
 */
async function rejouer(chercher, mesurer) {
  const cache = new Map();
  let aMesurer = null;
  const mesureSync = (x) => {
    if (cache.has(x)) return cache.get(x);
    aMesurer = x;
    throw ARRET;
  };
  for (let passe = 0; passe <= MAX_MESURES; passe++) {
    try {
      return chercher(mesureSync);
    } catch (e) {
      if (e !== ARRET) throw e;
      cache.set(aMesurer, await mesurer(aMesurer));
    }
  }
  throw new Error(`recherche non convergée en ${MAX_MESURES} mesures`);
}

/**
 * Ajuste chaque feuille de la page, indépendamment, et rend le bilan.
 *
 * @param {import('playwright').Page} page
 * @param {{ contentW:number, contentHpx:number }} m  géométrie du profil
 * @returns {Promise<Array<{ index, d, hauteur, etat, remplissage, r }>>}
 */
export async function ajusterFeuilles(page, m, { iterations = 10 } = {}) {
  await attendreRessources(page);
  const combien = await page.evaluate(() => document.querySelectorAll('.bulletin-paper').length);
  const bilan = [];

  for (let i = 0; i < combien; i++) {
    // Une feuille = sa propre densité. Un export par lot mélange des élèves aux
    // carnets très différents ; les ajuster ensemble reviendrait à resserrer
    // toute la classe pour un seul carnet chargé.
    const mesurer = (vars) => page.evaluate(({ idx, w, d, reliquat }) => {
      const el = document.querySelectorAll('.bulletin-paper')[idx];
      const sauve = el.getAttribute('style') || '';
      if (d != null) el.style.setProperty('--nc-d', String(d));
      if (reliquat != null) el.style.setProperty('--nc-reliquat', `${reliquat}px`);
      el.classList.add('nc-mesure');
      el.style.setProperty('width', `${w}mm`, 'important');
      el.style.setProperty('max-width', 'none', 'important');
      el.style.setProperty('margin', '0', 'important');
      el.style.setProperty('box-shadow', 'none', 'important');
      el.style.setProperty('transform', 'none', 'important');
      const h = Math.max(el.scrollHeight, el.offsetHeight);
      el.classList.remove('nc-mesure');
      // On restaure le style d'origine, puis on repose les deux variables : le
      // reste de l'ajustement doit continuer de les voir.
      el.setAttribute('style', sauve);
      if (d != null) el.style.setProperty('--nc-d', String(d));
      if (reliquat != null) el.style.setProperty('--nc-reliquat', `${reliquat}px`);
      return h;
    }, { idx: i, w: m.contentW, ...vars });

    // IDEMPOTENCE : on repart de zéro, comme `ajusterDensite`.
    await page.evaluate((idx) => {
      const el = document.querySelectorAll('.bulletin-paper')[idx];
      el.style.removeProperty('--nc-d');
      el.style.removeProperty('--nc-reliquat');
    }, i);

    // MÊME CIBLE QUE L'APPLICATION, réserve comprise : un banc qui viserait
    // le bord exact validerait une page que l'imprimante de l'école coupe.
    const vise = hauteurVisee(m.contentHpx);
    const r = await rejouer(
      (mes) => chercherDensite(mes, { utilePx: vise, iterations }),
      (d) => mesurer({ d, reliquat: 0 }),
    );

    await page.evaluate(({ idx, d }) => {
      const el = document.querySelectorAll('.bulletin-paper')[idx];
      el.style.setProperty('--nc-d', String(d));
      el.setAttribute('data-nc-d', d.toFixed(3));
    }, { idx: i, d: r.d });

    if (r.etat === 'plancher') {
      await page.evaluate((idx) => document.querySelectorAll('.bulletin-paper')[idx]
        .setAttribute('data-nc-fit', 'flow'), i);
      bilan.push({ index: i, ...r, r: 0 });
      continue;
    }

    // La place qui reste va aux zones où l'on écrit.
    const q = await rejouer(
      (mes) => chercherReliquat(mes, { utilePx: vise, hauteur: r.hauteur }),
      (px) => mesurer({ d: r.d, reliquat: px }),
    );

    await page.evaluate(({ idx, px }) => {
      const el = document.querySelectorAll('.bulletin-paper')[idx];
      el.style.setProperty('--nc-reliquat', `${px}px`);
    }, { idx: i, px: q.r });

    bilan.push({
      index: i, ...r, r: q.r, hauteur: q.hauteur, remplissage: q.remplissage,
      mesures: r.mesures + q.mesures,
    });
  }
  return bilan;
}
