// MATRICE DE RÔLES STRICTE — logique PURE, testable en Node.
//
// Miroir frontend de `supabase_genius_role_permissions.sql` (RLS) et de
// `server/scopeGuard.js` (serveur LAN). Les trois disent la même chose ; celui-ci
// n'est là que pour que l'INTERFACE ne propose pas ce que les deux autres
// refuseront de toute façon. Il ne protège rien à lui seul — c'est la règle §15
// du cahier des charges : le frontend n'est jamais une barrière de sécurité.
//
// ── PRINCIPE : RESTRICTIF, JAMAIS PERMISSIF ────────────────────────────────
// Exactement le raisonnement des policies `AS RESTRICTIVE` de la Phase 2 :
//
//     accès final = (règles historiques) ET (cette matrice)
//
// Aucune fonction de ce fichier n'OUVRE un accès. Elles ne savent que retirer.
// Conséquence directe, et c'est la garantie demandée au §16 : quand
// `strict` vaut false — donc pour TOUTE école autre que celle explicitement
// durcie — `strictAllowsPage` renvoie true sans rien examiner, et la navigation
// comme les routes retombent au caractère près sur leur comportement d'avant.
//
// ── DEUX AXES INDÉPENDANTS (§18) ───────────────────────────────────────────
//   PÉDAGOGIE = SECTORIELLE : le secteur du compte borne classes, élèves, notes,
//               vie scolaire et personnel.
//   FINANCE   = GLOBALE     : l'autorité financière est un RÔLE (fees.manage /
//               fees.view) et traverse les deux secteurs. Elle ne se déduit
//               JAMAIS du rôle de base ni du fait de voir un élève.
//
// Le secteur d'un compte n'entre donc pas dans la décision financière, et
// l'autorité financière n'ouvre aucune page pédagogique.

import { classSectionKey } from './engineResolver.js';
import { scopeAllowsClass, isGlobalScope } from './surveillantScope.js';

// ── Clés d'autorité (miroir exact des clés posées en base par la §8 du SQL) ──
export const STRICT_PERM = {
  FEES_MANAGE:         'fees.manage',          // encaisser, modifier un dû, une grille
  FEES_VIEW:           'fees.view',            // consulter l'argent, sans écrire
  STAFF_MANAGE_SECTOR: 'staff.manage.sector',  // gérer le personnel de SON secteur
  STAFF_MANAGE_ALL:    'staff.manage.all',     // gérer le personnel des deux secteurs
};

// Pages d'ARGENT. Y accéder exige une autorité financière — pas le rôle de base,
// pas la simple détention de la capacité déléguée `/app/fees`. C'est le trou que
// la Phase 3 a fermé côté base : tous les comptes délégués naissent `censeur`
// (src/config/capabilities.js), donc `role IN ('admin','censeur')` accordait la
// caisse à la secrétaire du Primaire comme au responsable informatique.
export const FEE_PAGES = ['/app/fees', '/app/frais-catalogue'];

// Pages de PERSONNEL. §13 : chaque responsable voit le personnel de son secteur ;
// un enseignant n'obtient jamais la gestion du personnel par héritage.
export const STAFF_PAGES = ['/app/teachers', '/app/personnel', '/app/rh'];

// PARAMÈTRES ADMINISTRATIFS. §4 : « Un enseignant ne doit PAS automatiquement
// avoir accès aux paramètres administratifs. » La règle vaut pour tout rôle non
// administrateur : ces pages configurent l'établissement entier, donc les deux
// secteurs. Un compte à qui l'école a EXPLICITEMENT confié la page la garde.
export const ADMIN_PAGES = ['/app/settings', '/app/year', '/app/synchronisation',
  '/app/groupe', '/app/seed-data'];

// PÉRIMÈTRE ENSEIGNANT (§4 et §7) : strictement ses fonctions pédagogiques.
// Cette liste ne DONNE rien — elle borne. `/app/students` et `/app/classes` y
// figurent parce que le cahier des charges les cite (« ses classes, ses élèves »)
// pour le cas où l'école les délègue ; la navigation ne les ouvre pas d'elle-même
// à un enseignant, et le périmètre reste celui de ses affectations.
export const TEACHER_PAGES = ['/app', '/app/profile', '/app/aide',
  '/app/grades', '/app/bulletins', '/app/releves', '/app/timetable',
  '/app/absences', '/app/students', '/app/classes',
  '/app/notifications', '/app/signalements'];

