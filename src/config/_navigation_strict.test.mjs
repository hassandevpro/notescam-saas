// Navigation sous MATRICE STRICTE.  node src/config/_navigation_strict.test.mjs
//
// La §1 est la plus importante du fichier : elle compare, pour tous les rôles et
// tous les profils de compte, la navigation calculée AVEC le nouvel argument
// `strictCtx` et SANS lui, dans une école NON durcie. Les deux doivent être
// identiques entrée par entrée. C'est la preuve mécanique de la règle §16 —
// « absolument aucun changement de comportement pour les autres écoles » — sur le
// seul terrain qui compte pour un utilisateur : ce qu'il voit dans son menu.

import { getNavGroups, getMobilePrimary } from './navigation.js';
import { strictContext, STRICT_PERM as P } from '../core/strictMatrix.js';

let failed = false;
const ok = (cond, msg, got) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}${cond || got === undefined ? '' : ` (obtenu: ${JSON.stringify(got)})`}`);
  if (!cond) failed = true;
};

const GENIUS = { id: 'g', strict_role_enforcement: true };
const AUTRE  = { id: 'a', strict_role_enforcement: false };

// Tous les drapeaux de plan levés : on teste les permissions, pas le plan.
const F = { hasTimetable: true, hasAbsences: true, hasFees: true, hasTeachers: true, advancedDelegation: true };

const routes = (role, permissions, strictCtx, gov = {}) =>
  getNavGroups(role, F, permissions, gov, strictCtx).flatMap((g) => g.items).map((i) => i.to);

const ctx = (school, role, opts = {}) => strictContext({ school, role, ...opts });

// ════════════════════════════════════════════════════════════════════════════
// 1. NON-RÉGRESSION (§16) — école non durcie : menu identique, au caractère près
// ════════════════════════════════════════════════════════════════════════════
{
  let compared = 0, diverged = [];
  for (const role of ['admin', 'censeur', 'surveillant', 'teacher']) {
    for (const permissions of [null, [], ['/app/fees'], ['/app/students', '/app/settings']]) {
      for (const perms of [[], [P.FEES_MANAGE], [P.STAFF_MANAGE_ALL]]) {
        const avant = routes(role, permissions, null);                       // code d'avant
        const apres = routes(role, permissions, ctx(AUTRE, role, { permissions, perms }));
        compared++;
        if (avant.join('|') !== apres.join('|')) diverged.push({ role, permissions, avant, apres });
      }
    }
  }
  ok(diverged.length === 0,
    `AUTRE école : ${compared} navigations comparées avec/sans matrice, 0 divergence`, diverged[0]);
}

// Idem pour la barre mobile, qui dérive de la même liste.
{
  const avant = getMobilePrimary('surveillant', F, 4, null, {}).map((i) => i.to);
  const apres = getMobilePrimary('surveillant', F, 4, null, {}, ctx(AUTRE, 'surveillant')).map((i) => i.to);
  ok(avant.join('|') === apres.join('|'), 'AUTRE école : barre mobile inchangée', { avant, apres });
}

// ════════════════════════════════════════════════════════════════════════════
// 2. ÉCOLE DURCIE — l'enseignant (§4, §7)
// ════════════════════════════════════════════════════════════════════════════
{
  const avant = routes('teacher', null, null);
  const apres = routes('teacher', null, ctx(GENIUS, 'teacher'));
  ok(avant.includes('/app/settings') && !apres.includes('/app/settings'),
    'enseignant : les paramètres administratifs disparaissent du menu', apres);
  ok(!apres.includes('/app/historique'), 'enseignant : historique/audit retiré', apres);
  for (const page of ['/app/grades', '/app/bulletins', '/app/timetable', '/app/absences', '/app/releves']) {
    ok(apres.includes(page), `enseignant : ${page} conservée`);
  }
  ok(!apres.some((p) => ['/app/personnel', '/app/teachers', '/app/rh', '/app/fees'].includes(p)),
    'enseignant : ni personnel, ni RH, ni finances', apres);
  ok(apres.length > 0, 'enseignant : le menu ne se vide pas');
}

// ════════════════════════════════════════════════════════════════════════════
// 3. ÉCOLE DURCIE — la finance est un RÔLE, pas un effet du rôle de base (§12)
// ════════════════════════════════════════════════════════════════════════════
{
  const censeurNu = routes('censeur', null, ctx(GENIUS, 'censeur'));
  ok(!censeurNu.includes('/app/fees'),
    'censeur sans rôle financier : plus de frais scolaires au menu', censeurNu);

  const caissier = routes('censeur', null, ctx(GENIUS, 'censeur', { perms: [P.FEES_MANAGE] }));
  ok(caissier.includes('/app/fees'), 'caissier : les frais scolaires reviennent par son RÔLE', caissier);

  // La secrétaire porte la capacité déléguée /app/fees : elle ne suffit plus.
  const secretaire = routes('censeur', ['/app/students', '/app/fees'],
    ctx(GENIUS, 'censeur', { permissions: ['/app/students', '/app/fees'] }));
  ok(!secretaire.includes('/app/fees'),
    'secrétaire : la capacité déléguée /app/fees n’ouvre plus la caisse', secretaire);
  ok(secretaire.includes('/app/students'), 'secrétaire : ses élèves lui restent', secretaire);

  // Même une page ouverte par un rôle de GOUVERNANCE reste soumise à la matrice :
  // le filtre est restrictif, donc au-dessus de tout ce qui accorde.
  const gov = {
    catalog: [{ code: 'r', name: 'r', scope: 'complex', active: true,
      permissions: [], workflows: [], pages: ['/app/fees'], dashboards: [] }],
    assignments: [{ role: 'r', status: 'active' }],
  };
  const viaGov = getNavGroups('censeur', F, null, gov, ctx(GENIUS, 'censeur'))
    .flatMap((g) => g.items).map((i) => i.to);
  ok(!viaGov.includes('/app/fees'),
    'la matrice prime sur une page ouverte par un rôle de gouvernance', viaGov);
}

// ════════════════════════════════════════════════════════════════════════════
// 4. ÉCOLE DURCIE — personnel réservé à qui porte l'autorité (§13)
// ════════════════════════════════════════════════════════════════════════════
{
  // Deux chemins, et deux seulement — les mêmes qu'en base :
  //   • l'AUTORITÉ RH d'un chef de secteur (staff.manage.sector) ;
  //   • la page EXPLICITEMENT confiée au compte (le censeur, le secrétariat).
  // Ce second chemin manquait ici et la matrice était PLUS STRICTE que la base :
  // `can_manage_staff` accepte `user_has_page('/app/personnel')` depuis la
  // Phase 3, si bien que l'interface refusait une page que la base accordait.
  const chef = routes('censeur', ['/app/personnel'],
    ctx(GENIUS, 'censeur', { permissions: ['/app/personnel'], perms: [P.STAFF_MANAGE_SECTOR] }));
  ok(chef.includes('/app/personnel'), 'personnel : ouvert au chef de secteur', chef);

  const censeur = routes('censeur', ['/app/personnel', '/app/teachers'],
    ctx(GENIUS, 'censeur', { permissions: ['/app/personnel', '/app/teachers'] }));
  ok(censeur.includes('/app/personnel') && censeur.includes('/app/teachers'),
    'personnel : ouvert au censeur à qui l’école a confié les pages (§13)', censeur);

  // Mais rien n'est ouvert à qui n'a NI autorité NI page confiée.
  const nu = routes('censeur', null, ctx(GENIUS, 'censeur'));
  ok(!nu.includes('/app/personnel') && !nu.includes('/app/teachers'),
    'personnel : fermé au censeur sans autorité ni page confiée', nu);

  // Et la page Personnel n'ouvre jamais l'argent — les deux axes restent séparés.
  ok(!censeur.includes('/app/fees'),
    'la page Personnel n’emporte aucun droit financier', censeur);
}

// ════════════════════════════════════════════════════════════════════════════
// 5. ÉCOLE DURCIE — l'administrateur garde tout
// ════════════════════════════════════════════════════════════════════════════
{
  const avant = routes('admin', null, null);
  const apres = routes('admin', null, ctx(GENIUS, 'admin'));
  ok(avant.join('|') === apres.join('|'),
    'administrateur : menu identique, la matrice ne lui retire rien', { avant, apres });
}

console.log(failed ? '\n❌ Navigation stricte KO' : '\n✅ Navigation stricte OK');
process.exit(failed ? 1 : 0);
