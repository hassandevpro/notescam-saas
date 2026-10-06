// Écran de saisie PRIMAIRE APC (moteur MINEDUB — compétences nationales).
//
// L'enseignant choisit Classe + Unité d'Apprentissage (UA 1-8/an) + Compétence
// (parmi les 11 nationales, chargées automatiquement). La grille affiche alors UN
// ÉLÈVE PAR LIGNE et UNE COLONNE PAR CRITÈRE applicable à cette compétence (barème
// officiel : chaque sous-compétence a son propre total de points par critère —
// ex. 1A = Oral/20 + Écrit/15 + Savoir-être/5). Le TOTAL et la COTE (A+/A/ECA/NA)
// sont calculés et affichés par élève.
//
// Cas particulier '6a' (activités physiques/sportives) : le barème dépend de
// l'aptitude sportive de l'élève (students.sport_aptitude) — la colonne "Pratique"
// est grisée pour un élève inapte (son barème n'en a pas).
//
// Monté par Grades.jsx quand la classe est résolue 'apc_primaire'.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSchoolStore } from '../../store/schoolStore';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { useT } from '../../lib/i18n';
import { validateGrade, gradeColor } from '../../lib/gradeEntry';
import { isSubjectScoped } from '../../lib/teacherScope';
import {
  competenceIdsForTeacher, unresolvedSubjectsForTeacher,
} from '../../core/primCompetenceMatch';
import { primNkey } from '../../lib/primService';
import { resolveClassEngine, primaireNiveauSlug } from '../../core/engineResolver';
// Le référentiel national est stocké en français : une classe du secteur
// anglophone voit ses compétences et ses critères en anglais, ici comme sur son
// bulletin.
import { primCompetenceLabel, primCritereLabel } from '../../core/referentielI18n';
import {
  competencesForNiveau, criteresForCompetence, competencePointsTotal, primCote,
  trimestreOfUA, PRIM_COTE_DEFAULT,
} from '../../core/primEngine';
import { baremeEnVigueur, notesHorsBareme } from '../../core/primColumnBareme';
import ReferentielEditor from './ReferentielEditor';
import { withLibelles } from '../../lib/referentielEcole';
import MobileEntryList from './MobileEntryList';
import SectionSelect from './SectionSelect';
import CompetenceGradeIO from './CompetenceGradeIO';
import UnlinkedTeacherNotice from './UnlinkedTeacherNotice';

// ── Barème d'une colonne (une évaluation) ────────────────────────────────────
// Le barème appartient à l'ÉVALUATION, pas au critère : l'Oral peut être noté /10
// en UA1 et /20 en UA3. Il est donc stocké sur chaque note
// (`prim_notes.points_max`) et relu depuis elles. Même forme que son pendant du
// premier cycle (ApcCompetenceWorkspace) : les deux écrans de saisie se tiennent.
function BaremeCell({ value, disabled, onCommit }) {
  const [local, setLocal] = useState(String(value ?? ''));
  useEffect(() => { setLocal(String(value ?? '')); }, [value]);
  const commit = () => {
    const n = parseFloat(String(local).replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) { setLocal(String(value ?? '')); return; }
    if (n !== value) onCommit(n);
  };
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-normal text-gray-500">
      /
      <input
        type="text"
        value={local}
        disabled={disabled}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
        className="w-9 text-center rounded border border-gray-200 px-0.5 py-0.5 text-[11px]
          focus:outline-none focus:border-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
      />
    </span>
  );
}

// ── Cellule note (bornée au barème /points_max du critère) ─────────────────────
function NoteCell({ value, max, disabled, onCommit }) {
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => { setLocal(value ?? ''); }, [value]);
  const commit = () => {
    const v = validateGrade(local, max);
    if (v === null) { setLocal(value ?? ''); return; }
    if (v !== (value ?? '')) onCommit(v);
  };
  if (disabled) {
    return <input type="text" value="—" disabled className="w-16 text-center rounded border border-gray-100 px-1 py-1 text-sm text-gray-300 bg-gray-50" />;
  }
  return (
    <input
      type="text"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
      placeholder="—"
      className={`w-16 text-center rounded border border-gray-200 px-1 py-1 text-sm
        focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-300
        placeholder:text-gray-300 ${gradeColor(local, max, 'ES')}`}
    />
  );
}

