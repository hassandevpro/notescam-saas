// Adaptateur client — édition LAN.
//
// Réexpose EXACTEMENT la surface de supabase-js utilisée par l'app
// (from().select/insert/upsert/update/delete + filtres, .rpc, .auth, .storage)
// mais traduit chaque appel en requête HTTP vers le serveur local Fastify.
//
// Au build cloud, ce fichier n'est jamais chargé : Vite n'aliase `./supabase`
// vers ici que lorsque `mode === 'lan'` (voir vite.config.js). La version
// cloud reste donc 100 % inchangée.

const BASE = import.meta.env.VITE_LAN_API_BASE || ''; // même origine que la SPA
const SESSION_KEY = 'nc_lan_session';

// --- Session locale ---------------------------------------------------
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
function saveSession(session) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}
let _session = loadSession();
const _authListeners = new Set();
function emitAuth(event) {
  for (const cb of _authListeners) { try { cb(event, _session); } catch { /* ignore */ } }
}
function setSession(session, event) {
  _session = session; saveSession(session); emitAuth(event);
}

function authHeaders(extra = {}) {
  const h = { ...extra };
  if (_session?.access_token) h.Authorization = `Bearer ${_session.access_token}`;
  return h;
}

async function apiJson(path, { method = 'POST', body, headers } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: authHeaders({ 'Content-Type': 'application/json', ...headers }),
    body: body != null ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* corps vide */ }
  if (!res.ok && json == null) return { data: null, error: { message: `HTTP ${res.status}` } };
  return json ?? { data: null, error: null };
}

// --- Query builder (thenable) ----------------------------------------
class QueryBuilder {
  constructor(table) {
    this.table = table;
    this.action = 'select';
    this.columns = '*';
    this._filters = [];
    this._order = [];
    this._limit = null;
    this._single = false;
    this._maybeSingle = false;
    this._values = null;
    this._onConflict = null;
    this._returning = false;
  }

  select(columns = '*') {
    if (this.action === 'select') this.columns = columns;
    else { this._returning = true; this.columns = columns; } // .insert().select()
    return this;
  }
  insert(values) { this.action = 'insert'; this._values = values; return this; }
  upsert(values, opts = {}) { this.action = 'upsert'; this._values = values; this._onConflict = opts.onConflict || 'id'; return this; }
  update(values) { this.action = 'update'; this._values = values; return this; }
  delete() { this.action = 'delete'; return this; }

  eq(col, val)  { this._filters.push({ col, op: 'eq',  val }); return this; }
  neq(col, val) { this._filters.push({ col, op: 'neq', val }); return this; }
  gt(col, val)  { this._filters.push({ col, op: 'gt',  val }); return this; }
  gte(col, val) { this._filters.push({ col, op: 'gte', val }); return this; }
  lt(col, val)  { this._filters.push({ col, op: 'lt',  val }); return this; }
  lte(col, val) { this._filters.push({ col, op: 'lte', val }); return this; }
  is(col, val)  { this._filters.push({ col, op: 'is',  val }); return this; }
  in(col, val)  { this._filters.push({ col, op: 'in',  val }); return this; }
  match(obj)    { for (const [col, val] of Object.entries(obj || {})) this._filters.push({ col, op: 'eq', val }); return this; }

  order(col, opts = {}) { this._order.push({ col, ascending: opts.ascending !== false }); return this; }
  limit(n) { this._limit = n; return this; }
  single() { this._single = true; return this; }
  maybeSingle() { this._single = true; this._maybeSingle = true; return this; }

  _op() {
    return {
      table: this.table, action: this.action, columns: this.columns,
      filters: this._filters, order: this._order, limit: this._limit,
      single: this._single, maybeSingle: this._maybeSingle,
      values: this._values, onConflict: this._onConflict,
      returning: this._returning || (this.action === 'select'),
    };
  }

  then(resolve, reject) {
    return apiJson('/api/db', { body: this._op() }).then(resolve, reject);
  }
}

// --- Auth -------------------------------------------------------------
// `persist` = false reproduit le client « anonyme » utilisé par l'admin pour
// créer des comptes profs/staff SANS écraser sa propre session (cf. Teachers.jsx
// et staffAccounts.js, qui instancient un second client via createClient()).
function makeAuth(persist) {
  return {
    async getSession() {
      return { data: { session: persist ? _session : null }, error: null };
    },
    async getUser() {
      if (!_session) return { data: { user: null }, error: null };
      const r = await apiJson('/api/auth/me', { method: 'GET' });
      return { data: { user: r?.data?.user ?? null }, error: r?.error ?? null };
    },
    async signInWithPassword({ email, password }) {
      const r = await apiJson('/api/auth/login', { body: { email, password } });
      if (r?.error) return { data: { session: null, user: null }, error: r.error };
      if (persist) setSession(r.data.session, 'SIGNED_IN');
      return { data: { session: r.data.session, user: r.data.user }, error: null };
    },
    async signUp({ email, password, options }) {
      const full_name = options?.data?.full_name;
      const r = await apiJson('/api/auth/signup', { body: { email, password, full_name } });
      if (r?.error) return { data: { user: null, session: null }, error: r.error };
      if (persist) setSession(r.data.session, 'SIGNED_IN');
      return { data: { user: r.data.user, session: r.data.session }, error: null };
    },
    async signOut() { if (persist) setSession(null, 'SIGNED_OUT'); return { error: null }; },
    async updateUser(attrs) {
      const r = await apiJson('/api/auth/update', { body: { password: attrs.password, full_name: attrs.data?.full_name } });
      return { data: { user: r?.data?.user ?? null }, error: r?.error ?? null };
    },
    // Hors-ligne : pas d'email. Erreur explicite -> l'admin réinitialise localement.
    async resetPasswordForEmail() { return { data: {}, error: { message: 'Indisponible hors-ligne. Demandez à l’administrateur.' } }; },
    async resend() { return { data: {}, error: null }; },
    onAuthStateChange(cb) {
      _authListeners.add(cb);
      Promise.resolve().then(() => cb('INITIAL_SESSION', persist ? _session : null));
      return { data: { subscription: { unsubscribe: () => _authListeners.delete(cb) } } };
    },
  };
}

