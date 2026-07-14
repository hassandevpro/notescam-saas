// Viviers de données + RNG déterministe pour le générateur de données de démo.
// PUR (aucune I/O). Contexte : établissement scolaire camerounais.

// PRNG seedable (mulberry32) → générations reproductibles (tests).
export function makeRng(seed = 42) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export const int = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));

export const FIRST_NAMES_M = ['Jean', 'Paul', 'Pierre', 'Emmanuel', 'Serge', 'Aliou', 'Boris', 'Cédric', 'Landry', 'Hervé', 'Yannick', 'Blaise', 'Roger', 'Armand', 'Didier'];
export const FIRST_NAMES_F = ['Marie', 'Solange', 'Chantal', 'Aïcha', 'Estelle', 'Nadège', 'Carine', 'Bernadette', 'Rachel', 'Grâce', 'Larissa', 'Mireille', 'Sandrine', 'Josiane', 'Prisca'];
export const SURNAMES = ['Nkoulou', 'Atangana', 'Mbarga', 'Fotso', 'Kamga', 'Ngo Bell', 'Owona', 'Biya', 'Ndongo', 'Essomba', 'Tchoua', 'Manga', 'Njoya', 'Ekambi', 'Abena', 'Fouda', 'Mvondo', 'Bikoi'];

export function fullName(rng, gender) {
  const first = gender === 'F' ? pick(rng, FIRST_NAMES_F) : pick(rng, FIRST_NAMES_M);
  return `${pick(rng, SURNAMES)} ${first}`;
}

// Unités pédagogiques du complexe.
export const UNITS = [
  { key: 'maternelle', name: 'Maternelle', section_key: 'maternelle', levels: ['PS', 'MS', 'GS'] },
  { key: 'primaire', name: 'École primaire', section_key: 'primaire', levels: ['SIL', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'] },
  { key: 'college', name: 'Collège', section_key: 'premier_cycle', levels: ['6e', '5e', '4e', '3e'] },
  { key: 'lycee', name: 'Lycée', section_key: 'second_cycle', levels: ['2nde', '1ère', 'Tle'] },
];

// Matières par cycle.
export const SUBJECTS_BY_UNIT = {
  maternelle: ['Langage', 'Graphisme', 'Découverte', 'Éveil'],
  primaire: ['Français', 'Mathématiques', 'Sciences', 'Histoire-Géo', 'Anglais', 'EPS'],
  college: ['Français', 'Mathématiques', 'PCT', 'SVT', 'Anglais', 'Histoire-Géo', 'EPS'],
  lycee: ['Français', 'Mathématiques', 'Physique', 'SVT', 'Anglais', 'Philosophie', 'Histoire-Géo'],
};

// Personnel de direction / administratif (hors 20 enseignants).
// gov = rôle de gouvernance associé (null = personnel simple).
export const STAFF_ROSTER = [
  { fonction: 'Fondatrice', department: 'administration', gender: 'F', gov: 'fondatrice' },
  { fonction: 'Coordonnateur Général', department: 'administration', gender: 'M', gov: 'coordonnateur_general' },
  { fonction: 'Directrice Maternelle', department: 'administration', gender: 'F', gov: 'responsable_maternelle', sector: 'maternelle' },
  { fonction: 'Directrice Primaire', department: 'administration', gender: 'F', gov: 'directrice_primaire', sector: 'primaire' },
  { fonction: 'Directrice Adjointe Primaire', department: 'administration', gender: 'F', gov: 'directrice_adjointe_primaire', sector: 'primaire' },
  { fonction: 'Principal', department: 'administration', gender: 'M', gov: 'principal', sector: 'college' },
  { fonction: 'Vice-principal', department: 'administration', gender: 'M', gov: 'vice_principal', sector: 'college' },
  { fonction: 'Censeur', department: 'administration', gender: 'M', gov: null },
  { fonction: 'Surveillant Général', department: 'surveillance', gender: 'M', gov: null },
  { fonction: 'Surveillant', department: 'surveillance', gender: 'M', gov: null },
  { fonction: 'RAF', department: 'comptabilite', gender: 'F', gov: 'raf' },
  { fonction: 'Caissier', department: 'comptabilite', gender: 'M', gov: 'caissier' },
  { fonction: 'Comptable', department: 'comptabilite', gender: 'F', gov: null },
  { fonction: 'Responsable RH', department: 'administration', gender: 'F', gov: null },
  { fonction: 'Secrétaire', department: 'administration', gender: 'F', gov: null },
  { fonction: 'Responsable Informatique', department: 'support', gender: 'M', gov: null },
];

// Scénarios : dimensionnement.
export const SCENARIOS = {
  small:  { label: ['Petit établissement', 'Small school', 'Escuela pequeña'], units: ['primaire'], classesPerLevel: 1, studentsPerClass: 12, teachers: 6 },
  medium: { label: ['Établissement moyen', 'Medium school', 'Escuela mediana'], units: ['primaire', 'college'], classesPerLevel: 1, studentsPerClass: 22, teachers: 12 },
  large:  { label: ['Grand complexe scolaire', 'Large complex', 'Gran complejo'], units: ['maternelle', 'primaire', 'college', 'lycee'], classesPerLevel: 1, studentsPerClass: 30, teachers: 20 },
};

export const REPORT_TITLES = ['Fuite d\'eau au bloc B', 'Panne électrique salle info', 'Vitre cassée', 'Absence répétée d\'un élève', 'Retard de livraison cantine', 'Problème de discipline en 4e'];
export const REPORT_CATS = ['maintenance', 'vie_scolaire', 'academique', 'finances', 'patrimoine'];
