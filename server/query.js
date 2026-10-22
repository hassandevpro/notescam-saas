// Moteur de requêtes générique : traduit une opération structurée
// (envoyée par localClient.js) en SQL paramétré SQLite.
//
// Sécurité : table en liste blanche, identifiants quotés, valeurs toujours
// passées en paramètres (jamais d'interpolation) -> pas d'injection SQL.

import { db, ALLOWED_TABLES, quoteIdent, tableColumns, pickColumns, normalizeValue, tx, SYNCED_TABLES, deviceId } from './db.js';
import { randomUUID } from 'node:crypto';
import { guardBudgetExpense, guardBudgetStructure, guardBudgetLine, guardBudgetAllocations } from './budgetGuard.js';
import { emitApprovalRequestForOp } from './governanceApply.js';
import { isTracked, snapshotRows, maintainMerkle } from './syncMerkle.js';
import { SCOPED_TABLES, loadScope, isGlobal, rowAllowed, guardScopeWrite, guardSchoolIsolation, guardSchoolWrite, guardClassLimit, isParentAccount } from './scopeGuard.js';

// --- Suivi des changements pour la sync continue (Phase 2) ------------
// Horodate la ligne écrite (updated_at/device_id) pour la résolution LWW.
function stampSync(table, rec) {
  if (!SYNCED_TABLES.has(table)) return;
  const cols = tableColumns(table);
  if (cols.has('updated_at')) rec.updated_at = new Date().toISOString();
  if (cols.has('device_id'))  rec.device_id = deviceId();
}
// Journalise un changement local à pousser. La sync cloud écrit en base SANS
// passer par ici (anti-écho) → seuls les vrais changements locaux sont empilés.
function recordOutbox(table, id, op) {
  if (!SYNCED_TABLES.has(table) || id == null) return;
  db.prepare('INSERT INTO sync_outbox (tablename, row_id, op, at) VALUES (?,?,?,?)')
    .run(table, String(id), op, new Date().toISOString());
}

// Embeds supabase (`schools (*)`) -> clé FK sur la ligne parente.
const EMBED_FK = {
  schools: 'school_id', classes: 'class_id', students: 'student_id',
  subjects: 'subject_id', teachers: 'teacher_id',
};

function parseColumns(columns) {
  // Sépare colonnes scalaires et embeds « table (*) »
  const scalars = [];
  const embeds = [];
  if (!columns || columns === '*') return { scalars: ['*'], embeds };
  // Découpe en respectant les parenthèses
  const parts = columns.split(/,(?![^(]*\))/).map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const m = part.match(/^([a-z_]+)\s*\(/i);
    if (m) {
      const name = m[1];
      embeds.push({ key: name, table: name, fk: EMBED_FK[name] || name.replace(/s$/, '') + '_id' });
    } else {
      scalars.push(part);
    }
  }
  if (!scalars.length) scalars.push('*');
  return { scalars, embeds };
}

function buildWhere(filters = []) {
  const clauses = [];
  const params = [];
  for (const f of filters) {
    const col = quoteIdent(f.col);
    switch (f.op) {
      case 'eq':  clauses.push(`${col} = ?`);  params.push(normalizeValue(f.val)); break;
      case 'neq': clauses.push(`${col} <> ?`); params.push(normalizeValue(f.val)); break;
      case 'gt':  clauses.push(`${col} > ?`);  params.push(normalizeValue(f.val)); break;
      case 'gte': clauses.push(`${col} >= ?`); params.push(normalizeValue(f.val)); break;
      case 'lt':  clauses.push(`${col} < ?`);  params.push(normalizeValue(f.val)); break;
      case 'lte': clauses.push(`${col} <= ?`); params.push(normalizeValue(f.val)); break;
      case 'is':  clauses.push(f.val === null ? `${col} IS NULL` : `${col} IS ?`);
                  if (f.val !== null) params.push(normalizeValue(f.val)); break;
      case 'in': {
        const arr = Array.isArray(f.val) ? f.val : [];
        if (!arr.length) { clauses.push('1 = 0'); break; }
        clauses.push(`${col} IN (${arr.map(() => '?').join(',')})`);
        arr.forEach((v) => params.push(normalizeValue(v)));
        break;
      }
      default: break;
    }
  }
  return { sql: clauses.length ? ' WHERE ' + clauses.join(' AND ') : '', params };
}

