// Primitives de saisie de notes — partagées entre l'écran « enseignant
// principal » (Grades.jsx) et le poste « enseignant de matière »
// (SubjectTeacherWorkspace). Aucune dépendance UI : fonctions pures.

import { getAppreciation } from '../core/bulletinEngine';

// Valide une note brute saisie. Retourne :
//   ''      → cellule vidée
//   'ABS'   → absent
//   '12.5'  → valeur normalisée (string, arrondie au centième)
//   null    → invalide (hors 0..max) → l'appelant rejette la saisie
export function validateGrade(raw, max) {
  const v = String(raw).trim().toUpperCase();
  if (v === '' || v === '-') return '';
  if (v === 'ABS') return 'ABS';
  const n = parseFloat(v.replace(',', '.'));
  if (isNaN(n) || n < 0 || n > max) return null;
  return String(Math.round(n * 100) / 100);
}

// Classe Tailwind de couleur selon la réussite (seuil = moitié du barème).
export function gradeColor(val, max, sys) {
  if (!val || val === '') return 'text-gray-300';
  if (val === 'ABS') return 'text-gray-400 italic';
  const n = parseFloat(val);
  const pass =
    sys === 'ES' ? (5 / 10) * max
    : sys === 'FR' ? (10 / 20) * max
    : 50;
  return n >= pass ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold';
}

// Observation auto-dérivée d'une note (jamais stockée — cohérent avec les
// bulletins, qui calculent l'appréciation par matière à la volée). Met la note
// à l'échelle d'appréciation (FR /20, EN /100, ES = barème école) puis lit la
// mention via getAppreciation. Retourne { text, col } ou null si pas de note.
export function observationFor(value, max, sys, gradeScale, maxScale = 10) {
  if (value === undefined || value === null || value === '') return null;
  if (value === 'ABS') return { text: 'Absent', col: '#9ca3af' };
  const n = parseFloat(value);
  if (isNaN(n)) return null;
  const scaled =
    sys === 'FR' ? (n / max) * 20
    : sys === 'EN' ? (n / max) * 100
    : n; // ES : déjà sur le barème de l'école
  const appr = getAppreciation(scaled, gradeScale, sys, maxScale);
  const text = appr?.text ?? appr?.txt ?? appr?.g ?? '—';
  return { text, col: appr?.col || '#6b7280' };
}
