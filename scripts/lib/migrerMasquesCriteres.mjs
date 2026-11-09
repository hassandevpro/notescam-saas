// MIGRATION DU MASQUE DES CRITÈRES : (école, critère) → (classe, compétence, critère).
//
// Logique PURE par rapport à un `DatabaseSync` (SQLite, édition LAN), pour être testée sur une base de
// démonstration. Le lanceur `scripts/migrer-masques-criteres.mjs` n'y ajoute que la ligne de commande.
//
//   • DRY-RUN PAR DÉFAUT : sans `appliquer`, AUCUNE écriture, seulement le plan chiffré.
//   • SAUVEGARDE d'abord : `VACUUM INTO` (copie cohérente d'une base WAL), vérifiée avant toute écriture.
//   • IDEMPOTENT : une classe déjà initialisée est sautée ; `INSERT OR IGNORE` partout.
//   • UNE TRANSACTION : tout ou rien.
//   • AUCUNE note, aucun masque d'école n'est modifié ni supprimé (retour arrière = vider les deux
//     tables ci-dessous, la liste de l'école redevient lue).
import { isPrimaire } from '../../src/core/engineResolver.js';
import { planMigration } from '../../src/core/primCriteresMasques.js';

export function planPourEcole(db, schoolId) {
  const ecole = db.prepare('SELECT critere_id FROM prim_criteres_masques WHERE school_id = ?').all(schoolId).map((r) => r.critere_id);
  const classes = db.prepare('SELECT id, name, level FROM classes WHERE school_id = ?').all(schoolId)
    .filter((c) => isPrimaire(c.level, c.name));
  // Les compétences que l'école voit : nationales (school_id NULL) + les siennes.
  const competenceIds = db.prepare('SELECT id FROM prim_competences WHERE actif = 1 AND (school_id IS NULL OR school_id = ?)')
    .all(schoolId).map((r) => r.id);
  const dejaInit = new Set(db.prepare('SELECT class_id FROM prim_criteres_masques_init WHERE school_id = ?').all(schoolId).map((r) => r.class_id));
  const dejaLignes = new Set(db.prepare('SELECT class_id, competence_id, critere_id FROM prim_criteres_masques_classe WHERE school_id = ?')
    .all(schoolId).map((r) => `${r.class_id}|${r.competence_id}|${r.critere_id}`));
  const plan = planMigration({ ecole, classes, competenceIds, dejaInit, dejaLignes });
  return { schoolId, ecole, classes, competenceIds, ...plan };
}

export function migrer(db, { appliquer = false, sauvegarde = null, schoolId = null } = {}) {
  const ecoles = schoolId ? [{ id: schoolId }] : db.prepare('SELECT id FROM schools').all();
  const plans = ecoles.map((e) => planPourEcole(db, e.id));
  const rapport = {
    mode: appliquer ? 'appliquer' : 'dry-run',
    ecoles: plans.map((p) => ({
      ecole: p.schoolId, criteresMasquesParEcole: p.ecole.length, classesPrimaires: p.classes.length,
      classesAInitialiser: p.aInitialiser.length, lignesAEcrire: p.lignes.length,
    })),
    totalClasses: plans.reduce((n, p) => n + p.aInitialiser.length, 0),
    totalLignes: plans.reduce((n, p) => n + p.lignes.length, 0),
    sauvegarde: null,
  };
  if (!appliquer) return rapport;

  if (!sauvegarde) throw new Error('Sauvegarde obligatoire avant toute écriture (paramètre `sauvegarde`).');
  db.exec(`VACUUM INTO '${String(sauvegarde).replace(/'/g, "''")}'`);
  rapport.sauvegarde = sauvegarde;

  const now = new Date().toISOString();
  const insInit = db.prepare('INSERT OR IGNORE INTO prim_criteres_masques_init (school_id, class_id, init_le) VALUES (?, ?, ?)');
  const insLigne = db.prepare('INSERT OR IGNORE INTO prim_criteres_masques_classe (school_id, class_id, competence_id, critere_id, masque_le) VALUES (?, ?, ?, ?, ?)');
  db.exec('BEGIN');
  try {
    for (const p of plans) {
      for (const l of p.lignes) insLigne.run(p.schoolId, l.class_id, l.competence_id, l.critere_id, now);
      for (const cid of p.aInitialiser) insInit.run(p.schoolId, cid, now);   // le marqueur PART EN DERNIER
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return rapport;
}
