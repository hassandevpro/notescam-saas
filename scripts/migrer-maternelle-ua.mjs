// ════════════════════════════════════════════════════════════════════════════
// RATTACHEMENT DES OBSERVATIONS DE MATERNELLE AUX UNITÉS D'APPRENTISSAGE
// ════════════════════════════════════════════════════════════════════════════
//
// POURQUOI. L'écran de saisie de la maternelle ne proposait que « Trimestre 1 /
// 2 / 3 ». Les institutrices y ont donc coté ce qui était, en réalité, UA1 puis
// UA2. Consigne du responsable (2026-11-01) :
//
//     « Notes saisies en Trimestre 1 (maternelle, 2026-2027) → UA1.
//       Notes saisies en Trimestre 2 (maternelle, 2026-2027) → UA2.
//       Pour Trimestre 3 : je n'ai pas donné de règle. Compte d'abord s'il
//       existe des notes en Trimestre 3. S'il y en a, ne les transfère pas,
//       liste-les moi et attends ma décision. »
//
// Le TRIMESTRE 3 N'EST DONC JAMAIS DÉPLACÉ par ce script, quel que soit le mode.
// Il est compté, listé, et c'est tout. Rien à décommenter, rien à « forcer » :
// la règle manquante est une décision, pas un paramètre.
//
// ── CE QUE LE SCRIPT NE FAIT PAS ────────────────────────────────────────────
//   • il n'ÉCRASE jamais une observation déjà posée sur l'UA cible : la ligne
//     part dans le rapport de conflits et attend un arbitrage humain ;
//   • il ne SUPPRIME rien : l'ancienne période est conservée
//     (`ancienne_periode`), ce qui rend le geste réversible ;
//   • il ne touche à aucune observation déjà rattachée à une UA : le rejouer ne
//     crée ni doublon ni second déplacement (idempotence).
//
// ── OÙ L'EXÉCUTER — UNE SEULE SOURCE ───────────────────────────────────────
// LE CLOUD EXÉCUTE, LES SERVEURS LAN REÇOIVENT. `mat_observations` est une table
// synchronisée : la migration touche `updated_at`, donc `sync-pull` descend les
// lignes migrées à chaque école, à son prochain cycle — et au démarrage de son
// serveur. Lancer la migration sur chaque LAN produirait au contraire des
// décisions divergentes, puis des conflits de synchro.
//
// ⛔ ORDRE OBLIGATOIRE, et le troisième point n'est pas négociable :
//    1. `supabase_mat_observations_ua.sql` appliqué au Cloud ;
//    2. application Cloud déployée ;
//    3. les écoles concernées TOURNENT SUR UN PAQUET QUI PORTE LA COLONNE `ua` ;
//    4. ce script, en --appliquer.
//
// Pourquoi 3 : un serveur LAN resté en version antérieure ignore la colonne
// `ua` (son `rawUpsert` filtre sur ses propres colonnes) mais reçoit le
// `trimestre_id` recalculé. Deux observations du même domaine arriveraient alors
// sous le même trimestre et sa vieille contrainte d'unicité (élève, domaine,
// trimestre) REJETTERAIT la seconde. Sa base resterait en arrière, en silence.
//
// ── USAGE ──────────────────────────────────────────────────────────────────
//   node scripts/migrer-maternelle-ua.mjs --audit                     (défaut)
//   node scripts/migrer-maternelle-ua.mjs --dry-run [--csv rapport.csv]
//   node scripts/migrer-maternelle-ua.mjs --appliquer --par "Nom Prénom"
//   node scripts/migrer-maternelle-ua.mjs --retour-arriere
//
// Cible (par défaut le Cloud) :
//   --base <chemin/notescam.db>   une base LAN SQLite (copie de travail !)
//   --ecole "<nom ou id>"         restreint à une école
//   --annee 2026-2027             restreint à l'année scolaire (défaut)
//                                 — lue sur la CLASSE de l'élève, car
//                                 `mat_observations` ne porte aucune année
//
// Cloud : jeton d'administration dans l'environnement (jamais dans le dépôt) —
//   $env:SUPABASE_ACCESS_TOKEN="sbp_..." ; $env:SUPABASE_PROJECT_REF="..."
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from 'node:fs';

