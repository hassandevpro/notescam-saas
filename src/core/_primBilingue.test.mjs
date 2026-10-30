// LA VARIANTE BILINGUE DU CARNET — deux blocs de programme, pas six familles.
//
// ── LE DOCUMENT DE RÉFÉRENCE ──────────────────────────────────────────────
// « Class 2/CP », THE GENIUS INTERNATIONAL SCHOOL, SEQUENCE 1, relevé le
// 2026-10-29. C'est le seul des sept bulletins photographiés qui ne range PAS
// ses compétences sous les six familles du MINEDUB : il les coupe en deux
// blocs, un par programme.
//
//     …lignes anglophones…      English   Total: 242   Average: 17.29/20
//     …lignes francophones…     French    Total: 260   Average: 18.57/20
//     Total                     502 / 560                        Grade: A
//
// 242 + 260 = 502 : le document se vérifie lui-même, et c'est ce qui rend ces
// tests possibles — on éprouve une lecture, on ne décrit pas une intention.
//
// ── CE QU'ILS GARDENT ─────────────────────────────────────────────────────
// 1. LE PROGRAMME NE SE LIT PAS SUR L'INTITULÉ. Les compétences nationales
//    sont traduites à l'affichage : sur un bulletin anglophone, les onze
//    s'écrivent en anglais. Le classement passe donc par la MATIÈRE qui a
//    réclamé la compétence — l'attribution que `refClassScope` fait déjà.
// 2. Une classe MONOLINGUE ne voit RIEN changer (`programmesDe` rend []).
//    C'est la non-régression qui compte : six des sept bulletins sont dans ce
//    cas, et une école qui n'a rien demandé ne doit rien subir.
// 3. Rien n'est rangé de force : « Chinois » n'est dans aucun tronc et va dans
//    « Autres matières », pas dans un programme choisi au hasard.
// 4. Les deux blocs + « Autres » redonnent le total général. Un parent qui
//    additionne doit retomber sur ses pieds.
//
// Lancer : node src/core/_primBilingue.test.mjs
import {
  programmesDe, programmesParCode, programmeDeMatiere, troncsDe,
  programmeLabel, ordonnerParProgramme,
} from './primProgramme.js';
import { agregerGroupe } from './primCompactRows.js';
import { primSubjectsNeedingOwnCompetence } from './refClassScope.js';

