// ESPACE PARENT — garanties de NAVIGATION.
//   node --experimental-loader ./scripts/lib/esm-resolve.mjs src/config/_parent_navigation.test.mjs
//
// Trois choses seulement, mais ce sont les trois qui, si elles cassaient, ne
// se verraient pas avant la production :
//
//   §1  Le menu parent n'entre JAMAIS dans la navigation du personnel, et
//       réciproquement. C'est la séparation des deux mondes, vérifiée sur les
//       objets eux-mêmes plutôt que sur l'intention.
//   §2  Zéro lien mort : chaque entrée du menu parent correspond à une route
//       réellement déclarée dans App.jsx.
//   §3  Aucun mécanisme d'élargissement du personnel (capacité déléguée,
//       gouvernance, matrice stricte) ne peut faire apparaître une page parent.

import { readFileSync } from 'node:fs';
import { NAV_GROUPS, PARENT_NAV, parentNavPath, getNavGroups } from './navigation.js';
import { CAP_GROUPS, ALWAYS_ALLOWED } from './capabilities.js';
import { strictContext } from '../core/strictMatrix.js';

let failed = false;
const ok = (cond, msg, got) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}${cond || got === undefined ? '' : ` (obtenu: ${JSON.stringify(got)})`}`);
  if (!cond) failed = true;
};

const staffRoutes  = NAV_GROUPS.flatMap((g) => g.items).map((i) => i.to);
const parentRoutes = PARENT_NAV.map((i) => i.to);

// ════════════════════════════════════════════════════════════════════════════
// §1 — LES DEUX MONDES NE SE CROISENT PAS
// ════════════════════════════════════════════════════════════════════════════
{
  const fuite = parentRoutes.filter((r) => staffRoutes.includes(r));
  ok(fuite.length === 0, '1. Aucune route parent dans la navigation du personnel', fuite);

  const inverse = staffRoutes.filter((r) => parentRoutes.includes(r));
  ok(inverse.length === 0, '2. Aucune route du personnel dans le menu parent', inverse);

  // Une page parent ne doit pas être « confiable » comme capacité déléguée :
  // ce serait un chemin par lequel un compte du personnel entrerait dans
  // l'espace parent.
  const caps = CAP_GROUPS.flatMap((g) => g.caps).map((c) => c.to);
  const capFuite = parentRoutes.filter((r) => caps.includes(r) || ALWAYS_ALLOWED.includes(r));
  ok(capFuite.length === 0, '3. Aucune page parent n’est une capacité déléguée', capFuite);

  ok(parentRoutes.every((r) => r.startsWith('/app/parent')),
    '4. Toutes les entrées parent vivent sous /app/parent', parentRoutes.filter((r) => !r.startsWith('/app/parent')));
}

// ════════════════════════════════════════════════════════════════════════════
// §2 — ZÉRO LIEN MORT
// ════════════════════════════════════════════════════════════════════════════
{
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');

  // Les routes parent sont imbriquées : <Route path="/app/parent"> puis des
  // chemins relatifs. On reconstruit les chemins absolus déclarés.
  const nested = [...app.matchAll(/<Route\s+(?:index|path="([^"]+)")/g)]
    .map((m) => m[1] ?? '');
  const declared = new Set([
    '/app/parent',
    ...nested.filter((p) => p && !p.startsWith('/') && p !== '*')
      .map((p) => `/app/parent/${p.replace(/\/:studentId$/, '')}`),
  ]);

  const morts = parentRoutes.filter((r) => !declared.has(r));
  ok(morts.length === 0, '5. Chaque entrée du menu parent a une route dans App.jsx', morts);

  ok(app.includes('<Route path="/parent" element={<ParentLogin />} />'),
    '6. La porte d’entrée /parent est déclarée');
  ok(app.includes('<Route path="/parent/:token" element={<ParentPortal />} />'),
    '7. Le portail public par jeton /parent/:token est INTACT');
  ok(app.includes('<ParentRoute>'), '8. L’espace parent est gardé par ParentRoute');
}

// ════════════════════════════════════════════════════════════════════════════
// §3 — AUCUN ÉLARGISSEMENT NE MÈNE À L'ESPACE PARENT
// ════════════════════════════════════════════════════════════════════════════
{
  const F = { hasTimetable: true, hasAbsences: true, hasFees: true, hasTeachers: true, advancedDelegation: true };
  const GENIUS = { id: 'g', strict_role_enforcement: true };
  let fuites = [];
  for (const role of ['admin', 'censeur', 'surveillant', 'teacher']) {
    for (const permissions of [null, [], ['/app/parent'], ['/app/students', '/app/parent/frais']]) {
      for (const gov of [{}, { governanceRoles: ['fondatrice'] }, { governanceRoles: ['raf'] }]) {
        const routes = getNavGroups(role, F, permissions, gov,
          strictContext({ school: GENIUS, role, permissions })).flatMap((g) => g.items).map((i) => i.to);
        const bad = routes.filter((r) => r.startsWith('/app/parent'));
        if (bad.length) fuites.push({ role, permissions, bad });
      }
    }
  }
  ok(fuites.length === 0,
    '9. Ni rôle, ni capacité déléguée, ni gouvernance n’ouvre une page parent', fuites[0]);
}

// ════════════════════════════════════════════════════════════════════════════
// §4 — CHEMINS PAR ENFANT
// ════════════════════════════════════════════════════════════════════════════
{
  const withChild = PARENT_NAV.filter((i) => i.child);
  ok(withChild.length === 5, '10. Cinq sections dépendent de l’enfant sélectionné', withChild.map((i) => i.to));
  ok(parentNavPath(withChild[0], 'el-1') === `${withChild[0].to}/el-1`,
    '11. Le chemin porte l’id de l’enfant courant');
  // Sans enfant sélectionné, on ne fabrique pas une URL bancale : on rend la
  // racine de la section, que la route redirige.
  ok(parentNavPath(withChild[0], null) === withChild[0].to,
    '12. Sans enfant sélectionné, aucun id fantôme dans l’URL');
}

console.log(failed ? '\n❌ Navigation parent : ÉCHEC' : '\n✅ Navigation parent OK');
process.exit(failed ? 1 : 0);
