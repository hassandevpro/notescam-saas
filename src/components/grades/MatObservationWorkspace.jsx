// Écran de saisie MATERNELLE (moteur MINEDUB — domaines pédagogiques).
//
// L'enseignant choisit Classe + Trimestre. Le système charge AUTOMATIQUEMENT les
// 8 domaines officiels (non modifiables). Pour chaque élève × domaine, on saisit
// un NIVEAU D'ACQUISITION (A / ECA / NA) et une OBSERVATION pédagogique libre.
//
// Monté par Grades.jsx quand la classe est résolue 'maternelle'.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSchoolStore } from '../../store/schoolStore';
import { useUiStore } from '../../store/uiStore';
import { useT } from '../../lib/i18n';
import { obsNkey } from '../../lib/matService';
import { resolveClassEngine, maternelleNiveauSlug } from '../../core/engineResolver';
import { domainesForMaternelle, MAT_ACQUIS, MAT_ACQUIS_COLORS, MAT_ACQUIS_CODES } from '../../core/matEngine';
import { matDomaineLabel, matAcquisLabel, matAcquisCode, matAcquisFromInput } from '../../core/referentielI18n';
import {
  domaineIdsForTeacher, unresolvedSubjectsForTeacher, isClassTitulaire,
  domaineLabelOverrides, withDomaineOverrides,
} from '../../core/matDomaineMatch';
import { isSubjectScoped } from '../../lib/teacherScope';
import { useAuthStore } from '../../store/authStore';
import SectionSelect from './SectionSelect';
import CompetenceGradeIO from './CompetenceGradeIO';
import UnlinkedTeacherNotice from './UnlinkedTeacherNotice';
import ClassSubjectsEditor from './ClassSubjectsEditor';
import { canManageClassSubjects } from '../../lib/teacherScope';
import { hasCapability } from '../../config/capabilities';

