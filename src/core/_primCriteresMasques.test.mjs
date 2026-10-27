// UNE ÉCOLE QUI N'ÉVALUE QU'À L'ÉCRIT NE DOIT PLUS VOIR LES AUTRES COLONNES.
//
// ── CE QUE CE TEST EMPÊCHE DE REVENIR ───────────────────────────────────────
//
// Le référentiel MINEDUB évalue chaque compétence sur quatre critères — Oral,
// Écrit, Pratique, Savoir-être — et `prim_criteres` est NATIONALE. Les quatre
// colonnes s'imposaient donc à toutes les écoles. THE GENIUS a signalé le
// 2026-10-27, sur ses cinq niveaux : « c'est uniquement l'écrit, il n'y a pas
// de pratique et de l'oral ». Trois colonnes vides sur chaque bulletin, et
// aucun moyen de les retirer : `setBareme(0)` ne ferme qu'un critère que le
// national ignore (cf. primColumnBareme.js), jamais un critère officiel.
//
// TROIS PROPRIÉTÉS SONT VERROUILLÉES ICI :
//   1. un critère masqué disparaît des colonnes ET emporte ses points du
//      barème — sinon l'élève plafonnerait sous la note qu'il mérite ;
//   2. masquer ne touche AUCUNE note : démasquer rend exactement l'état
//      d'avant, points compris ;
//   3. la liste vide ne change rien — une école qui ne masque rien voit
//      strictement ce qu'elle voyait avant ce travail.
//
//   node src/core/_primCriteresMasques.test.mjs
import { readFileSync } from 'node:fs';
import { criteresForCompetence, niveauPointsTotal, competencePointsTotal } from './primEngine.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}` + (got === undefined ? '' : `  (obtenu: ${JSON.stringify(got)})`)); }
};
const titre = (t) => console.log(`\n-- ${t} --`);

// Le barème RÉEL du SIL relevé en production : 1A = Oral 20 + Écrit 15 +
// Savoir-être 5 = 40 points. 1B n'a pas de "Pratique" — le national ne lui en
// donne pas, et c'est ce qui rendait la colonne fermable là et nulle part ailleurs.
const REFERENTIEL = {
  criteres: [
    { id: 'oral', nom: 'Oral', ordre: 1 },
    { id: 'ecrit', nom: 'Écrit', ordre: 2 },
    { id: 'pratique', nom: 'Pratique', ordre: 3 },
    { id: 'savoir_etre', nom: 'Savoir-être', ordre: 4 },
  ],
  baremeCriteres: [
    { niveau_id: 'sil', competence_id: '1a', critere_id: 'oral', points_max: 20, ordre: 1 },
    { niveau_id: 'sil', competence_id: '1a', critere_id: 'ecrit', points_max: 15, ordre: 2 },
    { niveau_id: 'sil', competence_id: '1a', critere_id: 'savoir_etre', points_max: 5, ordre: 4 },
    { niveau_id: 'sil', competence_id: '1b', critere_id: 'ecrit', points_max: 20, ordre: 2 },
    { niveau_id: 'sil', competence_id: '1b', critere_id: 'oral', points_max: 10, ordre: 1 },
    // '6a' : deux profils, apte / inapte. L'inapte est noté en pratique.
    { niveau_id: 'sil', competence_id: '6a', critere_id: 'ecrit', points_max: 10, aptitude: 'apte', ordre: 2 },
    { niveau_id: 'sil', competence_id: '6a', critere_id: 'pratique', points_max: 10, aptitude: 'inapte', ordre: 3 },
  ],
};
const COMPETENCES = [{ id: '1a' }, { id: '1b' }, { id: '6a' }];
const ids = (rows) => rows.map((r) => r.id).join(',');

// ── 1. SANS MASQUE : rien ne change ────────────────────────────────────────
titre('Une école qui ne masque rien voit exactement ce qu elle voyait');
{
  ok(ids(criteresForCompetence(REFERENTIEL, 'sil', '1a')) === 'oral,ecrit,savoir_etre',
    '1a garde ses trois critères officiels', ids(criteresForCompetence(REFERENTIEL, 'sil', '1a')));
  ok(niveauPointsTotal(REFERENTIEL, 'sil', COMPETENCES) === 80,
    'barème du niveau : 40 + 30 + 10 = 80', niveauPointsTotal(REFERENTIEL, 'sil', COMPETENCES));
  // Le défaut le plus facile à introduire : un paramètre par défaut qui masque.
  ok(ids(criteresForCompetence(REFERENTIEL, 'sil', '1a', 'apte', [])) === 'oral,ecrit,savoir_etre',
    'une liste de masques VIDE ne retire rien');
  ok(ids(criteresForCompetence(REFERENTIEL, 'sil', '1a', 'apte', undefined)) === 'oral,ecrit,savoir_etre',
    'un masque `undefined` ne retire rien non plus');
}

