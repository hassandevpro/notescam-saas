// LE MATRICULE AUTOMATIQUE PEUT-IL RENDRE DEUX FOIS LE MÊME NUMÉRO ?
//
// C'est la seule question qui compte vraiment. Un matricule en double, dans une
// école, ce n'est pas un défaut d'affichage : deux enfants partagent un dossier,
// les frais de l'un se règlent sur le compte de l'autre, et le bulletin part au
// mauvais parent. Les tests ci-dessous attaquent donc surtout l'unicité, dans
// les situations où elle se perd :
//
//   • la plage contient un numéro saisi À LA MAIN (max + 1 est déjà pris) ;
//   • la casse diffère (« p250001 » en base, « P250001 » proposé) ;
//   • l'import attribue plusieurs numéros AVANT d'avoir rien enregistré ;
//   • une année scolaire absente ou illisible (ne rien rendre plutôt qu'un
//     numéro portant une fausse année, qui suivrait l'élève sur son certificat).
//
// Et le périmètre : seules maternelle et primaire sont concernées. Le secondaire
// arrive avec un matricule d'examen ou celui de son ancien établissement ; le
// réécrire romprait le lien avec son dossier.
import {
  sectionAutoMatricule, classeAutoMatricule, anneeCourte, matriculePrefixe,
  derniereSequence, prochainMatricule, prochainMatriculePourClasse,
  attribuerMatriculesImport, planRattrapageMatricules,
} from './matriculeAuto.js';

let echecs = 0;
const ok = (cond, libelle, obtenu) => {
  if (cond) console.log(`OK   ${libelle}`);
  else { console.log(`KO   ${libelle} (obtenu: ${JSON.stringify(obtenu)})`); echecs++; }
};
const titre = (s) => console.log(`\n-- ${s} --`);

const AN = '2025-2026';
// `classSectionKey` deduit la section du NIVEAU et du NOM de la classe.
const MAT = { id: 'c-mat', name: 'Petite Section A', level: 'PS' };
const PRIM = { id: 'c-prim', name: 'CM2 A', level: 'CM2' };
const SEC = { id: 'c-sec', name: '6e A', level: '6e' };

// ── Périmètre ──────────────────────────────────────────────────────────────
titre('Perimetre : maternelle et primaire seulement');
ok(sectionAutoMatricule('maternelle') === 'M', 'maternelle -> lettre M', sectionAutoMatricule('maternelle'));
ok(sectionAutoMatricule('primaire') === 'P',   'primaire -> lettre P', sectionAutoMatricule('primaire'));
ok(sectionAutoMatricule('premier_cycle') === null, 'premier cycle -> aucune lettre', sectionAutoMatricule('premier_cycle'));
ok(sectionAutoMatricule('second_cycle') === null,  'second cycle -> aucune lettre', sectionAutoMatricule('second_cycle'));
ok(sectionAutoMatricule('autre') === null,         'section inconnue -> aucune lettre', sectionAutoMatricule('autre'));

ok(classeAutoMatricule(MAT) === true,  'classe de maternelle est concernee', classeAutoMatricule(MAT));
ok(classeAutoMatricule(PRIM) === true, 'classe de primaire est concernee', classeAutoMatricule(PRIM));
ok(classeAutoMatricule(SEC) === false, 'classe de 6e n est PAS concernee', classeAutoMatricule(SEC));
ok(prochainMatriculePourClasse([], SEC, AN) === null,
  'une classe de secondaire ne recoit aucun matricule automatique', prochainMatriculePourClasse([], SEC, AN));

// ── Format et année ────────────────────────────────────────────────────────
titre('Format et annee');
ok(anneeCourte('2025-2026') === '25', '« 2025-2026 » -> 25', anneeCourte('2025-2026'));
ok(anneeCourte('2025/2026') === '25', 'separateur different accepte', anneeCourte('2025/2026'));
ok(anneeCourte('2026') === '26',      'une seule annee acceptee', anneeCourte('2026'));
ok(anneeCourte('') === null,          'annee vide -> null', anneeCourte(''));
ok(anneeCourte(null) === null,        'annee absente -> null', anneeCourte(null));
ok(anneeCourte('rentree') === null,   'annee illisible -> null', anneeCourte('rentree'));

