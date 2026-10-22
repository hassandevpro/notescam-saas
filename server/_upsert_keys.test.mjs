// CHAQUE CLÉ D'UPSERT DU CLIENT A-T-ELLE SON INDEX UNIQUE EN LAN ?
//
// LE DÉFAUT QUE CE TEST FERME, et il a coûté cher deux fois.
//
// Quand le client écrit en `upsert ... onConflict: 'a,b,c'`, SQLite exige un
// index UNIQUE portant EXACTEMENT ces colonnes. Sinon il refuse l'écriture :
//     « ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint »
// et la saisie repart en file de synchronisation à chaque cycle, indéfiniment.
// L'enseignant ne voit rien — sa saisie vit d'abord dans le navigateur.
//
// Deux cas réels, trouvés dans l'export « saisies non transmises » d'une école :
//   · prim_notes            — la clé est passée du trimestre à l'UA côté Cloud
//                             (supabase_prim_bareme_ua.sql) et jamais en LAN :
//                             PLUS AUCUNE note primaire ne s'enregistrait ;
//   · teacher_notifications — contrainte posée au Cloud par supabase_sprint27.sql,
//                             absente en LAN : un avis de saisie bloqué par
//                             enregistrement de notes.
//
// Les deux fois, la cause est la même : `CREATE TABLE IF NOT EXISTS` ne touche
// pas une table déjà créée, donc une clé qui CHANGE n'arrive jamais sur les bases
// installées. Ce test regarde le schéma réel, après démarrage du serveur.
//
// EN AJOUTANT UN `onConflict` COMPOSITE CÔTÉ CLIENT, AJOUTEZ-LE ICI.
//
// Lancer : node server/_upsert_keys.test.mjs
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-upsert-keys-'));
const { db } = await import('./db.js');

// Table -> clé d'upsert, telle que le client l'envoie. Source : les `onConflict`
// de src/lib/ (sync.js pour la file hors-ligne, et les services pour le chemin
// direct — les deux doivent rester d'accord).
const CLES = {
  grades:                   'class_id,student_id,subject_id,sequence',   // sync.js, schoolService.js, dataImport.js
  apc_notes:                'eleve_id,competence_id,sequence_id',        // apcService.js, sync.js
  mat_observations:         'eleve_id,domaine_id,trimestre_id',          // matService.js, sync.js
  prim_notes:               'eleve_id,competence_id,critere_id,ua',      // primService.js, sync.js
  student_absences:         'student_id,sequence',                       // schoolService.js
  fee_schedule_items:       'student_fee_item_id,period_key',            // feeScheduleService.js
  teacher_notifications:    'school_id,teacher_id,class_id,sequence',    // notificationsService.js
  sequence_dates:           'school_id,seq_key',                         // sequenceDatesService.js
  referentiel_libelles:     'school_id,kind,item_id',                    // referentielEcole.js
  apc_competences_masques:  'school_id,competence_id',                   // referentielEcole.js
  prim_competences_masques: 'school_id,competence_id',                   // referentielEcole.js
  mat_domaines_masques:     'school_id,domaine_id',                      // referentielEcole.js
};

let pass = 0, fail = 0;
const ok = (c, label, got) => { c ? (console.log(`✅ ${label}`), pass++) : (console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`), fail++); };

// Les index uniques d'une table, colonnes triées (l'ordre des colonnes d'un
// ON CONFLICT n'a pas d'importance pour SQLite, seul l'ensemble compte).
const uniques = (table) => db.prepare(`PRAGMA index_list("${table}")`).all()
  .filter((i) => i.unique)
  .map((i) => db.prepare(`PRAGMA index_info("${i.name}")`).all().map((c) => c.name).sort().join(','));

for (const [table, cle] of Object.entries(CLES)) {
  const colonnes = db.prepare(`PRAGMA table_info("${table}")`).all();
  if (!colonnes.length) { ok(false, `${table} : table présente en LAN`, 'absente'); continue; }
  const voulue = cle.split(',').map((c) => c.trim()).sort().join(',');
  const trouvees = uniques(table);
  ok(trouvees.includes(voulue), `${table} : index unique sur (${cle})`, trouvees);
}

// Et les colonnes de la clé doivent exister, sinon l'index ne pourrait pas être
// celui qu'on croit (filet contre un renommage silencieux).
for (const [table, cle] of Object.entries(CLES)) {
  const noms = new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name));
  const manquantes = cle.split(',').map((c) => c.trim()).filter((c) => !noms.has(c));
  ok(manquantes.length === 0, `${table} : les colonnes de la clé existent`, manquantes);
}

console.log(fail ? `\n❌ ${fail} échec(s) sur ${pass + fail}` : `\n✅ Toutes les clés d'upsert ont leur index en LAN (${pass})`);
process.exit(fail ? 1 : 0);
