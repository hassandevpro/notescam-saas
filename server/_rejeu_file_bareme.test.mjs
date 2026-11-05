// LE REJEU DE LA FILE N'EFFACE PLUS LA NOTE D'UNE COLLÈGUE — sur le VRAI moteur SQL.
//
// LE DÉFAUT, relevé le 2026-11-05 sur deux captures de l'école prises à une minute
// d'intervalle, avant et après actualisation : sur six cellules, deux se vident. Ayden
// perd son 20, Bidjo perd son 10, Djomo garde les deux. Ni un refus global (tout serait
// vide), ni un réseau coupé (rien ne serait parti).
//
// LA CAUSE : régler un barème met en file une opération qui NE PARLE PAS de la note —
// l'appelant pose `sansNote: true` — mais dont la charge porte tout de même `note: null`,
// parce qu'un record de note est toujours complet. Le chemin DIRECT retire la colonne
// (`upsertPrimNote({ sansNote })`). LE REJEU, LUI, NE LISAIT PAS `sansNote` : le mot
// n'apparaissait pas une seule fois dans tout `src/lib/sync.js`. Il renvoyait la charge
// entière, l'upsert faisait `ON CONFLICT DO UPDATE SET note = NULL`, et la note saisie
// entre-temps disparaissait. Sans erreur, sans trace : le rejeu « réussissait », donc
// l'opération quittait la file et plus rien ne rappelait qu'une note avait existé.
//
// C'est une propriété du SQL généré, pas du composant React : ce banc la vérifie sur
// `runQuery`, le chemin réel du serveur d'école.
//
// Lancer : node server/_rejeu_file_bareme.test.mjs
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DIR = mkdtempSync(join(tmpdir(), 'nc-rejeu-'));
process.env.NOTESCAM_DATA_DIR = DIR;
process.env.NOTESCAM_DISABLE_SYNC = '1';

const { db } = await import('./db.js');
const { runQuery } = await import('./query.js');
const { ligneDeRejeu, lotRejouableEnBloc } = await import('../src/core/primNotesFusion.js');

let ko = 0;
const ok = (c, msg, extra) => {
  console.log(`${c ? '✅' : '❌'} ${msg}${c || extra === undefined ? '' : ` — ${JSON.stringify(extra)}`}`);
  if (!c) ko++;
};

const SCHOOL = 'ecole-1';
const CLASSE = 'classe-ce1';
const ELEVE = 'el-rejeu';
const COMP = '1a';
const CRIT = 'oral';
const UA = 1;
const CONFLIT = 'eleve_id,competence_id,critere_id,ua';

// `values` est le nom attendu par runQuery pour les colonnes a ecrire.
const upsert = (values) => runQuery({
  table: 'prim_notes', action: 'upsert', values, onConflict: CONFLIT,
});
// Relecture DIRECTE en base : on verifie ce qui est ECRIT, pas ce qu'une couche raconte.
const lire = () => db.prepare('SELECT note, points_max FROM prim_notes WHERE eleve_id = ?').get(ELEVE) || null;

// La charge EXACTE que le magasin met en file : un record de note complet, donc
// `note: null` même quand le geste ne parle que du barème.
const chargeBareme = (pointsMax) => ({
  id: 'n-bareme', school_id: SCHOOL, eleve_id: ELEVE, competence_id: COMP,
  critere_id: CRIT, ua: UA, enseignant_id: null, note: null, statut: null,
  points_max: pointsMax, date_saisie: new Date().toISOString(),
  updated_at: new Date().toISOString(), nkey: `${ELEVE}_${COMP}_${CRIT}_${UA}`,
});