ok(matriculePrefixe('primaire', AN) === 'P25', 'prefixe primaire', matriculePrefixe('primaire', AN));
ok(matriculePrefixe('maternelle', AN) === 'M25', 'prefixe maternelle', matriculePrefixe('maternelle', AN));
ok(matriculePrefixe('primaire', null) === null,
  'sans annee exploitable, AUCUN prefixe (jamais une fausse annee dans le numero)', matriculePrefixe('primaire', null));
ok(prochainMatricule([], { section: 'primaire', annee: '' }) === null,
  'sans annee, aucun matricule propose', prochainMatricule([], { section: 'primaire', annee: '' }));

// ── Premier élève, puis suite ─────────────────────────────────────────────
titre('Numerotation');
ok(prochainMatricule([], { section: 'primaire', annee: AN }) === 'P250001',
  'ecole vide -> P250001', prochainMatricule([], { section: 'primaire', annee: AN }));
ok(prochainMatricule([], { section: 'maternelle', annee: AN }) === 'M250001',
  'ecole vide -> M250001', prochainMatricule([], { section: 'maternelle', annee: AN }));

const troisPrim = [{ matricule: 'P250001' }, { matricule: 'P250002' }, { matricule: 'P250003' }];
ok(prochainMatricule(troisPrim, { section: 'primaire', annee: AN }) === 'P250004',
  'trois primaires -> P250004', prochainMatricule(troisPrim, { section: 'primaire', annee: AN }));

// Les deux compteurs sont INDEPENDANTS : la maternelle ne continue pas la
// numerotation du primaire.
ok(prochainMatricule(troisPrim, { section: 'maternelle', annee: AN }) === 'M250001',
  'le compteur maternelle ignore les matricules du primaire', prochainMatricule(troisPrim, { section: 'maternelle', annee: AN }));

// Nouvelle rentree : le compteur repart a 1, le prefixe separe les promotions.
ok(prochainMatricule(troisPrim, { section: 'primaire', annee: '2026-2027' }) === 'P260001',
  'nouvelle annee -> la sequence repart a 1', prochainMatricule(troisPrim, { section: 'primaire', annee: '2026-2027' }));

// Au-dela de 9999, on ALLONGE le numero plutot que de le reutiliser.
ok(prochainMatricule([{ matricule: 'P259999' }], { section: 'primaire', annee: AN }) === 'P2510000',
  'au-dela de 9999 le numero s allonge, il n est jamais reutilise', prochainMatricule([{ matricule: 'P259999' }], { section: 'primaire', annee: AN }));

// ── Les anciens numéros manuels sont respectés ────────────────────────────
titre('Cohabitation avec les anciens numeros');
const manuels = [{ matricule: '2025/014' }, { matricule: 'YDE250086' }, { matricule: '' }, { matricule: null }];
ok(derniereSequence(manuels, 'P25') === 0,
  'des numeros hors format ne font pas avancer le compteur', derniereSequence(manuels, 'P25'));
ok(prochainMatricule(manuels, { section: 'primaire', annee: AN }) === 'P250001',
  'la numerotation automatique demarre a cote, sans renommer l existant', prochainMatricule(manuels, { section: 'primaire', annee: AN }));

// ── UNICITÉ : les cas qui la cassaient ───────────────────────────────────
titre('Unicite');
// Un numero de la plage a ete saisi A LA MAIN : max + 1 est deja pris.
const trou = [{ matricule: 'P250001' }, { matricule: 'P250003' }, { matricule: 'P250002' }];
ok(prochainMatricule(trou, { section: 'primaire', annee: AN }) === 'P250004',
  'sequence pleine -> le suivant libre', prochainMatricule(trou, { section: 'primaire', annee: AN }));

