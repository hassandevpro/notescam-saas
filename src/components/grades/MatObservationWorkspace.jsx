// Écran de saisie MATERNELLE (moteur MINEDUB — domaines pédagogiques).
//
// L'enseignant choisit Classe + Trimestre. Le système charge AUTOMATIQUEMENT les
// 8 domaines officiels (non modifiables). Pour chaque élève × domaine, on saisit
// un NIVEAU D'ACQUISITION (A / ECA / NA) et une OBSERVATION pédagogique libre.
//
// Monté par Grades.jsx quand la classe est résolue 'maternelle'.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSchoolStore } from '../../store/schoolStore';
import { useUiStore } from '../../store/uiStore';
import { useT } from '../../lib/i18n';
import { obsNkey } from '../../lib/matService';
import { resolveClassEngine, maternelleNiveauSlug } from '../../core/engineResolver';
import { domainesForMaternelle, MAT_ACQUIS, MAT_ACQUIS_COLORS } from '../../core/matEngine';
import { useAuthStore } from '../../store/authStore';
import SectionSelect from './SectionSelect';

// ── Cellule niveau d'acquisition (A / ECA / NA) ─────────────────────────────────
function NiveauCell({ value, onCommit }) {
  return (
    <div className="flex gap-1 justify-center">
      {MAT_ACQUIS.map((a) => (
        <button
          key={a.code}
          type="button"
          title={a.libelle}
          onClick={() => onCommit(value === a.code ? '' : a.code)}
          className={`px-2 py-0.5 rounded text-xs font-bold transition-colors border ${
            value === a.code ? 'text-white border-transparent' : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
          }`}
          style={value === a.code ? { background: MAT_ACQUIS_COLORS[a.code], borderColor: MAT_ACQUIS_COLORS[a.code] } : {}}
        >
          {a.code}
        </button>
      ))}
    </div>
  );
}

// ── Cellule observation (texte libre) ───────────────────────────────────────────
function ObsCell({ value, onCommit }) {
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => { setLocal(value ?? ''); }, [value]);
  const commit = () => { if (local !== (value ?? '')) onCommit(local); };
  return (
    <input
      type="text"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
      placeholder="—"
      className="w-56 rounded border border-gray-200 px-2 py-1 text-sm
        focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-300 placeholder:text-gray-300"
    />
  );
}

