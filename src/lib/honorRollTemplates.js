// ─────────────────────────────────────────────────────────────────────────────
// MODÈLES DE TABLEAUX D'HONNEUR — stockage + presets.
// ─────────────────────────────────────────────────────────────────────────────
// Un modèle est PUREMENT de la donnée (aucun code). Ajouter / modifier / dupliquer
// un tableau = manipuler ces objets. Persistance locale par école (localStorage),
// migrable vers une colonne `schools.honor_roll_templates` (JSON) sans changer l'UI.
//
// Schéma d'un modèle :
//   { id, name, builtin?, active,
//     layout: 'table' | 'certificate' | 'poster',
//     scope:  'school' | 'class' | 'level' | 'gender' | 'subject',
//     sort:   'score' | 'conduite' | 'absNJ',
//     limit:  number | null,
//     subjectName?: string,            // scope=subject (vide = toutes matières)
//     filters: { minAvgPct?, maxRank?, gender?, classIds?, levels?, conduiteMin?, maxAbsNJ?, mentionIn? },
//     personalization: { title, primaryColor, introText, congratsText, specialMention, columns[], orientation } }

import { uuid } from './uuid';

const KEY = (schoolId) => `nc_honor_templates_${schoolId || 'default'}`;

const DEFAULT_PERSO = {
  title: '', primaryColor: '#7c2d12', introText: '', congratsText: '',
  specialMention: '', columns: ['rank', 'name', 'class', 'avg', 'mention'], orientation: 'portrait',
};

// 11 modèles standard couvrant tous les types demandés. Servent de point de
// départ : l'utilisateur les édite/duplique librement.
export function presetTemplates() {
  const p = (over) => ({ ...DEFAULT_PERSO, ...over });
  const mk = (o) => ({ id: uuid(), builtin: true, active: true, layout: 'table', scope: 'school', sort: 'score', limit: null, filters: {}, personalization: DEFAULT_PERSO, ...o });
  return [
    mk({ name: "Tableau d'honneur général", scope: 'school', limit: 10,
         personalization: p({ title: "Tableau d'honneur général" }) }),
    mk({ name: "Tableau d'honneur par classe", scope: 'class', limit: null,
         personalization: p({ title: "Tableau d'honneur" }) }),
    mk({ name: "Tableau d'honneur par niveau", scope: 'level', limit: 10,
         personalization: p({ title: "Tableau d'honneur" }) }),
    mk({ name: "Tableau d'excellence", scope: 'school', limit: 15, layout: 'poster',
         filters: { minAvgPct: 80 },
         personalization: p({ title: "Tableau d'excellence", primaryColor: '#1d4ed8', introText: 'Moyenne ≥ 80 % du barème.' }) }),
    mk({ name: 'Tableau des majors', scope: 'class', limit: 1, layout: 'certificate',
         filters: { maxRank: 1 },
         personalization: p({ title: 'Major de la classe', primaryColor: '#b45309' }) }),
    mk({ name: 'Meilleurs garçons', scope: 'school', limit: 10, filters: { gender: 'M' },
         personalization: p({ title: 'Meilleurs garçons', primaryColor: '#0369a1' }) }),
    mk({ name: 'Meilleures filles', scope: 'school', limit: 10, filters: { gender: 'F' },
         personalization: p({ title: 'Meilleures filles', primaryColor: '#be185d' }) }),
    mk({ name: 'Élèves méritants', scope: 'school', limit: 20, filters: { minAvgPct: 70 },
         personalization: p({ title: 'Élèves méritants', primaryColor: '#15803d' }) }),
    mk({ name: 'Élèves disciplinés', scope: 'school', limit: 20, sort: 'conduite',
         filters: { conduiteMin: 16, maxAbsNJ: 0 },
         personalization: p({ title: 'Élèves disciplinés', primaryColor: '#7c3aed', columns: ['rank', 'name', 'class', 'conduite', 'absNJ'] }) }),
    mk({ name: 'Meilleurs résultats par matière', scope: 'subject', limit: 3,
         personalization: p({ title: 'Meilleurs par matière', columns: ['rank', 'name', 'class', 'avg'] }) }),
    mk({ name: "Diplôme d'excellence (paysage)", scope: 'class', limit: 3, layout: 'diploma',
         personalization: p({ title: "DIPLÔME D'EXCELLENCE", primaryColor: '#16235b', orientation: 'landscape',
           specialMention: '' }) }),
    mk({ name: 'Tableau personnalisé', scope: 'school', limit: 10, active: false,
         personalization: p({ title: 'Tableau personnalisé' }) }),
  ];
}

