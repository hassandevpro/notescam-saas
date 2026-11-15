import { fenetresDePiste, etatPeriode, suiviDeClasse, jourDouala, joursEntre } from './periodStatus.js';
let pass = 0, fail = 0;
const ok = (c, l, g) => { if (c) { console.log(`✅ ${l}`); pass++; } else { console.log(`❌ ${l} (obtenu: ${JSON.stringify(g)})`); fail++; } };

// Séquence 1 : fin 15 oct. ; séquence 2 : fin 15 déc. (limite explicite 20 déc.)
const dates = {
  fr_seq_1: { exam_date: '2026-10-15' },
  fr_seq_2: { exam_date: '2026-12-15', deadline_date: '2026-12-20' },
};
const F = fenetresDePiste('fr_seq', dates);
ok(F[0].start === null && F[0].end === '2026-10-15' && F[0].deadline === '2026-10-15', 'séq 1 : fin = examen, limite = fin (grâce 0)', F[0]);
ok(F[1].start === '2026-10-16' && F[1].startDeduit, 'séq 2 : début DÉDUIT = lendemain de la fin de la séq 1', F[1]);
ok(F[1].deadline === '2026-12-20', 'séq 2 : limite = date limite explicite, pas l\'examen', F[1]);
ok(fenetresDePiste('fr_seq', dates, { graceDays: 5 })[0].deadline === '2026-10-20', 'jours de grâce : fin + N', null);

const prog = (map) => (o) => map[o] || { expected: 336, entered: 0 };
// 1. Séquence 2 sans notes AVANT son début : pas « à faire »
let s = suiviDeClasse('fr_seq', dates, '2026-10-10', prog({ 1: { expected: 336, entered: 336 } }));
ok(s.courante?.order === 1 && s.courante.etat === 'a_jour', '« À jour » pour la séq 1 quand tout est saisi', s.courante);
ok(s.avenir?.fenetre.order === 2 && !s.retards.length, 'la séq 2 (non commencée) est « à venir », jamais à faire', s);
// 2. Le jour du début de la séq 2
s = suiviDeClasse('fr_seq', dates, '2026-10-16', prog({ 1: { expected: 336, entered: 336 } }));
ok(s.courante?.order === 2 && s.courante.etat === 'en_cours', 'le jour de son début : la séq 2 devient « en cours »', s.courante);
// 3. Séq 1 incomplète reste ROUGE quand la 2 démarre
s = suiviDeClasse('fr_seq', dates, '2026-10-20', prog({ 1: { expected: 336, entered: 200 } }));
ok(s.retards.length === 1 && s.retards[0].order === 1 && s.retards[0].joursRetard === 5, 'séq 1 incomplète : en retard de 5 j, même si la séq 2 a démarré', s.retards);
ok(s.courante?.order === 2, 'et la séq 2 est aussi suivie', s.courante);
// 4. Limites de dates (premier / dernier jour)
const f2 = fenetresDePiste('fr_seq', dates)[1];
ok(etatPeriode(f2, '2026-10-15', null) === 'a_venir', 'veille du début : à venir');
ok(etatPeriode(f2, '2026-10-16', { expected: 10, entered: 0 }) === 'en_cours', 'premier jour (00h00) : inclus');
ok(etatPeriode(f2, '2026-12-20', { expected: 10, entered: 0 }) === 'en_cours', 'dernier jour de la limite (23h59) : encore en cours');
ok(etatPeriode(f2, '2026-12-21', { expected: 10, entered: 0 }) === 'en_retard', 'lendemain : en retard');
ok(etatPeriode(f2, '2026-12-21', { expected: 10, entered: 10 }) === 'cloturee', 'complète après la limite : clôturée, pas d\'alerte');
// 5. Changer la date limite met à jour l'état
const d2 = { ...dates, fr_seq_2: { exam_date: '2026-12-15', deadline_date: '2026-12-31' } };
ok(etatPeriode(fenetresDePiste('fr_seq', d2)[1], '2026-12-25', { expected: 10, entered: 0 }) === 'en_cours', 'limite repoussée : plus en retard');
// 6. Pas de date : jamais d'échéance inventée
ok(etatPeriode(fenetresDePiste('fr_seq', {})[0], '2026-10-10', { expected: 10, entered: 0 }) === 'sans_date', 'aucune date : « sans date », pas d\'échéance implicite');
ok(suiviDeClasse('fr_seq', {}, '2026-10-10', prog({})).sansDate === true, 'calendrier vide : suivi signale « sans date »');
// 7. Fuseau Africa/Douala (UTC+1)
ok(jourDouala(new Date('2026-12-20T23:30:00Z')) === '2026-12-21', '23h30 UTC le 20 déc. = 00h30 le 21 à Douala (limite dépassée)', jourDouala(new Date('2026-12-20T23:30:00Z')));
ok(jourDouala(new Date('2026-12-20T22:59:00Z')) === '2026-12-20', '23h59 à Douala (22h59 UTC) : encore le 20', null);
ok(joursEntre('2026-12-20', '2026-12-25') === 5, 'écart en jours');
console.log(`\n${fail ? '❌' : '✅'} État des périodes : ${pass} ok, ${fail} ko`); process.exit(fail ? 1 : 0);
