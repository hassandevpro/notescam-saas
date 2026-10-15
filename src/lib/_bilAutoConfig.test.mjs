// Auto-configuration des classes du Programme Bilingue Spécial.
// Exécution : node --experimental-loader ./scripts/lib/esm-resolve.mjs src/lib/_bilAutoConfig.test.mjs
//
// Vérifie que la restriction Form 4/5 est appliquée AU POINT DE CONFIGURATION,
// et pas seulement au routage : aucune matière ne doit être créée sur une classe
// dont le référentiel est incomplet.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { bilRefKeyForClass, buildBilSubjectsForClass } from './bilAutoConfig.js';

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); console.log('✅ ' + msg); pass++; };
const eq = (a, b, msg) => ok(a === b, `${msg} (${a} === ${b})`);

const here = dirname(fileURLToPath(import.meta.url));
const ref = JSON.parse(readFileSync(join(here, '../../examples/bilingue/referentiel-bilingue-special-premier-cycle.json'), 'utf8'));
const school = { bulletin_engine: 'bilingue_special' };
let n = 0;
const makeId = () => `s${++n}`;
const build = (cls, opts = {}) => buildBilSubjectsForClass({ referentiel: ref, school, cls, makeId, ...opts });

console.log('── Clé de référentiel ──');
eq(bilRefKeyForClass({ level: '6e', name: '6e Bilingue' })?.serieId, 'bil_fr', '6e → série francophone');
eq(bilRefKeyForClass({ level: 'Form 1', name: 'Form 1' })?.serieId, 'bil_en', 'Form 1 → série anglophone');
eq(bilRefKeyForClass({ level: 'Form 3', name: 'Form 3' })?.classeId, 'form3', 'Form 3 → classe form3');
eq(bilRefKeyForClass({ level: 'Form 4', name: 'Form 4' }), null, 'Form 4 → aucune clé (hors service)');
eq(bilRefKeyForClass({ level: 'Form 5', name: 'Form 5' }), null, 'Form 5 → aucune clé (hors service)');
eq(bilRefKeyForClass({ level: 'Terminale', name: 'Tle C' }), null, 'second cycle → aucune clé');

console.log('\n── Matières créées ──');
const m6 = build({ id: 'c1', school_id: 'e1', level: '6e', name: '6e Bilingue' });
eq(m6.length, 15, '6e : 15 matières créées');
eq(m6.reduce((a, s) => a + s.coef, 0), 31, '6e : Σcoef = 31, conforme à l\'arrêté');
ok(m6.every((s) => s.bil_domaine && s.bil_domaine_ordre != null), 'chaque matière porte son domaine');

const mf1 = build({ id: 'c2', school_id: 'e1', level: 'Form 1', name: 'Form 1' });
eq(mf1.length, 14, 'Form 1 : 14 matières créées');
eq(mf1.reduce((a, s) => a + s.coef, 0), 32, 'Form 1 : Σcoef = 32');

console.log('\n── Form 4/5 : AUCUNE matière, même en forçant ──');
eq(build({ id: 'c3', school_id: 'e1', level: 'Form 4', name: 'Form 4' }).length, 0,
  'Form 4 : aucune matière créée');
eq(build({ id: 'c4', school_id: 'e1', level: 'Form 5', name: 'Form 5' }).length, 0,
  'Form 5 : aucune matière créée');
// Même en demandant explicitement les options : la classe reste hors service.
eq(build({ id: 'c5', school_id: 'e1', level: 'Form 4', name: 'Form 4' }, { includeOptional: true }).length, 0,
  'Form 4 avec includeOptional : toujours aucune matière');

console.log('\n── Une école NON bilingue n\'est pas touchée ──');
eq(buildBilSubjectsForClass({ referentiel: ref, school: { bulletin_engine: 'minesec' }, cls: { id: 'c6', school_id: 'e1', level: '6e', name: '6e' }, makeId }).length, 0,
  'école « minesec » : aucune matière bilingue créée');
eq(buildBilSubjectsForClass({ referentiel: null, school, cls: { id: 'c7', school_id: 'e1', level: '6e', name: '6e' }, makeId }).length, 0,
  'référentiel absent : aucune matière créée (pas de plantage)');

console.log(`\n${pass} assertions OK`);
