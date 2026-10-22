// LE RÉFÉRENTIEL D'UNE ÉCOLE : LE SIEN, ET À JOUR
//
// ── CE QUE CE TEST EMPÊCHE DE REVENIR ───────────────────────────────────────
//
// Signalement du 2026-10-22, photo d'écran à l'appui. Le menu des matières d'une
// classe proposait « Langue Turc » TROIS fois, « Etude de texte » trois fois,
// « Expresion ecrite » et « Expression Orale » deux fois — alors que l'écran
// « Modifier la classe » montrait chaque matière UNE seule fois, et que la base
// n'en portait plus aucune en double : les neuf lignes fautives avaient été
// supprimées en production le matin même.
//
// DEUX DÉFAUTS SE CUMULAIENT, et aucun n'était dans la base.
//
// 1. L'EMPREINTE NE VOYAIT PAS LES LIGNES DE L'ÉCOLE. Le référentiel APC n'est
//    retéléchargé que si son empreinte a changé, et cette empreinte était l'id
//    de la VERSION NATIONALE active. C'était juste tant que le référentiel était
//    « global, en lecture seule, identique pour toutes les écoles » — la phrase
//    est dans le fichier. Elle a cessé d'être vraie en 0.3.19, quand l'école a
//    pu créer ses propres matières. Supprimer neuf lignes ne déplaçait donc PAS
//    l'empreinte : aucun navigateur n'apprenait la suppression, jamais.
//
// 2. LE CACHE MÉLANGEAIT LES ÉCOLES. La RLS dit « national OU mon école », ce
//    qui est juste ; mais un responsable membre de PLUSIEURS écoles les reçoit
//    toutes, et le cache n'avait qu'une seule clé, 'referentiel'. En passant
//    d'une école à l'autre, on voyait donc les matières maison de la précédente.
//
//   node --experimental-loader ./src/lib/_apcRefCache.hooks.mjs src/lib/_apcRefCache.test.mjs
import { maisonFingerprint } from './referentielFingerprint.js';
import { apcFingerprint, fetchReferentiel } from './apcService.js';
import { apcRefDB } from './db.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}${got === undefined ? '' : `  (obtenu: ${JSON.stringify(got)})`}`); }
};
const titre = (t) => console.log(`\n-- ${t} --`);

const ECOLE_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const ECOLE_B = 'bbbbbbbb-0000-0000-0000-000000000002';

// Base de départ : le national, plus les lignes maison de DEUX écoles.
const poser = ({ maisonA = 2, maisonB = 3 } = {}) => {
  const matieres = [
    { id: 'francais', nom: 'Français', school_id: null },
    { id: 'maths', nom: 'Mathématiques', school_id: null },
  ];
  for (let i = 0; i < maisonA; i++) matieres.push({ id: `a${i}`, nom: `Maison A ${i}`, school_id: ECOLE_A });
  for (let i = 0; i < maisonB; i++) matieres.push({ id: `b${i}`, nom: 'Langue Turc', school_id: ECOLE_B });
  globalThis.__tables = {
    apc_referentiel_versions: [{ id: 'v1', actif: true }],
    apc_matieres: matieres,
    apc_classe_matieres: matieres.filter((m) => m.school_id).map((m) => ({ matiere_id: m.id, school_id: m.school_id })),
    apc_competences: [
      { id: 'c1', actif: true, referentiel_version_id: 'v1', matiere_id: 'francais', school_id: null },
      { id: 'c2', actif: true, referentiel_version_id: 'v1', matiere_id: 'b0', school_id: ECOLE_B },
    ],
    apc_cycles: [], apc_classes: [], apc_trimestres: [], apc_sequences: [],
  };
  globalThis.__appels = [];
  globalThis.__echecs = {};
};

// ── 1. L'EMPREINTE BOUGE QUAND LES LIGNES DE L'ÉCOLE BOUGENT ───────────────
titre('L’empreinte voit les lignes maison de l’école');
{
  poser();
  const avant = await apcFingerprint(ECOLE_B);
  ok(typeof avant === 'string' && avant.length > 0, 'une empreinte est calculée', avant);

  // C'EST LE DÉFAUT EXACT : on supprime des lignes maison, la version nationale
  // ne bouge pas. Avant correction, l'empreinte restait identique et plus aucun
  // navigateur ne retéléchargeait.
  poser({ maisonB: 1 });
  const apres = await apcFingerprint(ECOLE_B);
  ok(apres !== avant, 'SUPPRIMER des lignes maison change l’empreinte', { avant, apres });

  poser({ maisonB: 5 });
  const plus = await apcFingerprint(ECOLE_B);
  ok(plus !== avant && plus !== apres, 'en AJOUTER aussi', { avant, apres, plus });
}

