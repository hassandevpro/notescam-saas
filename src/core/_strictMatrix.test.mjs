// Tests de la MATRICE DE RÔLES STRICTE (frontend).  node src/core/_strictMatrix.test.mjs
//
// Deux exigences se disputent ce fichier, et la seconde est la plus importante :
//   1. dans l'école durcie, chaque rôle ne voit que ce que le cahier des charges
//      lui accorde ;
//   2. §16 — dans TOUTE autre école, absolument rien ne change. C'est pourquoi
//      la §0 ci-dessous rejoue la matrice complète, drapeau baissé, et vérifie
//      qu'aucune décision ne bouge : la fonction doit être l'identité.

import {
  strictContext, strictAllowsPage, isStrictSchool, canCollectFees,
  isFinanceOfficer, isFinanceReader, hasStaffAuthority,
  canManageStaffSector, allowsStaffSector, classSector, userSectors,
  FEE_PAGES, BUDGET_PAGES, STAFF_PAGES, ADMIN_PAGES, TEACHER_PAGES, STRICT_PERM,
} from './strictMatrix.js';
import { ALL_CAPS } from '../config/capabilities.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

const GENIUS = { id: 'g', strict_role_enforcement: true };
const GENIUS_LAN = { id: 'g', strict_role_enforcement: 1 };   // SQLite : pas de booléen
const AUTRE  = { id: 'a', strict_role_enforcement: false };

const ctx = (o) => strictContext(o);
const P = STRICT_PERM;

// Toutes les pages que l'application connaît, plus l'accueil et le profil.
const ALL_PAGES = [...new Set([...ALL_CAPS, '/app', '/app/profile', '/app/aide',
  '/app/vie-scolaire', '/app/retards', '/app/incidents', '/app/sanctions',
  '/app/convocations', '/app/sorties', '/app/conseil-discipline', '/app/approbations'])];

// ════════════════════════════════════════════════════════════════════════════
// 0. NON-RÉGRESSION : école NON durcie — la matrice doit être l'IDENTITÉ (§16)
// ════════════════════════════════════════════════════════════════════════════
ok(isStrictSchool(AUTRE) === false && isStrictSchool(undefined) === false,
  'école non durcie / absente : la matrice ne s’applique pas');
ok(isStrictSchool(GENIUS) && isStrictSchool(GENIUS_LAN),
  'drapeau reconnu en booléen (cloud) comme en 0/1 (LAN)');

{
  // Tous les rôles de base × tous les profils de permissions × toutes les pages.
  const roles = ['admin', 'censeur', 'surveillant', 'teacher', null];
  const permSets = [null, [], ['/app/fees'], ['/app/students'], ALL_CAPS];
  const govSets = [[], ['fees.manage'], ['fees.view'], ['staff.manage.all']];
  let refuses = 0, total = 0;
  for (const role of roles) {
    for (const permissions of permSets) {
      for (const perms of govSets) {
        const c = ctx({ school: AUTRE, role, permissions, perms });
        for (const page of ALL_PAGES) { total++; if (!strictAllowsPage(page, c)) refuses++; }
      }
    }
  }
  ok(refuses === 0 && total > 500,
    `AUTRE école : ${total} décisions de page, 0 refus — comportement strictement inchangé`);
}

// Et l'autorité financière y reste celle d'avant : elle découle du rôle de base.
ok(canCollectFees(ctx({ school: AUTRE, role: 'censeur' })) === true,
  'AUTRE école : le censeur encaisse toujours (règle historique)');
ok(canCollectFees(ctx({ school: AUTRE, role: 'surveillant' })) === false,
  'AUTRE école : le surveillant n’encaissait pas, et n’encaisse toujours pas');
ok(allowsStaffSector(ctx({ school: AUTRE, role: 'censeur' }), 'college', ['primaire']) === true,
  'AUTRE école : aucun cloisonnement du personnel');
ok(canManageStaffSector(ctx({ school: AUTRE, role: 'surveillant' }), 'college', []) === true,
  'AUTRE école : aucune restriction d’écriture sur le personnel');

// ════════════════════════════════════════════════════════════════════════════
// 1. FINANCE = GLOBALE, portée par un RÔLE (§12)
// ════════════════════════════════════════════════════════════════════════════
const caissier   = ctx({ school: GENIUS, role: 'censeur', perms: [P.FEES_MANAGE] });
const controleur = ctx({ school: GENIUS, role: 'censeur', perms: [P.FEES_VIEW] });
const secretaire = ctx({ school: GENIUS, role: 'censeur', permissions: ['/app/students', '/app/fees'] });
const principal  = ctx({ school: GENIUS, role: 'censeur', perms: [P.STAFF_MANAGE_SECTOR] });
const surveillant = ctx({ school: GENIUS, role: 'surveillant' });
const enseignant = ctx({ school: GENIUS, role: 'teacher' });
const admin      = ctx({ school: GENIUS, role: 'admin' });

