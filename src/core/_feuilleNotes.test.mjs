// Tests du découpage de la FEUILLE DE NOTES à remplir à la main.
// `node src/core/_feuilleNotes.test.mjs`

import {
  construireFeuille, paginerGroupes, paginerEleves, totalBareme,
  COLONNES_PAR_PAGE, LIGNES_PAR_PAGE,
} from './feuilleNotes.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// Un groupe de n colonnes, nommé.
const G = (id, n, bareme = 5) => ({
  id,
  label: id.toUpperCase(),
  colonnes: Array.from({ length: n }, (_, i) => ({ id: `${id}_${i + 1}`, label: `c${i + 1}`, bareme })),
});
const eleves = (n) => Array.from({ length: n }, (_, i) => ({ id: `e${i + 1}`, numero: i + 1, nom: `Élève ${i + 1}` }));

// ── Découpe des colonnes ────────────────────────────────────────────────────
{
  // Quatre groupes de 5 colonnes, page à 16 : 3 groupes tiennent (15), le 4e passe.
  const pages = paginerGroupes([G('a', 5), G('b', 5), G('c', 5), G('d', 5)], 16);
  ok(pages.length === 2, 'quatre groupes de 5 colonnes → deux pages');
  ok(pages[0].length === 3 && pages[1].length === 1, '3 groupes sur la première page, 1 sur la seconde');
  ok(pages[0].every((g) => !g.deborde), 'aucun débordement signalé à tort');
}
{
  // UN GROUPE NE SE COUPE JAMAIS : 4 + 4 = 8 > 6, donc deux pages, pas une
  // page de 6 colonnes et une de 2.
  const pages = paginerGroupes([G('a', 4), G('b', 4)], 6);
  ok(pages.length === 2, 'un groupe qui ne rentre pas part sur la page suivante');
  ok(pages[0][0].colonnes.length === 4 && pages[1][0].colonnes.length === 4,
    'les deux groupes gardent leurs quatre colonnes (aucune coupure)');
}
{
  // Groupe plus large que la page : page à lui seul, débordement signalé.
  const pages = paginerGroupes([G('a', 2), G('geant', 9), G('b', 2)], 6);
  ok(pages.length === 3, 'un groupe géant s’isole sur sa propre page');
  ok(pages[1][0].deborde === true, 'le débordement est signalé, pas caché');
  ok(pages[1][0].colonnes.length === 9, 'le groupe géant garde toutes ses colonnes');
}
{
  ok(paginerGroupes([{ id: 'vide', label: 'V', colonnes: [] }], 16).length === 0,
    'un groupe sans colonne ne crée pas de page');
  ok(paginerGroupes([], 16).length === 0, 'aucun groupe → aucune page');
}

// ── Découpe des lignes ──────────────────────────────────────────────────────
{
  const pages = paginerEleves(eleves(57), 25);
  ok(pages.length === 3, '57 élèves à 25 par page → 3 pages');
  ok(pages[2].length === 7, 'la dernière page porte le reste (7)');
  ok(pages[1][0].numero === 26, 'les numéros de la liste de classe ne repartent pas de 1');
  ok(paginerEleves([], 25).length === 1, 'classe vide → une page (la grille reste imprimable)');
}

// ── Feuille complète ────────────────────────────────────────────────────────
{
  const f = construireFeuille({
    groupes: [G('a', 5), G('b', 5), G('c', 5), G('d', 5)],
    eleves: eleves(30),
    maxColonnes: 16,
    maxLignes: 25,
  });
  // 2 pages de colonnes × 2 tranches d'élèves = 4 pages.
  ok(f.pages.length === 4, 'deux découpes croisées → quatre pages');
  ok(f.pages[0].no === 1 && f.pages[3].no === 4 && f.pages[0].total === 4,
    'les pages sont numérotées « n sur total »');
  ok(f.pages[0].suite === false && f.pages[1].suite === true,
    'la deuxième tranche d’élèves est marquée « suite »');
  ok(f.pages[2].suite === false, 'le changement de colonnes repart d’une page pleine');
  ok(f.pages[0].colonnes.length === 15, 'la page porte les colonnes de ses trois groupes');
  ok(f.pages[0].colonnes[0].groupeLabel === 'A', 'chaque colonne sait de quel groupe elle vient');
}

