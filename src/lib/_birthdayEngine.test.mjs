// LES ANNIVERSAIRES TOMBENT-ILS LE BON JOUR, ET UNE SEULE FOIS ?
//
// Les fonctions testées ici sont pures : aucun DOM, aucun réseau, aucune base.
// Lancer : node src/lib/_birthdayNotifications.test.mjs
//
// Ce que ce fichier protège :
//   • le bon jour — un anniversaire souhaité la veille ou le lendemain est une
//     erreur visible de toute l'école ;
//   • le 29 février, qui n'existe que trois années sur quatre ;
//   • l'identifiant déterministe, seul rempart contre dix notifications
//     identiques quand dix postes ouvrent l'application le même matin.
import {
  anniversairesDuJour, ageAtteint, idAnniversaire, messageAnniversaire, jourLocal,
  ajouterJours, anniversairesDansNJours, PREAVIS_JOURS,
} from './birthdayEngine.js';

let ko = 0;
const ok = (c, libelle, obtenu) => {
  if (c) { console.log(`✅ ${libelle}`); }
  else { console.log(`❌ ${libelle} (obtenu: ${JSON.stringify(obtenu)})`); ko++; }
};
const t = (fr) => fr;

const eleves = [
  { id: 'a', name: 'NGONO Marie',    date_naissance: '2012-09-16', class_id: 'c1' },
  { id: 'b', name: 'TABI Yannick',   date_naissance: '2013-09-16', class_id: 'c1' },
  { id: 'c', name: 'MBALLA Rose',    date_naissance: '2012-09-17', class_id: 'c2' },
  { id: 'd', name: 'ATANGANA Paul',  date_naissance: '2012-02-29', class_id: 'c2' },
  { id: 'e', name: 'SANS DATE',      date_naissance: '',            class_id: 'c1' },
  { id: 'f', name: 'DATE ILLISIBLE', date_naissance: 'né en 2012',  class_id: 'c1' },
  { id: 'g', name: 'ARCHIVE',        date_naissance: '2012-09-16', class_id: 'c1', archived_at: '2026-01-05' },
];

// ── Le bon jour ─────────────────────────────────────────────────────────────
const j16 = anniversairesDuJour(eleves, '2026-09-16').map((e) => e.id).sort();
ok(JSON.stringify(j16) === JSON.stringify(['a', 'b']), '1. seuls les élèves nés un 16/09 sont retenus', j16);

const j17 = anniversairesDuJour(eleves, '2026-09-17').map((e) => e.id);
ok(JSON.stringify(j17) === JSON.stringify(['c']), '2. le lendemain, ce sont d’autres élèves', j17);

ok(anniversairesDuJour(eleves, '2026-09-18').length === 0, '3. un jour sans anniversaire ne retient personne');

// ── Les dates inutilisables ne produisent rien ──────────────────────────────
ok(!j16.includes('e'), '4. une date de naissance vide n’invente pas d’anniversaire');
ok(!j16.includes('f'), '5. une date illisible non plus');
ok(!j16.includes('g'), '6. un élève ARCHIVÉ n’est pas fêté (il a quitté les listes)');

// ── 29 février ──────────────────────────────────────────────────────────────
// 2028 est bissextile, 2026 ne l'est pas.
ok(anniversairesDuJour(eleves, '2028-02-29').map((e) => e.id).includes('d'),
  '7. année bissextile : l’élève né un 29/02 est fêté le 29');
ok(anniversairesDuJour(eleves, '2026-02-28').map((e) => e.id).includes('d'),
  '8. année NON bissextile : il est fêté le 28 (sinon jamais)');
ok(!anniversairesDuJour(eleves, '2028-02-28').map((e) => e.id).includes('d'),
  '9. et il n’est PAS fêté deux fois une année bissextile',
  anniversairesDuJour(eleves, '2028-02-28').map((e) => e.id));

// ── Âge ─────────────────────────────────────────────────────────────────────
ok(ageAtteint('2012-09-16', '2026-09-16') === 14, '10. l’âge atteint est juste', ageAtteint('2012-09-16', '2026-09-16'));
ok(ageAtteint('', '2026-09-16') === null, '11. sans date de naissance, pas d’âge inventé');

// ── Identifiant déterministe : le rempart anti-doublon ──────────────────────
const id1 = await idAnniversaire('a', '2026-09-16');
const id2 = await idAnniversaire('a', '2026-09-16');
ok(id1 === id2, '12. deux postes le même jour calculent le MÊME identifiant', [id1, id2]);
ok(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id1),
  '13. et c’est un uuid valide (la colonne est de type uuid côté Cloud)', id1);
