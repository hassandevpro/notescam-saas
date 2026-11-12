// BULLETIN DE MATERNELLE — choix du format, émojis, visage « non acquis », observations automatiques.
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs src/core/_matBulletin.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

const M = await import(new URL('./matBulletin.js', import.meta.url).href);

test('une école existante (rien de choisi) garde l’ancien bulletin : Classique, sans émojis', () => {
  for (const school of [null, {}, { bulletin_mat_format: null, bulletin_mat_emojis: null, bulletin_mat_visage_na: null }]) {
    assert.deepEqual(M.reglagesMaternelle(school, {}), { format: 'classique', emojis: false, visage: 'triste' });
  }
});

test('format : la classe l’emporte, sinon le défaut de l’école, sinon Classique ; valeur inconnue ignorée', () => {
  const ecole = { bulletin_mat_format: 'enfantin' };
  assert.equal(M.formatMaternelle(ecole, {}), 'enfantin');
  assert.equal(M.formatMaternelle(ecole, { bulletin_mat_format: null }), 'enfantin');
  assert.equal(M.formatMaternelle(ecole, { bulletin_mat_format: 'classique' }), 'classique');
  assert.equal(M.formatMaternelle({ bulletin_mat_format: 'classique' }, { bulletin_mat_format: 'enfantin' }), 'enfantin', 'Nursery 1 enfantin, Nursery 2 classique');
  assert.equal(M.formatMaternelle({ bulletin_mat_format: 'inconnu' }, { bulletin_mat_format: 'xx' }), 'classique');
  assert.equal(M.classeSuitLeDefaut({}), true);
  assert.equal(M.classeSuitLeDefaut({ bulletin_mat_format: 'enfantin' }), false);
});

test('émojis du Classique : seul un « oui » explicite les allume ; l’Enfantin en porte toujours', () => {
  assert.equal(M.emojisClassique({ bulletin_mat_emojis: true }), true);
  assert.equal(M.emojisClassique({ bulletin_mat_emojis: 1 }), true);
  for (const v of [false, 0, null, undefined, '', 'non']) assert.equal(M.emojisClassique({ bulletin_mat_emojis: v }), false, String(v));
  assert.equal(M.reglagesMaternelle({ bulletin_mat_format: 'enfantin', bulletin_mat_emojis: false }, {}).emojis, true);
  assert.equal(M.reglagesMaternelle({ bulletin_mat_emojis: true }, {}).emojis, true);
});

test('information de première ouverture : seulement si la colonne existe et n’a jamais été renseignée', () => {
  assert.equal(M.emojisAChoisir({ bulletin_mat_emojis: null }), true);
  assert.equal(M.emojisAChoisir({ bulletin_mat_emojis: false }), false, 'choix fait : « garder les lettres »');
  assert.equal(M.emojisAChoisir({ bulletin_mat_emojis: true }), false);
  assert.equal(M.emojisAChoisir({}), false, 'migration Cloud pas passée : on ne demande rien');
  assert.equal(M.emojisAChoisir(null), false);
});

test('visage « non acquis » : défaut triste en Classique, encourageant en Enfantin ; l’école peut inverser dans les deux', () => {
  assert.equal(M.visageNonAcquis({}, 'classique'), 'triste');
  assert.equal(M.visageNonAcquis({}, 'enfantin'), 'encourageant');
  assert.equal(M.visageNonAcquis({ bulletin_mat_visage_na: 'encourageant' }, 'classique'), 'encourageant');
  assert.equal(M.visageNonAcquis({ bulletin_mat_visage_na: 'triste' }, 'enfantin'), 'triste');
  assert.equal(M.visageNonAcquis({ bulletin_mat_visage_na: 'colere' }, 'enfantin'), 'encourageant', 'jamais un visage hors de la liste');
});

test('observation : celle de l’enseignant remplace TOUJOURS la phrase automatique, dans la langue de l’école', () => {
  assert.equal(M.observationAffichee('Très appliqué', 'A', 'FR'), 'Très appliqué');
  assert.equal(M.observationAffichee('  ', 'A', 'EN'), 'Very good');
  assert.equal(M.observationAffichee('', 'ECA', 'EN'), 'Getting there');
  assert.equal(M.observationAffichee(null, 'NA', 'EN'), 'Let’s practise together');
  assert.equal(M.observationAffichee('', 'A', 'FR'), 'Très bien');
  assert.equal(M.observationAffichee('', '', 'FR'), '—', 'aucune évaluation : un tiret, jamais d’erreur');
});

test('arc-en-ciel cyclique : huit teintes puis on recommence ; libellés de niveaux selon la langue', () => {
  assert.equal(M.MAT_ARC_EN_CIEL.length, 8);
  assert.equal(M.couleurDomaine(0).pastille, M.couleurDomaine(8).pastille);
  assert.notEqual(M.couleurDomaine(0).pastille, M.couleurDomaine(1).pastille);
  assert.equal(M.libelleNiveau('A', 'EN'), 'Achieved');
  assert.equal(M.libelleNiveau('ECA', 'EN'), 'In progress');
  assert.equal(M.libelleNiveau('NA', 'FR'), 'Non acquis');
});

test('densité : inchangée jusqu’à dix domaines, puis resserrée sans jamais passer sous le plancher', () => {
  assert.equal(M.densiteDomaines(6), 1);
  assert.equal(M.densiteDomaines(10), 1);
  assert.ok(M.densiteDomaines(14) < 1 && M.densiteDomaines(14) >= 0.55);
  assert.equal(M.densiteDomaines(100), 0.55);
});
