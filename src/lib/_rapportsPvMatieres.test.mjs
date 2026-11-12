// RAPPORTS ET PV : toute matière configurée pour la classe y figure — Chinois (compétence d'école sans barème
// national), classes bilingues (union des deux programmes, ordre logique), 15 matières et plus.
//   node --experimental-loader ./scripts/lib/esm-resolve.mjs src/lib/_rapportsPvMatieres.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
globalThis.__VITE_ENV__ = {};
const { buildClassReport } = await import('./classReportEngine.js');
const { buildClassPv } = await import('./pvEngine.js');

const SCHOOL = 's1';
const CRITERES = [{ id: 'ecrit', nom: 'Écrit', ordre: 1 }, { id: 'oral', nom: 'Oral', ordre: 2 }];
const nat = (id, code, intitule, bareme) => ({ c: { id, code, intitule, coefficient: 1, ordre: 1, actif: true },
  b: [{ niveau_id: 'cm1', competence_id: id, critere_id: 'ecrit', points_max: bareme, ordre: 1, aptitude: 'apte' }] });
const maison = (id, code, intitule) => ({ c: { id, code, intitule, coefficient: 1, ordre: 9, actif: true, school_id: SCHOOL }, b: [] });

function monter(defs) {
  return {
    competences: defs.map((d) => d.c), criteres: CRITERES, baremeCriteres: defs.flatMap((d) => d.b),
    bareme: [],
  };
}
const note = (el, comp, ua, n, max) => ({ [`${el}_${comp}_ecrit_${ua}`]: { eleve_id: el, competence_id: comp, critere_id: 'ecrit', ua, note: n, points_max: max } });
const students = [{ id: 'e1', name: 'Abena' }, { id: 'e2', name: 'Biya' }];
const sub = (name, position) => ({ id: `sub-${position}`, name, class_id: 'c1', position });

function documents({ defs, subjects, cls }) {
  let primNotes = {};
  for (const d of defs) for (const el of ['e1', 'e2']) primNotes = { ...primNotes, ...note(el, d.c.id, 1, el === 'e1' ? 15 : 12, 20) };
  const primReferentiel = monter(defs);
  const rapport = buildClassReport({ engine: 'apc_primaire', cls, students, subjects, period: { seqs: [1] }, primNotes, primReferentiel });
  const pv = buildClassPv({ cls, engine: 'apc_primaire', sys: cls.system, cycle: 'primaire', countryCode: 'cameroon', schoolYear: '2026-2027',
    period: 'trim1', students, subjects, gradeMap: {}, opts: {}, primReferentiel, primNotes, primNiveauSlug: 'cm1', primBareme: [] });
  return { rapport, pv };
}

test('P1 — « Chinois » (compétence d’école, aucune ligne au barème national) figure au rapport ET au PV, avec ses valeurs', () => {
  const defs = [nat('k1', '1A', 'Lire', 20), maison('zh', 'ZH', 'Chinois')];
  const cls = { id: 'c1', level: 'CM1', name: 'CM1 A', system: 'FR' };
  const { rapport, pv } = documents({ defs, subjects: [sub('Lire', 1), sub('Chinois', 2)], cls });
  assert.ok(pv, 'un PV est produit');
  assert.ok(pv.cols.some((c) => /Chinois/.test(c.name)), 'colonne Chinois au PV');
  assert.ok(rapport.columns.some((c) => /Chinois/.test(c.name)), 'colonne Chinois au rapport');
  const zh = pv.cols.find((c) => /Chinois/.test(c.name));
  const ligne = pv.rows.find((r) => r.id === 'e1');
  assert.ok(Object.values(ligne.cells[zh.key].byUnit).some((v) => v === 15) || ligne.cells[zh.key].moy === 15, `valeur Chinois au PV : ${JSON.stringify(ligne.cells[zh.key])}`);
  const colR = rapport.columns.find((c) => /Chinois/.test(c.name));
  assert.equal(rapport.rows.find((r) => r.student.id === 'e1').scores[colR.id], 15, 'moyenne Chinois au rapport (15/20)');
});

