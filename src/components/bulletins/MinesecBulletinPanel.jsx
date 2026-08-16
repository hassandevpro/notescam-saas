// Panneau d'export des bulletins OFFICIELS MINESEC sur la page Documents/Bulletins.
//
// Les bulletins APC (premier cycle) et Second Cycle MINESEC ne sont pas des
// aperçus React (comme Classique/Moderne) mais des documents PDF officiels
// générés via le pipeline HTML→PNG→jsPDF. Ce panneau les expose « parmi les
// bulletins présents » : il s'affiche À LA PLACE du sélecteur de format quand la
// classe sélectionnée est résolue sur le moteur 'apc' ou 'sc'.
//
// Autonome : lit tout depuis les stores à partir de la classe choisie dans la
// page Bulletins (uiStore.bulletinsClassId) ; ne dépend d'aucune prop.

import { useEffect, useMemo, useState } from 'react';
import { useSchoolStore } from '../../store/schoolStore';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { useT } from '../../lib/i18n';
import { resolveClassEngine, firstCycleClasseSlug } from '../../core/engineResolver';
import { classIdentity } from '../../lib/schoolIdentity';
import { exportApcTrimesterBulletins } from '../../lib/apcBulletinPdf';
import { exportScTrimesterBulletins } from '../../lib/scBulletinPdf';
import { PRINT_RESULT } from '../../lib/print';
import { teacherByMatiere } from '../../lib/teacherNames';

// Trimestres MINESEC — séquences sources (S1/S2→T1 …). 'annual' = année entière.
const TRIMS = [
  { id: 't1',     fr: 'Premier trimestre',    en: 'First term',  seqs: [1, 2] },
  { id: 't2',     fr: 'Deuxième trimestre',   en: 'Second term', seqs: [3, 4] },
  { id: 't3',     fr: 'Troisième trimestre',  en: 'Third term',  seqs: [5, 6] },
  { id: 'annual', fr: 'Annuel',               en: 'Annual',      seqs: [1, 2, 3, 4, 5, 6] },
];

