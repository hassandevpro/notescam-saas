// Moteur de modèles académiques — GÉNÉRIQUE (aucune connaissance d'un pays).
//   buildPlan(template)    → aplatit le modèle en lignes prêtes à insérer + compteurs.
//   applyTemplate(plan)    → insertion atomique côté serveur (RPC) + recharge du store.
//
// Atomicité (point #8) : la création passe par le RPC `apply_academic_template`
// (Postgres SECURITY DEFINER côté cloud ; handler transactionnel `tx()` côté LAN).
// En cas d'erreur, AUCUN objet partiel n'est créé (tout dans une transaction).

import { uuid } from './uuid';
import { supabase } from './supabase';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { validateTemplate } from '../templates/validate';

// Construit le plan d'insertion (ids générés côté client pour relier
// matières↔classes et composantes↔matière parente avant tout appel réseau).
export function buildPlan(template, { currentYear = null } = {}) {
  const v = validateTemplate(template);
  if (!v.ok) throw new Error('Modèle invalide : ' + v.errors.join(' ; '));

  const classes = [];
  const subjects = [];
  let parentCount = 0;
  let componentCount = 0;

  for (const cls of template.classes) {
    const classId = uuid();
    classes.push({
      id: classId,
      name: cls.name,
      level: cls.level ?? cls.name,
      section: cls.section ?? null,
      system: cls.system ?? template.defaultSystem ?? 'FR',
      cycle: cls.cycle ?? 'secondaire',
      current_year: currentYear,
      max_students: cls.max_students ?? null,
    });

    let position = 0;
    for (const sub of cls.subjects || []) {
      const subId = uuid();
      const hasComponents = Array.isArray(sub.components) && sub.components.length > 0;
      subjects.push({
        id: subId,
        class_id: classId,
        name: sub.name,
        coef: sub.coef ?? 1,
        max: sub.max ?? 20,
        position: position++,
        parent_id: null,
        calc_method: hasComponents ? (sub.calc_method ?? 'weighted_avg') : null,
        formula: sub.formula ?? null,
      });
      parentCount++;

      // Sous-composantes (Phase 2) — créées comme matières enfants (parent_id).
      for (const comp of sub.components || []) {
        subjects.push({
          id: uuid(),
          class_id: classId,
          name: comp.name,
          coef: comp.coef ?? 1,
          max: comp.max ?? sub.max ?? 20,
          position: position++,
          parent_id: subId,
          calc_method: null,
          formula: null,
        });
        componentCount++;
      }
    }
  }

  const levels = new Set(classes.map((c) => c.level));
  const cycles = new Set(classes.map((c) => c.cycle));
  const series = new Set(classes.map((c) => c.section).filter(Boolean));

  return {
    classes,
    subjects,
    counts: {
      cycles: cycles.size,
      levels: levels.size,
      series: series.size,
      classes: classes.length,
      subjects: parentCount,
      components: componentCount,
      coefficients: parentCount + componentCount,
    },
  };
}

