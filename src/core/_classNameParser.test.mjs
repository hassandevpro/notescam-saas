// Test du parseur de NOM de classe : inférence cycle/niveau/système/série/moteur
// depuis un unique champ libre. Aucune dépendance de test (lancer avec `node`).
import { parseClassName } from './classNameParser.js';
import { cameroonFr } from '../countries/cameroon_fr.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

const FR = cameroonFr;                                   // école francophone
const classic  = { bulletin_engine: 'classic' };
const apc      = { bulletin_engine: 'apc_minesec' };
const minesec  = { bulletin_engine: 'minesec' };

// Faux pays Guinée Éq. minimal (évite d'importer un module à dépendances).
const GE = {
  code: 'guinea_eq',
  cycles: [{ code: 'secundaria', label: 'Secundaria', levelGroups: [
    { group: 'ESO', items: ['Primero', 'Segundo', 'Tercero'] },
  ] }],
};

const p = (raw, school, country = FR) => parseClassName(raw, { school, country });

// ── 1. Exemples du cahier des charges ────────────────────────────────────────

// « 6ème A » → premier cycle → moteur APC, série absente, /20, section « A ».
{
  const r = p('6ème A', minesec);
  ok(r.level === '6ème',       '6ème A → niveau 6ème');
  ok(r.cycle === 'secondaire', '6ème A → cycle secondaire');
  ok(r.system === 'FR',        '6ème A → système FR');
  ok(r.engine === 'apc',       '6ème A → moteur APC');
  ok(r.serie === null,         '6ème A → pas de série');
  ok(r.grade_max === 20,       '6ème A → barème /20');
  ok(r.displaySuffix === 'A',  '6ème A → section « A »');
  ok(r.confidence === 'high',  '6ème A → confiance haute');
}

// « 1ère D » → niveau NU « 1ère » + série D lue dans le suffixe → moteur SC.
{
  const r = p('1ère D', minesec);
  ok(r.level === '1ère',     '1ère D → niveau nu 1ère');
  ok(r.serie === 'd',        '1ère D → série d');
  ok(r.engine === 'sc',      '1ère D → moteur SC');
  ok(r.confidence === 'high','1ère D → confiance haute');
}

// « Terminale C » → niveau nu « Terminale » + série C.
{
  const r = p('Terminale C', minesec);
  ok(r.level === 'Terminale', 'Terminale C → niveau nu Terminale');
  ok(r.serie === 'c',         'Terminale C → série c');
  ok(r.engine === 'sc',       'Terminale C → moteur SC');
}

// « Terminale E » : la série E existe désormais (niveau nu + série au suffixe).
{
  const r = p('Terminale E', minesec);
  ok(r.level === 'Terminale', 'Terminale E → niveau nu Terminale');
  ok(r.serie === 'e',         'Terminale E → série e');
  ok(r.engine === 'sc',       'Terminale E → moteur SC');
  ok(r.needsSeries === false, 'Terminale E → série résolue');
  ok(r.confidence === 'high', 'Terminale E → confiance haute');
}

// « Terminale » seul → série à préciser (needsSeries), section vide.
{
  const r = p('Terminale', minesec);
  ok(r.level === 'Terminale', 'Terminale → niveau nu');
  ok(r.serie === null,        'Terminale → série non précisée');
  ok(r.needsSeries === true,  'Terminale → needsSeries (choisir la série)');
}

// « Terminale D 2 » → série D + section « 2 ».
{
  const r = p('Terminale D 2', minesec);
  ok(r.serie === 'd',           'Terminale D 2 → série d');
  ok(r.displaySuffix === '2',   'Terminale D 2 → section « 2 »');
}

// « 1ère TI A » → série TI (technique), section « A ».
{
  const r = p('1ère TI A', minesec);
  ok(r.level === '1ère TI',    '1ère TI A → niveau 1ère TI');
  ok(r.serie === 'ti',         '1ère TI A → série ti');
  ok(r.engine === 'sc',        '1ère TI A → moteur SC');
  ok(r.displaySuffix === 'A',  '1ère TI A → section « A »');
}

// « Form 3 Red » → niveau anglophone dans une école FR → bascule EN /100.
{
  const r = p('Form 3 Red', classic);
  ok(r.level === 'Form 3',        'Form 3 Red → niveau Form 3');
  ok(r.system === 'EN',           'Form 3 Red → système EN (auto)');
  ok(r.grade_max === 100,         'Form 3 Red → barème /100');
  ok(r.displaySuffix === 'Red',   'Form 3 Red → section « Red »');
}

// « Upper Sixth Science » → EN, pas de série, section « Science ».
{
  const r = p('Upper Sixth Science', classic);
  ok(r.level === 'Upper Sixth',       'Upper Sixth → niveau');
  ok(r.system === 'EN',               'Upper Sixth → système EN');
  ok(r.serie === null,                'Upper Sixth → pas de série');
  ok(r.displaySuffix === 'Science',   'Upper Sixth → section « Science »');
}

// ── 2. Cas limites ───────────────────────────────────────────────────────────

