// Test du tronc commun classique : classification par niveau/section/système et
// construction des enregistrements `subjects`. Aucune dépendance (pur).
import { defaultClassicSubjects, buildSubjectsForClassicClass } from './classicSubjects.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };
const names = (rows) => rows.map((r) => r.name);

// ── Classification francophone ────────────────────────────────────────────────
ok(names(defaultClassicSubjects({ level: '6e', system: 'FR' })).includes('SVT'), 'Collège FR → tronc commun (SVT)');
ok(names(defaultClassicSubjects({ level: 'Terminale', serie: 'C', system: 'FR' })).includes('Philosophie'),
   'Terminale C FR → ajoute Philosophie');
ok(defaultClassicSubjects({ level: 'Première', serie: 'A', system: 'FR' })[0].name === 'Français',
   'Première A FR → série A (Français en tête)');
ok(names(defaultClassicSubjects({ level: 'CM2', system: 'FR' })).includes('Éveil scientifique / SVT'),
   'Primaire FR → set primaire');

// ── Classification anglophone ─────────────────────────────────────────────────
ok(names(defaultClassicSubjects({ name: 'Form 3', system: 'EN' })).includes('English Language'),
   'Form 3 EN → FORM_LOWER');
ok(names(defaultClassicSubjects({ level: 'Upper Sixth', serie: 'Science', system: 'EN' })).includes('Physics'),
   'Upper Sixth Science EN → sixth science');

// ── Guinée Éq. (ES) : pas d'auto-config classique ─────────────────────────────
ok(defaultClassicSubjects({ level: 'Primero', system: 'ES' }).length === 0, 'Système ES → aucune matière');

// ── Construction des enregistrements + garde moteur ───────────────────────────
let n = 0;
const recs = buildSubjectsForClassicClass({
  school: { bulletin_engine: 'classic' },
  cls: { id: 'K', school_id: 'SC', level: 'Form 1', system: 'EN' },
  makeId: () => `id${n++}`,
});
ok(recs.length > 0 && recs.every((r) => r.max === 100 && r.class_id === 'K' && r.school_id === 'SC'),
   'buildSubjects EN → max=100, class_id/school_id propagés');
ok(recs.every((r, i) => r.position === i), 'positions séquentielles');

const frRecs = buildSubjectsForClassicClass({
  school: { bulletin_engine: 'classic' },
  cls: { id: 'K2', school_id: 'SC', level: '5e', system: 'FR' },
  makeId: () => `x${n++}`,
});
ok(frRecs.every((r) => r.max === 20), 'buildSubjects FR → max=20');

// Classe officielle (moteur non classique) → aucune matière classique générée.
const off = buildSubjectsForClassicClass({
  school: { bulletin_engine: 'officiel' },
  cls: { id: 'K3', school_id: 'SC', level: '6e', system: 'FR' },
  makeId: () => 'z',
});
ok(off.length === 0, 'Moteur officiel → buildSubjectsForClassicClass no-op');

console.log(failed ? '\n❌ ÉCHECS' : '\n✅ Tous les tests passent');
process.exit(failed ? 1 : 0);
