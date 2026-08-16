// ─────────────────────────────────────────────────────────────────────────────
// SOCLE D'IMPRESSION — fixtures et utilitaires de test.
// ─────────────────────────────────────────────────────────────────────────────
// Jeux de données représentatifs des cas qui cassent réellement un document :
// un élève sans moyenne, une classe à quarante matières, des appréciations
// interminables, un établissement sans logo ni cachet. Utilisés par
// `scripts/test-print.mjs` (Playwright) — jamais importés par l'application, ce
// module ne part donc pas dans le bundle.

import { pageMetrics, DEFAULT_PROFILE } from './printStyles';
import { auditDocument, checkParts } from './printValidation';

// PNG 1×1 gris — tient lieu de logo, de signature et de cachet dans les tests.
export const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export function fixtureSchool(over = {}) {
  return {
    id: 'ab12cd34-0000-4000-8000-000000000001',
    name: 'Collège Bilingue La Retraite',
    address: '1234 Yaoundé',
    phone: '+237 6 99 00 11 22',
    current_year: '2025-2026',
    director: 'M. NGOUNOU Jean-Pierre',
    logo_url: PIXEL, signature_url: PIXEL, stamp_url: PIXEL,
    country: 'cameroon', bulletin_font: 'arial', grade_scale: null,
    ...over,
  };
}

export function fixtureClass(over = {}) {
  return { id: 'c1', name: '3e Allemand', level: '3e', system: 'FR', cycle: 'secondaire', ...over };
}

export function fixtureStudents(n = 1) {
  const names = [
    'MBALLA ONANA Marie-Josée Épiphanie', 'TCHOUTA Paul', 'NGO BAYIHA Léonie Christelle',
    'FOTSO KAMGA Jean-Baptiste Aurélien', 'ABANDA Sarah', 'EYENGA MVONDO Thérèse',
  ];
  return Array.from({ length: n }, (_, i) => ({
    id: `st${i + 1}`,
    class_id: 'c1',
    name: names[i % names.length] + (i >= names.length ? ` (${i + 1})` : ''),
    matricule: `MAT-2025-${String(i + 1).padStart(4, '0')}`,
    date_naissance: '12/03/2009',
    lieu_naissance: 'Douala',
  }));
}

/**
 * @param {number} n
 * @param {'court'|'long'} [style]  longueur des libellés de matière
 */
export function fixtureSubjects(n = 14, style = 'long') {
  const short = ['Maths', 'Français', 'Anglais', 'SVT', 'Physique', 'Chimie', 'Histoire', 'Géographie', 'EPS', 'Informatique'];
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    class_id: 'c1',
    name: style === 'court'
      ? short[i % short.length] + (i >= short.length ? ` ${i + 1}` : '')
      : `Éducation à la citoyenneté et à la vie sociale — module ${i + 1}`,
    coef: (i % 4) + 1,
    max: 20,
    position: i,
  }));
}

/**
 * Notes de `students` × `subjects` sur `seqs` séquences.
 * `mode` : 'complet' | 'sans-moyenne' (aucune note) | 'partiel' (une séquence).
 */
export function fixtureGradeMap(students, subjects, { classId = 'c1', seqs = 6, mode = 'complet' } = {}) {
  const gm = {};
  for (const st of students) {
    for (let seq = 1; seq <= seqs; seq++) {
      const key = `${classId}_${st.id}_${seq}`;
      gm[key] = {};
      if (mode === 'sans-moyenne') continue;
      if (mode === 'partiel' && seq > 1) continue;
      subjects.forEach((s, i) => { gm[key][s.id] = String((8 + ((i + seq) % 11)).toFixed(2)); });
    }
  }
  return gm;
}

/** Statistiques de classe plausibles. */
export const fixtureStats = () => ({ min: 8.2, max: 17.4, avg: 12.6, total: 48 });

// ── Catalogue de non-régression ──────────────────────────────────────────────
// Chaque entrée décrit un document à produire et le nombre de pages attendu.
// Ces nombres ne sont pas des vœux : ils encodent la CAPACITÉ MESURÉE de la mise
// en page actuelle (scripts/print-capacity.mjs). Sur le profil « standard »
// (A4 portrait, marges 12 mm, zone utile 186 × 273 mm) :
//
//   · libellés de matière courts (1 ligne)  → 23 matières par page
//   · libellés longs (2 lignes)             → 18 matières par page
//
// Si une modification du moteur fait bouger ces nombres, le test échoue : c'est
// le signal qu'on a gagné ou perdu de la place, et il faut le décider, pas le
// subir. Ajouter un cas = ajouter une ligne.
export const FIXTURES = [
  { key: 'eleve-normal',        subjects: 14, style: 'long',  mode: 'complet',      pages: 1, parts: ['logo', 'qr', 'signature', 'title'] },
  { key: 'matieres-8',          subjects: 8,  style: 'court', mode: 'complet',      pages: 1 },
  { key: 'capacite-23',         subjects: 23, style: 'court', mode: 'complet',      pages: 1 },
  { key: 'capacite-24',         subjects: 24, style: 'court', mode: 'complet',      pages: 2 },
  { key: 'matieres-22',         subjects: 22, style: 'long',  mode: 'complet',      pages: 2 },
  { key: 'matieres-24',         subjects: 24, style: 'long',  mode: 'complet',      pages: 2 },
  { key: 'matieres-25',         subjects: 25, style: 'long',  mode: 'complet',      pages: 2 },
  { key: 'matieres-27',         subjects: 27, style: 'long',  mode: 'complet',      pages: 2 },
  { key: 'matieres-30',         subjects: 30, style: 'long',  mode: 'complet',      pages: 2 },
  { key: 'matieres-35',         subjects: 35, style: 'long',  mode: 'complet',      pages: 2 },
  { key: 'matieres-40',         subjects: 40, style: 'long',  mode: 'complet',      pages: 2 },
  { key: 'eleve-sans-moyenne',  subjects: 12, style: 'long',  mode: 'sans-moyenne', pages: 1 },
  { key: 'notes-partielles',    subjects: 12, style: 'long',  mode: 'partiel',      pages: 1 },
  { key: 'sans-logo-ni-cachet', subjects: 12, style: 'long',  mode: 'complet',      pages: 1, school: { logo_url: null, stamp_url: null, signature_url: null } },
];

/** Contrôles indépendants du rendu, exécutables sans navigateur. */
export function staticChecks(html, required = []) {
  return { audit: auditDocument(html), parts: checkParts(html, required) };
}

/** Géométrie attendue d'une page, pour les assertions du script de test. */
export const expectedGeometry = (profile = DEFAULT_PROFILE) => pageMetrics(profile);

export default { fixtureSchool, fixtureClass, fixtureStudents, fixtureSubjects, fixtureGradeMap, FIXTURES };