export default function MatObservationWorkspace() {
  const t = useT();
  const navigate = useNavigate();
  const school = useAuthStore((s) => s.school);

  const classes         = useSchoolStore((s) => s.classes);
  const students        = useSchoolStore((s) => s.students);
  const referentiel     = useSchoolStore((s) => s.matReferentiel);
  const observations    = useSchoolStore((s) => s.matObservations);
  const loadMat         = useSchoolStore((s) => s.loadMat);
  const saveObservation = useSchoolStore((s) => s.saveMatObservation);

  const classId    = useUiStore((s) => s.gradesClassId);
  const setClassId = useUiStore((s) => s.setGradesClassId);
  const [trimestre, setTrimestre] = useState(1);
  const [view, setView] = useState('niveaux'); // 'niveaux' | 'observations'

  useEffect(() => { loadMat(); }, [loadMat]);

  const trimestreId = `t${trimestre}`;

  // Classes maternelle uniquement (résolues par le moteur).
  const matClasses = useMemo(
    () => classes
      .filter((c) => resolveClassEngine(school, c) === 'maternelle')
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true })),
    [classes, school],
  );
  useEffect(() => {
    if (matClasses.length && !matClasses.some((c) => c.id === classId)) setClassId(matClasses[0].id);
  }, [matClasses, classId]);

  const selectedClass = matClasses.find((c) => c.id === classId) || null;
  const niveauSlug = selectedClass ? maternelleNiveauSlug(selectedClass.level, selectedClass.name) : null;

  const domaines = useMemo(() => domainesForMaternelle(referentiel), [referentiel]);

  const classStudents = useMemo(
    () => students.filter((s) => s.class_id === classId).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [students, classId],
  );

  const recordFor = (eleveId, domaineId) => observations[obsNkey(eleveId, domaineId, trimestreId)] || null;
  const saveCell = (eleveId, domaineId, patch) => {
    const rec = recordFor(eleveId, domaineId);
    saveObservation({
      eleveId, domaineId, trimestreId,
      niveauAcquis: 'niveauAcquis' in patch ? patch.niveauAcquis : (rec?.niveau_acquis ?? ''),
      observation:  'observation'  in patch ? patch.observation  : (rec?.observation ?? ''),
    });
  };

  function renderClassPicker() {
    return (
      <select value={classId || ''} onChange={(e) => setClassId(e.target.value)}
        className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
        {matClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    );
  }

  const BackBtn = (
    <button type="button" onClick={() => navigate(-1)}
      className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 mb-2">
      ← {t('Retour', 'Back')}
    </button>
  );

  if (!referentiel) {
    return <div className="p-4 md:p-6"><div>{BackBtn}</div><div className="p-8 text-center text-gray-500">{t('Chargement du référentiel maternelle…', 'Loading nursery framework…')}</div></div>;
  }
  if (!matClasses.length) {
    return <div className="p-4 md:p-6"><div>{BackBtn}</div><div className="p-8 text-center text-gray-500">{t('Aucune classe maternelle (PS/MS/GS).', 'No nursery class (PS/MS/GS).')}</div></div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        {BackBtn}
        <h1 className="text-xl font-bold text-gray-800">{t('Évaluation maternelle (par domaines)', 'Nursery assessment (by domains)')}</h1>
        <p className="text-sm text-gray-500">
          {t('Domaines officiels MINEDUB — niveaux d’acquisition A / ECA / NA, par trimestre.',
             'Official MINEDUB domains — acquisition levels A / ECA / NA, per term.')}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <SectionSelect classes={classes} classId={classId} setClassId={setClassId} />
        <label className="text-sm">
          <span className="block text-gray-500 mb-1">{t('Classe', 'Class')}</span>
          {renderClassPicker()}
        </label>
        <label className="text-sm">
          <span className="block text-gray-500 mb-1">{t('Trimestre', 'Term')}</span>
          <select value={trimestre} onChange={(e) => setTrimestre(Number(e.target.value))}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
            {[1, 2, 3].map((n) => <option key={n} value={n}>{t('Trimestre', 'Term')} {n}</option>)}
          </select>
        </label>
        <div className="ml-auto inline-flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          <button onClick={() => setView('niveaux')}
            className={`px-3 py-2 ${view === 'niveaux' ? 'bg-brand-500 text-white' : 'bg-white text-gray-600'}`}>
            {t('Niveaux', 'Levels')}
          </button>
          <button onClick={() => setView('observations')}
            className={`px-3 py-2 ${view === 'observations' ? 'bg-brand-500 text-white' : 'bg-white text-gray-600'}`}>
            {t('Observations', 'Observations')}
          </button>
        </div>
      </div>

      {!niveauSlug && (
        <div className="text-xs text-amber-600">
          {t('Niveau non reconnu (attendu PS/MS/GS) — les domaines restent saisissables.',
             'Level not recognized (expected PS/MS/GS) — domains remain editable.')}
        </div>
      )}

      {classStudents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
          {t('Aucun élève dans cette classe.', 'No student in this class.')}
        </div>
      ) : (
        <div className="overflow-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-medium text-gray-600">{t('Élève', 'Student')}</th>
                {domaines.map((d) => (
                  <th key={d.id} className="px-3 py-2 text-left font-medium text-gray-600 max-w-[16rem]" title={d.intitule}>
                    <span className="block text-[11px] text-gray-400">{d.code}</span>
                    <span className="block truncate">{d.intitule}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {classStudents.map((stu) => (
                <tr key={stu.id} className="border-t border-gray-100">
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium text-gray-700 whitespace-nowrap">{stu.name}</td>
                  {domaines.map((d) => {
                    const rec = recordFor(stu.id, d.id);
                    return (
                      <td key={d.id} className="px-3 py-1.5">
                        {view === 'niveaux' ? (
                          <NiveauCell value={rec?.niveau_acquis || ''} onCommit={(v) => saveCell(stu.id, d.id, { niveauAcquis: v })} />
                        ) : (
                          <ObsCell value={rec?.observation || ''} onCommit={(v) => saveCell(stu.id, d.id, { observation: v })} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