function resolveEmbeds(rows, embeds) {
  for (const e of embeds) {
    const stmt = db.prepare(`SELECT * FROM ${quoteIdent(e.table)} WHERE id = ?`);
    for (const row of rows) {
      const fkVal = row[e.fk];
      row[e.key] = fkVal ? (stmt.get(fkVal) || null) : null;
    }
  }
  return rows;
}

// --- Non-répudiation + immuabilité de la traçabilité (revue P0 #8) ------
// domain_events / audit_events sont APPEND-ONLY (update/delete refusés) et
// l'acteur (actor_id) est estampillé depuis la SESSION authentifiée (ctx.userId),
// jamais depuis le payload client → un utilisateur ne peut pas forger un event
// au nom d'un autre. Le serveur LAN (JWT) est ici la frontière de confiance, à
// l'image de la fonction SECURITY DEFINER kernel_emit côté Cloud.
const APPEND_ONLY = new Set(['domain_events', 'audit_events']);
function guardAppendOnly(op, ctx) {
  if (!APPEND_ONLY.has(op.table)) return;
  if (op.action === 'update' || op.action === 'delete') {
    throw new Error(`${op.table} est append-only (${op.action} interdit)`);
  }
  if (ctx?.userId && op.values) {
    const stamp = (v) => { if (v && typeof v === 'object') v.actor_id = ctx.userId; };
    if (Array.isArray(op.values)) op.values.forEach(stamp); else stamp(op.values);
  }
}

// --- Immuabilité des RECETTES -----------------------------------------
// Un versement encaissé ne se modifie pas et ne se supprime pas. Sans cette
// garde, le geste de détournement le plus simple restait à un clic : encaisser,
// remettre le reçu, supprimer la ligne — l'argent part, et il ne reste AUCUNE
// trace qu'un versement a existé. L'annulation légitime passe par une
// CONTRE-PASSATION (ligne négative portant `reversal_of` + `void_reason`), qui
// laisse les deux écritures visibles.
//
// `recorded_by` est estampillé DEPUIS LE JETON, jamais depuis le payload : sinon
// la traçabilité du caissier reste déclarative, donc falsifiable (on pourrait
// signer un encaissement du nom d'un collègue).
function guardFeePaymentImmutable(op, ctx) {
  if (op.table !== 'fee_payments') return;
  if (op.action === 'update' || op.action === 'delete') {
    throw new Error('fee_payments est immuable : annulez par contre-passation (ligne négative), jamais par suppression');
  }
  if (ctx?.userId && op.values) {
    const stamp = (v) => { if (v && typeof v === 'object') v.recorded_by = ctx.userId; };
    if (Array.isArray(op.values)) op.values.forEach(stamp); else stamp(op.values);
  }
  // Règle de SIGNE, miroir de la contrainte Postgres `fee_payments_amount_sign` :
  // un encaissement est strictement positif, une contre-passation strictement
  // négative ET reliée à l'écriture qu'elle annule. Sans elle, un « versement
  // négatif » sans lien ni motif serait une annulation déguisée, intraçable.
  const checkSign = (v) => {
    if (!v || typeof v !== 'object' || v.amount == null) return;
    const amount = Number(v.amount);
    if (v.reversal_of) {
      if (!(amount < 0)) throw new Error('Contre-passation invalide : le montant doit être négatif.');
      if (!String(v.void_reason || '').trim()) throw new Error('Contre-passation invalide : motif obligatoire.');
    } else if (!(amount > 0)) {
      throw new Error('Versement invalide : le montant doit être strictement positif (une annulation passe par une contre-passation).');
    }
  };
  if (Array.isArray(op.values)) op.values.forEach(checkSign); else checkSign(op.values);
  allocateReceiptNo(op);
}