// ── Cellule niveau d'acquisition (A / ECA / NA) ─────────────────────────────────
// L'infobulle de chaque cote suit la langue de l'interface. Les libellés anglais
// viennent de la table officielle (referentielI18n), pour qu'une cote et sa
// légende ne se contredisent jamais d'un écran à l'autre.
// `sys` = système de la CLASSE : une Nursery anglophone lit « IP », pas « ECA »
// (sigle français). La valeur commitée reste le code canonique.
function NiveauCell({ value, sys, onCommit }) {
  const t = useT();
  return (
    <div className="flex gap-1 justify-center">
      {MAT_ACQUIS.map((a) => (
        <button
          key={a.code}
          type="button"
          title={sys === 'EN' ? matAcquisLabel(a.code, a.libelle, 'EN') : t(a.libelle, matAcquisLabel(a.code, a.libelle, 'EN'))}
          onClick={() => onCommit(value === a.code ? '' : a.code)}
          className={`px-2 py-0.5 rounded text-xs font-bold transition-colors border ${
            value === a.code ? 'text-white border-transparent' : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
          }`}
          style={value === a.code ? { background: MAT_ACQUIS_COLORS[a.code], borderColor: MAT_ACQUIS_COLORS[a.code] } : {}}
        >
          {matAcquisCode(a.code, sys)}
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
  const role      = useAuthStore((s) => s.role);
  const permissions = useAuthStore((s) => s.permissions);
  const teacherId = useAuthStore((s) => s.teacherId);
  // Mode 1 « enseignant de matière » : l'enseignant ne voit que SES domaines.
  // Exception assumée — le TITULAIRE garde les 8 : en maternelle, le référentiel
  // est une grille de développement de l'enfant observée par l'institutrice de la
  // classe, pas un découpage disciplinaire (voir matDomaineMatch).
  const subjectScoped = isSubjectScoped(role, school);

  const classes         = useSchoolStore((s) => s.classes);
  const subjects        = useSchoolStore((s) => s.subjects);
  const students        = useSchoolStore((s) => s.students);
  const referentiel     = useSchoolStore((s) => s.matReferentiel);
  const observations    = useSchoolStore((s) => s.matObservations);
  const loadMat         = useSchoolStore((s) => s.loadMat);
  const saveObservation = useSchoolStore((s) => s.saveMatObservation);
  const configureClassSubjects = useSchoolStore((s) => s.configureClassSubjects);

  const classId    = useUiStore((s) => s.gradesClassId);
  const setClassId = useUiStore((s) => s.setGradesClassId);
  const [trimestre, setTrimestre] = useState(1);
  const [view, setView] = useState('niveaux'); // 'niveaux' | 'observations'
  // Le chargement du référentiel a-t-il ABOUTI (succès ou échec) ? Sans ce drapeau,
  // une école dont les domaines ne sont pas encore en base restait bloquée sur
  // « Chargement du référentiel… » : l'enseignante n'avait ni domaine ni message.
  const [refLoaded, setRefLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.resolve(loadMat()).finally(() => { if (alive) setRefLoaded(true); });
    return () => { alive = false; };
  }, [loadMat]);

  const trimestreId = `t${trimestre}`;

  // Les 8 domaines officiels, avant tout filtrage par enseignant. Les intitulés
  // du référentiel sont en français en base ; la localisation se fait plus bas,
  // une fois la classe connue (c'est elle qui porte le système linguistique).
  const domainesAll = useMemo(() => domainesForMaternelle(referentiel), [referentiel]);

  // Classes maternelle uniquement (résolues par le moteur).
  const matClassesAll = useMemo(
    () => classes.filter((c) => resolveClassEngine(school, c) === 'maternelle'),
    [classes, school],
  );

  const matClasses = useMemo(() => {
    let list = matClassesAll;
    if (subjectScoped) {
      list = list.filter((c) => isClassTitulaire(c, teacherId)
        || domaineIdsForTeacher(subjects, teacherId, c.id, domainesAll).size > 0);
    }
    return list.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }));
  }, [matClassesAll, subjectScoped, teacherId, subjects, domainesAll]);
  useEffect(() => {
    if (matClasses.length && !matClasses.some((c) => c.id === classId)) setClassId(matClasses[0].id);
  }, [matClasses, classId]);

  const selectedClass = matClasses.find((c) => c.id === classId) || null;
  const niveauSlug = selectedClass ? maternelleNiveauSlug(selectedClass.level, selectedClass.name) : null;

  // Qui peut (re)configurer les domaines de cette classe ? Même règle que partout
  // ailleurs — teacherScope est le miroir de la policy RLS.
  const isDelegate = hasCapability(permissions, '/app/classes');
  const canManageDomaines = canManageClassSubjects({
    role, school, cls: selectedClass, teacherId, isDelegate,
  });
  const [domainesOpen, setDomainesOpen] = useState(false);

  // ── Les 8 domaines se matérialisent TOUT SEULS ──────────────────────────────
  // Sans ligne `subjects`, la classe n'a rien à réétiqueter : l'écran affichait
  // une liste vide et renvoyait vers un bouton « Configurer ». C'est une corvée
  // sans décision — le contenu est le référentiel officiel, il n'y a rien à
  // choisir. On le pose donc à l'ouverture, en silence.
  //
  // `configureClassSubjects` est idempotente (no-op si la classe a déjà des
  // matières) et le ref est garanti chargé ici. On ne tente RIEN si le compte
  // n'a pas le droit d'écrire : une insertion refusée par la RLS repartirait en
  // boucle dans la file hors-ligne (cf. cd04fd9).
  const tentees = useRef(new Set());
  useEffect(() => {
    if (!selectedClass || !domainesAll.length) return;
    if (!canManageDomaines) return;
    if (subjects.some((s) => s.class_id === selectedClass.id)) return;
    if (tentees.current.has(selectedClass.id)) return;
    tentees.current.add(selectedClass.id);
    configureClassSubjects(selectedClass);
  }, [selectedClass, domainesAll.length, canManageDomaines, subjects, configureClassSubjects]);

  // Les intitulés du référentiel sont en français en base : une classe du
  // secteur anglophone doit les voir en anglais, ici comme sur son bulletin.
  const sys = selectedClass?.system || 'FR';
  const estTitulaire = isClassTitulaire(selectedClass, teacherId);
  const domaines = useMemo(() => {
    // Libellé officiel localisé, PUIS la surcharge de l'école si elle en a une.
    // Les 8 domaines sont nationaux (et `mat_observations.domaine_id` porte une FK
    // vers eux) : une école ne les renomme pas en base, elle les réétiquette chez
    // elle par la ligne `subjects` qui porte leur `mat_domaine_id`.
    const base = domainesAll.map((d) => ({ ...d, intitule: matDomaineLabel(d, sys) }));
    const all = withDomaineOverrides(base, domaineLabelOverrides(subjects, classId, domainesAll));
    if (!subjectScoped || estTitulaire) return all;
    const mine = domaineIdsForTeacher(subjects, teacherId, classId, domainesAll);
    return all.filter((d) => mine.has(d.id));
  }, [domainesAll, sys, subjectScoped, estTitulaire, subjects, teacherId, classId]);


  // Mes matières de cette classe qui ne se rattachent à aucun domaine : on les
  // nomme. Sans objet pour un titulaire, qui garde les 8 domaines.
  const matieresOrphelines = useMemo(
    () => (subjectScoped && !estTitulaire
      ? unresolvedSubjectsForTeacher(subjects, teacherId, classId, domainesAll)
      : []),
    [subjectScoped, estTitulaire, subjects, teacherId, classId, domainesAll],
  );

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

  if (!referentiel && !refLoaded) {
    return <div className="p-4 md:p-6"><div>{BackBtn}</div><div className="p-8 text-center text-gray-500">{t('Chargement du référentiel maternelle…', 'Loading nursery framework…')}</div></div>;
  }
  // Référentiel chargé mais VIDE : les 8 domaines officiels ne sont pas en base
  // (migration `supabase_maternelle.sql` non appliquée, ou première ouverture hors
  // ligne sans cache). Le dire, plutôt que d'afficher une grille sans colonne où
  // l'enseignante voit ses élèves et aucun domaine à évaluer.
  if (!domainesAll.length) {
    return (
      <div className="p-4 md:p-6">
        <div>{BackBtn}</div>
        <div className="p-8 text-center text-gray-500">
          {t('Les domaines officiels de la maternelle ne sont pas encore disponibles sur cet appareil. Reconnectez-vous à Internet pour les télécharger, ou signalez-le à l’administration.',
             'The official nursery domains are not available on this device yet. Reconnect to the internet to download them, or report it to the administration.')}
        </div>
      </div>
    );
  }
  // Compte enseignant SANS fiche rattachée : la cause racine est le rattachement,
  // pas l'affectation des matières. Lui dire d'en réclamer ne mènerait à rien.
  if (role === 'teacher' && !teacherId && !matClasses.length) {
    return <div className="p-4 md:p-6 space-y-3"><div>{BackBtn}</div><UnlinkedTeacherNotice /></div>;
  }
  if (!matClasses.length) {
    const orphelines = subjectScoped
      ? unresolvedSubjectsForTeacher(subjects, teacherId, null, domainesAll)
      : [];
    return (
      <div className="p-4 md:p-6">
        <div>{BackBtn}</div>
        <div className="p-8 text-center text-gray-500">
          {orphelines.length > 0
            ? (
              <>
                {t(
                  'Ces matières qui vous sont affectées ne correspondent à aucun domaine officiel (D1–D8) : ',
                  'These subjects assigned to you match no official domain (D1–D8): ',
                )}
                <span className="font-medium text-gray-700">
                  {[...new Set(orphelines.map((m) => m.name))].join(', ')}
                </span>
                {t(
                  '. Vérifiez leur orthographe dans Matières — le rapprochement se fait sur le nom.',
                  '. Check their spelling in Subjects — the match is made on the name.',
                )}
              </>
            )
            : subjectScoped && matClassesAll.length > 0
            ? t(
              'Aucun domaine de la maternelle ne vous est affecté. Demandez à l’administration de vous affecter vos matières.',
              'No nursery domain is assigned to you. Ask the administration to assign your subjects.',
            )
            : t('Aucune classe maternelle (PS/MS/GS).', 'No nursery class (PS/MS/GS).')}
        </div>
      </div>
    );
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

      {matieresOrphelines.length > 0 && (
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
          {t('Non rattachées à un domaine officiel : ', 'Not matched to an official domain: ')}
          <span className="font-medium">
            {[...new Set(matieresOrphelines.map((m) => m.name))].join(', ')}
          </span>
        </div>
      )}

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
        {/* Réétiqueter les domaines POUR CETTE ÉCOLE. Le bouton manquait ici :
            l'éditeur n'existait que sur l'écran de saisie classique, donc une
            classe de maternelle officielle n'y donnait aucun accès. */}
        {canManageDomaines && (
          <button type="button" onClick={() => setDomainesOpen(true)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            {t('Renommer les domaines', 'Rename domains')}
          </button>
        )}
      </div>

      {domainesOpen && selectedClass && (
        <ClassSubjectsEditor
          cls={selectedClass}
          role={role}
          school={school}
          teacherId={teacherId}
          isDelegate={isDelegate}
          onClose={() => setDomainesOpen(false)}
        />
      )}

      {!niveauSlug && (
        <div className="text-xs text-amber-600">
          {t('Niveau non reconnu (attendu PS/MS/GS) — les domaines restent saisissables.',
             'Level not recognized (expected PS/MS/GS) — domains remain editable.')}
        </div>
      )}

      {classStudents.length > 0 && domaines.length > 0 && (
        <CompetenceGradeIO
          filename={`${t('evaluation_maternelle', 'nursery_assessment')}_${selectedClass?.name || ''}_T${trimestre}`}
          sheetName={`${t('Trimestre', 'Term')} ${trimestre}`}
          students={classStudents}
          columns={domaines.map((d) => ({ id: d.id, label: d.intitule }))}
          getCell={(sid, did) => matAcquisCode(recordFor(sid, did)?.niveau_acquis || '', sys)}
          /* Reconnait les deux sigles : une ecole anglophone exporte IP et doit
             pouvoir reimporter son propre fichier. Stocke toujours le code canonique. */
          normalize={matAcquisFromInput}
          onImport={(sid, did, v) => saveCell(sid, did, { niveauAcquis: v })}
          valueHint={MAT_ACQUIS_CODES.map((k) => matAcquisCode(k, sys)).join(" / ")}
        />
      )}

      {domaines.length === 0 ? (
        // Enseignant de matière dont aucune matière de CETTE classe ne se rattache
        // à un domaine : la grille n'aurait aucune colonne. On le dit.
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
          {t('Aucun domaine à évaluer sur cette classe pour votre compte. Demandez à l’administration de vous affecter vos matières.',
             'No domain to assess in this class for your account. Ask the administration to assign your subjects.')}
        </div>
      ) : classStudents.length === 0 ? (
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
                          <NiveauCell value={rec?.niveau_acquis || ''} sys={sys} onCommit={(v) => saveCell(stu.id, d.id, { niveauAcquis: v })} />
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
