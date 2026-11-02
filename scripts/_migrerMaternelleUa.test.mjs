// LE RATTACHEMENT DES OBSERVATIONS DE MATERNELLE AUX UA, SUR UNE VRAIE BASE
//
// Banc d'essai de `scripts/migrer-maternelle-ua.mjs`. Il monte une base SQLite
// temporaire portant les contraintes RÉELLES de `mat_observations` après la
// bascule (clé (élève, domaine, UA), `trimestre_id` NOT NULL), y pose les cinq
// situations que le responsable a demandé de couvrir le 2026-11-01 :
//
//     « notes en T1 seulement, T1 + T2, conflit sur UA2, période verrouillée,
//       note T3 présente »
//
// puis lance le script en vrai (processus séparé, comme à l'école) et vérifie :
//
//   • T1 → UA1 et T2 → UA2, et RIEN d'autre ne bouge ;
//   • le T3 n'est JAMAIS déplacé — aucune règle n'a été donnée pour lui ;
//   • un conflit sur l'UA cible n'écrase RIEN et ressort dans le rapport ;
//   • l'idempotence : deux exécutions donnent exactement le même résultat ;
//   • le retour arrière redonne l'état initial, à l'identique ;
//   • la cohérence : autant d'observations après qu'avant.
//
// LE VERROU DE PÉRIODE, et ce que ce banc ne peut pas prouver : les verrous
// vivent dans le `localStorage` du navigateur (src/lib/lockService.js), pas en
// base. Aucun script côté base ne peut les lire. Ce qui est donc vérifié ici,
// c'est la TRAÇABILITÉ qui en tient lieu : chaque ligne déplacée porte son
// ancienne période, la date et l'auteur du déplacement, et se défait.
//
// Lancer : node scripts/_migrerMaternelleUa.test.mjs
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`OK   ${label}`); pass++; }
  else { console.log(`KO   ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};
const titre = (t) => console.log(`\n-- ${t} --`);

const racine = mkdtempSync(join(tmpdir(), 'nc-mat-ua-'));
const BASE = join(racine, 'notescam.db');
const CSV  = join(racine, 'rapport.csv');
const SCRIPT = new URL('./migrer-maternelle-ua.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// ── La base d'essai : les contraintes du schéma réel, et rien de plus ───────
// `trimestre_id` NOT NULL avec sa FK, `ua` bornée 1-8, clé (élève, domaine, UA).
// Si une migration future change l'une des trois, ce banc tombe — c'est voulu.
const SCHEMA = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE schools  (id TEXT PRIMARY KEY, name TEXT NOT NULL, current_year TEXT);
  CREATE TABLE classes  (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id),
                         name TEXT NOT NULL, level TEXT, current_year TEXT);
  CREATE TABLE students (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id),
                         class_id TEXT NOT NULL REFERENCES classes(id), name TEXT NOT NULL);
  CREATE TABLE apc_trimestres (id TEXT PRIMARY KEY);
  CREATE TABLE mat_domaines   (id TEXT PRIMARY KEY, intitule TEXT);
  CREATE TABLE mat_observations (
    id            TEXT PRIMARY KEY,
    school_id     TEXT NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
    eleve_id      TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    domaine_id    TEXT NOT NULL REFERENCES mat_domaines(id),
    trimestre_id  TEXT NOT NULL REFERENCES apc_trimestres(id),
    ua            INTEGER CHECK (ua IS NULL OR ua BETWEEN 1 AND 8),
    niveau_acquis TEXT CHECK (niveau_acquis IS NULL OR niveau_acquis IN ('A','ECA','NA')),
    observation   TEXT,
    enseignant_id TEXT,
    date_saisie   TEXT,
    updated_at    TEXT,
    version       INTEGER NOT NULL DEFAULT 1,
    device_id     TEXT,
    ancienne_periode TEXT,
    ua_migre_le      TEXT,
    ua_migre_par     TEXT,
    CONSTRAINT mat_observations_uniq_ua UNIQUE (eleve_id, domaine_id, ua)
  );
`;

function monterBase() {
  if (existsSync(BASE)) rmSync(BASE);
  const db = new DatabaseSync(BASE);
  db.exec(SCHEMA);
  db.exec(`
    INSERT INTO apc_trimestres (id) VALUES ('t1'), ('t2'), ('t3');
    INSERT INTO mat_domaines (id, intitule) VALUES ('d1','Langage'), ('d2','Pré-numération');
    INSERT INTO schools (id, name, current_year) VALUES ('ec1','ÉCOLE D ESSAI','2026-2027');
    -- Une classe de maternelle de l'année en cours, une d'une AUTRE année (elle
    -- ne doit pas être touchée), et une classe de primaire (hors périmètre).
    INSERT INTO classes (id, school_id, name, level, current_year) VALUES
      ('cl1','ec1','NURSERY 1 A','Nursery 1','2026-2027'),
      ('cl2','ec1','NURSERY 2 B','Nursery 2','2025-2026'),
      ('cl3','ec1','CM2','CM2','2026-2027');
    INSERT INTO students (id, school_id, class_id, name) VALUES
      ('e1','ec1','cl1','ABDOU Fatima'),
      ('e2','ec1','cl1','BELLO Ahmed'),
      ('e3','ec1','cl1','CHEIK Oumar'),
      ('e4','ec1','cl2','ANCIENNE Annee'),
      ('e5','ec1','cl3','PRIMAIRE Eleve');
  `);
  const ins = (id, eleve, domaine, trim, ua, cote) => db.exec(
    `INSERT INTO mat_observations (id, school_id, eleve_id, domaine_id, trimestre_id, ua, niveau_acquis, observation, updated_at, version)
     VALUES ('${id}','ec1','${eleve}','${domaine}','${trim}',${ua === null ? 'NULL' : ua},'${cote}','obs ${id}','2026-10-20T10:00:00.000Z',1);`);

  // 1. T1 SEULEMENT (élève 1, domaine 2)                      → doit aller en UA1
  ins('o1', 'e1', 'd2', 't1', null, 'A');
  // 2. T1 + T2 (élève 1, domaine 1)                           → UA1 et UA2
  ins('o2', 'e1', 'd1', 't1', null, 'A');
  ins('o3', 'e1', 'd1', 't2', null, 'ECA');
  // 3. CONFLIT sur UA2 : l'élève 2 a DÉJÀ une observation en UA2 (saisie
  //    directement sur l'UA), et une ancienne en T2 qui voudrait y aller.
  ins('o4', 'e2', 'd1', 't2', 2, 'A');       // déjà rattachée — ne doit pas bouger
  ins('o5', 'e2', 'd1', 't2', null, 'NA');   // candidate → CONFLIT, rien n'est écrasé
  // 4. T3 PRÉSENT (élève 3)                                   → jamais déplacé
  ins('o6', 'e3', 'd1', 't3', null, 'A');
  // 5. Une autre ANNÉE scolaire                               → hors périmètre
  ins('o7', 'e4', 'd1', 't1', null, 'A');
  // 6. Un élève du PRIMAIRE                                   → hors périmètre
  ins('o8', 'e5', 'd1', 't1', null, 'A');
  db.close();
}

const lire = (sql) => {
  const db = new DatabaseSync(BASE, { readOnly: true });
  try { return db.prepare(sql).all(); } finally { db.close(); }
};
const etat = () => lire(`select id, trimestre_id, ua, niveau_acquis, ancienne_periode,
    ua_migre_par, version from mat_observations order by id`);
const total = () => lire('select count(*) c from mat_observations')[0].c;

const lancer = (...extra) => execFileSync(process.execPath,
  [SCRIPT, '--base', BASE, '--annee', '2026-2027', ...extra],
  { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

// ════════════════════════════════════════════════════════════════════════════
monterBase();
const initial = etat();
const totalInitial = total();

titre('AUDIT : aucune ecriture');
{
  const sortie = lancer('--audit');
  ok(/AUCUNE écriture/.test(sortie), 'le script dit qu il n ecrit rien');
  ok(JSON.stringify(etat()) === JSON.stringify(initial), 'la base est inchangee apres l audit');
  ok(/NURSERY 1 A/.test(sortie), 'l audit nomme la classe de maternelle concernee');
  ok(!/CM2/.test(sortie), 'et ne parle pas du primaire (hors perimetre)');
}

titre('DRY-RUN : le plan et le rapport CSV, toujours sans ecriture');
{
  const sortie = lancer('--dry-run', '--csv', CSV);
  ok(/à transférer\s+: 3\b/.test(sortie), 'trois lignes a transferer (o1, o2, o3)', sortie.match(/à transférer.*/)?.[0]);
  ok(/en CONFLIT\s+: 1\b/.test(sortie), 'un conflit (o5 vers UA2 deja prise)', sortie.match(/en CONFLIT.*/)?.[0]);
  ok(/laissées en place : 1\b/.test(sortie), 'une laissee en place (o6, en T3)', sortie.match(/laissées en place.*/)?.[0]);
  ok(JSON.stringify(etat()) === JSON.stringify(initial), 'la base est inchangee apres le dry-run');

  const csv = readFileSync(CSV, 'utf8');
  ok(csv.startsWith('﻿'), 'le CSV porte le BOM (Excel lit les accents)');
  ok((csv.match(/^TRANSFERT;/gm) || []).length === 3, 'le CSV liste 3 transferts');
  ok((csv.match(/^CONFLIT;/gm) || []).length === 1, 'le CSV liste 1 conflit');
  ok((csv.match(/^EN_ATTENTE_DECISION;/gm) || []).length === 1, 'le CSV liste 1 ligne en attente de decision');
}

titre('APPLICATION');
{
  const sortie = lancer('--appliquer', '--par', 'Responsable');
  const e = Object.fromEntries(etat().map((r) => [r.id, r]));

  ok(e.o1.ua === 1 && e.o1.trimestre_id === 't1', 'o1 : T1 seul → UA1', e.o1);
  ok(e.o2.ua === 1 && e.o3.ua === 2, 'o2/o3 : T1 → UA1 et T2 → UA2', [e.o2.ua, e.o3.ua]);
  // LE POINT QUI SURPREND, ET QUI EST VOULU : une observation saisie en T2
  // devient UA2, donc elle compte au TRIMESTRE 1 (UA1-3). Le responsable l'a
  // écrit noir sur blanc : « C'est voulu : ces notes sont bien des évaluations
  // d'UA2. »
  ok(e.o3.trimestre_id === 't1', 'o3 : saisie en T2, rattachee a UA2, donc au TRIMESTRE 1', e.o3.trimestre_id);
  ok(e.o1.ancienne_periode === 't1' && e.o3.ancienne_periode === 't2',
    'l ancienne periode est conservee sur chaque ligne', [e.o1.ancienne_periode, e.o3.ancienne_periode]);
  ok(e.o3.ua_migre_par === 'Responsable', 'le journal porte l auteur du deplacement', e.o3.ua_migre_par);
  ok(e.o1.version === 2, 'la version est incrementee (la synchro verra la ligne)', e.o1.version);

  ok(e.o5.ua === null && e.o5.niveau_acquis === 'NA', 'o5 (conflit) n a PAS ete deplacee', e.o5);
  ok(e.o4.ua === 2 && e.o4.niveau_acquis === 'A', 'o4 (deja en UA2) n a PAS ete ecrasee', e.o4);
  ok(e.o6.ua === null && e.o6.trimestre_id === 't3', 'o6 (T3) n a PAS ete deplacee', e.o6);
  ok(e.o7.ua === null, 'o7 (autre annee scolaire) n a PAS ete touchee', e.o7);
  ok(e.o8.ua === null, 'o8 (primaire) n a PAS ete touchee', e.o8);

  ok(total() === totalInitial, `coherence : ${totalInitial} observations avant et apres`, total());
  ok(/AUCUNE ligne perdue/.test(sortie), 'le script le verifie lui-meme, par une relecture');
}

titre('IDEMPOTENCE : rejouer ne deplace rien de plus');
{
  const avant = JSON.stringify(etat());
  const sortie = lancer('--appliquer', '--par', 'Responsable');
  ok(/Rien à transférer/.test(sortie), 'le second passage n a plus rien a transferer');
  ok(JSON.stringify(etat()) === avant, 'la base est identique au premier passage');
  ok(total() === totalInitial, 'toujours le meme nombre d observations', total());
}

titre('RETOUR ARRIERE : l etat initial, a l identique');
{
  const sansConfirmation = lancer('--retour-arriere');
  ok(/Ajoutez --confirmer/.test(sansConfirmation), 'le retour arriere demande une confirmation explicite');
  ok(/3 observation\(s\) déplacée\(s\)/.test(sansConfirmation), 'il annonce les 3 lignes concernees');

  lancer('--retour-arriere', '--confirmer');
  const apres = etat();
  const e = Object.fromEntries(apres.map((r) => [r.id, r]));
  const i = Object.fromEntries(initial.map((r) => [r.id, r]));
  for (const id of ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'o8']) {
    ok(e[id].trimestre_id === i[id].trimestre_id && e[id].ua === i[id].ua
       && e[id].niveau_acquis === i[id].niveau_acquis,
    `${id} : periode, UA et cote rendues a l identique`, [e[id].trimestre_id, e[id].ua]);
  }
  ok(apres.every((r) => r.ancienne_periode === null && r.ua_migre_par === null),
    'les colonnes d historique sont nettoyees');
  ok(total() === totalInitial, 'aucune observation perdue dans l aller-retour', total());
  // La version, elle, ne redescend PAS : elle sert à la synchronisation, qui
  // doit voir passer l'aller comme le retour.
  ok(e.o1.version > i.o1.version, 'la version a progresse (la synchro verra le retour arriere aussi)', e.o1.version);
}

titre('DEUXIEME ALLER : apres un retour arriere, la migration refonctionne');
{
  lancer('--appliquer', '--par', 'Responsable');
  const e = Object.fromEntries(etat().map((r) => [r.id, r]));
  ok(e.o1.ua === 1 && e.o3.ua === 2, 'o1 → UA1 et o3 → UA2 de nouveau', [e.o1.ua, e.o3.ua]);
  ok(total() === totalInitial, 'et toujours le meme nombre d observations', total());
}

rmSync(racine, { recursive: true, force: true });
console.log(`\n${fail === 0 ? `TOUS LES CONTROLES PASSENT (${pass})` : `${fail} ECHEC(S) sur ${pass + fail}`}`);
process.exit(fail === 0 ? 0 : 1);