// Nom non reconnu → confiance basse, cycle par défaut, jamais de crash.
{
  const r = p('Groupe B', classic);
  ok(r.level === null,          'Groupe B → niveau non résolu');
  ok(r.cycle === 'secondaire',  'Groupe B → cycle par défaut');
  ok(r.confidence === 'low',    'Groupe B → confiance basse');
}

// « Terminale A » : série A directe (modèle « niveau nu + série »).
{
  const r = p('Terminale A', minesec);
  ok(r.engine === 'sc',        'Terminale A → moteur SC');
  ok(r.serie === 'a',          'Terminale A → série a directe');
  ok(r.needsSeries === false,  'Terminale A → série résolue');
  ok(r.confidence === 'high',  'Terminale A → confiance haute');
}

// École classique : jamais de moteur référentiel même sur un niveau collège.
{
  const r = p('6ème A', classic);
  ok(r.engine === 'classic', '6ème A (école classique) → moteur classic');
}

// École apc_minesec : APC au collège, mais lycée reste classic.
{
  ok(p('5ème B', apc).engine === 'apc',      '5ème B (apc) → APC');
  ok(p('Terminale C', apc).engine === 'classic', 'Terminale C (apc sans SC) → classic');
}

// Guinée Éq. : système ES, barème /geMax (null), aucune notion FR/EN.
{
  const r = p('Primero A', classic, GE);
  ok(r.level === 'Primero',   'Primero A → niveau (GE)');
  ok(r.system === 'ES',       'Primero A → système ES');
  ok(r.grade_max === null,    'Primero A → barème null (/geMax)');
}

// ── Abréviations que les écoles ÉCRIVENT ─────────────────────────────────────
//
// Le catalogue pays dit « 6ème », « 1ère », « Terminale ». Les registres et les
// onglets de tableur disent « 6e », « 1re », « Tle ». Avant les alias, AUCUN de
// ces noms n'était reconnu : niveau null, confiance basse, moteur retombé sur
// « classique » et aucune matière auto-configurée. Les 14 noms ci-dessous sont
// ceux d'un classeur réel de collège-lycée.
{
  const attendu = [
    ['6e',     '6ème',      'apc', null, ''],
    ['5eg',    '5ème',      'apc', null, 'g'],
    ['5ef',    '5ème',      'apc', null, 'f'],
    ['4eg',    '4ème',      'apc', null, 'g'],
    ['4ef',    '4ème',      'apc', null, 'f'],
    ['3e',     '3ème',      'apc', null, ''],
    ['2ndeA4', '2nde',      'sc',  'a4', ''],
    ['2ndeC',  '2nde',      'sc',  'c',  ''],
    ['1èreA4', '1ère',      'sc',  'a4', ''],
    ['1èreC',  '1ère',      'sc',  'c',  ''],
    ['1èreD',  '1ère',      'sc',  'd',  ''],
    ['TleA4',  'Terminale', 'sc',  'a4', ''],
    ['TleC',   'Terminale', 'sc',  'c',  ''],
    ['TleD',   'Terminale', 'sc',  'd',  ''],
  ];
  for (const [nom, niveau, moteur, serie, suffixe] of attendu) {
    const r = p(nom, minesec);
    ok(r.level === niveau && r.engine === moteur && r.serie === serie
       && r.displaySuffix === suffixe && r.confidence === 'high',
      `${nom} → ${niveau}${serie ? ' série ' + serie : ''} (${moteur})`
      + (r.level === niveau ? '' : ` [obtenu: ${r.level} / ${r.engine} / ${r.serie}]`));
  }
}

// LA RÉGRESSION À NE PAS INTRODUIRE : l'alias est plus COURT que le libellé
// officiel, et c'est la longueur de ce qui a été RAPPROCHÉ — pas celle du
// libellé — qui découpe le suffixe. « TleA4 » (5 caractères) rapproché de
// « Terminale » (9) faisait consommer tout le nom : suffixe vide, série perdue.
{
  const r = p('TleA4', minesec);
  ok(r.serie === 'a4', 'TleA4 → la serie A4 survit au decoupage du suffixe');
}
// Et le libellé OFFICIEL reste prioritaire sur l'alias qui en est un préfixe.
{
  const r = p('6ème B', minesec);
  ok(r.level === '6ème' && r.displaySuffix === 'B',
    '6ème B → le libelle officiel gagne sur l alias « 6e », section « B » intacte');
  const t = p('Terminale D', minesec);
  ok(t.level === 'Terminale' && t.serie === 'd',
    'Terminale D → libelle complet prioritaire sur l alias « tle »');
}
// Autres abréviations courantes.
for (const [nom, niveau] of [['1reD', '1ère'], ['2deC', '2nde'], ['Term D', 'Terminale'], ['Seconde A4', '2nde']]) {
  ok(p(nom, minesec).level === niveau, `${nom} → ${niveau}`);
}

// Entrée vide → null (le formulaire n'affiche pas d'aperçu).
ok(p('', classic) === null,   'nom vide → null');
ok(p('   ', classic) === null,'espaces → null');

console.log(failed ? '\n❌ ÉCHECS' : '\n✅ Tous les tests passent');
process.exit(failed ? 1 : 0);
