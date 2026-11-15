import { diagnostiquer, decaler, anneeSuivante, repartir, impact, lignesModifiees } from './calendarAssistant.js';

let ok = 0; let ko = 0;
const t = (nom, cond, info = '') => { if (cond) { ok++; console.log('✅', nom); } else { ko++; console.log('❌', nom, info); } };
const P = 'fr_seq';

const sain = {
  fr_seq_1: { start_date: '2026-09-07', end_date: '2026-10-30' },
  fr_seq_2: { start_date: '2026-10-31', end_date: '2026-12-18', deadline_date: '2026-12-22' },
};
t('calendrier cohérent : aucune anomalie', diagnostiquer(P, sain).length === 0);

const trou = { ...sain, fr_seq_2: { ...sain.fr_seq_2, start_date: '2026-11-10' } };
let d = diagnostiquer(P, trou);
t('trou : 10 jours sans période', d.some((x) => x.type === 'trou' && x.jours === 10), JSON.stringify(d));

const chev = { ...sain, fr_seq_2: { ...sain.fr_seq_2, start_date: '2026-10-20' } };
d = diagnostiquer(P, chev);
t('chevauchement de 11 jours', d.some((x) => x.type === 'chevauchement' && x.jours === 11), JSON.stringify(d));

d = diagnostiquer(P, { fr_seq_1: { start_date: '2026-11-01', end_date: '2026-10-01' } });
t('début après fin : inverse', d.some((x) => x.type === 'inverse'));

d = diagnostiquer(P, { fr_seq_1: { end_date: '2026-10-30', deadline_date: '2026-10-25' } });
t('limite avant la fin de période', d.some((x) => x.type === 'limite_avant_fin' && x.jours === 5), JSON.stringify(d));

d = diagnostiquer(P, { fr_seq_1: { end_date: '2026-12-18' }, fr_seq_2: { end_date: '2026-10-30' } });
t('périodes hors ordre', d.some((x) => x.type === 'hors_ordre'));

const dec = decaler(sain, 364);
t('copie décalée : +364 jours, même jour de la semaine', dec.fr_seq_1.start_date === '2027-09-06' && new Date('2026-09-07').getUTCDay() === new Date('2027-09-06').getUTCDay(), JSON.stringify(dec.fr_seq_1));
t('copie décalée : champs vides laissés vides', dec.fr_seq_1.deadline_date === undefined);
t('l\'original n\'est pas modifié', sain.fr_seq_1.start_date === '2026-09-07');
t('anneeSuivante = décalage de 364 jours', anneeSuivante(sain).fr_seq_2.end_date === dec.fr_seq_2.end_date);

const r = repartir(P, '2026-09-07', '2027-06-30');
t('répartition : 6 séquences contiguës de la rentrée à la fin', Object.keys(r).length === 6 && r.fr_seq_1.start_date === '2026-09-07' && r.fr_seq_6.end_date === '2027-06-30');
t('répartition : aucune anomalie', diagnostiquer(P, r).length === 0, JSON.stringify(diagnostiquer(P, r)));
t('répartition : dates invalides → rien', Object.keys(repartir(P, '2027-01-01', '2026-01-01')).length === 0);

const im = impact(P, sain, { ...sain, fr_seq_2: { ...sain.fr_seq_2, deadline_date: '2027-01-05' } });
t('impact : seule la séquence 2 bouge', im.length === 1 && im[0].order === 2 && im[0].apres.deadline === '2027-01-05', JSON.stringify(im));
t('impact : rien ne change → vide', impact(P, sain, sain).length === 0);

const lm = lignesModifiees(sain, { ...sain, fr_seq_1: { ...sain.fr_seq_1, end_date: '2026-11-02' } });
t('journal : une ligne, un champ (avant → après)', lm.length === 1 && lm[0].champs[0].avant === '2026-10-30' && lm[0].champs[0].apres === '2026-11-02');

console.log(`\n✅ Assistant calendrier : ${ok} ok, ${ko} ko`);
process.exit(ko ? 1 : 0);
