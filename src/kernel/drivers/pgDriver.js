// Driver Postgres/LAN — traduit le contrat de driver vers l'API supabase-js.
//
// Le client est INJECTÉ : en Cloud c'est `supabase`, en LAN c'est `localClient`
// (aliasé par Vite sur `./supabase`, MÊME surface d'API). Ce fichier fonctionne
// donc à l'identique dans les deux éditions. Il n'est jamais importé par les
// tests (qui utilisent createMemoryDriver), ce qui garde le kernel pur.
// Traduit une op UoW { table, type, entity } vers le format d'op générique
// attendu par le serveur LAN (/api/db/batch → runBatch). Utilisé uniquement
// quand le client expose `batch` (édition LAN).
function toWireOp({ table, type, entity }) {
  switch (type) {
    case 'insert': return { table, action: 'insert', values: entity };
    case 'upsert': return { table, action: 'upsert', values: entity, onConflict: 'id' };
    case 'update': {
      const { id, ...patch } = entity;
      return { table, action: 'update', values: patch, filters: [{ col: 'id', op: 'eq', val: id }] };
    }
    case 'delete': return { table, action: 'delete', filters: [{ col: 'id', op: 'eq', val: entity.id }] };
    default: throw new Error(`toWireOp: opération inconnue « ${type} »`);
  }
}

export function createPgDriver(client) {
  const driver = {
    async get(table, id) {
      const { data, error } = await client.from(table).select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    async select(table, { match = {}, order = null, limit = null } = {}) {
      let q = client.from(table).select('*');
      for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
      if (order) q = q.order(order.col, { ascending: order.dir !== 'desc' });
      if (limit != null) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    async insert(table, row) {
      const { data, error } = await client.from(table).insert(row).select().maybeSingle();
      if (error) throw error;
      return data;
    },
    async upsert(table, row) {
      const { data, error } = await client.from(table).upsert(row).select().maybeSingle();
      if (error) throw error;
      return data;
    },
    async update(table, id, patch) {
      const { data, error } = await client.from(table).update(patch).eq('id', id).select().maybeSingle();
      if (error) throw error;
      return data;
    },
    async delete(table, id) {
      const { error } = await client.from(table).delete().eq('id', id);
      if (error) throw error;
    },
  };

  // commit(opList) ATOMIQUE — exposé UNIQUEMENT si le client sait batcher en une
  // transaction (localClient LAN → /api/db/batch). Le client Cloud (supabase-js)
  // n'a pas cette surface : le driver n'a alors pas de `commit`, et l'UoW retombe
  // sur son enchaînement séquentiel (l'atomicité multi-tables Cloud relève d'une
  // future RPC Postgres, cf. docs/ARCHITECTURE_KERNEL.md).
  if (typeof client.batch === 'function') {
    driver.commit = async (opList = []) => {
      const { error } = await client.batch(opList.map(toWireOp));
      if (error) throw error;
    };
  } else if (typeof client.rpc === 'function') {
    // Cloud (supabase-js) : pas de batch, mais l'écriture d'un event passe par la
    // RPC kernel_emit (SECURITY DEFINER) — SEULE voie autorisée par la RLS, qui
    // estampille l'acteur depuis auth.uid() (non-répudiation, cf. #8) et dérive
    // la ligne d'audit dans la même transaction. L'UoW l'appelle au lieu d'un
    // insert direct dans domain_events (que la RLS refuse désormais).
    driver.emit = async (event) => {
      const { error } = await client.rpc('kernel_emit', { p_event: event });
      if (error) throw error;
    };
  }

  return driver;
}
