// Coût des re-filtrages « tableau complet → sous-ensemble » que font les pages.
//   node --experimental-loader ./scripts/lib/esm-resolve.mjs scripts/perf-selectors.mjs
//
// L'application garde TOUT en mémoire (students, subjects, gradeMap) et chaque
// écran redécoupe ces tableaux à chaque rendu :
//     students.filter((s) => s.class_id === classId)
// Sur 1 600 élèves et 30 classes, ce motif est O(n × classes). On mesure ce que
// ça coûte réellement, et ce que coûterait un index par classe construit une fois.

const SRC = new URL('../src/', import.meta.url).href;
const { clsStat } = await import(`${SRC}core/bulletinEngine.js`);

function makeSchool({ classes = 32, perClass = 50, subjects = 15, seqs = 6 } = {}) {
  const allClasses = [], students = [], subs = [], gradeMap = {};
  for (let c = 0; c < classes; c++) {
    const classId = `c${c}`;
    allClasses.push({ id: classId, name: `Classe ${c + 1}` });
    for (let s = 0; s < subjects; s++) {
      subs.push({ id: `${classId}_s${s}`, class_id: classId, name: `Matière ${s + 1}`, coef: (s % 4) + 1, max: 20 });
    }
    for (let st = 0; st < perClass; st++) {
      const id = `${classId}_st${st}`;
      students.push({ id, class_id: classId, name: `Élève ${st}` });
      for (let seq = 1; seq <= seqs; seq++) {
        const g = {};
        for (let s = 0; s < subjects; s++) g[`${classId}_s${s}`] = String(8 + ((st + seq) % 12));
        gradeMap[`${classId}_${id}_${seq}`] = g;
      }
    }
  }
  return { classes: allClasses, students, subjects: subs, gradeMap };
}

const ns = (fn, runs) => {
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < runs; i++) fn();
  return Number(process.hrtime.bigint() - t0) / 1e6 / runs;
};
const line = (label, ms) => console.log(`  ${label.padEnd(62)} ${ms.toFixed(2).padStart(9)} ms`);

for (const size of [{ c: 10, p: 50 }, { c: 20, p: 50 }, { c: 32, p: 50 }, { c: 60, p: 55 }]) {
  const d = makeSchool({ classes: size.c, perClass: size.p });
  const total = d.students.length;
  console.log(`\n── ${total} élèves · ${size.c} classes · ${d.subjects.length} matières · ${Object.keys(d.gradeMap).length} grilles de notes`);

  line('filtrage des élèves d\'UNE classe (1 passe sur le tableau)',
    ns(() => d.students.filter((s) => s.class_id === 'c0'), 2000));

  line('même filtrage pour TOUTES les classes (motif des tableaux de bord)',
    ns(() => d.classes.map((c) => d.students.filter((s) => s.class_id === c.id)), 200));

  line('… avec un index construit une seule fois (Map class_id → élèves)',
    ns(() => {
      const idx = new Map();
      for (const s of d.students) {
        if (!idx.has(s.class_id)) idx.set(s.class_id, []);
        idx.get(s.class_id).push(s);
      }
      return d.classes.map((c) => idx.get(c.id) || []);
    }, 200));

  const byClass = new Map();
  for (const s of d.students) {
    if (!byClass.has(s.class_id)) byClass.set(s.class_id, []);
    byClass.get(s.class_id).push(s);
  }
  const subsByClass = new Map();
  for (const s of d.subjects) {
    if (!subsByClass.has(s.class_id)) subsByClass.set(s.class_id, []);
    subsByClass.get(s.class_id).push(s);
  }

  line('statistiques de tout l\'établissement — AVEC re-filtrage',
    ns(() => d.classes.map((c) => clsStat(
      d.students.filter((s) => s.class_id === c.id), d.gradeMap, c.id, [1, 2, 3, 4, 5, 6],
      d.subjects.filter((s) => s.class_id === c.id), 'FR', {}, { maxScale: 20 },
    )), 20));

  line('statistiques de tout l\'établissement — avec index',
    ns(() => d.classes.map((c) => clsStat(
      byClass.get(c.id) || [], d.gradeMap, c.id, [1, 2, 3, 4, 5, 6],
      subsByClass.get(c.id) || [], 'FR', {}, { maxScale: 20 },
    )), 20));

  // Empreinte mémoire du gradeMap (approchée par sa sérialisation).
  const bytes = Buffer.byteLength(JSON.stringify(d.gradeMap));
  console.log(`  ${'poids du gradeMap en mémoire (sérialisé)'.padEnd(62)} ${(bytes / 1048576).toFixed(1).padStart(9)} Mo`);
}