titre('Une école n’est pas affectée par les lignes d’une autre');
{
  poser({ maisonA: 2, maisonB: 3 });
  const a1 = await apcFingerprint(ECOLE_A);
  poser({ maisonA: 2, maisonB: 9 });   // SEULE l'école B bouge
  const a2 = await apcFingerprint(ECOLE_A);
  ok(a1 === a2, 'l’empreinte de A ne bouge pas quand B change', { a1, a2 });
  // …et le compte est bien filtré sur l'école demandée.
  const comptes = globalThis.__appels.filter((a) => a.head);
  ok(comptes.length > 0 && comptes.every((a) => a.filtres.some((f) => f === `eq:school_id=${ECOLE_A}`)),
    'le comptage est filtré sur l’école demandée',
    comptes.map((a) => `${a.table} [${a.filtres.join(' ')}]`));
}

titre('On ne devine pas : une lecture impossible rend null');
{
  poser();
  globalThis.__echecs = { apc_matieres: true };
  ok(await apcFingerprint(ECOLE_B) === null, 'table illisible ⇒ empreinte null (donc téléchargement complet)');

  poser();
  globalThis.__echecs = { apc_referentiel_versions: true };
  ok(await apcFingerprint(ECOLE_B) === null, 'version illisible ⇒ empreinte null');

  poser();
  ok(await maisonFingerprint(['apc_matieres'], null) === '',
    'sans école, la part maison est vide — et ne casse pas l’empreinte');
}

// ── 2. LE RÉFÉRENTIEL TÉLÉCHARGÉ EST CELUI DE L'ÉCOLE ──────────────────────
titre('Le téléchargement ne mélange plus les écoles');
{
  poser({ maisonA: 2, maisonB: 3 });
  const ref = await fetchReferentiel(ECOLE_B);
  ok(!!ref, 'le référentiel est chargé');

  const noms = (ref?.matieres || []).map((m) => m.nom);
  ok(noms.includes('Français'), 'le national est là');
  ok(noms.filter((n) => n === 'Langue Turc').length === 3, 'les 3 lignes maison de SON école sont là', noms);
  ok(!noms.some((n) => n.startsWith('Maison A')), 'AUCUNE ligne de l’autre école', noms);

  // La preuve côté requête : le filtre est bien posé sur les trois tables qui
  // portent des lignes maison, et sur elles seulement.
  const filtre = (t) => globalThis.__appels.filter((a) => a.table === t)
    .some((a) => a.filtres.some((f) => f.startsWith('or:school_id.is.null,school_id.eq.')));
  for (const t of ['apc_matieres', 'apc_classe_matieres', 'apc_competences']) {
    ok(filtre(t), `${t} est filtrée sur l’école`);
  }
  ok(!filtre('apc_cycles'), 'apc_cycles, purement nationale, n’est pas filtrée inutilement');
}

titre('Sans école connue, on ne filtre pas — mieux large que vide');
{
  poser({ maisonA: 2, maisonB: 3 });
  const ref = await fetchReferentiel(undefined);
  ok((ref?.matieres || []).length === 7, 'tout est rendu quand l’école est inconnue', ref?.matieres?.length);
}

// ── 3. UN CACHE PAR ÉCOLE ──────────────────────────────────────────────────
titre('Le cache est keyé par école');
{
  ok(apcRefDB.cle(ECOLE_A) !== apcRefDB.cle(ECOLE_B), 'deux écoles, deux clés');
  ok(apcRefDB.cle(ECOLE_A) === `referentiel:${ECOLE_A}`, 'la clé porte l’école', apcRefDB.cle(ECOLE_A));
  // Repli : une installation existante a son blob sous 'referentiel'. On ne veut
  // pas d'erreur si l'école n'est pas encore connue.
  ok(apcRefDB.cle(null) === 'referentiel', 'sans école, la clé historique reste lisible', apcRefDB.cle(null));
}

console.log(`\n${fail ? '❌' : '✅'} Référentiel APC / cache et empreinte : ${pass} contrôle(s) ok, ${fail} ko`);
process.exitCode = fail ? 1 : 0;
