import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { getAvg } from '../core/bulletinEngine';
import { downloadExcel } from '../lib/exportCsv';
import Layout from '../components/Layout';
import { useT, localeForLang } from '../lib/i18n';
import { isSequenceLocked, lockSequence, unlockSequence, getLockInfo } from '../lib/lockService';
import { useCountry, gradingOpts, geGradeMax, gradeEntryMode, primaryPeriodMode } from '../lib/useCountry';
import { validateGrade, gradeColor, displayGrade, gradeCell } from '../lib/gradeEntry';
import GradeImportPanel from '../components/grades/GradeImportPanel';
import SubjectTeacherWorkspace from '../components/grades/SubjectTeacherWorkspace';
import ApcCompetenceWorkspace from '../components/grades/ApcCompetenceWorkspace';
import MatObservationWorkspace from '../components/grades/MatObservationWorkspace';
import PrimCompetenceWorkspace from '../components/grades/PrimCompetenceWorkspace';
import { resolveClassEngine, SECTIONS, classSectionKey } from '../core/engineResolver';

const TERMS_EN = [
  { value: 1, label: 'Term 1' },
  { value: 2, label: 'Term 2' },
  { value: 3, label: 'Term 3' },
];

const COMPETENCES  = ['A', 'EA', 'NA'];
const COMP_COLORS  = { A: '#059669', EA: '#d97706', NA: '#dc2626' };

// validateGrade / gradeColor sont désormais partagés via ../lib/gradeEntry.

// ── GradeCell ─────────────────────────────────────────────────────────────────
function GradeCell({ initialValue, max, sys, onCommit }) {
  const [local, setLocal] = useState(displayGrade(initialValue));
  useEffect(() => { setLocal(displayGrade(initialValue)); }, [initialValue]);

  const handleBlur = () => {
    const validated = validateGrade(local, max);
    if (validated === null) { setLocal(displayGrade(initialValue)); return; }
    if (validated !== (initialValue ?? '')) onCommit(validated);
    setLocal(displayGrade(validated)); // normalise l'affichage (virgule)
  };

  return (
    <input
      type="text"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
      placeholder="—"
      className={`w-20 text-center rounded border border-gray-200 px-1 py-1.5 text-sm
        focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-300
        placeholder:text-gray-200 transition-colors ${gradeColor(local, max, sys)}`}
    />
  );
}

