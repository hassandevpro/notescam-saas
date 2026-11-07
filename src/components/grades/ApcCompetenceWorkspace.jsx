// Écran de saisie APC (moteur APC_MINISTERIEL_MINESEC).
//
// L'enseignant choisit Séquence + Classe + Matière. Le système charge
// AUTOMATIQUEMENT les compétences officielles du trimestre correspondant
// (S1/S2→T1, S3/S4→T2, S5/S6→T3). L'enseignant ne peut NI ajouter, NI supprimer,
// NI modifier les compétences : il saisit uniquement la NOTE /20 de chaque élève
// pour chaque compétence. L'appréciation (cote A+/A/ECA/NA) est DÉRIVÉE, jamais
// saisie — d'où l'absence de bouton « Appréciations ».
//
// Monté à la place de l'écran classique quand school.bulletin_engine='apc_minesec'.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSchoolStore } from '../../store/schoolStore';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { useT, getLang } from '../../lib/i18n';
import { validateGrade, gradeColor } from '../../lib/gradeEntry';
import { celluleSuivante } from '../../lib/gridNavigation';
import { isSequenceLocked } from '../../lib/lockService';
import { noteNkey } from '../../lib/apcService';
import { firstCycleClasseSlug, resolveClassEngine } from '../../core/engineResolver';
// Une classe anglophone qui n'a pas encore importé son référentiel CBA retombe
// sur le catalogue francophone : ses noms de matières sont alors rendus en
// anglais, comme sur son bulletin.
import { apcMatiereLabel } from '../../core/referentielI18n';
import { isSubjectScoped, myClassIds, canManageClassSubjects, refLineScope } from '../../lib/teacherScope';
import { hasCapability } from '../../config/capabilities';
import {
  matiereIdsForTeacher, unresolvedSubjectsForTeacher,
} from '../../core/apcMatiereMatch';
// Le PÉRIMÈTRE de la classe — ses matières cochées dans « Modifier la classe ».
// Le bulletin l'applique déjà (apcForClass) : la saisie doit lister EXACTEMENT
// les mêmes matières, sinon on saisit des notes qui ne s'impriment jamais.
import { apcMatieresForClass, unmatchedClassSubjects, apcClasseMatieresEcole } from '../../core/refClassScope';
import { manquesPourClasse } from '../../core/apcRattrapage';
import { classSubjectsOf } from '../../core/subjectOrder';
// L'ordre de la liste de classe — et donc le numéro « N° » affiché en tête de
// ligne, le même que sur la liste imprimée et les bulletins.
import { elevesDeClasse } from '../../core/ordreClasse';
import ReferentielEditor from './ReferentielEditor';
import { withLibelles } from '../../lib/referentielEcole';
import MobileEntryList from './MobileEntryList';
import SectionSelect from './SectionSelect';
import CompetenceGradeIO from './CompetenceGradeIO';
import GradeBundleIO from './GradeBundleIO';
import {
  competencesFor, matiereAverage, apcCote, coefFor,
  noteScale, APC_DEFAULT_MAX,
} from '../../core/apcEngine';
import {
  apcSeqIdOfSeqNum, apcTrimestreOfSeqNum, apcSeqNumsForTrimestre, APC_TRIMESTRE_IDS,
} from '../../core/apcPeriods';
// PLUSIEURS ÉVALUATIONS D'UNE MÊME COMPÉTENCE DANS LE TRIMESTRE : le modèle en
// portait déjà deux (une par séquence), l'écran n'en laissait saisir qu'une
// depuis le 2026-10-03. Ce module rouvre la seconde sans ramener le sélecteur de
// séquence — les séquences deviennent des colonnes « Éval. 1 », « Éval. 2 ».
import {
  colonnesEvaluations, nombreEvaluations, nombreEvaluationsParDefaut, capaciteEvaluations,
  etatSaisie, indicateurSaisie, moyenneEvaluations,
  configEvaluationsPour, ecrireConfigEvaluations,
} from '../../core/apcEvaluations';

const APC_MAX = APC_DEFAULT_MAX; // barème par défaut des notes APC (/20)

// ── L'IDENTIFIANT D'UNE COLONNE D'ÉVALUATION ──────────────────────────────────
// Une case de la grille est un couple (compétence, séquence) : la même
// compétence évaluée deux fois dans le trimestre occupe deux cases. Les
// composants de saisie, d'export et de navigation ne manipulent qu'un
// identifiant de colonne — ce découpage ne remonte pas jusqu'à eux.
//
// Un identifiant de compétence NU reste accepté partout et désigne la première
// séquence du trimestre : c'est là que la saisie écrit depuis le 2026-10-03, et
// tout ce qui a été saisi avant s'y trouve.
const SEP_EVAL = '@';
const cleEval = (competenceId, sequenceId) => `${competenceId}${SEP_EVAL}${sequenceId}`;
function decoupeEval(col, sequenceParDefaut) {
  const s = String(col ?? '');
  const i = s.lastIndexOf(SEP_EVAL);
  if (i < 0) return { competenceId: s, seqId: sequenceParDefaut };
  return { competenceId: s.slice(0, i), seqId: s.slice(i + 1) || sequenceParDefaut };
}

// ── Cellule note ──────────────────────────────────────────────────────────────
// `max` = barème de CETTE évaluation (compétence × séquence). La saisie est
// bornée à [0, max] : sur une évaluation /3, taper 14 est refusé à la frappe.
function NoteCell({ value, max = APC_MAX, disabled, onCommit, champRef, onNav }) {
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => { setLocal(value ?? ''); }, [value]);
  const commit = () => {
    const v = validateGrade(local, max);
    if (v === null) { setLocal(value ?? ''); return; }
    if (v !== (value ?? '')) onCommit(v);
  };
  // Quitter la cellule déclenche `onBlur` : la note part avant le déplacement.
  // `auDebut`/`aLaFin` ne valent que sans sélection — tant qu'un bout de texte
  // est surligné, ← et → défont la sélection (cf. gridNavigation.js).
  const onKeyDown = (e) => {
    const el = e.currentTarget;
    const sansSelection = el.selectionStart === el.selectionEnd;
    const bouge = onNav?.(e.key, {
      auDebut: sansSelection && el.selectionStart === 0,
      aLaFin:  sansSelection && el.selectionStart === String(el.value).length,
    });
    if (bouge) { e.preventDefault(); return; }
    if (e.key === 'Enter') el.blur();
  };
  return (
    <input
      ref={champRef}
      type="text"
      value={local}
      disabled={disabled}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      placeholder="—"
      title={`/${max}`}
      className={`w-16 text-center rounded border border-gray-200 px-1 py-1 text-sm
        focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-300
        disabled:bg-gray-50 disabled:text-gray-400 placeholder:text-gray-300
        ${gradeColor(local, max, 'FR')}`}
    />
  );
}

