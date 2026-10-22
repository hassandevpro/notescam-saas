// POURQUOI UNE MATIÈRE APPARAÎT-ELLE DEUX FOIS DANS UNE CLASSE ?
//
// Audit LECTURE SEULE de la base Cloud, pour les 44 écoles d'un coup. Ce
// programme ne corrige rien : il relève les matières de classe en double, dit
// laquelle garder et pourquoi, et — sur demande — ÉCRIT le SQL de correction et
// son retour arrière dans `docs/corrections/`. L'application de ce SQL reste un
// acte humain, soumis à l'autorisation du responsable.
//
//   node scripts/audit-matieres-doublons.mjs              → rapport seul
//   node scripts/audit-matieres-doublons.mjs --sql        → rapport + SQL généré
//
// LE DÉFAUT D'ORIGINE, pour mémoire. L'auto-configuration d'une classe se
// gardait du doublon en regardant le cache du poste (`get().subjects`). Un poste
// qui n'avait pas encore descendu les matières — serveur LAN après remise à zéro
// du curseur, navigateur vidé, second appareil — voyait une classe vide, la
// reconfigurait, et tirait de NOUVEAUX identifiants. La base accueillait une
// seconde série complète. La parade est dans le produit depuis le 2026-10-21 :
// l'identifiant d'une matière de classe est dérivé de (classe, nom normalisé)
// — voir `src/store/schoolStore.js` et `src/core/_idMatiereDeterministe.test.mjs`.
// Ce script traite les doublons DÉJÀ posés, que la parade ne défait pas.
//
// ── LA RÈGLE DE CHOIX, ET SON ORDRE ────────────────────────────────────────
// On garde la ligne :
//   1. qui porte le PLUS de notes          — le travail saisi ne se déplace pas
//                                             s'il n'y est pas obligé ;
//   2. puis celle qui a un `position`      — l'école l'a rangée sur son bulletin ;
//   3. puis celle qui a une `category`     — elle a un groupe réglementaire ;
//   4. puis celle qui a un enseignant ;
//   5. puis la `version` la plus haute, la plus ANCIENNE création, et enfin le
//      plus petit identifiant — pour que deux exécutions donnent le même plan.
//
// Ce que la ligne gardée n'a pas (rangement, groupe, enseignant), elle le REPREND
// de la copie supprimée : sans cela, dédoublonner ferait perdre à l'école l'ordre
// qu'elle avait posé sur son bulletin.
//
// LE COEFFICIENT N'EST JAMAIS CHOISI À SA PLACE. Quand les deux copies n'ont pas
// le même coefficient, on ne peut pas savoir lequel l'école veut : le rapport le
// SIGNALE, le SQL garde celui de la ligne conservée, et c'est à l'école de
// trancher dans « Modifier la classe ». Décider ici reviendrait à changer une
// moyenne sans que personne l'ait demandé.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

