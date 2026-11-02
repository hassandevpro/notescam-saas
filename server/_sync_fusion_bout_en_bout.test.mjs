// Test BOUT EN BOUT — la fusion par champ à travers `syncOnce`, deux nœuds.
//
// POURQUOI CE SECOND FICHIER. `_sync_fusion.test.mjs` éprouve le moteur de
// fusion en unitaire : on lui donne trois lignes, on lit ce qu'il rend. Il ne
// prouve PAS que le moteur est branché. Et il ne peut pas : dans une base
// neuve, aucune ligne n'a d'ombre, donc le tirage ne passe jamais par la
// fusion. Un moteur juste, jamais appelé, ne corrige rien — c'est exactement
// le genre d'écart qui a coûté les liens de fratrie.
//
// Ce fichier-ci fait le chemin complet :
//   1. l'école crée un élève et le POUSSE  → l'ombre se pose au push accepté
//   2. l'école corrige son MATRICULE hors ligne
//   3. le Cloud a corrigé son NOM pendant ce temps
//   4. un cycle de synchronisation → les DEUX corrections doivent tenir,
//      et la ligne doit REPARTIR vers le Cloud (il ignore le matricule).
//
// C'est le scénario que le responsable décrivait, joué de bout en bout.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-fus-e2e-'));
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

