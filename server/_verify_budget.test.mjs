// PLAFONNEMENT DU COÛT DE L'AUDIT D'INTÉGRITÉ, ET ALERTE DE DIVERGENCE PERSISTANTE.
//
//   node server/_verify_budget.test.mjs
//
// LE DÉFAUT VERROUILLÉ ICI
// ────────────────────────
// `verifyIntegrity` descend par portée pour localiser une divergence : un appel
// pour les classes, un pour les séquences, puis UN PAR CLASSE DIVERGENTE. Rien
// ne bornait ce nombre. Quarante classes divergentes dans `grades` faisaient
// 42 appels — et le cycle se rejoue toutes les cinq minutes, soit 8 640 fois
// par mois. Une divergence PERSISTANTE consommait donc le quota d'invocations
// du Cloud sans jamais rien réparer.
//
// Deux exigences qui doivent tenir ensemble :
//   · le coût d'un cycle est borné ;
//   · la convergence n'est pas interrompue et aucune erreur n'est masquée.
//
// Le transport `edge` est une doublure : on compte les appels, on ne touche
// aucun Cloud. La base est une base jetable.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-verify-'));
process.env.NOTESCAM_DATA_DIR = dir;
process.env.NOTESCAM_LICENSE_ENABLED = '0';

const { db } = await import('./db.js');
const { ensureTracked, maintainMerkle } = await import('./syncMerkle.js');
const { verifyIntegrity, resetVerifyResume } = await import('./syncVerify.js');
const { markVerification, syncHealth, divergenceAlert } = await import('./syncHealth.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label}${got === undefined ? '' : ` (obtenu: ${JSON.stringify(got)})`}`); fail++; }
};

// ── Un établissement avec beaucoup de classes divergentes ──────────────────
const NB_CLASSES = 40;
const SCHOOL = 'ecole-test';

db.exec('BEGIN');
db.prepare('INSERT OR REPLACE INTO schools (id, name) VALUES (?,?)').run(SCHOOL, 'Test');
for (let c = 1; c <= NB_CLASSES; c++) {
  const cid = `c${c}`;
  db.prepare('INSERT OR REPLACE INTO classes (id, school_id, name) VALUES (?,?,?)').run(cid, SCHOOL, `Classe ${c}`);
  db.prepare('INSERT OR REPLACE INTO students (id, school_id, class_id, name) VALUES (?,?,?,?)')
    .run(`e${c}`, SCHOOL, cid, `Eleve ${c}`);
  db.prepare('INSERT OR REPLACE INTO subjects (id, school_id, class_id, name, max) VALUES (?,?,?,?,?)')
    .run(`m${c}`, SCHOOL, cid, 'Maths', 20);
  db.prepare(`INSERT OR REPLACE INTO grades (id, school_id, class_id, student_id, subject_id, sequence, value)
              VALUES (?,?,?,?,?,?,?)`).run(`g${c}`, SCHOOL, cid, `e${c}`, `m${c}`, 1, 12);
}
db.exec('COMMIT');

try { ensureTracked('grades'); } catch { /* selon le schéma */ }
try { maintainMerkle(); } catch { /* best-effort */ }

// ── Doublure du transport : le Cloud diverge sur `grades`, partout ─────────
function faireEdge() {
  const appels = [];
  const edge = async (payload) => {
    appels.push(payload);
    if (payload.op === 'tablelevel') {
      // `grades` diverge ; tout le reste est identique à ce que le LAN calcule.
      // On renvoie un checksum impossible pour forcer la descente.
      return { merkle: { grades: { checksum: 'DIVERGENT', count: 999999 } }, plain: {} };
    }
    if (payload.op === 'scope') {
      // Toutes les partitions divergent → la descente voudrait tout visiter.
      const parts = {};
      const n = payload.scope === 'class' ? NB_CLASSES : (payload.keys?.length || 1);
      for (let i = 1; i <= n; i++) {
        const k = payload.scope === 'class' ? `c${i}` : (payload.keys?.[i - 1] ?? `k${i}`);
        parts[k] = { checksum: `DIV-${k}`, count: 1 };
      }
      return { parts };
    }
    return {};
  };
  return { edge, appels, scopes: () => appels.filter((a) => a.op === 'scope').length };
}

// ── 1. LE DÉFAUT : sans plafond, la descente visite tout ──────────────────
// `maxScopes: 0` reproduit le comportement d'avant le correctif.
{
  resetVerifyResume();
  const t = faireEdge();
  const r = await verifyIntegrity({ edge: t.edge, promote: false, maxScopes: 0 });
  ok(t.scopes() > 20, `sans plafond, la descente consomme beaucoup d’appels (${t.scopes()})`, t.scopes());
  ok(r.truncated === false, 'et le rapport n’est pas marqué écourté');
  ok(r.ok === false, 'la divergence est bien signalée');
}

// ── 2. AVEC PLAFOND : le coût d'un cycle est borné ────────────────────────
{
  resetVerifyResume();
  const t = faireEdge();
  const r = await verifyIntegrity({ edge: t.edge, promote: false, maxScopes: 6 });
  ok(t.scopes() <= 6, `le cycle ne dépasse PAS son budget de 6 appels (${t.scopes()})`, t.scopes());
  ok(r.truncated === true, 'le rapport dit que la localisation est partielle');
  ok(r.summary.scopeBudget === 6, 'le budget du cycle figure au rapport');
}

