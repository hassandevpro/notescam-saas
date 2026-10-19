// UNE FICHE DE FRAIS DÉJÀ AU CLOUD SOUS UN AUTRE id — ce que ce test ferme.
//
// Signalé par THE GENIUS le 2026-10-19, vu à l'écran dans le bandeau de
// synchronisation du navigateur :
//
//     student_fees · upsert
//     duplicate key value violates unique constraint
//       "student_fees_student_id_academic_year_key"
//
// `student_fees` porte UNIQUE(student_id, academic_year) des deux côtés
// (`supabase_sprint15.sql`, `server/schema.sql`) — vérifié aussi dans
// `pg_constraint` de la base de production. Mais tout le chemin d'écriture
// upsertait sur `id`, et `saveFee` fabrique un `uuid()` neuf dès que la fiche
// n'est pas dans le cache local (autre poste, autre navigateur, cache vidé,
// lecture restreinte par secteur, année active changée sans rechargement).
// L'INSERT heurtait la ligne que le Cloud détient déjà sous un autre id : refus
// 23505, élément bloqué dans la file, rejoué à chaque cycle puis mis en
// quarantaine. Le montant dû saisi par la caisse n'arrivait JAMAIS.
//
// Ce que `upsertFee` doit tenir :
//   • écrire DANS la ligne existante, et ne jamais créer de seconde ligne ;
//   • rendre la ligne du Cloud (avec SON id), pour que l'appelant réaligne son
//     cache — sinon le poste refabrique le même id et la file se rebloque ;
//   • NE PAS toucher au cache de paiement (`frais_payes`,
//     `date_dernier_paiement`) : la fiche qui arrive ici n'a jamais vu la ligne
//     du Cloud, son 0 écraserait des encaissements réels. `fee_payments` fait
//     foi, `reconcileFeesPaid` (monotone) relève le cache ensuite ;
//   • ne pas transformer un AUTRE refus en silence.
//
// Lancer :
//   node --experimental-loader ./src/lib/_feeUpsertConflit.hooks.mjs src/lib/_feeUpsertConflit.test.mjs

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

const DUP = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "student_fees_student_id_academic_year_key"',
};

// Doublure PostgREST : une table en mémoire qui applique les DEUX clés —
// PRIMARY KEY (id) et UNIQUE (student_id, academic_year).
function doublure(lignes, { autreRefus = null } = {}) {
  const table = lignes.map((r) => ({ ...r }));
  const appels = [];
  const fin = (res) => ({ select: () => ({ single: () => Promise.resolve(res) }) });
  return {
    table, appels,
    from(nom) {
      if (nom !== 'student_fees') throw new Error(`table inattendue : ${nom}`);
      return {
        upsert(payload) {
          appels.push({ op: 'upsert', id: payload.id });
          if (autreRefus) return fin({ data: null, error: autreRefus });
          const parId = table.find((r) => r.id === payload.id);
          if (parId) { Object.assign(parId, payload); return fin({ data: { ...parId }, error: null }); }
          const conflit = table.find((r) =>
            r.student_id === payload.student_id && r.academic_year === payload.academic_year);
          if (conflit) return fin({ data: null, error: DUP });
          table.push({ ...payload });
          return fin({ data: { ...payload }, error: null });
        },
        select(cols) {
          appels.push({ op: 'select', cols });
          const filtres = [];
          const q = {
            eq(col, val) { filtres.push([col, val]); return q; },
            maybeSingle: () => {
              const trouve = table.find((r) => filtres.every(([c, v]) => r[c] === v));
              return Promise.resolve({ data: trouve ? { ...trouve } : null, error: null });
            },
          };
          return q;
        },
      };
    },
  };
}

const ECOLE = '6b68407b-3d2e-426b-81ff-c4e68e66120a';
const ELEVE = '11111111-1111-4111-8111-111111111111';
const AN = '2026-2027';

// Ligne telle que le Cloud la détient : id du poste qui l'a créée, et 50 000 F
// déjà encaissés.
const auCloud = {
  id: 'cloud-aaaa', school_id: ECOLE, student_id: ELEVE, academic_year: AN,
  frais_annuels: 150000, frais_payes: 50000, date_dernier_paiement: '2026-10-01',
  tranches: [], adjustments: [], payment_mode: 'echelonne',
};

// Fiche fabriquée par un AUTRE poste, qui n'a jamais vu la ligne ci-dessus :
// id neuf, cache de paiement à zéro, et un dû que la caisse vient de corriger.
const locale = {
  id: 'local-bbbb', school_id: ECOLE, student_id: ELEVE, academic_year: AN,
  frais_annuels: 200000, frais_payes: 0, date_dernier_paiement: null,
  tranches: [], adjustments: [], payment_mode: 'echelonne',
};

const chargerUpsertFee = async () => (await import('./schoolService.js')).upsertFee;

