// Tests des PISTES DE CALENDRIER (module pur) :
//   node src/lib/_calendarTracks.test.mjs
import {
  TRACKS, ALL_CALENDAR_PERIODS, trackKeyForClass, tracksForSchool,
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
  'école complète : les 4 pistes, du préscolaire au secondaire');
ok(tracksForSchool(officiel, [{ level: '3ème' }]).join(',') === 'fr_seq',
  'collège seul : une seule piste (pas de tableau maternelle parasite)');
ok(tracksForSchool(officiel, []).join(',') === 'fr_seq,en_term',
  'aucune classe : repli sur le comportement historique');
ok(tracksForSchool({ language: 'anglophone' }, []).join(',') === 'en_term',
  'aucune classe, école anglophone : terms seuls');
ok(tracksForSchool(officiel, mixed, 'guinea_eq').join(',') === 'ge_trim',
  'Guinée équatoriale : piste unique');

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
