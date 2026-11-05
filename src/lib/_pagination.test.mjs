// LE PLAFOND DE 1000 LIGNES DE PostgREST — « les notes ne persistent pas », 2026-11-05.
//
// MESURÉ DANS LE NAVIGATEUR DE L'ÉCOLE, sur la base réelle de BRIGHT CONTINENT, pendant
// qu'elle répétait que les notes disparaissaient :
//     total en base ................ 1 873
//     reçues par l'application ..... 1 000
//     invisibles ...................   873
//
// Aucune erreur, aucun refus : le serveur répond 200 et tronque. Une note saisie partait
// bien — POST 200 vérifié, la ligne est en base — mais au rechargement suivant elle
// tombait hors des mille premières lignes et l'écran l'affichait vide. D'où le motif qui
// rendait le défaut incompréhensible : certaines cellules tenaient, d'autres non, sans
// règle apparente. C'est l'ordre physique des lignes qui décidait, pas la saisie.
//
// RIEN N'AVAIT JAMAIS ÉTÉ PERDU. Tout était en base, et invisible.
//
// Ce banc tient la pagination sur un client simulé qui reproduit le plafond à
// l'identique, et vérifie qu'aucun des quatre appels concernés ne l'a contourné.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// Un faux PostgREST : il PLAFONNE à 1000 lignes quand on ne lui donne pas de `.range()`,
// exactement comme le vrai. C'est tout l'enjeu : sans plafond, le banc ne prouve rien.
function faussePostgrest(nbLignes, { plafond = 1000 } = {}) {
  const toutes = Array.from({ length: nbLignes }, (_, i) => ({ id: `n-${String(i).padStart(5, '0')}`, note: i }));
  const appels = [];
  const builder = () => {
    let from = null;
    let to = null;
    const q = {
      range(a, b) { from = a; to = b; return q; },
      then(res) {
        appels.push(from === null ? 'sans-range' : `${from}-${to}`);
        const debut = from === null ? 0 : from;
        const fin = from === null ? plafond : Math.min(to + 1, debut + plafond);
        res({ data: toutes.slice(debut, fin), error: null });
      },
    };
    return q;
  };
  return { builder, appels, toutes };
}

const { fetchAllRows } = await import('../core/pagination.js');

test('MESURE DE L’ÉCOLE : 1 873 lignes, et on les obtient TOUTES', async () => {
  const faux = faussePostgrest(1873);
  const rows = await fetchAllRows(faux.builder, 'test');
  assert.equal(rows.length, 1873, 'les 873 lignes invisibles doivent revenir');
  // Et sans doublon ni trou : c'est ce que garantit l'ordre sur une clé unique.
  assert.equal(new Set(rows.map((r) => r.id)).size, 1873);
  assert.equal(rows[0].id, 'n-00000');
  assert.equal(rows[1872].id, 'n-01872');
});

test('le défaut sans pagination : un seul appel, et 873 lignes manquent', async () => {
  const faux = faussePostgrest(1873);
  const { data } = await new Promise((res) => faux.builder().then(res));
  assert.equal(data.length, 1000, 'c’est exactement ce que l’application recevait');
});

test('aucune ligne perdue ni doublée à la frontière des pages', async () => {
  for (const n of [999, 1000, 1001, 5999, 6000, 6001]) {
    const rows = await fetchAllRows(faussePostgrest(n).builder, 'test');
    assert.equal(rows.length, n, `${n} lignes attendues`);
    assert.equal(new Set(rows.map((r) => r.id)).size, n, `${n} : pas de doublon`);
  }
});

test('une table vide ne pose aucun problème', async () => {
  assert.deepEqual(await fetchAllRows(faussePostgrest(0).builder, 'test'), []);
});

test('en LAN (pas de .range), un seul appel suffit — il n’y a pas de plafond', async () => {
  // localClient ne plafonne pas : paginer y serait inutile, et `.range` n'existe pas.
  let appels = 0;
  const builder = () => ({ then: (res) => { appels += 1; res({ data: [{ id: 'a' }, { id: 'b' }], error: null }); } });
  const rows = await fetchAllRows(builder, 'test');
  assert.equal(appels, 1);
  assert.deepEqual(rows, [{ id: 'a' }, { id: 'b' }]);
});

test('une erreur dès la première vague rend `null` — l’appelant garde ses données locales', async () => {
  const builder = () => ({ range: () => builder(), then: (res) => res({ data: null, error: { message: 'boom' } }) });
  assert.equal(await fetchAllRows(builder, 'test'), null);
});

test('LES QUATRE LECTURES SONT BIEN PASSÉES PAR LA PAGINATION', () => {
  // Le défaut tenait à ce que `fetchAllRows` existait déjà — mais PRIVÉ à schoolService.
  // Les notes du primaire, de l'APC et de la maternelle ne l'ont jamais traversé. Si l'un
  // de ces appels revient un jour à un `select` nu, ce banc doit tomber.
  const prim = lire('./primService.js');
  const apc = lire('./apcService.js');
  const mat = lire('./matService.js');

  assert.ok(prim.includes("return fetchToutesLesLignes('prim_notes', schoolId, 'fetchPrimNotes');"));
  assert.ok(prim.includes("return fetchToutesLesLignes('prim_competences_non_evaluees', schoolId,"));
  assert.ok(apc.includes("return fetchToutesLesLignes('apc_notes', schoolId, 'fetchApcNotes');"));
  assert.ok(mat.includes("return fetchToutesLesLignes('mat_observations', schoolId, 'fetchMatObservations');"));

  // Et plus aucun select nu sur ces tables de lecture complète.
  for (const [nom, src, table] of [['primService', prim, 'prim_notes'], ['apcService', apc, 'apc_notes'],
    ['matService', mat, 'mat_observations']]) {
    assert.ok(!src.includes(`from('${table}').select('*').eq('school_id', schoolId)`),
      `${nom} ne doit plus lire ${table} sans pagination`);
  }
});

test('l’ordre déterministe est exigé — sinon la pagination saute des lignes', () => {
  const src = lire('../core/pagination.js');
  assert.ok(lire('./pagination.js').includes('.order(ordre)'), 'fetchToutesLesLignes doit toujours ordonner');
  assert.ok(src.includes('export async function fetchAllRows'), 'le helper doit être public');
});