test('P2 — classe bilingue de 14 matières (Chinois compris) : tout est au PV et au rapport, sans doublon', () => {
  const noms = [['k1', '1A', 'Français'], ['k2', '2A', 'Mathématiques'], ['k3', '2B', 'Sciences'], ['k4', '5A', 'TIC']];
  const defs = noms.map(([i, c, n]) => nat(i, c, n, 20));
  defs.push(maison('en1', 'E1', 'English Language'), maison('en2', 'E2', 'Mathematics'), maison('en3', 'E3', 'Social Studies'),
    maison('en4', 'E4', 'Citizenship'), maison('en5', 'E5', 'Literature'), maison('en6', 'E6', 'Health Education'),
    maison('fr5', 'F5', 'Dictée'), maison('fr6', 'F6', 'Géographie'), maison('zh', 'ZH', 'Chinois'), maison('fr7', 'F7', 'Histoire'));
  const subjects = defs.map((d, i) => sub(d.c.intitule, i + 1));
  const cls = { id: 'c1', level: 'CM1', name: 'CM1 BIL', system: 'FR' };
  const { rapport, pv } = documents({ defs, subjects, cls });
  assert.equal(subjects.length, 14);
  const attendus = defs.map((d) => d.c.intitule);
  for (const n of attendus) {
    assert.ok(pv.cols.some((c) => c.name.includes(n)), `PV : ${n}`);
    assert.ok(rapport.columns.some((c) => c.name.includes(n)), `rapport : ${n}`);
  }
  assert.equal(new Set(pv.cols.map((c) => c.key)).size, pv.cols.length, 'aucun doublon au PV');
  assert.equal(pv.cols.length, 14);
  assert.equal(rapport.columns.length, 14);
});

test('P2 — un élève sans note dans une matière garde la colonne (cellule vide, jamais NaN)', () => {
  const defs = [nat('k1', '1A', 'Lire', 20), maison('zh', 'ZH', 'Chinois')];
  const cls = { id: 'c1', level: 'CM1', name: 'CM1 A', system: 'FR' };
  const primNotes = note('e1', 'zh', 1, 15, 20);
  const primReferentiel = monter(defs);
  const pv = buildClassPv({ cls, engine: 'apc_primaire', sys: 'FR', cycle: 'primaire', countryCode: 'cameroon', schoolYear: '2026-2027',
    period: 'trim1', students, subjects: [sub('Lire', 1), sub('Chinois', 2)], gradeMap: {}, opts: {}, primReferentiel, primNotes, primNiveauSlug: 'cm1', primBareme: [] });
  assert.equal(pv.cols.length, 2);
  const e2 = pv.rows.find((r) => r.id === 'e2');
  for (const c of pv.cols) assert.ok(e2.cells[c.key].moy == null || Number.isFinite(e2.cells[c.key].moy));
});

// ── P3 : thème sobre central + mise en page adaptative ──
const { themeOf, dispositionMatieres, abreger, legendeAbreviations, POLICE_MIN_PT } = await import('./documentTheme.js');
const { pvSheetHtml } = await import('./pvDoc.js');

test('P3 — thème : défauts sobres, surcharge par école, valeur invalide ignorée', () => {
  const t = themeOf({});
  assert.deepEqual([t.headerBg, t.text, t.line, t.zebra, t.accent], ['#F2F2F2', '#222222', '#999999', '#FAFAFA', '#1F2A44']);
  assert.equal(themeOf({ document_theme: { accent: '#333333' } }).accent, '#333333');
  assert.equal(themeOf({ document_theme: { accent: 'red;x' } }).accent, '#1F2A44');
});

test('P3 — disposition : paysage > 8 matières, police jamais sous 7 pt, vertical et bandes pour 18+', () => {
  assert.equal(dispositionMatieres(6).paysage, false);
  assert.equal(dispositionMatieres(9).paysage, true);
  for (const n of [1, 8, 12, 20, 40]) assert.ok(dispositionMatieres(n).policePt >= POLICE_MIN_PT);
  assert.equal(dispositionMatieres(20).vertical, true);
  const b = dispositionMatieres(33).bandes;
  assert.equal(b.length, 3);
  assert.equal(b[0][0], 0); assert.equal(b[b.length - 1][1], 33);
});

test('P3 — abréviations : jamais de perte, légende pour les seuls intitulés abrégés, abréviation d’école prioritaire', () => {
  assert.equal(abreger('Lire'), 'Lire');
  assert.equal(abreger('Éducation à la citoyenneté'), 'Éduc. Citoy.');
  assert.equal(abreger('Éducation à la citoyenneté', { document_abbrev: { 'Éducation à la citoyenneté': 'ECM' } }), 'ECM');
  const l = legendeAbreviations(['Lire', 'Éducation à la citoyenneté']);
  assert.deepEqual(l, [{ abrege: 'Éduc. Citoy.', complet: 'Éducation à la citoyenneté' }]);
});

