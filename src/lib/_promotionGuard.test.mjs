// Test pur de la garde d'idempotence de la promotion (C3).
// Lancer : node src/lib/_promotionGuard.test.mjs
import { promotionAlreadyDone } from './promotionGuard.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

const S = 'school-1';
const classes = [
  { id: 'c1', school_id: S, current_year: '2024-2025' },
  { id: 'c2', school_id: S, current_year: '2024-2025' },
];

ok(promotionAlreadyDone(classes, S, '2025-2026') === false, 'newYear sans classe → promotion possible');
ok(promotionAlreadyDone([...classes, { id: 'c3', school_id: S, current_year: '2025-2026' }], S, '2025-2026') === true,
  'une classe de newYear existe → déjà promu');
ok(promotionAlreadyDone([{ id: 'x', school_id: 'other', current_year: '2025-2026' }], S, '2025-2026') === false,
  'classe newYear d\'une AUTRE école → n\'entre pas en compte');
ok(promotionAlreadyDone(classes, S, '') === false, 'newYear vide → false (pas de garde)');
ok(promotionAlreadyDone(null, S, '2025-2026') === false, 'liste nulle → false');
ok(promotionAlreadyDone([null, undefined, ...classes], S, '2025-2026') === false, 'ignore les lignes nulles');

console.log(failed ? '\n❌ ÉCHEC' : '\n✅ OK');
process.exit(failed ? 1 : 0);