// --- Numérotation SÉQUENTIELLE des reçus -------------------------------
// Le numéro de reçu dérivé de l'uuid identifie une pièce mais ne dit rien d'un
// MANQUE : c'est une série continue qui rend visible la recette encaissée puis
// escamotée (le n°47 absent entre 46 et 48). Le compteur est donc attribué ICI,
// par le serveur, et jamais accepté depuis le client.
//
// `receipt_no` déjà renseigné = ligne venue de la synchro (le LAN l'avait déjà
// numérotée) : on ne la renumérote pas, sinon le reçu papier ne correspondrait
// plus. better-sqlite3 étant synchrone et mono-processus, le MAX+1 ci-dessous
// n'a pas de course concurrente.
function allocateReceiptNo(op) {
  if (op.table !== 'fee_payments') return;
  if (op.action !== 'insert' && op.action !== 'upsert') return;
  const next = (v) => {
    if (!v || typeof v !== 'object') return;
    if (v.receipt_no != null) return;                  // déjà numéroté (sync)
    const row = db.prepare(
      'SELECT COALESCE(MAX(receipt_no), 0) AS m FROM fee_payments WHERE school_id = ? AND IFNULL(academic_year, \'\') = IFNULL(?, \'\')',
    ).get(v.school_id ?? null, v.academic_year ?? null);
    v.receipt_no = (row?.m || 0) + 1;
  };
  if (Array.isArray(op.values)) op.values.forEach(next); else next(op.values);
}

// --- La trace ne se retouche pas ---------------------------------------
// `deleted_fee_payments` est consultable (elle sert à justifier un exercice) mais
// n'accepte AUCUNE écriture du client : seul traceStudentCashBeforeDeletion y
// écrit, en direct. Une trace que celui qui supprime peut ensuite effacer ne
// prouverait rien — c'est tout ce qui la distingue d'un simple journal décoratif.
function guardTraceReadOnly(op) {
  if (op.table !== 'deleted_fee_payments') return;
  if (op.action !== 'select') {
    throw new Error('deleted_fee_payments est une trace : elle se consulte, elle ne s’écrit pas.');
  }
}

// --- LE RÉFÉRENTIEL NATIONAL NE S'ÉCRIT PAS ---------------------------
// `apc_competences`, `prim_competences` et `mat_domaines` portent DEUX natures de
// ligne depuis les migrations `*_par_ecole` : `school_id` NULL = nationale (seed
// officiel, partagée par toutes les écoles), renseignée = propre à une école.
//
// Au Cloud, la RLS dit exactement cela : « ecriture des siennes », USING
// `school_id IS NOT NULL AND member_of_school(school_id)`. En LAN il n'y a pas de
// RLS, donc c'est ce garde qui le dit — sinon un intitulé ministériel pourrait
// être réécrit, ou une ligne nationale s'approprier par un upsert sur son id. Le
// bulletin officiel de toutes les classes qui s'y rattachent en dépend, et le
// seed la réécrirait sans prévenir au redémarrage suivant : le travail serait
// perdu deux fois.
//
// L'école garde les deux gestes prévus pour elle : MASQUER (table `*_masques`)
// et RENOMMER chez soi (`referentiel_libelles`). Rien ne lui est retiré.
const REFERENTIEL_OUVERT = {
  apc_competences: 'compétence', prim_competences: 'compétence', mat_domaines: 'domaine',
  // Le premier cycle peut désormais porter des MATIÈRES maison
  // (supabase_apc_matieres_maison.sql). Sans ces deux lignes, l'édition LAN
  // n'aurait AUCUN garde sur elles : une école pourrait réécrire le libellé
  // d'une matière nationale, que le seed restaurerait au redémarrage suivant —
  // le travail perdu deux fois, exactement ce que ce garde existe pour empêcher.
  // Le Cloud, lui, l'interdit déjà par la RLS « écriture des siennes ».
  apc_matieres: 'matière', apc_classe_matieres: 'matière',
};
function guardReferentielNational(op, ctx) {
  const mot = REFERENTIEL_OUVERT[op.table];
  if (!mot) return;
  if (!['insert', 'upsert', 'update', 'delete'].includes(op.action)) return;
  if (!ctx?.userId) return;   // chemin serveur de confiance : seed officiel, sync, migration
  if (!tableColumns(op.table).has('school_id')) return; // base pas encore migrée

  const refus = `Cette ${mot} est officielle : elle appartient au référentiel national et ne se modifie pas. `
    + `Masquez-la dans votre école, ou renommez-la chez vous.`;

  // 1) Une ligne qui NAÎT doit nommer son école : sans `school_id` elle naîtrait
  //    nationale — c'est le défaut qui faisait passer une compétence maison pour
  //    une ligne du ministère. Un UPDATE, lui, ne transporte que les champs
  //    modifiés : sa propriété se vérifie sur la ligne visée (2), pas ici. Mais
  //    s'il tente d'EFFACER le school_id, il nationalise la ligne : refusé.
  const values = op.values == null ? [] : (Array.isArray(op.values) ? op.values : [op.values]);
  const naissance = op.action === 'insert' || op.action === 'upsert';
  for (const v of values) {
    if (!v) continue;
    if (naissance ? v.school_id == null : ('school_id' in v && v.school_id == null)) throw new Error(refus);
  }

  // 2) Ce qui est VISÉ ne doit pas être une ligne nationale — y compris par un
  //    upsert sur l'id d'une ligne nationale, qui l'aurait purement annexée.
  const ids = [];
  for (const v of values) if (v?.id != null) ids.push(v.id);
  for (const f of op.filters || []) {
    if (f.col !== 'id') continue;
    if (f.op === 'eq') ids.push(f.val);
    else if (f.op === 'in' && Array.isArray(f.val)) ids.push(...f.val);
  }
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    const national = db.prepare(
      `SELECT 1 FROM ${quoteIdent(op.table)} WHERE id IN (${ph}) AND school_id IS NULL LIMIT 1`,
    ).get(...ids);
    if (national) throw new Error(refus);
    return;
  }

  // 3) Écriture de masse (update/delete sans ciblage par id) : elle emporterait
  //    le national avec le reste. On refuse plutôt que de deviner.
  if (['update', 'delete'].includes(op.action)) {
    const porteSchool = (op.filters || []).some((f) => f.col === 'school_id' && f.op === 'eq' && f.val != null);
    if (!porteSchool) throw new Error(refus);
  }
}

