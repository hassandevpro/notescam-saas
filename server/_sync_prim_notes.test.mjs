// NOTES DU PRIMAIRE : FUSION PAR CLÉ NATURELLE ENTRE L'ÉCOLE ET LE CLOUD
//
// Une note est (élève, compétence, critère, UA), pas un id. Une même note saisie à l'école et en
// ligne a deux ids ; UNIQUE(eleve_id, competence_id, critere_id, ua) refuserait la seconde.
// Ce test prouve, côté école, que la version la plus récente gagne et qu'aucune écriture venue du
// Cloud ne repart vers le Cloud (anti-écho).
//
//   node server/_sync_prim_notes.test.mjs
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-primnotes-'));
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

const { db, SYNCED_TABLES } = await import('./db.js');
const { rawUpsert, reparationDifferee } = await import('./cloudSync.js');

ok(SYNCED_TABLES.has('prim_notes'), '1. prim_notes est une table synchronisée côté école', null);

const ICI = dirname(fileURLToPath(import.meta.url));
const push = readFileSync(join(ICI, '..', 'supabase/functions/sync-push/index.ts'), 'utf8');
const pull = readFileSync(join(ICI, '..', 'supabase/functions/sync-pull/index.ts'), 'utf8');
ok(/const ALLOWED = new Set\(\[[\s\S]*?'prim_notes'[\s\S]*?\]\);/.test(push), '2. sync-push accepte prim_notes (sinon jetée en silence)', null);
ok(/const TABLES = \[[\s\S]*?'prim_notes'[\s\S]*?\];/.test(pull), '3. sync-pull renvoie prim_notes', null);
ok(/trimestre_id: ua <= 3 \? 't1' : ua <= 6 \? 't2' : 't3'/.test(push), '4. le trimestre exigé par le Cloud est dérivé de la UA', null);
ok(push.includes("'competence_absente_du_cloud'"), '5. une compétence inconnue du Cloud est REFUSÉE avec un motif (pas perdue en silence)', null);

// ── jeu minimal ─────────────────────────────────────────────────────────────
db.prepare('INSERT INTO schools (id,name) VALUES (?,?)').run('ec1', 'ECOLE UNE');
db.prepare('INSERT INTO classes (id,school_id,name) VALUES (?,?,?)').run('cl', 'ec1', 'CM2');
db.prepare('INSERT INTO students (id,school_id,class_id,name) VALUES (?,?,?,?)').run('el', 'ec1', 'cl', 'NGONO Marie');
const comp = db.prepare("SELECT id FROM prim_competences WHERE school_id IS NULL LIMIT 1").get()?.id;
const crit = db.prepare('SELECT id FROM prim_criteres LIMIT 1').get()?.id;
ok(!!comp && !!crit, '6. le référentiel officiel est chargé (compétence + critère)', { comp, crit });

const note = (id, valeur, majA, extra = {}) => ({
  id, school_id: 'ec1', eleve_id: 'el', competence_id: comp, critere_id: crit, ua: 1,
  note: valeur, points_max: 20, updated_at: majA, version: 1, device_id: 'x', ...extra,
});
const presente = (id) => db.prepare('SELECT * FROM prim_notes WHERE id = ?').get(id);
const enFile = (id) => db.prepare("SELECT count(*) c FROM sync_outbox WHERE tablename='prim_notes' AND row_id=?").get(id).c;

// ── A. la note du Cloud est PLUS RÉCENTE : elle remplace la locale ──────────
db.prepare(`INSERT INTO prim_notes (id, school_id, eleve_id, competence_id, critere_id, ua, note, points_max, updated_at, version, device_id)
            VALUES ('loc1','ec1','el',?,?,1,10,20,'2026-11-01T08:00:00.000Z',1,'lan')`).run(comp, crit);
ok(enFile('loc1') === 1, '7. une note saisie à l’école est mise en file pour le Cloud', enFile('loc1'));

const r1 = rawUpsert('prim_notes', note('cloud1', 14, '2026-11-05T08:00:00.000Z'), { quiet: true });
ok(r1 === true, '8. la note plus récente du Cloud est appliquée', r1);
ok(!presente('loc1') && presente('cloud1')?.note === 14, '9. l’ancienne note locale (même identité) cède la place : une seule note, 14', db.prepare('SELECT id,note FROM prim_notes').all());
ok(enFile('loc1') === 0, '10. son entrée de file est retirée (elle renverrait l’ancienne valeur par-dessus)', enFile('loc1'));
ok(enFile('cloud1') === 0, '11. anti-écho : la note venue du Cloud ne repart pas vers le Cloud', enFile('cloud1'));

// ── B. la note locale est PLUS RÉCENTE : celle du Cloud n'écrase rien ───────
db.prepare(`UPDATE prim_notes SET note = 16, updated_at = '2026-11-09T08:00:00.000Z', version = 2 WHERE id = 'cloud1'`).run();
const r2 = rawUpsert('prim_notes', note('cloud2', 5, '2026-11-02T08:00:00.000Z'), { quiet: true });
ok(r2 === true, '12. une note plus ancienne du Cloud n’est pas une erreur (rien à rejouer)', r2);
ok(!presente('cloud2') && presente('cloud1')?.note === 16, '13. la note locale plus récente est intacte (16), aucun doublon', db.prepare('SELECT id,note FROM prim_notes').all());
ok(db.prepare('SELECT count(*) c FROM prim_notes').get().c === 1, '14. il reste UNE note pour (élève, compétence, critère, UA)', null);

// ── C. une autre UA est une AUTRE note ───────────────────────────────────────
const r3 = rawUpsert('prim_notes', note('cloud3', 12, '2026-11-05T08:00:00.000Z', { ua: 2 }), { quiet: true });
ok(r3 === true && presente('cloud3') && db.prepare('SELECT count(*) c FROM prim_notes').get().c === 2,
  '15. une autre UA donne une note distincte (les deux coexistent)', db.prepare('SELECT id,ua FROM prim_notes').all());

// ── D. la même note, même id : mise à jour ordinaire ─────────────────────────
const r4 = rawUpsert('prim_notes', note('cloud3', 13, '2026-11-06T08:00:00.000Z', { ua: 2, version: 2 }), { quiet: true });
ok(r4 === true && presente('cloud3').note === 13, '16. même id : la mise à jour du Cloud s’applique', presente('cloud3'));

// ── E. la réparation automatique n'achève pas une file qui se vide ──────────
ok(reparationDifferee(4277) === true, '17. 4 277 lignes en attente : la réparation automatique est DIFFÉRÉE (elle réempilait tout en boucle)', null);
ok(reparationDifferee(501) === true && reparationDifferee(500) === false, '18. seuil : au-delà d’un lot de 500 on diffère, jusqu’à 500 inclus on répare', null);
ok(reparationDifferee(0) === false, '19. file vide : la réparation reprend son rôle de rattrapage', null);

console.log(`\n=== ${fail ? 'ÉCHEC' : 'OK'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