const { db, lireOmbre } = await import('./db.js');
const { runQuery } = await import('./query.js');
const { syncOnce } = await import('./cloudSync.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};
const eleve = () => db.prepare("SELECT * FROM students WHERE id = 'e1'").get();
const enFile = () => db.prepare("SELECT op FROM sync_outbox WHERE tablename = 'students' AND row_id = 'e1'").get()?.op;

db.prepare('INSERT INTO schools (id, name) VALUES (?,?)').run('sch1', 'GENIUS');
db.prepare('INSERT INTO classes (id, school_id, name) VALUES (?,?,?)').run('c1', 'sch1', '6e');

// ── ÉTAPE 1 : l'école crée l'élève, et il monte au Cloud ──────────────────
runQuery({ table: 'students', action: 'upsert', onConflict: 'id',
  values: { id: 'e1', school_id: 'sch1', class_id: 'c1', name: 'Marie Ngo',
    matricule: '677000000', updated_at: '2026-11-02T08:00:00.000Z' } });

const pousse = [];
const edgeMuet = async (path, body) => {
  if (path === 'sync-push') { pousse.push(...body.changes); return { applied: body.changes.length }; }
  return { rows: {}, tombstones: [], cursor: null, tomb_cursor: null };
};
await syncOnce({ edge: edgeMuet });

const monteeE1 = pousse.filter((c) => c.table === 'students' && c.row.id === 'e1');
ok(monteeE1.length === 1, '1. la ligne est montée au Cloud', pousse.map((c) => c.table + '/' + c.row.id));
const ombre1 = lireOmbre('students', 'e1');
ok(ombre1?.matricule === '677000000',
  '2. l’ombre s’est posée sur ce que le Cloud a ACCEPTÉ (c’est la base de la fusion)',
  ombre1 && { phone: ombre1.matricule, name: ombre1.name });

// ── ÉTAPE 2 : l'école corrige le MATRICULE, hors ligne ────────────────────
runQuery({ table: 'students', action: 'upsert', onConflict: 'id',
  values: { id: 'e1', school_id: 'sch1', class_id: 'c1', name: 'Marie Ngo',
    matricule: '699111111', updated_at: '2026-11-02T09:00:00.000Z' } });
ok(eleve().matricule === '699111111', '3. la correction locale est bien en base');

// ── ÉTAPE 3+4 : le Cloud a corrigé le NOM, PLUS TARD. Un cycle. ───────────
// Sans fusion par champ, cette ligne distante — plus récente — écrasait tout :
// le matricule corrigé à 9 h disparaissait sans un mot. C'est LA perte.
const pousse2 = [];
const edgeCloud = async (path, body) => {
  if (path === 'sync-push') { pousse2.push(...body.changes); return { applied: body.changes.length }; }
  if (path === 'sync-pull') {
    return {
      rows: { students: [{ id: 'e1', school_id: 'sch1', class_id: 'c1',
        name: 'Marie Ngoh',              // ← le Cloud a corrigé le NOM
        matricule: '677000000',     // ← il ignore la correction de 9 h
        updated_at: '2026-11-02T10:00:00.000Z', version: 2 }] },
      tombstones: [], cursor: '2026-11-02T10:00:00.000Z', tomb_cursor: null,
    };
  }
  throw new Error('path inattendu ' + path);
};
const r = await syncOnce({ edge: edgeCloud });

const e = eleve();
ok(e.matricule === '699111111',
  '4. LE MATRICULE CORRIGÉ À L’ÉCOLE A SURVÉCU — c’est la perte qui est corrigée',
  e.matricule);
ok(e.name === 'Marie Ngoh', '5. et le nom corrigé en ligne est pris aussi', e.name);
ok(r.fusions === 1, '6. le cycle déclare la fusion (la supervision peut la lire)', r.fusions);
ok(r.conflits === 0, '7. aucun conflit : les deux côtés ont touché des champs différents', r.conflits);
// ── 8. LE TOUR EST COMPLET DANS LE MÊME CYCLE ─────────────────────────────
// Première écriture de ce test : elle attendait de trouver la ligne en file
// APRÈS le cycle. Faux — `syncOnce` tire PUIS pousse : la fusion est enfilée,
// poussée et la file purgée dans le même tour. C'est mieux que ce que
// j'attendais, et il faut l'écrire comme tel.
const fusionMontee = pousse2.find((c) => c.table === 'students' && c.row.id === 'e1');
ok(fusionMontee && fusionMontee.row.matricule === '699111111',
  '8. la ligne FUSIONNÉE est repartie vers le Cloud dans le même cycle',
  fusionMontee && fusionMontee.row.matricule);
ok(fusionMontee && fusionMontee.row.name === 'Marie Ngoh',
  '9. et elle porte aussi la correction venue du Cloud : les deux ensemble',
  fusionMontee && fusionMontee.row.name);
ok(enFile() === undefined,
  '10. la file est purgée : le Cloud a accepté, il n’y a plus rien à renvoyer', enFile());

// ── 11-13. DEUX NŒUDS QUI CONVERGENT, ET QUI RESTENT CONVERGÉS ────────────
//
// Le piège que ce contrôle surveille : si la ligne fusionnée ne portait pas
// une version supérieure aux deux, le Cloud la reverrait comme périmée et
// nous la réécraserait au cycle suivant. La correction de l'école se
// reperdrait à chaque tour — une boucle de perte, pire qu'une perte sèche
// parce qu'elle se répare et se recasse sans que personne ne voie rien.
//
// Il faut donc un Cloud qui GARDE ce qu'on lui pousse. Un stub qui renvoie
// éternellement sa vieille ligne ne simule pas un Cloud : il simule un Cloud
// en panne, et ferait échouer un code correct.
// On sème le faux Cloud avec CE QU'IL A REÇU au cycle précédent — la ligne
// fusionnée — et non avec sa vieille version. Première écriture de ce test :
// elle le semait avec la ligne périmée, donc le faux Cloud « oubliait » la
// poussée qu'il venait d'accepter deux lignes plus haut, et faisait échouer
// un code juste. Un stub incohérent ne prouve rien, dans aucun sens.
const nuage = new Map();
nuage.set('e1', { ...fusionMontee.row });

const edgeVivant = async (path, body) => {
  if (path === 'sync-push') {
    for (const c of body.changes) {
      if (c.table !== 'students') continue;
      if (c.op === 'delete') { nuage.delete(c.row.id); continue; }
      // Le Cloud applique sa propre LWW : il ne garde la ligne poussée que si
      // elle est plus récente que la sienne. C'est ce que fait `sync-push`.
      const sien = nuage.get(c.row.id);
      const plusRecente = !sien || (Number(c.row.version) || 0) > (Number(sien.version) || 0)
        || Date.parse(c.row.updated_at || 0) > Date.parse(sien.updated_at || 0);
      if (plusRecente) nuage.set(c.row.id, { ...c.row });
    }
    return { applied: body.changes.length };
  }
  if (path === 'sync-pull') {
    return { rows: { students: [...nuage.values()] },
      tombstones: [], cursor: '2026-11-02T23:00:00.000Z', tomb_cursor: null };
  }
  throw new Error('path inattendu ' + path);
};

// Trois cycles de suite, comme un serveur d'école qui tourne la journée.
for (let i = 0; i < 3; i++) await syncOnce({ edge: edgeVivant });

ok(eleve().matricule === '699111111' && eleve().name === 'Marie Ngoh',
  '11. après trois cycles, l’école a TOUJOURS les deux corrections',
  { matricule: eleve().matricule, name: eleve().name });
ok(nuage.get('e1').matricule === '699111111' && nuage.get('e1').name === 'Marie Ngoh',
  '12. et le Cloud a les deux aussi : les deux nœuds ont convergé',
  { matricule: nuage.get('e1').matricule, name: nuage.get('e1').name });
ok(db.prepare("SELECT COUNT(*) n FROM sync_conflicts WHERE row_id = 'e1'").get().n === 0,
  '13. aucun conflit inscrit : il n’y en avait pas — deux champs différents',
  db.prepare("SELECT COUNT(*) n FROM sync_conflicts WHERE row_id = 'e1'").get().n);

// ── 14-15. CETTE FOIS, LES DEUX SUR LE MÊME CHAMP ─────────────────────────
// Là il y a un vrai désaccord, et il doit être VU — pas avalé.
nuage.set('e1', { ...nuage.get('e1'), matricule: '655999999', version: 99,
  updated_at: '2026-11-03T08:00:00.000Z' });
runQuery({ table: 'students', action: 'upsert', onConflict: 'id',
  values: { id: 'e1', school_id: 'sch1', class_id: 'c1', name: 'Marie Ngoh',
    matricule: '644888888', updated_at: '2026-11-03T07:00:00.000Z' } });
const r2 = await syncOnce({ edge: edgeVivant });
ok(r2.conflits >= 1, '14. le désaccord sur le MÊME champ est compté par le cycle', r2.conflits);
const c = db.prepare("SELECT * FROM sync_conflicts WHERE row_id = 'e1' AND col = 'matricule'").get();
ok(c && String(c.val_local) === '644888888' && String(c.val_distant) === '655999999',
  '15. la valeur écartée reste LISIBLE dans le registre (avant, elle était perdue)',
  c && { local: c.val_local, distant: c.val_distant, retenu: c.retenu });

console.log('');
console.log(`=== ${fail ? 'KO' : 'OK'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