// --- L'élève qui porte de l'argent : suppression TRACÉE ----------------
// Historique de cette garde : elle REFUSAIT la suppression d'un élève porteur
// d'écritures, parce que la cascade FK students → fee_payments effaçait l'argent
// au nom du propriétaire de la table, sans repasser ni par la RLS ni par les
// GRANT — donc sans laisser la moindre trace.
//
// Les écoles ont demandé le 27/08/2026 à pouvoir supprimer malgré tout : elles
// réinscrivent l'élève ensuite, et la détection de doublons (lib/studentDuplicate)
// empêche désormais le double dossier qui rendait ce geste dangereux.
//
// Ce qui reste vrai, et qui n'est pas négociable : un versement ne se supprime
// toujours PAS à lui seul — `guardFeePaymentImmutable` refuse tout DELETE sur
// `fee_payments`. Le seul chemin est la suppression de l'ÉLÈVE, gouvernée par le
// droit de supprimer un élève, et chaque ligne emportée est recopiée AVANT sa
// disparition dans `deleted_fee_payments`.
//
// C'est ce recopiage qui fait la différence entre « supprimer » et « faire
// disparaître ». On l'écrit ICI, en amont du DELETE, et pas dans un déclencheur
// SQLite : les déclencheurs ne se déclenchent PAS sur les suppressions en cascade
// tant que `PRAGMA recursive_triggers` est à OFF — la trace serait silencieusement
// vide, ce qui est pire que pas de trace du tout.
//
// Le filtre est résolu EXACTEMENT comme dans doDelete (op.filters, jamais un
// champ inventé) : sinon la trace ne verrait rien passer. La sous-requête couvre
// aussi les suppressions en lot (par classe), pas seulement par id.
function traceStudentCashBeforeDeletion(op, ctx) {
  if (op.table !== 'students' || op.action !== 'delete') return;
  const where = buildWhere(op.filters);
  if (!where.sql) return;   // doDelete refuse déjà un DELETE sans filtre

  const actor = ctx?.userId || null;
  const actorName = actor
    ? (db.prepare('SELECT full_name FROM school_users WHERE user_id = ? LIMIT 1').get(actor)?.full_name || null)
    : null;

  // INSERT ... SELECT : la copie et la lecture se font dans la même instruction,
  // donc aucune ligne ne peut se glisser entre les deux. `OR IGNORE` rend
  // l'opération rejouable sans doubler la trace.
  db.prepare(
    `INSERT OR IGNORE INTO deleted_fee_payments (
       id, school_id, student_id, student_name, academic_year, amount, date, note,
       receipt_no, reversal_of, recorded_by, recorded_by_name, created_at,
       deleted_by, deleted_by_name)
     SELECT p.id, p.school_id, p.student_id, s.name, p.academic_year, p.amount, p.date,
            p.note, p.receipt_no, p.reversal_of, p.recorded_by, p.recorded_by_name,
            p.created_at, ?, ?
       FROM fee_payments p
       LEFT JOIN students s ON s.id = p.student_id
      WHERE p.student_id IN (SELECT id FROM students${where.sql})`,
  ).run(actor, actorName, ...where.params);
}

