// Test du résolveur d'identité par unité pédagogique (logique pure, `node`).
import { resolveClassUnit, documentIdentity, classIdentity, studentIdentity } from './schoolIdentity.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

const school = {
  id: 'sch1', name: 'Complexe Scolaire ABC', country_system: 'cameroon_fr',
  current_year: '2025-2026', logo_url: 'group.png', director: 'Directeur Général',
  bulletin_font: 'times',
};

const uPrim = {
  id: 'u-prim', school_id: 'sch1', section_key: 'primaire', name: 'École Primaire ABC',
  logo_url: 'prim.png', stamp_url: 'prim-stamp.png', director: 'Mme Primaire', motto: 'Savoir',
  color_primary: '#0a7',
};
const uColl = {
  id: 'u-coll', school_id: 'sch1', section_key: 'premier_cycle', name: 'Collège ABC',
  logo_url: 'coll.png', director: 'M. Collège',
};
const units = [uPrim, uColl];

const clsCM2 = { id: 'c1', level: 'CM2', name: 'CM2', school_id: 'sch1' };
const cls6e  = { id: 'c2', level: '6e', name: '6e A', school_id: 'sch1' };
const clsTle = { id: 'c3', level: 'Tle', name: 'Tle D', school_id: 'sch1' };
const clsExplicit = { id: 'c4', level: 'CM2', name: 'CM2 B', unit_id: 'u-coll' };

// ── 1. Résolution par section dérivée ────────────────────────────────────────
ok(resolveClassUnit(units, clsCM2) === uPrim, 'CM2 → unité Primaire (section dérivée)');
ok(resolveClassUnit(units, cls6e)  === uColl, '6e → unité Collège (section dérivée)');
ok(resolveClassUnit(units, clsTle) === null,  'Tle → aucune unité (pas de second_cycle défini) → école');

// ── 2. Rattachement explicite prime sur la section ───────────────────────────
ok(resolveClassUnit(units, clsExplicit) === uColl, 'unit_id explicite prime sur la section dérivée');

// ── 3. Garde-fous ────────────────────────────────────────────────────────────
ok(resolveClassUnit([], clsCM2) === null,     'aucune unité → null');
ok(resolveClassUnit(units, null) === null,    'classe absente → null');
ok(resolveClassUnit(null, clsCM2) === null,   'units null → null');

// ── 4. Fusion d'identité (unité surcharge école, champs non vides) ────────────
{
  const id = documentIdentity(school, uPrim);
  ok(id.name === 'École Primaire ABC', 'nom surchargé par l\'unité');
  ok(id.logo_url === 'prim.png',       'logo surchargé');
  ok(id.stamp_url === 'prim-stamp.png','cachet surchargé');
  ok(id.director === 'Mme Primaire',   'directeur surchargé');
  ok(id.motto === 'Savoir',            'devise surchargée');
  ok(id.color_primary === '#0a7',      'couleur exposée');
  // Champs école toujours préservés (périmètre, année, officiels pays, police)
  ok(id.country_system === 'cameroon_fr', 'country_system préservé');
  ok(id.current_year === '2025-2026',     'année préservée');
  ok(id.bulletin_font === 'times',        'police préservée');
  ok(id.__unit_id === 'u-prim',           'marqueur unité posé');
  ok(school.name === 'Complexe Scolaire ABC', 'école NON mutée');
}

// ── 5. Fallback : unité sans champ → garde la valeur école ───────────────────
{
  const id = documentIdentity(school, uColl);
  ok(id.stamp_url === undefined || id.stamp_url == null, 'cachet non défini sur l\'unité → non surchargé');
  ok(id.director === 'M. Collège', 'directeur du collège');
  ok(id.logo_url === 'coll.png',   'logo du collège');
}

// ── 6. Aucune unité → identité = école (zéro régression) ──────────────────────
ok(documentIdentity(school, null) === school, 'unité null → objet école inchangé (identité)');
ok(classIdentity(school, clsTle, units) === school, 'classe hors unité → école');

// ── 7. Identité via l'élève (par sa classe) ──────────────────────────────────
{
  const classes = [clsCM2, cls6e];
  const eleve = { id: 'e1', class_id: 'c1' };
  const id = studentIdentity(school, eleve, classes, units);
  ok(id.name === 'École Primaire ABC', 'élève de CM2 → identité Primaire');
}

console.log(failed ? '\n❌ ÉCHECS' : '\n✅ Tous les tests passent');
process.exit(failed ? 1 : 0);