try {
  for (const ligne of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = ligne.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { /* pas de .env.local : tout doit venir de l'environnement */ }

const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN || !REF) {
  console.error('SUPABASE_ACCESS_TOKEN ou SUPABASE_PROJECT_REF absent — rien n\'a été exécuté.');
  process.exit(1);
}

// Garde-fou : ce script ne peut rien modifier, même par accident. Toute requête
// qui n'est pas strictement une lecture est refusée AVANT l'appel réseau.
const INTERDIT = /\b(insert|update|delete|alter|drop|truncate|grant|revoke|create)\b/i;
async function sql(query) {
  if (INTERDIT.test(query)) throw new Error('GARDE-FOU : requête non strictement lecture, refusée.');
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const txt = await res.text();
  let body; try { body = JSON.parse(txt); } catch { body = txt; }
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${JSON.stringify(body).slice(0, 250)}`);
  return body;
}

// CE QUE LA LIGNE GARDÉE REPREND DE SA COPIE, quand elle ne l'a pas elle-même.
// Rien de plus : ni le coefficient (voir l'en-tête), ni le barème, ni le nom.
// `position` d'abord, parce que c'est l'ordre que l'école a posé à la main dans
// « Réorganiser les matières » et qu'un dédoublonnage ne doit pas le lui reprendre.
const REPRISES = ['position', 'category', 'teacher_id', 'sc_groupe', 'sc_groupe_ordre', 'short'];

// La clé de rapprochement : le nom, sans casse, sans accent, sans ponctuation.
// MÊME normalisation que `_normMatiere` côté produit — « SVT », « svt  » et
// « S.V.T » sont une seule matière.
const CLE = `lower(regexp_replace(translate(coalesce(s.name,''),
  'ÀÂÄÁÃàâäáãÇçÉÈÊËéèêëÎÏÍÌîïíìÔÖÓÒÕôöóòõÙÛÜÚùûüúÑñ',
  'AAAAAaaaaaCcEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNn'), '[^a-zA-Z0-9]', '', 'g'))`;

const REQUETE = `
with s as (select s.*, ${CLE} as cle,
                  (select count(*) from grades g where g.subject_id = s.id) as nb
             from subjects s),
grp as (select class_id, cle from s group by class_id, cle having count(*) > 1),
d as (select s.* from s join grp on grp.class_id = s.class_id and grp.cle = s.cle),
rang as (select d.*, row_number() over (
           partition by d.class_id, d.cle
           order by d.nb desc, (d.position is null), (d.category is null),
                    (d.teacher_id is null), d.version desc, d.created_at nulls last, d.id) as r
           from d)
select sc.name as ecole, c.name as classe, c.current_year as annee,
       r.cle, r.r, r.id, r.name, r.school_id, r.class_id, r.coef, r.max, r.max_grade,
       r.short, r.position, r.category, r.teacher_id, r.sc_groupe, r.sc_groupe_ordre,
       r.nb, (r.deleted_at is not null) as supprimee,
       r.created_at, r.updated_at, r.version, r.device_id,
       r.year, r.calc_method, r.formula, r.charge_horaire, r.parent_id,
       r.prim_competence_id, r.mat_domaine_id, r.bil_domaine, r.bil_domaine_ordre, r.bil_obligatoire,
       r.category_id, r.client_updated_at
  from rang r
  left join classes c on c.id = r.class_id
  left join schools sc on sc.id = r.school_id
 order by ecole, classe, r.cle, r.r`;

// Pour chaque copie à fusionner : ses notes, et si la ligne gardée porte déjà
// la même (même élève, même séquence, même année) avec la MÊME valeur.
const REQ_NOTES = (garde, copie) => `
select g.id, g.student_id, g.sequence, g.year, g.value, st.name as eleve,
       exists (select 1 from grades k where k.subject_id = '${garde}'
                 and k.student_id = g.student_id and k.sequence = g.sequence
                 and coalesce(k.year,'') = coalesce(g.year,'') and k.value = g.value) as identique,
       exists (select 1 from grades k where k.subject_id = '${garde}'
                 and k.student_id = g.student_id and k.sequence = g.sequence
                 and coalesce(k.year,'') = coalesce(g.year,'') and k.value <> g.value) as conflit
  from grades g left join students st on st.id = g.student_id
 where g.subject_id = '${copie}'
 order by st.name, g.sequence`;

// Corps dans une fonction : les deux sorties anticipees sont des `return`.
// `process.exit()` coupait le processus avec un socket encore ouvert, et Node
// sous Windows levait une assertion libuv APRES un rapport pourtant complet.
async function main() {
const lignes = await sql(REQUETE);
if (!lignes.length) {
  console.log('\n  Aucune matière de classe en double sur les écoles du Cloud.\n');
  return;
}

// Regroupement (classe, clé) → { garde, copies[] }
const groupes = new Map();
for (const l of lignes) {
  const k = `${l.class_id}|${l.cle}`;
  if (!groupes.has(k)) groupes.set(k, { ecole: l.ecole, classe: l.classe, annee: l.annee, cle: l.cle, garde: null, copies: [] });
  const g = groupes.get(k);
  if (Number(l.r) === 1) g.garde = l; else g.copies.push(l);
}

console.log('\n  NotesCam — matières de classe en double (LECTURE SEULE)\n');
console.log(`  Projet : ${REF}`);
console.log(`  ${groupes.size} couple(s) (classe, matière) en double, `
  + `${[...groupes.values()].reduce((a, g) => a + g.copies.length, 0)} ligne(s) en trop\n`);

const parEcole = new Map();
for (const g of groupes.values()) parEcole.set(g.ecole, (parEcole.get(g.ecole) || 0) + g.copies.length);
for (const [ecole, n] of [...parEcole].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)} ligne(s) en trop — ${ecole}`);
}