// --- Opération principale ---------------------------------------------
export function runQuery(op, ctx = null) {
  const { table } = op;
  if (!ALLOWED_TABLES.has(table)) {
    return { error: { message: `Table non autorisée : ${table}` }, data: null };
  }

  // ── ESPACE PARENT : l'API générique lui est FERMÉE, en lecture comme en
  // écriture. Un parent ne parle que RPC (parent_*), où chaque appel est gardé
  // par parentOwnsStudent(). Refuser ici, avant tout le reste, évite de dépendre
  // du filtrage ligne à ligne : les tables hors SCOPED_TABLES (référentiels,
  // paramètres d'école, budgets, RH…) n'y passent pas, et laisseraient donc
  // filtrer des données que le parent n'a aucune raison de voir.
  //
  // ⚠️ `isParentAccount` et NON `loadScope` : loadScope a un EFFET DE BORD — il
  // pose la matrice de rôles stricte (ensureStrictRoleMatrix) et mémorise l'école
  // dans `_matrixSeen`. L'appeler ici, sur TOUTES les tables, marquait une école
  // « traitée » lors d'une simple lecture de `governance_roles` faite AVANT que
  // son drapeau ne soit levé — après quoi la matrice ne se posait plus jamais et
  // l'école se retrouvait durcie SANS caisse. C'est exactement le défaut que
  // verrouille _strict_matrix_seed.test.mjs (« école tardive »), et il l'a
  // attrapé. Ce contrôle-ci doit rester un SELECT pur.
  if (isParentAccount(ctx?.userId)) {
    return { error: { message: 'Accès refusé : un compte parent ne consulte que son espace.' }, data: null };
  }

  try {
    guardAppendOnly(op, ctx);
    guardFeePaymentImmutable(op, ctx); // recettes : pas d'update/delete, caissier estampillé
    guardTraceReadOnly(op);                   // la trace se consulte, elle ne s'écrit pas
    guardReferentielNational(op, ctx);        // le national reste intact (pendant LAN de la RLS)
    traceStudentCashBeforeDeletion(op, ctx);  // l'argent emporté par la cascade est tracé AVANT
    guardBudgetExpense(op, ctx);   // enforcement budgétaire serveur (chaîne + workflow + permissions)
    guardBudgetStructure(op);      // P5 : pas de modif silencieuse / d'écriture directe des opérations
    guardBudgetLine(op);           // v3 : activation ligne (config + plafond annuel) + gel
    guardBudgetAllocations(op);    // v3 : gel des allocations d'une ligne active/clôturée
    guardSchoolIsolation(op, ctx); // étanchéité INTER-ÉCOLES : vaut aussi pour un compte global
    guardScopeWrite(op, ctx);      // cloisonnement secteur : écriture hors périmètre refusée
    guardSchoolWrite(op, ctx);     // nom + paramètres de l'établissement : admin uniquement
    guardClassLimit(op);           // édition restreinte : plafond de classes (build utilisateur)
    let result;
    switch (op.action) {
      case 'select': result = doSelect(op, ctx); break;
      case 'insert': result = doInsertOrUpsert(op, false); break;
      case 'upsert': result = doInsertOrUpsert(op, true); break;
      case 'update': result = doUpdate(op); break;
      case 'delete': result = doDelete(op); break;
      default: return { error: { message: `Action inconnue : ${op.action}` }, data: null };
    }
    // H3-b : sur une écriture de dépense, émettre la DEMANDE d'approbation distante
    // si la dépense est soumise (mode gouvernance distante). Best-effort strict :
    // ne doit JAMAIS transformer une écriture réussie en erreur.
    if (!result?.error && op.table === 'budget_expenses' && ['insert', 'upsert', 'update'].includes(op.action)) {
      try { emitApprovalRequestForOp(op); } catch (e) { console.warn('[gov] demande d’approbation non émise:', e.message); }
    }
    return result;
  } catch (e) {
    return { error: { message: e.message }, data: null };
  }
}

