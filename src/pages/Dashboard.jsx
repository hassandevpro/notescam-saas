// TABLEAU DE BORD D'ACCUEIL (/app) — un seul écran, une composition par rôle.
//
// Cette page n'est qu'un ORCHESTRATEUR : elle demande au moteur pur
// (lib/dashboardBlocks) quels blocs afficher et dans quel ordre, puis les rend.
// Aucune règle de rôle n'est écrite ici, et aucune donnée n'est chargée pour un
// bloc qui n'a pas été retenu (un surveillant n'interroge jamais le budget, un
// enseignant jamais la discipline).

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useSchoolStore } from '../store/schoolStore';
import { useUiStore } from '../store/uiStore';
import { useMessagesStore } from '../store/messagesStore';
import { useT } from '../lib/i18n';
import { useCountry } from '../lib/useCountry';
import { resolveClassEngine } from '../core/engineResolver';
import { fetchSequenceDates, indexSequenceDates } from '../lib/sequenceDatesService';
import { displayRoleLabel } from '../lib/roleLabel';
import { catalogOrDefault } from '../governance/defaultCatalog';
import { roleBudgetQueues } from '../governance/dashboard';
import { dashboardLayout, BLOCK } from '../lib/dashboardBlocks';
import { financeRemoteMode } from '../lib/budgetRemote';
import Layout from '../components/Layout';

import { SchoolBadge, LicenseBadge, SetupChecklist } from '../components/dashboard/shared';
import TeacherClasses from '../components/dashboard/TeacherDashboard';
import {
  useAcademicStats, AcademicsStats, FeesBlock, GradesTodo, ClassTable, KpiBlock, AlertesBlock,
} from '../components/dashboard/AcademicBlocks';
import DisciplineBlock from '../components/dashboard/DisciplineBlock';
import {
  ValidateQueue, UnlockQueue, PayQueue, BudgetFigures, GroupLink,
} from '../components/dashboard/FinanceBlocks';
import QuickAccess from '../components/dashboard/QuickAccess';
import { useDisciplineSnapshot, useFinanceSnapshot } from '../components/dashboard/useDashboardData';
import { isSubjectScoped } from '../lib/teacherScope';
import CalendarConfirmBanner from '../components/dashboard/CalendarConfirmBanner';
import { calendrierConfirme } from '../lib/calendarConfirm';
import { classesDuFiltre } from '../lib/dashboardAlertes';
import { printDirectionReport } from '../lib/directionReportDoc';