// ── Correspondance ANCIENNE PÉRIODE → UA, dictée par le responsable ─────────
// 't3' est ABSENT à dessein : aucune règle n'a été donnée pour le troisième
// trimestre. Une entrée de plus ici déplacerait des observations sans décision.
const PERIODE_VERS_UA = { t1: 1, t2: 2 };
const PERIODE_EN_ATTENTE = 't3';

const ANNEE_DEFAUT = '2026-2027';

// Niveaux de maternelle, reconnus comme le fait `core/engineResolver`
// (maternelleNiveauSlug) : PS/MS/GS, Nursery 1-3, Pre-Nursery, Crèche, KG…
// Écrit en SQL pour que le filtre s'applique du côté de la base, sur les deux
// moteurs. Volontairement LARGE : une classe de maternelle mal nommée doit
// apparaître dans l'audit, quitte à être écartée à la lecture.
const FILTRE_MATERNELLE = `(
     lower(coalesce(c.level, '') || ' ' || coalesce(c.name, '')) like '%nursery%'
  or lower(coalesce(c.level, '') || ' ' || coalesce(c.name, '')) like '%maternelle%'
  or lower(coalesce(c.level, '') || ' ' || coalesce(c.name, '')) like '%creche%'
  or lower(coalesce(c.level, '') || ' ' || coalesce(c.name, '')) like '%crèche%'
  or lower(coalesce(c.level, '') || ' ' || coalesce(c.name, '')) like '%kindergarten%'
  or lower(coalesce(c.level, '') || ' ' || coalesce(c.name, '')) like '%petite section%'
  or lower(coalesce(c.level, '') || ' ' || coalesce(c.name, '')) like '%moyenne section%'
  or lower(coalesce(c.level, '') || ' ' || coalesce(c.name, '')) like '%grande section%'
  or lower(coalesce(c.level, '') || ' ' || coalesce(c.name, '')) like '%prescolaire%'
  or lower(coalesce(c.level, '') || ' ' || coalesce(c.name, '')) = 'ps'
  or lower(coalesce(c.level, '') || ' ' || coalesce(c.name, '')) = 'ms'
  or lower(coalesce(c.level, '') || ' ' || coalesce(c.name, '')) = 'gs'
  or lower(coalesce(c.level, '')) in ('ps', 'ms', 'gs')
)`;

// ── Arguments ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const a = (nom, defaut = null) => {
  const i = args.indexOf(nom);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : defaut;
};
const drapeau = (nom) => args.includes(nom);

const MODE = drapeau('--appliquer') ? 'appliquer'
  : drapeau('--retour-arriere') ? 'retour-arriere'
  : drapeau('--dry-run') ? 'dry-run'
  : 'audit';
const BASE  = a('--base');
const ECOLE = a('--ecole');
const ANNEE = a('--annee', ANNEE_DEFAUT);
const CSV   = a('--csv');
const PAR   = a('--par', 'migration-ua');

// ── Accès aux deux bases, derrière UNE interface ────────────────────────────
// `lire(sql)` renvoie des lignes ; `ecrire(sqls)` exécute dans UNE transaction.
// Les deux moteurs parlent assez de SQL commun pour que les requêtes soient
// écrites une seule fois — le seul écart est le placeholder, qu'on n'utilise
// donc pas (les valeurs sont injectées par `litteral`, qui échappe).

const litteral = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