// Détail, écart de coefficient, et notes à traiter.
const coefsDivergents = [];
const notesParCopie = new Map();
let notesIdentiques = 0, notesADeplacer = 0, conflits = 0;

console.log('\n  ── Détail, et ce que la correction ferait ──\n');
for (const g of groupes.values()) {
  console.log(`  ${g.ecole} · ${g.classe} [${g.annee}] · « ${g.garde.name} »`);
  console.log(`     GARDÉE     ${g.garde.id}  coef ${g.garde.coef}  /${g.garde.max}`
    + `  rang ${g.garde.position ?? '—'}  groupe ${g.garde.category ?? '—'}  ${g.garde.nb} note(s)`);
  for (const c of g.copies) {
    const notes = Number(c.nb) ? await sql(REQ_NOTES(g.garde.id, c.id)) : [];
    notesParCopie.set(c.id, notes);
    const id = notes.filter((n) => n.identique).length;
    const cf = notes.filter((n) => n.conflit).length;
    const dep = notes.length - id - cf;
    notesIdentiques += id; notesADeplacer += dep; conflits += cf;
    console.log(`     fusionnée  ${c.id}  coef ${c.coef}  /${c.max}`
      + `  rang ${c.position ?? '—'}  groupe ${c.category ?? '—'}  ${c.nb} note(s)`
      + (notes.length ? `  → ${id} doublon(s) exact(s), ${dep} à déplacer, ${cf} en conflit` : ''));
    if (String(c.coef) !== String(g.garde.coef)) {
      coefsDivergents.push({ ecole: g.ecole, classe: g.classe, nom: g.garde.name, garde: g.garde.coef, copie: c.coef });
    }
    // Ce que la ligne gardée reprendra de la copie.
    const reprises = REPRISES.filter((f) => g.garde[f] == null && c[f] != null);
    if (reprises.length) console.log(`                 la gardée reprendra : ${reprises.join(', ')}`);
  }
  console.log('');
}

console.log(`  Notes : ${notesIdentiques} doublon(s) exact(s) à retirer, `
  + `${notesADeplacer} à déplacer vers la ligne gardée, ${conflits} en CONFLIT de valeur.`);
if (conflits) {
  console.log('  ⚠️  Un conflit de valeur ne se tranche pas tout seul : ces notes sont LAISSÉES');
  console.log('      en place par le SQL généré, et listées pour l\'école.');
}

if (coefsDivergents.length) {
  console.log(`\n  ⚠️  ${coefsDivergents.length} écart(s) de coefficient entre les deux copies.`);
  console.log('      Le SQL garde celui de la ligne conservée ; à vérifier avec l\'école :');
  for (const d of coefsDivergents) {
    console.log(`      ${d.ecole} · ${d.classe} · ${d.nom} : gardé ${d.garde}, écarté ${d.copie}`);
  }
}

if (!process.argv.includes('--sql')) {
  console.log('\n  Rapport seul. Ajoutez --sql pour écrire la correction et son retour arrière.\n');
  return;
}

// ── GÉNÉRATION DU SQL ──────────────────────────────────────────────────────
const JOUR = new Date().toISOString().slice(0, 10);
const DOSSIER = 'docs/corrections';
mkdirSync(DOSSIER, { recursive: true });
const base = `${DOSSIER}/${JOUR}-matieres-doublons`;

const q = (v) => (v == null ? 'NULL' : typeof v === 'number' ? String(v)
  : typeof v === 'boolean' ? (v ? 'true' : 'false')
    : `'${String(v).replace(/'/g, "''")}'`);

const COLONNES = ['id', 'school_id', 'class_id', 'name', 'short', 'coef', 'max_grade', 'year',
  'client_updated_at', 'max', 'teacher_id', 'category_id', 'position', 'updated_at', 'version',
  'device_id', 'parent_id', 'calc_method', 'formula', 'sc_groupe', 'sc_groupe_ordre',
  'charge_horaire', 'prim_competence_id', 'mat_domaine_id', 'created_at', 'bil_domaine',
  'bil_domaine_ordre', 'bil_obligatoire', 'category'];

