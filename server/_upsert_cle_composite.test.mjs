// UN RATTACHEMENT DE MATIÈRE PASSE-T-IL SUR UN POSTE INSTALLÉ ?
//
// ── CE QUE CE FICHIER VERROUILLE ────────────────────────────────────────────
//
// Signalé le 2026-10-23 : le référentiel ne se chargeait plus sur les postes
// installés, « la version en ligne n'a pas le problème ». En remontant la
// divergence Cloud / LAN, deux écritures de la même famille sont apparues :
//
//     supabase.from('apc_classe_matieres').upsert(ligne)        // sans clé
//     supabase.from('mat_domaines_masques').upsert(ligne)       // sans clé
//
// Ces deux tables n'ont PAS de colonne `id` : leur clé est composite. En Cloud,
// un upsert sans cible visait la clé primaire — il marchait. Le client LAN,
// lui, retombe sur son défaut `'id'`, et le serveur d'école écrit alors
// « ON CONFLICT(id) » : erreur SQLite, écriture refusée. Le rattachement d'une
// matière maison (le correctif I16) et le masquage d'un domaine de maternelle
// étaient donc MORTS en LAN, sans message, dans toutes les écoles installées.
//
// On prouve ici les deux moitiés : la cible composite passe ET est idempotente,
// la cible `id` échoue vraiment — c'est la raison d'être du paramètre explicite.
//
// Lancer : node server/_upsert_cle_composite.test.mjs
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let pass = 0, fail = 0;
const ok = (c, label, got) => { c ? (console.log(`✅ ${label}`), pass++) : (console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`), fail++); };

const dir = mkdtempSync(join(tmpdir(), 'nc-upsert-cle-'));
process.env.NOTESCAM_DATA_DIR = dir;
const { db } = await import('./db.js');
const { runQuery } = await import('./query.js');

const S = 'ecole-upsert';
const must = (op) => { const r = runQuery(op); if (r.error) throw new Error(`${op.action} ${op.table}: ${r.error.message}`); return r; };
must({ table: 'schools', action: 'insert', values: { id: S, name: 'École de test' } });

// ── 1) apc_classe_matieres : la table n'a pas d'`id` ───────────────────────
const colonnes = new Set(db.prepare('PRAGMA table_info("apc_classe_matieres")').all().map((c) => c.name));
ok(!colonnes.has('id'), 'apc_classe_matieres n’a pas de colonne id (sa clé est composite)', [...colonnes]);

const classe  = db.prepare('SELECT id FROM apc_classes LIMIT 1').get();
const matiere = db.prepare('SELECT id FROM apc_matieres LIMIT 1').get();
ok(!!classe && !!matiere, 'référentiel APC seedé (une classe, une matière)');

const ligne = {
  classe_id: classe.id, matiere_id: matiere.id,
  coefficient: 2, ordre: 7, optionnelle: 0, school_id: S,
};

// LA FORME FAUTIVE, celle que le client LAN produisait faute de cible.
const sansCle = runQuery({ table: 'apc_classe_matieres', action: 'upsert', values: ligne, onConflict: 'id' });
ok(!!sansCle.error && /id/.test(sansCle.error.message || ''),
  'ON CONFLICT(id) est bien REFUSÉ — c’est ce qui tuait le rattachement en LAN',
  sansCle.error?.message);

// LA FORME CORRIGÉE.
const avecCle = runQuery({ table: 'apc_classe_matieres', action: 'upsert', values: ligne, onConflict: 'classe_id,matiere_id' });
ok(!avecCle.error, 'ON CONFLICT(classe_id, matiere_id) passe', avecCle.error?.message);

const lu = () => db.prepare('SELECT * FROM apc_classe_matieres WHERE classe_id = ? AND matiere_id = ?').all(classe.id, matiere.id);
ok(lu().length === 1, 'une seule ligne écrite', lu().length);
ok(lu()[0].school_id === S, 'la ligne appartient bien à l’école', lu()[0]);

// Rejouer le même geste (deux postes, ou une classe rouverte) ne doit NI
// échouer NI créer un doublon : c'est tout l'intérêt de l'upsert.
const rejeu = runQuery({
  table: 'apc_classe_matieres', action: 'upsert',
  values: { ...ligne, coefficient: 3 }, onConflict: 'classe_id,matiere_id',
});
ok(!rejeu.error, 'le rejeu passe', rejeu.error?.message);
ok(lu().length === 1, 'toujours une seule ligne (aucun doublon)', lu().length);
ok(Number(lu()[0].coefficient) === 3, 'et la ligne est MISE À JOUR', lu()[0].coefficient);

// ── 2) mat_domaines_masques : même famille, même parade ────────────────────
const domaine = db.prepare('SELECT id FROM mat_domaines LIMIT 1').get();
ok(!!domaine, 'référentiel maternelle seedé (un domaine)');

const masque = { school_id: S, domaine_id: domaine.id };
const mSans = runQuery({ table: 'mat_domaines_masques', action: 'upsert', values: masque, onConflict: 'id' });
ok(!!mSans.error, 'masquer un domaine avec ON CONFLICT(id) échoue', mSans.error?.message);

const mAvec = runQuery({ table: 'mat_domaines_masques', action: 'upsert', values: masque, onConflict: 'school_id,domaine_id' });
ok(!mAvec.error, 'avec la clé composite, le masque est posé', mAvec.error?.message);
const nb = () => db.prepare('SELECT count(*) c FROM mat_domaines_masques WHERE school_id = ?').get(S).c;
ok(nb() === 1, 'un masque posé', nb());
runQuery({ table: 'mat_domaines_masques', action: 'upsert', values: masque, onConflict: 'school_id,domaine_id' });
ok(nb() === 1, 'reposer le même masque reste idempotent', nb());

console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
