// Repository — accès données AGNOSTIQUE de la source.
//
// La logique métier ne parle qu'à cette interface, jamais à `supabase` ni à
// `localClient` directement. On l'instancie sur un DRIVER injecté :
//   - createPgDriver(client)  → Cloud (Supabase) ET LAN (localClient, même API)
//   - createMemoryDriver()    → tests unitaires, hors-ligne pur
//
// C'est ce qui rend chaque module réutilisable tel quel dans les deux éditions.
export function createRepository(table, driver) {
  if (!table)  throw new Error('createRepository: table requise');
  if (!driver) throw new Error('createRepository: driver requis');
  return {
    table,
    get:    (id)         => driver.get(table, id),
    list:   (query = {}) => driver.select(table, query),
    insert: (entity)     => driver.insert(table, entity),
    upsert: (entity)     => driver.upsert(table, entity),
    update: (id, patch)  => driver.update(table, id, patch),
    remove: (id)         => driver.delete(table, id),
  };
}