// ── Barème d'une colonne (une évaluation) ────────────────────────────────────
// Le barème appartient à l'évaluation, pas à la compétence : la même compétence
// peut être notée /3 en séquence 1 et /20 en séquence 2. Il est donc stocké sur
// chaque note (`apc_notes.note_max`) et relu depuis elles.
function BaremeCell({ value, disabled, onCommit }) {
  const [local, setLocal] = useState(String(value ?? APC_MAX));
  useEffect(() => { setLocal(String(value ?? APC_MAX)); }, [value]);
  const commit = () => {
    const n = parseFloat(String(local).replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) { setLocal(String(value ?? APC_MAX)); return; }
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

export default function ApcCompetenceWorkspace() {
  const t = useT();
  const school   = useAuthStore((s) => s.school);
  // Qui a le droit d'écrire le référentiel de l'école — miroir exact de la RLS.
  const permissions = useAuthStore((s) => s.permissions);
  const schoolId = school?.id;
  const role      = useAuthStore((s) => s.role);
  // Écriture du réglage « nombre d'évaluations » de la matière (JSON sur l'école).
  const updateSchool = useAuthStore((s) => s.updateSchool);
  const teacherId = useAuthStore((s) => s.teacherId);
  // Mode 1 « enseignant de matière » : l'enseignant ne voit QUE les matières qui
  // lui sont affectées — et donc que les classes où il en assure au moins une.
  const subjectScoped = isSubjectScoped(role, school);

  const classes        = useSchoolStore((s) => s.classes);
  const subjects       = useSchoolStore((s) => s.subjects);
  const students       = useSchoolStore((s) => s.students);
  const referentiel    = useSchoolStore((s) => s.apcReferentiel);
  const masques        = useSchoolStore((s) => s.refMasques.apc);
  const libelles       = useSchoolStore((s) => s.refLibelles.apc);
  const loadRefMasques = useSchoolStore((s) => s.loadRefMasques);
  const addRef         = useSchoolStore((s) => s.addRefLigne);
  const renameRef      = useSchoolStore((s) => s.renameRefLigne);
  const removeRef      = useSchoolStore((s) => s.removeRefLigne);
  const restoreRef     = useSchoolStore((s) => s.restoreRefLigne);
  const resetLibelle   = useSchoolStore((s) => s.resetRefLibelle);
  const apcNotes       = useSchoolStore((s) => s.apcNotes);
  const loadApc        = useSchoolStore((s) => s.loadApc);
  const saveApcNote    = useSchoolStore((s) => s.saveApcNote);

  // Classe partagée avec l'écran classique (uiStore) : le choix de la classe
  // pilote automatiquement le moteur affiché (APC vs classique/second cycle).
  const classId    = useUiStore((s) => s.gradesClassId);
  const setClassId = useUiStore((s) => s.setGradesClassId);
  const [sequence, setSequence] = useState(1);
  const [matiereId, setMatiereId] = useState('');
  // Barème choisi pour une colonne encore vide (rien à relire en base tant
  // qu'aucune note n'y est saisie) + message de refus d'un changement.
  const [pendingBareme, setPendingBareme] = useState({});
  const [baremeMsg, setBaremeMsg] = useState(null);

  useEffect(() => { loadApc(); }, [loadApc]);

  // Séquences de SAISIE, lues du référentiel (`apc_sequences`) : leur nombre et
  // leur rattachement au trimestre sont des DONNÉES, pas une constante — un
  // trimestre peut en compter deux, trois, ou un nombre différent d'un autre.
  // Repli sur le rythme MINESEC courant tant que le référentiel n'est pas chargé.
  const SEQUENCES = useMemo(() => {
    const nums = (referentiel?.sequences || [])
      .map((s) => Number(s.numero))
      .filter((n) => Number.isFinite(n));
    return nums.length ? [...new Set(nums)].sort((a, b) => a - b) : [1, 2, 3, 4, 5, 6];
  }, [referentiel]);

  // Si le référentiel chargé ne porte pas la séquence sélectionnée, on revient à
  // la première : mieux vaut une saisie sur une séquence réelle qu'un écran vide.
  useEffect(() => {
    if (SEQUENCES.length && !SEQUENCES.includes(sequence)) setSequence(SEQUENCES[0]);
  }, [SEQUENCES, sequence]);

  const sequenceId  = apcSeqIdOfSeqNum(referentiel, sequence) || `s${sequence}`;
  const trimestreId = apcTrimestreOfSeqNum(referentiel, sequence);

  // ── La saisie se fait PAR TRIMESTRE ─────────────────────────────────────────
  // Les compétences officielles sont définies par trimestre, et c'est ainsi que
  // l'enseignant raisonne : l'écran ne propose donc plus que les trimestres.
  //
  // La table des notes, elle, n'a pas de case « trimestre » : sa clé est
  // `(élève, compétence, séquence)` et `sequence_id` est obligatoire. Une note de
  // trimestre est donc écrite sur la PREMIÈRE séquence rattachée à ce trimestre
  // au référentiel (s1 pour T1, s3 pour T2…), jamais sur un numéro deviné. Le
  // bulletin agrège déjà toutes les séquences du trimestre : avec une seule note,
  // la moyenne du trimestre EST cette note. Aucune donnée n'a été réécrite pour
  // cela, et le modèle reste capable d'en porter plusieurs.
  const TRIMESTRES = useMemo(
    () => APC_TRIMESTRE_IDS
      .map((tid) => ({ id: tid, seqs: apcSeqNumsForTrimestre(referentiel, tid) }))
      .filter((x) => x.seqs.length),
    [referentiel],
  );
  const seqsDuTrimestre = TRIMESTRES.find((x) => x.id === trimestreId)?.seqs || SEQUENCES;
  const choisirTrimestre = (tid) => {
    const first = TRIMESTRES.find((x) => x.id === tid)?.seqs?.[0];
    if (first != null) setSequence(first);
  };

  // Si la séquence courante n'est pas la représentante de son trimestre (état
  // hérité de l'écran précédent, qui laissait choisir n'importe laquelle), on y
  // revient : la saisie doit toujours porter sur la même séquence pour un
  // trimestre donné, sinon deux notes cohabiteraient sans que l'écran le montre.
  useEffect(() => {
    const premiere = seqsDuTrimestre[0];
    if (premiere != null && sequence !== premiere) setSequence(premiere);
  }, [seqsDuTrimestre.join(','), sequence]);

  // Classe sélectionnée + slug référentiel. On ne liste QUE les classes du premier
  // cycle (moteur 'apc') : l'établissement peut aussi contenir du fondamental ou du
  // second cycle, qui n'ont rien à faire dans ce sélecteur.
  const sortedClasses = useMemo(() => {
    let list = classes.filter((c) => resolveClassEngine(school, c) === 'apc');
    if (subjectScoped) {
      const mine = myClassIds(subjects, teacherId);
      list = list.filter((c) => mine.has(c.id));
    }
    return list.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }));
  }, [classes, school, subjectScoped, subjects, teacherId]);
  useEffect(() => {
    if (sortedClasses.length && !sortedClasses.some((c) => c.id === classId)) setClassId(sortedClasses[0].id);
  }, [sortedClasses, classId]);

  const selectedClass = sortedClasses.find((c) => c.id === classId) || null;
  const classeSlug = selectedClass ? firstCycleClasseSlug(selectedClass.level, selectedClass.name) : null;

  // Matières du référentiel ayant au moins une compétence pour (classe, trimestre),
  // avec leur coefficient officiel POUR cette classe (Français = 6 en 6e/5e, 4 en 4e/3e).
  const sys = selectedClass?.system || 'FR';

  // Matières de LA classe telles que « Modifier la classe » les a cochées. Non
  // filtrées par enseignant : le périmètre d'une classe ne dépend pas de qui
  // regarde — c'est exactement la liste que le bulletin utilise.
  const classSubjects = useMemo(() => classSubjectsOf(subjects, classId), [subjects, classId]);

  // Coefficients : celui que l'école a posé sur sa matière (Modifier la classe) l'emporte sur le national.
  const classeMatieresEcole = useMemo(
    () => apcClasseMatieresEcole(referentiel, classeSlug, classSubjects),
    [referentiel, classeSlug, classSubjects],
  );

  // Matières du référentiel réellement disponibles pour (classe, trimestre),
  // avant tout filtrage par enseignant.
  const matieresDuReferentiel = useMemo(() => {
    if (!referentiel || !classeSlug || !trimestreId) return [];
    return referentiel.matieres
      .map((m) => ({
        ...m,
        nom: apcMatiereLabel(m, sys),
        nomOfficiel: m.nom,
        coef: coefFor(classeMatieresEcole, classeSlug, m),
        nbComp: competencesFor(referentiel.competences, { classeId: classeSlug, trimestreId, matiereId: m.id }).length,
      }))
      .filter((m) => m.nbComp > 0)
      .sort((a, b) => {
        const oa = (referentiel.classeMatieres || []).find((r) => r.classe_id === classeSlug && r.matiere_id === a.id)?.ordre ?? a.ordre ?? 0;
        const ob = (referentiel.classeMatieres || []).find((r) => r.classe_id === classeSlug && r.matiere_id === b.id)?.ordre ?? b.ordre ?? 0;
        return oa - ob;
      });
  }, [referentiel, classeSlug, trimestreId, sys, classeMatieresEcole]);

  // ── LE PÉRIMÈTRE DE LA CLASSE S'APPLIQUE ICI AUSSI ──────────────────────────
  // Même appel, même garde-fou et mêmes alias de noms que le bulletin : une
  // classe dont aucune matière ne se rapproche du référentiel garde la liste
  // complète (`apcMatieresForClass` rend alors l'entrée inchangée) plutôt qu'un
  // écran vide. Mais dès qu'une seule matière est reconnue, la saisie et le
  // bulletin montrent le même ensemble.
  const matieresDisponibles = useMemo(
    () => apcMatieresForClass(matieresDuReferentiel, classSubjects).matieres,
    [matieresDuReferentiel, classSubjects],
  );
  // Combien le périmètre de la classe a-t-il écarté ? 0 quand le garde-fou a
  // joué (rien de reconnu ⇒ liste inchangée), et c'est voulu : il n'y a alors
  // rien à annoncer.
  const matieresEcartees = matieresDuReferentiel.length - matieresDisponibles.length;

  // ── TOUTE MATIÈRE COCHÉE DOIT APPARAÎTRE ──────────────────────────────────
  //
  // Règle donnée par le responsable : « laisse toutes les matières apparaître
  // tant qu'elles sont créées et cochées ». Une matière que le référentiel
  // ignore n'est donc plus une fatalité à annoncer : on la MATÉRIALISE, c'est-
  // à-dire qu'on lui crée sa ligne de référentiel maison.
  //
  // Ce qui reste listé ci-dessous, c'est ce que le rattrapage n'a PAS pu poser —
  // hors ligne, ou compte sans le droit d'écrire le référentiel. L'avis
  // disparaît donc tout seul dès que ça marche, au lieu de reprocher un nom.
  const matieresHorsReferentiel = useMemo(
    () => unmatchedClassSubjects('apc', classSubjects, referentiel?.matieres).map((s) => s.name),
    [classSubjects, referentiel],
  );

  // ── CE QUI MANQUE VRAIMENT À CETTE CLASSE ────────────────────────────────
  //
  // `matieresHorsReferentiel` ne compte que les noms qui ne correspondent À
  // RIEN. Il ignore donc le manque le plus fréquent — la matière qui EXISTE
  // mais n'est pas rattachée à CE NIVEAU (« Espagnol » absent du catalogue de
  // 5e, « Etude de texte » créée en 3ème) — et c'est lui qui déclenchait le
  // rattrapage.
  //
  // CONSÉQUENCE MESURÉE le 2026-10-22 : le rattachement venait d'être corrigé
  // dans le magasin, et il ne partait JAMAIS pour ce cas, faute d'appelant. Du
  // dehors, « rien ne change ». Le déclencheur doit donc poser la même question
  // que le rattrapage lui-même, et c'est maintenant la même fonction qui y
  // répond des deux côtés.
  const manques = useMemo(() => manquesPourClasse({
    subjects: classSubjects,
    matieres: referentiel?.matieres || [],
    classeMatieres: referentiel?.classeMatieres || [],
    classeId: classeSlug,
  }), [classSubjects, referentiel, classeSlug]);
  const aRattraper = manques.creer.length + manques.rattacher.size;

  // Rattrapage, à l'ouverture de la classe. Même motif que la maternelle
  // (`configureClassSubjects`) : idempotent, tenté une seule fois par classe, et
  // JAMAIS si le compte n'a pas le droit d'écrire — une écriture refusée par la
  // RLS repartirait en boucle dans la file hors-ligne.
  const materialiserManquantes = useSchoolStore((s) => s.materialiserMatieresManquantes);
  const rattrapees = useRef(new Set());
  // Le droit se lit sur la table qu'on ÉCRIT : `apc_matieres` autorise tout
  // membre de l'école à écrire les lignes de son école, là où
  // `canManageClassSubjects` (policy de `subjects`) exige le titulariat. La
  // garde d'avant était donc plus stricte que la base, et un enseignant de
  // matière restait devant un écran vide. `refLineScope` restreint la création
  // à ses propres matières. Cf. lib/teacherScope.js.
  useEffect(() => {
    if (!selectedClass || !referentiel || !aRattraper) return;
    const isDelegate = hasCapability(permissions, '/app/classes');
    const scope = refLineScope({ role, school, cls: selectedClass, teacherId, isDelegate });
    if (!scope) return;
    if (rattrapees.current.has(selectedClass.id)) return;
    rattrapees.current.add(selectedClass.id);
    materialiserManquantes(selectedClass, scope);
  }, [selectedClass, referentiel, aRattraper, role, school, teacherId, permissions, materialiserManquantes]);

  // Mode 1 : ne garder que les matières couvertes par MES matières affectées.
  // Le rapprochement est délégué à apcMatiereMatch (noms officiels, sigles,
  // alias) — une matière locale pouvant en couvrir plusieurs.
  const matieres = useMemo(() => {
    if (!subjectScoped) return matieresDisponibles;
    const mine = matiereIdsForTeacher(subjects, teacherId, classId, matieresDisponibles);
    return matieresDisponibles.filter((m) => mine.has(m.id));
  }, [subjectScoped, matieresDisponibles, subjects, teacherId, classId]);

  // Mes matières de cette classe qui ne se rattachent à RIEN : on les nomme,
  // plutôt que de laisser l'enseignant devant un écran vide sans explication.
  const matieresOrphelines = useMemo(
    () => (subjectScoped
      ? unresolvedSubjectsForTeacher(subjects, teacherId, classId, matieresDisponibles)
      : []),
    [subjectScoped, subjects, teacherId, classId, matieresDisponibles],
  );

  const matiereCoef = matieres.find((m) => m.id === matiereId)?.coef ?? 1;

  useEffect(() => {
    if (matieres.length && !matieres.some((m) => m.id === matiereId)) setMatiereId(matieres[0].id);
  }, [matieres, matiereId]);

  // Compétences de (classe, trimestre, matière) : les nationales que l'école n'a
  // pas masquées chez elle, PLUS les siennes. Masquer n'efface rien pour les
  // autres établissements (cf. supabase_apc_competences_par_ecole.sql).
  const competencesToutes = useMemo(
    () => (referentiel && classeSlug && trimestreId && matiereId)
      ? competencesFor(referentiel.competences, { classeId: classeSlug, trimestreId, matiereId })
      : [],
    [referentiel, classeSlug, trimestreId, matiereId],
  );
  const competences = useMemo(
    () => competencesToutes.filter((c) => !masques.includes(c.id)),
    [competencesToutes, masques],
  );

  // ── LES COLONNES D'ÉVALUATION DU TRIMESTRE ──────────────────────────────
  //
  // Une colonne = une case en base, c'est-à-dire un couple (compétence,
  // séquence). L'identifiant de colonne les porte toutes deux : les composants
  // de saisie, d'export et de navigation manipulent un id de colonne sans avoir
  // à connaître ce découpage.
  //
  // Le nombre de colonnes est DÉDUIT du nombre de compétences (1 → 2, sinon une
  // par compétence) et plafonné par la capacité réelle du trimestre
  // (compétences × séquences). Une école peut le surcharger matière par matière
  // (`schools.apc_evaluations`) ; sans configuration, la déduction s'applique.
  const sequencesDuTrimestre = useMemo(
    () => seqsDuTrimestre.map((n) => apcSeqIdOfSeqNum(referentiel, n) || `s${n}`),
    [seqsDuTrimestre.join(','), referentiel],
  );
  const configEval = configEvaluationsPour(school?.apc_evaluations, classeSlug, matiereId);
  const nbEvaluations = nombreEvaluations({
    nbCompetences: competences.length,
    nbSequences: sequencesDuTrimestre.length,
    config: configEval,
  });
  const colonnes = useMemo(
    () => colonnesEvaluations({
      competences, sequences: sequencesDuTrimestre, nombre: nbEvaluations,
    }).map((c) => ({ ...c, id: cleEval(c.competence.id, c.sequenceId) })),
    [competences, sequencesDuTrimestre, nbEvaluations],
  );
  // Les compétences réellement couvertes par les colonnes affichées : une
  // matière configurée avec moins d'évaluations que de compétences n'en montre
  // qu'une partie, et la moyenne ne doit porter que sur celles-là.
  const competencesAffichees = useMemo(
    () => competences.filter((c) => colonnes.some((x) => x.competence.id === c.id)),
    [competences, colonnes],
  );

  useEffect(() => { loadRefMasques('apc'); }, [loadRefMasques]);

  const [refOpen, setRefOpen] = useState(false);
  // Une compétence APC vit dans (classe, trimestre, matière) : sans ce contexte
  // une nouvelle ligne ne s'afficherait nulle part. On n'ouvre donc l'éditeur que
  // lorsque les trois sont choisis.
  // Le cycle est LU du référentiel, pas écrit en dur : 'premier_cycle' est un id
  // de données, et une faute de frappe ferait échouer la FK sans rien dire.
  const contexteApc = classeSlug && trimestreId && matiereId
    ? {
      cycle_id: (referentiel?.classes || []).find((c) => c.id === classeSlug)?.cycle_id || 'premier_cycle',
      classe_id: classeSlug, trimestre_id: trimestreId, matiere_id: matiereId,
      // ── SANS CE CHAMP, LA COMPÉTENCE EST ÉCRITE PUIS JAMAIS RELUE ────────
      // `apcService.fetchReferentiel` ne charge que les compétences dont le
      // `referentiel_version_id` figure parmi les versions ACTIVES :
      //     compQ.in('referentiel_version_id', activeVersionIds)
      // Une ligne maison créée avec ce champ à NULL existe donc en base,
      // répond « enregistré », et disparaît au rechargement suivant — la
      // matière elle-même peut ne plus apparaître du tout, puisque le
      // sélecteur écarte les matières sans compétence. Constaté en production
      // le 2026-10-19 sur BRIGHT CONTINENT.
      // `referentiel.versions` ne contient que des versions actives (le
      // service filtre déjà sur `actif`), d'où la première.
      referentiel_version_id: (referentiel?.versions || [])[0]?.id ?? null,
    }
    : null;

  // L'ordre de la LISTE DE CLASSE, et lui seul : c'est de lui que découle le
  // numéro affiché en colonne « N° » (cf. core/ordreClasse).
  const classStudents = useMemo(() => elevesDeClasse(students, classId), [students, classId]);

  // Notes déjà posées sur les AUTRES séquences du trimestre, du temps où l'écran
  // laissait choisir la séquence. Elles n'ont pas été touchées et restent
  // comptées dans la moyenne du trimestre : on le signale, plutôt que de les
  // laisser peser sans que personne ne les voie.
  // Ce décompte ne porte PLUS sur « les autres séquences » : depuis que le
  // trimestre affiche plusieurs évaluations, la seconde séquence est de nouveau
  // éditable là où une colonne la désigne. Ce qui reste invisible, ce sont les
  // cases QUE LES COLONNES AFFICHÉES NE COUVRENT PAS — et elles comptent
  // toujours dans la moyenne du bulletin, qui agrège tout le trimestre.
  const notesHorsColonnes = useMemo(() => {
    if (!competences.length || !classStudents.length) return 0;
    const couvertes = new Set(colonnes.map((c) => `${c.competence.id}|${c.sequenceId}`));
    let n = 0;
    for (const stu of classStudents) {
      for (const c of competences) {
        for (const sid of sequencesDuTrimestre) {
          if (couvertes.has(`${c.id}|${sid}`)) continue;
          const r = apcNotes[noteNkey(stu.id, c.id, sid)];
          if (r?.note != null && r.note !== '') n++;
        }
      }
    }
    return n;
  }, [apcNotes, competences, classStudents, colonnes, sequencesDuTrimestre]);

  const locked = schoolId && classId ? isSequenceLocked(schoolId, classId, sequence) : false;

  // Lecture/écriture d'une cellule (note ou appréciation) en préservant l'autre
  // champ. `col` est un identifiant de COLONNE (compétence + séquence) : une
  // compétence évaluée deux fois dans le trimestre a deux colonnes, donc deux
  // cases distinctes en base. Un identifiant de compétence nu reste accepté et
  // désigne la première séquence du trimestre — c'est là que la saisie écrit
  // depuis le 2026-10-03.
  const recordFor = (eleveId, col) => {
    const { competenceId, seqId } = decoupeEval(col, sequenceId);
    return apcNotes[noteNkey(eleveId, competenceId, seqId)] || null;
  };

  // ── NAVIGATION AU CLAVIER ──────────────────────────────────────────────────
  // Même geste que dans la grille du primaire : les champs s'enregistrent ici
  // pour que la touche pressée dans l'un puisse donner le focus à l'autre. La
  // séquence verrouillée ferme TOUTES les cellules d'un coup, donc le prédicat
  // ne regarde que `locked` — contrairement au primaire, où l'aptitude de
  // l'élève et les critères masqués ferment les cellules une par une.
  const cellules = useRef(new Map());
  const poserCellule = (row, col) => (el) => {
    const cle = `${row}:${col}`;
    if (el) cellules.current.set(cle, el);
    else cellules.current.delete(cle);
  };
  const naviguer = (row, col) => (key, caret) => {
    const cible = celluleSuivante(
      key,
      { row, col, rows: classStudents.length, cols: colonnes.length, actif: () => !locked },
      caret,
    );
    const el = cible && cellules.current.get(`${cible.row}:${cible.col}`);
    if (!el) return false;
    el.focus();
    el.select();   // la frappe suivante remplace la note au lieu de s'y coller
    return true;
  };

  // Barème de l'évaluation : relu de la première note déjà saisie dans LA
  // COLONNE, /20 par défaut. Chaque évaluation a son propre barème — la même
  // compétence peut être notée /3 à la première évaluation et /20 à la seconde,
  // et le bulletin sait moyenner deux barèmes différents (il passe alors par les
  // proportions, cf. core/apcEvaluations.js).
  const baremeFor = (col) => {
    for (const stu of classStudents) {
      const r = recordFor(stu.id, col);
      if (r?.note_max != null) return Number(r.note_max);
      if (r?.note != null && r.note !== '') return APC_DEFAULT_MAX; // note sans barème = historique /20
    }
    return pendingBareme[col] ?? APC_DEFAULT_MAX;
  };

  const saveCell = (eleveId, col, patch) => {
    const rec = recordFor(eleveId, col);
    const { competenceId, seqId } = decoupeEval(col, sequenceId);
    saveApcNote({
      eleveId, competenceId, sequenceId: seqId,
      note: 'note' in patch ? patch.note : (rec?.note ?? ''),
      noteMax: 'noteMax' in patch ? patch.noteMax : baremeFor(col),
      appreciation: 'appreciation' in patch ? patch.appreciation : (rec?.appreciation ?? ''),
    });
  };

  // Changement du barème d'une colonne. REFUSÉ si une note déjà saisie le
  // dépasse : on ne transforme pas en silence un 14/20 en 14/3. L'enseignant
  // corrige d'abord les notes concernées.
  // `col` est un identifiant de COLONNE, comme pour `baremeFor` et `saveCell` :
  // le barème appartient à l'évaluation, pas à la compétence. Régler /3 sur
  // « Éval. 1 » ne touche pas « Éval. 2 » de la même compétence.
  const setBareme = (col, nouveau) => {
    const trop = classStudents.filter((stu) => {
      const r = recordFor(stu.id, col);
      const n = r?.note == null || r.note === '' ? null : Number(r.note);
      return n != null && !Number.isNaN(n) && n > nouveau;
    });
    if (trop.length) {
      setBaremeMsg({
        competenceId: col,
        text: t(
          `Barème /${nouveau} refusé : ${trop.length} note(s) le dépassent (${trop.slice(0, 3).map((s) => s.name).join(', ')}${trop.length > 3 ? '…' : ''}). Corrigez-les d'abord.`,
          `Scale /${nouveau} refused: ${trop.length} grade(s) exceed it (${trop.slice(0, 3).map((s) => s.name).join(', ')}${trop.length > 3 ? '…' : ''}). Fix them first.`,
        ),
      });
      return;
    }
    setBaremeMsg(null);
    // Affichage immédiat seulement : ce n'est plus le seul domicile du barème.
    setPendingBareme((p) => ({ ...p, [col]: nouveau }));

    // ÉCRIT POUR TOUTE LA COLONNE, pas seulement pour les élèves déjà notés.
    // Même défaut, même correctif que l'écran du primaire : sur une colonne
    // encore vide — le cas normal, puisqu'on règle le barème AVANT de noter —
    // rien n'était écrit, et le choix mourait avec l'état React. L'enseignant
    // revenait sur un barème qu'il n'avait pas choisi.
    //
    // `saveCell` conserve la note existante et `buildApcNoteRecord` normalise
    // une note vide en `null` : une ligne sans note persiste donc le barème sans
    // rien affirmer sur l'élève. La progression de saisie l'ignore
    // (`gradeEntryProgress` teste `filled(note)`), et `matiereAverage` ne reçoit
    // que les notes non nulles via `noteScale`.
    //
    // Cas particulier /20 : `note_max` est volontairement stocké NULL pour le
    // barème historique. La colonne retombe alors sur `APC_DEFAULT_MAX`, qui
    // vaut 20 — la valeur affichée est donc la bonne, par convention et non par
    // accident.
    for (const stu of classStudents) {
      saveCell(stu.id, col, { noteMax: nouveau });
    }
  };

  // Moyenne matière d'un élève (sur les compétences de la séquence). Chaque note
  // est fournie AVEC son barème : `matiereAverage` normalise avant d'agréger, de
  // sorte qu'un 2/3 et un 14/20 ne soient jamais additionnés tels quels.
  // Moyenne de la matière pour un élève — LA MÊME QU'AU BULLETIN, et c'est tout
  // l'enjeu : une compétence évaluée deux fois dans le trimestre compte pour la
  // MOYENNE de ses deux évaluations, pas pour la dernière saisie. L'écran lit
  // donc la règle partagée (`moyenneEvaluations`), puis combine les compétences
  // par la règle de matière inchangée (`matiereAverage`).
  const studentAvg = (eleveId) => {
    const notes = {};
    for (const c of competencesAffichees) {
      const v = moyenneEvaluations(
        colonnes.filter((x) => x.competence.id === c.id).map((x) => recordFor(eleveId, x.id)),
      );
      if (v !== null) notes[c.id] = v;
    }
    return matiereAverage(notes, competencesAffichees);
  };

  // OÙ EN EST LA SAISIE pour cet élève : « 1 évaluation sur 2 saisie ». Une
  // moyenne calculée sur la moitié des évaluations est une note PROVISOIRE, et
  // l'afficher comme définitive annonce au parent un résultat qui va bouger.
  const etatDe = (eleveId) => etatSaisie({
    colonnes,
    noteDe: (cid, sid) => recordFor(eleveId, cleEval(cid, sid)),
  });

  // ── Rendus d'états vides ─────────────────────────────────────────────────────
  if (!referentiel) {
    return (
      <div className="p-8 text-center text-gray-500">
        {t('Chargement du référentiel APC…', 'Loading APC framework…')}
      </div>
    );
  }
  if (subjectScoped && sortedClasses.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        {t(
          'Aucune matière du premier cycle (6e–3e) ne vous est affectée. Demandez à l’administration de vous affecter vos matières dans Matières.',
          'No first-cycle (6e–3e) subject is assigned to you. Ask the administration to assign your subjects in Subjects.',
        )}
      </div>
    );
  }
  if (!classeSlug) {
    return (
      <div className="p-8 text-center text-gray-500">
        {t(
          'La classe sélectionnée n’est pas reconnue comme une classe du premier cycle (6e–3e).',
          'The selected class is not recognized as a first-cycle class (6e–3e).',
        )}
        <div className="mt-4">{renderClassPicker()}</div>
      </div>
    );
  }

  function renderClassPicker() {
    return (
      <select value={classId} onChange={(e) => setClassId(e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
        {sortedClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">
          {t('Saisie par compétences (APC)', 'Competency entry (APC)')}
        </h1>
        <p className="text-sm text-gray-500">
          {t(
            'Compétences officielles MINESEC — chargées automatiquement. Votre école peut les adapter.',
            'Official MINESEC competencies — loaded automatically. Your school can adapt them.',
          )}
        </p>
        {/* Une compétence APC vit dans (classe, trimestre, matière) : sans ces
            trois choix, une ligne nouvelle ne s'afficherait nulle part. */}
        {contexteApc && (
          <button type="button" onClick={() => setRefOpen(true)}
            className="mt-2 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            {t('Modifier les compétences', 'Edit competencies')}
          </button>
        )}
      </div>

      {refOpen && (
        <ReferentielEditor
          titre={`${t('Compétences', 'Competencies')} — ${matieres.find((m) => m.id === matiereId)?.nom || ''}`}
          sousTitre={t('Pour cette classe, ce trimestre et cette matière. Rien ne sort de votre établissement.',
                       'For this class, term and subject. Nothing leaves your school.')}
          lignes={withLibelles(competencesToutes, libelles)}
          masques={masques}
          motSingulier={t('compétence', 'competency')}
          renommable={() => true}
          onRename={(l, nom) => renameRef('apc', l.id, nom)}
          onAdd={(nom) => addRef('apc', nom, contexteApc)}
          onMasquer={(l) => removeRef('apc', l.id)}
          onSupprimer={(l) => removeRef('apc', l.id)}
          onDemasquer={(l) => restoreRef('apc', l.id)}
          onResetLibelle={(l) => resetLibelle('apc', l.id)}
          onClose={() => setRefOpen(false)}
        />
      )}

      {/* Sélecteurs */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
        <SectionSelect classes={classes} classId={classId} setClassId={setClassId} />
        <label className="text-sm min-w-0">
          <span className="block text-gray-500 mb-1">{t('Classe', 'Class')}</span>
          {renderClassPicker()}
        </label>
        {/* Trimestre d'abord : c'est l'unité des compétences officielles. */}
        <label className="text-sm min-w-0">
          <span className="block text-gray-500 mb-1">{t('Trimestre', 'Term')}</span>
          <select value={trimestreId || ''} onChange={(e) => choisirTrimestre(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
            {TRIMESTRES.map((x) => (
              <option key={x.id} value={x.id}>
                {t('Trimestre', 'Term')} {x.id.replace('t', '')}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm min-w-0">
          <span className="block text-gray-500 mb-1">{t('Matière', 'Subject')}</span>
          <select value={matiereId} onChange={(e) => setMatiereId(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm min-w-[12rem]">
            {matieres.length === 0 && <option value="">{t('Aucune (importer un référentiel)', 'None (import a framework)')}</option>}
            {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom} (coef {m.coef})</option>)}
          </select>
        </label>
      </div>

      {/* La liste ci-dessus est celle de la CLASSE, pas celle du référentiel
          national. Sans cette ligne, le filtre serait invisible : l'enseignante
          chercherait une matière officielle absente du sélecteur sans pouvoir
          deviner qu'elle n'est pas cochée dans la classe. Le bulletin applique
          le même périmètre — c'est tout l'objet du correctif. */}
      {matieresEcartees > 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          {t(
            `${matieresEcartees} matière(s) du référentiel ne sont pas cochées pour cette classe : elles ne se saisissent pas ici et ne s'impriment pas sur le bulletin. Pour les ajouter, passez par Classes → Modifier la classe → Matières.`,
            `${matieresEcartees} framework subject(s) are not ticked for this class: they cannot be entered here and do not print on the report card. To add them, go to Classes → Edit class → Subjects.`,
          )}
        </div>
      )}

      {matieresHorsReferentiel.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t(
            `Matière(s) en attente d'être ajoutée(s) à votre référentiel : ${matieresHorsReferentiel.join(', ')}. Elles s'ajouteront toutes seules dès qu'un compte autorisé ouvrira cet écran en étant connecté à Internet.`,
            `Subject(s) waiting to be added to your framework: ${matieresHorsReferentiel.join(', ')}. They will be added automatically as soon as an authorised account opens this screen while online.`,
          )}
        </div>
      )}

      {/* Bandeau trimestre / héritage */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
        {t('Coef matière', 'Subject coef')} {matiereCoef} · {' '}
        {colonnes.length === 1
          ? t('une évaluation dans le trimestre', 'one assessment in the term')
          : t(`${colonnes.length} évaluations dans le trimestre, moyennées pour la note du trimestre`,
            `${colonnes.length} assessments in the term, averaged into the term grade`)}

        {/* LE NOMBRE D'ÉVALUATIONS, CONFIGURABLE PAR MATIÈRE. Déduit du nombre de
            compétences (1 → 2, sinon une par compétence) ; ce sélecteur n'existe
            que pour les exceptions, et il ne s'affiche qu'à la direction — un
            enseignant qui le changerait en cours de trimestre déplacerait les
            colonnes de tous ses collègues sur la même matière.

            Le maximum est la CAPACITÉ réelle (compétences × séquences) : au-delà,
            deux colonnes désigneraient la même case et la seconde écraserait la
            première. */}
        {(role === 'admin' || role === 'censeur') && competences.length > 0 && (
          <label className="ml-auto flex items-center gap-1">
            <span>{t('Évaluations', 'Assessments')}</span>
            <select
              value={nbEvaluations}
              onChange={async (e) => {
                const valeur = Number(e.target.value);
                const json = ecrireConfigEvaluations(
                  school?.apc_evaluations, classeSlug, matiereId, valeur,
                  { nbCompetences: competences.length, nbSequences: sequencesDuTrimestre.length },
                );
                await updateSchool({ apc_evaluations: json });
              }}
              className="rounded border border-gray-200 px-1 py-0.5 text-xs"
            >
              {Array.from(
                { length: Math.max(1, capaciteEvaluations(competences.length, sequencesDuTrimestre.length)) },
                (_, i) => i + 1,
              ).map((n) => (
                <option key={n} value={n}>
                  {n}{n === nombreEvaluationsParDefaut(competences.length, sequencesDuTrimestre.length)
                    ? ` (${t('par défaut', 'default')})` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        {locked && <span className="ml-2 text-amber-600 font-medium">· {t('Trimestre verrouillé (lecture seule)', 'Term locked (read-only)')}</span>}
      </div>

      {/* Notes héritées d'une autre séquence du même trimestre : elles comptent
          dans la moyenne, on ne les cache pas. */}
      {notesHorsColonnes > 0 && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
          {t(
            `${notesHorsColonnes} note(s) de ce trimestre ne sont couvertes par aucune colonne affichée. Elles sont conservées et comptent toujours dans la moyenne du bulletin, qui agrège tout le trimestre, mais ne se modifient pas ici. Pour les rouvrir, augmentez le nombre d'évaluations de la matière.`,
            `${notesHorsColonnes} grade(s) for this term are not covered by any displayed column. They are kept and still count towards the report-card average, which aggregates the whole term, but cannot be edited here. To reopen them, raise the subject's number of assessments.`,
          )}
        </div>
      )}

      {/* Refus d'un changement de barème qui invaliderait des notes déjà saisies. */}
      {baremeMsg && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {baremeMsg.text}
        </div>
      )}

      {/* Échange de notes entre postes : export global de TOUTES ses notes
          (toutes classes, tous moteurs) et, pour un admin, import du fichier
          d'un enseignant. La barre ci-dessous, elle, ne porte que la grille
          affichée. */}
      <GradeBundleIO />

      {/* Chaque en-tête de colonne exportée porte son barème : un classeur qui ne
          dit pas sur quoi l'on saisit revient rempli sur une échelle qu'on ne peut
          plus deviner. */}
      {colonnes.length > 0 && classStudents.length > 0 && (
        <CompetenceGradeIO
          filename={`notes_${(matieres.find((m) => m.id === matiereId)?.nom || 'matiere').replace(/[\\/:*?"<>|]/g, '-')}_${selectedClass?.name || ''}_${String(trimestreId || '').toUpperCase()}`}
          sheetName={`${t('Trimestre', 'Term')} ${String(trimestreId || 't1').replace('t', '')}`}
          students={classStudents}
          columns={colonnes.map((col) => ({
            id: col.id,
            // L'en-tête exporté porte le NUMÉRO d'évaluation en plus de
            // l'intitulé : sans lui, les deux colonnes d'une matière à une seule
            // compétence seraient identiques dans le classeur, et le fichier
            // reviendrait avec deux colonnes qu'on ne peut plus distinguer.
            label: `${t('Éval.', 'Assess.')} ${col.rang} — ${col.competence.intitule} /${baremeFor(col.id)}`,
          }))}
          getCell={(sid, cid) => { const r = recordFor(sid, cid); return r?.note != null ? String(r.note) : ''; }}
          computed={[
            { label: 'M/20', get: (sid) => studentAvg(sid) ?? '' },
            { label: t('Cote', 'Grade'), get: (sid) => (etatDe(sid).provisoire ? '' : apcCote(studentAvg(sid)).code) },
            { label: t('Saisie', 'Entered'), get: (sid) => { const e = etatDe(sid); return `${e.saisies}/${e.attendues}`; } },
          ]}
          normalize={(raw, cid) => validateGrade(raw, baremeFor(cid))}
          onImport={(sid, cid, v) => saveCell(sid, cid, { note: v })}
          disabled={locked}
          valueHint={colonnes.some((col) => baremeFor(col.id) !== APC_MAX)
            ? t('barème indiqué dans chaque en-tête', 'scale shown in each header')
            : `/${APC_MAX}`}
        />
      )}

      {matieres.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
          {matieresOrphelines.length > 0
            ? (
              <>
                {t(
                  'Ces matières qui vous sont affectées ne correspondent à aucune matière du référentiel officiel : ',
                  'These subjects assigned to you match no subject of the official framework: ',
                )}
                <span className="font-medium text-gray-700">
                  {[...new Set(matieresOrphelines.map((m) => m.name))].join(', ')}
                </span>
                {t(
                  '. Vérifiez leur orthographe dans Matières — le rapprochement se fait sur le nom.',
                  '. Check their spelling in Subjects — the match is made on the name.',
                )}
              </>
            )
            : subjectScoped
            ? t(
              'Aucune de vos matières n’a de compétence officielle pour cette classe et ce trimestre.',
              'None of your subjects has an official competency for this class and term.',
            )
            : t(
              'Aucune compétence officielle pour cette classe et ce trimestre. Importez un référentiel MINESEC.',
              'No official competency for this class and term. Import a MINESEC framework.',
            )}
        </div>
      ) : competences.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
          {t('Aucune compétence pour cette matière.', 'No competency for this subject.')}
        </div>
      ) : classStudents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
          {t('Aucun élève dans cette classe.', 'No student in this class.')}
        </div>
      ) : (
        <>
        {/* TÉLÉPHONE — une carte par élève. Les compétences du MINESEC sont des
            PHRASES : dans un tableau, leur en-tête est tronqué et on note sans
            savoir sur quoi. Ici le libellé est entier, au-dessus du champ. */}
        <MobileEntryList
          students={classStudents}
          columns={colonnes.map((col) => ({
            id: col.id, code: `${t('Éval.', 'Assess.')} ${col.rang}`,
            label: `${col.competence.intitule} · /${baremeFor(col.id)}`,
          }))}
          subtitle={(stu) => {
            const avg = studentAvg(stu.id);
            if (avg == null) return null;
            const etat = etatDe(stu.id);
            return etat.provisoire
              ? `${avg}/20 · ${indicateurSaisie(etat, { en: getLang() === 'en' })}`
              : `${avg}/20 · ${apcCote(avg).code}`;
          }}
          isFilled={(stu, col) => recordFor(stu.id, col.id)?.note != null}
          renderCell={(stu, col) => (
            <NoteCell
              value={recordFor(stu.id, col.id)?.note != null ? String(recordFor(stu.id, col.id).note) : ''}
              max={baremeFor(col.id)} disabled={locked}
              onCommit={(v) => saveCell(stu.id, col.id, { note: v })}
            />
          )}
        />

        {/* ORDINATEUR */}
        <div className="hidden md:block overflow-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {/* N° DE LA LISTE DE CLASSE — même numéro que sur la liste imprimée
                    et le bulletin (core/ordreClasse). */}
                <th className="sticky left-0 z-10 bg-gray-50 px-2 py-2 w-10 text-center font-medium text-gray-400">{t('N°', 'No.')}</th>
                <th className="sticky left-10 z-10 bg-gray-50 px-3 py-2 text-left font-medium text-gray-600">
                  {t('Élève', 'Student')}
                </th>
                {/* UNE COLONNE PAR ÉVALUATION, numérotée, et portant le NOM DE LA
                    COMPÉTENCE évaluée : « pour que l'enseignant n'ait pas besoin
                    d'explication » (consigne du 2026-11-01). Une matière à une
                    seule compétence a donc deux colonnes qui portent le même
                    intitulé — c'est voulu, et c'est le numéro qui les sépare. */}
                {colonnes.map((col) => (
                  <th key={col.id} className="px-3 py-2 text-left font-medium text-gray-600 max-w-[16rem]" title={col.competence.intitule}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-gray-500">
                        {t('Éval.', 'Assess.')} {col.rang}
                      </span>
                      {/* Barème de CETTE évaluation : /20 par défaut, modifiable. */}
                      <BaremeCell value={baremeFor(col.id)} disabled={locked}
                        onCommit={(n) => setBareme(col.id, n)} />
                    </span>
                    <span className="block truncate font-normal text-gray-600">{col.competence.intitule}</span>
                  </th>
                ))}
                <th className="px-3 py-2 text-center font-medium text-gray-600">{t('M/20', 'M/20')}</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">{t('Cote', 'Grade')}</th>
              </tr>
            </thead>
            <tbody>
              {classStudents.map((stu, ri) => (
                <tr key={stu.id} className="border-t border-gray-100">
                  <td className="sticky left-0 z-10 bg-white px-2 py-1.5 w-10 text-center text-xs text-gray-400 tabular-nums">{ri + 1}</td>
                  <td className="sticky left-10 z-10 bg-white px-3 py-1.5 font-medium text-gray-700 whitespace-nowrap">
                    {stu.name}
                  </td>
                  {colonnes.map((col, ci) => {
                    const rec = recordFor(stu.id, col.id);
                    return (
                      <td key={col.id} className="px-3 py-1.5">
                        <NoteCell value={rec?.note != null ? String(rec.note) : ''}
                          max={baremeFor(col.id)} disabled={locked}
                          champRef={poserCellule(ri, ci)} onNav={naviguer(ri, ci)}
                          onCommit={(v) => saveCell(stu.id, col.id, { note: v })} />
                      </td>
                    );
                  })}
                  {(() => {
                    const avg = studentAvg(stu.id);
                    const cote = apcCote(avg);
                    const etat = etatDe(stu.id);
                    return (
                      <>
                        {/* LA NOTE PROVISOIRE est affichée, pas cachée — mais elle
                            est dite provisoire. Une moyenne calculée sur une
                            évaluation sur deux va bouger : l'annoncer comme
                            définitive, c'est annoncer au parent un résultat faux. */}
                        <td className="px-3 py-1.5 text-center">
                          <span className={`font-semibold ${etat.provisoire ? 'text-amber-700' : 'text-gray-700'}`}>
                            {avg ?? '—'}
                          </span>
                          {etat.provisoire && (
                            <span className="mt-0.5 block text-[10px] font-medium leading-tight text-amber-600"
                              title={t('La moyenne du trimestre sera recalculée quand toutes les évaluations seront saisies.',
                                'The term average will be recomputed once every assessment is entered.')}
                            >
                              {indicateurSaisie(etat, { en: getLang() === 'en' })}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-center font-semibold" style={{ color: cote.col }}>
                          {etat.provisoire ? '—' : cote.code}
                        </td>
                      </>
                    );
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