test('P3 — le PV n’imprime plus ni aplat marine ni dégradé ; 18 matières : légende et deux bandes qui répètent la colonne des élèves', () => {
  const defs = Array.from({ length: 18 }, (_, i) => maison(`m${i}`, `M${i}`, i === 5 ? 'Éducation à la citoyenneté' : `Matière ${i}`));
  const subjects = defs.map((d, i) => sub(d.c.intitule, i + 1));
  const cls = { id: 'c1', level: 'CM1', name: 'CM1 A', system: 'FR' };
  const { pv } = documents({ defs, subjects, cls });
  const html = pvSheetHtml(pv, { school: { name: 'E', country_code: 'cameroon' } });
  assert.ok(!/#1e3a5f/i.test(html), 'plus de bleu marine d’aplat');
  assert.ok(!/gradient/i.test(html));
  assert.ok(html.includes('#F2F2F2') && html.includes('#999999') && html.includes('#FAFAFA'));
  assert.equal((html.match(/<table style="width:100%;border-collapse:collapse;table-layout:fixed/g) || []).length, 2, 'deux bandes');
  assert.ok(html.includes('data-part="legende"') && html.includes('Éduc. Citoy. = Éducation à la citoyenneté'));
  for (const d of defs) assert.ok(html.includes(d.c.intitule) || html.includes(abreger(d.c.intitule, null, 18)), d.c.intitule);
});

// ── Parité bulletin / PV : MÊME fonction de critères, même portée (classe + UA de la période) ──
const { criteresPourDocument } = await import('../core/primEngine.js');

test('Chinois : valeur du PV = moyenne du bulletin élève par élève ; 0 s’affiche 0, l’absence « — »', () => {
  const defs = [nat('k1', '1A', 'Lire', 20), maison('zh', 'ZH', 'Chinois')];
  const cls = { id: 'c1', level: 'CM1', name: 'CM1 A', system: 'FR' };
  const trois = [{ id: 'e1', name: 'A' }, { id: 'e2', name: 'B' }, { id: 'e3', name: 'C' }];
  const primNotes = { ...note('e1', 'zh', 1, 14, 20), ...note('e2', 'zh', 1, 0, 20), ...note('e1', 'k1', 1, 10, 20) };
  const primReferentiel = monter(defs);
  const pv = buildClassPv({ cls, engine: 'apc_primaire', sys: 'FR', cycle: 'primaire', countryCode: 'cameroon', schoolYear: '2026-2027',
    period: 'seq1', students: trois, subjects: [sub('Lire', 1), sub('Chinois', 2)], gradeMap: {}, opts: {}, primReferentiel, primNotes, primNiveauSlug: 'cm1', primBareme: [] });
  const zh = pv.cols.find((c) => /Chinois/.test(c.name)).key;
  const v = (id) => pv.rows.find((r) => r.id === id).cells[zh].moy;
  assert.equal(v('e1'), 14);
  assert.equal(v('e2'), 0, 'un zéro est une note');
  assert.equal(v('e3'), null, 'aucune note : « — »');
  // même critères que le bulletin (fonction partagée, portée = élèves de la classe + UA de la période)
  const crit = criteresPourDocument(primReferentiel, 'cm1', 'zh', 'apte', [], primNotes, { eleveIds: ['e1', 'e2', 'e3'], uas: [1] });
  assert.deepEqual(crit.map((c) => [c.id, c.points_max]), [['ecrit', 20]]);
});

test('le barème de secours ne se lit pas sur les notes d’une AUTRE classe ni d’une autre UA', () => {
  const defs = [maison('zh', 'ZH', 'Chinois')];
  const primReferentiel = monter(defs);
  const primNotes = { ...note('autre', 'zh', 1, 30, 50), ...note('e1', 'zh', 2, 10, 20) };
  assert.deepEqual(criteresPourDocument(primReferentiel, 'cm1', 'zh', 'apte', [], primNotes, { eleveIds: ['e1'], uas: [1] }), []);
  assert.equal(criteresPourDocument(primReferentiel, 'cm1', 'zh', 'apte', [], primNotes, { eleveIds: ['e1'], uas: [2] })[0].points_max, 20);
});

test('une classe sans Chinois n’affiche pas de colonne Chinois', () => {
  const defs = [nat('k1', '1A', 'Lire', 20), maison('zh', 'ZH', 'Chinois')];
  const cls = { id: 'c1', level: 'CM1', name: 'CM1 A', system: 'FR' };
  const { pv } = documents({ defs, subjects: [sub('Lire', 1)], cls });
  assert.ok(!pv.cols.some((c) => /Chinois/.test(c.name)));
});