ok(isFinanceOfficer(caissier) && isFinanceReader(caissier), 'caissier : autorité financière pleine');
ok(!isFinanceOfficer(controleur) && isFinanceReader(controleur),
  'contrôleur : lecture des deux secteurs, aucune écriture');
ok(!isFinanceOfficer(secretaire) && !isFinanceReader(secretaire),
  'secrétaire porteuse de /app/fees : AUCUNE autorité financière (le trou fermé)');
ok(isFinanceOfficer(admin), 'administrateur : autorité financière conservée');

ok(canCollectFees(caissier) && !canCollectFees(controleur) && !canCollectFees(secretaire)
  && !canCollectFees(principal) && !canCollectFees(surveillant) && !canCollectFees(enseignant),
  'encaisser : réservé au rôle financier, refusé à tous les rôles pédagogiques');

for (const page of FEE_PAGES) {
  ok(strictAllowsPage(page, caissier) && strictAllowsPage(page, controleur),
    `${page} : ouverte au service financier`);
  ok(!strictAllowsPage(page, secretaire) && !strictAllowsPage(page, principal)
    && !strictAllowsPage(page, surveillant) && !strictAllowsPage(page, enseignant),
    `${page} : fermée à qui n’a pas de rôle financier`);
}
ok(strictAllowsPage('/app/fees/eleve-42', caissier) && !strictAllowsPage('/app/fees/eleve-42', secretaire),
  'la règle vaut aussi sur les sous-routes (/app/fees/:id)');

// ── BUDGETS : le service financier, et personne d autre ─────────────────────
for (const page of BUDGET_PAGES) {
  ok(strictAllowsPage(page, caissier) && strictAllowsPage(page, controleur),
    page + ' : ouverte au service financier');
  ok(!strictAllowsPage(page, principal) && !strictAllowsPage(page, secretaire)
    && !strictAllowsPage(page, surveillant) && !strictAllowsPage(page, enseignant),
    page + ' : fermee a qui n a pas d autorite financiere');
}
// La capacite deleguee n ouvre PAS l argent — contrairement au personnel.
ok(!strictAllowsPage('/app/budgets', ctx({ school: GENIUS, role: 'censeur',
  permissions: ['/app/budgets', '/app/depenses'] })),
  'budgets : une case cochee ne remplace pas un role financier');
ok(strictAllowsPage('/app/budgets', admin), 'budgets : l administrateur garde tout');

// ════════════════════════════════════════════════════════════════════════════
// 2. PERSONNEL = SECTORIEL (§13)
// ════════════════════════════════════════════════════════════════════════════
const raf = ctx({ school: GENIUS, role: 'censeur', perms: [P.FEES_MANAGE, P.STAFF_MANAGE_ALL] });

ok(hasStaffAuthority(principal) && hasStaffAuthority(raf) && hasStaffAuthority(admin),
  'autorité personnel : chefs de secteur, RH transverse et administrateur');
ok(!hasStaffAuthority(enseignant) && !hasStaffAuthority(surveillant) && !hasStaffAuthority(caissier),
  'enseignant, surveillant, caissier : aucune gestion du personnel par héritage (§4)');
for (const page of STAFF_PAGES) {
  ok(!strictAllowsPage(page, enseignant), `${page} : fermée à l’enseignant`);
  ok(strictAllowsPage(page, principal), `${page} : ouverte au chef de secteur`);
}

// Un CENSEUR ou un SECRETARIAT n a pas de role de chef, mais l ecole peut lui
// confier explicitement la page — c'est ce que `can_manage_staff` accepte déjà
// en base via `user_has_page`. La matrice ne doit pas être plus stricte que la
// base, sinon l interface refuse ce que la base accorde (§13).
const censeur = ctx({ school: GENIUS, role: 'censeur',
  permissions: ['/app/students', '/app/personnel', '/app/teachers'] });
ok(strictAllowsPage('/app/personnel', censeur),
  'censeur : page Personnel EXPLICITEMENT confiee -> autorisee');
ok(strictAllowsPage('/app/teachers', censeur),
  'censeur : page Enseignants EXPLICITEMENT confiee -> autorisee');
ok(!strictAllowsPage('/app/rh', censeur),
  'censeur : la RH, non confiee, reste fermee');
ok(!strictAllowsPage('/app/fees', censeur),
  'censeur : la caisse reste fermee — la page personnel n ouvre pas l argent');
ok(!strictAllowsPage('/app/personnel', ctx({ school: GENIUS, role: 'censeur' })),
  'censeur SANS capacite ni autorite -> Personnel refuse');