// ── 2. LE CAS THE GENIUS : écrit seulement ─────────────────────────────────
titre('« C est uniquement l écrit » — trois critères retirés');
{
  const M = ['oral', 'pratique', 'savoir_etre'];
  ok(ids(criteresForCompetence(REFERENTIEL, 'sil', '1a', 'apte', M)) === 'ecrit',
    '1a ne garde que l écrit', ids(criteresForCompetence(REFERENTIEL, 'sil', '1a', 'apte', M)));
  ok(ids(criteresForCompetence(REFERENTIEL, 'sil', '1b', 'apte', M)) === 'ecrit',
    '1b ne garde que l écrit');

  // LE POINT QUI COMPTE : les points suivent. 1a tombe de 40 à 15.
  const c1a = criteresForCompetence(REFERENTIEL, 'sil', '1a', 'apte', M);
  ok(c1a.reduce((a, c) => a + c.points_max, 0) === 15,
    '1a : le barème tombe de 40 à 15 points', c1a.reduce((a, c) => a + c.points_max, 0));
  ok(niveauPointsTotal(REFERENTIEL, 'sil', COMPETENCES, 'apte', M) === 45,
    'barème du niveau : 15 + 20 + 10 = 45', niveauPointsTotal(REFERENTIEL, 'sil', COMPETENCES, 'apte', M));

  // Un élève à 12/15 en écrit sort à 12/15, pas à 12/40 : c'est tout l'enjeu.
  const { achieved, possible } = competencePointsTotal({ ecrit: { note: 12, max: 15 } }, c1a);
  ok(achieved === 12 && possible === 15, 'un 12 en écrit se lit 12/15, et non 12/40', [achieved, possible]);
}

// ── 3. L APTITUDE SPORTIVE N EST PAS ÉCRASÉE ───────────────────────────────
titre('Le profil apte / inapte de la compétence 6a survit au masque');
{
  ok(ids(criteresForCompetence(REFERENTIEL, 'sil', '6a', 'inapte')) === 'pratique',
    'sans masque, l élève inapte est noté en pratique');
  // Une école qui masque « pratique » retire AUSSI le seul critère de l'inapte.
  // Ce n'est pas un bug : c'est ce que l'école a demandé, et le résultat doit
  // être une liste VIDE plutôt qu'un repli silencieux sur le profil apte.
  ok(criteresForCompetence(REFERENTIEL, 'sil', '6a', 'inapte', ['pratique']).length === 0,
    'masquer « pratique » laisse l élève inapte sans critère, sans repli silencieux');
  ok(ids(criteresForCompetence(REFERENTIEL, 'sil', '6a', 'apte', ['pratique'])) === 'ecrit',
    'l élève apte garde son écrit');
}

// ── 4. MASQUER NE TOUCHE AUCUNE NOTE ───────────────────────────────────────
titre('Masquer cache, ne supprime pas');
{
  const avant = criteresForCompetence(REFERENTIEL, 'sil', '1a');
  criteresForCompetence(REFERENTIEL, 'sil', '1a', 'apte', ['oral']);
  const apres = criteresForCompetence(REFERENTIEL, 'sil', '1a');
  ok(JSON.stringify(avant) === JSON.stringify(apres),
    'le référentiel national n est pas modifié par un appel masqué');
  ok(REFERENTIEL.baremeCriteres.length === 7,
    'aucune ligne de barème retirée de la source', REFERENTIEL.baremeCriteres.length);
}

// ── 5. CÂBLAGE : tous les écrans lisent le même masque ─────────────────────
//
// Le bulletin, le rapport de classe et le PV doivent voir LES MÊMES colonnes.
// Si l'un d'eux oublie le masque, le conseil de classe délibère sur une moyenne
// que le bulletin n'imprime pas — c'est la divergence que `primCompetenceAvg`
// dit lui-même vouloir éviter.
titre('Bulletin, rapport de classe et PV lisent tous le masque');
{
  for (const [f, attendu] of [
    ['src/pages/Bulletins.jsx', 'primCriteresMasques'],
    ['src/lib/classReportEngine.js', 'primCriteresMasques'],
    ['src/lib/pvEngine.js', 'primCriteresMasques'],
    ['src/components/grades/PrimCompetenceWorkspace.jsx', 'masquesCrit'],
  ]) {
    const src = readFileSync(f, 'utf8');
    ok(src.includes(attendu), `${f.split('/').pop()} : transmet le masque des critères`);
  }

  // Le masque doit être CHARGÉ, sinon il reste vide et ne masque rien.
  for (const f of ['src/pages/Bulletins.jsx', 'src/components/documents/PvWorkspace.jsx',
    'src/components/grades/PrimCompetenceWorkspace.jsx']) {
    ok(readFileSync(f, 'utf8').includes("loadRefMasques('prim_crit')"),
      `${f.split('/').pop()} : charge les masques de critères au montage`);
  }

  // La table est déclarée des deux côtés, et HORS du contrat de synchro.
  const db = readFileSync('server/db.js', 'utf8');
  ok(readFileSync('server/schema.sql', 'utf8').includes('CREATE TABLE IF NOT EXISTS prim_criteres_masques'),
    'schema.sql : la table existe en LAN');
  ok(db.includes("'prim_criteres_masques'"), 'db.js : la table est autorisée à l écriture LAN');
  const synced = db.slice(db.indexOf('export const SYNCED_TABLES'), db.indexOf('export const SYNCED_TABLES') + 4000);
  ok(!synced.includes('prim_criteres_masques'),
    'db.js : elle reste HORS de SYNCED_TABLES — un masque ne voyage pas');

  // `prim_criteres` ne devient PAS propriété de l'école : pas de school_id.
  const mig = readFileSync('supabase_prim_criteres_masques.sql', 'utf8');
  ok(mig.includes('CREATE TABLE IF NOT EXISTS public.prim_criteres_masques'),
    'migration Cloud : additive et idempotente');
  ok(!/ALTER TABLE public\.prim_criteres\b/.test(mig),
    'migration Cloud : la table NATIONALE des critères n est pas touchée');
  ok(mig.includes('ENABLE ROW LEVEL SECURITY'), 'migration Cloud : RLS activée');
}

console.log(`\n${fail ? '❌' : '✅'} Critères masqués par l'école : ${pass} contrôle(s) ok, ${fail} ko`);
process.exitCode = fail ? 1 : 0;