ok(await idAnniversaire('b', '2026-09-16') !== id1, '14. deux élèves → deux identifiants');
ok(await idAnniversaire('a', '2027-09-16') !== id1, '15. l’an prochain → un identifiant neuf, donc une notification neuve');

// ── Message ─────────────────────────────────────────────────────────────────
const m = messageAnniversaire(eleves[0], { className: '3e A', titulaire: 'ATANGANA Paul', jour: '2026-09-16', t });
ok(m.title.includes('NGONO Marie'), '16. le titre nomme l’élève', m.title);
ok(m.body.includes('14 ans') && m.body.includes('3e A') && m.body.includes('ATANGANA Paul'),
  '17. le corps porte l’âge, la classe et le titulaire (c’est ainsi que le titulaire est averti)', m.body);
const sansTitulaire = messageAnniversaire(eleves[0], { className: '3e A', titulaire: null, jour: '2026-09-16', t });
ok(!sansTitulaire.body.includes('Titulaire'), '18. classe sans titulaire : aucune mention vide', sansTitulaire.body);

// ── Jour local ──────────────────────────────────────────────────────────────
// Le piège que `toISOString()` tend : 23 h 30 à Yaoundé (UTC+1) est déjà le
// lendemain en UTC — l'anniversaire serait souhaité avec un jour de décalage.
const tard = new Date(2026, 8, 16, 23, 30, 0);
ok(jourLocal(tard) === '2026-09-16', '19. 23 h 30 reste le 16 (et non le 17 par bascule UTC)', jourLocal(tard));

// ── PRÉAVIS À 7 JOURS ───────────────────────────────────────────────────────
// L'école veut être prévenue AVANT pour préparer quelque chose. Le jour même,
// il est trop tard pour organiser une carte ou une annonce.
ok(ajouterJours('2026-09-16', 7) === '2026-09-23', '20. +7 jours dans le même mois', ajouterJours('2026-09-16', 7));
ok(ajouterJours('2026-09-28', 7) === '2026-10-05', '21. +7 jours franchit la fin du mois', ajouterJours('2026-09-28', 7));
ok(ajouterJours('2026-12-28', 7) === '2027-01-04', '22. +7 jours franchit l’ANNÉE', ajouterJours('2026-12-28', 7));
ok(ajouterJours('2028-02-25', 7) === '2028-03-03',
  '23. +7 jours traverse un 29 février (année bissextile)', ajouterJours('2028-02-25', 7));

// Le 9 septembre, on annonce les anniversaires du 16.
const preavis = anniversairesDansNJours(eleves, '2026-09-09', 7).map((e) => e.id).sort();
ok(JSON.stringify(preavis) === JSON.stringify(['a', 'b']),
  '24. sept jours avant, les élèves du 16/09 sont annoncés', preavis);
ok(anniversairesDansNJours(eleves, '2026-09-16', 7).map((e) => e.id).length === 0,
  '25. le jour même, le préavis ne réannonce pas les mêmes élèves',
  anniversairesDansNJours(eleves, '2026-09-16', 7).map((e) => e.id));

// Un élève archivé ne doit pas non plus être annoncé à l'avance.
ok(!preavis.includes('g'), '26. un élève ARCHIVÉ n’est pas annoncé non plus');

// ── Les deux notifications ne se marchent pas dessus ────────────────────────
// Même élève, même jour d'émission : si les clés se confondaient, l'une
// écraserait l'autre et l'école perdrait soit le rappel, soit le souhait.
const idJour = await idAnniversaire('a', '2026-09-16', 'jour');
const idPreavis = await idAnniversaire('a', '2026-09-16', 'preavis');
ok(idJour !== idPreavis,
  '27. préavis et notification du jour ont des identifiants DIFFÉRENTS', [idJour, idPreavis]);
ok(await idAnniversaire('a', '2026-09-16', 'preavis') === idPreavis,
  '28. et le préavis reste idempotent d’un poste à l’autre');

// ── Le texte du préavis ne ment pas sur la date ─────────────────────────────
const mp = messageAnniversaire(eleves[0], {
  className: '3e A', titulaire: null, jour: '2026-09-09', t, genre: 'preavis', dateFete: '2026-09-16',
});
ok(!mp.body.includes("aujourd'hui"),
  '29. le préavis ne dit PAS « aujourd’hui » (ce serait faux sept jours avant)', mp.body);
ok(mp.body.includes('16 septembre'), '30. il donne la date de la fête', mp.body);
ok(mp.body.includes('14 ans'), '31. et l’âge qu’il ATTEINDRA ce jour-là', mp.body);
ok(mp.title.includes('à venir'), '32. le titre annonce un anniversaire à venir', mp.title);

console.log(ko === 0 ? '\n✅ Tous les tests passent' : `\n❌ ÉCHEC : ${ko}`);
process.exitCode = ko === 0 ? 0 : 1;