const aSupprimer = [...groupes.values()].flatMap((g) => g.copies);

let corr = `-- CORRECTION — MATIÈRES DE CLASSE EN DOUBLE
-- Généré le ${JOUR} par scripts/audit-matieres-doublons.mjs, sur le projet ${REF}.
--
-- ⚠️  INSTANTANÉ. Ce fichier NOMME des identifiants relevés à la génération. Si
--     la base a changé depuis, relancez le script avant d'appliquer : le compte
--     attendu ci-dessous refusera le lot plutôt que d'agir à l'aveugle.
--
-- CE QUE CE SQL FAIT, dans cet ordre :
--   1. il vérifie qu'il retrouve bien les ${aSupprimer.length} lignes attendues ;
--   2. la ligne gardée reprend de sa copie ce qu'elle n'a pas (rangement sur le
--      bulletin, groupe réglementaire, enseignant) ;
--   3. les notes strictement identiques portées par la copie sont retirées
--      (même élève, même séquence, même année, MÊME valeur) ;
--   4. les notes restantes sont rattachées à la ligne gardée — aucune n'est
--      perdue ;
--   5. les copies sont supprimées. La suppression écrit un \`sync_tombstones\`
--      (trigger \`trg_tomb_subjects\`), donc les serveurs LAN des écoles
--      retireront la ligne à leur prochain cycle de synchronisation. SANS cette
--      propagation, l'école garderait son doublon et le repousserait au Cloud.
--
-- CE QUE CE SQL NE FAIT PAS : il ne touche à AUCUN coefficient, à aucun barème,
-- à aucune note dont la valeur diffère entre les deux copies. Ces écarts sont
-- listés dans le rapport et reviennent à l'école.
--
-- RETOUR ARRIÈRE : ${base.split('/').pop()}-RETOUR-ARRIERE.sql (lignes et notes
-- réinsérées telles quelles, tombstones retirés, reprises défaites).

BEGIN;

-- 1) Compte attendu. Si la base a bougé, on s'arrête ici.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.subjects WHERE id IN (${aSupprimer.map((c) => q(c.id)).join(', ')});
  IF n <> ${aSupprimer.length} THEN
    RAISE EXCEPTION 'Attendu ${aSupprimer.length} copie(s) à fusionner, trouvé % — relancez audit-matieres-doublons.mjs', n;
  END IF;
END $$;

`;

let retour = `-- RETOUR ARRIÈRE — MATIÈRES DE CLASSE EN DOUBLE
-- Défait, ligne pour ligne, ${base.split('/').pop()}.sql (généré le ${JOUR}).
--
-- Remet les ${aSupprimer.length} copies supprimées avec TOUTES leurs colonnes, réinsère les
-- notes retirées, défait les reprises posées sur les lignes gardées, et retire
-- les tombstones — sans quoi la synchronisation supprimerait à nouveau les
-- lignes à peine rétablies.
--
-- À n'exécuter que si l'on renonce à la correction.

BEGIN;

`;

