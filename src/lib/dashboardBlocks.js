// COMPOSITION du tableau de bord d'accueil (/app) — logique PURE, testable en Node.
//
// Un seul écran, des BLOCS différents selon qui regarde. Ce module décide QUELS
// blocs afficher et DANS QUEL ORDRE ; il ne rend rien et ne charge aucune donnée
// (la page ne va chercher que les données des blocs réellement retenus).
//
// Deux sources d'autorité, jamais mélangées :
//   - le RÔLE DE BASE (school_users.role : admin/censeur/surveillant/teacher) —
//     c'est le métier quotidien de la personne, il décide du DOMAINE dominant ;
//   - la GOUVERNANCE (catalogue + affectations) — additive, elle ouvre les blocs
//     financiers via `dashboardProfile`, sans qu'aucun nom de rôle de gouvernance
//     ne soit écrit ici (ajouter un rôle au catalogue suffit).
//
// Les comptes délégués (school_users.permissions) ne peuvent pas voir un bloc dont
// la page leur est fermée : le garde final s'appuie sur `isPathPermitted`.

import { dashboardProfile } from '../governance/dashboard.js';
import { activeAssignments } from '../governance/governanceEngine.js';
import { isPathPermitted } from '../config/capabilities.js';

export const BLOCK = {
  SETUP:           'setup',            // guide de démarrage (établissement à configurer)
  TEACHER_CLASSES: 'teacher-classes',  // une carte par classe de l'enseignant
  ACADEMICS:       'academics',        // chiffres académiques (classes/élèves/réussite)
  GRADES_TODO:     'grades-todo',      // notes à compléter
  CLASS_TABLE:     'class-table',      // aperçu par classe
  DISCIPLINE:      'discipline',       // vie scolaire du jour + faits marquants
  FEES:            'fees',             // recouvrement des frais
  QUEUE_VALIDATE:  'queue-validate',   // dépenses à approuver PAR CE RÔLE
  QUEUE_UNLOCK:    'queue-unlock',     // demandes de déblocage à décider
  QUEUE_PAY:       'queue-pay',        // dépenses approuvées à décaisser
  BUDGET_FIGURES:  'budget-figures',   // enveloppe / engagé / disponible
  GROUP_LINK:      'group-link',       // accès à la consolidation du groupe
  QUICK_ACCESS:    'quick-access',     // raccourcis
};

// Route « porteuse » de chaque bloc : sert de lien d'action ET de garde pour les
// comptes délégués (un bloc dont la page est fermée n'a rien à faire à l'écran).
export const BLOCK_ROUTE = {
  [BLOCK.SETUP]:           '/app/settings',
  [BLOCK.TEACHER_CLASSES]: '/app/grades',
  [BLOCK.ACADEMICS]:       '/app/grades',
  [BLOCK.GRADES_TODO]:     '/app/grades',
  [BLOCK.CLASS_TABLE]:     '/app/grades',
  [BLOCK.DISCIPLINE]:      '/app/vie-scolaire',
  [BLOCK.FEES]:            '/app/fees',
  [BLOCK.QUEUE_VALIDATE]:  '/app/depenses',
  [BLOCK.QUEUE_UNLOCK]:    '/app/depenses',
  [BLOCK.QUEUE_PAY]:       '/app/depenses',
  [BLOCK.BUDGET_FIGURES]:  '/app/budget-global',
  [BLOCK.GROUP_LINK]:      '/app/groupe',
  [BLOCK.QUICK_ACCESS]:    null,       // jamais gardé : c'est la sortie de secours
};

// Ordre d'affichage par DOMAINE dominant. Le premier bloc est ce que la personne
// vient faire ici ; le reste est du contexte. Un bloc absent de la liste d'un
// domaine n'est jamais affiché pour ce domaine, même s'il est « disponible ».
const ORDER = {
  school: [
    BLOCK.SETUP, BLOCK.ACADEMICS, BLOCK.GRADES_TODO,
    BLOCK.QUEUE_VALIDATE, BLOCK.QUEUE_UNLOCK, BLOCK.QUEUE_PAY,
    BLOCK.DISCIPLINE, BLOCK.FEES, BLOCK.CLASS_TABLE,
    BLOCK.BUDGET_FIGURES, BLOCK.GROUP_LINK, BLOCK.QUICK_ACCESS,
  ],
  academics: [
    BLOCK.ACADEMICS, BLOCK.GRADES_TODO, BLOCK.CLASS_TABLE,
    BLOCK.DISCIPLINE, BLOCK.FEES,
    BLOCK.QUEUE_VALIDATE, BLOCK.QUEUE_UNLOCK, BLOCK.QUEUE_PAY,
    BLOCK.BUDGET_FIGURES, BLOCK.GROUP_LINK, BLOCK.QUICK_ACCESS,
  ],
  discipline: [
    BLOCK.DISCIPLINE,
    BLOCK.QUEUE_VALIDATE, BLOCK.QUEUE_UNLOCK, BLOCK.QUEUE_PAY,
    BLOCK.QUICK_ACCESS,
  ],
  finance: [
    BLOCK.QUEUE_VALIDATE, BLOCK.QUEUE_UNLOCK, BLOCK.QUEUE_PAY,
    BLOCK.BUDGET_FIGURES, BLOCK.GROUP_LINK,
    BLOCK.FEES, BLOCK.ACADEMICS, BLOCK.DISCIPLINE, BLOCK.QUICK_ACCESS,
  ],
  // Caissier : une file de décaissement et l'encaissement des frais. Aucun chiffre
  // global — il exécute, il n'arbitre pas.
  cash: [
    BLOCK.QUEUE_PAY, BLOCK.FEES, BLOCK.QUICK_ACCESS,
  ],
  teaching: [
    BLOCK.TEACHER_CLASSES, BLOCK.QUICK_ACCESS,
  ],
};