export function listTemplates(schoolId) {
  let stored = null;
  try {
    const raw = localStorage.getItem(KEY(schoolId));
    if (raw) stored = JSON.parse(raw);
  } catch {}
  if (!stored) {
    const seeded = presetTemplates();
    saveAll(schoolId, seeded);
    return seeded;
  }
  // Fusion : ajoute les nouveaux presets standard absents (par nom), sans
  // dupliquer ni écraser les modèles déjà présents/personnalisés de l'école.
  const names = new Set(stored.map((x) => x.name));
  const missing = presetTemplates().filter((p) => !names.has(p.name));
  if (missing.length) {
    stored = [...stored, ...missing];
    saveAll(schoolId, stored);
  }
  return stored;
}

function saveAll(schoolId, list) {
  try { localStorage.setItem(KEY(schoolId), JSON.stringify(list)); } catch {}
  return list;
}

export function upsertTemplate(schoolId, tpl) {
  const list = listTemplates(schoolId);
  const idx = list.findIndex((x) => x.id === tpl.id);
  const clean = { ...tpl, builtin: idx >= 0 ? list[idx].builtin && sameShape(list[idx], tpl) : false };
  if (idx >= 0) list[idx] = clean; else list.push({ ...clean, id: clean.id || uuid() });
  return saveAll(schoolId, list);
}

// Un modèle natif édité reste « builtin » seulement si on n'a rien changé ; sinon
// il devient personnalisé (on garde l'historique simple).
function sameShape() { return false; }

export function duplicateTemplate(schoolId, id) {
  const list = listTemplates(schoolId);
  const src = list.find((x) => x.id === id);
  if (!src) return list;
  const copy = { ...JSON.parse(JSON.stringify(src)), id: uuid(), builtin: false, active: true,
    name: `${src.name} (copie)` };
  list.push(copy);
  return saveAll(schoolId, list);
}

export function toggleTemplate(schoolId, id) {
  const list = listTemplates(schoolId).map((x) => x.id === id ? { ...x, active: !x.active } : x);
  return saveAll(schoolId, list);
}

export function deleteTemplate(schoolId, id) {
  const list = listTemplates(schoolId).filter((x) => x.id !== id);
  return saveAll(schoolId, list);
}

export function blankTemplate() {
  return {
    id: uuid(), builtin: false, active: true, layout: 'table', scope: 'school',
    sort: 'score', limit: 10, filters: {}, personalization: { ...DEFAULT_PERSO, title: 'Nouveau tableau' },
  };
}

export const LAYOUTS = [
  { value: 'table',       fr: 'Tableau collectif', en: 'Collective table', es: 'Tabla colectiva' },
  { value: 'diploma',     fr: "Diplôme d'excellence (paysage)", en: 'Excellence diploma (landscape)', es: 'Diploma de excelencia' },
  { value: 'certificate', fr: 'Certificat individuel', en: 'Individual certificate', es: 'Certificado individual' },
  { value: 'poster',      fr: 'Affiche murale', en: 'Wall poster', es: 'Cartel mural' },
];
export const SCOPES = [
  { value: 'school',  fr: 'Établissement', en: 'Whole school', es: 'Centro' },
  { value: 'class',   fr: 'Par classe', en: 'By class', es: 'Por clase' },
  { value: 'level',   fr: 'Par niveau', en: 'By level', es: 'Por nivel' },
  { value: 'gender',  fr: 'Par sexe', en: 'By gender', es: 'Por sexo' },
  { value: 'subject', fr: 'Par matière', en: 'By subject', es: 'Por asignatura' },
];
export const ALL_COLUMNS = ['rank', 'photo', 'name', 'class', 'avg', 'mention', 'conduite', 'gender'];