export default function MinesecBulletinPanel() {
  const t = useT();
  const classes  = useSchoolStore((s) => s.classes);
  const subjects = useSchoolStore((s) => s.subjects);
  const students = useSchoolStore((s) => s.students);
  const teachers = useSchoolStore((s) => s.teachers);
  const gradeMap = useSchoolStore((s) => s.gradeMap);
  const schoolUnits  = useSchoolStore((s) => s.schoolUnits);
  const referentiel  = useSchoolStore((s) => s.apcReferentiel);
  const apcNotes     = useSchoolStore((s) => s.apcNotes);
  const loadApc      = useSchoolStore((s) => s.loadApc);
  const loadSc       = useSchoolStore((s) => s.loadSc);
  const school   = useAuthStore((s) => s.school);
  const classId  = useUiStore((s) => s.bulletinsClassId);

  const [trim, setTrim] = useState('t1');
  const [busy, setBusy] = useState(false);
  // Lots d'impression : au-delà du seuil du socle, une classe part en plusieurs
  // fenêtres, chacune sur un clic de l'utilisateur.
  const [batch, setBatch] = useState({ index: 0, total: 1 });
  const [msg, setMsg]   = useState(null);   // { type:'err'|'ok', text }

  const cls    = classes.find((c) => c.id === classId) || null;
  const engine = cls ? resolveClassEngine(school, cls) : 'classic';

  // Le moteur APC est strictement trimestriel (t1/t2/t3) ; le Second Cycle gère
  // aussi le bulletin annuel. On filtre la liste en conséquence.
  const trimOptions = engine === 'apc' ? TRIMS.filter((x) => x.id !== 'annual') : TRIMS;
  // Si la période courante n'existe plus pour ce moteur, on retombe sur t1.
  useEffect(() => {
    if (!trimOptions.some((x) => x.id === trim)) setTrim('t1');
  }, [engine]); // eslint-disable-line react-hooks/exhaustive-deps

  // Charge le référentiel adéquat à la demande (idempotent côté store).
  useEffect(() => {
    if (engine === 'apc') loadApc();
    if (engine === 'sc')  loadSc();
  }, [engine, loadApc, loadSc]);

  const classStudents = useMemo(
    () => students.filter((s) => s.class_id === classId).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [students, classId],
  );

  // Ne s'affiche que pour une classe sur un moteur référentiel MINESEC.
  if (!cls || (engine !== 'apc' && engine !== 'sc')) return null;

  const sys     = cls.system || 'FR';
  const trimDef = TRIMS.find((x) => x.id === trim) || TRIMS[0];
  const flash   = (type, text, ms = 4000) => { setMsg({ type, text }); setTimeout(() => setMsg(null), ms); };

  const exportApc = async () => {
    const classeSlug = firstCycleClasseSlug(cls.level, cls.name);
    if (!referentiel) { flash('err', t('Référentiel APC en cours de chargement…', 'APC framework still loading…')); return; }
    if (!classeSlug)  { flash('err', t("Classe non reconnue comme premier cycle (6e–3e).", 'Class not recognized as first cycle (6e–3e).')); return; }
    const classSubjects = subjects.filter((s) => s.class_id === classId);
    const teacherMap = teacherByMatiere(referentiel?.matieres, classSubjects, teachers);
    const docSchool = classIdentity(school, cls, schoolUnits);
    return exportApcTrimesterBulletins(referentiel, apcNotes, {
      classeSlug, trimestreId: trim, // APC : t1/t2/t3 uniquement (pas d'annuel)
      classLabel: cls.name, school: docSchool, sys,
      students: classStudents, effectif: classStudents.length,
      teacherByMatiere: teacherMap,
      title: `${t('Bulletins APC', 'APC report cards')} — ${cls.name || ''} — ${trimDef.fr}`,
      batchIndex: batch.index,
    });
  };

  const exportSc = async () => {
    const classSubjects = subjects.filter((s) => s.class_id === classId);
    const serieLabel = cls.serie ? `Série ${String(cls.serie).toUpperCase()}` : '';
    const docSchool = classIdentity(school, cls, schoolUnits);
    return exportScTrimesterBulletins({
      subjects: classSubjects, allGrades: gradeMap, classId, seqs: trimDef.seqs,
      students: classStudents, teachers, school: docSchool, sys, trimestreId: trim,
      classLabel: cls.name, serieLabel, gradeScale: school?.grade_scale,
      title: `${t('Bulletins', 'Report cards')} — ${cls.name || ''} — ${trimDef.fr}`,
      batchIndex: batch.index,
    });
  };

  const run = async () => {
    if (!classStudents.length) { flash('err', t('Aucun élève dans cette classe.', 'No student in this class.')); return; }
    setBusy(true); setMsg(null);
    try {
      const out = engine === 'apc' ? await exportApc() : await exportSc();
      const { result, batches, pages } = out || {};
      if (result === PRINT_RESULT.BLOCKED) {
        flash('err', t("Fenêtre d'impression bloquée par le navigateur. Autorisez les pop-ups pour ce site.",
                       'Print window blocked by the browser. Allow pop-ups for this site.'), 8000);
      } else if (result === PRINT_RESULT.EMPTY) {
        flash('err', t('Aucun bulletin générable — vérifiez les notes de la période.',
                       'No report card to generate — check the grades for this period.'));
      } else {
        setBatch({ index: batch.index + 1, total: batches || 1 });
        flash('ok', t(`${pages} page(s) envoyée(s) à l'impression.`, `${pages} page(s) sent to the printer.`));
      }
    } catch (e) {
      console.error('MinesecBulletinPanel', e);
      flash('err', t('Erreur lors de la préparation des bulletins.', 'Error while preparing the report cards.'));
    } finally {
      setBusy(false);
    }
  };

  const isApc = engine === 'apc';
  const title = isApc
    ? t('Bulletin APC officiel — premier cycle', 'Official APC report card — first cycle')
    : t('Bulletin Second Cycle MINESEC', 'MINESEC Second Cycle report card');
  const subtitle = isApc
    ? t('Bulletin par compétences (MINESEC). Document officiel imprimable (enregistrable en PDF).',
        'Competency-based report card (MINESEC). Official document, printable and saveable as PDF.')
    : `${t('Lycée — bulletin par série', 'High school — report card by stream')}${cls.serie ? ` · Série ${String(cls.serie).toUpperCase()}` : ''}. ${t('Document officiel imprimable (enregistrable en PDF).', 'Official document, printable and saveable as PDF.')}`;

  return (
    <div className="mb-4 no-print rounded-xl border border-brand-200 bg-brand-50/60 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="text-2xl leading-none">{isApc ? '🎯' : '🏛️'}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 mt-3">
        <label className="text-sm">
          <span className="block text-gray-500 mb-1 text-xs">{t('Période', 'Period')}</span>
          <select value={trim} onChange={(e) => { setTrim(e.target.value); setBatch({ index: 0, total: 1 }); }} disabled={busy}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white">
            {trimOptions.map((x) => <option key={x.id} value={x.id}>{sys === 'EN' ? x.en : x.fr}</option>)}
          </select>
        </label>
        <button onClick={run} disabled={busy || !classStudents.length || (batch.total > 1 && batch.index >= batch.total)}
          className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
          {busy ? t('Préparation…', 'Preparing…')
            : batch.total > 1 && batch.index >= batch.total ? t('✓ Terminé', '✓ Done')
            : batch.total > 1 ? `🖨 ${t('Imprimer le lot', 'Print batch')} ${batch.index + 1}/${batch.total}`
            : `🖨 ${t('Imprimer les bulletins', 'Print report cards')}`}
        </button>
        <span className="text-xs text-gray-400">
          {t(`${classStudents.length} élève(s) dans la classe`, `${classStudents.length} student(s) in the class`)}
        </span>
        {msg && (
          <span className={`text-xs font-medium ${msg.type === 'err' ? 'text-red-600' : 'text-emerald-600'}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
