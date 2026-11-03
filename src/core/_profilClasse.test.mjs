// « NOMBRE DE MOYENNES » = COMBIEN D'ÉLÈVES ONT LA MOYENNE.
// `node src/core/_profilClasse.test.mjs`
//
// Défaut signalé le 2026-11-02 sur une 3EME ESP de 6 élèves : le bulletin
// affichait « Nombre de moyennes : 6 » (l'effectif) au lieu de 3, juste
// au-dessus d'un taux de réussite de 50 % qu'il contredisait.

import { profilClasse, SEUIL_MOYENNE } from './apcEngine.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// ── Le cas réel du responsable : 6 élèves, 3 ont la moyenne ─────────────────
const CLASSE = [9.13, 9.90, 9.50, 10.50, 11.50, 12.33];
const p = profilClasse(CLASSE, 6);
ok(p.count === 3, `3 moyennes, pas 6 (obtenu ${p.count}) — c'est LE défaut corrigé`);
ok(p.notes === 6, `6 élèves ont une moyenne (ancien « count », conservé sous « notes »)`);
ok(p.rate === 50, `taux de réussite 50 % (obtenu ${p.rate})`);
ok(p.min === 9.13 && p.max === 12.33, `min–max 9.13–12.33 (obtenu ${p.min}–${p.max})`);
ok(p.effectif === 6, 'effectif repris tel quel');
ok(p.rate === Math.round((p.count / p.effectif) * 100),
  'le taux est EXACTEMENT nombre de moyennes / effectif');

// ── Le seuil est 10, celui des cotes ───────────────────────────────────────
ok(SEUIL_MOYENNE === 10, 'seuil 10/20');
ok(profilClasse([10], 1).count === 1, 'exactement 10 : la moyenne est atteinte');
ok(profilClasse([9.99], 1).count === 0, '9,99 ne l’est pas');
ok(profilClasse([9.995], 1).count === 0,
  'aucun arrondi caché : 9,995 reste sous le seuil (sinon un élève « a la moyenne » sans l’avoir)');

// ── L'effectif fait foi au dénominateur ────────────────────────────────────
// Une classe à moitié corrigée afficherait 100 % si l'on divisait par le nombre
// de copies corrigées.
const moitie = profilClasse([14, 12], 6);
ok(moitie.count === 2, '2 élèves au-dessus');
ok(moitie.rate === 33, `taux sur l'EFFECTIF (2/6 = 33 %), pas sur les notés (100 %) — obtenu ${moitie.rate}`);
ok(moitie.notes === 2, 'et l’on sait que seuls 2 sont notés');

// Sans effectif connu, on retombe sur le nombre de moyennes.
const sansEff = profilClasse([14, 12]);
ok(sansEff.effectif === 2 && sansEff.rate === 100, 'sans effectif : repli sur les notés');
ok(profilClasse([14, 12], 0).effectif === 2, 'un effectif à 0 est ignoré (pas de division par zéro)');
ok(profilClasse([14, 12], null).effectif === 2, 'un effectif absent est ignoré');

// ── Entrées sales ──────────────────────────────────────────────────────────
ok(profilClasse([], 6) === null, 'aucune moyenne : null, le bloc ne s’affiche pas');
ok(profilClasse(null, 6) === null, 'liste absente : null');
ok(profilClasse(undefined) === null, 'rien du tout : null');
const sale = profilClasse([12, null, undefined, NaN, '14', 8], 6);
ok(sale.notes === 3, `null, undefined et NaN écartés ; « 14 » lu comme 14 (obtenu ${sale.notes} moyennes)`);
ok(sale.count === 2, '12 et 14 ont la moyenne, 8 non');
ok(!Number.isNaN(sale.avg), 'aucune moyenne NaN ne peut s’imprimer');

// ── La moyenne de classe reste calculée sur les NOTÉS ──────────────────────
// Diviser la somme par l'effectif donnerait une moyenne fausse pour une classe
// partiellement corrigée : on ne compense pas une copie manquante par un zéro.
const partiel = profilClasse([14, 16], 4);
ok(partiel.avg === 15, `moyenne 15, pas 7,5 (obtenu ${partiel.avg})`);

console.log(failed ? '\n❌ ÉCHEC' : '\n✅ Tous les contrôles passent');
process.exit(failed ? 1 : 0);
