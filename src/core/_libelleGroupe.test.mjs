import { APC_GROUPS, libelleGroupe } from './subjectGroup.js';
let fails = 0;
const ok = (c, m, got) => { console.log(c ? '  ✓' : '  ✗', m, c ? '' : JSON.stringify(got)); if (!c) fails++; };
const g = (k) => APC_GROUPS.find((x) => x.key === k);
for (const n of ['FORM1', 'Form 2', 'FORM 1 A']) {
  ok(libelleGroupe(g('SCIENCES_EXACTES'), false, n) === 'SCIENCE AND TECHNOLOGY', `${n} : sciences`, libelleGroupe(g('SCIENCES_EXACTES'), false, n));
  ok(libelleGroupe(g('ARTS_SPORTS'), true, n) === 'PERSONAL DEVELOPMENT', `${n} : arts`);
}
for (const n of ['6eme', '6ème', '5eme A', '5e', '6EME']) {
  ok(libelleGroupe(g('SCIENCES_EXACTES'), false, n) === 'SCIENCES ET TECHNOLOGIES', `${n} : sciences`, libelleGroupe(g('SCIENCES_EXACTES'), false, n));
  ok(libelleGroupe(g('ARTS_SPORTS'), false, n) === 'DÉVELOPPEMENT PERSONNEL', `${n} : arts`);
}
for (const n of ['4eme', 'FORM3', 'Class 6', 'Tle D', '', undefined]) {
  ok(libelleGroupe(g('SCIENCES_EXACTES'), false, n) === 'SCIENCES EXACTES', `${n} : inchangé FR`);
  ok(libelleGroupe(g('ARTS_SPORTS'), true, n) === 'ARTS & SPORTS', `${n} : inchangé EN`);
}
ok(libelleGroupe(g('LANGUES'), false, '6eme') === 'LANGUES', 'autres groupes inchangés');
process.exit(fails ? 1 : 0);
