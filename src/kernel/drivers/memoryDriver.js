// Driver mémoire — implémentation du contrat de driver pour les TESTS et le
// mode hors-ligne pur. Même interface que le driver Postgres/LAN, donc le code
// métier est identique quel que soit le backend.
//
// Contrat de driver (5 verbes) :
//   get(table, id)                         -> row | null
//   select(table, { match, order, limit }) -> row[]
//   insert(table, row)                     -> row
//   upsert(table, row)                     -> row      (clé = row.id)
//   update(table, id, patch)               -> row | null
//   delete(table, id)                      -> void
export function createMemoryDriver(seed = {}) {
  const db = new Map(); // table -> Map<id, row>
  function tbl(name) {
    if (!db.has(name)) db.set(name, new Map());
    return db.get(name);
  }
  for (const [name, rows] of Object.entries(seed)) {
    for (const r of rows) tbl(name).set(r.id, { ...r });
  }

  return {
    _db: db,
    async get(table, id) {
      return tbl(table).has(id) ? { ...tbl(table).get(id) } : null;
    },
    async select(table, { match = {}, order = null, limit = null } = {}) {
      let rows = [...tbl(table).values()].filter((r) =>
        Object.entries(match).every(([k, v]) => r[k] === v),
      );
      if (order) {
        const { col, dir = 'asc' } = order;
        rows.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === 'desc' ? -1 : 1));
      }
      if (limit != null) rows = rows.slice(0, limit);
      return rows.map((r) => ({ ...r }));
    },
    async insert(table, row) {
      tbl(table).set(row.id, { ...row });
      return { ...row };
    },
    async upsert(table, row) {
      const prev = tbl(table).get(row.id) || {};
      const next = { ...prev, ...row };
      tbl(table).set(row.id, next);
      return { ...next };
    },
    async update(table, id, patch) {
      const cur = tbl(table).get(id);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      tbl(table).set(id, next);
      return { ...next };
    },
    async delete(table, id) {
      tbl(table).delete(id);
    },

    // commit(opList) — applique une LISTE d'ops { table, type, entity } de façon
    // ATOMIQUE (tout ou rien). C'est la brique du « transactional outbox » : les
    // écritures métier ET l'append de l'outbox sont validées ensemble. Sur erreur,
    // on restaure l'instantané → aucune écriture partielle (cf. scénario crash P0).
    async commit(opList = []) {
      const snapshot = new Map([...db].map(([name, rows]) => [name, new Map(rows)]));
      try {
        for (const { table, type, entity } of opList) {
          switch (type) {
            case 'insert': tbl(table).set(entity.id, { ...entity }); break;
            case 'upsert': tbl(table).set(entity.id, { ...(tbl(table).get(entity.id) || {}), ...entity }); break;
            case 'update': {
              const { id, ...patch } = entity;
              if (tbl(table).has(id)) tbl(table).set(id, { ...tbl(table).get(id), ...patch });
              break;
            }
            case 'delete': tbl(table).delete(entity.id); break;
            default: throw new Error(`commit: opération inconnue « ${type} »`);
          }
        }
      } catch (e) {
        db.clear();
        for (const [name, rows] of snapshot) db.set(name, rows); // rollback
        throw e;
      }
    },
  };
}
