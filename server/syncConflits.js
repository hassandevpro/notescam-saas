// ARBITRAGE DES CONFLITS — rendre visible, et rendre tranchable.
//
// POURQUOI CE FICHIER. Le moteur de fusion (server/syncMerge.js) refuse
// d'écraser en silence : quand les deux côtés ont modifié le même champ
// sensible, il garde le local et inscrit le désaccord dans `sync_conflicts`.
// Mais un conflit inscrit que personne ne voit ni ne peut trancher n'est pas
// mieux qu'un écrasement silencieux : c'est le même oubli, simplement mieux
// rangé. C'était écrit noir sur blanc au §7 de docs/SYNCHRONISATION.md, et
// c'est ce que ce module ferme.
//
// CE QUE « TRANCHER » VEUT DIRE, EXACTEMENT.
//   · garder le local  → la base porte déjà cette valeur. Il n'y a rien à
//     écrire ; il reste à REPOUSSER la ligne, sinon le Cloud enverra la
//     sienne au prochain cycle et le conflit se rouvrira indéfiniment.
//   · prendre le distant → on écrit la valeur distante dans la ligne, et on
//     repousse aussi : les deux côtés doivent finir d'accord, et c'est nous
//     qui venons de décider.
//
// Dans les deux cas la ligne remonte. Un arbitrage qui ne se propage pas n'est
// pas un arbitrage : c'est un post-it.
import { db, SYNCED_TABLES, tableColumns, enqueueOutbox, sansEcho, tx } from './db.js';

export function compterConflits() {
  const r = db.prepare(`SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE retenu IS NULL) AS a_arbitrer
    FROM sync_conflicts WHERE resolved_at IS NULL`).get();
  return { total: r?.total || 0, aArbitrer: r?.a_arbitrer || 0 };
}

// `retenu IS NULL` d'abord : ce sont ceux que le moteur a REFUSÉ de trancher
// (note, période verrouillée, écriture comptable). Ils attendent un humain, et
// doivent donc remonter en tête — les autres sont déjà réglés, on les garde
// lisibles pour pouvoir revenir dessus, pas pour agir.
export function listerConflits({ limite = 200, tous = false } = {}) {
  const ou = tous ? '' : 'WHERE resolved_at IS NULL';
  return db.prepare(`SELECT * FROM sync_conflicts ${ou}
    ORDER BY (retenu IS NOT NULL), at DESC LIMIT ?`).all(Math.min(Number(limite) || 200, 1000));
}

/**
 * Tranche un conflit. `choix` vaut 'local' ou 'distant'.
 * Rend { ok, applique, table, row_id, col } ou lève.
 */
export function resoudreConflit(id, choix, { acteur = null } = {}) {
  if (choix !== 'local' && choix !== 'distant') {
    throw new Error(`choix invalide : « ${choix} » (attendu : local ou distant)`);
  }
  const c = db.prepare('SELECT * FROM sync_conflicts WHERE id = ?').get(Number(id));
  if (!c) throw new Error(`conflit ${id} introuvable`);
  if (c.resolved_at) throw new Error(`conflit ${id} déjà tranché le ${c.resolved_at}`);

  // Garde-fous : on va écrire dans une table et une colonne nommées par une
  // LIGNE DE BASE. Sans ces deux vérifications, une entrée forgée dans
  // `sync_conflicts` ferait écrire n'importe où — la table et la colonne
  // entrent dans du SQL interpolé, qui ne se paramètre pas.
  if (!SYNCED_TABLES.has(c.tablename)) {
    throw new Error(`table « ${c.tablename} » non synchronisée : arbitrage refusé`);
  }
  if (!tableColumns(c.tablename).has(c.col)) {
    throw new Error(`colonne « ${c.tablename}.${c.col} » inconnue : arbitrage refusé`);
  }

  const ligne = db.prepare(`SELECT * FROM "${c.tablename}" WHERE id = ?`).get(c.row_id);
  if (!ligne) throw new Error(`la ligne ${c.tablename}/${c.row_id} n'existe plus`);

  tx(() => {
    if (choix === 'distant') {
      // `val_distant` est stocké en TEXT ; SQLite convertit vers le type de la
      // colonne à l'écriture. NULL reste NULL : un champ effacé au Cloud doit
      // s'effacer ici, pas devenir la chaîne « null ».
      const valeur = c.val_distant === null ? null : c.val_distant;
      // La ligne arbitrée doit DÉPASSER les deux versions, sinon le Cloud la
      // reverrait comme périmée et rouvrirait le conflit au cycle suivant.
      const versionCible = (Number(ligne.version) || 0) + 1;
      const aVersion = tableColumns(c.tablename).has('version');
      const aMaj = tableColumns(c.tablename).has('updated_at');
      const sets = [`"${c.col}" = ?`];
      const args = [valeur];
      if (aVersion) { sets.push('"version" = ?'); args.push(versionCible); }
      if (aMaj) { sets.push('"updated_at" = ?'); args.push(new Date().toISOString()); }
      // `sansEcho` : c'est NOUS qui enfilons, juste après, avec l'intention
      // explicite de pousser. Laisser le déclencheur le faire aussi serait
      // sans effet (une entrée par ligne) mais masquerait l'intention.
      sansEcho(() => db.prepare(`UPDATE "${c.tablename}" SET ${sets.join(', ')} WHERE id = ?`)
        .run(...args, c.row_id));
    }

    // L'ombre a menti : elle dit que le Cloud et nous étions d'accord sur une
    // base que l'arbitrage vient de dépasser. On la retire plutôt que de la
    // réécrire : la laisser fausse ferait reparaître le conflit, l'inventer
    // ferait passer notre décision pour un accord qui n'a pas eu lieu. Elle
    // se reposera au premier échange réussi.
    db.prepare('DELETE FROM sync_shadow WHERE tablename = ? AND row_id = ?')
      .run(c.tablename, String(c.row_id));

    // Dans les DEUX cas la ligne remonte : garder le local sans le pousser
    // laisserait le Cloud renvoyer sa version, et le conflit se rouvrirait à
    // chaque cycle.
    enqueueOutbox(c.tablename, c.row_id, 'upsert');

    db.prepare(`UPDATE sync_conflicts SET resolved_at = ?, retenu = ?,
        motif = COALESCE(motif, '') || ? WHERE id = ?`)
      .run(new Date().toISOString(), choix,
        ` · tranché${acteur ? ' par ' + acteur : ''}`, Number(id));
  });

  return { ok: true, applique: choix, table: c.tablename, row_id: c.row_id, col: c.col };
}
