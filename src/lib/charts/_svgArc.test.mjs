// Tests de la géométrie SVG.  node src/lib/charts/_svgArc.test.mjs
import { polar, segments, donutSegment } from './svgArc.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// polar : 0° = haut, 90° = droite.
const top = polar(0, 0, 10, 0);
ok(near(top.x, 0) && near(top.y, -10), '0° = haut (12h)');
const right = polar(0, 0, 10, 90);
ok(near(right.x, 10) && near(right.y, 0), '90° = droite (3h)');

// segments : fractions + couverture angulaire.
const segs = segments([1, 1, 2], 360);
ok(segs.length === 3 && near(segs[0].frac, 0.25) && near(segs[2].frac, 0.5), 'fractions correctes');
ok(near(segs[0].start, 0) && near(segs[2].end, 360), 'couverture 0 → 360');
ok(segments([], 360).length === 0 && segments([0, 0], 360)[0].frac === 0, 'valeurs vides / nulles gérées');

// jauge : demi-cercle (sweep 180).
const half = segments([1, 1], 180);
ok(near(half[1].end, 180), 'demi-cercle : couverture 180°');

// donutSegment renvoie un tracé fermé.
const d = donutSegment(50, 50, 40, 25, 0, 90);
ok(typeof d === 'string' && d.startsWith('M') && d.endsWith('Z'), 'tracé de segment annulaire fermé');

console.log(failed ? '\n❌ svgArc KO' : '\n✅ svgArc OK');
process.exit(failed ? 1 : 0);
