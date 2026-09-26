// Test de la table bilingue des référentiels officiels : un bulletin du secteur
// anglophone ne doit plus porter d'intitulé français, et un bulletin francophone
// ne doit rien voir changer. Aucune dépendance (pur).
import {
  matDomaineLabel, matAcquisLabel,
  primCompetenceLabel, primCritereLabel, primCoteLabel,
  apcMatiereLabel,
  MAT_DOMAINE_EN, PRIM_COMPETENCE_EN, PRIM_CRITERE_EN, PRIM_COTE_EN, APC_MATIERE_EN,
} from './referentielI18n.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// ── Le système de la classe décide, pas la langue de l'interface ──────────────
const psycho = { id: 'psychomotricite', intitule: 'Psychomotricité' };
ok(matDomaineLabel(psycho, 'EN') === 'Psychomotor skills', 'EN → domaine traduit');
ok(matDomaineLabel(psycho, 'FR') === 'Psychomotricité',    'FR → domaine inchangé');
ok(matDomaineLabel(psycho, 'ES') === 'Psychomotricité',    'ES → repli français (moteurs GE distincts)');
ok(matDomaineLabel(psycho, undefined) === 'Psychomotricité', 'système absent → français');

// ── Un identifiant inconnu rend le libellé d'origine, jamais du vide ──────────
ok(matDomaineLabel({ id: 'domaine_maison', intitule: 'Domaine maison' }, 'EN') === 'Domaine maison',
   'domaine hors référentiel → intitulé d’origine');
ok(primCompetenceLabel({ id: '9z', intitule: 'Compétence locale' }, 'EN') === 'Compétence locale',
   'compétence hors référentiel → intitulé d’origine');
ok(apcMatiereLabel({ id: 'english', nom: 'English Language' }, 'EN') === 'English Language',
   'catalogue anglophone → déjà en anglais, laissé tel quel');
ok(matDomaineLabel(null, 'EN') === '' && primCritereLabel(undefined, 'EN') === '',
   'entrée nulle → chaîne vide, pas de plantage');

// ── Primaire : compétences, critères, cotes ───────────────────────────────────
ok(primCompetenceLabel({ id: '1a', intitule: 'Communiquer en français' }, 'EN') === 'Communicate in French',
   '1A → Communicate in French');
ok(primCritereLabel({ id: 'savoir_etre', nom: 'Savoir-être' }, 'EN') === 'Attitude', 'Savoir-être → Attitude');
ok(primCoteLabel('A+', 'Très bien acquis', 'EN') === 'Very well achieved', 'cote A+ → libellé anglais');
ok(primCoteLabel('a+', 'Très bien acquis', 'EN') === 'Very well achieved', 'code de cote insensible à la casse');
ok(primCoteLabel('A+', 'Très bien acquis', 'FR') === 'Très bien acquis', 'FR → libellé du barème inchangé');

// ── Maternelle : les mots de la cote et ceux de la légende sont les mêmes ─────
ok(matAcquisLabel('ECA', 'En cours d’acquisition', 'EN') === 'In progress',
   'ECA → In progress (mêmes mots que la légende du bulletin)');

// ── Premier cycle : le catalogue francophone servi à une classe anglophone ────
ok(apcMatiereLabel({ id: 'ecm', nom: 'Education à la Citoyenneté et à la Morale' }, 'EN')
   === 'Citizenship and Moral Education', 'ECM → Citizenship and Moral Education');
ok(!/[éèêàçùôîï]/i.test(Object.values(APC_MATIERE_EN).join(' ')), 'aucun accent français dans la colonne anglaise');

// ── Couverture : tout le référentiel officiel est traduit ─────────────────────
const MAT_DOMAINE_IDS = [
  'langage_communication', 'prelecture_preecriture', 'prenumeration_logique', 'psychomotricite',
  'decouverte_monde', 'vie_sociale_affective', 'activites_artistiques', 'autonomie_personnelle',
];
const PRIM_COMPETENCE_IDS = ['1a', '1b', '1c', '2a', '2b', '3a', '3b', '4a', '5a', '6a', '6b'];
const APC_MATIERE_IDS = [
  'anglais', 'francais', 'mathematiques', 'informatique', 'histoire', 'geographie', 'sciences',
  'svteehb', 'pct', 'eps', 'esf', 'travail_manuel', 'eac', 'ecm', 'cultures_nat', 'langues_nat',
  'latin', 'grec', 'allemand', 'arabe', 'espagnol', 'italien', 'chinois',
];
const missing = (ids, map) => ids.filter((id) => !map[id]);
ok(missing(MAT_DOMAINE_IDS, MAT_DOMAINE_EN).length === 0, 'les 8 domaines du préscolaire sont traduits');
ok(missing(PRIM_COMPETENCE_IDS, PRIM_COMPETENCE_EN).length === 0, 'les 11 compétences du primaire sont traduites');
ok(missing(['oral', 'ecrit', 'pratique', 'savoir_etre'], PRIM_CRITERE_EN).length === 0, 'les 4 critères sont traduits');
ok(missing(['a+', 'a', 'eca', 'na'], PRIM_COTE_EN).length === 0, 'les 4 cotes du primaire sont traduites');
ok(missing(APC_MATIERE_IDS, APC_MATIERE_EN).length === 0, 'les 23 matières du premier cycle FR sont traduites');

console.log(failed ? '\n❌ Des tests ont échoué' : '\n✅ Tous les tests passent');
process.exit(failed ? 1 : 0);
