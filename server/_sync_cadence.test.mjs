// Test — CADENCE de la synchronisation LAN ↔ Cloud (envoi après écriture, tirage
// en boucle, délai réseau, recul, refus du Cloud, contrôle sync-verify).
//
// Vrai planificateur, vrai `fetch` (donc vrai AbortSignal), vrai SQLite jetable ;
// seul le Cloud est un faux serveur HTTP local. Les durées sont réduites (centaines
// de ms au lieu de dizaines de secondes) : on vérifie les MÉCANISMES et leurs
// proportions, pas les durées de production.
//
// Règle du dépôt (I26) : chaque contrôle a été vu échouer sur le défaut réintroduit
// (voir la liste « mutations » dans docs/SYNCHRONISATION.md § 10).
import http from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ── Faux Cloud ───────────────────────────────────────────────────────────────
const C = {
  mode: 'ok',            // ok | hang | drop | silence-apres-entetes
  verify: '500',         // 500 | diverge | hang. En panne par défaut : les sections qui ne testent pas
                         // le contrôle ne doivent pas attendre autoRepair (un appel par table).
  latence: 0,
  refuses: new Set(),
  sansRejected: false,   // simule l'ancienne fonction (pas de champ `rejected`)
  pages: [],             // réponses scriptées de sync-pull
  calls: [],
  etats: [],             // corps 'etat' reçu par sync-pull (ce que l'école DIT au Cloud)
  recu: new Map(),       // id -> { row, t }
  courant: 0, maxConcurrent: 0,
};
const srv = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', async () => {
    const path = req.url.split('/').pop();
    const body = b ? JSON.parse(b) : {};
    C.calls.push({ path, t: Date.now(), n: body.changes?.length });
    C.courant++; C.maxConcurrent = Math.max(C.maxConcurrent, C.courant);
    const fin = () => { C.courant--; };
    res.on('close', fin);
    const rep = (s, o) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (C.latence) await new Promise((r) => setTimeout(r, C.latence));
    if (C.mode === 'drop') return req.socket.destroy();
    if (C.mode === 'hang' || (C.hangPush && path === 'sync-push')) return;   // ne répond jamais
    if (C.mode === 'silence-apres-entetes') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.write('{"ro'); }
    if (path === 'sync-push') {
      const rejected = []; let applied = 0;
      for (const c of body.changes || []) {
        if (C.refuses.has(c.row.id)) { rejected.push({ table: c.table, id: c.row.id, reason: 'violates foreign key constraint (simulé)' }); continue; }
        C.recu.set(c.row.id, { row: c.row, t: Date.now() }); applied++;
      }
      return rep(200, C.sansRejected ? { applied } : { applied, skipped: rejected.length, rejected });
    }
    if (path === 'sync-pull') {
      C.etats.push(body.etat);
      const p = C.pages.shift();
      return rep(200, p || { rows: {}, tombstones: [], cursor: 'c', tomb_cursor: null, done: true });
    }
    if (path === 'sync-verify') {
      if (C.verify === '500') return rep(500, { error: 'boom' });
      if (C.verify === 'hang') return;
      return rep(200, { merkle: {}, plain: {} });                    // le Cloud « ne connaît rien » → tout diverge
    }
    return rep(404, { error: 'absent du faux cloud' });
  });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));