export const DOMAINS = Object.keys(ORDER);

function hasFinanceDuty(profile) {
  return !!(profile.showValidationQueue || profile.showPaymentQueue
    || profile.showUnlockQueue || profile.showGlobalFigures);
}

// Le DOMAINE dominant = ce que la personne vient faire ici.
// L'administrateur garde la vue d'ensemble de l'établissement (aucune régression) ;
// un porteur de rôle de gouvernance financière est d'abord attendu sur ses files ;
// sinon le rôle de base tranche.
export function primaryDomain(role, profile, hasGovernance) {
  if (role === 'admin') return 'school';
  if (hasGovernance && hasFinanceDuty(profile)) return profile.cashierOnly ? 'cash' : 'finance';
  if (role === 'surveillant') return 'discipline';
  if (role === 'censeur') return 'academics';
  return 'teaching';
}

// Blocs DISPONIBLES pour cette personne (avant mise en ordre par domaine).
//
// Règle de sûreté : un bloc n'est disponible que si sa route l'est RÉELLEMENT pour
// cette personne, sinon on affiche une carte qui renvoie vers une page interdite.
// Les blocs scolaires (notes, classes, frais) sont ouverts par le RÔLE DE BASE
// (cf. App.jsx : ACADEMIC/DISCIPLINE) ; les blocs financiers par la gouvernance,
// dont les drapeaux de `profile` sont le miroir exact des pages du catalogue.
function availableBlocks(role, profile) {
  const set = new Set([BLOCK.QUICK_ACCESS]);
  const oversight = role === 'admin' || role === 'censeur';

  if (role === 'admin') set.add(BLOCK.SETUP);
  if (role === 'teacher') set.add(BLOCK.TEACHER_CLASSES);
  if (oversight) { set.add(BLOCK.ACADEMICS); set.add(BLOCK.GRADES_TODO); set.add(BLOCK.CLASS_TABLE); }
  if (oversight || role === 'surveillant') set.add(BLOCK.DISCIPLINE);
  if (oversight) set.add(BLOCK.FEES);

  if (profile.showValidationQueue) set.add(BLOCK.QUEUE_VALIDATE);
  if (profile.showUnlockQueue)     set.add(BLOCK.QUEUE_UNLOCK);
  if (profile.showPaymentQueue)    set.add(BLOCK.QUEUE_PAY);
  if (profile.showGlobalFigures)   set.add(BLOCK.BUDGET_FIGURES);
  if (profile.showGroupDashboard)  set.add(BLOCK.GROUP_LINK);
  return set;
}

/**
 * Composition du tableau de bord.
 * @param {string} role            rôle de base (admin/censeur/surveillant/teacher)
 * @param {Array}  catalog         catalogue de rôles de gouvernance (déjà replié)
 * @param {Array}  assignments     affectations de gouvernance du compte
 * @param {Array|null} permissions capacités déléguées (null = accès par rôle, inchangé)
 * @param {Date}   now
 * @returns {{domain:string, blocks:string[], profile:object, covered:string[]|null}}
 */
export function dashboardLayout({
  role = 'teacher', catalog = [], assignments = [], permissions = null, now = new Date(),
} = {}) {
  const profile = dashboardProfile(role, catalog, assignments);
  const hasGovernance = activeAssignments(assignments, now).length > 0;
  const domain = primaryDomain(role, profile, hasGovernance);
  const available = availableBlocks(role, profile);

  // Compte délégué : ses capacités font autorité, comme dans la navigation.
  const delegated = Array.isArray(permissions) && permissions.length > 0;
  const permitted = (id) => {
    const route = BLOCK_ROUTE[id];
    if (!route) return true;
    return !delegated || isPathPermitted(route, permissions);
  };

  const blocks = (ORDER[domain] || ORDER.teaching).filter((id) => available.has(id) && permitted(id));
  return { domain, blocks, profile, covered: profile.covered };
}