// ── Import / fusion intelligente (Phase 3) ───────────────────────────────────
// Compare un modèle à l'existant de l'école (apparie par nom normalisé) et
// produit un plan de FUSION : classes nouvelles, matières nouvelles (rattachées
// aux classes existantes ou nouvelles), et conflits (coef/max différents). Rien
// n'est écrasé sans choix explicite.
const norm = (s) => (s || '').toString().trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function buildMergePlan(template, existing, { currentYear = null } = {}) {
  const v = validateTemplate(template);
  if (!v.ok) throw new Error('Modèle invalide : ' + v.errors.join(' ; '));
  const exClasses = existing?.classes || [];
  const exSubjects = existing?.subjects || [];

  const exClassByName = new Map(exClasses.map((c) => [norm(c.name), c]));
  const exSubsByClass = new Map(); // classId → Map(normName → subject)
  for (const s of exSubjects) {
    if (!exSubsByClass.has(s.class_id)) exSubsByClass.set(s.class_id, new Map());
    exSubsByClass.get(s.class_id).set(norm(s.name), s);
  }

  const newClasses = [];
  const newSubjects = [];
  const conflicts = []; // { id, name, className, from:{coef,max}, to:{coef,max} }
  const counts = { addedClasses: 0, matchedClasses: 0, addedSubjects: 0, addedComponents: 0, conflicts: 0 };

  for (const cls of template.classes) {
    const exCls = exClassByName.get(norm(cls.name));
    let classId;
    if (exCls) { classId = exCls.id; counts.matchedClasses++; }
    else {
      classId = uuid();
      newClasses.push({
        id: classId, name: cls.name, level: cls.level ?? cls.name, section: cls.section ?? null,
        system: cls.system ?? template.defaultSystem ?? 'FR', cycle: cls.cycle ?? 'secondaire',
        current_year: currentYear, max_students: cls.max_students ?? null,
      });
      counts.addedClasses++;
    }
    const exSubs = exCls ? (exSubsByClass.get(exCls.id) || new Map()) : new Map();
    let position = exSubs.size; // les nouvelles matières s'ajoutent à la suite

    for (const sub of cls.subjects || []) {
      const hasKids = Array.isArray(sub.components) && sub.components.length > 0;
      const exSub = exSubs.get(norm(sub.name));
      let subId;
      if (exSub) {
        subId = exSub.id;
        const coef = sub.coef ?? 1, max = sub.max ?? 20;
        if (Number(exSub.coef) !== Number(coef) || Number(exSub.max) !== Number(max)) {
          conflicts.push({ id: exSub.id, name: sub.name, className: cls.name,
            from: { coef: exSub.coef, max: exSub.max }, to: { coef, max } });
          counts.conflicts++;
        }
      } else {
        subId = uuid();
        newSubjects.push({ id: subId, class_id: classId, name: sub.name, coef: sub.coef ?? 1,
          max: sub.max ?? 20, position: position++, parent_id: null,
          calc_method: hasKids ? (sub.calc_method ?? 'weighted_avg') : null, formula: sub.formula ?? null });
        counts.addedSubjects++;
      }
      for (const comp of sub.components || []) {
        if (exSubs.get(norm(comp.name))) continue; // composante déjà présente
        newSubjects.push({ id: uuid(), class_id: classId, name: comp.name, coef: comp.coef ?? 1,
          max: comp.max ?? sub.max ?? 20, position: position++, parent_id: subId,
          calc_method: null, formula: null });
        counts.addedComponents++;
      }
    }
  }
  return { newClasses, newSubjects, conflicts, counts };
}

// Applique une fusion atomique (insère le nouveau + met à jour les conflits si
// demandé), puis recharge le store.
export async function applyMerge(plan, { updateConflicts = false } = {}) {
  const { schoolId, activeYear } = useSchoolStore.getState();
  if (!schoolId) throw new Error('Établissement introuvable');
  const updates = updateConflicts
    ? plan.conflicts.map((c) => ({ id: c.id, coef: c.to.coef, max: c.to.max }))
    : [];
  if (!plan.newClasses.length && !plan.newSubjects.length && !updates.length) {
    return { classes: 0, subjects: 0, updated: 0 };
  }
  // Année active obligatoire sur les nouvelles classes (cf. applyTemplate).
  const year = activeYear || useAuthStore.getState().school?.current_year || null;
  const newClasses = plan.newClasses.map((c) => ({ ...c, current_year: c.current_year || year }));
  const { data, error } = await supabase.rpc('merge_academic_template', {
    p_school_id: schoolId, p_classes: newClasses, p_subjects: plan.newSubjects, p_updates: updates,
  });
  if (error) { console.error('merge_academic_template RPC error:', error); throw new Error(error.message || error.hint || error.code || 'Échec de la fusion'); }
  const teacherId = useAuthStore.getState().teacherId;
  await useSchoolStore.getState().init(schoolId, activeYear, teacherId);
  return data;
}

// Applique le plan de façon atomique côté serveur, puis recharge le store.
export async function applyTemplate(plan) {
  const { schoolId, activeYear } = useSchoolStore.getState();
  if (!schoolId) throw new Error('Établissement introuvable');
  if (!plan?.classes?.length) throw new Error('Plan vide');

  // Les classes DOIVENT porter l'année active : le chargement filtre par
  // current_year (fetchClasses) → sans cela, les classes créées sont invisibles.
  const year = activeYear || useAuthStore.getState().school?.current_year || null;
  const classes = plan.classes.map((c) => ({ ...c, current_year: c.current_year || year }));

  const { data, error } = await supabase.rpc('apply_academic_template', {
    p_school_id: schoolId,
    p_classes: classes,
    p_subjects: plan.subjects,
  });
  if (error) { console.error('apply_academic_template RPC error:', error); throw new Error(error.message || error.hint || error.code || 'Échec de la génération'); }

  // Rechargement complet (classes + matières) — cohérence offline-first.
  const teacherId = useAuthStore.getState().teacherId;
  await useSchoolStore.getState().init(schoolId, activeYear, teacherId);
  return data;
}