// ── Serveur LAN réel (env AVANT import : les constantes se lisent au chargement) ──
const dir = mkdtempSync(join(tmpdir(), 'nc-cadence-'));
process.env.NOTESCAM_DATA_DIR = dir;
process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${srv.address().port}`;
process.env.NOTESCAM_CLOUD_SYNC = '1';
process.env.NOTESCAM_PUSH_MAX_ATTEMPTS = '3';
process.env.NOTESCAM_PULL_MAX_PAGES = '4';
process.env.NOTESCAM_EDGE_TIMEOUT_MS = '400';
writeFileSync(join(dir, 'server-token.key'), 'jeton-de-test');

const { db, sansEcho } = await import('./db.js');
const { syncOnce, scheduleCloudSync, arreterCloudSync } = await import('./cloudSync.js');
const { syncHealth } = await import('./syncHealth.js');

// PRÉCHAUFFAGE. Le premier contrôle d'intégrité reconstruit l'arbre de Merkle local :
// un calcul synchrone qui gèle la boucle d'événements (donc les minuteurs) un moment.
// Sans cela, le premier cycle de chaque scénario fausse les mesures de temps.
{
  const { verifyIntegrity } = await import('./syncVerify.js');
  await verifyIntegrity({ edge: async () => ({ merkle: {}, plain: {} }), promote: false }).catch(() => {});
}

let pass = 0, fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };
const dort = (ms) => new Promise((r) => setTimeout(r, ms));
// Sans délai réseau, un appel figé ne rend jamais la main : on le borne pour que l'ABSENCE de
// délai échoue sur un contrôle nommé (« BLOQUÉ »), et non par un test qui ne finit pas.
const borne = (p, ms = 3000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('BLOQUÉ : aucun délai réseau')), ms))]);
const attendre = async (cond, max = 3000) => { const t = Date.now(); while (!cond()) { if (Date.now() - t > max) return false; await dort(10); } return true; };
const appels = (p) => C.calls.filter((c) => c.path === p);
const ecrire = (id, nom = id) => db.prepare('INSERT INTO students (id, school_id, class_id, name, updated_at) VALUES (?,?,?,?,?)')
  .run(id, 'sch1', 'clsX', nom, new Date().toISOString());
const reset = () => { C.hangPush = false; C.mode = 'ok'; C.verify = '500'; C.latence = 0; C.refuses.clear(); C.sansRejected = false; C.pages = []; C.calls = []; C.etats = []; C.courant = 0; C.maxConcurrent = 0; };
const viderFile = () => db.exec('DELETE FROM sync_outbox'); // base JETABLE de ce test uniquement

sansEcho(() => {
  db.prepare('INSERT INTO schools (id, name) VALUES (?,?)').run('sch1', 'École');
  db.prepare('INSERT INTO classes (id, school_id, name) VALUES (?,?,?)').run('clsX', 'sch1', 'Classe X');
});
const ligne = (id, n = id) => ({ id, school_id: 'sch1', class_id: 'clsX', name: n, updated_at: new Date().toISOString() });
const present = (id) => !!db.prepare('SELECT 1 x FROM students WHERE id = ?').get(id);

// ═════════ 1. BOUCLE DE TIRAGE TANT QUE done EST FAUX ═════════
console.log('\n── 1. boucle de tirage');
{
  const pagesStub = (liste) => { const calls = []; const f = async (path) => {
    if (path === 'sync-push') return { applied: 0, rejected: [] };
    calls.push(path); return liste.shift() || { rows: {}, tombstones: [], cursor: 'z', done: true };
  }; f.calls = calls; return f; };

  let e = pagesStub([
    { rows: { students: [ligne('p1a'), ligne('p1b')] }, tombstones: [], cursor: 'k1', done: false },
    { rows: { students: [ligne('p2a')] }, tombstones: [], cursor: 'k2', done: false },
    { rows: {}, tombstones: [], cursor: 'k2', done: true },
  ]);
  const r = await syncOnce({ edge: e });
  ok(r.pulled === 3 && e.calls.length === 3, 'done=false → rappelle jusqu\'à done=true (3 pages, 3 lignes)', { pulled: r.pulled, appels: e.calls.length });
  ok(present('p1a') && present('p1b') && present('p2a'), 'les lignes de TOUTES les pages sont en base');
  ok(db.prepare("SELECT value v FROM sync_cursor WHERE name='pull_at'").get()?.v === 'k2', 'le curseur est celui de la dernière page');

  e = pagesStub([{ rows: { students: [ligne('u1')] }, tombstones: [], cursor: 'u', done: undefined }]);
  await syncOnce({ edge: e });
  ok(e.calls.length === 1, 'done absent (ancienne fonction, doublure) → UNE page, comme avant', e.calls.length);

  // Un Cloud « qui ne finit jamais » : il s'arrête de lui-même à la page 50 pour que
  // l'ABSENCE de plafond se voie comme un chiffre (50 ≠ 4), pas comme un blocage.
  let n = 0; e = async (path) => path === 'sync-push' ? { applied: 0, rejected: [] }
    : { rows: { students: [ligne('inf' + (++n))] }, tombstones: [], cursor: 'inf' + n, done: n >= 50 };
  await syncOnce({ edge: e });
  ok(n === 4, 'Cloud qui ne finit jamais → plafonné à NOTESCAM_PULL_MAX_PAGES (4)', n);

  let m = 0; e = async (path) => path === 'sync-push' ? { applied: 0, rejected: [] } : (m++, { rows: {}, tombstones: [], cursor: 'fige', done: false });
  await syncOnce({ edge: e });
  ok(m === 1, 'done=false mais page vide → ARRÊT immédiat (pas de boucle sans fin)', m);

  let d = 0; e = async (path) => path === 'sync-push' ? { applied: 0, rejected: [] } : (d++, { rows: { students: [ligne('dry' + d)] }, tombstones: [], cursor: 'dry' + d, done: false });
  await syncOnce({ edge: e, dryRun: true });
  ok(d === 1, 'dry-run → une seule page (le curseur n\'avance pas, rappeler redemanderait la même)', d);
  ok(!present('dry1'), 'dry-run n\'écrit rien');
}

// ═════════ 2. DÉLAI RÉSEAU + REPRISE PROPRE ═════════
console.log('\n── 2. délai réseau (400 ms ici, 30 s en production)');
{
  reset(); viderFile();
  C.mode = 'hang';
  let t0 = Date.now(), err = null;
  try { await borne(syncOnce()); } catch (e) { err = e; }
  const dt = Date.now() - t0;
  ok(err && dt >= 350 && dt < 1500, 'Cloud muet → abandon au délai, pas d\'attente indéfinie', { dt, msg: err?.message });
  ok(err?.reseau === true && err?.timeout === true, 'l\'erreur est marquée réseau + timeout', { reseau: err?.reseau, timeout: err?.timeout });
  ok(/timeout/i.test(err?.message || ''), 'le message dit « timeout » (classé « Internet indisponible » à l\'écran)', err?.message);

  C.mode = 'silence-apres-entetes'; t0 = Date.now(); err = null;
  try { await borne(syncOnce()); } catch (e) { err = e; }
  ok(err?.timeout === true && Date.now() - t0 < 1500, 'en-têtes reçus puis silence → le corps aussi est borné', { dt: Date.now() - t0, msg: err?.message });

  // Un délai de POUSSÉE ne doit jamais user la file : 5 coupures > PUSH_MAX_ATTEMPTS (3).
  ecrire('t-ok', 'saisie avant coupure');
  // Le mode « silence » du contrôle précédent est encore actif : sans ce retour à la
  // normale, c'est le TIRAGE qui expire et la poussée n'est jamais atteinte — les
  // contrôles suivants passeraient à vide (vu en réintroduisant le défaut).
  C.mode = 'ok'; C.calls = [];
  C.hangPush = true;                       // le tirage passe, SEULE la poussée se fige
  let timeoutsPush = 0;
  for (let i = 0; i < 5; i++) {
    try { await borne(syncOnce()); } catch (e) { if (e.timeout) timeoutsPush++; }
  }
  C.hangPush = false;
  ok(timeoutsPush === 5, 'cinq poussées figées → cinq timeouts', timeoutsPush);
  ok(appels('sync-push').length === 5, 'et la poussée a bien été TENTÉE cinq fois (pas un tirage qui échoue avant)', appels('sync-push').length);
  const e1 = db.prepare("SELECT attempts a FROM sync_outbox WHERE row_id='t-ok'").get();
  const q1 = db.prepare("SELECT COUNT(*) n FROM sync_outbox_quarantine WHERE row_id='t-ok'").get().n;
  ok(!!e1 && q1 === 0, 'après 5 coupures de poussée, la ligne est TOUJOURS en file, hors quarantaine', { e1, q1 });
  ok(e1?.a === 0, 'aucune tentative n\'est comptée contre la ligne (le lien est fautif, pas elle)', e1);

  reset();
  const rr = await syncOnce();
  ok(rr.pushed >= 1 && C.recu.has('t-ok'), 'REPRISE : le lien revient → la ligne part, sans intervention', { pushed: rr.pushed });
  ok(!db.prepare("SELECT 1 x FROM sync_outbox WHERE row_id='t-ok'").get(), 'et la file est purgée');
}

// ═════════ 3. ENVOI APRÈS ÉCRITURE (DÉBOUNCE) ═════════
console.log('\n── 3. envoi après écriture (débounce 150 ms ici, 3 s en production)');
{
  reset(); viderFile();
  scheduleCloudSync(60_000, { debounceMs: 150, debounceMaxMs: 600, surveillanceMs: 20, verifyEveryMs: 60_000 });
  await attendre(() => appels('sync-pull').length >= 1, 2000); await dort(300);
  C.calls = [];

  const tEcr = Date.now();
  for (let i = 0; i < 5; i++) { ecrire('deb' + i); await dort(15); }
  const tFin = Date.now();
  ok(await attendre(() => C.recu.has('deb4'), 2000), 'une écriture part SANS attendre l\'intervalle (60 s ici)');
  await dort(200);
  ok(appels('sync-push').length === 1 && appels('sync-push')[0].n === 5, '5 écritures rapprochées → UN seul envoi de 5 lignes', appels('sync-push').map((c) => c.n));
  const delai = C.recu.get('deb4').t - tFin;
  ok(delai >= 100 && delai < 700, 'envoi ≈ débounce après la dernière écriture', delai);

  // saisie continue : le plafond empêche de repousser l'envoi indéfiniment
  C.calls = []; C.recu.clear();
  const debut = Date.now(); let premierEnvoi = null;
  for (let i = 0; i < 40; i++) { ecrire('cont' + i); await dort(40); if (premierEnvoi == null && appels('sync-push').length) premierEnvoi = Date.now() - debut; }
  // `premierEnvoi` n'est renseigné QUE pendant la rafale : sa seule existence prouve
  // qu'un envoi est parti avant la fin de la saisie (sans plafond, il attendrait le calme).
  ok(premierEnvoi != null && premierEnvoi < 1500, 'saisie CONTINUE (≥ 1,6 s) : un envoi part AVANT la fin, plafonné par debounceMax', premierEnvoi);
  await attendre(() => C.recu.has('cont39'), 2000);
  ok(C.recu.has('cont39'), 'rien n\'est perdu : la dernière ligne de la rafale arrive aussi');

  // Calme plat : aucun appel (le périodique est à 60 s)
  await dort(300); C.calls = [];
  await dort(800);
  ok(C.calls.length === 0, 'sans écriture, aucun appel parasite (pas de martèlement)', C.calls.map((c) => c.path));
  arreterCloudSync();
}

// ═════════ 4. UN SEUL CYCLE À LA FOIS + RATTRAPAGE ═════════
console.log('\n── 4. jamais deux cycles en même temps');
{
  reset(); viderFile();
  C.latence = 250;                                     // un cycle dure ~500 ms
  scheduleCloudSync(120, { debounceMs: 40, debounceMaxMs: 200, surveillanceMs: 15, verifyEveryMs: 60_000 });
  await dort(300);
  for (let i = 0; i < 6; i++) { ecrire('ov' + i); await dort(110); }   // écritures PENDANT les cycles
  ok(await attendre(() => C.recu.has('ov5'), 4000), 'une écriture faite pendant un cycle est poussée ensuite (rattrapage)');
  ok(C.maxConcurrent === 1, 'jamais plus d\'UN appel Cloud simultané (pas de chevauchement)', C.maxConcurrent);
  arreterCloudSync();
  await attendre(() => C.courant === 0, 3000); await dort(300);

  // 4 bis. RATTRAPAGE avec un intervalle LONG (comme en production) : avec 120 ms, le
  // périodique rattrapait l'écriture de toute façon et ce contrôle ne distinguait rien
  // (mutation « rattrapage supprimé » non détectée). À 60 s, seul le rattrapage la pousse.
  reset(); viderFile(); C.latence = 250;
  scheduleCloudSync(60_000, { debounceMs: 40, debounceMaxMs: 200, surveillanceMs: 15, verifyEveryMs: 60_000 });
  // Le cycle tire PUIS pousse : une écriture faite pendant le tirage part dans ce même
  // cycle. Pour exercer le rattrapage, il faut écrire APRÈS la lecture de la file — donc
  // pendant le contrôle (sync-verify), alors que le cycle est encore en cours.
  await attendre(() => appels('sync-verify').length >= 1, 3000);
  const tEcr = Date.now(); ecrire('rat-1', 'écrite pendant le premier cycle');
  ok(await attendre(() => C.recu.has('rat-1'), 4000), 'écriture faite PENDANT un cycle, intervalle 60 s : poussée juste après (rattrapage)', Date.now() - tEcr);
  ok(C.maxConcurrent === 1, 'sans chevauchement non plus', C.maxConcurrent);
  arreterCloudSync();
  await attendre(() => C.courant === 0, 3000); await dort(300);
}

// ═════════ 5. COUPURE : RECUL PROGRESSIF PUIS REPRISE ═════════
console.log('\n── 5. recul après échec, reprise automatique');
{
  reset(); viderFile();
  C.mode = 'drop';
  scheduleCloudSync(100, { debounceMs: 40, surveillanceMs: 20, verifyEveryMs: 60_000, backoffMaxMs: 800 });
  ecrire('hors1', 'saisi pendant la coupure');
  await dort(3600);
  const t = appels('sync-pull').map((c) => c.t);
  const ecarts = t.slice(1).map((x, i) => x - t[i]);
  ok(t.length >= 4 && t.length < 15, 'pendant la coupure : peu d\'essais (le recul espace), pas 36', t.length);
  // 200 → 400 → 800 (plafond) : on exige la croissance puis le palier, avec de la marge
  // pour la gigue des minuteurs (le 3e écart touche déjà le plafond).
  ok(ecarts.length >= 3 && ecarts[1] > ecarts[0] * 1.3 && ecarts[2] >= ecarts[1] * 0.95 && ecarts[2] > ecarts[0] * 2, 'les écarts GRANDISSENT (×2) puis plafonnent', ecarts);
  ok(Math.max(...ecarts) < 1900,'et sont plafonnés (backoffMax 800 ms ici, 5 min en production)', Math.max(...ecarts));
  const f = db.prepare("SELECT attempts a FROM sync_outbox WHERE row_id='hors1'").get();
  ok(!!f && f.a === 0, 'la saisie faite pendant la coupure est en file, intacte, 0 tentative', f);
  ok(syncHealth().lastError?.kind === 'network', 'l\'écran dit « Internet indisponible » (kind=network), pas une erreur de synchro', syncHealth().lastError);

  C.mode = 'ok';
  ok(await attendre(() => C.recu.has('hors1'), 2500), 'REPRISE : la ligne part toute seule dès que le lien revient');
  ok(await attendre(() => syncHealth().lastError == null, 3000), 'la santé repasse au vert (au retour du succès)');
  C.calls = []; await dort(450);
  const t2 = appels('sync-pull').map((c) => c.t);
  ok(t2.length >= 3 && (t2[2] - t2[1]) < 250, 'après succès le rythme normal revient (le recul est remis à zéro)', t2.slice(1).map((x, i) => x - t2[i]));
  arreterCloudSync();
}

// ═════════ 6. sync-verify : cadence, divergence, pannes ═════════
console.log('\n── 6. sync-verify');
{
  // 6a. cadence : le contrôle ne suit PAS le rythme du tirage
  reset(); viderFile();
  scheduleCloudSync(80, { debounceMs: 40, surveillanceMs: 20, verifyEveryMs: 600 });
  await dort(2100);
  const cycles = appels('sync-pull').length, verifs = appels('sync-verify').length;
  ok(cycles >= 12, 'les cycles de tirage tournent à la cadence rapide', cycles);
  ok(verifs >= 2 && verifs <= 6, 'sync-verify garde SA cadence (≈ toutes les 600 ms ici, 5 min en production)', { verifs, cycles });
  ok(verifs * 3 < cycles, 'sans cela il y en aurait un par cycle : 3× moins au moins', { verifs, cycles });
  arreterCloudSync(); await attendre(() => C.courant === 0, 3000); await dort(200);

  // 6b. un Cloud qui diverge : signalé, sans faire échouer la synchro
  reset(); viderFile(); C.verify = 'diverge';
  scheduleCloudSync(80, { debounceMs: 40, surveillanceMs: 20, verifyEveryMs: 60_000 });
  await attendre(() => syncHealth().lastVerifyOk === false, 8000);
  const h = syncHealth();
  ok(h.lastVerifyOk === false && h.lastMismatches.length > 0, 'un Cloud qui diverge est SIGNALÉ (lastVerifyOk=false, tables nommées)', { ok: h.lastVerifyOk, n: h.lastMismatches.length });
  ok(h.lastSuccessAt && h.lastError == null, 'mais la synchro, elle, reste en SUCCÈS (le contrôle ne fait pas échouer le cycle)', { s: h.lastSuccessAt, e: h.lastError });
  arreterCloudSync();
  // autoRepair (déclenché par la divergence) fait un appel par table : laisser finir.
  await attendre(() => C.courant === 0, 5000); await dort(300);
  const reparations = appels('sync-repair').length;
  console.log(`   (info) appels sync-repair déclenchés par UNE divergence : ${reparations}`);

  reset(); C.verify = '500';
  scheduleCloudSync(80, { debounceMs: 40, surveillanceMs: 20, verifyEveryMs: 300 });
  await attendre(() => appels('sync-verify').length >= 1 && appels('sync-pull').length >= 5, 4000);
  ok(syncHealth().lastError == null && appels('sync-verify').length >= 1 && appels('sync-pull').length >= 5, 'sync-verify en erreur 500 → la synchro continue, sans erreur remontée', { verifs: appels('sync-verify').length });
  arreterCloudSync(); await dort(300);

  reset(); C.verify = 'hang';
  const t0 = Date.now();
  scheduleCloudSync(80, { debounceMs: 40, surveillanceMs: 20, verifyEveryMs: 60_000 });
  await attendre(() => appels('sync-verify').length >= 1, 1500);
  await dort(1100);
  ok(Date.now() - t0 < 4000 && syncHealth().lastError == null, 'sync-verify muet → abandonné au délai (400 ms ici), la synchro n\'échoue pas', syncHealth().lastError);
  arreterCloudSync(); await dort(500);
}

// ═════════ 7. LE CLOUD REFUSE UNE LIGNE ═════════
console.log('\n── 7. refus du Cloud');
{
  reset(); viderFile();
  C.refuses.add('refusee-1');
  ecrire('refusee-1', 'refusée par le cloud'); ecrire('voisine-1', 'voisine acceptée');
  const r1 = await syncOnce();
  ok(C.recu.has('voisine-1') && !C.recu.has('refusee-1'), 'la voisine passe dans le MÊME lot, la refusée non');
  ok(r1.pushed === 2, 'le cycle n\'échoue pas (le Cloud a répondu)', r1.pushed);
  let e = db.prepare("SELECT attempts a, last_error m FROM sync_outbox WHERE row_id='refusee-1'").get();
  ok(e?.a === 1 && /foreign key/.test(e?.m || ''), 'refusée : GARDÉE en file, tentative comptée, motif conservé', e);
  ok(!db.prepare("SELECT 1 x FROM sync_outbox WHERE row_id='voisine-1'").get(), 'la voisine est purgée de la file');
  await syncOnce(); await syncOnce();
  const qz = db.prepare("SELECT attempts a, last_error m FROM sync_outbox_quarantine WHERE row_id='refusee-1'").get();
  ok(!!qz && qz.a >= 3 && /foreign key/.test(qz.m), 'après N refus : quarantaine AVEC son motif', qz);
  ok(!db.prepare("SELECT 1 x FROM sync_outbox WHERE row_id='refusee-1'").get(), 'et la file redémarre');
  ok(present('refusee-1'), 'la ligne reste en base locale : rien n\'est perdu');
  // Une ligne REFUSÉE n'a pas d'ombre : le Cloud ne l'a pas accordée. L'ombre était posée à la
  // milliseconde de la mise en quarantaine — la base de la fusion par champ déclarait un accord faux.
  ok(!db.prepare("SELECT 1 x FROM sync_shadow WHERE row_id='refusee-1'").get(),
    'la ligne refusée / mise en quarantaine n\'a PAS d\'ombre (aucun accord n\'a eu lieu)');

  reset(); viderFile(); C.sansRejected = true;
  ecrire('ancien-1');
  await syncOnce();
  ok(!db.prepare("SELECT 1 x FROM sync_outbox WHERE row_id='ancien-1'").get(), 'Cloud non redéployé (sans champ `rejected`) → purge comme avant');
}


// ═════════ 8. CE QUE L'ÉCOLE DIT AU CLOUD (source du voyant en ligne) ═════════
console.log('\n── 8. état déclaré au Cloud');
{
  reset(); viderFile();
  ecrire('etat-1', 'TEST état');
  C.hangPush = true;                                        // la saisie reste EN FILE pendant ce cycle
  try { await borne(syncOnce()); } catch { /* attendu : la poussée expire */ }
  C.hangPush = false;
  const e = C.etats.at(-1);
  ok(e && typeof e === 'object', 'sync-pull reçoit un champ `etat`', e);
  ok(e?.pending === 1, 'il dit combien de lignes attendent (1)', e?.pending);
  ok(e?.quarantined >= 1, 'il dit combien le Cloud a refusées et mises de côté (section 7 en a laissé une)', e?.quarantined);
  ok(typeof e?.conflicts === 'number', 'il dit combien de désaccords attendent', e?.conflicts);
  ok(typeof e?.version === 'string' && e.version.length > 0 && e.version !== '?', 'il dit sa version', e?.version);
  ok(!/TEST|état/.test(JSON.stringify(e)), 'aucune donnée métier dans ce message (compteurs et message technique seulement)', JSON.stringify(e));
  ok(JSON.stringify(e).length < 600, 'et il reste court', JSON.stringify(e).length);
}

arreterCloudSync();
srv.close();
console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
process.exit(fail === 0 ? 0 : 1);