async function cibleSqlite(chemin) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(chemin);
  return {
    nom: `base LAN ${chemin}`,
    lire: (sql) => db.prepare(sql).all(),
    ecrire: (sqls) => {
      db.exec('BEGIN');
      try { for (const s of sqls) db.exec(s); db.exec('COMMIT'); }
      catch (e) { try { db.exec('ROLLBACK'); } catch { /* rien */ } throw e; }
    },
  };
}
async function cibleCloud() {
  try {
    for (const ligne of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const m = ligne.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch { /* tout doit alors venir de l'environnement */ }
  const REF = process.env.SUPABASE_PROJECT_REF;
  const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
  if (!TOKEN || !REF) {
    throw new Error('SUPABASE_ACCESS_TOKEN et SUPABASE_PROJECT_REF requis dans l\'environnement '
      + '(le jeton n\'est jamais écrit dans le dépôt). Ou visez une base LAN avec --base.');
  }
  const envoyer = async (query) => {
    const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const txt = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${txt.slice(0, 400)}`);
    try { return JSON.parse(txt); } catch { return []; }
  };
  return {
    nom: `Cloud ${REF}`,
    lire: (sql) => envoyer(sql),
    // UNE transaction : tout passe ou rien ne passe. L'API Management exécute le
    // bloc tel quel, BEGIN/COMMIT compris.
    ecrire: (sqls) => envoyer(['BEGIN;', ...sqls, 'COMMIT;'].join('\n')),
  };
}

// ── Les requêtes ────────────────────────────────────────────────────────────
const filtreEcole = ECOLE ? ` and (e.name = ${litteral(ECOLE)} or e.id::text = ${litteral(ECOLE)}) ` : ' ';
// `id::text` n'existe pas en SQLite : on l'écrit sans cast quand on vise un .db.
const filtreEcoleSqlite = ECOLE ? ` and (e.name = ${litteral(ECOLE)} or e.id = ${litteral(ECOLE)}) ` : ' ';
const filtreAnnee = ANNEE ? ` and coalesce(c.current_year, '') = ${litteral(ANNEE)} ` : ' ';

const DEPUIS = (sqlite) => `
  from mat_observations o
  join students s on s.id = o.eleve_id
  join classes  c on c.id = s.class_id
  join schools  e on e.id = o.school_id
 where ${FILTRE_MATERNELLE} ${sqlite ? filtreEcoleSqlite : filtreEcole} ${filtreAnnee}`;

// L'audit : l'état par école, classe et ancienne période, sans rien modifier.
const Q_AUDIT = (sqlite) => `
  select e.name as ecole, c.name as classe, c.current_year as annee,
         o.trimestre_id as ancienne_periode, o.ua as ua_actuelle,
         count(*) as observations,
         count(o.niveau_acquis) as avec_cote,
         count(distinct o.eleve_id) as eleves,
         count(distinct o.domaine_id) as domaines
  ${DEPUIS(sqlite)}
  group by 1, 2, 3, 4, 5
  order by 1, 2, 4, 5`;

// Les lignes CANDIDATES : pas encore rattachées, et dont l'ancienne période a
// une règle. `cible` est l'UA d'arrivée ; `conflit` dit si l'UA est déjà prise
// pour ce couple (élève, domaine) — auquel cas on ne touche à rien.
const Q_LIGNES = (sqlite) => `
  select o.id, e.name as ecole, c.name as classe, s.name as eleve, o.domaine_id,
         o.trimestre_id as ancienne_periode, o.niveau_acquis, o.observation,
         case o.trimestre_id ${Object.entries(PERIODE_VERS_UA)
    .map(([p, u]) => `when ${litteral(p)} then ${u}`).join(' ')} else null end as cible,
         (select count(*) from mat_observations x
           where x.eleve_id = o.eleve_id and x.domaine_id = o.domaine_id
             and x.ua = case o.trimestre_id ${Object.entries(PERIODE_VERS_UA)
    .map(([p, u]) => `when ${litteral(p)} then ${u}`).join(' ')} else null end) as conflit
  ${DEPUIS(sqlite)} and o.ua is null
  order by 1, 2, 3`;

const fmt = (rows) => {
  if (!Array.isArray(rows) || !rows.length) return '  (aucune ligne)';
  const cols = Object.keys(rows[0]);
  const l = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)));
  const ligne = (vals) => '  ' + vals.map((v, i) => String(v ?? '').padEnd(l[i])).join('  ');
  return [ligne(cols), '  ' + l.map((n) => '-'.repeat(n)).join('  '),
    ...rows.map((r) => ligne(cols.map((c) => r[c])))].join('\n');
};

const csvEchappe = (v) => {
  const s = String(v ?? '');
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// ── Programme ──────────────────────────────────────────────────────────────
async function principal() {
  const cible = BASE ? await cibleSqlite(BASE) : await cibleCloud();
  const sqlite = !!BASE;

  console.log('═══ RATTACHEMENT DES OBSERVATIONS DE MATERNELLE AUX UA ═══');
  console.log(`cible   : ${cible.nom}`);
  console.log(`mode    : ${MODE}`);
  console.log(`année   : ${ANNEE || '(toutes)'}${ECOLE ? `   école : ${ECOLE}` : ''}`);
  console.log(`règle   : ${Object.entries(PERIODE_VERS_UA).map(([p, u]) => `${p.toUpperCase()} → UA${u}`).join(' · ')}`
    + `   ·   ${PERIODE_EN_ATTENTE.toUpperCase()} → EN ATTENTE DE DÉCISION (jamais déplacé)`);
  console.log('');

  // 1) AUDIT — toujours affiché, dans tous les modes : on ne modifie pas une
  //    base sans avoir montré son état d'abord.
  const audit = await cible.lire(Q_AUDIT(sqlite));
  console.log('── ÉTAT ACTUEL (lecture seule) ──');
  console.log(fmt(audit));
  const total = audit.reduce((n, r) => n + Number(r.observations), 0);
  const dejaUa = audit.filter((r) => r.ua_actuelle !== null).reduce((n, r) => n + Number(r.observations), 0);
  const enT3 = audit.filter((r) => r.ancienne_periode === PERIODE_EN_ATTENTE && r.ua_actuelle === null)
    .reduce((n, r) => n + Number(r.observations), 0);
  console.log('');
  console.log(`total observations : ${total}   ·   déjà rattachées à une UA : ${dejaUa}`);

  if (MODE === 'retour-arriere') return retourArriere(cible, sqlite);

  // 2) LE PLAN — ce qui serait transféré, ce qui est en conflit, ce qui est
  //    ignoré. Les trois nombres doivent se retrouver dans le total.
  const lignes = await cible.lire(Q_LIGNES(sqlite));
  const aTransferer = lignes.filter((r) => r.cible !== null && Number(r.conflit) === 0);
  const conflits    = lignes.filter((r) => r.cible !== null && Number(r.conflit) > 0);
  const enAttente   = lignes.filter((r) => r.cible === null);

  console.log('');
  console.log('── PLAN ──');
  console.log(`à transférer      : ${aTransferer.length}`);
  console.log(`en CONFLIT        : ${conflits.length}  (UA cible déjà cotée — rien ne sera écrasé)`);
  console.log(`laissées en place : ${enAttente.length}  (dont ${enT3} en ${PERIODE_EN_ATTENTE.toUpperCase()}, sans règle)`);
  console.log(`contrôle          : ${aTransferer.length} + ${conflits.length} + ${enAttente.length} = `
    + `${aTransferer.length + conflits.length + enAttente.length} ligne(s) non rattachée(s)`);

  const parClasse = {};
  for (const r of aTransferer) {
    const k = `${r.ecole} · ${r.classe} · ${r.ancienne_periode.toUpperCase()} → UA${r.cible}`;
    parClasse[k] = (parClasse[k] || 0) + 1;
  }
  if (Object.keys(parClasse).length) {
    console.log('');
    console.log('── DÉTAIL PAR CLASSE ──');
    for (const [k, n] of Object.entries(parClasse).sort()) console.log(`  ${String(n).padStart(5)}  ${k}`);
  }

  if (conflits.length) {
    console.log('');
    console.log('── CONFLITS — À ARBITRER PAR LE RESPONSABLE, RIEN N\'EST ÉCRASÉ ──');
    console.log(fmt(conflits.slice(0, 40).map((r) => ({
      ecole: r.ecole, classe: r.classe, eleve: r.eleve, domaine: r.domaine_id,
      depuis: r.ancienne_periode, vers: `UA${r.cible}`, cote: r.niveau_acquis,
    }))));
    if (conflits.length > 40) console.log(`  … et ${conflits.length - 40} autre(s) — voir le CSV`);
  }

  if (enT3) {
    console.log('');
    console.log(`── ${PERIODE_EN_ATTENTE.toUpperCase()} : ${enT3} OBSERVATION(S) EN ATTENTE DE VOTRE DÉCISION ──`);
    console.log(fmt(enAttente.filter((r) => r.ancienne_periode === PERIODE_EN_ATTENTE).slice(0, 40)
      .map((r) => ({ ecole: r.ecole, classe: r.classe, eleve: r.eleve, domaine: r.domaine_id, cote: r.niveau_acquis }))));
  }

  // 3) CSV — le rapport demandé, lisible dans un tableur.
  if (CSV || MODE === 'dry-run') {
    const fichier = CSV || 'rapport-migration-maternelle-ua.csv';
    const entete = ['decision', 'ecole', 'classe', 'eleve', 'domaine_id', 'ancienne_periode',
      'ua_cible', 'cote', 'observation', 'observation_id'];
    const ligneCsv = (decision, r) => [decision, r.ecole, r.classe, r.eleve, r.domaine_id,
      r.ancienne_periode, r.cible ?? '', r.niveau_acquis ?? '', r.observation ?? '', r.id]
      .map(csvEchappe).join(';');
    const corps = [
      ...aTransferer.map((r) => ligneCsv('TRANSFERT', r)),
      ...conflits.map((r) => ligneCsv('CONFLIT', r)),
      ...enAttente.map((r) => ligneCsv(r.ancienne_periode === PERIODE_EN_ATTENTE ? 'EN_ATTENTE_DECISION' : 'IGNOREE', r)),
    ];
    // BOM : Excel lit l'UTF-8 sans lui comme du latin-1, et « élève » devient
    // « Ã©lÃ¨ve » sur le poste de l'école.
    writeFileSync(fichier, '﻿' + [entete.join(';'), ...corps].join('\r\n') + '\r\n', 'utf8');
    console.log('');
    console.log(`rapport écrit : ${fichier}  (${corps.length} ligne(s))`);
  }

  if (MODE !== 'appliquer') {
    console.log('');
    console.log(MODE === 'dry-run'
      ? 'DRY-RUN : AUCUNE écriture. Relancez avec --appliquer après validation.'
      : 'AUDIT : AUCUNE écriture. Ajoutez --dry-run pour le rapport CSV.');
    return;
  }

  // 4) APPLICATION — une transaction, idempotente, journalisée.
  if (!aTransferer.length) {
    console.log('');
    console.log('Rien à transférer : la migration est déjà faite, ou aucune ligne n\'est éligible.');
    return;
  }
  const maintenant = new Date().toISOString();
  // Une instruction par UA cible : `ancienne_periode` ne s'écrit QUE si elle est
  // vide (une ligne déjà migrée garde sa trace d'origine — c'est ce qui rend le
  // rejeu inoffensif). La clause `ua is null` fait le reste de l'idempotence.
  const sqls = [];
  for (const [periode, ua] of Object.entries(PERIODE_VERS_UA)) {
    const ids = aTransferer.filter((r) => r.ancienne_periode === periode).map((r) => litteral(r.id));
    if (!ids.length) continue;
    // Par paquets : une liste d'identifiants sans fin dépasse la taille de
    // requête acceptée, côté API comme côté SQLite.
    for (let i = 0; i < ids.length; i += 500) {
      const lot = ids.slice(i, i + 500).join(', ');
      sqls.push(`update mat_observations set
          ua = ${ua},
          trimestre_id = ${litteral(`t${ua <= 3 ? 1 : ua <= 6 ? 2 : 3}`)},
          ancienne_periode = coalesce(ancienne_periode, trimestre_id),
          ua_migre_le = ${litteral(maintenant)},
          ua_migre_par = ${litteral(PAR)},
          updated_at = ${litteral(maintenant)},
          version = coalesce(version, 1) + 1
        where id in (${lot}) and ua is null;`);
    }
  }
  console.log('');
  console.log(`── APPLICATION : ${aTransferer.length} observation(s), ${sqls.length} instruction(s), UNE transaction ──`);
  await cible.ecrire(sqls);

  // 5) CONTRÔLE APRÈS COUP, par une lecture indépendante — jamais sur la foi du
  //    retour de l'écriture.
  const apres = await cible.lire(Q_AUDIT(sqlite));
  console.log('');
  console.log('── ÉTAT APRÈS MIGRATION (relu de la base) ──');
  console.log(fmt(apres));
  const totalApres = apres.reduce((n, r) => n + Number(r.observations), 0);
  console.log('');
  console.log(`total avant : ${total}   ·   total après : ${totalApres}   ·   `
    + (total === totalApres ? 'AUCUNE ligne perdue ✅' : '⚠️ LE TOTAL A CHANGÉ — à examiner immédiatement'));
  console.log(`journal : ua_migre_le=${maintenant}  ua_migre_par=${PAR}`);
  console.log('');
  console.log('Les serveurs LAN recevront ces lignes au prochain pull (updated_at modifié).');
}

// ── Retour arrière ─────────────────────────────────────────────────────────
// Chaque observation retourne sur son `ancienne_periode`, et `ua` est vidée.
// Ne touche QUE les lignes que ce script a déplacées (`ua_migre_le` renseigné) :
// une observation saisie directement sur une UA n'a pas à revenir en arrière.
async function retourArriere(cible, sqlite) {
  const q = `select o.id, e.name as ecole, c.name as classe, o.ancienne_periode, o.ua
    ${DEPUIS(sqlite)} and o.ua_migre_le is not null and o.ancienne_periode is not null
    order by 1`;
  const lignes = await cible.lire(q);
  console.log('');
  console.log(`── RETOUR ARRIÈRE : ${lignes.length} observation(s) déplacée(s) par ce script ──`);
  if (!lignes.length) { console.log('Rien à défaire.'); return; }
  const parGroupe = {};
  for (const r of lignes) {
    const k = `${r.ecole} · ${r.classe} · UA${r.ua} → ${String(r.ancienne_periode).toUpperCase()}`;
    parGroupe[k] = (parGroupe[k] || 0) + 1;
  }
  for (const [k, n] of Object.entries(parGroupe).sort()) console.log(`  ${String(n).padStart(5)}  ${k}`);

  if (!drapeau('--confirmer')) {
    console.log('');
    console.log('Ajoutez --confirmer pour exécuter ce retour arrière. Rien n\'a été modifié.');
    return;
  }
  const maintenant = new Date().toISOString();
  const ids = lignes.map((r) => litteral(r.id));
  const sqls = [];
  for (let i = 0; i < ids.length; i += 500) {
    sqls.push(`update mat_observations set
        trimestre_id = ancienne_periode,
        ua = null,
        ancienne_periode = null,
        ua_migre_le = null,
        ua_migre_par = null,
        updated_at = ${litteral(maintenant)},
        version = coalesce(version, 1) + 1
      where id in (${ids.slice(i, i + 500).join(', ')}) and ua_migre_le is not null;`);
  }
  await cible.ecrire(sqls);
  const restant = await cible.lire(q);
  console.log('');
  console.log(`restant après retour arrière : ${restant.length} (attendu : 0)`);
}

principal().catch((e) => { console.error('ÉCHEC —', e.message); process.exit(1); });