function doSelect(op, ctx = null) {
  const { table } = op;
  const { scalars, embeds } = parseColumns(op.columns);
  // On sélectionne toujours toutes les colonnes scalaires existantes
  // (l'embed a besoin des FK) puis on projette si nécessaire.
  const selectCols = scalars.includes('*')
    ? '*'
    : Array.from(new Set([...scalars, ...embeds.map((e) => e.fk)]))
        .filter((c) => tableColumns(table).has(c)).map(quoteIdent).join(', ') || '*';

  const where = buildWhere(op.filters);
  let sql = `SELECT ${selectCols} FROM ${quoteIdent(table)}${where.sql}`;

  if (op.order?.length) {
    const ord = op.order
      .filter((o) => tableColumns(table).has(o.col))
      .map((o) => `${quoteIdent(o.col)} ${o.ascending === false ? 'DESC' : 'ASC'}`);
    if (ord.length) sql += ' ORDER BY ' + ord.join(', ');
  }
  if (op.limit != null) sql += ` LIMIT ${Number(op.limit) | 0}`;
  // .range(from, to) côté client → LIMIT/OFFSET (pagination de l'export complet).
  if (op.limit != null && op.offset) sql += ` OFFSET ${Math.max(0, Number(op.offset) | 0)}`;
  if (op.single) sql += op.limit == null ? ' LIMIT 2' : '';

  let rows = db.prepare(sql).all(...where.params);

  // CLOISONNEMENT SECTEUR — appliqué APRÈS la requête, sur les lignes brutes,
  // donc quel que soit le filtre demandé par l'appelant. Un compte sectoriel
  // qui vise directement l'id d'une ressource de l'autre secteur obtient un
  // résultat vide (équivalent 404), jamais la donnée.
  if (SCOPED_TABLES[table] && ctx) {
    const scope = loadScope(ctx.userId);
    // Filtré même pour un compte GLOBAL : `rowAllowed` assure aussi
    // l'étanchéité inter-écoles, qui ne dépend pas du périmètre sectoriel.
    rows = rows.filter((r) => rowAllowed(scope, table, r));
  }

  if (embeds.length) rows = resolveEmbeds(rows, embeds);

  if (op.single) {
    if (rows.length === 0) {
      // .single() => erreur, .maybeSingle() => null
      return op.maybeSingle
        ? { data: null, error: null }
        : { data: null, error: { message: 'No rows found', code: 'PGRST116' } };
    }
    if (rows.length > 1 && !op.maybeSingle) {
      return { data: null, error: { message: 'Multiple rows returned' } };
    }
    return { data: rows[0], error: null };
  }
  return { data: rows, error: null };
}

