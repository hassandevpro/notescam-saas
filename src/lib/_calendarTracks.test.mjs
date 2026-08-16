// Tests des PISTES DE CALENDRIER (module pur) :
//   node src/lib/_calendarTracks.test.mjs
import {
  TRACKS, ALL_CALENDAR_PERIODS, trackKeyForClass, tracksForSchool, tracksInUse,
  currentPeriodOfTrack, overduePeriods, todayStr, effectiveDeadline, periodAt,
} from './calendarTracks.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// ── Définition des pistes ───────────────────────────────────────────────────
ok(TRACKS.fr_seq.periods.length === 6,  'MINESEC francophone : 6 séquences');
ok(TRACKS.en_term.periods.length === 3, 'anglophone : 3 terms');
ok(TRACKS.prim_ua.periods.length === 8, 'MINEDUB primaire : 8 UA');
ok(TRACKS.mat_trim.periods.length === 3, 'maternelle : 3 trimestres');
ok(TRACKS.ge_trim.periods.length === 3, 'Guinée Éq. : 3 trimestres');
ok(TRACKS.ge_trim.periods[0].key === 'fr_seq_1', 'Guinée Éq. réutilise les clés fr_seq_* (aucune re-clé)');
ok(TRACKS.prim_ua.periods[3].hint.fr === 'Trim. 2', 'UA4 est rattachée au 2e trimestre');
ok(TRACKS.fr_seq.periods[2].hint.fr === 'Trim. 2', 'Séq 3 est rattachée au 2e trimestre');

// Clés persistables : uniques, et sur-ensemble strict de l'existant (sprint 19).
const keys = ALL_CALENDAR_PERIODS.map((p) => p.key);
ok(new Set(keys).size === keys.length, 'aucune clé seq_key dupliquée');
ok(keys.length === 20, '6 séquences + 3 terms + 8 UA + 3 trimestres = 20 lignes');
for (const legacy of ['fr_seq_1', 'fr_seq_6', 'en_term_1', 'en_term_3']) {
  ok(keys.includes(legacy), `clé historique conservée : ${legacy}`);
}
ok(keys.slice(0, 9).join(',') === 'fr_seq_1,fr_seq_2,fr_seq_3,fr_seq_4,fr_seq_5,fr_seq_6,en_term_1,en_term_2,en_term_3',
  'les 9 clés historiques restent en tête (ordre de SEQ_DEFINITIONS inchangé)');

// ── Résolution piste ↔ classe ───────────────────────────────────────────────
const officiel = { bulletin_engine: 'officiel', language: 'francophone' };
const classic  = { bulletin_engine: 'classic',  language: 'francophone' };

ok(trackKeyForClass(officiel, { level: 'Petite Section', name: 'PS A' }) === 'mat_trim',
  'officiel : Petite Section → trimestres maternelle');
ok(trackKeyForClass(officiel, { level: 'CM2', name: 'CM2 B' }) === 'prim_ua',
  'officiel : CM2 → unités d’apprentissage MINEDUB');
ok(trackKeyForClass(officiel, { level: '3ème', name: '3e A' }) === 'fr_seq',
  'officiel : 3e → séquences MINESEC');
ok(trackKeyForClass(officiel, { level: 'Terminale', name: 'Tle D' }) === 'fr_seq',
  'officiel : Terminale (second cycle) → séquences');
ok(trackKeyForClass(classic, { level: 'CM2', name: 'CM2 B' }) === 'fr_seq',
  'école classique : le CM2 reste en séquences (pas de moteur MINEDUB)');
ok(trackKeyForClass(officiel, { level: 'Form 2', name: 'Form 2', system: 'EN' }) === 'en_term',
  'classe anglophone → terms, même en école officielle');
ok(trackKeyForClass(officiel, { level: 'CM2', name: 'CM2', bulletin_engine: 'classic' }) === 'fr_seq',
  'la surcharge classe prime : CM2 forcée en classique → séquences');
ok(trackKeyForClass({}, { level: '3ème' }, 'guinea_eq') === 'ge_trim',
  'Guinée équatoriale : piste unique quel que soit le niveau');

// ── Pistes d'un établissement ───────────────────────────────────────────────
const mixed = [
  { level: 'Petite Section' }, { level: 'CM2' }, { level: '6ème' }, { level: 'Form 1', system: 'EN' },
];
ok(tracksForSchool(officiel, mixed).join(',') === 'mat_trim,prim_ua,fr_seq,en_term',
  'école officielle complète : les 4 pistes, du préscolaire au secondaire');
ok(tracksForSchool(officiel, [{ level: '3ème' }]).join(',') === 'fr_seq,en_term',
  'collège officiel : aucun tableau MINEDUB parasite');

// Règle 1 — le MOTEUR DE BULLETIN commande les pistes MINEDUB.
ok(tracksForSchool(classic, mixed).join(',') === 'fr_seq,en_term',
  'école « Classique » : jamais de maternelle ni d’UA, même avec PS et CM2 au tableau');