// ── 1. Conflit sur (élève, année) : on écrit dans la ligne du Cloud ─────────
{
  const d = doublure([auCloud]);
  globalThis.__supabaseDouble = d;
  const upsertFee = await chargerUpsertFee();
  const saved = await upsertFee({ ...locale });

  ok(saved !== null, 'un refus 23505 sur (élève, année) ne renvoie plus null', saved);
  ok(saved?.id === 'cloud-aaaa', 'la ligne rendue porte l’id du Cloud, pas celui fabriqué', saved?.id);
  ok(d.table.length === 1, 'aucune seconde ligne n’est créée pour le même (élève, année)', d.table.length);
  ok(d.table[0].frais_annuels === 200000, 'le dû que la caisse a saisi est bien écrit', d.table[0].frais_annuels);
  ok(d.table[0].frais_payes === 50000, 'les 50 000 F déjà encaissés ne sont PAS écrasés par le 0 local', d.table[0].frais_payes);
  ok(d.table[0].date_dernier_paiement === '2026-10-01', 'la date du dernier versement est préservée', d.table[0].date_dernier_paiement);
  ok(saved?.frais_payes === 50000, 'la ligne rendue porte le cache de paiement du Cloud', saved?.frais_payes);
  ok(!d.table.some((r) => r.id === 'local-bbbb'), 'l’id fabriqué localement ne subsiste pas en base', d.table.map((r) => r.id));
}

// ── 2. Chemin normal : rien à soigner ──────────────────────────────────────
{
  const d = doublure([]);
  globalThis.__supabaseDouble = d;
  const upsertFee = await chargerUpsertFee();
  const saved = await upsertFee({ ...locale });

  ok(saved?.id === 'local-bbbb', 'une fiche inédite garde son id', saved?.id);
  ok(d.table.length === 1, 'une seule ligne écrite', d.table.length);
  ok(d.appels.filter((a) => a.op === 'select').length === 0, 'aucune lecture de rattrapage quand il n’y a pas de conflit', d.appels);
}

// ── 3. Mise à jour d'une fiche déjà connue : inchangée ─────────────────────
{
  const d = doublure([auCloud]);
  globalThis.__supabaseDouble = d;
  const upsertFee = await chargerUpsertFee();
  const saved = await upsertFee({ ...auCloud, frais_payes: 75000, date_dernier_paiement: '2026-10-19' });

  ok(saved?.frais_payes === 75000, 'un encaissement sur la fiche CONNUE passe toujours', saved?.frais_payes);
  ok(d.table.length === 1, 'toujours une seule ligne', d.table.length);
}

// ── 4. Un refus qui n'est pas ce doublon reste un refus ────────────────────
{
  const autre = { code: '42501', message: 'new row violates row-level security policy for table "student_fees"' };
  const d = doublure([], { autreRefus: autre });
  globalThis.__supabaseDouble = d;
  const upsertFee = await chargerUpsertFee();
  const saved = await upsertFee({ ...locale });

  ok(saved === null, 'un refus RLS n’est pas transformé en succès', saved);
  ok(d.appels.filter((a) => a.op === 'select').length === 0, 'aucune lecture de rattrapage sur un refus étranger', d.appels);
}

// ── 5. 23505 sans ligne correspondante : on ne boucle pas, on refuse ───────
{
  const d = doublure([], { autreRefus: DUP });
  globalThis.__supabaseDouble = d;
  const upsertFee = await chargerUpsertFee();
  const saved = await upsertFee({ ...locale });

  ok(saved === null, 'un 23505 dont la ligne est introuvable reste un refus (jamais de boucle)', saved);
  ok(d.appels.filter((a) => a.op === 'upsert').length === 1, 'un seul upsert tenté quand la lecture ne trouve rien',
    d.appels.filter((a) => a.op === 'upsert').length);
}

// ── 6. Charge utile incomplète : pas de rattrapage à l'aveugle ─────────────
{
  const d = doublure([], { autreRefus: DUP });
  globalThis.__supabaseDouble = d;
  const upsertFee = await chargerUpsertFee();
  const saved = await upsertFee({ id: 'local-cccc', school_id: ECOLE, frais_annuels: 1000 });

  ok(saved === null, 'sans student_id ni academic_year, aucun rattrapage n’est tenté', saved);
  ok(d.appels.filter((a) => a.op === 'select').length === 0, 'aucune lecture sans clé naturelle complète', d.appels);
}

// ── 7. Le périmètre école borne la lecture de rattrapage ───────────────────
{
  // Même élève, même année, mais la ligne appartient à une AUTRE école : la
  // lecture filtrée par school_id ne doit pas la ramener.
  const d = doublure([{ ...auCloud, school_id: 'autre-ecole' }]);
  globalThis.__supabaseDouble = d;
  const upsertFee = await chargerUpsertFee();
  const saved = await upsertFee({ ...locale });

  ok(saved === null, 'une ligne hors périmètre école n’est pas adoptée', saved);
  ok(d.table.length === 1 && d.table[0].frais_annuels === 150000,
    'et elle n’est pas modifiée', d.table[0]);
}

console.log(`\n${pass} ok, ${fail} ko`);
process.exit(fail ? 1 : 0);