// Cœur insert/upsert SANS transaction propre (réutilisable dans un batch : SQLite
// n'imbrique pas les BEGIN). doInsertOrUpsert l'enveloppe dans tx() pour l'op isolée.
function insertOrUpsertCore(op, isUpsert, inserted = []) {
  const { table } = op;
  const rows = Array.isArray(op.values) ? op.values : [op.values];
  const tracked = isTracked(table); // maintenance Merkle (tables suivies uniquement)
  {
    for (const raw of rows) {
      const rec = pickColumns(table, raw);
      if (!('id' in rec) && tableColumns(table).has('id')) rec.id = randomUUID();
      stampSync(table, rec);
      const cols = Object.keys(rec);
      if (!cols.length) continue;

      const placeholders = cols.map(() => '?').join(', ');
      const colSql = cols.map(quoteIdent).join(', ');
      let sql = `INSERT INTO ${quoteIdent(table)} (${colSql}) VALUES (${placeholders})`;

      if (APPEND_ONLY.has(table)) {
        // Immuabilité stricte : un event/audit déjà présent n'est JAMAIS écrasé
        // (ni par insert ni par upsert) → idempotence du rejeu sans réécriture.
        sql += ` ON CONFLICT(id) DO NOTHING`;
      } else if (isUpsert) {
        const conflict = (op.onConflict || 'id').split(',').map((c) => c.trim());
        const updates = cols
          .filter((c) => !conflict.includes(c))
          .map((c) => `${quoteIdent(c)} = excluded.${quoteIdent(c)}`);
        // Rien à mettre à jour = la ligne EST sa clé (tables d'association pure,
        // comme les masques du référentiel : (school_id, competence_id) et c'est
        // tout). `DO UPDATE SET` vide est une erreur de syntaxe SQLite, et elle
        // faisait échouer le masquage d'une compétence officielle — sans que rien
        // n'explique le refus. Le geste est idempotent par nature : DO NOTHING.
        sql += updates.length
          ? ` ON CONFLICT(${conflict.map(quoteIdent).join(', ')}) DO UPDATE SET ${updates.join(', ')}`
          : ` ON CONFLICT(${conflict.map(quoteIdent).join(', ')}) DO NOTHING`;
      }
      // Snapshot AVANT (un upsert peut écraser une ligne existante → il faut retirer
      // sa contribution Merkle avant d'ajouter la nouvelle).
      const before = tracked ? snapshotRows(table, [rec.id]) : null;
      db.prepare(sql).run(...cols.map((c) => rec[c]));
      if (tracked) maintainMerkle(table, before, snapshotRows(table, [rec.id]));

      if (op.returning && rec.id) {
        inserted.push(db.prepare(`SELECT * FROM ${quoteIdent(table)} WHERE id = ?`).get(rec.id));
      } else {
        inserted.push(rec);
      }
      recordOutbox(table, rec.id, 'upsert');
    }
  }
  return inserted;
}

function doInsertOrUpsert(op, isUpsert) {
  const inserted = [];
  tx(() => insertOrUpsertCore(op, isUpsert, inserted));
  if (op.single) return { data: inserted[0] ?? null, error: null };
  return { data: op.returning ? inserted : null, error: null };
}

function doUpdate(op) {
  const { table } = op;
  const rec = pickColumns(table, op.values);
  stampSync(table, rec);
  const cols = Object.keys(rec);
  if (!cols.length) return { data: null, error: { message: 'Aucune colonne à mettre à jour' } };

  const where = buildWhere(op.filters);
  let setSql = cols.map((c) => `${quoteIdent(c)} = ?`).join(', ');
  // Rend `version` réellement MONOTONE (revue P0 #4) : chaque modif locale
  // incrémente le compteur, ce qui donne un départage LWW fiable même à
  // horodatage égal (ou en cas d'horloge décalée). Non touché si le payload
  // fixe déjà `version` explicitement.
  if (SYNCED_TABLES.has(table) && tableColumns(table).has('version') && !cols.includes('version')) {
    setSql += `, ${quoteIdent('version')} = COALESCE(${quoteIdent('version')}, 0) + 1`;
  }
  // Ids affectés + snapshot AVANT (capturés sur le prédicat courant, avant l'UPDATE).
  const tracked = isTracked(table);
  let affectedIds = null, before = null;
  if (tracked) {
    affectedIds = db.prepare(`SELECT id FROM ${quoteIdent(table)}${where.sql}`).all(...where.params).map((r) => r.id);
    before = snapshotRows(table, affectedIds);
  }
  const sql = `UPDATE ${quoteIdent(table)} SET ${setSql}${where.sql}`;
  db.prepare(sql).run(...cols.map((c) => rec[c]), ...where.params);
  if (tracked) maintainMerkle(table, before, snapshotRows(table, affectedIds));

  if (SYNCED_TABLES.has(table) && tableColumns(table).has('id')) {
    for (const r of db.prepare(`SELECT id FROM ${quoteIdent(table)}${where.sql}`).all(...where.params)) recordOutbox(table, r.id, 'upsert');
  }

  if (op.returning) {
    const rows = db.prepare(`SELECT * FROM ${quoteIdent(table)}${where.sql}`).all(...where.params);
    return { data: op.single ? (rows[0] ?? null) : rows, error: null };
  }
  return { data: null, error: null };
}

