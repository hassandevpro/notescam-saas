// ─────────────────────────────────────────────────────────────────────────────
// BANC DE PERFORMANCE DES MOTEURS DE CALCUL — npm run perf:engines
// ─────────────────────────────────────────────────────────────────────────────
// Les moteurs (bulletinEngine, transcriptEngine) sont purs : on peut les mesurer
// sans navigateur, avec des volumes d'établissement réels. On mesure ce que
// l'application fait VRAIMENT, c'est-à-dire les mêmes appels dans le même ordre
// que les pages Bulletins, Relevés et Tableau de bord.
//
//   node --experimental-loader ./scripts/lib/esm-resolve.mjs scripts/perf-engines.mjs

const SRC = new URL('../src/', import.meta.url).href;
const { multiAvg, buildRanks, clsStat, resolveScores, getAvg } = await import(`${SRC}core/bulletinEngine.js`);
const { buildClassTranscripts } = await import(`${SRC}lib/transcriptEngine.js`);

// ── Jeu de données d'un établissement ────────────────────────────────────────
function makeSchool({ classes = 30, perClass = 55, subjects = 15, seqs = 6, composites = false } = {}) {
  const allClasses = [];
  const students = [];
  const subs = [];
  const gradeMap = {};

  for (let c = 0; c < classes; c++) {
    const classId = `c${c}`;
    allClasses.push({ id: classId, name: `Classe ${c + 1}`, level: `${(c % 7) + 1}e`, system: 'FR', cycle: 'secondaire' });

    for (let s = 0; s < subjects; s++) {
      const id = `${classId}_s${s}`;
      subs.push({ id, class_id: classId, name: `Matière ${s + 1}`, coef: (s % 4) + 1, max: 20, position: s });
      // Une matière sur cinq porte deux sous-composantes (matières composites).
      if (composites && s % 5 === 0) {
        subs.push({ id: `${id}_a`, class_id: classId, parent_id: id, name: 'Écrit', coef: 2, max: 20 });
        subs.push({ id: `${id}_b`, class_id: classId, parent_id: id, name: 'Oral', coef: 1, max: 20 });
      }
    }

    const classSubs = subs.filter((x) => x.class_id === classId);
    for (let st = 0; st < perClass; st++) {
      const id = `${classId}_st${st}`;
      students.push({ id, class_id: classId, name: `Élève ${st + 1}`, matricule: `M${c}${st}` });
      for (let seq = 1; seq <= seqs; seq++) {
        const g = {};
        for (const sub of classSubs) g[sub.id] = String(8 + ((st + seq) % 12));
        gradeMap[`${classId}_${id}_${seq}`] = g;
      }
    }
  }
  return { classes: allClasses, students, subjects: subs, gradeMap };
}

const bench = (label, fn, runs = 1) => {
  const t0 = process.hrtime.bigint();
  let out;
  for (let i = 0; i < runs; i++) out = fn();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / runs;
  console.log(`  ${label.padEnd(58)} ${ms.toFixed(1).padStart(8)} ms`);
  return { ms, out };
};

const SEQS = [1, 2, 3, 4, 5, 6];
const OPTS = { maxScale: 20 };

for (const composites of [false, true]) {
  console.log(`\n═══ Matières composites : ${composites ? 'OUI (1 sur 5)' : 'non'} ═══`);
  for (const size of [
    { classes: 2, perClass: 50, label: '100 élèves' },
    { classes: 10, perClass: 50, label: '500 élèves' },
    { classes: 20, perClass: 50, label: '1 000 élèves' },
    { classes: 32, perClass: 50, label: '1 600 élèves' },
  ]) {
    const data = makeSchool({ classes: size.classes, perClass: size.perClass, composites });
    const cls = data.classes[0];
    const classStudents = data.students.filter((s) => s.class_id === cls.id);
    const classSubs = data.subjects.filter((s) => s.class_id === cls.id && !s.parent_id);
    const allSubs = data.subjects.filter((s) => s.class_id === cls.id);

    console.log(`\n── ${size.label} (${size.classes} classes × ${size.perClass})`);

    bench('1 moyenne générale (1 élève, 6 séquences)', () =>
      multiAvg(data.gradeMap, cls.id, classStudents[0].id, SEQS, allSubs, 'FR', OPTS), 200);

    bench('classement d\'une classe (buildRanks)', () =>
      buildRanks(classStudents, data.gradeMap, cls.id, SEQS, allSubs, 'FR', {}, OPTS), 20);

    bench('statistiques d\'une classe (clsStat)', () =>
      clsStat(classStudents, data.gradeMap, cls.id, SEQS, allSubs, 'FR', {}, OPTS), 20);

    // Ce que fait la page Relevés pour UNE classe : stats + rangs + un relevé
    // par élève — chacun recalculant les mêmes moyennes.
    bench('page Relevés — une classe entière', () => {
      const stats = clsStat(classStudents, data.gradeMap, cls.id, SEQS, classSubs, 'FR', {}, OPTS);
      return buildClassTranscripts({
        classStudents, cls, subjects: classSubs, gradeMap: data.gradeMap, sys: 'FR',
        cycle: 'secondaire', countryCode: 'cameroon', schoolYear: '2025-2026', stats, opts: OPTS,
      });
    }, 5);

    // Ce que fait un tableau de bord d'établissement : stats de CHAQUE classe.
    bench('tableau de bord — statistiques de tout l\'établissement', () => {
      let n = 0;
      for (const c of data.classes) {
        const studs = data.students.filter((s) => s.class_id === c.id);
        const sbs = data.subjects.filter((s) => s.class_id === c.id);
        clsStat(studs, data.gradeMap, c.id, SEQS, sbs, 'FR', {}, OPTS);
        n += studs.length;
      }
      return n;
    }, 3);
  }
}

// ── Où part le temps ? ───────────────────────────────────────────────────────
console.log('\n═══ Décomposition du coût d\'une moyenne ═══');
{
  const data = makeSchool({ classes: 1, perClass: 1, composites: true });
  const subs = data.subjects.filter((s) => s.class_id === 'c0');
  const g = data.gradeMap['c0_c0_st0_1'];

  bench('resolveScores (résolution des matières composites)', () => resolveScores(g, subs), 20000);
  bench('getAvg (1 séquence, resolveScores compris)', () => getAvg(g, subs, 'FR', OPTS), 20000);
  const { subs: flat } = resolveScores(g, subs);
  bench('getAvg sur des matières déjà résolues', () => getAvg(g, flat, 'FR', OPTS), 20000);
}