ok(!tracksForSchool(classic, [{ level: 'Petite Section' }]).includes('mat_trim'),
  'Classique + Petite Section : pas de trimestres de maternelle');
ok(!tracksForSchool(classic, [{ level: 'CM2' }]).includes('prim_ua'),
  'Classique + CM2 : pas d’unités d’apprentissage');
ok(tracksForSchool({ bulletin_engine: 'minedub', language: 'francophone' }, [{ level: 'CM2' }, { level: 'Petite Section' }])
  .join(',') === 'mat_trim,prim_ua,fr_seq,en_term',
  'école MINEDUB : maternelle + primaire, en plus des sous-systèmes linguistiques');
ok(tracksForSchool(officiel, [{ level: 'CM2', bulletin_engine: 'classic' }]).join(',') === 'fr_seq,en_term',
  'surcharge classe en classique : son UA disparaît du calendrier');

// Règle 2 — le sous-système anglophone reste toujours proposé.
ok(tracksForSchool(officiel, [{ level: '3ème' }]).includes('en_term'),
  'école francophone : le calendrier anglophone reste proposé');
ok(tracksForSchool(classic, []).join(',') === 'fr_seq,en_term',
  'aucune classe : les deux sous-systèmes linguistiques');
ok(tracksForSchool({ language: 'anglophone' }, []).join(',') === 'en_term',
  'école purement anglophone : terms seuls, pas de séquences');
ok(tracksForSchool({ bulletin_engine: 'officiel', language: 'anglophone' }, [{ level: 'Nursery 1' }])
  .join(',') === 'mat_trim,en_term',
  'officiel anglophone : la Nursery suit le MINEDUB, pas de séquences francophones');

ok(tracksForSchool(officiel, mixed, 'guinea_eq').join(',') === 'ge_trim',
  'Guinée équatoriale : piste unique');

// ── Pistes RÉELLEMENT peuplées (écrans de suivi) ────────────────────────────
// Le calendrier PROPOSE l'anglophone en permanence ; un écran de surveillance ne
// doit pas ouvrir un onglet vide.
ok(tracksInUse(officiel, [{ level: '3ème' }]).join(',') === 'fr_seq',
  'suivi : pas d’onglet Term si aucune classe anglophone');
ok(tracksForSchool(officiel, [{ level: '3ème' }]).includes('en_term'),
  'calendrier : l’anglophone reste proposé sur la même école');
ok(tracksInUse(officiel, mixed).join(',') === 'mat_trim,prim_ua,fr_seq,en_term',
  'suivi : toutes les pistes peuplées');
ok(tracksInUse(officiel, []).join(',') === 'fr_seq',
  'suivi sans classe : découpage par défaut de la langue');
ok(tracksInUse({ language: 'anglophone' }, []).join(',') === 'en_term',
  'suivi sans classe, école anglophone : terms');
ok(tracksInUse(classic, [{ level: 'Petite Section' }]).join(',') === 'fr_seq',
  'suivi : école Classique, la PS est suivie en séquences');

// ── Règle 3 : chaque responsable ne configure QUE sa part ───────────────────
// Complexe scolaire : le directeur tient le fondamental (MINEDUB), le proviseur
// le secondaire (MINESEC). Le périmètre est celui du compte (school_users.scope).
const complexe = [
  { id: 'c1', level: 'Petite Section' }, { id: 'c2', level: 'CM2' },
  { id: 'c3', level: '6ème' }, { id: 'c4', level: 'Terminale C' },
  { id: 'c5', level: 'Form 3', system: 'EN' },
];
const directeur = { cycles: ['fondamental'] };
const proviseur = { cycles: ['secondaire'] };

ok(tracksForSchool(officiel, complexe, null, directeur).join(',') === 'mat_trim,prim_ua',
  'directeur (fondamental) : maternelle + primaire, RIEN du secondaire');
ok(tracksForSchool(officiel, complexe, null, proviseur).join(',') === 'fr_seq,en_term',
  'proviseur (secondaire) : séquences + terms, aucun tableau MINEDUB');
ok(tracksForSchool(officiel, complexe, null, null).join(',') === 'mat_trim,prim_ua,fr_seq,en_term',
  'administrateur du complexe (périmètre global) : tout le calendrier');
ok(tracksForSchool(officiel, complexe, null, {}).join(',') === 'mat_trim,prim_ua,fr_seq,en_term',
  'périmètre vide = global (rétro-compatible)');

// Périmètre par SECTION, plus fin que le cycle.
ok(tracksForSchool(officiel, complexe, null, { sections: ['maternelle'] }).join(',') === 'mat_trim',
  'responsable de la seule maternelle : un unique tableau');
ok(tracksForSchool(officiel, complexe, null, { sections: ['second_cycle'] }).join(',') === 'fr_seq',
  'proviseur du seul lycée francophone : pas de tableau anglophone à blanc');
