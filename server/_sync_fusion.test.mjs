// Test — DEUX PERSONNES QUI TOUCHENT DEUX CHAMPS DIFFÉRENTS NE S'ÉCRASENT PLUS.
//
// LE SCÉNARIO QUI PERDAIT DES DONNÉES, ET QUI EST LA RAISON DE CE FICHIER :
//
//   9 h  — la secrétaire corrige le TÉLÉPHONE de Marie, à l'école, hors ligne.
//   10 h — le censeur corrige le NOM de Marie, en ligne.
//   → la ligne distante est « plus récente » : elle écrasait TOUTE la ligne
//     locale. Le téléphone corrigé à 9 h était perdu, sans un mot, sans trace.
//
// Les deux ne se gênaient pas — champs différents — et pourtant une correction
// sur deux était jetée. Le contrôle 1 est ce scénario, au mot près.
//
// I26 : chaque détecteur de ce fichier a été vu échouer sur le défaut qu'il
// surveille avant d'être conservé.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-fusion-'));
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const { fusionner, distantGagneChamp, canon } = await import('./syncMerge.js');
const { CHAMPS_SENSIBLES, TABLES_AJOUT_SEUL } = await import('./syncSensible.js');
const { db, lireOmbre, poserOmbre, enregistrerConflit, conflitsOuverts } = await import('./db.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};
const COLS = ['id', 'name', 'phone', 'guardian_name', 'updated_at', 'version'];

// ── 1. LE SCÉNARIO DE L'ÉCOLE ─────────────────────────────────────────────
{
  const ombre  = { id: 's1', name: 'Marie Ngo',  phone: '677000000', version: 1 };
  const local  = { id: 's1', name: 'Marie Ngo',  phone: '699111111', version: 2,
    updated_at: '2026-11-02T09:00:00.000Z' };            // l'école a corrigé le téléphone
  const distant = { id: 's1', name: 'Marie Ngoh', phone: '677000000', version: 3,
    updated_at: '2026-11-02T10:00:00.000Z' };            // le Cloud a corrigé le nom
  const f = fusionner({ table: 'students', local, distant, ombre, colonnes: COLS });
  ok(f.rec.phone === '699111111', '1. le téléphone corrigé à l’école SURVIT (c’était la perte)', f.rec.phone);
  ok(f.rec.name === 'Marie Ngoh', '2. le nom corrigé en ligne est pris aussi', f.rec.name);
  ok(f.conflits.length === 0 && f.garde.length === 0,
    '3. aucun conflit déclaré : les deux champs sont différents', { c: f.conflits, g: f.garde });
  ok(f.resteALocal === true, '4. la ligne doit être REPOUSSÉE (le Cloud ignore le téléphone)', f.resteALocal);
  ok(f.rec.version === 4, '5. la version fusionnée dépasse les deux, sinon le Cloud la réécrase', f.rec.version);
}

// ── 6. SANS BASE, LA FUSION SE REFUSE AU LIEU DE DEVINER ──────────────────
// Première écriture de ce test : elle passait une ombre VIDE et attendait que
// le local soit conservé. Faux — sans base, tout champ qui diffère paraît
// « touché des deux côtés », et la fonction rendait un départage de ligne
// entière déguisé en fusion par champ. Elle rend maintenant `null`, et
// l'appelant retombe explicitement sur `remoteWins()`.
{
  const local   = { id: 's1', name: 'Marie Ngo', phone: '699111111', version: 2 };
  const distant = { id: 's1', name: 'Marie Ngoh', phone: '677000000', version: 3 };
  ok(fusionner({ table: 'students', local, distant, ombre: {}, colonnes: COLS }) === null
    && fusionner({ table: 'students', local, distant, ombre: null, colonnes: COLS }) === null,
    '6. sans ombre, la fusion REFUSE de deviner (elle rend null)');
}
// ── 7-8. UN VRAI CONFLIT DE CHAMP : LES DEUX ONT TOUCHÉ LE MÊME ───────────
{
  const ombre   = { id: 's1', phone: '677000000', version: 1 };
  const local   = { id: 's1', phone: '699111111', version: 2 };
  const distant = { id: 's1', phone: '655222222', version: 5 };
  const f = fusionner({ table: 'students', local, distant, ombre, colonnes: COLS });
  ok(f.conflits.length === 1 && f.conflits[0].col === 'phone',
    '7. le conflit de champ est DÉCLARÉ, pas avalé', f.conflits);
  ok(f.rec.phone === '655222222' && f.conflits[0].retenu === 'distant',
    '8. départagé par la VERSION (5 > 2), et la valeur écartée reste lisible',
    { retenu: f.rec.phone, perdu: f.conflits[0].local });
}

// ── 9. L'HORLOGE D'UN PC MAL RÉGLÉ NE DÉCIDE PLUS ─────────────────────────
// Le poste de l'école se croit en 2019 (pile de carte mère vide, c'est arrivé).
// Avec un départage par horodatage, il perdrait TOUS ses conflits. La version
// est un compteur logique : elle ignore l'heure système.
{
  const local   = { version: 9, updated_at: '2019-01-01T00:00:00.000Z' };
  const distant = { version: 3, updated_at: '2026-11-02T10:00:00.000Z' };
  ok(distantGagneChamp(local, distant) === false,
    '9. une horloge fausse ne fait plus perdre : la version logique tranche',
    distantGagneChamp(local, distant));
  ok(distantGagneChamp({ version: 4, device_id: 'a' }, { version: 4, device_id: 'b' }) === true
    && distantGagneChamp({ version: 4, device_id: 'b' }, { version: 4, device_id: 'a' }) === false,
    '10. à égalité parfaite, le départage est DÉTERMINISTE (sinon les bases divergent)');
}

// ── 11-13. AJOUT SEUL : UNE ÉCRITURE COMPTABLE NE S'ÉCRASE PAS ────────────
{
  const colsP = ['id', 'amount', 'receipt_no', 'method', 'version'];
  const ombre   = { id: 'p1', amount: 50000, receipt_no: null, method: 'cash', version: 1 };
  const local   = { id: 'p1', amount: 50000, receipt_no: 47,   method: 'momo', version: 2 };
  const distant = { id: 'p1', amount: 90000, receipt_no: 48,   method: 'cash', version: 9 };
  const f = fusionner({ table: 'fee_payments', local, distant, ombre, colonnes: colsP });
  ok(f.rec.amount === 50000,
    '11. un MONTANT déjà encaissé n’est pas réécrit, même par une version plus haute', f.rec.amount);
  ok(f.rec.receipt_no === 47,
    '12. un numéro de reçu déjà attribué n’est pas réécrit', f.rec.receipt_no);
  ok(f.garde.length >= 2 && f.garde.every((g) => g.retenu === undefined),
    '13. ces refus sont INSCRITS : conservés, et visibles pour arbitrage', f.garde.map((g) => g.col));
}
{
  // Le cas NORMAL : le Cloud attribue le numéro, le local ne l'a pas encore.
  const colsP = ['id', 'amount', 'receipt_no', 'version'];
  const f = fusionner({ table: 'fee_payments',
    ombre:   { id: 'p2', amount: 50000, receipt_no: null, version: 1 },
    local:   { id: 'p2', amount: 50000, receipt_no: null, version: 1 },
    distant: { id: 'p2', amount: 50000, receipt_no: 51,   version: 2 },
    colonnes: colsP });
  ok(f.rec.receipt_no === 51 && f.garde.length === 0,
    '14. le Cloud peut REMPLIR un champ vide (numéro de reçu) sans conflit', f.rec.receipt_no);
}

// ── 15. UNE NOTE NE S'ÉCRASE JAMAIS EN SILENCE ────────────────────────────
{
  const f = fusionner({ table: 'grades',
    ombre:   { id: 'g1', value: '12', version: 1 },
    local:   { id: 'g1', value: '14', version: 2 },
    distant: { id: 'g1', value: '09', version: 7 },
    colonnes: ['id', 'value', 'version'] });
  ok(f.rec.value === '14' && f.garde.length === 1 && f.garde[0].col === 'value',
    '15. deux saisies différentes sur la MÊME note : le local tient, l’arbitrage est inscrit',
    { retenu: f.rec.value, garde: f.garde.length });
}

// ── 16. NULL N'EST PAS LA CHAÎNE VIDE ─────────────────────────────────────
// Un téléphone jamais saisi et un téléphone EFFACÉ ne disent pas la même
// chose. Les confondre ferait passer un effacement pour « inchangé », et le
// numéro effacé reviendrait tout seul au cycle suivant.
{
  ok(canon(null) !== canon(''), '16. null et chaîne vide se distinguent', [canon(null), canon('')]);
  const f = fusionner({ table: 'students',
    ombre:   { id: 's9', phone: '677000000' },
    local:   { id: 's9', phone: null },
    distant: { id: 's9', phone: '677000000' },
    colonnes: COLS });
  ok(f.rec.phone === null, '17. un effacement local est un changement, et il tient', f.rec.phone);
}

// ── 18-20. LA LISTE DE PROTECTION NE DOIT PAS VISER DES COLONNES FANTÔMES ─
// La première version de `syncSensible.js` nommait SIX colonnes inexistantes
// (amount, amount_due, discount, starts_on, ends_on, promotion_decision). Une
// liste de protection qui vise à côté ne protège rien — et, muette, elle fait
// croire que c'est fait. Ce contrôle est le garde-fou de cette liste.
{
  const schema = readFileSync(join(RACINE, 'server/schema.sql'), 'utf8');
  const colonnesDe = (t) => {
    const m = schema.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${t} \\(([\\s\\S]*?)\\n\\);`));
    if (!m) return null;
    return new Set([...m[1].matchAll(/^\s{2}([a-z_][a-z0-9_]*)\s/gm)].map((x) => x[1]));
  };
  const absentes = [];
  for (const [table, champs] of Object.entries(CHAMPS_SENSIBLES)) {
    const cols = colonnesDe(table);
    if (!cols) { absentes.push(`${table} (table absente)`); continue; }
    for (const c of champs) if (!cols.has(c)) absentes.push(`${table}.${c}`);
  }
  ok(absentes.length === 0,
    '18. chaque champ sensible existe VRAIMENT dans le schéma'
    + (absentes.length ? ` — introuvable(s) : ${absentes.join(', ')}` : ''), absentes);

  const tablesAbsentes = [...TABLES_AJOUT_SEUL].filter((t) => !colonnesDe(t));
  ok(tablesAbsentes.length === 0,
    '19. chaque table en ajout seul existe VRAIMENT'
    + (tablesAbsentes.length ? ` — ${tablesAbsentes.join(', ')}` : ''), tablesAbsentes);

  // `fee_payments` est LE cas qui a motivé la règle : si elle sortait de la
  // liste, les montants redeviendraient écrasables sans que rien ne le dise.
  ok(TABLES_AJOUT_SEUL.has('fee_payments') && CHAMPS_SENSIBLES.grades?.has('value'),
    '20. les deux protections nommées par la consigne sont bien en place');
}

// ── 21-24. L'OMBRE ET LE REGISTRE DES CONFLITS, EN BASE ───────────────────
{
  poserOmbre('students', 'x1', { id: 'x1', name: 'Base' });
  ok(lireOmbre('students', 'x1')?.name === 'Base', '21. l’ombre se pose et se relit', lireOmbre('students', 'x1'));
  poserOmbre('students', 'x1', { id: 'x1', name: 'Base 2' });
  ok(lireOmbre('students', 'x1')?.name === 'Base 2', '22. elle se remplace, elle ne s’empile pas');
  ok(lireOmbre('students', 'jamais-vue') === null, '23. une ligne jamais échangée n’a pas d’ombre');

  for (let i = 0; i < 5; i++) {
    enregistrerConflit('grades', 'g1', { col: 'value', local: '14', distant: '09', base: '12' });
  }
  const n = db.prepare("SELECT COUNT(*) n FROM sync_conflicts WHERE row_id = 'g1'").get().n;
  ok(n === 1,
    '24. le même conflit répété au fil des cycles reste UNE ligne (pas « 400 conflits »)', n);
  ok(conflitsOuverts().some((c) => c.row_id === 'g1'),
    '25. il est listé comme ouvert : c’est ce que la supervision affichera');
}

console.log('');
console.log(`=== ${fail ? 'KO' : 'OK'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
