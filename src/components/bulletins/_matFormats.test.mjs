// BULLETIN DE MATERNELLE — rendu réel des deux formats (composant réel, HTML statique).
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs src/components/bulletins/_matFormats.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement } = require('react');
globalThis.__VITE_ENV__ = {};
const SRC = new URL('../../', import.meta.url).href;
const { default: Mat } = await import(`${SRC}components/bulletins/BulletinMatOfficial.jsx`);
const { default: Visage } = await import(`${SRC}components/bulletins/MatEmojis.jsx`);

const school = { id: 's', name: 'ÉCOLE TEST', country_code: 'cameroon', current_year: '2026-2027' };
const eleve = { id: 'e', name: 'AIDARBEK DANIEL', matricule: 'm1', gender: 'M' };
const ROWS = [
  { code: 'D1', intitule: 'Langage et communication', parUa: {}, niveau: 'A', observation: '' },
  { code: 'D2', intitule: 'Pre-reading', parUa: {}, niveau: 'ECA', observation: 'Bravo pour les lettres' },
  { code: 'D3', intitule: 'Pre-numeracy', parUa: {}, niveau: 'NA', observation: '' },
  { code: 'D4', intitule: 'Psychomotor skills', parUa: {}, niveau: '', observation: '' },
];
const rendu = (extra = {}) => renderToStaticMarkup(createElement(Mat, {
  school, sys: 'EN', title: 'LEARNING UNIT 1 REPORT CARD — NURSERY', student: eleve, classLabel: 'Nursery 1', effectif: 12,
  profPrincipal: 'Mme X', rows: ROWS, appreciation: 'Un enfant joyeux', ...extra,
}));
const nbVisages = (h) => (h.match(/<svg viewBox="0 0 100 100"/g) || []).length;

test('Classique sans émojis : aucun visage, lettres seules (l’ancien bulletin)', () => {
  const h = rendu({ format: 'classique', emojis: false });
  assert.equal(nbVisages(h), 0);
  assert.match(h, /Level/); assert.match(h, /Key/);
  assert.doesNotMatch(h, /data-domaine|data-photo/);
  // sans aucune prop de format : exactement le même résultat
  assert.equal(rendu({}), h);
});

test('Classique avec émojis : UN visage par ligne évaluée + trois dans la légende', () => {
  const h = rendu({ format: 'classique', emojis: true });
  assert.equal(nbVisages(h), 3 + 3, '3 domaines évalués + 3 de la légende (D4 sans évaluation : aucun)');
  assert.match(h, /= Achieved/); assert.match(h, /= In progress/); assert.match(h, /= Not achieved/);
  assert.match(h, /data-photo="silhouette"/, 'photo absente : silhouette, jamais de case vide');
});

test('Enfantin : TROIS visages par domaine, observation automatique, remplacée par celle de l’enseignant', () => {
  const h = rendu({ format: 'enfantin' });
  assert.equal(nbVisages(h), 4 * 3);
  assert.match(h, /data-domaine="D1"/);
  assert.match(h, /Very good/);                    // D1 A, pas d'observation saisie
  assert.match(h, /Bravo pour les lettres/);       // D2 : celle de l'enseignant
  assert.doesNotMatch(h, /Getting there/, 'la phrase automatique ne s’ajoute jamais à celle de l’enseignant');
  assert.match(h, /Let’s practise together/);      // D3 NA
  assert.match(h, /Achieved/); assert.match(h, /In progress/); assert.match(h, /Not achieved/);
  assert.match(h, /Class teacher’s general remarks/);
  assert.match(h, /Un enfant joyeux/);
});

test('Enfantin : domaine sans évaluation = trois visages gris et « — », sans erreur', () => {
  const h = rendu({ format: 'enfantin', rows: [ROWS[3]] });
  assert.equal(nbVisages(h), 3);
  assert.doesNotMatch(h, /fill="#fcd34d"/, 'aucun visage jaune : tous effacés');
  assert.match(h, /—<\/div>/);
});