// ── L'interrupteur ──────────────────────────────────────────────────────────
// `schools.strict_role_enforcement` : booléen Postgres (cloud), entier 0/1
// (SQLite en édition LAN, sans type booléen) ou son rendu texte. Même tolérance
// que `isAdvancedDelegation`, pour la même raison.
export function isStrictSchool(school) {
  const v = school?.strict_role_enforcement;
  return v === true || v === 1 || v === '1';
}

// ── Contexte d'autorité ─────────────────────────────────────────────────────
// Construit UNE fois par rendu, à partir de ce que porte déjà le store d'auth.
// `perms` = permissions de gouvernance effectives (governanceEngine), c'est-à-dire
// l'union `permissions ∪ workflows` des rôles actifs — même sémantique que
// `public.user_gov_perms` et que `govPerms()` du serveur LAN.
export function strictContext({ school, role, permissions, perms } = {}) {
  return {
    strict: isStrictSchool(school),
    role: role ?? null,
    permissions: Array.isArray(permissions) ? permissions : null,
    perms: perms instanceof Set ? perms : new Set(Array.isArray(perms) ? perms : []),
  };
}

const holds = (ctx, key) => !!ctx?.perms?.has?.(key);
const isAdmin = (ctx) => ctx?.role === 'admin' || ctx?.role === 'superadmin';

// Racine de groupe correspondant au chemin, ou null. Le préfixe gère les sous-
// routes (`/app/students/:id` relève de `/app/students`).
//
// `/app` est la seule entrée qui ne matche QU'EXACTEMENT : c'est le tableau de
// bord, pas un préfixe. Sans cette exception, le `/app` de la liste enseignant
// couvrirait `/app/personnel` comme `/app/settings` et la borne ne bornerait
// plus rien — le test l'a montré. Même raison que `ALWAYS_ALLOWED` dans
// config/capabilities.js, qui compare lui aussi en égalité stricte.
function matchIn(list, path) {
  return list.find((p) => path === p || (p !== '/app' && path.startsWith(p + '/'))) || null;
}

// ── AUTORITÉ FINANCIÈRE (§12) ───────────────────────────────────────────────
// Transverse aux deux secteurs, portée par un rôle. Miroir de
// `is_finance_officer` / `is_finance_reader`.
export function isFinanceOfficer(ctx) {
  return isAdmin(ctx) || holds(ctx, STRICT_PERM.FEES_MANAGE);
}

// Le Contrôleur s'arrête ici : il contrôle les deux secteurs sans jamais écrire.
export function isFinanceReader(ctx) {
  return isFinanceOfficer(ctx) || holds(ctx, STRICT_PERM.FEES_VIEW);
}

// Le compte peut-il ENCAISSER / modifier un dû ? Hors école durcie, on rend
// exactement la réponse d'avant (le rôle de base décidait), sans quoi on
// changerait le comportement des autres établissements.
export function canCollectFees(ctx) {
  if (!ctx?.strict) return ctx?.role === 'admin' || ctx?.role === 'censeur';
  return isFinanceOfficer(ctx);
}

// ── AUTORITÉ SUR LE PERSONNEL (§13) ─────────────────────────────────────────
export function hasStaffAuthority(ctx) {
  return isAdmin(ctx)
    || holds(ctx, STRICT_PERM.STAFF_MANAGE_ALL)
    || holds(ctx, STRICT_PERM.STAFF_MANAGE_SECTOR);
}

// ── VOCABULAIRE DE SECTEUR ──────────────────────────────────────────────────
// Miroir de `public.class_sector` et de `classSector()` du serveur LAN. On lit
// d'abord les colonnes explicites (`section`, `cycle`), qui font foi côté base,
// et on retombe sur la déduction par niveau/nom quand elles sont absentes.
export function classSector(cls) {
  if (!cls) return null;
  const section = cls.section || null;
  const cycle = cls.cycle || null;
  if (section === 'premier_cycle' || section === 'second_cycle') return 'college';
  if (cycle === 'secondaire') return 'college';
  if (section === 'primaire'   || cycle === 'primaire')   return 'primaire';
  if (section === 'maternelle' || cycle === 'maternelle') return 'maternelle';
  const key = classSectionKey(cls);
  if (key === 'premier_cycle' || key === 'second_cycle') return 'college';
  if (key === 'primaire' || key === 'maternelle') return key;
  return null;
}

