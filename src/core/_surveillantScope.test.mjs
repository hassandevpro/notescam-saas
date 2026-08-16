// Tests du PÉRIMÈTRE de responsabilité (module pur) :
//   node src/core/_surveillantScope.test.mjs
//
// Point sensible : le périmètre arrive sous DEUX formes selon l'édition —
// tableaux natifs en cloud (Postgres text[]/uuid[]), TEXT JSON en LAN (SQLite
// n'a pas de type tableau). Les deux doivent donner exactement le même résultat.
import {
  normalizeScope, isGlobalScope, scopeAllowsClass, filterClassesByScope,
  classCycleKey, scopeSummary, CYCLES,
} from './surveillantScope.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };
const eq = (a, b, msg) => ok(a === b, `${msg}  (${JSON.stringify(a)} attendu ${JSON.stringify(b)})`);

const t = (fr) => fr;

const ps  = { id: 'c1', level: 'Petite Section', name: 'PS A' };
const cm2 = { id: 'c2', level: 'CM2',   name: 'CM2 B' };
const six = { id: 'c3', level: '6ème',  name: '6e A' };
const tle = { id: 'c4', level: 'Terminale', name: 'Tle C' };
const all = [ps, cm2, six, tle];

// ── Cycles ──────────────────────────────────────────────────────────────────
eq(classCycleKey(ps),  'fondamental', 'maternelle → fondamental');
eq(classCycleKey(cm2), 'fondamental', 'primaire → fondamental');
eq(classCycleKey(six), 'secondaire',  'collège → secondaire');
eq(classCycleKey(tle), 'secondaire',  'lycée → secondaire');
eq(CYCLES.length, 2, 'deux cycles : fondamental (MINEDUB) et secondaire (MINESEC)');

// ── Périmètre global ────────────────────────────────────────────────────────
ok(isGlobalScope(null), 'aucun périmètre → tout l’établissement');
ok(isGlobalScope({}), 'objet vide → global');
ok(isGlobalScope({ sections: [], cycles: [], classIds: [] }), 'listes vides → global');
ok(!isGlobalScope({ cycles: ['fondamental'] }), 'un cycle fixé → périmètre restreint');
eq(filterClassesByScope(null, all).length, 4, 'périmètre global : aucune classe filtrée');

// ── Forme CLOUD : tableaux natifs ───────────────────────────────────────────
{
  const directeur = { scope_cycles: ['fondamental'], scope_sections: [], scope_class_ids: [] };
  const n = normalizeScope(directeur);
  eq(n.cycles.join(','), 'fondamental', 'cloud : cycles lus tels quels');
  eq(filterClassesByScope(directeur, all).map((c) => c.id).join(','), 'c1,c2',
    'directeur : maternelle + primaire');
  ok(scopeAllowsClass(directeur, cm2) && !scopeAllowsClass(directeur, six),
    'directeur : le CM2 oui, la 6e non');
}

// ── Forme LAN : colonnes TEXT contenant du JSON ─────────────────────────────
// C'est le cas qui échouait : la chaîne n'était pas un tableau, donc le
// périmètre était lu comme vide et tout le monde passait « global ».
{
  const directeurLan = {
    scope_cycles:    '["fondamental"]',
    scope_sections:  '[]',
    scope_class_ids: '[]',
  };
  ok(!isGlobalScope(directeurLan), 'LAN : un périmètre enregistré n’est PAS global');
  eq(normalizeScope(directeurLan).cycles.join(','), 'fondamental', 'LAN : JSON TEXT désérialisé');
  eq(filterClassesByScope(directeurLan, all).map((c) => c.id).join(','), 'c1,c2',
    'LAN : même filtrage que le cloud');
  eq(scopeSummary(directeurLan, t), 'Fondamental', 'LAN : résumé lisible');

  const proviseurLan = { scope_cycles: '["secondaire"]', scope_sections: null, scope_class_ids: null };
  eq(filterClassesByScope(proviseurLan, all).map((c) => c.id).join(','), 'c3,c4',
    'LAN : proviseur = collège + lycée');

  // Le piège évité : une chaîne se comporterait comme une liste de caractères.
  ok(!scopeAllowsClass({ scope_sections: '["primaire"]' }, ps),
    'LAN : pas de correspondance par sous-chaîne (la PS n’entre pas dans "primaire")');
  eq(filterClassesByScope({ scope_sections: '["maternelle"]' }, all).map((c) => c.id).join(','), 'c1',
    'LAN : périmètre par section');
}

// JSON invalide ou vide : on retombe sur « global », jamais d'exception.
ok(isGlobalScope({ scope_cycles: 'pas du json' }), 'JSON illisible → global, sans planter');
ok(isGlobalScope({ scope_cycles: '' }), 'chaîne vide → global');
ok(isGlobalScope({ scope_cycles: '{"a":1}' }), 'JSON non-tableau → global');

// ── Périmètre par CLASSES précises ──────────────────────────────────────────
eq(filterClassesByScope({ classIds: ['c3'] }, all).map((c) => c.id).join(','), 'c3',
  'périmètre par identifiants de classe');
eq(filterClassesByScope({ scope_class_ids: '["c3","c4"]' }, all).map((c) => c.id).join(','), 'c3,c4',
  'LAN : périmètre par identifiants de classe');

// ── Résumés ─────────────────────────────────────────────────────────────────
eq(scopeSummary(null, t), '', 'périmètre global : aucun résumé à afficher');
eq(scopeSummary({ cycles: ['secondaire'] }, t), 'Secondaire', 'résumé du proviseur');

console.log(failed ? '\n❌ ÉCHECS' : '\n✅ Tous les tests passent');
process.exit(failed ? 1 : 0);
