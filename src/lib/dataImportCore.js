// Cœur PUR du moteur d'import (aucune dépendance IDB/réseau/DOM).
//
// Sépare la logique métier (validation + transformation pivot → enregistrements
// NotesCam, résolution des clés étrangères) de l'IO (IndexedDB + syncQueue, dans
// dataImport.js). Ainsi cette partie est testable en Node hors navigateur.
//
// Voir l'en-tête de dataImport.js pour le FORMAT PIVOT v1 documenté.

export const uuid = () =>
  (globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`);

// Normalisation pour rapprocher les clés naturelles (accents, casse, espaces).
export const norm = (s) =>
  String(s ?? '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');

const GENDER_MAP = {
  m: 'Masculin', masculin: 'Masculin', male: 'Masculin', garcon: 'Masculin', h: 'Masculin', homme: 'Masculin',
  f: 'Feminin', feminin: 'Feminin', female: 'Feminin', fille: 'Feminin', femme: 'Feminin',
};
export const mapGender = (g) => (g ? (GENDER_MAP[norm(g)] ?? g) : null);

export const gradeKey = (classId, studentId, sequence) => `${classId}_${studentId}_${sequence}`;

// ─────────────────────────────────────────────────────────────────────────────
// Validation / aperçu (« dry run ») : à appeler AVANT importBundle pour montrer
// à l'admin ce qui sera créé et bloquer un fichier malformé.
// ─────────────────────────────────────────────────────────────────────────────
export function validateBundle(bundle) {
  const errors = [];
  const warnings = [];
  const stats = { years: 0, classes: 0, subjects: 0, students: 0, grades: 0, fees: 0, payments: 0, teachers: 0 };

  if (!bundle || typeof bundle !== 'object') {
    return { ok: false, errors: ['Fichier vide ou illisible.'], warnings, stats };
  }
  if (bundle.format && bundle.format !== 'notescam-import/v1') {
    warnings.push(`Format inconnu « ${bundle.format} » — tentative en v1.`);
  }
  if (Array.isArray(bundle.teachers)) {
    stats.teachers = bundle.teachers.filter((t) => t && (t.name || t.email)).length;
  }
  if (!Array.isArray(bundle.years) || bundle.years.length === 0) {
    errors.push('Aucune année à importer (`years` manquant ou vide).');
    return { ok: false, errors, warnings, stats };
  }

  for (const [yi, year] of bundle.years.entries()) {
    if (!year?.year) { errors.push(`years[${yi}] : champ \`year\` manquant.`); continue; }
    stats.years++;
    const classes = Array.isArray(year.classes) ? year.classes : [];
    if (!classes.length) warnings.push(`Année ${year.year} : aucune classe.`);

    for (const [ci, cls] of classes.entries()) {
      const where = `${year.year} › classes[${ci}]`;
      if (!cls?.name) { errors.push(`${where} : nom de classe manquant.`); continue; }
      stats.classes++;

      const subjNames = new Set((cls.subjects || []).map((s) => norm(s?.name)).filter(Boolean));
      stats.subjects += subjNames.size;

      for (const st of cls.students || []) {
        if (!st?.name) { errors.push(`${where} › un élève sans nom.`); continue; }
        stats.students++;
        for (const g of st.grades || []) {
          if (g?.sequence == null || g?.subject == null || g?.value == null) {
            warnings.push(`${where} › ${st.name} : note incomplète ignorée.`);
            continue;
          }
          if (!subjNames.has(norm(g.subject))) {
            warnings.push(`${where} › ${st.name} : matière « ${g.subject} » absente de la classe → créée automatiquement.`);
          }
          stats.grades++;
        }
        if (st.fees && (st.fees.frais_annuels != null || st.fees.frais_payes != null)) stats.fees++;
        if (Array.isArray(st.fees?.payments)) stats.payments += st.fees.payments.length;
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings, stats };
}