export default function Dashboard() {
  const t = useT();
  const { school, role, fullName } = useAuthStore();
  const permissions = useAuthStore((s) => s.permissions);
  // Fiche enseignant rattachée au compte : sans elle, aucune affectation n'est
  // possible et le message d'accueil doit le dire, pas parler d'assignation.
  const teacherId = useAuthStore((s) => s.teacherId);
  const governanceCatalog = useAuthStore((s) => s.governanceCatalog);
  const governanceAssignments = useAuthStore((s) => s.governanceAssignments);
  const governanceRoleRows = useAuthStore((s) => s.governanceRoleRows);
  const jobTitle = useAuthStore((s) => s.jobTitle);
  const viewYear = useUiStore((s) => s.viewYear);
  // Messages non lus : lu par abonnement (l'ancien appel `getState()` dans le rendu
  // ne se rafraîchissait jamais).
  const unreadMsgs = useMessagesStore((s) => s.unreadCount);

  const classes  = useSchoolStore((s) => s.classes);
  const subjects = useSchoolStore((s) => s.subjects);
  const students = useSchoolStore((s) => s.students);
  // Unités du complexe scolaire : c'est souvent là que vit le logo de l'école.
  const schoolUnits = useSchoolStore((s) => s.schoolUnits);
  const gradeMap = useSchoolStore((s) => s.gradeMap);
  const primNonEvaluees = useSchoolStore((s) => s.primNonEvaluees);
  const teachers = useSchoolStore((s) => s.teachers);
  const fees     = useSchoolStore((s) => s.fees);
  const getClassFeeGrid = useSchoolStore((s) => s.getClassFeeGrid);
  const loading  = useSchoolStore((s) => s.loading);

  // Moteurs non numériques : leurs saisies ne vivent pas dans `gradeMap`, il faut
  // leurs propres données pour que « X/Y notes saisies » dise la vérité.
  const apcNotes        = useSchoolStore((s) => s.apcNotes);
  const primNotes       = useSchoolStore((s) => s.primNotes);
  const matObservations = useSchoolStore((s) => s.matObservations);
  const apcReferentiel  = useSchoolStore((s) => s.apcReferentiel);
  const loadApc  = useSchoolStore((s) => s.loadApc);
  const loadMat  = useSchoolStore((s) => s.loadMat);
  const loadPrim = useSchoolStore((s) => s.loadPrim);
  const country  = useCountry();

  const catalog = useMemo(() => catalogOrDefault(governanceCatalog), [governanceCatalog]);

  // Gouvernance financière distante : la composition du tableau de bord en dépend
  // (cible de la file de validation, masquage des déblocages). Tant que la réponse
  // n'est pas là on reste sur `false` = comportement historique.
  const [financeRemote, setFinanceRemote] = useState(false);
  useEffect(() => {
    let ok = true;
    if (!school?.id) { setFinanceRemote(false); return undefined; }
    financeRemoteMode(school.id).then((v) => { if (ok) setFinanceRemote(!!v); }).catch(() => {});
    return () => { ok = false; };
  }, [school?.id]);

  const { domain, blocks, profile } = useMemo(
    () => dashboardLayout({ role, catalog, assignments: governanceAssignments, permissions, financeRemote }),
    [role, catalog, governanceAssignments, permissions, financeRemote],
  );
  const show = (id) => blocks.includes(id);

  // ── Données, chargées uniquement pour les blocs retenus ───────────────────

  // Calendrier scolaire : c'est lui qui décide de la période à compléter. Une
  // lecture par école ; sans dates, les blocs retombent sur leur heuristique.
  const [seqDates, setSeqDates] = useState({});
  useEffect(() => {
    let ok = true;
    if (!school?.id) { setSeqDates({}); return undefined; }
    fetchSequenceDates(school.id)
      .then((rows) => { if (ok) setSeqDates(indexSequenceDates(rows)); })
      .catch(() => {});
    return () => { ok = false; };
  }, [school?.id]);

  // Les moteurs présents dans l'établissement, déduits des classes réelles : on
  // ne charge un référentiel fondamental/APC que s'il sert à quelqu'un.
  const engines = useMemo(() => {
    const set = new Set(classes.map((c) => resolveClassEngine(school, c)));
    return { apc: set.has('apc'), mat: set.has('maternelle'), prim: set.has('apc_primaire') };
  }, [classes, school]);
  useEffect(() => { if (engines.apc)  loadApc(); },  [engines.apc, loadApc]);
  useEffect(() => { if (engines.mat)  loadMat(); },  [engines.mat, loadMat]);
  useEffect(() => { if (engines.prim) loadPrim(); }, [engines.prim, loadPrim]);

  // Filtre des indicateurs : toute l'école, un cycle ou une classe.
  const [filtre, setFiltre] = useState('all');
  const classesFiltre = useMemo(() => classesDuFiltre(filtre, classes), [filtre, classes]);
  const cycles = useMemo(() => [...new Set(classes.map((c) => c.cycle).filter(Boolean))], [classes]);

  const academics = useAcademicStats({
    school, countryCode: country.code, classes, subjects, students,
    gradeMap, apcNotes, primNotes, matObservations, apcReferentiel,
    seqDates, fees, getClassFeeGrid, primNonEvaluees, teachers, role, teacherId,
    classesFiltre, calendrierOk: calendrierConfirme(school) || !['admin', 'censeur'].includes(role),
  });

  const needsDiscipline = show(BLOCK.DISCIPLINE);
  const classIds = useMemo(() => classes.map((c) => c.id), [classes]);
  const discipline = useDisciplineSnapshot(needsDiscipline, {
    schoolId: school?.id,
    yearLabel: viewYear ?? school?.current_year ?? '',
    classIds,
  });

  const needsFinance = show(BLOCK.QUEUE_VALIDATE) || show(BLOCK.QUEUE_PAY)
    || show(BLOCK.QUEUE_UNLOCK) || show(BLOCK.BUDGET_FIGURES);
  const finance = useFinanceSnapshot(needsFinance, {
    schoolId: school?.id,
    year: school?.current_year || '',
    withFigures: show(BLOCK.BUDGET_FIGURES),
    financeRemote,
  });

  // Files d'action : ce sur quoi CE rôle peut agir maintenant (moteur pur —
  // permission, palier de montant et secteur appliqués).
  const queues = useMemo(() => {
    const q = roleBudgetQueues({
      role, catalog, assignments: governanceAssignments,
      expenses: finance.expenses, unlockRequests: finance.unlockRequests,
      validationRules: school?.validation_rules, covered: profile.covered,
    });
    // Gouvernance distante : la file « à approuver » devient celle des demandes
    // DISTANTES en attente — le seul ensemble sur lequel /app/approbations (donc
    // le lien du bloc) permet réellement d'agir. Le palier de montant et le
    // secteur restent appliqués par le LAN, qui revalide chaque décision.
    if (!financeRemote) return q;
    return {
      ...q,
      toValidate: finance.remoteApprovals,
      counts: { ...q.counts, toValidate: finance.remoteApprovals.length },
    };
  }, [role, catalog, governanceAssignments, finance.expenses, finance.unlockRequests,
    finance.remoteApprovals, financeRemote, school?.validation_rules, profile.covered]);

  if (!school) {
    return (
      <Layout>
        <div className="bg-white rounded-xl p-8 shadow-sm">
          <p className="text-red-600">{t('Erreur : aucune école liée à ce compte.', 'Error: no school linked to this account.')}</p>
        </div>
      </Layout>
    );
  }

  const RENDER = {
    [BLOCK.SETUP]: () => (!loading
      ? <SetupChecklist school={school} classes={classes} subjects={subjects} students={students} units={schoolUnits} />
      : null),
    [BLOCK.TEACHER_CLASSES]: () => (
      <TeacherClasses
        classes={classes} students={students} subjects={subjects} gradeMap={gradeMap}
        linked={!!teacherId} scoped={isSubjectScoped(role, school)} teacherId={teacherId}
        school={school}
      />
    ),
    [BLOCK.ACADEMICS]: () => (
      <div className="space-y-4">
        <AcademicsStats loading={loading} classes={classes} students={students} globalPassRate={academics.globalPassRate} />
        {!loading && classes.length > 1 && (
          <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
            {t('Afficher', 'Show')}
            <select value={filtre} onChange={(e) => setFiltre(e.target.value)}
              className="min-h-[40px] rounded-lg border border-gray-300 bg-white px-2 text-sm font-normal">
              <option value="all">{t('Toute l’école', 'Whole school')}</option>
              {cycles.length > 1 && cycles.map((c) => <option key={c} value={`cycle:${c}`}>{t('Cycle', 'Cycle')} : {c}</option>)}
              {classes.map((c) => <option key={c.id} value={`class:${c.id}`}>{c.name}</option>)}
            </select>
          </label>
        )}
        {!loading && <KpiBlock kpis={academics.kpis} barres={academics.barres} />}
        {!loading && <AlertesBlock suivre={academics.alertesSuivre} faire={academics.alertesFaire} />}
        {!loading && ['admin', 'censeur'].includes(role) && (
          <button type="button"
            onClick={() => printDirectionReport({
              school, kpis: academics.kpis, barres: academics.barres, suivre: academics.alertesSuivre, faire: academics.alertesFaire,
              lang: school?.language,
              filtreLabel: filtre === 'all' ? '' : (filtre.startsWith('class:') ? (classes.find((c) => c.id === filtre.slice(6))?.name || '') : filtre.slice(6)),
            })}
            className="min-h-[44px] px-4 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50">
            {t('Rapport de direction (PDF)', 'Management report (PDF)')}
          </button>
        )}
      </div>
    ),
    [BLOCK.GRADES_TODO]: () => (!loading
      ? <><CalendarConfirmBanner school={school} role={role} hasDates={academics.calendarSet} />
        <GradesTodo suivi={academics.suivi} calendarSet={academics.calendarSet}
          direction={role === 'admin' || role === 'censeur'} schoolId={school?.id}
          senderName={fullName || ''} senderRole={role} /></>
      : null),
    [BLOCK.CLASS_TABLE]: () => (!loading ? <ClassTable classStats={academics.classStats} /> : null),
    [BLOCK.FEES]: () => <FeesBlock loading={loading} feesStats={academics.feesStats} />,
    [BLOCK.DISCIPLINE]: () => (
      <DisciplineBlock
        loading={discipline.loading} snapshot={discipline.snapshot}
        attendanceToday={discipline.attendanceToday} classes={classes} students={students}
      />
    ),
    [BLOCK.QUEUE_VALIDATE]: () => (
      <ValidateQueue loading={finance.loading} queues={queues} scopedToSector={profile.scopedToSector} financeRemote={financeRemote} />
    ),
    [BLOCK.QUEUE_UNLOCK]: () => <UnlockQueue loading={finance.loading} queues={queues} />,
    [BLOCK.QUEUE_PAY]: () => <PayQueue loading={finance.loading} queues={queues} />,
    [BLOCK.BUDGET_FIGURES]: () => (
      <BudgetFigures loading={finance.loading} envelope={finance.envelope}
        consumption={finance.consumption} scopedToSector={profile.scopedToSector} />
    ),
    [BLOCK.GROUP_LINK]: () => <GroupLink />,
    [BLOCK.QUICK_ACCESS]: () => <QuickAccess domain={domain} />,
  };

  const greeting = domain === 'teaching' ? t('Bienvenue', 'Welcome') : t('Bonjour', 'Hello');
  const name = domain === 'teaching' ? fullName : fullName?.split(' ')[0];
  // Le libellé affiché est le rôle de gouvernance le plus élevé quand il existe,
  // sinon l'intitulé de poste — cohérent avec l'en-tête et la page profil.
  // Pas de repli sur `roleLabel` : il réintroduirait le « Censeur » que
  // `displayRoleLabel` retire volontairement pour les comptes délégués.
  const shownRole = displayRoleLabel(role, governanceRoleRows, t, jobTitle);

  return (
    <Layout>
      <div className="space-y-5">

        {/* En-tête */}
        <div className="bg-white rounded-xl px-6 py-5 shadow-sm border border-gray-100">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="leading-tight">
              <h1 className="text-xl font-bold text-gray-900">
                {greeting}{name ? `, ${name}` : ''}
              </h1>
              <p className="text-sm text-gray-400 mt-0.5">{shownRole}</p>
            </div>
            <div className="flex items-center gap-4">
              <SchoolBadge school={school} units={schoolUnits} />
              {unreadMsgs > 0 && (
                <Link to="/app/notifications"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>
                  {unreadMsgs} {t('message', 'message')}{unreadMsgs > 1 ? 's' : ''}
                </Link>
              )}
              <LicenseBadge school={school} />
            </div>
          </div>
        </div>

        {blocks.map((id) => {
          const node = RENDER[id]?.();
          return node ? <div key={id}>{node}</div> : null;
        })}

      </div>
    </Layout>
  );
}