// ── Vierge / remplie ────────────────────────────────────────────────────────
{
  const commun = { groupes: [G('a', 2)], eleves: eleves(3), valeur: () => '14' };

  const vierge = construireFeuille({ ...commun, vierge: true });
  ok(Object.keys(vierge.pages[0].lignes[0].cellules).length === 0,
    'feuille VIERGE : aucune note imprimée, même si la note existe');

  const remplie = construireFeuille({ ...commun, vierge: false });
  ok(remplie.pages[0].lignes[0].cellules.a_1 === '14',
    'feuille REMPLIE : la note saisie est imprimée');
  ok(remplie.pages[0].lignes[0].nom === 'Élève 1', 'le nom accompagne la note');

  // Sans lecteur de valeurs, on n'invente rien : la feuille sort vierge.
  const sansValeur = construireFeuille({ groupes: [G('a', 2)], eleves: eleves(1), vierge: false });
  ok(Object.keys(sansValeur.pages[0].lignes[0].cellules).length === 0,
    'pas de lecteur de valeurs → feuille vierge plutôt qu’inventée');
}

// ── Lignes vides de fin ─────────────────────────────────────────────────────
{
  const f = construireFeuille({
    groupes: [G('a', 2)], eleves: eleves(30), lignesVides: 3, maxLignes: 25,
  });
  ok(f.pages[0].lignes.length === 25, 'la première tranche n’est pas gonflée par les lignes vides');
  ok(f.pages[1].lignes.length === 5 + 3, 'les lignes vides s’ajoutent à la DERNIÈRE page');
  const derniere = f.pages[1].lignes[f.pages[1].lignes.length - 1];
  ok(derniere.vide === true && derniere.numero === '' && derniere.nom === '',
    'une ligne vide n’affirme ni numéro ni nom');
}
{
  // Classe vide + lignes vides : une feuille entièrement à écrire à la main.
  const f = construireFeuille({ groupes: [G('a', 3)], eleves: [], lignesVides: 10 });
  ok(f.pages.length === 1 && f.pages[0].lignes.length === 10,
    'classe vide : la feuille sort avec ses seules lignes à remplir');
}
{
  ok(construireFeuille({ groupes: [], eleves: eleves(5) }).pages.length === 0,
    'aucune colonne → aucune feuille (on n’imprime pas une page blanche)');
}

// ── Total des barèmes d'un groupe ───────────────────────────────────────────
{
  ok(totalBareme(G('a', 4, 5)) === 20, 'quatre épreuves sur 5 → total /20');
  ok(totalBareme({ colonnes: [{ bareme: 5 }, { bareme: null }] }) === null,
    'une colonne sans barème rend le total impossible, pas partiel');
  ok(totalBareme({ colonnes: [] }) === null, 'groupe sans colonne → pas de total');
  ok(totalBareme({ colonnes: [{ bareme: 5 }, { bareme: 15, calculee: true }] }) === 5,
    'une colonne calculée (le total lui-même) ne se compte pas deux fois');
}

// ── Défauts ─────────────────────────────────────────────────────────────────
{
  ok(COLONNES_PAR_PAGE > 0 && LIGNES_PAR_PAGE > 0, 'les capacités par défaut sont positives');
  const f = construireFeuille({ groupes: [G('a', 2)], eleves: eleves(2), maxLignes: 0 });
  ok(f.pages.length === 1, 'une capacité absurde retombe sur le défaut au lieu de boucler');
}

console.log(failed ? '\n❌ ÉCHECS' : '\n✅ Tous les tests passent');
process.exit(failed ? 1 : 0);