export default function PrimCompetenceWorkspace() {
  const t = useT();
  const navigate = useNavigate();
  const school = useAuthStore((s) => s.school);
  const role      = useAuthStore((s) => s.role);
  const teacherId = useAuthStore((s) => s.teacherId);
  // Mode 1 « enseignant de matière » : l'enseignant ne saisit QUE les compétences
  // qui lui sont affectées. Le rattachement passe par `prim_competence_id` quand
  // il existe, sinon par le NOM de la matière (voir primCompetenceMatch) : exiger
  // le lien rendait l'écran vide dans toute école ayant saisi son primaire à la
  // main — c'est-à-dire la majorité.
  const isSubjectTeacher = isSubjectScoped(role, school);

  const classes     = useSchoolStore((s) => s.classes);
  const subjects    = useSchoolStore((s) => s.subjects);
  const students    = useSchoolStore((s) => s.students);
  const referentiel = useSchoolStore((s) => s.primReferentiel);
  const primNotes   = useSchoolStore((s) => s.primNotes);
  const loadPrim    = useSchoolStore((s) => s.loadPrim);
  const savePrimNote = useSchoolStore((s) => s.savePrimNote);
  const masques        = useSchoolStore((s) => s.refMasques.prim);
  const libelles       = useSchoolStore((s) => s.refLibelles.prim);
  const loadRefMasques = useSchoolStore((s) => s.loadRefMasques);
  const addRef         = useSchoolStore((s) => s.addRefLigne);
  const renameRef      = useSchoolStore((s) => s.renameRefLigne);
  const removeRef      = useSchoolStore((s) => s.removeRefLigne);
  const restoreRef     = useSchoolStore((s) => s.restoreRefLigne);
  const resetLibelle   = useSchoolStore((s) => s.resetRefLibelle);

  const classId    = useUiStore((s) => s.gradesClassId);
  const setClassId = useUiStore((s) => s.setGradesClassId);
  const [ua, setUa] = useState(1);
  const [competenceId, setCompetenceId] = useState('');
  // Barème posé sur une colonne encore VIDE : il n'a nulle part où être stocké
  // (le barème vit sur les notes) tant qu'aucune note n'existe. On le retient donc
  // le temps de la saisie, pour que la colonne s'affiche et se borne déjà au bon
  // barème — la première note l'écrira.
  const [pendingBareme, setPendingBareme] = useState({});
  const [baremeMsg, setBaremeMsg] = useState(null);

  useEffect(() => { loadPrim(); }, [loadPrim]);

  const bareme = referentiel?.bareme?.length ? referentiel.bareme : PRIM_COTE_DEFAULT;

  // Classes primaire APC. En Mode 1, on restreint aux classes où l'enseignant a
  // au moins une compétence affectée.
  const primClassesAll = useMemo(
    () => classes.filter((c) => resolveClassEngine(school, c) === 'apc_primaire'),
    [classes, school],
  );

  const primClasses = useMemo(() => {
    let list = primClassesAll;
    if (isSubjectTeacher) {
      const comps = referentiel?.competences || [];
      list = list.filter(
        (c) => competenceIdsForTeacher(subjects, teacherId, c.id, comps).size > 0,
      );
    }
    return list.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }));
  }, [primClassesAll, isSubjectTeacher, subjects, teacherId, referentiel]);
  useEffect(() => {
    if (primClasses.length && !primClasses.some((c) => c.id === classId)) setClassId(primClasses[0].id);
  }, [primClasses, classId]);

  const selectedClass = primClasses.find((c) => c.id === classId) || null;
  const niveauSlug = selectedClass ? primaireNiveauSlug(selectedClass.level, selectedClass.name) : null;

  const sys = selectedClass?.system || 'FR';

  const competences = useMemo(() => {
    if (!referentiel || !niveauSlug) return [];
    const all = competencesForNiveau(referentiel, niveauSlug)
      .map((c) => ({ ...c, intitule: primCompetenceLabel(c, sys) }));
    if (!isSubjectTeacher) return all;
    // Mode 1 : ne garder que les compétences couvertes par mes matières.
    const mine = competenceIdsForTeacher(subjects, teacherId, classId, referentiel?.competences || []);
    return all.filter((c) => mine.has(c.id));
  }, [referentiel, niveauSlug, isSubjectTeacher, subjects, classId, teacherId, sys, masques, libelles]);

  useEffect(() => { loadRefMasques('prim'); }, [loadRefMasques]);
  const [refOpen, setRefOpen] = useState(false);

  useEffect(() => {
    if (competences.length && !competences.some((c) => c.id === competenceId)) setCompetenceId(competences[0].id);
  }, [competences, competenceId]);

  const classStudents = useMemo(
    () => students.filter((s) => s.class_id === classId).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [students, classId],
  );

  // Colonnes de critères pour la compétence sélectionnée. Pour '6a' (sport), le
  // barème dépend de l'aptitude — on affiche l'UNION apte/inapte (la colonne
  // "Pratique" sera grisée ligne par ligne pour un élève inapte, cf. criteresForStudent).
  const critereRows = (aptitude) => (niveauSlug
    ? criteresForCompetence(referentiel, niveauSlug, competenceId, aptitude)
      .map((cr) => ({ ...cr, nom: primCritereLabel(cr, sys) }))
    : []);
  const criteresApte   = critereRows('apte');
  const criteresInapte = critereRows('inapte');
  const criteres = useMemo(() => {
    if (competenceId !== '6a') return criteresApte;
    const byId = new Map(criteresApte.map((c) => [c.id, c]));
    for (const c of criteresInapte) if (!byId.has(c.id)) byId.set(c.id, c);
    return [...byId.values()].sort((a, b) => a.ordre - b.ordre);
  }, [competenceId, criteresApte, criteresInapte]);
  // Barème réellement applicable à UN élève (dépend de son aptitude pour '6a').
  const criteresForStudent = (stu) =>
    competenceId === '6a' ? (stu.sport_aptitude === 'inapte' ? criteresInapte : criteresApte) : criteresApte;

  // Note d'une cellule (compétence × critère × UA courante).
  const noteFor = (eleveId, critereId) => {
    const r = primNotes[primNkey(eleveId, competenceId, critereId, ua)];
    return r?.note != null ? String(r.note) : '';
  };
  // Les notes sont passées AVEC leur barème : `competencePointsTotal` additionne
  // les points possibles note par note, et non le barème officiel de la colonne.
  const notesByCritereFor = (eleveId) => {
    const out = {};
    for (const cr of criteres) {
      const r = primNotes[primNkey(eleveId, competenceId, cr.id, ua)];
      if (r?.note != null && r.note !== '') out[cr.id] = { note: r.note, max: r.points_max ?? cr.points_max };
    }
    return out;
  };
  const competenceTotal = (stu) => competencePointsTotal(notesByCritereFor(stu.id), criteresForStudent(stu));

  // Barème EN VIGUEUR pour une colonne : celui des notes déjà saisies de cette UA
  // (elles le portent), sinon celui que l'enseignant vient de poser, sinon le
  // barème officiel du référentiel. La même colonne peut donc valoir /10 sur une
  // UA et /20 sur une autre.
  const baremeFor = (critereId) => baremeEnVigueur(
    classStudents.map((stu) => primNotes[primNkey(stu.id, competenceId, critereId, ua)]),
    criteres.find((c) => c.id === critereId)?.points_max,
    pendingBareme[`${competenceId}_${critereId}`],
  );

  // Changement de barème d'une colonne (Oral, Écrit, Pratique, Savoir-être) pour
  // cette compétence et cette UA. REFUSÉ si une note déjà saisie le dépasse : on ne
  // transforme pas en silence un 18/20 en 18/10. L'enseignant corrige d'abord les
  // notes concernées — même règle que l'écran du premier cycle.
  const setBareme = (critereId, nouveau) => {
    const trop = notesHorsBareme(
      classStudents.map((stu) => ({
        id: stu.id,
        name: stu.name,
        note: primNotes[primNkey(stu.id, competenceId, critereId, ua)]?.note,
      })),
      nouveau,
    );
    if (trop.length) {
      setBaremeMsg({
        critereId,
        text: t(
          `Barème /${nouveau} refusé : ${trop.length} note(s) le dépassent (${trop.slice(0, 3).map((s) => s.name).join(', ')}${trop.length > 3 ? '…' : ''}). Corrigez-les d'abord.`,
          `Scale /${nouveau} refused: ${trop.length} grade(s) exceed it (${trop.slice(0, 3).map((s) => s.name).join(', ')}${trop.length > 3 ? '…' : ''}). Fix them first.`,
        ),
      });
      return;
    }
    setBaremeMsg(null);
    setPendingBareme((p) => ({ ...p, [`${competenceId}_${critereId}`]: nouveau }));
    // Les notes déjà saisies suivent le nouveau barème de l'évaluation.
    for (const stu of classStudents) {
      const r = primNotes[primNkey(stu.id, competenceId, critereId, ua)];
      if (r?.note != null && r.note !== '') {
        savePrimNote({
          eleveId: stu.id, competenceId, critereId, ua, note: r.note, pointsMax: nouveau,
        });
      }
    }
  };

  function renderClassPicker() {
    return (
      <select value={classId || ''} onChange={(e) => setClassId(e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
        {primClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
    return <div className="p-4 md:p-6"><div>{BackBtn}</div><div className="p-8 text-center text-gray-500">{t('Chargement du référentiel primaire APC…', 'Loading primary APC framework…')}</div></div>;
  }
  // Compte enseignant SANS fiche rattachée : la cause racine est le rattachement,
  // pas l'affectation des matières (voir UnlinkedTeacherNotice).
  if (role === 'teacher' && !teacherId && !primClasses.length) {
    return <div className="p-4 md:p-6 space-y-3"><div>{BackBtn}</div><UnlinkedTeacherNotice /></div>;
  }
  if (!primClasses.length) {
    const orphelines = isSubjectTeacher
      ? unresolvedSubjectsForTeacher(subjects, teacherId, null, referentiel?.competences || [])
      : [];
    return (
      <div className="p-4 md:p-6">
        <div>{BackBtn}</div>
        <div className="p-8 text-center text-gray-500">
          {orphelines.length > 0
            ? (
              <>
                {t(
                  'Aucune de vos matières ne se rattache à une compétence nationale (1A–6B) : ',
                  'None of your subjects maps to a national competency (1A–6B): ',
                )}
                <span className="font-medium text-gray-700">
                  {[...new Set(orphelines.map((m) => m.name))].join(', ')}
                </span>
                {t(
                  '. Demandez à l’administration de les renommer selon le référentiel, ou de vous affecter les matières que vous enseignez réellement.',
                  '. Ask the administration to rename them after the framework, or to assign you the subjects you actually teach.',
                )}
              </>
            )
            : isSubjectTeacher && primClassesAll.length > 0
            ? t(
              'Aucune matière du primaire ne vous est affectée. Demandez à l’administration de vous affecter vos matières.',
              'No primary subject is assigned to you. Ask the administration to assign your subjects.',
            )
            : t('Aucune classe primaire (SIL–CM2).', 'No primary class (SIL–CM2).')}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        {BackBtn}
        <h1 className="text-xl font-bold text-gray-800">{t('Saisie primaire APC (par compétences)', 'Primary APC entry (by competencies)')}</h1>
        <p className="text-sm text-gray-500">
          {t('Compétences nationales MINEDUB — chargées automatiquement. Votre école peut les adapter. Saisie par Unité d’Apprentissage (UA) ; barème et cote calculés.',
             'National MINEDUB competencies — loaded automatically. Your school can adapt them. Entry per Learning Unit (UA); scale and grade computed.')}
        </p>
        <button type="button" onClick={() => setRefOpen(true)}
          className="mt-2 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
          {t('Modifier les compétences', 'Edit competencies')}
        </button>
      </div>

      {refOpen && (
        <ReferentielEditor
          titre={t('Compétences du primaire', 'Primary competencies')}
          lignes={withLibelles(
            (referentiel?.competences || []).map((c) => ({ ...c, intitule: primCompetenceLabel(c, sys) })),
            libelles,
          )}
          masques={masques}
          motSingulier={t('compétence', 'competency')}
          renommable={() => true}
          onRename={(l, nom) => renameRef('prim', l.id, nom)}
          onAdd={(nom) => addRef('prim', nom)}
          onMasquer={(l) => removeRef('prim', l.id)}
          onSupprimer={(l) => removeRef('prim', l.id)}
          onDemasquer={(l) => restoreRef('prim', l.id)}
          onResetLibelle={(l) => resetLibelle('prim', l.id)}
          onClose={() => setRefOpen(false)}
        />
      )}

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
        <SectionSelect classes={classes} classId={classId} setClassId={setClassId} />
        <label className="text-sm min-w-0">
          <span className="block text-gray-500 mb-1">{t('Classe', 'Class')}</span>
          {renderClassPicker()}
        </label>
        <label className="text-sm min-w-0">
          <span className="block text-gray-500 mb-1">{t('Unité d’apprentissage', 'Learning unit')}</span>
          <select value={ua} onChange={(e) => setUa(Number(e.target.value))}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>UA{n} ({t('Trim.', 'Term')} {trimestreOfUA(n)})</option>
            ))}
          </select>
        </label>
        <label className="text-sm min-w-0">
          <span className="block text-gray-500 mb-1">{t('Compétence', 'Competency')}</span>
          <select value={competenceId} onChange={(e) => setCompetenceId(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm min-w-[16rem]">
            {competences.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.intitule}</option>)}
          </select>
        </label>
      </div>

      <div className="text-xs text-gray-500">
        {t('Barème officiel par critère (points) — variable selon la compétence · le total et la cote se calculent sur les critères déjà saisis.',
           'Official per-criterion scale (points) — varies by competency · total and grade are computed from criteria already entered.')}
        {' · '}
        {t(
          'le barème se change sous le nom du critère (Oral, Écrit…) et vaut pour cette UA : le total suit',
          'the scale is editable under the criterion name (Oral, Written…) and applies to this unit: the total follows',
        )}
      </div>

      {/* Refus d'un changement de barème qui invaliderait des notes déjà saisies. */}
      {baremeMsg && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {baremeMsg.text}
        </div>
      )}

      {niveauSlug && criteres.length > 0 && classStudents.length > 0 && (
        <CompetenceGradeIO
          filename={`notes_primaire_${selectedClass?.name || ''}_${(competences.find((c) => c.id === competenceId)?.code || 'competence')}_UA${ua}`}
          sheetName={`UA${ua}`}
          students={classStudents}
          columns={criteres.map((c) => ({ id: c.id, label: `${c.nom} /${baremeFor(c.id)}` }))}
          getCell={(sid, cid) => noteFor(sid, cid)}
          normalize={(raw, cid) => validateGrade(raw, baremeFor(cid))}
          onImport={(sid, cid, v) => savePrimNote({
            eleveId: sid, competenceId, critereId: cid, ua,
            note: v, pointsMax: baremeFor(cid),   // même raison qu'à la saisie directe
          })}
          valueHint={t('barème variable par critère (voir en-tête)', 'scale varies by criterion (see header)')}
        />
      )}

      {!niveauSlug ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
          {t('Niveau non reconnu (attendu SIL–CM2).', 'Level not recognized (expected SIL–CM2).')}
        </div>
      ) : competences.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
          {t('Aucune compétence nationale chargée. Exécutez la migration du référentiel.',
             'No national competency loaded. Run the framework migration.')}
        </div>
      ) : classStudents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
          {t('Aucun élève dans cette classe.', 'No student in this class.')}
        </div>
      ) : criteres.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
          {t('Barème non chargé pour cette compétence à ce niveau.', 'Scale not loaded for this competency at this level.')}
        </div>
      ) : (
        <>
        {/* TÉLÉPHONE — une carte par élève. Le barème reste en tête de carte :
            il appartient à l'évaluation, pas à l'élève, donc on ne le répète pas
            douze fois. Le total et la cote s'affichent sous les critères, là où
            on vient de les produire. */}
        <div className="md:hidden rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 mb-2 flex flex-wrap gap-x-4 gap-y-1">
          {criteres.map((c) => (
            <span key={c.id} className="text-xs text-gray-500 inline-flex items-center gap-1">
              {c.nom}
              <BaremeCell value={baremeFor(c.id)} onCommit={(n) => setBareme(c.id, n)} />
            </span>
          ))}
        </div>
        <MobileEntryList
          students={classStudents}
          columns={criteres.map((c) => ({ id: c.id, label: `${c.nom} · /${baremeFor(c.id)}` }))}
          subtitle={(stu) => {
            const { achieved, possible } = competenceTotal(stu);
            if (achieved == null) return null;
            const cote = primCote(achieved, possible, bareme);
            return `${achieved}/${possible}${cote ? ` · ${cote.cote}` : ''}`;
          }}
          isFilled={(stu, c) => noteFor(stu.id, c.id) !== '' && noteFor(stu.id, c.id) != null}
          renderCell={(stu, c) => (
            <NoteCell
              value={noteFor(stu.id, c.id)}
              max={baremeFor(c.id)}
              disabled={!new Set(criteresForStudent(stu).map((x) => x.id)).has(c.id)}
              onCommit={(v) => savePrimNote({
                eleveId: stu.id, competenceId, critereId: c.id, ua,
                note: v, pointsMax: baremeFor(c.id),
              })}
            />
          )}
        />

        {/* ORDINATEUR */}
        <div className="hidden md:block overflow-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-medium text-gray-600">{t('Élève', 'Student')}</th>
                {criteres.map((c) => (
                  <th key={c.id} className="px-3 py-2 text-left font-medium text-gray-600">
                    <span className="block truncate">{c.nom}</span>
                    {/* Barème de CETTE évaluation : celui du référentiel par
                        défaut, modifiable là où l'on saisit. */}
                    <BaremeCell value={baremeFor(c.id)}
                      onCommit={(n) => setBareme(c.id, n)} />
                  </th>
                ))}
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('Total · Cote', 'Total · Grade')}</th>
              </tr>
            </thead>
            <tbody>
              {classStudents.map((stu) => {
                const studentCriteres = criteresForStudent(stu);
                const studentCritereIds = new Set(studentCriteres.map((c) => c.id));
                const { achieved, possible } = competenceTotal(stu);
                const cote = achieved != null ? primCote(achieved, possible, bareme) : null;
                return (
                  <tr key={stu.id} className="border-t border-gray-100">
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium text-gray-700 whitespace-nowrap">
                      {stu.name}
                      {competenceId === '6a' && stu.sport_aptitude === 'inapte' && (
                        <span className="ml-1.5 text-[10px] text-amber-600 font-normal">({t('inapte', 'unfit')})</span>
                      )}
                    </td>
                    {criteres.map((c) => (
                      <td key={c.id} className="px-3 py-1.5">
                        <NoteCell
                          value={noteFor(stu.id, c.id)}
                          max={baremeFor(c.id)}
                          disabled={!studentCritereIds.has(c.id)}
                          // La note NAÎT avec le barème de sa colonne. Sans ce
                          // `pointsMax`, une note saisie APRÈS un changement de
                          // barème repartait au barème officiel : la colonne se
                          // remettait alors toute seule à l'ancienne valeur, et il
                          // fallait refixer le barème une deuxième fois.
                          onCommit={(v) => savePrimNote({
                            eleveId: stu.id, competenceId, critereId: c.id, ua,
                            note: v, pointsMax: baremeFor(c.id),
                          })}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-[11px] text-gray-500 whitespace-nowrap">
                      {achieved != null ? `${achieved}/${possible} · ` : '—'}{cote ? cote.cote : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
