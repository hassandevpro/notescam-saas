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

// Nom d'un membre du personnel : `name` explicite, sinon composé prénom + nom.
export const staffName = (s) => (s?.name || [s?.first_name, s?.last_name].filter(Boolean).join(' ').trim() || '').trim();

// ─────────────────────────────────────────────────────────────────────────────
// Validation / aperçu (« dry run ») : à appeler AVANT importBundle pour montrer
// à l'admin ce qui sera créé et bloquer un fichier malformé.
// ─────────────────────────────────────────────────────────────────────────────
export function validateBundle(bundle) {
  const errors = [];
  const warnings = [];
  const stats = { years: 0, classes: 0, subjects: 0, students: 0, grades: 0, fees: 0, payments: 0, teachers: 0, staff: 0, feeCatalog: 0, assets: 0 };

  if (!bundle || typeof bundle !== 'object') {
    return { ok: false, errors: ['Fichier vide ou illisible.'], warnings, stats };
  }
  if (bundle.format && bundle.format !== 'notescam-import/v1') {
    warnings.push(`Format inconnu « ${bundle.format} » — tentative en v1.`);
  }
  if (Array.isArray(bundle.teachers)) {
    stats.teachers = bundle.teachers.filter((t) => t && (t.name || t.email)).length;
  }
  // Nouveaux modules (reprise depuis un AUTRE logiciel) : personnel, catalogue de
  // frais, immobilisations. Indépendants des années → un bundle peut n'en contenir
  // que ceux-là (import purement « personnel » sans historique de notes).
  if (Array.isArray(bundle.staff)) {
    for (const s of bundle.staff) {
      if (staffName(s)) stats.staff++;
      else warnings.push('Un membre du personnel sans nom ignoré.');
    }
  }
  if (Array.isArray(bundle.fee_catalog)) stats.feeCatalog = bundle.fee_catalog.filter((f) => f && f.name).length;
  if (Array.isArray(bundle.assets))      stats.assets     = bundle.assets.filter((a) => a && a.name).length;

  const hasYears   = Array.isArray(bundle.years) && bundle.years.length > 0;
  const hasModules = stats.staff > 0 || stats.feeCatalog > 0 || stats.assets > 0
    || (Array.isArray(bundle.teachers) && bundle.teachers.length > 0);
  if (!hasYears && !hasModules) {
    errors.push('Rien à importer (`years`, `staff`, `fee_catalog` ou `assets` requis).');
    return { ok: false, errors, warnings, stats };
  }

  for (const [yi, year] of (hasYears ? bundle.years : []).entries()) {
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

  const out = { classes: [], subjects: [], students: [], grades: [], teachers: [], fees: [], payments: [],
    staff: [], hr_contracts: [], hr_leaves: [], hr_career_events: [], fee_catalog: [], assets: [] };
  const reused = { classes: 0, subjects: 0, students: 0, staff: 0, feeCatalog: 0, assets: 0 };

  // Personnel (top-level)
  for (const t of bundle.teachers || []) {
    if (!t || (!t.name && !t.email)) continue;
    if (resolveTeacher(t.email) || resolveTeacher(t.name)) continue;
    const rec = { id: uuid(), school_id: schoolId, name: t.name || t.email, email: t.email || null, phone: t.phone || null, specialty: t.specialty || null, active: 1 };
    out.teachers.push(rec);
    if (rec.email) teacherByKey.set(`e:${norm(rec.email)}`, rec.id);
    teacherByKey.set(`n:${norm(rec.name)}`, rec.id);
  }

  // ── NOUVEAUX MODULES (reprise depuis un autre logiciel), tous top-level ──
  // Idempotence par clé naturelle (comme classes/élèves) : matricule||nom pour le
  // personnel, année+nom pour le catalogue de frais, n°||nom pour un actif.
  buildStaffRecords(bundle, schoolId, existing, out, reused);
  buildFeeCatalogRecords(bundle, schoolId, existing, out, reused);
  buildAssetRecords(bundle, schoolId, existing, out, reused);

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

// ─────────────────────────────────────────────────────────────────────────────
// Builders des NOUVEAUX MODULES (personnel/RH, catalogue de frais, immobilisations).
// Alimentés depuis un autre logiciel via des sections top-level du bundle pivot.
// Chacun est idempotent par clé naturelle (réutilise l'id existant, 0 doublon).
// ─────────────────────────────────────────────────────────────────────────────
function buildStaffRecords(bundle, schoolId, existing, out, reused) {
  const mine = (r) => r.school_id === schoolId;
  const staffByKey = new Map();
  for (const s of (existing.staff || []).filter(mine)) staffByKey.set(norm(s.matricule || s.name), s.id);
  // Signatures pour dédoublonner les satellites RH (aucune clé naturelle en base).
  const cSig = (r) => `${r.staff_id}::${norm(r.type)}::${r.start_date || ''}::${norm(r.reference || '')}`;
  const lSig = (r) => `${r.staff_id}::${norm(r.type)}::${r.start_date || ''}::${r.end_date || ''}`;
  const eSig = (r) => `${r.staff_id}::${r.event_date || ''}::${norm(r.type)}::${norm(r.title || '')}`;
  const seenContract = new Set((existing.hr_contracts || []).filter(mine).map(cSig));
  const seenLeave    = new Set((existing.hr_leaves || []).filter(mine).map(lSig));
  const seenCareer   = new Set((existing.hr_career_events || []).filter(mine).map(eSig));

  for (const s of bundle.staff || []) {
    const name = staffName(s);
    if (!name) continue;
    const key = norm(s.matricule || name);
    let staffId = staffByKey.get(key);
    if (staffId) { reused.staff++; }
    else {
      staffId = uuid();
      staffByKey.set(key, staffId);
      out.staff.push({
        id: staffId, school_id: schoolId, name,
        first_name: s.first_name ?? null, last_name: s.last_name ?? null,
        matricule: s.matricule ?? null, gender: mapGender(s.gender),
        phone: s.phone ?? null, email: s.email ?? null, address: s.address ?? null,
        fonction: s.fonction ?? s.role ?? null,
        department: s.department ?? 'administration',
        hire_date: s.hire_date ?? null, status: s.status ?? null, active: 1,
      });
    }
    for (const c of s.contracts || []) {
      const rec = { id: uuid(), school_id: schoolId, staff_id: staffId, type: c.type || 'cdi', reference: c.reference ?? null, title: c.title ?? null, start_date: c.start_date ?? null, end_date: c.end_date ?? null, salary: c.salary ?? null, status: c.status || 'active', notes: c.notes ?? null };
      if (seenContract.has(cSig(rec))) continue; seenContract.add(cSig(rec)); out.hr_contracts.push(rec);
    }
    for (const l of s.leaves || []) {
      const rec = { id: uuid(), school_id: schoolId, staff_id: staffId, type: l.type || 'annuel', start_date: l.start_date ?? null, end_date: l.end_date ?? null, days: l.days ?? null, reason: l.reason ?? null, status: l.status || 'pending', notes: l.notes ?? null };
      if (seenLeave.has(lSig(rec))) continue; seenLeave.add(lSig(rec)); out.hr_leaves.push(rec);
    }
    for (const e of s.career_events || []) {
      const rec = { id: uuid(), school_id: schoolId, staff_id: staffId, event_date: e.event_date ?? null, type: e.type || 'autre', title: e.title ?? null, description: e.description ?? null };
      if (seenCareer.has(eSig(rec))) continue; seenCareer.add(eSig(rec)); out.hr_career_events.push(rec);
    }
  }
}

function buildFeeCatalogRecords(bundle, schoolId, existing, out, reused) {
  const mine = (r) => r.school_id === schoolId;
  const byKey = new Map();
  for (const f of (existing.feeCatalog || []).filter(mine)) byKey.set(`${f.academic_year || ''}::${norm(f.name)}`, f.id);
  for (const f of bundle.fee_catalog || []) {
    if (!f || !f.name) continue;
    const key = `${f.academic_year || ''}::${norm(f.name)}`;
    if (byKey.has(key)) { reused.feeCatalog++; continue; }
    const id = uuid();
    byKey.set(key, id);
    out.fee_catalog.push({
      id, school_id: schoolId, name: f.name, category: f.category || 'autre',
      amount: parseInt(f.amount, 10) || 0, academic_year: f.academic_year ?? null, level: f.level ?? null,
      mandatory: f.mandatory ? 1 : 0, optional: f.optional == null ? 1 : (f.optional ? 1 : 0),
      payment_type: f.payment_type || 'unique', active: 1, position: 0, notes: f.notes ?? null,
    });
  }
}

function buildAssetRecords(bundle, schoolId, existing, out, reused) {
  const mine = (r) => r.school_id === schoolId;
  const byKey = new Map();
  for (const a of (existing.assets || []).filter(mine)) byKey.set(norm(a.asset_number || a.name), a.id);
  for (const a of bundle.assets || []) {
    if (!a || !a.name) continue;
    const key = norm(a.asset_number || a.name);
    if (byKey.has(key)) { reused.assets++; continue; }
    const id = uuid();
    byKey.set(key, id);
    out.assets.push({
      id, school_id: schoolId, name: a.name, category: a.category || 'mobilier',
      asset_number: a.asset_number ?? null, value: a.value == null ? null : (parseInt(a.value, 10) || 0),
      acquisition_date: a.acquisition_date ?? null, status: a.status || 'active',
      location: a.location ?? null, serial_number: a.serial_number ?? null, notes: a.notes ?? null,
    });
  }
}
