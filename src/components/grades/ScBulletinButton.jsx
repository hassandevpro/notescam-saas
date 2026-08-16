// Barre flottante d'export des bulletins SECOND CYCLE MINESEC (groupés).
// Autonome : lit tout depuis les stores et ne s'affiche QUE pour une classe de
// second cycle (résolue par engineResolver). N'altère pas l'écran de saisie.

import { useState } from 'react';
import { useSchoolStore } from '../../store/schoolStore';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { resolveClassEngine } from '../../core/engineResolver';
import { classIdentity } from '../../lib/schoolIdentity';
import { exportScTrimesterBulletins } from '../../lib/scBulletinPdf';
import { PRINT_RESULT } from '../../lib/print';

const TRIMS = [
  { id: 't1', label: 'Trimestre 1', seqs: [1, 2] },
  { id: 't2', label: 'Trimestre 2', seqs: [3, 4] },
  { id: 't3', label: 'Trimestre 3', seqs: [5, 6] },
  { id: 'annual', label: 'Annuel', seqs: [1, 2, 3, 4, 5, 6] },
];

export default function ScBulletinButton() {
  const classes  = useSchoolStore((s) => s.classes);
  const subjects = useSchoolStore((s) => s.subjects);
  const students = useSchoolStore((s) => s.students);
  const teachers = useSchoolStore((s) => s.teachers);
  const gradeMap = useSchoolStore((s) => s.gradeMap);
  const schoolUnits = useSchoolStore((s) => s.schoolUnits);
  const school   = useAuthStore((s) => s.school);
  const classId  = useUiStore((s) => s.gradesClassId);

  const [trim, setTrim] = useState('t1');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg]   = useState('');
  const [batch, setBatch] = useState({ index: 0, total: 1 });

  const cls = classes.find((c) => c.id === classId) || null;
  // N'apparaît que pour une classe dont le moteur résolu est le second cycle.
  if (!cls || resolveClassEngine(school, cls) !== 'sc') return null;

  const sys           = cls.system || 'FR';
  const classSubjects = subjects.filter((s) => s.class_id === classId);
  const classStudents = students
    .filter((s) => s.class_id === classId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const serieLabel = cls.serie ? `Série ${String(cls.serie).toUpperCase()}` : '';

  const run = async () => {
    if (!classStudents.length || !classSubjects.length) {
      setMsg('Aucune donnée à imprimer pour cette classe.');
      setTimeout(() => setMsg(''), 3000);
      return;
    }
    const t = TRIMS.find((x) => x.id === trim);
    // Identité effective = unité pédagogique de la classe (logo/cachet/directeur).
    const docSchool = classIdentity(school, cls, schoolUnits);
    setBusy(true); setMsg('');
    try {
      const { result, batches } = await exportScTrimesterBulletins({
        subjects: classSubjects, allGrades: gradeMap, classId, seqs: t.seqs,
        students: classStudents, teachers, school: docSchool, sys, trimestreId: t.id,
        classLabel: cls.name, serieLabel, gradeScale: school?.grade_scale,
        title: `Bulletins ${cls.name || ''} — ${t.label}`,
        batchIndex: batch.index,
      });
      if (result === PRINT_RESULT.BLOCKED) {
        setMsg("Fenêtre d'impression bloquée — autorisez les pop-ups.");
        setTimeout(() => setMsg(''), 6000);
      } else if (result === PRINT_RESULT.EMPTY) {
        setMsg('Aucun bulletin à imprimer.');
        setTimeout(() => setMsg(''), 4000);
      } else {
        setBatch({ index: batch.index + 1, total: batches });
      }
    } catch (e) {
      console.error('bulletins SC', e);
      setMsg("Erreur lors de la préparation des bulletins.");
      setTimeout(() => setMsg(''), 4000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white shadow-lg px-3 py-2 text-sm">
      {msg
        ? <span className="text-red-600 px-1">{msg}</span>
        : <span className="text-gray-500 hidden sm:inline">Bulletins MINESEC</span>}
      <select value={trim} onChange={(e) => { setTrim(e.target.value); setBatch({ index: 0, total: 1 }); }}
        className="border border-gray-200 rounded px-2 py-1 bg-white" disabled={busy}>
        {TRIMS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
      </select>
      <button onClick={run} disabled={busy || (batch.total > 1 && batch.index >= batch.total)}
        className="px-3 py-1 rounded-full bg-brand-500 text-white disabled:opacity-50">
        {busy ? 'Préparation…'
          : batch.total > 1 && batch.index >= batch.total ? '✓ Terminé'
          : batch.total > 1 ? `Imprimer le lot ${batch.index + 1}/${batch.total}`
          : 'Imprimer'}
      </button>
    </div>
  );
}