test('Enfantin : aucun total, moyenne, rang ni coefficient ; titre = celui de la période (jamais « Trimestre » en dur)', () => {
  const h = rendu({ format: 'enfantin', title: 'LEARNING UNIT 3 REPORT CARD — NURSERY' });
  assert.doesNotMatch(h, /Moyenne|Average|Rank|Rang|Coef|Total/);
  assert.match(h, /LEARNING UNIT 3 REPORT CARD/);
  assert.doesNotMatch(h, /Trimestre|Term/);
});

test('les deux formats lisent les MÊMES évaluations : aucune ne se perd en changeant de format', () => {
  const lettres = (h) => ['Langage et communication', 'Pre-reading', 'Pre-numeracy', 'Psychomotor skills'].every((x) => h.includes(x));
  assert.ok(lettres(rendu({ format: 'classique' })) && lettres(rendu({ format: 'classique', emojis: true })) && lettres(rendu({ format: 'enfantin' })));
  // le visage mis en valeur correspond au niveau : D1 = A (vert), D2 = IP (orange), D3 = NA (bleu)
  const h = rendu({ format: 'enfantin' });
  for (const c of ['#16a34a', '#f59e0b', '#38bdf8']) assert.ok(h.includes(c), c);
});

test('visage « non acquis » : encourageant (sourcils arqués) ≠ un peu triste (moue) ; jamais de larme', () => {
  const enc = renderToStaticMarkup(createElement(Visage, { niveau: 'NA', visage: 'encourageant' }));
  const tri = renderToStaticMarkup(createElement(Visage, { niveau: 'NA', visage: 'triste' }));
  assert.notEqual(enc, tri);
  assert.ok(enc.includes('M37 62 Q51 70 65 57'), 'sourire en coin');
  assert.ok(tri.includes('M38 68 Q50 59 62 68'), 'petite moue');
  for (const h of [enc, tri]) assert.doesNotMatch(h, /tear|larme|#3b82f6.*ellipse.*larme/i);
  // chaque niveau a son anneau : A vert, ECA orange, NA bleu
  assert.ok(renderToStaticMarkup(createElement(Visage, { niveau: 'A' })).includes('stroke="#16a34a"'));
  assert.ok(renderToStaticMarkup(createElement(Visage, { niveau: 'ECA' })).includes('stroke="#f59e0b"'));
  assert.ok(enc.includes('stroke="#38bdf8"'));
  // effacé : pas de couleur de niveau, pas de pastille
  const gris = renderToStaticMarkup(createElement(Visage, { niveau: 'A', actif: false }));
  assert.ok(!gris.includes('#16a34a'));
});

test('cas limites : nom très long, école sans logo, 14 domaines, photo en URL, couleur de l’école suivie', () => {
  const long = 'NGUEMA ONDOA Marie-Claire Françoise Éléonore de la Rédemption Mballa Essomba';
  assert.ok(rendu({ format: 'enfantin', student: { ...eleve, name: long } }).includes('Mballa Essomba'));
  const dix4 = Array.from({ length: 14 }, (_, i) => ({ ...ROWS[0], code: `D${i + 1}` }));
  assert.equal(nbVisages(rendu({ format: 'enfantin', rows: dix4 })), 42);
  assert.match(rendu({ format: 'enfantin', student: { ...eleve, photo_url: 'https://exemple.test/p.jpg' } }), /data-photo="pleine"|data-photo="silhouette"/);
  const rouge = rendu({ format: 'enfantin', school: { ...school, bulletin_accent: '#b91c1c' } });
  assert.ok(rouge.includes('#b91c1c'));
  assert.ok(!rouge.includes('#047857'), 'plus de vert par défaut quand l’école a choisi le rouge');
});

test('français : libellés de la langue de l’école', () => {
  const h = rendu({ format: 'enfantin', sys: 'FR', title: 'BULLETIN DE L\'UA1 — MATERNELLE' });
  for (const m of ['Acquis', 'En cours', 'Non acquis', 'Très bien', 'DOMAINES D’APPRENTISSAGE']) assert.ok(h.includes(m), m);
});