// Périmètre ligne à ligne : le Principal du Collège ne voit pas le Primaire.
ok(canManageStaffSector(principal, 'college', ['college']), 'Principal : gère le personnel du Collège');
ok(!canManageStaffSector(principal, 'primaire', ['college']), 'Principal : personnel du Primaire refusé');
ok(canManageStaffSector(principal, null, ['college']), 'agent transverse (secteur nul) : visible et gérable');
ok(canManageStaffSector(raf, 'primaire', ['college']), 'RH transverse : les deux secteurs');
ok(!canManageStaffSector(caissier, 'college', ['college']),
  'caissier : traverse l’ARGENT, pas le personnel — les deux axes restent séparés');
ok(allowsStaffSector(caissier, 'primaire', ['college']) === false,
  'caissier : le personnel du Primaire lui reste invisible');

// ════════════════════════════════════════════════════════════════════════════
// 3. ENSEIGNANT : périmètre strictement pédagogique (§4 et §7)
// ════════════════════════════════════════════════════════════════════════════
for (const page of ['/app/grades', '/app/bulletins', '/app/timetable', '/app/absences', '/app/releves']) {
  ok(strictAllowsPage(page, enseignant), `enseignant : ${page} autorisée`);
}
for (const page of ['/app/settings', '/app/year', '/app/personnel', '/app/teachers',
  '/app/rh', '/app/fees', '/app/groupe', '/app/historique', '/app/monitor']) {
  ok(!strictAllowsPage(page, enseignant), `enseignant : ${page} REFUSÉE`);
}
ok(TEACHER_PAGES.every((p) => strictAllowsPage(p, enseignant)),
  'la liste pédagogique de l’enseignant est cohérente avec la décision');

// ════════════════════════════════════════════════════════════════════════════
// 4. PARAMÈTRES ADMINISTRATIFS
// ════════════════════════════════════════════════════════════════════════════
for (const page of ADMIN_PAGES) {
  ok(strictAllowsPage(page, admin), `${page} : ouverte à l’administrateur`);
  ok(!strictAllowsPage(page, surveillant), `${page} : fermée au surveillant`);
}
ok(strictAllowsPage('/app/settings', ctx({ school: GENIUS, role: 'censeur', permissions: ['/app/settings'] })),
  'paramètres : un compte à qui l’école les a EXPLICITEMENT confiés les garde');

// ════════════════════════════════════════════════════════════════════════════
// 5. VIE SCOLAIRE : le surveillant garde son métier (§8)
// ════════════════════════════════════════════════════════════════════════════
for (const page of ['/app/vie-scolaire', '/app/absences', '/app/retards', '/app/incidents',
  '/app/sanctions', '/app/sorties', '/app/conseil-discipline', '/app/students', '/app/reports']) {
  ok(strictAllowsPage(page, surveillant), `surveillant : ${page} conservée`);
}

// ════════════════════════════════════════════════════════════════════════════
// 6. VOCABULAIRE DE SECTEUR — miroir de public.class_sector
// ════════════════════════════════════════════════════════════════════════════
ok(classSector({ section: 'premier_cycle' }) === 'college', 'premier cycle → collège');
ok(classSector({ section: 'second_cycle' }) === 'college', 'second cycle → collège');
ok(classSector({ cycle: 'secondaire' }) === 'college', 'cycle secondaire → collège');
ok(classSector({ cycle: 'primaire' }) === 'primaire', 'cycle primaire → primaire');
ok(classSector({ section: 'maternelle' }) === 'maternelle', 'section maternelle → maternelle');
ok(classSector({ name: '6ème A', level: '6eme' }) === 'college',
  'colonnes absentes : le secteur se déduit du niveau (repli)');
ok(classSector(null) === null, 'classe absente → aucun secteur');

{
  const classes = [
    { id: 'c1', cycle: 'secondaire', level: '6eme', name: '6e A' },
    { id: 'c2', cycle: 'primaire', level: 'cm2', name: 'CM2' },
    { id: 'c3', cycle: 'maternelle', level: 'ps', name: 'Petite section' },
  ];
  ok(userSectors({ cycles: ['secondaire'] }, classes).join() === 'college',
    'périmètre Collège → secteur collège seul');
  const fond = userSectors({ cycles: ['fondamental'] }, classes).sort();
  ok(fond.join() === 'maternelle,primaire',
    'périmètre Fondamental → maternelle + primaire (§2)', fond);
  ok(userSectors({}, classes).sort().join() === 'college,maternelle,primaire',
    'périmètre global → les trois secteurs (règle implicite, migration absente)');
  ok(userSectors({ global: true, cycles: ['secondaire'] }, classes).sort().join() === 'college,maternelle,primaire',
    'scope_global EXPLICITE à vrai → tous les secteurs, quel que soit le périmètre');
  ok(userSectors({ global: false }, classes).length === 0,
    'scope_global EXPLICITE à faux et périmètre vide → aucun secteur (le serveur dit pareil)');
}

console.log(failed ? '\n❌ Matrice stricte KO' : '\n✅ Matrice stricte OK');
process.exit(failed ? 1 : 0);