// ── 3. RIEN N'EST MASQUÉ : une divergence reste une divergence ────────────
// C'est la propriété la plus importante : plafonner le COÛT ne doit pas rendre
// un établissement désynchronisé « conforme ».
{
  resetVerifyResume();
  const t = faireEdge();
  const r = await verifyIntegrity({ edge: t.edge, promote: false, maxScopes: 2 });
  ok(r.ok === false, 'même écourté, le verdict reste NON conforme');
  ok(r.mismatches.includes('grades'), 'la table divergente est nommée');
  ok(r.globalChecksum.match === false, 'l’empreinte globale ne correspond pas');
  ok(Array.isArray(r.dashboard) && r.dashboard.length > 0, 'le tableau de bord est produit');
}

// ── 4. LA CONVERGENCE N'EST PAS INTERROMPUE ──────────────────────────────
// Un cycle écourté doit NOMMER ce qu'il n'a pas pu visiter, pour que la
// réparation du cycle suivant reprenne le travail au lieu de le recommencer.
{
  resetVerifyResume();
  const t = faireEdge();
  const r = await verifyIntegrity({ edge: t.edge, promote: false, maxScopes: 5 });
  const noeud = r.divergences.find((d) => d.table === 'grades');
  ok(!!noeud, 'la table divergente a bien un nœud de localisation');
  ok(noeud.classes.length > 0, `des classes SONT localisées malgré le plafond (${noeud.classes.length})`);
  ok(Array.isArray(noeud.pendingClasses) && noeud.pendingClasses.length > 0,
     `et celles qui restent sont nommées (${noeud.pendingClasses?.length})`);
  const localisees = new Set(noeud.classes.map((c) => c.class_id));
  ok(noeud.pendingClasses.every((c) => !localisees.has(c)),
     'aucune classe n’est à la fois localisée et en attente');
}

// ── 5. REPRISE TOURNANTE entre deux cycles ───────────────────────────────
// Sans elle, le budget serait toujours dépensé sur la même table et les autres
// ne seraient jamais examinées.
{
  resetVerifyResume();
  // Deux tables divergentes, budget qui ne suffit que pour une.
  const appels = [];
  const edge = async (p) => {
    appels.push(p);
    if (p.op === 'tablelevel') {
      return { merkle: {
        grades: { checksum: 'DIV', count: 1 },
        students: { checksum: 'DIV', count: 1 },
      }, plain: {} };
    }
    if (p.op === 'scope') {
      const parts = {};
      for (let i = 1; i <= NB_CLASSES; i++) parts[`c${i}`] = { checksum: `D${i}`, count: 1 };
      return { parts };
    }
    return {};
  };

  const vues = [];
  for (let cycle = 0; cycle < 4; cycle++) {
    appels.length = 0;
    const r = await verifyIntegrity({ edge, promote: false, maxScopes: 3 });
    vues.push(r.divergences.map((d) => d.table).join('+'));
  }
  const distinctes = new Set(vues.flatMap((v) => v.split('+')));
  ok(distinctes.has('grades') && distinctes.has('students'),
     `sur plusieurs cycles, les DEUX tables finissent examinées (${[...distinctes].join(', ')})`,
     vues);
}

// ── 6. Audit à la demande : le plafond se lève ───────────────────────────
// Un administrateur qui déclenche un contrôle veut une localisation complète et
// accepte d'en payer le coût, une fois.
{
  resetVerifyResume();
  const t = faireEdge();
  const r = await verifyIntegrity({ edge: t.edge, promote: false, maxScopes: 0 });
  ok(r.summary.scopeBudget === null, 'à la demande, aucun budget n’est appliqué');
  ok(r.truncated === false, 'et la localisation est complète');
}

// ── 7. ALERTE DE DIVERGENCE PERSISTANTE ─────────────────────────────────
{
  // Une divergence qui se répare : aucune alerte.
  markVerification({ at: new Date().toISOString(), ok: false, mismatches: ['grades'], summary: {} });
  ok(divergenceAlert() === null, 'un seul cycle divergent n’alerte pas');
  markVerification({ at: new Date().toISOString(), ok: true, mismatches: [], summary: {} });
  ok(syncHealth().divergenceStreak === 0, 'la série repart de zéro dès que tout concorde');

  // Une divergence qui s'installe : alerte au seuil.
  for (let i = 0; i < 12; i++) {
    markVerification({ at: new Date().toISOString(), ok: false, mismatches: ['grades', 'students'], summary: {}, truncated: true });
  }
  const a = divergenceAlert();
  ok(!!a, 'au bout de 12 cycles identiques, une alerte est levée');
  ok(a.streak === 12, `la série est comptée (${a?.streak})`);
  ok(a.tables.join(',') === 'grades,students', 'les tables concernées sont nommées');
  ok(a.truncated === true, 'et l’alerte dit que la localisation était écourtée');
  ok(typeof a.since === 'string', 'avec la date de début de la série');

  // Une AUTRE divergence : la série ne s'additionne pas.
  markVerification({ at: new Date().toISOString(), ok: false, mismatches: ['fee_payments'], summary: {} });
  ok(syncHealth().divergenceStreak === 1, 'changer de divergence remet la série à 1');
  ok(divergenceAlert() === null, 'et retire l’alerte, parce que ce n’est plus le même défaut');
}

try { rmSync(dir, { recursive: true, force: true }); } catch { /* verrou Windows */ }

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} réussis, ${fail} échoués`);
process.exit(fail === 0 ? 0 : 1);
