import { strict as assert } from 'node:assert';
import { createHash, randomUUID } from 'node:crypto';
import { uuidV5, sourceUuid, NS_NOTESCAM_IMPORT } from './sourceKey.js';

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const eq = (a, b, msg) => { assert.equal(a, b, msg); n++; };

// ── Conformité RFC 4122 : vecteur de référence ──────────────────────────────
// uuid5(namespace DNS, 'python.org') est le vecteur publié par la RFC/CPython.
eq(uuidV5('python.org', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'),
   '886313e1-3b8a-5372-9b90-0c9aee199e5d', 'vecteur RFC 4122 (DNS/python.org)');

// Le SHA-1 maison doit coïncider avec celui de node:crypto, sinon toute la
// dérivation est fausse sans que rien ne le signale.
function refV5(name, ns) {
  const hex = ns.replace(/-/g, '');
  const nsBytes = Buffer.from(hex, 'hex');
  const h = createHash('sha1').update(Buffer.concat([nsBytes, Buffer.from(name, 'utf8')])).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const s = h.subarray(0, 16).toString('hex');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}
for (const name of ['a', 'depense|x|y|1', 'é'.repeat(30), 'Ωmega — 漢字 🎒', 'x'.repeat(200)]) {
  eq(uuidV5(name), refV5(name, NS_NOTESCAM_IMPORT), `SHA-1 conforme : « ${name.slice(0, 18)} »`);
}

// ── Idempotence : c'est tout l'objet du module ──────────────────────────────
const args = { schoolId: '6b68407b-3d2e-426b-81ff-c4e68e66120a', sourceFile: 'SORTIES DU COLLEGE.xlsx', sourceRow: 18 };
eq(sourceUuid(args), sourceUuid({ ...args }), 'même origine → même identifiant (import relançable)');
eq(sourceUuid({ ...args, sourceRow: '18' }), sourceUuid(args), 'ligne 18 numérique ou texte : même identifiant');

// ── Unicité : deux origines différentes ne doivent JAMAIS se télescoper ─────
ok(sourceUuid(args) !== sourceUuid({ ...args, sourceRow: 19 }), 'ligne différente → identifiant différent');
ok(sourceUuid(args) !== sourceUuid({ ...args, sourceFile: 'DEPENSES 2027.xlsx' }), 'fichier différent → identifiant différent');
ok(sourceUuid(args) !== sourceUuid({ ...args, schoolId: randomUUID() }), 'école différente → identifiant différent');
// Le `kind` sépare les espaces : la même ligne peut porter une dépense ET un
// mouvement de caisse, qui sont deux enregistrements distincts.
ok(sourceUuid(args) !== sourceUuid({ ...args, kind: 'cash' }), 'nature différente → identifiant différent');

// Pas de collision par concaténation ambiguë : 'f' + '1|2' ne doit pas donner la
// même chaîne que 'f|1' + '2'.
ok(sourceUuid({ ...args, sourceFile: 'f', sourceRow: '1|2' })
   !== sourceUuid({ ...args, sourceFile: 'f|1', sourceRow: '2' }), 'séparateur non ambigu');

// ── Forme ──────────────────────────────────────────────────────────────────
const u = sourceUuid(args);
ok(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(u), `forme UUID v5 : ${u}`);

// ── Garde-fous : une origine incomplète ne doit pas produire d'id silencieux ─
for (const bad of [{}, { schoolId: 'x' }, { schoolId: 'x', sourceFile: 'f' }, { schoolId: 'x', sourceFile: 'f', sourceRow: '' }]) {
  assert.throws(() => sourceUuid(bad), /requis/, 'origine incomplète → refus explicite');
  n++;
}
assert.throws(() => uuidV5('x', 'pas-un-uuid'), /namespace/, 'namespace invalide → refus');
n++;

console.log(`sourceKey : ${n} assertions OK`);