try {
  db.exec('PRAGMA foreign_keys = ON');
  db.prepare("INSERT OR IGNORE INTO schools (id, name) VALUES (?, 'Ecole test')").run(SCHOOL);
  db.prepare('INSERT OR IGNORE INTO classes (id, school_id, name) VALUES (?, ?, ?)').run(CLASSE, SCHOOL, 'CE1');
  db.prepare('INSERT OR IGNORE INTO students (id, school_id, class_id, name) VALUES (?, ?, ?, ?)')
    .run(ELEVE, SCHOOL, CLASSE, 'Bidjo Inaya');

  // ── 1. La collègue saisit 10, et le serveur l'a.
  const pose = upsert({
    id: 'n-collegue', school_id: SCHOOL, eleve_id: ELEVE, competence_id: COMP,
    critere_id: CRIT, ua: UA, note: 10, points_max: 10,
    date_saisie: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
  ok(!pose.error, 'la collègue saisit 10', pose.error);
  ok(lire()?.note === 10, 'le serveur a bien 10', lire()?.note);

  // ── 2. LE REJEU TEL QU'IL ÉTAIT : la charge entière, `sansNote` ignoré.
  //    C'est exactement ce que faisait `replayItem` — il ne lisait pas le drapeau.
  const { nkey, ...telQuel } = chargeBareme(20);
  const r1 = upsert(telQuel);
  ok(!r1.error, 'le rejeu passe SANS ERREUR — rien n’avertit, et la file se vide', r1.error);
  const apres = lire();
  ok(apres?.note === null, 'ET LA NOTE DE 10 EST EFFACÉE — le défaut est reproduit', apres?.note);
  ok(apres?.points_max === 20, 'le barème, lui, est bien passé', apres?.points_max);

  // ── 3. LE REJEU CORRIGÉ : `ligneDeRejeu` retire la colonne `note`.
  upsert({ ...telQuel, note: 10, points_max: 10 });
  ok(lire()?.note === 10, 'on repose 10 pour le second essai', lire()?.note);

  const corrige = ligneDeRejeu({ sansNote: true, payload: chargeBareme(20) });
  ok(!('note' in corrige), 'la ligne rejouée NE PORTE PLUS la colonne `note`', Object.keys(corrige));
  ok(!('nkey' in corrige), 'ni `nkey`, qui est local et n’existe pas en base');
  const r2 = upsert(corrige);
  ok(!r2.error, 'le rejeu corrigé passe', r2.error);
  const fin = lire();
  ok(fin?.note === 10, 'LA NOTE DE LA COLLÈGUE EST INTACTE', fin?.note);
  ok(fin?.points_max === 20, 'et le barème a tout de même été posé', fin?.points_max);

  // ── 4. Une écriture qui PARLE de la note garde évidemment la colonne.
  const ordinaire = ligneDeRejeu({ sansNote: false, payload: { ...chargeBareme(20), note: 7.5 } });
  ok(ordinaire.note === 7.5, 'une vraie saisie envoie toujours sa note', ordinaire.note);
  upsert(ordinaire);
  ok(lire()?.note === 7.5, 'et elle s’écrit bien', lire()?.note);

  // ── 5. UN LOT NE MÉLANGE PAS LES DEUX. Un upsert groupé n'a qu'un jeu de colonnes
  //    pour toutes ses lignes : `note` serait imposée à celles qui doivent l'omettre,
  //    ou retirée à celles qui doivent l'écrire. Dans les deux cas, une note se perd.
  ok(lotRejouableEnBloc([{ sansNote: false }, { sansNote: false }]) === true,
    'un lot de vraies saisies part bien en bloc');
  ok(lotRejouableEnBloc([{ sansNote: false }, { sansNote: true }]) === false,
    'UN LOT MÊLÉ EST REFUSÉ — il repasse élément par élément');
  ok(lotRejouableEnBloc([{ sansNote: true }]) === false, 'un lot de barèmes aussi');

  // ── 6. L'état final : la note vit, le barème aussi.
  const bilan = lire();
  ok(bilan?.note === 7.5 && bilan?.points_max === 20,
    'état final cohérent : la note ET le barème', { note: bilan?.note, points_max: bilan?.points_max });
} finally {
  try { db.close(); } catch { /* déjà fermée */ }
  rmSync(DIR, { recursive: true, force: true });
}

console.log(ko === 0 ? '\n✅ TOUT PASSE' : `\n❌ ${ko} échec(s)`);
process.exit(ko === 0 ? 0 : 1);