// ── CompetenceCell ────────────────────────────────────────────────────────────
function CompetenceCell({ initialValue, onCommit }) {
  const t = useT();
  const COMP_LABELS = {
    A:  t('Acquis', 'Achieved'),
    EA: t("En cours d'acquisition", 'In progress'),
    NA: t('Non acquis', 'Not achieved'),
  };

  return (
    <div className="flex gap-1 justify-center">
      {COMPETENCES.map((c) => (
        <button
          key={c}
          type="button"
          title={COMP_LABELS[c]}
          onClick={() => onCommit(initialValue === c ? '' : c)}
          className={`w-9 py-0.5 rounded text-xs font-bold transition-colors border ${
            initialValue === c
              ? 'text-white border-transparent'
              : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
          }`}
          style={initialValue === c ? { background: COMP_COLORS[c], borderColor: COMP_COLORS[c] } : {}}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

// ── Ligne élève — une matière ─────────────────────────────────────────────────
function StudentRowSingle({ index, student, subject, scores, sys, onSave }) {
  const t = useT();
  const score = scores[subject.id] ?? '';

  return (
    <tr className="hover:bg-gray-50 transition-colors group">
      <td className="px-3 py-2 text-center text-xs text-gray-400 w-8">{index}</td>
      <td className="px-4 py-2 font-medium text-gray-900 text-sm whitespace-nowrap">
        <div className="flex items-center justify-between gap-2">
          <div>
            {student.name}
            {student.matricule && (
              <span className="block text-xs text-gray-400 font-normal font-mono">{student.matricule}</span>
            )}
          </div>
          <button
            onClick={() => { if (!score) onSave(student.id, subject.id, 'ABS'); }}
            title={t('Marquer absent', 'Mark absent')}
            className="opacity-0 group-hover:opacity-100 shrink-0 text-[10px] font-bold text-gray-400 hover:text-amber-600 hover:bg-amber-50 px-1.5 py-0.5 rounded border border-transparent hover:border-amber-200 transition-all"
          >
            ABS
          </button>
        </div>
      </td>
      <td className="px-3 py-2 text-center">
        <GradeCell
          initialValue={score}
          max={subject.max}
          sys={sys}
          onCommit={(val) => onSave(student.id, subject.id, val)}
        />
      </td>
    </tr>
  );
}

// ── Ligne élève maternelle — une matière ──────────────────────────────────────
function StudentRowSingleMaternelle({ index, student, subject, scores, onSave }) {
  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-3 py-2 text-center text-xs text-gray-400 w-8">{index}</td>
      <td className="px-4 py-2 font-medium text-gray-900 text-sm whitespace-nowrap">
        {student.name}
        {student.matricule && (
          <span className="block text-xs text-gray-400 font-normal font-mono">{student.matricule}</span>
        )}
      </td>
      <td className="px-3 py-2 text-center">
        <CompetenceCell
          initialValue={scores[subject.id] ?? ''}
          onCommit={(val) => onSave(student.id, subject.id, val)}
        />
      </td>
    </tr>
  );
}

// ── Onglets matières ──────────────────────────────────────────────────────────
function SubjectTabs({ subjects, activeId, onSelect, gradeMap, classId, sequence, students }) {
  return (
    <div className="flex gap-2 flex-wrap mb-5">
      {subjects.map((sub) => {
        const filled = students.filter((s) => {
          const v = (gradeMap[`${classId}_${s.id}_${sequence}`] || {})[sub.id];
          return v && v !== '';
        }).length;
        const pct      = students.length > 0 ? filled / students.length : 0;
        const isActive = sub.id === activeId;
        return (
          <button
            key={sub.id}
            onClick={() => onSelect(sub.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
              isActive
                ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                : 'bg-white text-gray-700 border-gray-200 hover:border-brand-300 hover:bg-brand-50'
            }`}
          >
            <span className="truncate max-w-[120px]">{sub.name}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded font-semibold shrink-0 ${
              isActive
                ? 'bg-white/20 text-white'
                : pct >= 1 ? 'bg-emerald-100 text-emerald-700'
                : pct > 0  ? 'bg-amber-100 text-amber-700'
                :            'bg-gray-100 text-gray-400'
            }`}>
              {filled}/{students.length}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Stats matière courante ────────────────────────────────────────────────────
function SubjectStatsBar({ students, subject, gradeMap, classId, sequence, sys }) {
  const t = useT();
  if (!subject || !students.length) return null;
  const pass =
    sys === 'ES' ? (5 / 10) * subject.max
    : sys === 'FR' ? (10 / 20) * subject.max
    : 50;

  const vals = students
    .map((s) => {
      const v = (gradeMap[`${classId}_${s.id}_${sequence}`] || {})[subject.id];
      if (!v || v === 'ABS' || v === '') return null;
      const n = parseFloat(v);
      return isNaN(n) ? null : n;
    })
    .filter((x) => x !== null);

  const absCount = students.filter(
    (s) => (gradeMap[`${classId}_${s.id}_${sequence}`] || {})[subject.id] === 'ABS'
  ).length;

  if (!vals.length && !absCount) return null;

  const subAvg   = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
  const passRate = vals.length ? Math.round((vals.filter((v) => v >= pass).length / vals.length) * 100) : null;

  return (
    <div className="flex flex-wrap gap-4 bg-brand-50 border border-brand-100 rounded-xl px-5 py-3 text-sm mb-5">
      <span className="text-gray-600">
        <strong className="text-gray-900">{vals.length}</strong>/{students.length} {t('notés', 'graded')}
      </span>
      {absCount > 0 && (
        <span className="text-gray-600">
          <strong className="text-amber-600">{absCount}</strong> {absCount > 1 ? t('absents', 'absent') : t('absent', 'absent')}
        </span>
      )}
      {subAvg !== null && (
        <span className="text-gray-600">
          {t('Moy.', 'Avg.')} : <strong className="text-gray-900">{subAvg}/{subject.max}</strong>
        </span>
      )}
      {passRate !== null && (
        <span className="text-gray-600">
          {t('Réussite', 'Pass rate')} : <strong style={{ color: passRate >= 50 ? '#059669' : '#ef4444' }}>{passRate}%</strong>
        </span>
      )}
    </div>
  );
}

// GradeImportPanel est désormais un composant partagé : ../components/grades/GradeImportPanel.
// Conseil de Classe (honneurs, avertissements/blâmes, absences, exclusions) est
// entièrement géré côté surveillant sur /app/conseil (ConseilDeClasse.jsx).

// ── Page principale ───────────────────────────────────────────────────────────
// ── Barre de progression de saisie (X/N · % · restants) ───────────────────────
function ProgressHeader({ entered, total, label }) {
  const t = useT();
  const pct = total ? Math.round((entered / total) * 100) : 0;
  const remaining = Math.max(0, total - entered);
  return (
    <div className="flex items-center gap-3 px-1 py-2">
      <div className="flex-1">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="font-semibold text-gray-600">{label} — {pct}%</span>
          <span className="text-gray-400">{entered}/{total} {t('saisis', 'entered', 'capturadas')} · {remaining} {t('restant(s)', 'remaining', 'restantes')}</span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-brand-500' : 'bg-gray-200'}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

// ── Saisie rapide (clavier d'abord) ───────────────────────────────────────────
// Entrée / ↓ = élève suivant · ↑ = précédent · Échap = annuler · coller Excel =
// remplir vers le bas · validation inline · sauvegarde auto. Zéro souris requise.
function FastGradeEntry({ students, subject, scoresFor, onCommit, max, sys, locked }) {
  const t = useT();
  const refs = useRef([]);
  const [errors, setErrors] = useState(() => new Set());
  const [savedId, setSavedId] = useState(null);

  const focusRow = (i) => {
    const el = refs.current[i];
    if (el) { el.focus(); el.select(); }
  };

  const commit = (student, el) => {
    const v = validateGrade(el.value, max);
    setErrors((prev) => {
      const n = new Set(prev);
      if (v === null) n.add(student.id); else n.delete(student.id);
      return n;
    });
    if (v === null) return false;
    if (v !== (scoresFor(student.id) ?? '')) {
      onCommit(student.id, v);
      setSavedId(student.id);
      setTimeout(() => setSavedId((s) => (s === student.id ? null : s)), 1200);
    }
    return true;
  };

  const onKeyDown = (e, i, student) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); commit(student, e.currentTarget); focusRow(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); commit(student, e.currentTarget); focusRow(i - 1); }
    else if (e.key === 'Escape')  { e.currentTarget.value = displayGrade(scoresFor(student.id)); e.currentTarget.blur(); }
  };

  // Coller une colonne Excel (valeurs séparées par des retours-ligne) remplit
  // les élèves consécutifs à partir de la ligne active.
  const onPaste = (e, startIndex) => {
    const text = e.clipboardData.getData('text');
    if (!text || !/[\r\n\t]/.test(text)) return; // une seule valeur → collage normal
    e.preventDefault();
    const vals = text.split(/\r?\n/).map((l) => l.split('\t')[0].trim());
    let last = startIndex;
    vals.forEach((val, k) => {
      const stu = students[startIndex + k];
      if (!stu) return;
      last = startIndex + k;
      if (val === '') return;
      const v = validateGrade(val, max);
      if (v !== null) {
        onCommit(stu.id, v);
        const el = refs.current[startIndex + k];
        if (el) el.value = displayGrade(v);
      }
    });
    focusRow(Math.min(last + 1, students.length - 1));
  };

  const jumpToEmpty = () => {
    const idx = students.findIndex((s) => { const v = scoresFor(s.id); return v === undefined || v === '' || v === null; });
    focusRow(idx >= 0 ? idx : 0);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden" style={locked ? { pointerEvents: 'none', opacity: 0.72 } : null} aria-disabled={locked || undefined}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50/60">
        <span className="text-xs font-semibold text-gray-500">{subject.name} · /{max}</span>
        <button type="button" onClick={jumpToEmpty} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
          {t('↳ Aller au 1er vide', '↳ Go to first empty', '↳ Ir al 1.º vacío')}
        </button>
      </div>
      <div>
        {students.map((s, i) => {
          const hasErr = errors.has(s.id);
          const val = scoresFor(s.id);
          const isSaved = savedId === s.id;
          return (
            <div key={s.id} className="flex items-center gap-3 px-3 py-1.5 border-b border-gray-50 hover:bg-gray-50/40">
              <span className="w-6 text-xs text-gray-300 text-right shrink-0">{i + 1}</span>
              <span className="flex-1 min-w-0 text-sm text-gray-800 truncate">
                {s.name}
                {s.matricule && <span className="block text-xs text-gray-400 font-mono leading-none">{s.matricule}</span>}
              </span>
              <input
                ref={(el) => { refs.current[i] = el; }}
                type="text"
                inputMode="decimal"
                defaultValue={displayGrade(val)}
                onBlur={(e) => commit(s, e.currentTarget)}
                onKeyDown={(e) => onKeyDown(e, i, s)}
                onPaste={(e) => onPaste(e, i)}
                placeholder="—"
                aria-invalid={hasErr || undefined}
                className={`w-24 text-center rounded-lg px-2 py-2 text-base font-semibold focus:outline-none focus:ring-2 transition-colors ${
                  hasErr
                    ? 'border border-red-400 ring-1 ring-red-300 text-red-600'
                    : `border border-gray-200 focus:border-brand-500 focus:ring-brand-300 ${gradeColor(val, max, sys)}`
                }`}
              />
              <span className="w-5 shrink-0 text-center">
                {hasErr ? <span title={t(`Note invalide (0–${max})`, `Invalid (0–${max})`)} className="text-red-500 text-xs">⚠</span>
                  : isSaved ? <span className="text-emerald-500 text-xs">✓</span>
                  : null}
              </span>
            </div>
          );
        })}
        {students.length === 0 && <p className="text-sm text-gray-400 text-center py-8">{t('Aucun élève.', 'No students.', 'Sin alumnos.')}</p>}
      </div>
      <div className="px-3 py-2.5 border-t border-gray-100 text-xs text-gray-400 flex flex-wrap gap-3">
        <span><strong>{t('Entrée', 'Enter')}</strong> / <strong>↓</strong> {t('suivant', 'next', 'siguiente')}</span>
        <span><strong>↑</strong> {t('précédent', 'previous', 'anterior')}</span>
        <span className="hidden sm:inline"><strong>{t('Coller', 'Paste')}</strong> {t('une colonne Excel', 'an Excel column', 'columna de Excel')}</span>
        <span><strong>ABS</strong> = {t('Absent', 'Absent')}</span>
        <span>{t('Sauvegarde auto', 'Auto-save', 'Guardado auto')}</span>
      </div>
    </div>
  );
}

// ── Modale Valider & verrouiller (Revue → Confirmation) ───────────────────────
// Empêche le verrouillage accidentel : revue de complétion + case à cocher.
function LockReviewModal({ review, periodLabel, className, onConfirm, onClose }) {
  const t = useT();
  const [checked, setChecked] = useState(false);
  const incomplete = review.pct < 100;
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900">{t('Valider et verrouiller', 'Validate & lock', 'Validar y bloquear')}</h3>
        <p className="text-sm text-gray-500 mt-1">{className} · {periodLabel}</p>

        <div className="mt-4 rounded-xl border border-gray-100 p-4 bg-gray-50/60">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="font-semibold text-gray-700">{t('Complétion', 'Completion', 'Completitud')}</span>
            <span className={`font-bold ${review.pct === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>{review.pct}%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
            <div className={`h-full ${review.pct === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${review.pct}%` }} />
          </div>
          <p className="text-xs text-gray-500">{review.entered}/{review.totalCells} {t('notes saisies', 'grades entered', 'notas capturadas')}</p>
          {review.perSubject.length > 0 && (
            <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
              {review.perSubject.map((p) => (
                <p key={p.name} className="text-xs text-amber-700">⚠ {p.name} — {p.missing} {t('manquante(s)', 'missing', 'faltan')}</p>
              ))}
            </div>
          )}
        </div>

        {incomplete && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            {t('La saisie est incomplète. Vous pourrez demander un déverrouillage à l\'administrateur en cas d\'erreur.', 'Entry is incomplete. You can ask the admin to unlock if needed.', 'La captura está incompleta. Podrá pedir el desbloqueo al administrador.')}
          </div>
        )}

        <label className="flex items-center gap-2 mt-4 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-brand-600" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          {t("J'ai vérifié les notes de cette séquence.", 'I have reviewed the grades for this period.', 'He revisado las notas.')}
        </label>

        <div className="flex gap-3 mt-5">
          <button onClick={onConfirm} disabled={!checked}
            className="btn-primary disabled:opacity-40" style={{ width: 'auto', paddingInline: '1.5rem' }}>
            🔒 {t('Verrouiller', 'Lock', 'Bloquear')}
          </button>
          <button onClick={onClose} className="btn-secondary" style={{ width: 'auto' }}>{t('Annuler', 'Cancel', 'Cancelar')}</button>
        </div>
      </div>
    </div>
  );
}

// Aiguillage : en mode « enseignant de matière », l'enseignant bascule sur le
// poste dédié (plein écran focalisé). Tout le reste — admin, censeur, et mode
// « enseignant principal » (titulaire) — utilise l'écran historique inchangé.
// Le branchement est fait AVANT les hooks lourds de PrincipalGrades (règles des
// hooks respectées : le composant lourd n'est monté que pour la vue historique).
export default function Grades() {
  const role   = useAuthStore((s) => s.role);
  const school = useAuthStore((s) => s.school);
  const engine = school?.bulletin_engine;
  const classes  = useSchoolStore((s) => s.classes);
  const classId  = useUiStore((s) => s.gradesClassId);

  // Moteur APC seul (premier cycle) : saisie par compétences, remplace l'écran classique.
  if (engine === 'apc_minesec') {
    return <Layout bleed><ApcCompetenceWorkspace /></Layout>;
  }

  // 'minesec' : les deux moteurs coexistent dans le même établissement (APC en
  // 6e–3e, second cycle MINESEC en 2nde–Tle qui réutilise l'écran classique).
  // Le moteur est déduit AUTOMATIQUEMENT du niveau de la classe sélectionnée
  // (partagée via uiStore) : aucun bascule manuel « premier / second cycle ».
  if (engine === 'minesec') {
    const selectedClass = classes.find((c) => c.id === classId) || null;
    // Tant qu'aucune classe n'est choisie, on part de l'écran classique (qui
    // porte le sélecteur de classe) ; il basculera seul dès qu'une classe 6e–3e
    // sera choisie. Idem dans l'autre sens depuis le sélecteur APC.
    const classEngine = resolveClassEngine(school, selectedClass);
    return classEngine === 'apc'
      ? <Layout bleed><ApcCompetenceWorkspace /></Layout>
      : <PrincipalGrades />;
  }

  // Moteurs FONDAMENTAL MINEDUB : maternelle (PS/MS/GS → domaines A/ECA/NA) et
  // primaire APC (SIL–CM2 → compétences × critères /10). Résolus PAR CLASSE ; tant
  // qu'aucune classe fondamentale n'est choisie, l'écran classique (avec sélecteur)
  // sert de point d'entrée et bascule seul.
  if (engine === 'minedub' || engine === 'maternelle' || engine === 'apc_primaire') {
    const selectedClass = classes.find((c) => c.id === classId) || null;
    const classEngine = resolveClassEngine(school, selectedClass);
    if (classEngine === 'maternelle')   return <Layout bleed><MatObservationWorkspace /></Layout>;
    if (classEngine === 'apc_primaire') return <Layout bleed><PrimCompetenceWorkspace /></Layout>;
    // Enseignant en Mode 1 sans classe fondamentale encore résolue : le workspace
    // primaire auto-sélectionne ses classes affectées (compétences).
    if (role === 'teacher' && gradeEntryMode(school) === 'subject') {
      return <Layout bleed><PrimCompetenceWorkspace /></Layout>;
    }
    return <PrincipalGrades />;
  }

  // Mode UNIFIÉ 'officiel' : tous les cycles coexistent. Le poste de saisie est
  // choisi selon le moteur résolu de la classe (maternelle → domaines, primaire →
  // compétences, collège → APC ; lycée & classique → écran classique avec sélecteur
  // section+classe). Tant qu'aucune classe fondamentale/APC n'est résolue, on tombe
  // sur l'écran classique (ou le poste enseignant de matière) ci-dessous.
  if (engine === 'officiel') {
    const selectedClass = classes.find((c) => c.id === classId) || null;
    const classEngine = resolveClassEngine(school, selectedClass);
    if (classEngine === 'maternelle')   return <Layout bleed><MatObservationWorkspace /></Layout>;
    if (classEngine === 'apc_primaire') return <Layout bleed><PrimCompetenceWorkspace /></Layout>;
    if (classEngine === 'apc')          return <Layout bleed><ApcCompetenceWorkspace /></Layout>;
    // 'sc' (lycée) et 'classic' : saisie numérique classique — voir tail commun.
  }

  if (role === 'teacher' && gradeEntryMode(school) === 'subject') {
    return <Layout bleed><SubjectTeacherWorkspace /></Layout>;
  }
  return <PrincipalGrades />;
}

function PrincipalGrades() {
  const t = useT();
  const classes   = useSchoolStore((s) => s.classes);
  const subjects  = useSchoolStore((s) => s.subjects);
  const students  = useSchoolStore((s) => s.students);
  const gradeMap  = useSchoolStore((s) => s.gradeMap);
  const saveGrade = useSchoolStore((s) => s.saveGrade);

  const role           = useAuthStore((s) => s.role);
  const myClassId      = useAuthStore((s) => s.classId);
  const teacherId      = useAuthStore((s) => s.teacherId);
  const school         = useAuthStore((s) => s.school);
  const schoolLanguage = school?.language || 'francophone';
  const isTeacher = role === 'teacher';
  const country   = useCountry();
  const isGE      = country.code === 'guinea_eq';
  // Mode 1 « enseignant de matière » : l'enseignant ne saisit QUE ses matières.
  // En mode 'principal' (défaut), `isSubjectTeacher` reste false → comportement
  // historique strictement inchangé.
  const isSubjectTeacher = isTeacher && gradeEntryMode(school) === 'subject';

  const SEQUENCES = [
    { value: 1, label: t('Séquence 1', 'Sequence 1'), term: t('Trimestre 1', 'Quarter 1') },
    { value: 2, label: t('Séquence 2', 'Sequence 2'), term: t('Trimestre 1', 'Quarter 1') },
    { value: 3, label: t('Séquence 3', 'Sequence 3'), term: t('Trimestre 2', 'Quarter 2') },
    { value: 4, label: t('Séquence 4', 'Sequence 4'), term: t('Trimestre 2', 'Quarter 2') },
    { value: 5, label: t('Séquence 5', 'Sequence 5'), term: t('Trimestre 3', 'Quarter 3') },
    { value: 6, label: t('Séquence 6', 'Sequence 6'), term: t('Trimestre 3', 'Quarter 3') },
  ];

  // Guinea Ecuatorial : 3 trimestres officiels en espagnol.
  const TRIMESTRES_GE = [
    { value: 1, label: 'Primer Trimestre' },
    { value: 2, label: 'Segundo Trimestre' },
    { value: 3, label: 'Tercer Trimestre' },
  ];

  const TRIMESTRES = [
    { value: 1, label: t('Trimestre 1', 'Quarter 1') },
    { value: 2, label: t('Trimestre 2', 'Quarter 2') },
    { value: 3, label: t('Trimestre 3', 'Quarter 3') },
  ];

  const classId    = useUiStore((s) => s.gradesClassId);
  const setClassId    = useUiStore((s) => s.setGradesClassId);
  const sequence   = useUiStore((s) => s.gradesSequence);
  const setSequence   = useUiStore((s) => s.setGradesSequence);
  const subjectId  = useUiStore((s) => s.gradesSubjectId);
  const setSubjectId  = useUiStore((s) => s.setGradesSubjectId);

  const [showImport,    setShowImport]    = useState(false);
  const [sectionFilter, setSectionFilter] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [gradePage,     setGradePage]     = useState(1);
  const [entryMode,     setEntryMode]     = useState(() => {
    try { return localStorage.getItem('nc_grades_mode') || 'fast'; } catch { return 'fast'; }
  });
  const [showLockModal, setShowLockModal] = useState(false);
  const chooseMode = (m) => { setEntryMode(m); try { localStorage.setItem('nc_grades_mode', m); } catch {} };

  const GRADE_PAGE_SIZE = 20;

  // Mode 1 : classes où l'enseignant a au moins une matière affectée (sert au
  // sélecteur de classe de la vue enseignant — il peut en avoir plusieurs).
  const teacherClasses = useMemo(() => {
    if (!isSubjectTeacher) return classes;
    const ids = new Set(subjects.filter((s) => s.teacher_id === teacherId).map((s) => s.class_id));
    return classes.filter((c) => ids.has(c.id));
  }, [isSubjectTeacher, classes, subjects, teacherId]);

  useEffect(() => {
    if (!isTeacher) return;
    // Mode 1 : l'enseignant n'a pas forcément de classe titulaire → on part de
    // la première classe où il a une matière affectée.
    const target = isSubjectTeacher ? teacherClasses[0]?.id : (myClassId || classes[0]?.id);
    if (target && !classId) setClassId(target);
  }, [isTeacher, isSubjectTeacher, teacherClasses, myClassId, classes, classId]);

  const selectedClass = classes.find((c) => c.id === classId) || null;

  // ── Filtre par SECTION (raccourcit le sélecteur de classe côté admin) ────────
  // On ne propose que les sections réellement présentes ; une école mono-section
  // n'a pas à choisir (auto-sélection). La section peut aussi être déduite de la
  // classe déjà sélectionnée (persistée), pour rester cohérent au rechargement.
  const availableSections = useMemo(() => {
    const present = new Set(classes.map(classSectionKey));
    return SECTIONS.filter((s) => present.has(s.key));
  }, [classes]);
  const effectiveSection = sectionFilter
    || (selectedClass ? classSectionKey(selectedClass) : '')
    || (availableSections.length === 1 ? availableSections[0].key : '');
  const visibleClasses = useMemo(
    () => (effectiveSection ? classes.filter((c) => classSectionKey(c) === effectiveSection) : []),
    [classes, effectiveSection],
  );

  const cycle         = selectedClass?.cycle || 'secondaire';
  const isMaternelle  = cycle === 'maternelle';
  const isPrimaire    = cycle === 'primaire';
  const sys           = selectedClass?.system || 'FR';
  // Options de notation GE (échelle /10 ou /20, coef primaire) — {} hors GE.
  const gOpts         = gradingOpts(school, cycle);
  const geMax         = geGradeMax(school);
  const isEN          = sys === 'EN';
  // Le primaire classique peut suivre le rythme du secondaire (6 séquences) si
  // l'établissement l'a choisi dans Paramètres. Défaut : 3 trimestres, comme
  // avant. La maternelle reste toujours en trimestres.
  const primSequences = isPrimaire && primaryPeriodMode(school) === 'sequences';
  // Pour les écoles Guinea Ecuatorial : 3 trimestres en espagnol, quel que soit le cycle.
  const periods = isGE
    ? TRIMESTRES_GE
    : (isMaternelle || (isPrimaire && !primSequences)) ? TRIMESTRES
    : isEN ? TERMS_EN
    : SEQUENCES;

  const classSubjects = useMemo(() => {
    let list = subjects.filter((s) => s.class_id === classId);
    // Mode 1 : on ne montre que les matières affectées à cet enseignant.
    if (isSubjectTeacher) list = list.filter((s) => s.teacher_id === teacherId);
    // Matières composites : on saisit les sous-composantes (feuilles), jamais la
    // matière parente (sa note est calculée). On retire donc les parents.
    const parentIds = new Set(list.filter((s) => s.parent_id).map((s) => s.parent_id));
    list = list.filter((s) => !parentIds.has(s.id));
    return list.sort((a, b) => b.coef - a.coef || a.name.localeCompare(b.name));
  }, [subjects, classId, isSubjectTeacher, teacherId]);

  const classStudents = useMemo(() =>
    students.filter((s) => s.class_id === classId).sort((a, b) => a.name.localeCompare(b.name)),
    [students, classId]
  );

  const prevClassIdRef = useRef(null);
  useEffect(() => {
    if (prevClassIdRef.current === null) { prevClassIdRef.current = classId; return; }
    if (prevClassIdRef.current === classId) return;
    prevClassIdRef.current = classId;
    setSequence(1); setStudentSearch(''); setGradePage(1); setSubjectId('');
  }, [classId]);

  useEffect(() => {
    if (classSubjects.length > 0 && (!subjectId || !classSubjects.find((s) => s.id === subjectId))) {
      setSubjectId(classSubjects[0].id);
    }
  }, [classSubjects, subjectId]);

  useEffect(() => { setGradePage(1); }, [studentSearch]);

  const currentSubject = classSubjects.find((s) => s.id === subjectId) || null;

  // Verrou de séquence — validation des notes par l'admin. Quand le verrou
  // est posé, la saisie devient impossible (admin doit déverrouiller d'abord).
  const schoolId = school?.id;
  const [, _setLockTick] = useState(0); // pour forcer un rerender après toggle
  const locked = classId && schoolId
    ? isSequenceLocked(schoolId, classId, sequence)
    : false;
  const lockInfo = classId && schoolId
    ? getLockInfo(schoolId, 'seq', classId, sequence)
    : null;
  // Verrouillage sécurisé : la pose passe par une revue (LockReviewModal) pour
  // éviter tout verrouillage accidentel ; le déverrouillage reste un confirm simple.
  const requestLock = () => {
    if (!schoolId || !classId) return;
    if (locked) {
      if (!window.confirm(t('Déverrouiller la saisie de cette séquence ?', 'Unlock entry for this sequence?', '¿Desbloquear la captura?'))) return;
      unlockSequence(schoolId, classId, sequence).then(() => _setLockTick((n) => n + 1));
    } else {
      setShowLockModal(true);
    }
  };
  const confirmLock = async () => {
    await lockSequence(schoolId, classId, sequence, useAuthStore.getState().fullName);
    setShowLockModal(false);
    _setLockTick((n) => n + 1);
  };

  // Recherche instantanée : nom complet, prénom isolé, matricule.
  // Insensible à la casse et aux accents.
  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return classStudents;
    const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const qn = norm(q);
    return classStudents.filter((s) => {
      const name = norm(s.name);
      const mat  = norm(s.matricule);
      // Matching mot par mot pour gérer prénom + nom dans n'importe quel ordre
      const words = qn.split(/\s+/).filter(Boolean);
      return words.every((w) => name.includes(w) || mat.includes(w));
    });
  }, [classStudents, studentSearch]);

  const totalGradePages = Math.max(1, Math.ceil(filteredStudents.length / GRADE_PAGE_SIZE));
  const pagedStudents   = filteredStudents.slice(
    (gradePage - 1) * GRADE_PAGE_SIZE,
    gradePage * GRADE_PAGE_SIZE
  );

  const handleSave = useCallback(async (studentId, fieldId, value) => {
    if (locked) return; // sécurité réseau : la séquence est verrouillée
    // Mode 1 — garde-fou : un enseignant de matière ne peut écrire QUE ses
    // matières (jamais conduite/absences/conseil ni une matière non affectée).
    // `classSubjects` est déjà restreint à ses matières en mode 'subject'.
    if (isSubjectTeacher && !classSubjects.some((s) => s.id === fieldId)) return;
    await saveGrade(classId, studentId, sequence, { [fieldId]: value });
  }, [classId, sequence, saveGrade, locked, isSubjectTeacher, classSubjects]);

  const getScores = (studentId) => gradeMap[`${classId}_${studentId}_${sequence}`] || {};

  const noSubjects = classId && classSubjects.length === 0;
  const noStudents = classId && classStudents.length === 0;

  const subjectClassAvg = useMemo(() => {
    if (!currentSubject) return null;
    const vals = classStudents
      .map((s) => {
        const v = (gradeMap[`${classId}_${s.id}_${sequence}`] || {})[currentSubject.id];
        if (!v || v === 'ABS' || v === '') return null;
        const n = parseFloat(v);
        return isNaN(n) ? null : n;
      })
      .filter((x) => x !== null);
    return vals.length
      ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100
      : null;
  }, [classStudents, gradeMap, classId, sequence, currentSubject]);

  // Progression de la matière courante (saisis / total) — barre + restants.
  const subjectProgress = useMemo(() => {
    if (!currentSubject) return { entered: 0, total: 0 };
    let entered = 0;
    classStudents.forEach((s) => {
      const v = (gradeMap[`${classId}_${s.id}_${sequence}`] || {})[currentSubject.id];
      if (v !== undefined && v !== '' && v !== null) entered++;
    });
    return { entered, total: classStudents.length };
  }, [classStudents, gradeMap, classId, sequence, currentSubject]);

  // Revue de complétion (toutes matières) pour la modale de verrouillage.
  const lockReview = useMemo(() => {
    const studs = classStudents, subs = classSubjects;
    const totalCells = subs.length * studs.length;
    let entered = 0;
    const perSubject = subs.map((sub) => {
      let e = 0;
      studs.forEach((s) => {
        const v = (gradeMap[`${classId}_${s.id}_${sequence}`] || {})[sub.id];
        if (v !== undefined && v !== '' && v !== null) e++;
      });
      entered += e;
      return { name: sub.name, missing: studs.length - e };
    });
    return { entered, totalCells, pct: totalCells ? Math.round((entered / totalCells) * 100) : 0, perSubject: perSubject.filter((p) => p.missing > 0) };
  }, [classSubjects, classStudents, gradeMap, classId, sequence]);

  const handleExport = () => {
    if (!classId || !classStudents.length || !classSubjects.length || isMaternelle) return;
    const seqLabel = periods.find((s) => s.value === sequence)?.label || `Seq${sequence}`;
    const header   = [t('Élève', 'Student'), ...classSubjects.map((s) => `${s.name} /${s.max}`), t('Moyenne', 'Average')];
    const rows = [
      header,
      ...classStudents.map((student) => {
        const scores = getScores(student.id);
        const avg    = getAvg(scores, classSubjects, sys, gOpts);
        // Notes et moyenne écrites en texte à virgule ("13,75") via gradeCell —
        // virgule garantie quelle que soit la locale du poste.
        return [student.name, ...classSubjects.map((sub) => gradeCell(scores[sub.id])), gradeCell(avg != null ? Math.round(avg * 100) / 100 : '')];
      }),
    ];
    downloadExcel(`notes_${selectedClass?.name || 'classe'}_${seqLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`, rows, seqLabel);
  };

  const selectSubject = (id) => { setSubjectId(id); setStudentSearch(''); setGradePage(1); };

  const periodLabel =
    isGE                              ? t('Trimestre', 'Quarter') /* auto-traduit ES */
    : (isMaternelle || (isPrimaire && !primSequences)) ? t('Trimestre', 'Quarter')
    : isEN                            ? 'Term'
                                      : t('Séquence', 'Sequence');

  return (
    <Layout>
      <div>

        {/* ── Vue enseignant ─────────────────────────────────────────────────── */}
        {isTeacher ? (
          <>
            <div className="flex flex-wrap justify-between items-start gap-4 mb-5">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {selectedClass ? selectedClass.name : t('Saisie des notes', 'Grade entry')}
                </h1>
                {selectedClass ? (
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="text-sm text-gray-500">{classStudents.length} {classStudents.length !== 1 ? t('élèves', 'students') : t('élève', 'student')}</span>
                    <span className="text-gray-300">·</span>
                    <span className="text-sm text-gray-500">{classSubjects.length} {classSubjects.length !== 1 ? t('matières', 'subjects') : t('matière', 'subject')}</span>
                    <span className="text-gray-300">·</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                      sys === 'EN' ? 'bg-blue-100 text-blue-700'
                      : sys === 'ES' ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-purple-100 text-purple-700'
                    }`}>
                      {sys === 'FR' ? 'FR /20' : sys === 'EN' ? 'EN /100' : `ES /${geMax}`}
                    </span>
                    {isMaternelle && <span className="text-xs font-semibold px-2 py-0.5 rounded bg-rose-100 text-rose-700">{t('Maternelle', 'Nursery')}</span>}
                    {isPrimaire   && <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">{t('Primaire', 'Primary')}</span>}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 mt-1">{t('Notes sauvegardées automatiquement', 'Grades saved automatically')}</p>
                )}
              </div>
              {classId && classStudents.length > 0 && classSubjects.length > 0 && !isMaternelle && (
                <div className="flex flex-wrap gap-2 no-print">
                  <button onClick={() => setShowImport((v) => !v)} className="btn-secondary">{t('Importer CSV', 'Import CSV')}</button>
                  <button onClick={handleExport} className="btn-secondary">{t('Exporter Excel', 'Export Excel')}</button>
                </div>
              )}
            </div>

            {classes.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
                {/* Deux causes distinctes, deux messages : sans fiche enseignant
                    rattachée, aucune affectation n'est possible — l'admin doit
                    d'abord relier le compte, pas assigner une matière. */}
                {!teacherId ? (
                  <>
                    <p className="text-amber-800 font-semibold mb-1">{t('Compte non relié à une fiche enseignant', 'Account not linked to a teacher record')}</p>
                    <p className="text-amber-600 text-sm mt-1">{t("Demandez à l'administrateur d'ouvrir Enseignants et de créer l'accès depuis votre fiche.", 'Ask your administrator to open Teachers and create your access from your record.')}</p>
                  </>
                ) : (
                  <>
                    <p className="text-amber-800 font-semibold mb-1">{t('Aucune classe assignée', 'No class assigned')}</p>
                    <p className="text-amber-600 text-sm mt-1">{t("Contactez l'administrateur de l'établissement.", 'Contact your school administrator.')}</p>
                  </>
                )}
              </div>
            )}

            {classId && (
              <div className="flex flex-wrap gap-3 mb-6">
                {/* Mode 1 : l'enseignant de matière peut intervenir dans plusieurs
                    classes → sélecteur. En mode 'principal' (1 classe titulaire),
                    le sélecteur est masqué (comportement historique). */}
                {isSubjectTeacher && teacherClasses.length > 1 && (
                  <div className="w-full sm:flex-1 sm:max-w-xs">
                    <label className="form-label">{t('Classe', 'Class')}</label>
                    <select className="form-input" value={classId} onChange={(e) => setClassId(e.target.value)}>
                      {teacherClasses.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="w-full sm:flex-1 sm:max-w-xs">
                  <label className="form-label">{periodLabel}</label>
                  <select className="form-input" value={sequence} onChange={(e) => setSequence(Number(e.target.value))}>
                    {periods.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}{'term' in p ? ` (${p.term})` : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </>
        ) : (
          /* ── Vue administrateur ─────────────────────────────────────────────── */
          <>
            <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{t('Saisie des notes', 'Grade entry')}</h1>
                <p className="text-sm text-gray-500 mt-1">
                  {isMaternelle
                    ? t('Évaluation par compétences — A / EA / NA.', 'Competency assessment — A / EA / NA.')
                    : t('Notes sauvegardées automatiquement à chaque saisie.', 'Grades are saved automatically with each entry.')}
                </p>
              </div>
              {classId && classStudents.length > 0 && classSubjects.length > 0 && !isMaternelle && (
                <div className="flex flex-wrap gap-2 no-print">
                  <button onClick={() => setShowImport((v) => !v)} className="btn-secondary">{t('Importer CSV', 'Import CSV')}</button>
                  <button onClick={handleExport} className="btn-secondary">{t('Exporter Excel', 'Export Excel')}</button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3 mb-6">
              {availableSections.length > 1 && (
                <div className="w-full sm:flex-1 sm:max-w-xs">
                  <label className="form-label">{t('Section', 'Section')}</label>
                  <select
                    className="form-input"
                    value={effectiveSection}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSectionFilter(v);
                      // La classe sélectionnée change de section → on la réinitialise.
                      if (selectedClass && classSectionKey(selectedClass) !== v) setClassId('');
                    }}
                  >
                    <option value="">{t('Choisir une section…', 'Choose a section…')}</option>
                    {availableSections.map((s) => (
                      <option key={s.key} value={s.key}>{t(s.fr, s.en, s.es)}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="w-full sm:flex-1 sm:max-w-xs">
                <label className="form-label">{t('Classe', 'Class')}</label>
                <select
                  className="form-input"
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                  disabled={!effectiveSection}
                >
                  <option value="">
                    {effectiveSection ? t('Choisir une classe…', 'Choose a class…') : t('Choisissez d’abord une section', 'Choose a section first')}
                  </option>
                  {visibleClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{schoolLanguage === 'bilingue' && !isGE ? ` [${c.system === 'EN' ? 'EN /100' : 'FR /20'}]` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {classId && (
                <div className="w-full sm:flex-1 sm:max-w-xs">
                  <label className="form-label">{periodLabel}</label>
                  <select className="form-input" value={sequence} onChange={(e) => setSequence(Number(e.target.value))}>
                    {periods.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}{'term' in p ? ` (${p.term})` : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              {selectedClass && (
                <div className="flex flex-wrap items-center gap-2 pt-1 sm:items-end">
                  <span className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                    sys === 'EN' ? 'bg-blue-100 text-blue-700'
                    : sys === 'ES' ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-purple-100 text-purple-700'
                  }`}>
                    {sys === 'FR' ? 'FR /20' : sys === 'EN' ? 'EN /100' : 'ES /10'}
                  </span>
                  {isMaternelle && <span className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-100 text-rose-700">{t('Maternelle', 'Nursery')}</span>}
                  {isPrimaire   && <span className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-700">{t('Primaire', 'Primary')}</span>}
                </div>
              )}
            </div>

            {!classId && (
              <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
                <div className="text-4xl mb-3">✏️</div>
                <p className="text-gray-500 text-sm">{t('Sélectionnez une classe pour commencer la saisie.', 'Select a class to start entering grades.')}</p>
              </div>
            )}
          </>
        )}

        {noSubjects && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
            {t(
              `Cette classe n'a pas encore de ${isMaternelle ? 'domaines de compétences' : 'matières'} configurés.`,
              `This class has no ${isMaternelle ? 'competency domains' : 'subjects'} configured yet.`,
            )}{' '}
            <a href="/app/classes" className="font-semibold underline">
              {t(isMaternelle ? 'Ajouter des domaines' : 'Ajouter des matières', isMaternelle ? 'Add domains' : 'Add subjects')}
            </a>
          </div>
        )}
        {noStudents && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
            {t("Cette classe n'a pas encore d'élèves inscrits.", 'This class has no enrolled students yet.')}{' '}
            <a href="/app/students" className="font-semibold underline">{t('Ajouter des élèves', 'Add students')}</a>
          </div>
        )}

        {showImport && classId && !isMaternelle && (
          <GradeImportPanel
            classStudents={classStudents}
            classSubjects={classSubjects}
            classId={classId}
            sequence={sequence}
            sys={sys}
            saveGrade={saveGrade}
            onClose={() => setShowImport(false)}
          />
        )}

        {/* ── Bandeau verrouillage de séquence ──────────────────────────────── */}
        {classId && classStudents.length > 0 && (
          <div className={`flex items-center justify-between gap-3 mb-4 p-3 rounded-xl border ${
            locked
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-lg">{locked ? '🔒' : '✏️'}</span>
              <div>
                <div className="font-semibold">
                  {locked
                    ? t('Notes validées — saisie verrouillée', 'Grades validated — entry locked', 'Notas validadas — captura bloqueada')
                    : t('Notes en cours de saisie', 'Grades being entered', 'Notas en captura')}
                </div>
                {lockInfo?.by && (
                  <div className="text-xs opacity-80">
                    {t('Verrouillé par', 'Locked by', 'Bloqueado por')} {lockInfo.by} —{' '}
                    {new Date(lockInfo.at).toLocaleString(localeForLang())}
                  </div>
                )}
              </div>
            </div>
            {!isTeacher && (
              <button onClick={requestLock} className={`text-sm px-3 py-1.5 rounded-lg font-semibold ${
                locked ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-amber-600 text-white hover:bg-amber-700'
              }`}>
                {locked
                  ? t('Déverrouiller', 'Unlock', 'Desbloquear')
                  : t('Valider et verrouiller', 'Validate & lock', 'Validar y bloquear')}
              </button>
            )}
          </div>
        )}

        {showLockModal && (
          <LockReviewModal
            review={lockReview}
            periodLabel={`${periodLabel} ${sequence}`}
            className={selectedClass?.name || ''}
            onConfirm={confirmLock}
            onClose={() => setShowLockModal(false)}
          />
        )}

        {/* ── Contenu principal ─────────────────────────────────────────────── */}
        {classId && classSubjects.length > 0 && classStudents.length > 0 && currentSubject && (
          <>
            {/* Onglets matières */}
            <SubjectTabs
              subjects={classSubjects}
              activeId={subjectId}
              onSelect={selectSubject}
              gradeMap={gradeMap}
              classId={classId}
              sequence={sequence}
              students={classStudents}
            />

            {/* Stats matière */}
            {!isMaternelle && (
              <SubjectStatsBar
                students={classStudents}
                subject={currentSubject}
                gradeMap={gradeMap}
                classId={classId}
                sequence={sequence}
                sys={sys}
              />
            )}

            {/* Bascule Saisie rapide / Tableau + progression (matières numériques) */}
            {!isMaternelle && (
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold shrink-0">
                  {[['fast', t('Saisie rapide', 'Fast entry', 'Captura rápida')], ['table', t('Tableau', 'Table', 'Tabla')]].map(([m, label]) => (
                    <button key={m} onClick={() => chooseMode(m)}
                      className={`px-3 py-1.5 transition-colors ${entryMode === m ? 'bg-brand-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex-1 min-w-[200px]">
                  <ProgressHeader entered={subjectProgress.entered} total={subjectProgress.total} label={currentSubject.name} />
                </div>
              </div>
            )}

            {/* Saisie rapide (clavier d'abord) — matières numériques uniquement */}
            {entryMode === 'fast' && !isMaternelle ? (
              <FastGradeEntry
                students={filteredStudents}
                subject={currentSubject}
                scoresFor={(id) => getScores(id)[currentSubject.id]}
                onCommit={(id, v) => handleSave(id, currentSubject.id, v)}
                max={currentSubject.max}
                sys={sys}
                locked={locked}
              />
            ) : (
            /* Tableau — verrou physique des inputs quand séquence verrouillée */
            <div
              className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
              style={locked ? { pointerEvents: 'none', opacity: 0.72 } : null}
              aria-disabled={locked || undefined}
            >

              {/* Barre de recherche */}
              {classStudents.length > 5 && (
                <div className="px-3 py-3 border-b border-gray-100 flex items-center gap-2">
                  <div className="relative flex-1">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z"/>
                    </svg>
                    <input
                      type="text"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      placeholder={t('Rechercher un élève…', 'Search a student…')}
                      className="w-full pl-9 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-300"
                    />
                    {studentSearch && (
                      <button onClick={() => setStudentSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {studentSearch
                      ? (filteredStudents.length === 0
                          ? t('Aucun', 'None')
                          : `${filteredStudents.length}`)
                      : `${classStudents.length} ${t('élèves', 'students')}`}
                  </span>
                </div>
              )}

              {/* Scroll horizontal sur mobile */}
              <div className="overflow-x-auto">
                <table className="text-sm border-collapse w-full min-w-[340px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-2 py-3 text-center font-semibold text-gray-400 w-8 text-xs">N°</th>
                      <th className="px-3 py-3 text-left font-semibold text-gray-600">{t('Élève', 'Student')}</th>
                      <th className="px-3 py-3 text-center font-semibold text-gray-700 min-w-[90px]">
                        <div className="truncate max-w-[120px] mx-auto text-xs sm:text-sm">{currentSubject.name}</div>
                        {!isMaternelle && (
                          <div className="text-gray-400 font-normal text-xs mt-0.5">
                            c{currentSubject.coef} · /{currentSubject.max}
                          </div>
                        )}
                      </th>
                    </tr>
                  </thead>

                  <tbody key={`${classId}-${sequence}-${subjectId}`} className="divide-y divide-gray-50">
                    {pagedStudents.map((student, i) => (
                      isMaternelle ? (
                        <StudentRowSingleMaternelle
                          key={student.id}
                          index={(gradePage - 1) * GRADE_PAGE_SIZE + i + 1}
                          student={student}
                          subject={currentSubject}
                          scores={getScores(student.id)}
                          onSave={handleSave}
                        />
                      ) : (
                        <StudentRowSingle
                          key={student.id}
                          index={(gradePage - 1) * GRADE_PAGE_SIZE + i + 1}
                          student={student}
                          subject={currentSubject}
                          scores={getScores(student.id)}
                          sys={sys}
                          onSave={handleSave}
                        />
                      )
                    ))}
                  </tbody>

                  {!isMaternelle && subjectClassAvg !== null && (
                    <tfoot>
                      <tr className="bg-gray-50/80 border-t-2 border-gray-200">
                        <td />
                        <td className="px-3 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                          {t('Moy. classe', 'Class avg.')}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`text-sm font-bold ${
                            subjectClassAvg >= (sys === 'ES' ? (5 / 10) * currentSubject.max : sys === 'FR' ? (10 / 20) * currentSubject.max : 50)
                              ? 'text-emerald-600' : 'text-red-500'
                          }`}>
                            {subjectClassAvg}/{currentSubject.max}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Pagination */}
              {totalGradePages > 1 && (
                <div className="px-3 py-3 border-t border-gray-100 flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-gray-400">
                    {gradePage}/{totalGradePages} — {(gradePage - 1) * GRADE_PAGE_SIZE + 1}–{Math.min(gradePage * GRADE_PAGE_SIZE, filteredStudents.length)}/{filteredStudents.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setGradePage((p) => Math.max(1, p - 1))} disabled={gradePage === 1}
                      className="px-2.5 py-1 rounded-lg text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                      ←
                    </button>
                    {Array.from({ length: totalGradePages }, (_, i) => i + 1).map((p) => (
                      <button key={p} onClick={() => setGradePage(p)}
                        className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${p === gradePage ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                        {p}
                      </button>
                    ))}
                    <button onClick={() => setGradePage((p) => Math.min(totalGradePages, p + 1))} disabled={gradePage === totalGradePages}
                      className="px-2.5 py-1 rounded-lg text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                      →
                    </button>
                  </div>
                </div>
              )}

              <div className="px-3 py-3 border-t border-gray-100 text-xs text-gray-400 flex flex-wrap gap-3">
                {isMaternelle ? (
                  <>
                    <span><strong>A</strong> = {t('Acquis', 'Achieved')} · <strong>EA</strong> = {t("En cours", 'In progress')} · <strong>NA</strong> = {t('Non acquis', 'Not achieved')}</span>
                  </>
                ) : (
                  <>
                    <span><strong>ABS</strong> = {t('Absent', 'Absent')}</span>
                    <span className="hidden sm:inline"><strong>{t('Entrée', 'Enter')}</strong> / <strong>Tab</strong> {t('pour valider', 'to confirm')}</span>
                    <span>{t('Sauvegarde auto', 'Auto-save')}</span>
                  </>
                )}
              </div>
            </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