// --- Storage ----------------------------------------------------------
function storageFrom(bucket) {
  return {
    async upload(path, fileBody, opts = {}) {
      const res = await fetch(`${BASE}/api/files/${bucket}/${path}`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': fileBody?.type || 'application/octet-stream', 'x-upsert': opts.upsert ? '1' : '0' }),
        body: fileBody,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) return { data: null, error: json?.error || { message: `HTTP ${res.status}` } };
      return { data: json?.data ?? { path }, error: null };
    },
    getPublicUrl(path) {
      return { data: { publicUrl: `${BASE}/files/${bucket}/${path}` } };
    },
    async remove(paths = []) {
      for (const p of paths) {
        await fetch(`${BASE}/api/files/${bucket}/${p}`, { method: 'DELETE', headers: authHeaders() });
      }
      return { data: {}, error: null };
    },
  };
}

// --- Realtime via polling (édition LAN) -------------------------------
// Supabase Realtime (WebSocket) n'existe pas hors-ligne. On reproduit
//   .channel(name).on('postgres_changes', { event, table, filter }, cb).subscribe()
// par un sondage périodique de la table filtrée. Chaque abonnement garde sa
// propre photo (id -> signature) : un id jamais vu = INSERT, une signature qui
// change (ex. une notif ré-émise repasse read=false) = UPDATE — exactement la
// sémantique Postgres attendue par notifications/messages. Le 1er sondage
// établit la référence sans déclencher. Le code applicatif et le build cloud
// restent strictement inchangés.
const POLL_MS = Number(import.meta.env.VITE_LAN_POLL_MS || 8000);

function parseEqFilter(filter) {
  const m = /^(\w+)=eq\.(.+)$/.exec(filter || '');
  return m ? { col: m[1], val: m[2] } : null;
}
function rowSignature(row) {
  // `read` capté en plus de la date : une ligne ré-émise (read repasse à false)
  // change de signature et déclenche donc un UPDATE, comme en cloud.
  return `${row.read ?? ''}|${row.updated_at ?? row.created_at ?? ''}`;
}

function makeChannel() {
  const subs = [];      // { event, table, filter, cb, seen:Map, primed:bool }
  let timer = null;

  async function pollSub(s) {
    if (!s.table) return;
    const qb = new QueryBuilder(s.table).select('*');
    if (s.filter) qb.eq(s.filter.col, s.filter.val);
    qb.order('created_at', { ascending: false }).limit(100);
    const { data, error } = await qb;
    if (error || !Array.isArray(data)) return;
    const firstRun = !s.primed;
    s.primed = true;
    for (const row of data) {
      if (row?.id == null) continue;
      const sig  = rowSignature(row);
      const prev = s.seen.get(row.id);
      s.seen.set(row.id, sig);
      if (firstRun) continue;
      const evt = prev === undefined ? 'INSERT' : (prev !== sig ? 'UPDATE' : null);
      if (evt && (s.event === '*' || s.event === evt)) {
        try { s.cb({ eventType: evt, new: row, old: null }); } catch { /* ignore */ }
      }
    }
  }

  const poll = () => Promise.all(subs.map(pollSub));

  const channel = {
    on(_type, opts = {}, cb) {
      subs.push({ event: opts.event || '*', table: opts.table, filter: parseEqFilter(opts.filter), cb, seen: new Map(), primed: false });
      return channel;
    },
    subscribe() {
      if (!timer && subs.length) {
        poll();                          // amorçage immédiat (établit la référence)
        timer = setInterval(poll, POLL_MS);
      }
      return channel;
    },
    unsubscribe() { if (timer) { clearInterval(timer); timer = null; } },
  };
  return channel;
}

// --- Fabrique de client (même forme que createClient de supabase-js) ---
function makeClient(persist = true) {
  return {
    from: (table) => new QueryBuilder(table),
    rpc: (name, params) => apiJson(`/api/rpc/${name}`, { body: params || {} }),
    auth: makeAuth(persist),
    storage: { from: storageFrom },
    channel: () => makeChannel(),
    removeChannel(ch) { try { ch?.unsubscribe?.(); } catch { /* ignore */ } },
  };
}

// Client principal (session persistante) — équivalent de l'export `supabase`.
export const supabase = makeClient(true);

// Équivalent de createClient() : honore { auth: { persistSession: false } }
// pour reproduire le client « anonyme » sans toucher à la session admin.
export function createClient(_url, _key, opts) {
  return makeClient(opts?.auth?.persistSession !== false);
}