let failed = false;
const ok = (cond, msg, extra) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}${cond || extra === undefined ? '' : ` — ${JSON.stringify(extra)}`}`);
  if (!cond) failed = true;
};

// Les onze compétences nationales telles que la base les porte : intitulés
// FRANÇAIS, pas de `school_id`.
const NATIONALES = [
  { id: '1a', code: '1A', intitule: 'Communiquer en français' },
  { id: '1b', code: '1B', intitule: 'Communiquer en anglais' },
  { id: '1c', code: '1C', intitule: 'Pratiquer une langue nationale' },
  { id: '2a', code: '2A', intitule: 'Utiliser les notions de base en mathématiques' },
  { id: '2b', code: '2B', intitule: 'Utiliser les notions de base en sciences et technologie' },
  { id: '3a', code: '3A', intitule: 'Pratiquer les valeurs sociales' },
  { id: '3b', code: '3B', intitule: 'Pratiquer les valeurs citoyennes' },
  { id: '4a', code: '4A', intitule: "Démontrer l'autonomie, l'esprit d'initiative" },
  { id: '5a', code: '5A', intitule: 'Utiliser les concepts de base et les outils des TIC' },
  { id: '6a', code: '6A', intitule: 'Pratiquer les activités physiques et sportives' },
  { id: '6b', code: '6B', intitule: 'Pratiquer les activités artistiques' },
];

// Les deux troncs du primaire, tels que `classicSubjects` les rend. L'ORDRE
// compte : c'est lui qui décide quelle matière garde quelle compétence, et
// c'est l'ordre que pose la fusion bilingue (le côté de la classe d'abord).
const TRONC_FR = ['Français', 'Mathématiques', 'Anglais', 'Éveil scientifique / SVT',
  'Histoire-Géographie', 'Éducation Civique et Morale', 'TIC', 'Arts / Dessin', 'EPS'];
const TRONC_EN = ['English', 'Mathematics', 'Science', 'Social Studies', 'French',
  'Citizenship', 'Computer Studies', 'Arts', 'Physical Education'];

const CLASS2 = { level: 'CP', name: 'Class 2/CP', system: 'EN', cycle: 'primaire' };
const CE1 = { level: 'CE1', name: 'CE1', system: 'FR', cycle: 'primaire' };

const matieres = (noms) => noms.map((name, i) => ({ id: `s${i}`, name, position: i }));
const codeMaison = (n) => n.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
// Les compétences MAISON, telles que le rattrapage du produit les crée : elles
// PORTENT le nom de la matière, et n'ont pas de domaine.
const maisons = (noms) => noms.map((nom, i) => ({
  id: `m${i}`, code: codeMaison(nom), intitule: nom, school_id: 'ecole-1',
}));

const ligne = (code, intitule, achieved, possible) => ({
  code, intitule, achieved, possible, cote: null, parCritere: {},
});

// ════════════════════════════════════════════════════════════════════════════
// LES DEUX TRONCS OFFICIELS — RIEN D'ÉCRIT POUR L'OCCASION
// ════════════════════════════════════════════════════════════════════════════
{
  const t = troncsDe(CE1);
  ok(t.FR.includes('francais'), 'le tronc francophone porte « Français »');
  ok(t.EN.includes('english'), 'le tronc anglophone porte « English »');
  // LE PIÈGE DU BILINGUISME : « Anglais » est la matière du programme
  // FRANCOPHONE (son cours d'anglais), et « French » celle du programme
  // ANGLOPHONE. L'étiquette dit le programme, pas la langue du mot.
  ok(t.FR.includes('anglais'), '« Anglais » appartient au programme francophone');
  ok(t.EN.includes('french'), '« French » appartient au programme anglophone');
  const croises = t.FR.filter((n) => t.EN.includes(n));
  ok(croises.length === 0, 'aucun libellé ne tombe dans les deux troncs', croises);
  ok(troncsDe(null).FR.length === 0, 'sans classe, aucun tronc — pas une exception');
  ok(troncsDe({ ...CE1, system: 'ES' }).FR.length === 0,
    'système hispanophone : aucun tronc classique, donc aucun classement');
}

// ════════════════════════════════════════════════════════════════════════════
// LE PROGRAMME D'UNE MATIÈRE
// ════════════════════════════════════════════════════════════════════════════
{
  const t = troncsDe(CLASS2);
  const p = (s) => programmeDeMatiere(s, t);
  ok(p('Français') === 'FR' && p('English') === 'EN', 'les deux troncs se reconnaissent');
  ok(p('francais') === 'FR', "l'accent et la casse ne changent rien");
  // Les noms que les écoles écrivent vraiment sur leurs copies (relevés sur le
  // carnet de CLASS V : « English 2 », « Mathematics 2 », « Maths paper1 »).
  ok(p('English 2') === 'EN', '« English 2 » → programme anglophone');
  ok(p('Mathematics 2') === 'EN', '« Mathematics 2 » → programme anglophone');
  ok(p('Mathématiques CE1') === 'FR', '« Mathématiques CE1 » → programme francophone');
  // Le tronc francophone dit « Arts / Dessin », l'anglophone « Arts » : le
  // libellé LE PLUS LONG gagne, sinon la matière française basculerait.
  ok(p('Arts / Dessin') === 'FR', '« Arts / Dessin » reste francophone — le plus spécifique gagne');
  ok(p('Arts') === 'EN', '« Arts » seul est le libellé anglophone');
  // RIEN N'EST RANGÉ DE FORCE : sur un bulletin remis aux parents, une matière
  // attribuée au mauvais programme est un faux, pas une approximation.
  ok(p('Chinois') === null, '« Chinois » n’est dans aucun tronc');
  ok(p('Practical Work') === null, '« Practical Work » non plus');
  ok(p('Frenchify') === null, '« Frenchify » ne contient pas le MOT « French »');
  ok(p('') === null && p(null) === null, 'un nom vide ou absent ne classe rien');
}

// ════════════════════════════════════════════════════════════════════════════
// L'ATTRIBUTION : CELLE DU PRODUIT, RELUE — PAS UNE SECONDE RÈGLE
// ════════════════════════════════════════════════════════════════════════════
{
  const subs = matieres([...TRONC_FR, ...TRONC_EN, 'Chinois']);
  // Qui a besoin de sa propre compétence, d'après le produit lui-même ?
  const besoin = primSubjectsNeedingOwnCompetence(subs, NATIONALES).map((s) => s.name);
  const comps = [...NATIONALES, ...maisons(besoin)];
  const parCode = programmesParCode(subs, comps, troncsDe(CLASS2));

  // Le tronc francophone est posé EN PREMIER : ce sont donc ses matières qui
  // gardent les compétences nationales.
  ok(parCode.get('1A') === 'FR', '1A revient au francophone — « Français » l’a réclamée en premier');
  ok(parCode.get('2A') === 'FR', '2A aussi — « Mathématiques » avant « Mathematics »');
  ok(parCode.get('1B') === 'FR', '1B revient à « Anglais », matière du tronc FRANCOPHONE');

  // Et les matières anglophones, arrivées ensuite, ont leur compétence maison.
  ok(parCode.get(codeMaison('English')) === 'EN', '« English » a sa maison, côté anglophone');
  ok(parCode.get(codeMaison('Mathematics')) === 'EN', '« Mathematics » de même');
  ok(parCode.get(codeMaison('French')) === 'EN',
    '« French » est anglophone — c’est le cours de français du programme anglais');

  // « Chinois » n'est dans aucun tronc : sa maison existe, mais sans programme.
  ok(!parCode.has(codeMaison('Chinois')), '« Chinois » n’est attribué à aucun programme');

  // Une compétence nationale qu'AUCUNE matière ne réclame n'est pas attribuée.
  ok(!parCode.has('4A'),
    '4A, qu’aucune matière de la classe ne réclame, reste hors programme');
}

// ════════════════════════════════════════════════════════════════════════════
// LE PROGRAMME NE SE LIT PAS SUR L'INTITULÉ — CE QUE LE BANC A MONTRÉ
// ════════════════════════════════════════════════════════════════════════════
{
  // Sur un bulletin ANGLOPHONE, les onze nationales s'affichent en anglais :
  // « 1A | Communicate in French ». Une première version classait là-dessus et
  // ne produisait AUCUN bloc, parce que tout tombait du même côté. Ce test
  // garde la correction : les intitulés ci-dessous sont EN ANGLAIS, et 1A doit
  // pourtant revenir au programme francophone.
  const subs = matieres([...TRONC_FR, ...TRONC_EN]);
  const besoin = primSubjectsNeedingOwnCompetence(subs, NATIONALES).map((s) => s.name);
  const comps = [...NATIONALES, ...maisons(besoin)];
  const rows = [
    ligne('1A', 'Communicate in French', 39, 40),
    ligne('2A', 'Use basic notions in mathematics', 30, 30),
    ligne(codeMaison('English'), 'English', 19, 20),
    ligne(codeMaison('Mathematics'), 'Mathematics', 18, 20),
  ];
  const blocs = programmesDe(rows, {
    cls: CLASS2, sys: 'EN', classSubjects: subs, competences: comps,
  });
  ok(blocs.length === 2, 'deux blocs, malgré des intitulés tous anglais', blocs.map((b) => b.intitule));
  ok(blocs[0].programme === 'EN' && blocs[1].programme === 'FR',
    'classe anglophone : le bloc English vient en premier', blocs.map((b) => b.programme));
  ok(blocs[1].codes.join(' ') === '1A 2A',
    'les nationales, affichées en anglais, repartent bien côté francophone', blocs[1].codes);
}

// ════════════════════════════════════════════════════════════════════════════
// UNE CLASSE MONOLINGUE NE VOIT RIEN CHANGER — LA NON-RÉGRESSION
// ════════════════════════════════════════════════════════════════════════════
{
  const subs = matieres([...TRONC_FR, 'Chinois']);
  const comps = [...NATIONALES, ...maisons(['Éducation Civique et Morale', 'Chinois'])];
  const rows = [
    ligne('1A', 'Communiquer en français', 39, 40),
    ligne('2A', 'Utiliser les notions de base en mathématiques', 30, 30),
    ligne(codeMaison('Chinois'), 'Chinois', 13, 20),
  ];
  const blocs = programmesDe(rows, {
    cls: CE1, sys: 'FR', classSubjects: subs, competences: comps,
  });
  ok(blocs.length === 0,
    'une classe qui ne porte qu’UN tronc rend [] — le carnet garde ses six familles',
    blocs.map((b) => b.intitule));

  ok(programmesDe([], { cls: CE1, classSubjects: subs, competences: comps }).length === 0,
    'aucune ligne → aucun bloc');
  ok(programmesDe(null, { cls: CE1 }).length === 0,
    'des lignes absentes → aucun bloc, pas une exception');
  ok(programmesDe([ligne('1A', 'x', 1, 2)], {}).length === 0,
    'sans classe ni matières, aucun bloc — jamais une exception sur un bulletin');
}

// ════════════════════════════════════════════════════════════════════════════
// LE CARNET BILINGUE COMPLET — ET L'ADDITION QUE LE PARENT FAIT
// ════════════════════════════════════════════════════════════════════════════
{
  const subs = matieres([...TRONC_FR, ...TRONC_EN, 'Chinois']);
  const besoin = primSubjectsNeedingOwnCompetence(subs, NATIONALES).map((s) => s.name);
  const comps = [...NATIONALES, ...maisons(besoin)];
  const rows = [
    ligne('1A', 'Communicate in French', 39, 40),
    ligne('2A', 'Use basic notions in mathematics', 28, 30),
    ligne('4A', 'Demonstrate autonomy', 18, 20),            // réclamée par personne
    ligne(codeMaison('English'), 'English', 19, 20),
    ligne(codeMaison('Mathematics'), 'Mathematics', 17, 20),
    ligne(codeMaison('Chinois'), 'Chinois', 18, 20),        // dans aucun tronc
  ];
  const blocs = programmesDe(rows, {
    cls: CLASS2, sys: 'EN', classSubjects: subs, competences: comps,
  });

  ok(blocs.length === 3, 'deux programmes + « Autres matières »', blocs.map((b) => b.intitule));
  ok(blocs[0].intitule === 'English' && blocs[1].intitule === 'French',
    'les bandeaux portent les mots du carnet papier', [blocs[0].intitule, blocs[1].intitule]);
  ok(blocs[2].intitule === 'Other subjects', 'le troisième bloc dit ce qu’il est');

  ok(blocs[0].achieved === 36 && blocs[0].possible === 40,
    'le bloc anglophone additionne ses seules lignes', [blocs[0].achieved, blocs[0].possible]);
  ok(blocs[1].achieved === 67 && blocs[1].possible === 70,
    'le bloc francophone additionne les siennes', [blocs[1].achieved, blocs[1].possible]);
  ok(blocs[2].codes.join(' ') === `4A ${codeMaison('Chinois')}`,
    'le bloc résiduel réunit les deux cas : nationale non réclamée et matière hors tronc',
    blocs[2].codes);

  // ── L'ADDITION QUE LE PARENT FAIT ─────────────────────────────────────
  // C'est la raison d'être du troisième bloc : sans lui, ces lignes comptaient
  // dans le total général sans figurer nulle part.
  const sommeBlocs = blocs.reduce((a, b) => a + b.achieved, 0);
  const sommeLignes = rows.reduce((a, r) => a + r.achieved, 0);
  ok(sommeBlocs === sommeLignes,
    'les blocs additionnés redonnent le total général', [sommeBlocs, sommeLignes]);
  const possBlocs = blocs.reduce((a, b) => a + b.possible, 0);
  ok(possBlocs === rows.reduce((a, r) => a + r.possible, 0),
    'et les barèmes aussi — « 502 / 560 » se vérifie des deux côtés', possBlocs);

  // La MOYENNE du bloc est sur 20, comme « Average: 17.29/20 » du carnet.
  ok(blocs[0].moyenne === Math.round((36 / 40) * 20 * 100) / 100,
    'la moyenne d’un bloc est son total ramené sur 20', blocs[0].moyenne);
  // Et c'est EXACTEMENT le calcul d'une famille : le bandeau bilingue et le
  // bandeau officiel passent par la même fonction, donc ne peuvent diverger.
  const direct = agregerGroupe(rows.filter((r) => blocs[0].codes.includes(r.code)));
  ok(direct.achieved === blocs[0].achieved && direct.moyenne === blocs[0].moyenne,
    'un bloc de programme se calcule comme une famille — une seule arithmétique');

  // ── LE TRI : SANS LUI, LE BANDEAU SE POSE AU MAUVAIS ENDROIT ─────────
  const triees = ordonnerParProgramme(rows, blocs);
  ok(triees.map((r) => r.code).join(' ')
      === `${codeMaison('English')} ${codeMaison('Mathematics')} 1A 2A 4A ${codeMaison('Chinois')}`,
    'les lignes se regroupent par bloc, chaque bloc gardant son ordre interne',
    triees.map((r) => r.code));
  ok(triees.length === rows.length, 'aucune ligne perdue ni dupliquée par le tri');
  ok(rows[0].code === '1A', 'le tri ne modifie pas le tableau reçu');
  ok(ordonnerParProgramme(rows, []) === rows,
    'sans bloc, les lignes repartent INCHANGÉES — les six familles n’ont jamais eu besoin d’être contiguës');
}

// ════════════════════════════════════════════════════════════════════════════
// LA COTE DU BLOC — le barème de l'école, jamais un seuil inventé
// ════════════════════════════════════════════════════════════════════════════
{
  const BAREME = [
    { cote: 'A+', seuil_min: 90 }, { cote: 'A', seuil_min: 75 },
    { cote: 'ECA', seuil_min: 50 }, { cote: 'NA', seuil_min: 0 },
  ];
  const subs = matieres([...TRONC_FR, ...TRONC_EN]);
  const besoin = primSubjectsNeedingOwnCompetence(subs, NATIONALES).map((s) => s.name);
  const comps = [...NATIONALES, ...maisons(besoin)];
  const rows = [
    ligne('1A', 'Communicate in French', 30, 40),           // 75 % → A
    ligne(codeMaison('English'), 'English', 19, 20),        // 95 % → A+
  ];
  const sans = programmesDe(rows, { cls: CLASS2, sys: 'EN', classSubjects: subs, competences: comps });
  ok(sans[0].cote === null,
    'sans barème d’école, aucun bloc ne porte de cote — zéro régression', sans[0].cote);
  const avec = programmesDe(rows, {
    cls: CLASS2, sys: 'EN', classSubjects: subs, competences: comps, coteBareme: BAREME,
  });
  ok(avec[0].cote === 'A+' && avec[1].cote === 'A',
    'avec barème, chaque bloc porte la cote du carnet papier', avec.map((b) => b.cote));
}

// ════════════════════════════════════════════════════════════════════════════
// UNE COMPÉTENCE NON ÉVALUÉE N'ABÎME PAS LE TOTAL DU BLOC
// ════════════════════════════════════════════════════════════════════════════
{
  const subs = matieres([...TRONC_FR, ...TRONC_EN]);
  const besoin = primSubjectsNeedingOwnCompetence(subs, NATIONALES).map((s) => s.name);
  const comps = [...NATIONALES, ...maisons(besoin)];
  const rows = [
    ligne('1A', 'Communicate in French', 35, 40),
    ligne('2A', 'Use basic notions in mathematics', null, null),  // jamais évaluée
    ligne(codeMaison('English'), 'English', 0, 20),                // un ZÉRO réel
  ];
  const blocs = programmesDe(rows, { cls: CLASS2, sys: 'EN', classSubjects: subs, competences: comps });
  const fr = blocs.find((b) => b.programme === 'FR');
  const en = blocs.find((b) => b.programme === 'EN');
  ok(fr.achieved === 35 && fr.possible === 40,
    'une compétence non évaluée sort du numérateur ET du dénominateur',
    [fr.achieved, fr.possible]);
  ok(en.achieved === 0 && en.possible === 20,
    'un zéro réellement attribué compte — il n’est pas une absence', [en.achieved, en.possible]);
  ok(fr.codes.includes('2A'),
    'la compétence non évaluée garde sa place dans le bloc, avec sa ligne au bulletin');
}

// ════════════════════════════════════════════════════════════════════════════
// LES BANDEAUX SUIVENT LA LANGUE DU BULLETIN
// ════════════════════════════════════════════════════════════════════════════
{
  ok(programmeLabel('EN', 'EN') === 'English' && programmeLabel('FR', 'EN') === 'French',
    'carnet anglophone : « English » / « French », les mots de la photo');
  ok(programmeLabel('EN', 'FR') === 'Anglais' && programmeLabel('FR', 'FR') === 'Français',
    'carnet francophone : « Anglais » / « Français »');
  ok(programmeLabel('AUTRE', 'FR') === 'Autres matières', 'le bloc résiduel est nommé, pas laissé vide');
  ok(programmeLabel('XX', 'FR') === null, 'un programme inconnu ne fabrique pas de libellé');
}

// ════════════════════════════════════════════════════════════════════════════
// LE CÂBLAGE : LE GABARIT ET L'ÉCRAN FONT CE QU'ILS DISENT
// ════════════════════════════════════════════════════════════════════════════
{
  const { readFileSync } = await import('node:fs');
  const gabarit = readFileSync(new URL('../components/bulletins/BulletinPrimCompact.jsx', import.meta.url), 'utf8');
  ok(/programmes = \[\]/.test(gabarit), 'BulletinPrimCompact : la prop existe et vaut [] par défaut');
  ok(/const bilingue = programmes\.length > 0/.test(gabarit),
    'le gabarit bascule sur les blocs SEULEMENT s’il en reçoit');
  ok(/ordonnerParProgramme\(rows, programmes\)/.test(gabarit),
    'le gabarit trie les lignes avant de les dessiner');
  ok(/reperesDeGroupe\(base, groupes\)/.test(gabarit),
    'les repères portent sur les lignes TRIÉES, sinon le bandeau tombe ailleurs');
  ok(/!parEpreuve && lignes\.map/.test(gabarit),
    'la disposition par critères dessine elle aussi les lignes triées');

  const ecran = readFileSync(new URL('../pages/Bulletins.jsx', import.meta.url), 'utf8');
  ok(/programmesDe\(c\.rows, \{/.test(ecran), 'Bulletins.jsx : les blocs viennent du moteur');
  ok(/classSubjects, competences: primCompetencesEcole/.test(ecran),
    'Bulletins.jsx : le classement part des MATIÈRES et de la liste NON TRADUITE');
  ok(/programmes=\{programmes\}/.test(ecran), 'Bulletins.jsx : les blocs sont passés au gabarit');
}

console.log(failed ? '\n❌ ÉCHEC' : '\n✅ TOUT PASSE');
process.exit(failed ? 1 : 0);