// Le cas vicieux : le plus grand est P250002, mais P250003 existe aussi en
// dehors de la sequence contigue. On ne doit JAMAIS rendre un numero occupe.
const occupe = [{ matricule: 'P250005' }, { matricule: 'P250006' }];
const prop = prochainMatricule(occupe, { section: 'primaire', annee: AN });
ok(prop === 'P250007', 'on repart du PLUS GRAND, pas du compte d eleves', prop);
ok(!occupe.some((s) => s.matricule === prop), 'le numero propose n est pas deja pris', prop);

// Casse differente en base : « p250001 » occupe bien « P250001 ».
const casse = [{ matricule: 'p250001' }, { matricule: 'P250002' }];
ok(prochainMatricule(casse, { section: 'primaire', annee: AN }) === 'P250003',
  'la comparaison ignore la casse (p250001 == P250001)', prochainMatricule(casse, { section: 'primaire', annee: AN }));

// Espaces autour du matricule en base.
ok(prochainMatricule([{ matricule: '  P250001  ' }], { section: 'primaire', annee: AN }) === 'P250002',
  'les espaces autour du matricule n ouvrent pas un doublon', prochainMatricule([{ matricule: '  P250001  ' }], { section: 'primaire', annee: AN }));

// Reserves : numeros attribues dans le lot en cours, pas encore enregistres.
const res = new Set(['P250002', 'P250003']);
ok(prochainMatricule([{ matricule: 'P250001' }], { section: 'primaire', annee: AN, reserves: res }) === 'P250004',
  'les numeros reserves dans le lot sont consideres comme pris',
  prochainMatricule([{ matricule: 'P250001' }], { section: 'primaire', annee: AN, reserves: res }));

// ── Import d'une liste ───────────────────────────────────────────────────
titre('Import d une liste');
const classes = [MAT, PRIM, SEC];
const lignes = [
  { name: 'ABEGA A', class_id: 'c-prim', matricule: '' },
  { name: 'BELLA B', class_id: 'c-prim', matricule: '' },
  { name: 'CECE C',  class_id: 'c-mat',  matricule: '' },
  { name: 'DIDI D',  class_id: 'c-prim', matricule: 'DEJA-001' },  // deja numerote
  { name: 'EKO E',   class_id: 'c-sec',  matricule: '' },           // secondaire
  { name: 'FOFO F',  class_id: null,     matricule: '' },           // sans classe
];
const { rows, attribues } = attribuerMatriculesImport(lignes, { students: [], classes, annee: AN });
ok(attribues === 3, 'trois lignes numerotees sur six', attribues);
ok(rows[0].matricule === 'P250001', 'premier primaire du lot', rows[0].matricule);
ok(rows[1].matricule === 'P250002', 'deuxieme primaire du lot (pas le meme)', rows[1].matricule);
ok(rows[2].matricule === 'M250001', 'maternelle du lot, compteur distinct', rows[2].matricule);
ok(rows[3].matricule === 'DEJA-001', 'une ligne deja numerotee n est PAS touchee', rows[3].matricule);
ok(rows[4].matricule === '', 'le secondaire ne recoit rien', rows[4].matricule);
ok(rows[5].matricule === '', 'une ligne sans classe ne recoit rien (section inconnue)', rows[5].matricule);

// Tous les numeros attribues dans le lot sont DISTINCTS — la propriete qui
// compte, verifiee sur un lot assez grand pour que l'erreur sorte.
const gros = Array.from({ length: 250 }, (_, i) => ({ name: `E${i}`, class_id: 'c-prim', matricule: '' }));
const r2 = attribuerMatriculesImport(gros, { students: [{ matricule: 'P250007' }], classes, annee: AN });
const vus = r2.rows.map((r) => r.matricule);
ok(new Set(vus).size === 250, '250 lignes -> 250 matricules DISTINCTS', new Set(vus).size);
ok(!vus.includes('P250007'), 'le lot n ecrase pas un matricule deja en base', vus.includes('P250007'));
ok(vus.every((m) => /^P25\d{4,}$/.test(m)), 'tous au format attendu', vus.slice(0, 3));