ok(tracksForSchool(officiel, complexe, null, { classIds: ['c5'] }).join(',') === 'en_term',
  'périmètre sur une classe anglophone : ses terms seuls');

// Le périmètre restreint ne fabrique pas de piste par défaut quand il est vide.
ok(tracksForSchool(officiel, complexe, null, { sections: ['autre'] }).length === 0,
  'périmètre sans aucune classe : aucun tableau à régler');
ok(tracksForSchool(officiel, [], null, null).join(',') === 'fr_seq,en_term',
  'école vide, périmètre global : les deux sous-systèmes restent proposés');

// Une école « Classique » reste classique quel que soit le périmètre.
ok(tracksForSchool(classic, complexe, null, directeur).join(',') === 'fr_seq',
  'directeur d’un fondamental Classique : séquences, pas d’UA MINEDUB');

// ── Période courante lue dans le calendrier ─────────────────────────────────
const cal = {
  fr_seq_1: { exam_date: '2025-10-20', deadline_date: '2025-10-31', conseil_date: '2025-11-05' },
  fr_seq_2: { exam_date: '2025-12-08', deadline_date: '2025-12-19' },
  fr_seq_3: { deadline_date: '2026-02-13' },
  fr_seq_4: { exam_date: '2026-04-03' },              // limite absente → repli examen
  fr_seq_5: { deadline_date: '2026-05-29' },
  fr_seq_6: { deadline_date: '2026-06-26' },
};
const cur = (d) => currentPeriodOfTrack('fr_seq', cal, new Date(d));

ok(cur('2025-09-15').order === 1, 'avant la 1re échéance → séquence 1');
ok(cur('2025-10-31').order === 1, 'le jour même de l’échéance → séquence encore ouverte');
ok(cur('2025-11-01').order === 2, 'lendemain de l’échéance → on bascule en séquence 2');
ok(cur('2026-03-20').order === 4, 'limite absente : la date d’examen fait foi (séq 4)');
ok(cur('2026-06-10').order === 6, 'juin → séquence 6');

const late = cur('2026-07-15');
ok(late.order === 6 && late.overdue && late.last,
  'après la dernière échéance → séquence 6 en retard, plus rien d’ouvert');
ok(cur('2025-10-29').daysLeft === 2 && cur('2025-10-29').atRisk,
  'J-2 : atRisk, échéance non dépassée');
ok(cur('2025-10-31').daysLeft === 0 && !cur('2025-10-31').overdue,
  'J-0 : la journée compte encore');
ok(cur('2025-11-03').trackKey === 'fr_seq' && cur('2025-11-03').key === 'fr_seq_2',
  'la clé seq_key de la période est renvoyée telle quelle');

ok(currentPeriodOfTrack('fr_seq', {}, new Date('2025-11-01')) === null,
  'calendrier vide → null (l’appelant retombe sur son heuristique)');
ok(currentPeriodOfTrack('mat_trim', cal, new Date('2025-11-01')) === null,
  'les dates d’une piste ne fuient pas sur une autre');
ok(currentPeriodOfTrack('inconnue', cal) === null, 'piste inconnue → null');

// Piste maternelle, calendrier propre.
const matCal = { mat_trim_1: { deadline_date: '2025-12-12' }, mat_trim_2: { deadline_date: '2026-03-27' }, mat_trim_3: { deadline_date: '2026-06-19' } };
ok(currentPeriodOfTrack('mat_trim', matCal, new Date('2026-02-01')).order === 2,
  'maternelle : février → 2e trimestre (jamais « Séq 1 »)');

// ── Retards cumulés ─────────────────────────────────────────────────────────
ok(overduePeriods('fr_seq', cal, new Date('2026-01-10')).map((p) => p.order).join(',') === '1,2',
  'deux échéances passées début janvier');
ok(overduePeriods('fr_seq', {}, new Date('2026-01-10')).length === 0, 'calendrier vide → aucun retard');

// ── Utilitaires ─────────────────────────────────────────────────────────────
ok(todayStr(new Date(2026, 0, 5)) === '2026-01-05', 'todayStr en heure LOCALE (pas d’UTC)');
ok(todayStr(new Date('nawak')) === '', 'date invalide → chaîne vide');
ok(effectiveDeadline({ deadline_date: '2026-01-01', exam_date: '2025-12-01' }) === '2026-01-01',
  'la limite de saisie prime sur la date d’examen');
ok(effectiveDeadline({ exam_date: '2025-12-01' }) === '2025-12-01', 'repli sur la date d’examen');
ok(effectiveDeadline(null) === null, 'ligne absente → pas d’échéance');
ok(periodAt('prim_ua', 8).key === 'prim_ua_8' && periodAt('prim_ua', 9) === null, 'periodAt borne la piste');

console.log(failed ? '\n❌ ÉCHECS' : '\n✅ Tous les tests passent');
process.exit(failed ? 1 : 0);