// ─────────────────────────────────────────────────────────────────────────────
// Transformation pivot → enregistrements NotesCam, avec résolution des clés
// étrangères et idempotence par clé naturelle.
//
// @param {object} bundle    format pivot v1 (supposé déjà validé)
// @param {string} schoolId  école cible
// @param {object} existing  lignes déjà en base, pour réutiliser les ids :
//   { classes:[], subjects:[], students:[], fees:[], teachers:[] }
// @returns {{ out, reused, warnings }}
//   out = { classes, subjects, students, grades, teachers, fees, payments }
// ─────────────────────────────────────────────────────────────────────────────
export function buildImportRecords(bundle, schoolId, existing = {}) {
  const { warnings } = validateBundle(bundle);
  const mine = (r) => r.school_id === schoolId;

  const classByKey   = new Map();
  for (const c of (existing.classes || []).filter(mine)) classByKey.set(`${c.current_year}::${norm(c.name)}`, c.id);
  const subjectByKey = new Map();
  for (const s of (existing.subjects || []).filter(mine)) subjectByKey.set(`${s.class_id}::${norm(s.name)}`, s.id);
  const studentByKey = new Map();
  for (const s of (existing.students || []).filter(mine)) studentByKey.set(`${s.class_id}::${norm(s.matricule || s.name)}`, s.id);
  const feeByKey     = new Map();
  for (const f of (existing.fees || []).filter(mine)) feeByKey.set(`${f.student_id}::${f.academic_year}`, f.id);
  // fee_payments n'a pas de clé naturelle unique en base → on dédoublonne par
  // signature (élève+année+montant+date+note) pour rester idempotent au ré-import.
  const paymentSig = (p) => `${p.student_id}::${p.academic_year}::${p.amount}::${p.date || ''}::${p.note || ''}`;
  const seenPayments = new Set();
  for (const p of (existing.payments || []).filter(mine)) seenPayments.add(paymentSig(p));

  const teacherByKey = new Map();
  for (const t of (existing.teachers || []).filter(mine)) {
    if (t.email) teacherByKey.set(`e:${norm(t.email)}`, t.id);
    if (t.name)  teacherByKey.set(`n:${norm(t.name)}`, t.id);
  }
  const resolveTeacher = (ref) =>
    ref ? (teacherByKey.get(`e:${norm(ref)}`) || teacherByKey.get(`n:${norm(ref)}`) || null) : null;

  const out = { classes: [], subjects: [], students: [], grades: [], teachers: [], fees: [], payments: [] };
  const reused = { classes: 0, subjects: 0, students: 0 };

  // Personnel (top-level)
  for (const t of bundle.teachers || []) {
    if (!t || (!t.name && !t.email)) continue;
    if (resolveTeacher(t.email) || resolveTeacher(t.name)) continue;
    const rec = { id: uuid(), school_id: schoolId, name: t.name || t.email, email: t.email || null, phone: t.phone || null, specialty: t.specialty || null, active: 1 };
    out.teachers.push(rec);
    if (rec.email) teacherByKey.set(`e:${norm(rec.email)}`, rec.id);
    teacherByKey.set(`n:${norm(rec.name)}`, rec.id);
  }

  for (const year of bundle.years || []) {
    for (const cls of year.classes || []) {
      if (!cls?.name) continue;

      const cKey = `${year.year}::${norm(cls.name)}`;
      let classId = classByKey.get(cKey);
      if (classId) { reused.classes++; }
      else {
        classId = uuid();
        classByKey.set(cKey, classId);
        out.classes.push({
          id: classId, school_id: schoolId, name: cls.name,
          level: cls.level ?? null, section: cls.section ?? null,
          system: cls.system || 'FR', current_year: year.year,
          teacher_id: resolveTeacher(cls.teacher) || null,
        });
      }

      const subjIdByName = new Map();
      for (const sub of cls.subjects || []) {
        if (!sub?.name) continue;
        const sKey = `${classId}::${norm(sub.name)}`;
        let subId = subjectByKey.get(sKey);
        if (subId) { reused.subjects++; }
        else {
          subId = uuid();
          subjectByKey.set(sKey, subId);
          out.subjects.push({ id: subId, school_id: schoolId, class_id: classId, name: sub.name, coef: sub.coef ?? 1, max: sub.max ?? 20 });
        }
        subjIdByName.set(norm(sub.name), subId);
      }
      const ensureSubject = (name) => {
        const key = norm(name);
        if (subjIdByName.has(key)) return subjIdByName.get(key);
        const subId = uuid();
        subjectByKey.set(`${classId}::${key}`, subId);
        subjIdByName.set(key, subId);
        out.subjects.push({ id: subId, school_id: schoolId, class_id: classId, name, coef: 1, max: 20 });
        return subId;
      };

      for (const st of cls.students || []) {
        if (!st?.name) continue;
        const stKey = `${classId}::${norm(st.matricule || st.name)}`;
        let studentId = studentByKey.get(stKey);
        if (studentId) { reused.students++; }
        else {
          studentId = uuid();
          studentByKey.set(stKey, studentId);
          out.students.push({
            id: studentId, school_id: schoolId, class_id: classId,
            name: st.name, matricule: st.matricule ?? null,
            gender: mapGender(st.gender), statut: st.statut ?? null,
            date_naissance: st.date_naissance ?? null,
          });
        }

        const bySeq = new Map();
        for (const g of st.grades || []) {
          if (g?.sequence == null || g?.subject == null || g?.value == null) continue;
          const seq = Number(g.sequence);
          if (!bySeq.has(seq)) bySeq.set(seq, {});
          bySeq.get(seq)[ensureSubject(g.subject)] = String(g.value);
        }
        for (const [seq, scores] of bySeq) {
          out.grades.push({ key: gradeKey(classId, studentId, seq), class_id: classId, student_id: studentId, sequence: seq, school_id: schoolId, scores });
        }

        if (st.fees && (st.fees.frais_annuels != null || st.fees.frais_payes != null || (st.fees.payments || []).length)) {
          const fKey = `${studentId}::${year.year}`;
          const feeId = feeByKey.get(fKey) || uuid();
          feeByKey.set(fKey, feeId);
          out.fees.push({
            id: feeId, school_id: schoolId, student_id: studentId, academic_year: year.year,
            frais_annuels: st.fees.frais_annuels ?? 0,
            frais_payes:   st.fees.frais_payes ?? (st.fees.payments || []).reduce((n, p) => n + (parseInt(p.amount, 10) || 0), 0),
            date_dernier_paiement: st.fees.date_dernier_paiement ?? null,
            notes: st.fees.notes ?? null,
          });
          for (const p of st.fees.payments || []) {
            const amount = parseInt(p.amount, 10) || 0;
            if (!amount) continue;
            const rec = { id: uuid(), school_id: schoolId, student_id: studentId, academic_year: year.year, amount, date: p.date ?? null, note: p.note ?? '', created_at: new Date().toISOString() };
            const sig = paymentSig(rec);
            if (seenPayments.has(sig)) continue;   // déjà importé → pas de doublon
            seenPayments.add(sig);
            out.payments.push(rec);
          }
        }
      }
    }
  }

  return { out, reused, warnings };
}
