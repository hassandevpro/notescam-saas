// LES CHAMPS DE LA FICHE ÉLÈVE SURVIVENT-ILS À L'ÉCRITURE ?
//
// Ce fichier existe à cause d'un défaut signalé par THE GENIUS le 09/09/2026 :
// « les infos des parents ne s'affichent pas sur la fiche des élèves ».
//
// Ce n'était pas l'affichage. Les huit colonnes du modèle élève étendu
// (supabase_students_extended.sql : lieu_naissance, adresse, contact_urgence,
// nom_pere, profession_pere, nom_mere, profession_mere, tuteur) existaient côté
// Cloud et dans le formulaire, mais PAS dans le schéma LAN. Or `pickColumns()`
// et `rawUpsert()` ne gardent que les colonnes présentes localement et jettent
// les autres en silence. La secrétaire saisissait le nom du père, enregistrait,
// voyait un succès — et rien n'était écrit. Une perte à la saisie, invisible.
//
// La preuve, dans le Cloud de THE GENIUS au 09/09/2026, sur 295 élèves :
// `parent_phone` (la seule de ces colonnes qui existait en LAN) renseignée 269
// fois, et nom_pere / nom_mere / tuteur / adresse / contact_urgence à ZÉRO.
//
// Ce qu'on vérifie ici n'est donc PAS « la colonne existe » — c'est trop faible,
// et un test de schéma passerait encore le jour où le filtre changerait. On
// écrit par le CHEMIN RÉEL de l'application (runQuery, celui qu'emprunte la
// fiche) et par le chemin de la SYNCHRO (rawUpsert, celui qu'emprunte le Cloud),
// puis on relit. Un champ qui ne revient pas est un champ perdu.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-student-'));

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

const { db } = await import('./db.js');
const { runQuery } = await import('./query.js');
const { rawUpsert } = await import('./cloudSync.js');

// Les champs que la fiche élève saisit, hors identité (name, class_id…). C'est
// la liste du formulaire (src/pages/StudentProfile.jsx) et de NULLABLE_STUDENT_FIELDS
// (src/store/schoolStore.js) : si l'un d'eux n'est plus persisté, l'écran ment.
const CHAMPS = {
  matricule:       'STU0421',
  gender:          'Masculin',
  date_naissance:  '2012-03-04',
  lieu_naissance:  'Yaoundé',
  adresse:         'Quartier Mvog-Ada, BP 55',
  parent_phone:    '699000000',
  contact_urgence: '677111222',
  nom_pere:        'NGONO Bernard',
  profession_pere: 'Enseignant',
  nom_mere:        'ABEGA Solange',
  profession_mere: 'Commerçante',
  tuteur:          'NGONO Bernard',
};

db.prepare('INSERT INTO schools (id,name) VALUES (?,?)').run('ec', 'ECOLE');
db.prepare('INSERT INTO classes (id,school_id,name) VALUES (?,?,?)').run('cl', 'ec', '3e A');

// ── 1. Le chemin de l'APPLICATION : la fiche enregistre, on relit ───────────
const ins = runQuery({
  table: 'students', action: 'insert',
  values: { id: 'el-1', school_id: 'ec', class_id: 'cl', name: 'NGONO Marie', ...CHAMPS },
});
ok(!ins.error, '1. l’enregistrement de la fiche ne renvoie pas d’erreur', ins.error);

const relu = db.prepare('SELECT * FROM students WHERE id = ?').get('el-1');
const perdus = Object.entries(CHAMPS).filter(([k, v]) => relu?.[k] !== v).map(([k]) => k);
ok(perdus.length === 0,
  '2. TOUS les champs saisis sont relus à l’identique (le défaut du 09/09 : ils étaient jetés en silence)',
  perdus);

// ── 2. La modification, chemin le plus courant sur une fiche existante ──────
const upd = runQuery({
  table: 'students', action: 'update',
  values: { nom_pere: 'MBALLA Pierre', tuteur: 'MBALLA Pierre' },
  filters: [{ col: 'id', op: 'eq', val: 'el-1' }],
});
ok(!upd.error, '3. la modification de la fiche ne renvoie pas d’erreur', upd.error);
const apres = db.prepare('SELECT nom_pere, tuteur, nom_mere FROM students WHERE id = ?').get('el-1');
ok(apres?.nom_pere === 'MBALLA Pierre' && apres?.tuteur === 'MBALLA Pierre',
  '4. la modification est bien écrite', apres);
ok(apres?.nom_mere === 'ABEGA Solange',
  '5. et elle ne touche pas les champs non modifiés', apres);

// ── 3. Le chemin de la SYNCHRO : ce que le Cloud descend est conservé ───────
// C'est l'autre moitié du défaut : même avec la colonne au Cloud, `rawUpsert`
// jetait la valeur si la colonne manquait en LAN — et le curseur de pull avançait,
// si bien qu'elle n'était plus jamais renvoyée.
const monte = rawUpsert('students', {
  id: 'el-2', school_id: 'ec', class_id: 'cl', name: 'TABI Yannick',
  updated_at: new Date().toISOString(), ...CHAMPS,
});
ok(monte, '6. la descente Cloud d’un élève est acceptée', monte);
const distant = db.prepare('SELECT * FROM students WHERE id = ?').get('el-2');
const perdusSync = Object.entries(CHAMPS).filter(([k, v]) => distant?.[k] !== v).map(([k]) => k);
ok(perdusSync.length === 0,
  '7. la descente Cloud conserve TOUS les champs (sinon la donnée est jetée et le curseur avance quand même)',
  perdusSync);

// ── 4. Le témoin : une colonne qui n'existe nulle part reste refusée ────────
// La garde ne doit pas devenir « on accepte tout » : une faute de frappe dans un
// nom de champ doit continuer d'être ignorée plutôt que de créer une colonne.
runQuery({
  table: 'students', action: 'update',
  values: { nom_du_pere: 'FAUTE DE FRAPPE' },
  filters: [{ col: 'id', op: 'eq', val: 'el-1' }],
});
const colonnes = new Set(db.prepare('PRAGMA table_info(students)').all().map((c) => c.name));
ok(!colonnes.has('nom_du_pere'),
  '8. témoin : un champ inconnu ne crée pas de colonne', [...colonnes].filter((c) => c.includes('pere')));

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exitCode = fail === 0 ? 0 : 1;
