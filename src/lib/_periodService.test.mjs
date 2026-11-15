// Le service des périodes est l'unique source de « période courante » et d'échéance.
import { execSync } from 'node:child_process';
import { periodeCourante, echeanceDePeriode, echeanceDeLigne, periodesDepassees } from './periodService.js';

let ok = 0; let ko = 0;
const t = (nom, cond, info = '') => { if (cond) { ok++; console.log('✅', nom); } else { ko++; console.log('❌', nom, info); } };

const dates = {
  fr_seq_1: { exam_date: '2026-10-30' },
  fr_seq_2: { exam_date: '2026-12-18', deadline_date: '2026-12-22' },
  fr_seq_3: { exam_date: '2027-02-12' },
};
const piste = 'fr_seq';

let c = periodeCourante(piste, dates, '2026-11-14');
t('mi-novembre : la séquence 2 est ouverte (début déduit = lendemain de la fin de la 1)', c?.order === 2 && c.start === '2026-10-31', JSON.stringify(c));
t('la limite posée l\'emporte sur la fin', c?.deadline === '2026-12-22' && c.daysLeft === 38);
t('une période dont la limite est passée n\'est pas la courante', periodeCourante(piste, dates, '2026-10-31')?.order === 2);
c = periodeCourante(piste, dates, '2026-10-30');
t('le jour même de la limite : encore ouverte', c?.order === 1 && c.daysLeft === 0 && !c.overdue && c.atRisk);
c = periodeCourante(piste, dates, '2027-06-01');
t('tout est passé : la dernière, marquée last/overdue', c?.order === 3 && c.last && c.overdue);
t('aucune date : null (pas de période devinée)', periodeCourante(piste, {}, '2026-11-14') === null);
t('un jour sous forme de Date fonctionne (fuseau Douala)', periodeCourante(piste, dates, new Date('2026-11-14T12:00:00Z'))?.order === 2);

const e = echeanceDePeriode(piste, dates, 3, '2026-11-14');
t('échéance d\'une période inspectée : date, jours restants, à venir', e.date === '2027-02-12' && e.daysLeft === 90 && !e.overdue && e.avenir === true, JSON.stringify(e));
t('période inspectée sans date : aucune échéance', echeanceDePeriode(piste, dates, 5, '2026-11-14').date === null);
t('échéance de ligne : limite > fin > examen', echeanceDeLigne({ deadline_date: 'a', exam_date: 'b' }) === 'a' && echeanceDeLigne({ exam_date: 'b' }) === 'b' && echeanceDeLigne(null) === null);
t('périodes dépassées', periodesDepassees(piste, dates, '2026-11-14').length === 1);

// ── Garde : aucun écran ne recalcule la période lui-même ──
const interdits = execSync(
  'git grep -nE "currentPeriodOfTrack|effectiveDeadline|overduePeriods" -- src ":!src/lib/calendarTracks.js" ":!*.test.mjs" || true',
  { encoding: 'utf8' },
).split('\n').filter((l) => l && !/^\S+:\d+:\s*(\/\/|\*)/.test(l) && !l.includes('sequenceDatesService.js'));
t('aucun écran n\'utilise les anciennes fonctions de calendarTracks', interdits.length === 0, interdits.join(' | '));

console.log(`\n✅ Service des périodes : ${ok} ok, ${ko} ko`);
process.exit(ko ? 1 : 0);