// Un import rejoue (les eleves sont maintenant en base) ne doit pas reattribuer
// les memes numeros a de nouveaux eleves.
const enBase = r2.rows.map((r) => ({ matricule: r.matricule }));
const suite = attribuerMatriculesImport(
  [{ name: 'NOUVEAU', class_id: 'c-prim', matricule: '' }],
  { students: enBase, classes, annee: AN },
);
ok(!vus.includes(suite.rows[0].matricule),
  'apres enregistrement, le lot suivant continue au-dela', suite.rows[0].matricule);

// ── 8. RATTRAPAGE de l'effectif deja inscrit ──────────────────────────────
// Le remplissage automatique ne joue qu'a l'inscription et a l'import : a
// l'installation, les eleves DEJA inscrits restent sans numero. C'est le lot que
// cette fonction propose, et la propriete qui compte reste l'unicite.
titre('Rattrapage de l effectif existant');
const clsRat = [
  { id: 'p1', name: 'Class 1', level: 'Class 1' },
  { id: 'p2', name: 'Class 2', level: 'Class 2' },
  { id: 'm1', name: 'Nursery 1', level: 'Nursery 1' },
  { id: 's1', name: 'FORM 1', level: 'Form 1' },
];
const effectif = [
  { id: 'a', name: 'ZOA Paul',       class_id: 'p1', matricule: '' },
  { id: 'b', name: 'ABEGA Anne',     class_id: 'p1', matricule: '' },
  { id: 'c', name: 'BELLA Jean',     class_id: 'p2', matricule: '' },
  { id: 'd', name: 'DEJA Numerote',  class_id: 'p1', matricule: 'ANCIEN-7' },
  { id: 'e', name: 'NURSE Kid',      class_id: 'm1', matricule: '' },
  { id: 'f', name: 'FORM Eleve',     class_id: 's1', matricule: '' },
  { id: 'g', name: 'SANS Classe',    class_id: null, matricule: '' },
];
const { plan, parSection } = planRattrapageMatricules(effectif, clsRat, AN);

ok(plan.length === 4, 'quatre eleves a numeroter sur sept', plan.length);
ok(parSection.primaire === 3 && parSection.maternelle === 1,
  'compte par section (3 primaire, 1 maternelle)', parSection);
ok(!plan.some((p) => p.id === 'd'), 'un eleve DEJA numerote n est pas touche', plan.map((p) => p.id));
ok(!plan.some((p) => p.id === 'f'), 'le secondaire est exclu', plan.map((p) => p.id));
ok(!plan.some((p) => p.id === 'g'), 'un eleve sans classe est ignore', plan.map((p) => p.id));

const matsRat = plan.map((p) => p.matricule);
ok(new Set(matsRat).size === matsRat.length, 'tous les matricules du lot sont DISTINCTS', matsRat);
ok(!matsRat.includes('ANCIEN-7'), 'le lot ne reutilise pas un matricule existant', matsRat);

// Ordre du REGISTRE : par classe, puis alphabetique. Un registre matricule suit
// la liste d appel, pas l ordre d insertion en base.
const class1 = plan.filter((p) => p.classe === 'Class 1').map((p) => p.name);
ok(class1.join('|') === 'ABEGA Anne|ZOA Paul', 'ordre alphabetique a l interieur d une classe', class1);
ok(plan[0].matricule === 'P250001', 'le premier du registre recoit P250001', plan[0].matricule);

// Rejouer le rattrapage APRES ecriture ne doit plus rien proposer : l operation
// est idempotente, un second clic ne renumerote personne.
const apres = effectif.map((s) => {
  const t = plan.find((p) => p.id === s.id);
  return t ? { ...s, matricule: t.matricule } : s;
});
const rejoue = planRattrapageMatricules(apres, clsRat, AN);
ok(rejoue.plan.length === 0, 'rejoue apres ecriture : plus rien a attribuer', rejoue.plan.length);

// Sans annee exploitable, on ne propose rien du tout.
ok(planRattrapageMatricules(effectif, clsRat, '').plan.length === 0,
  'sans annee scolaire, aucun rattrapage propose', planRattrapageMatricules(effectif, clsRat, '').plan.length);

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\nECHEC : ${echecs}`);
process.exitCode = echecs === 0 ? 0 : 1;