// Secteurs réellement couverts par le périmètre du compte, DÉRIVÉS en rejouant
// le filtre de périmètre sur les classes de l'école. Le résultat ne peut donc pas
// diverger du cloisonnement de la Phase 2 : aucune règle n'est réécrite ici.
//
// `scope.global` fait foi quand il est renseigné (school_users.scope_global), et
// il prime sur la règle implicite « trois tableaux vides = tout l'établissement » :
// un compte explicitement NON global et sans périmètre ne couvre aucun secteur,
// ce que dit déjà le serveur. Quand la colonne n'a pas pu être lue (déploiement
// sans la migration), on retombe sur la règle implicite — comportement d'avant.
export function userSectors(scope, classes = []) {
  const out = new Set();
  const declared = scope?.global === undefined || scope?.global === null ? null : scope.global === true;
  // Explicitement NON global et sans aucune dimension de périmètre : le compte ne
  // couvre rien. `scopeAllowsClass` répondrait « tout » à un périmètre vide — c'est
  // sa règle historique, antérieure à `scope_global` ; ici la colonne fait foi.
  if (declared === false && isGlobalScope(scope)) return [];
  const all = declared === null ? isGlobalScope(scope) : declared;
  for (const c of classes) {
    if (!all && !scopeAllowsClass(scope, c)) continue;
    const s = classSector(c);
    if (s) out.add(s);
  }
  return [...out];
}

// Une fiche de personnel est-elle dans le périmètre ? `sector` NULL = agent
// TRANSVERSE (comptabilité, gardiennage…) : visible de tous — c'est l'état de
// toutes les fiches déjà saisies, donc zéro régression.
export function allowsStaffSector(ctx, sector, sectors = []) {
  if (!ctx?.strict) return true;
  if (isAdmin(ctx)) return true;
  if (holds(ctx, STRICT_PERM.STAFF_MANAGE_ALL)) return true;   // RH transverse
  if (sector == null || sector === '') return true;
  return sectors.includes(sector);
}

// Le compte peut-il ÉCRIRE la fiche d'un membre du personnel de ce secteur ?
export function canManageStaffSector(ctx, sector, sectors = []) {
  if (!ctx?.strict) return true;
  if (isAdmin(ctx)) return true;
  if (holds(ctx, STRICT_PERM.STAFF_MANAGE_ALL)) return true;
  if (!holds(ctx, STRICT_PERM.STAFF_MANAGE_SECTOR)) return false;
  if (sector == null || sector === '') return true;
  return sectors.includes(sector);
}

// ── LA DÉCISION DE PAGE ─────────────────────────────────────────────────────
// Renvoie false UNIQUEMENT pour retirer une page. Consommée par la navigation
// (ce qui s'affiche) ET par ProtectedRoute (ce qui s'ouvre à l'URL) : les deux
// interrogent la même fonction, pour qu'un menu caché ne puisse pas rester
// atteignable en tapant l'adresse.
export function strictAllowsPage(path, ctx) {
  if (!ctx?.strict) return true;                 // autre école : rien n'est retiré
  if (isAdmin(ctx)) return true;

  // ARGENT — l'autorité est un rôle. Elle prime sur la capacité déléguée : sans
  // cela, la secrétaire porteuse de `/app/fees` verrait une caisse que la base
  // refuse d'alimenter, ce qui est pire qu'une page absente.
  if (matchIn(FEE_PAGES, path)) return isFinanceReader(ctx);

  // PERSONNEL — §13. Le périmètre par secteur est appliqué ligne à ligne
  // ailleurs (allowsStaffSector) ; ici on décide seulement de l'accès au module.
  if (matchIn(STAFF_PAGES, path)) return hasStaffAuthority(ctx);

  // PARAMÈTRES ADMINISTRATIFS — administrateur, ou capacité EXPLICITEMENT confiée.
  const adminRoot = matchIn(ADMIN_PAGES, path);
  if (adminRoot) return Array.isArray(ctx.permissions) && ctx.permissions.includes(adminRoot);

  // ENSEIGNANT — §4 et §7 : son périmètre est pédagogique, rien d'autre.
  if (ctx.role === 'teacher') return !!matchIn(TEACHER_PAGES, path);

  return true;
}