for (const g of groupes.values()) {
  corr += `-- ── ${g.ecole} · ${g.classe} [${g.annee}] · « ${g.garde.name} » ──\n`;
  retour += `-- ── ${g.ecole} · ${g.classe} · « ${g.garde.name} » ──\n`;

  for (const c of g.copies) {
    // 2) Reprises : ce que la gardée n'a pas et que la copie porte.
    const reprises = REPRISES.filter((f) => g.garde[f] == null && c[f] != null);
    if (reprises.length) {
      corr += `UPDATE public.subjects SET ${reprises.map((f) => `${f} = ${q(c[f])}`).join(', ')}\n`
        + `  WHERE id = ${q(g.garde.id)};\n`;
      retour += `UPDATE public.subjects SET ${reprises.map((f) => `${f} = NULL`).join(', ')}\n`
        + `  WHERE id = ${q(g.garde.id)};\n`;
    }

    const notes = notesParCopie.get(c.id) || [];
    const identiques = notes.filter((n) => n.identique);
    const aDeplacer = notes.filter((n) => !n.identique && !n.conflit);
    const enConflit = notes.filter((n) => n.conflit);

    // 3) Doublons exacts de notes : retirés.
    if (identiques.length) {
      corr += `-- ${identiques.length} note(s) strictement identique(s) à celles de la ligne gardée\n`
        + `DELETE FROM public.grades WHERE id IN (${identiques.map((n) => q(n.id)).join(', ')});\n`;
      for (const n of identiques) {
        retour += `INSERT INTO public.grades (id, school_id, class_id, student_id, subject_id, sequence, value, year)\n`
          + `  VALUES (${q(n.id)}, ${q(c.school_id)}, ${q(c.class_id)}, ${q(n.student_id)}, ${q(c.id)}, `
          + `${q(n.sequence)}, ${q(n.value)}, ${q(n.year)}) ON CONFLICT (id) DO NOTHING;\n`;
      }
    }

    // 4) Notes restantes : rattachées à la ligne gardée.
    if (aDeplacer.length) {
      corr += `-- ${aDeplacer.length} note(s) rattachée(s) à la ligne gardée\n`
        + `UPDATE public.grades SET subject_id = ${q(g.garde.id)}\n`
        + `  WHERE id IN (${aDeplacer.map((n) => q(n.id)).join(', ')});\n`;
      retour += `UPDATE public.grades SET subject_id = ${q(c.id)}\n`
        + `  WHERE id IN (${aDeplacer.map((n) => q(n.id)).join(', ')});\n`;
    }

    if (enConflit.length) {
      corr += `-- ⚠️  ${enConflit.length} note(s) LAISSÉE(S) EN PLACE : valeur différente de celle de la\n`
        + `--     ligne gardée. À trancher avec l'école, pas ici. Elles disparaîtraient\n`
        + `--     avec la copie (grades.subject_id est ON DELETE CASCADE), donc la\n`
        + `--     suppression de cette copie est REPORTÉE.\n`;
      for (const n of enConflit) {
        corr += `--     ${n.eleve || n.student_id} séquence ${n.sequence} : ${n.value}\n`;
      }
      continue;   // on ne supprime pas une copie qui porte une note non tranchée
    }

    // 5) La copie s'en va. Le trigger écrit le tombstone qui propagera aux LAN.
    corr += `DELETE FROM public.subjects WHERE id = ${q(c.id)};\n\n`;

    retour += `INSERT INTO public.subjects (${COLONNES.join(', ')})\n  VALUES (`
      + COLONNES.map((f) => q(c[f])).join(', ') + `)\n  ON CONFLICT (id) DO NOTHING;\n`;
    retour += `DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = ${q(c.id)};\n\n`;
  }
}

corr += `-- 6) Contrôle : plus aucun couple (classe, nom normalisé) en double.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT s.class_id, ${CLE} AS cle FROM public.subjects s
     GROUP BY s.class_id, ${CLE} HAVING count(*) > 1) t;
  RAISE NOTICE 'Couples (classe, matière) encore en double : %', n;
END $$;

COMMIT;
`;
retour += `COMMIT;\n`;

writeFileSync(`${base}.sql`, corr, 'utf8');
writeFileSync(`${base}-RETOUR-ARRIERE.sql`, retour, 'utf8');
writeFileSync(`${base}.etat-avant.json`, JSON.stringify({
  genere_le: new Date().toISOString(), projet: REF,
  couples: groupes.size, lignes_en_trop: aSupprimer.length,
  notes: { doublons_exacts: notesIdentiques, a_deplacer: notesADeplacer, en_conflit: conflits },
  coefficients_divergents: coefsDivergents,
  groupes: [...groupes.values()].map((g) => ({
    ecole: g.ecole, classe: g.classe, annee: g.annee, matiere: g.garde.name,
    gardee: g.garde, copies: g.copies,
    notes: g.copies.map((c) => ({ copie: c.id, lignes: notesParCopie.get(c.id) || [] })),
  })),
}, null, 2), 'utf8');

console.log(`\n  Écrit :\n    ${base}.sql\n    ${base}-RETOUR-ARRIERE.sql\n    ${base}.etat-avant.json`);
console.log('\n  RIEN n\'a été appliqué. L\'application reste un acte humain, autorisé explicitement.\n');
}

await main();
