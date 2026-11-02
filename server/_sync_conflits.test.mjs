// Test — UN CONFLIT DOIT POUVOIR ÊTRE TRANCHÉ, ET L'ARBITRAGE DOIT PARTIR.
//
// POURQUOI CE FICHIER. Le moteur de fusion refuse d'écraser une note ou un
// encaissement en silence : il garde le local et inscrit le désaccord. Mais
// c'était écrit au §7 de docs/SYNCHRONISATION.md comme un manque assumé :
// « un conflit qui ne s'affiche nulle part reste un écrasement silencieux,
// mieux rangé ». Ce fichier garde la fermeture de ce manque.
//
// LE PIÈGE QUE LES CONTRÔLES 5 ET 9 SURVEILLENT. Trancher sans repousser ne
// sert à rien : le Cloud renverrait sa version au cycle suivant et le conflit
// se rouvrirait indéfiniment. L'arbitrage doit PARTIR, dans les deux sens —
// y compris quand on garde le local, où il n'y a rien à écrire en base.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-conflits-'));
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

const { db, enregistrerConflit, poserOmbre, lireOmbre } = await import('./db.js');
const { listerConflits, compterConflits, resoudreConflit } = await import('./syncConflits.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};
const note = () => db.prepare("SELECT * FROM grades WHERE id = 'g1'").get();
const enFile = (t, id) => db.prepare(
  'SELECT op FROM sync_outbox WHERE tablename = ? AND row_id = ?').get(t, id)?.op;

db.prepare('INSERT INTO schools (id, name) VALUES (?,?)').run('sch1', 'GENIUS');
db.prepare('INSERT INTO classes (id, school_id, name) VALUES (?,?,?)').run('c1', 'sch1', '6e');
db.prepare('INSERT INTO students (id, school_id, class_id, name) VALUES (?,?,?,?)')
  .run('e1', 'sch1', 'c1', 'Marie');
db.prepare('INSERT INTO subjects (id, school_id, class_id, name) VALUES (?,?,?,?)').run('m1', 'sch1', 'c1', 'Maths');
db.prepare(`INSERT INTO grades (id, school_id, class_id, student_id, subject_id, sequence, value)
            VALUES (?,?,?,?,?,?,?)`).run('g1', 'sch1', 'c1', 'e1', 'm1', 1, '14');
db.prepare('DELETE FROM sync_outbox').run();

// ── 1-3. CE QUI ATTEND UN HUMAIN REMONTE EN TÊTE ──────────────────────────
// Un conflit que le moteur a tranché tout seul est de l'information ; un
// conflit qu'il a REFUSÉ de trancher est une tâche. Les mélanger dans un seul
// tas ferait manquer les notes au milieu des changements d'adresse.
enregistrerConflit('grades', 'g1', { col: 'value', local: '14', distant: '09', base: '12' });
enregistrerConflit('students', 'e1', { col: 'name', local: 'Marie', distant: 'Marie N.', base: 'M.', retenu: 'distant' });

const n = compterConflits();
ok(n.total === 2 && n.aArbitrer === 1,
  '1. on compte séparément les conflits et ceux qui ATTENDENT un arbitrage', n);
const liste = listerConflits();
ok(liste[0].col === 'value' && liste[0].retenu === null,
  '2. celui qui attend un humain est en TÊTE de liste', liste.map((c) => c.col));
ok(liste.length === 2 && listerConflits({ tous: true }).length === 2,
  '3. la liste des ouverts est lisible', liste.length);

// ── 4-6. GARDER LE LOCAL : RIEN À ÉCRIRE, MAIS TOUT À POUSSER ─────────────
poserOmbre('grades', 'g1', { id: 'g1', value: '12' });
const idNote = liste[0].id;
const r = resoudreConflit(idNote, 'local', { acteur: 'directeur' });
ok(r.ok && note().value === '14', '4. garder le local laisse la note telle quelle', note().value);
ok(enFile('grades', 'g1') === 'upsert',
  '5. …MAIS la ligne repart au Cloud, sinon le conflit se rouvre à chaque cycle',
  enFile('grades', 'g1'));
ok(compterConflits().aArbitrer === 0,
  '6. le conflit ne figure plus dans ce qui attend un arbitrage', compterConflits());

// ── 7. L'OMBRE EST RETIRÉE, PAS RÉÉCRITE ──────────────────────────────────
// La laisser fausse ferait reparaître le conflit ; l'inventer ferait passer
// notre décision pour un accord qui n'a pas eu lieu.
ok(lireOmbre('grades', 'g1') === null,
  '7. l’ombre périmée est retirée : elle se reposera au premier échange réussi',
  lireOmbre('grades', 'g1'));

// ── 8-10. PRENDRE LE DISTANT : ON ÉCRIT, ET ON DÉPASSE LES DEUX VERSIONS ──
db.prepare('DELETE FROM sync_outbox').run();
enregistrerConflit('grades', 'g1', { col: 'value', local: '14', distant: '09', base: '12' });
const id2 = listerConflits()[0].id;
const avant = Number(note().version) || 0;
resoudreConflit(id2, 'distant', { acteur: 'directeur' });
ok(note().value === '09', '8. prendre le distant écrit bien la valeur distante', note().value);
ok((Number(note().version) || 0) > avant,
  '9. la version DÉPASSE l’ancienne, sinon le Cloud rouvrirait le conflit',
  { avant, apres: note().version });
ok(enFile('grades', 'g1') === 'upsert', '10. et la décision repart au Cloud', enFile('grades', 'g1'));

// ── 11-14. CE QU'ON REFUSE DE FAIRE ───────────────────────────────────────
// `tablename` et `col` viennent d'une LIGNE DE BASE et entrent dans du SQL
// interpolé — une table et une colonne ne se paramètrent pas. Sans ces
// garde-fous, une entrée forgée dans `sync_conflicts` ferait écrire n'importe
// où dans la base.
const refuse = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
ok(refuse(() => resoudreConflit(id2, 'local')) !== null,
  '11. un conflit déjà tranché ne se retranche pas', refuse(() => resoudreConflit(id2, 'local')));
ok(refuse(() => resoudreConflit(999999, 'local')) !== null, '12. un conflit inexistant est refusé');

db.prepare(`INSERT INTO sync_conflicts (tablename, row_id, col, at)
            VALUES ('sync_outbox', 'x', 'op', ?)`).run(new Date().toISOString());
const forge1 = db.prepare("SELECT id FROM sync_conflicts WHERE tablename = 'sync_outbox'").get().id;
ok((refuse(() => resoudreConflit(forge1, 'distant')) || '').includes('non synchronisée'),
  '13. une table NON synchronisée est refusée (table forgée)',
  refuse(() => resoudreConflit(forge1, 'distant')));

db.prepare(`INSERT INTO sync_conflicts (tablename, row_id, col, at)
            VALUES ('grades', 'g1', 'value" = 1, "school_id', ?)`).run(new Date().toISOString());
const forge2 = db.prepare("SELECT id FROM sync_conflicts WHERE col LIKE 'value\" =%'").get().id;
ok((refuse(() => resoudreConflit(forge2, 'distant')) || '').includes('inconnue'),
  '14. une colonne inconnue est refusée (injection par le nom de colonne)',
  refuse(() => resoudreConflit(forge2, 'distant')));
ok(note().school_id === 'sch1',
  '15. la ligne n’a pas été touchée par la tentative d’injection', note().school_id);

ok(refuse(() => resoudreConflit(id2, 'nimporte')) !== null, '16. un choix invalide est refusé');

// ── 17. UNE VALEUR DISTANTE NULLE S'ÉCRIT NULLE ───────────────────────────
// Un champ effacé au Cloud doit s'effacer ici, pas devenir la chaîne « null ».
db.prepare('DELETE FROM sync_outbox').run();
enregistrerConflit('students', 'e1', { col: 'matricule', local: '677', distant: null, base: '600' });
const id3 = listerConflits().find((c) => c.col === 'matricule').id;
resoudreConflit(id3, 'distant');
const eleve = db.prepare("SELECT matricule FROM students WHERE id = 'e1'").get();
ok(eleve.matricule === null, '17. un effacement distant s’écrit NULL, pas « null »', eleve.matricule);

console.log('');
console.log(`=== ${fail ? 'KO' : 'OK'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