function doDelete(op) {
  const { table } = op;
  const where = buildWhere(op.filters);
  if (!where.sql) return { error: { message: 'DELETE sans filtre refusé' }, data: null };
  // Capture les ids supprimés AVANT le DELETE → tombstones dans l'outbox pour
  // propager la suppression au cloud (la ligne disparaît localement, hard delete).
  let deletedIds = [];
  if (SYNCED_TABLES.has(table) && tableColumns(table).has('id')) {
    deletedIds = db.prepare(`SELECT id FROM ${quoteIdent(table)}${where.sql}`).all(...where.params).map((r) => r.id);
  }
  const tracked = isTracked(table);
  const before = tracked ? snapshotRows(table, deletedIds) : null;
  db.prepare(`DELETE FROM ${quoteIdent(table)}${where.sql}`).run(...where.params);
  if (tracked) maintainMerkle(table, before, new Map()); // après = vide → contributions retirées
  for (const id of deletedIds) recordOutbox(table, id, 'delete');
  return { data: null, error: null };
}

// --- Batch atomique (Unit of Work / transactional outbox) -------------
// Applique une LISTE d'ops d'écriture dans UNE SEULE transaction : tout est
// validé, ou rien (rollback). C'est ce qui permet au kernel d'écrire une donnée
// métier ET l'event d'outbox `domain_events` de façon indissociable → un crash
// (coupure secteur) ne peut plus laisser la donnée sans son event. Aucune op de
// lecture ici. Toute erreur d'une op fait échouer et annuler tout le lot.
// Applique une LISTE d'ops d'écriture (mêmes GUARDS que runQuery/runBatch) SANS
// ouvrir de transaction : à appeler DANS une transaction déjà ouverte par l'appelant.
// C'est le point d'entrée que l'applicateur de gouvernance budgétaire (H3b-3) réutilise
// pour appliquer une intention distante par le CHEMIN GUARDÉ (jamais rawUpsert), tout en
// inscrivant l'idempotence + la confirmation dans la MÊME tx atomique. Lève sur violation.
export function runOpsGuarded(ops = [], ctx = null) {
  // Même fermeture que runQuery : le lot atomique est aussi une porte d'écriture.
  // Même raison d'utiliser isParentAccount plutôt que loadScope : ici on est DANS
  // une transaction, et un effet de bord annulé par un rollback laisserait l'école
  // marquée traitée pour rien.
  if (isParentAccount(ctx?.userId)) {
    throw new Error('Accès refusé : un compte parent ne consulte que son espace.');
  }
  for (const op of ops) {
    if (!ALLOWED_TABLES.has(op.table)) throw new Error(`Table non autorisée : ${op.table}`);
    guardAppendOnly(op, ctx);
    guardBudgetExpense(op, ctx);   // enforcement budgétaire serveur
    guardBudgetStructure(op);      // P5 : structure/opérations protégées (RPC only)
    guardBudgetLine(op);           // v3 : activation ligne (config + plafond annuel) + gel
    guardBudgetAllocations(op);    // v3 : gel des allocations d'une ligne active/clôturée
    guardSchoolWrite(op, ctx);     // nom + paramètres de l'établissement : admin uniquement
    guardClassLimit(op);           // édition restreinte : plafond de classes (build utilisateur)
    // CLOISONNEMENT — ces deux gardes MANQUAIENT sur le chemin du lot : /api/db
    // les appliquait, /api/db/batch non. Un lot pouvait donc écrire dans le
    // secteur d'un autre responsable, voire dans un AUTRE établissement, alors
    // que la même op passée à l'unité était refusée. Constaté par
    // server/_bulletinSecurityE2E.test.mjs.
    guardSchoolIsolation(op, ctx); // étanchéité inter-établissements
    guardScopeWrite(op, ctx);      // cloisonnement sectoriel
    guardReferentielNational(op, ctx); // référentiel : le national ne s'écrit pas
    let res;
    switch (op.action) {
      case 'insert': insertOrUpsertCore(op, false); break;
      case 'upsert': insertOrUpsertCore(op, true); break;
      case 'update': res = doUpdate(op); break;   // pas de tx interne
      case 'delete': res = doDelete(op); break;    // pas de tx interne
      default: throw new Error(`Action inconnue : ${op.action}`);
    }
    if (res?.error) throw new Error(res.error.message); // → rollback du lot
  }
}

export function runBatch(ops = [], ctx = null) {
  if (!Array.isArray(ops) || !ops.length) return { data: { applied: 0 }, error: null };
  try {
    tx(() => runOpsGuarded(ops, ctx));
    return { data: { applied: ops.length }, error: null };
  } catch (e) {
    return { data: null, error: { message: e.message } };
  }
}
