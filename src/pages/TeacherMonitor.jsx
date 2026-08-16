import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { useNotificationsStore } from '../store/notificationsStore';
import { useMessagesStore } from '../store/messagesStore';
import { buildWhatsAppUrl } from '../lib/messagesService';
import { fetchSequenceDates, indexSequenceDates } from '../lib/sequenceDatesService';
import { TRACKS, tracksInUse, trackKeyForClass, currentPeriodOfTrack, periodAt, effectiveDeadline } from '../lib/calendarTracks';
import { classEntryProgress, subjectEntryRate, indexPrimNotes } from '../lib/gradeEntryProgress';
import { resolveClassEngine } from '../core/engineResolver';
import Layout from '../components/Layout';
import HubTabs from '../components/hubs/HubTabs';
import SchoolCalendar from '../components/SchoolCalendar';
import { useT, getLang, localeForLang } from '../lib/i18n';
import { useCountry } from '../lib/useCountry';

// Seuils de risque (jours d'inactivité). Centralisés pour l'évolutivité.
const INACTIVE_DAYS = 14;
const STALE_DAYS    = 7;

function timeAgo(dateStr) {
  if (!dateStr) return null;
  const isEN = getLang() === 'en';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return isEN ? 'Just now' : "À l'instant";
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `${days} ${isEN ? `day${days > 1 ? 's' : ''}` : `jour${days > 1 ? 's' : ''}`}`;
}

function ProgressBar({ rate }) {
  if (rate === null) return <div className="w-full h-1.5 bg-gray-100 rounded-full" />;
  const color = rate === 100 ? 'bg-emerald-500' : rate > 0 ? 'bg-amber-400' : 'bg-red-300';
  return (
    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full ${color} transition-all`} style={{ width: `${rate}%` }} />
    </div>
  );
}

// Pastille de risque (vert / orange / rouge / neutre).
function RiskDot({ level }) {
  const map = {
    green:  'bg-emerald-500',
    orange: 'bg-amber-500',
    red:    'bg-red-500',
    none:   'bg-gray-300',
  };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${map[level] || map.none}`} />;
}

// ── Modal de composition de message ──────────────────────────────────────────
function ComposeModal({ teacher, schoolId, senderName, onClose }) {
  const t = useT();
  const sendMsg = useMessagesStore((s) => s.send);
  const [subject, setSubject] = useState('');
  const [body,    setBody]    = useState('');
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);

  const handleSend = async () => {
    if (!body.trim()) return;
    setSending(true);
    const ok = await sendMsg({
      school_id:     schoolId,
      sender_name:   senderName,
      sender_role:   'admin',
      to_teacher_id: teacher.id,
      subject:       subject.trim() || null,
      body:          body.trim(),
    });
    setSending(false);
    if (ok) setSent(true);
  };

  const handleWhatsApp = () => {
    if (!body.trim()) return;
    const text = subject.trim() ? `[${subject.trim()}]\n\n${body.trim()}` : body.trim();
    window.open(buildWhatsAppUrl(teacher.phone, text), '_blank', 'noopener');
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {sent ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">✅</div>
            <p className="font-semibold text-gray-800 mb-1">{t('Message envoyé', 'Message sent')}</p>
            <p className="text-sm text-gray-500 mb-5">
              <strong>{teacher.name}</strong> {t('recevra une notification dès sa prochaine connexion.', 'will receive a notification on their next login.')}
            </p>
            <button onClick={onClose} className="btn-primary" style={{ width: 'auto', paddingInline: '2rem' }}>{t('Fermer', 'Close')}</button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold shrink-0">
                {teacher.name?.[0]?.toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-gray-900 text-sm">{t('Message à', 'Message to')} {teacher.name}</p>
                {teacher.phone && <p className="text-xs text-gray-400">📱 {teacher.phone}</p>}
              </div>
              <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="form-label">{t('Objet (optionnel)', 'Subject (optional)')}</label>
                <input type="text" className="form-input" placeholder={t('Ex : Rappel saisie notes Séquence 3', 'E.g. Reminder: enter grades Sequence 3')} value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div>
                <label className="form-label">{t('Message *', 'Message *')}</label>
                <textarea rows={5} className="form-input resize-none" placeholder={t('Bonjour, je souhaitais vous rappeler que les notes de la Séquence 3 ne sont pas encore saisies pour la classe de…', 'Hello, I wanted to remind you that grades for Sequence 3 have not yet been entered for the class of…')} value={body} onChange={(e) => setBody(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-5">
              <button onClick={handleSend} disabled={sending || !body.trim()} className="btn-primary" style={{ width: 'auto', paddingInline: '1.5rem' }}>
                {sending ? t('Envoi…', 'Sending…') : `📩 ${t("Envoyer dans l'app", 'Send in app')}`}
              </button>
              <button onClick={handleWhatsApp} disabled={!body.trim()} className="flex items-center gap-2 px-4 py-2 bg-[#25D366] hover:bg-[#1ebe57] disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                WhatsApp
              </button>
              <button onClick={onClose} className="btn-secondary" style={{ width: 'auto' }}>{t('Annuler', 'Cancel')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── KPI card (Executive dashboard) ───────────────────────────────────────────
function KpiCard({ value, label, tone = 'neutral', onClick, active }) {
  const tones = {
    neutral: 'text-gray-900',
    brand:   'text-brand-700',
    good:    'text-emerald-600',
    warn:    'text-amber-600',
    bad:     'text-red-600',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left bg-white rounded-xl border p-3.5 transition-all ${
        active ? 'border-brand-400 ring-1 ring-brand-200' : 'border-gray-100 hover:border-gray-200'
      } ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div className={`text-2xl font-extrabold ${tones[tone]}`}>{value}</div>
      <div className="text-xs font-medium text-gray-500 mt-0.5 leading-tight">{label}</div>
    </button>
  );
}

export default function TeacherMonitor() {
  const t = useT();
  const { school, fullName, role } = useAuthStore();
  const country    = useCountry();
  const allClasses = useSchoolStore((s) => s.classes);
  const subjects   = useSchoolStore((s) => s.subjects);
  const students   = useSchoolStore((s) => s.students);
  const teachers   = useSchoolStore((s) => s.teachers);
  const gradeMap   = useSchoolStore((s) => s.gradeMap);

  // Moteurs non numériques : la maternelle et le primaire MINEDUB n'écrivent
  // jamais dans `gradeMap`, il faut leurs propres données pour les suivre.
  const apcNotes        = useSchoolStore((s) => s.apcNotes);
  const primNotes       = useSchoolStore((s) => s.primNotes);
  const matObservations = useSchoolStore((s) => s.matObservations);
  const apcReferentiel  = useSchoolStore((s) => s.apcReferentiel);
  const loadApc  = useSchoolStore((s) => s.loadApc);
  const loadMat  = useSchoolStore((s) => s.loadMat);
  const loadPrim = useSchoolStore((s) => s.loadPrim);

  const notifications  = useNotificationsStore((s) => s.notifications);
  const markRead       = useNotificationsStore((s) => s.markRead);
  const messages       = useMessagesStore((s) => s.messages);

  const [pickedSeq,    setPickedSeq]    = useState(null);   // null = suivre le calendrier
  const [pickedTrack,  setPickedTrack]  = useState(null);
  const [composeFor,   setComposeFor]   = useState(null);
  const [seqDatesMap,  setSeqDatesMap]  = useState({});
  const [filter,       setFilter]       = useState('all'); // all|late|inactive|completed|nograde
  const [search,       setSearch]       = useState('');
  const [activeTab,    setActiveTab]    = useState(() => {
    try { return localStorage.getItem('nc_monitor_tab') || 'cockpit'; } catch { return 'cockpit'; }
  });

  // Rechargeable : régler les dates dans l'onglet Calendrier doit reprendre
  // l'écran (période ouverte, échéances, retards) sans passer par un F5.
  const refreshSeqDates = useCallback(() => {
    if (!school?.id) return;
    fetchSequenceDates(school.id).then((rows) => setSeqDatesMap(indexSequenceDates(rows)));
  }, [school?.id]);
  useEffect(() => { refreshSeqDates(); }, [refreshSeqDates]);

  // ── Piste suivie ──────────────────────────────────────────────────────────
  // Un établissement complet suit plusieurs découpages en parallèle (séquences
  // MINESEC, UA du primaire MINEDUB, trimestres de maternelle, terms). On en
  // surveille UN à la fois : mélanger « Séq 4 » et « Trim 2 » dans les mêmes
  // pourcentages ne voudrait rien dire.
  const trackKeys   = useMemo(() => tracksInUse(school, allClasses, country.code),
    [school, allClasses, country.code]);
  const activeTrack = (pickedTrack && trackKeys.includes(pickedTrack)) ? pickedTrack : trackKeys[0];
  const track       = TRACKS[activeTrack];
  const periodWord  = t(track.unit.fr, track.unit.en, track.unit.es);

  // Les classes de cette piste, et leur moteur de saisie.
  const classes = useMemo(
    () => allClasses.filter((c) => trackKeyForClass(school, c, country.code) === activeTrack),
    [allClasses, school, country.code, activeTrack],
  );
  const engineOf = useMemo(() => {
    const map = {};
    classes.forEach((c) => { map[c.id] = resolveClassEngine(school, c); });
    return map;
  }, [classes, school]);

  // Les référentiels/notes des moteurs présents dans la piste suivie.
  const engines = useMemo(() => {
    const set = new Set(Object.values(engineOf));
    return { apc: set.has('apc'), mat: set.has('maternelle'), prim: set.has('apc_primaire') };
  }, [engineOf]);
  useEffect(() => { if (engines.apc)  loadApc(); },  [engines.apc, loadApc]);
  useEffect(() => { if (engines.mat)  loadMat(); },  [engines.mat, loadMat]);
  useEffect(() => { if (engines.prim) loadPrim(); }, [engines.prim, loadPrim]);

  const sources = useMemo(
    () => ({ gradeMap, apcNotes, primNotes, matObservations, apcReferentiel,
             primIndex: indexPrimNotes(primNotes) }),
    [gradeMap, apcNotes, primNotes, matObservations, apcReferentiel],
  );

  // ── Période suivie : le calendrier d'abord, le clic de l'utilisateur ensuite ─
  const calendarPeriod = useMemo(
    () => currentPeriodOfTrack(activeTrack, seqDatesMap, new Date()),
    [activeTrack, seqDatesMap],
  );
  const selectedSeq = pickedSeq ?? calendarPeriod?.order ?? 1;
  const currentSeqConfig = seqDatesMap[periodAt(activeTrack, selectedSeq)?.key] ?? null;
  const dateLocale = localeForLang();

  // Changer de piste remet la sélection sur la période ouverte de la nouvelle.
  useEffect(() => { setPickedSeq(null); }, [activeTrack]);

  // ── Classes assignées par enseignant ──────────────────────────────────────
  const teacherClassIds = useMemo(() => {
    const map = {};
    const inTrack = new Set(classes.map((c) => c.id));
    teachers.forEach((tc) => { map[tc.id] = new Set(); });
    subjects.forEach((s) => { if (s.teacher_id && map[s.teacher_id] && inTrack.has(s.class_id)) map[s.teacher_id].add(s.class_id); });
    classes.forEach((c)  => { if (c.teacher_id && map[c.teacher_id]) map[c.teacher_id].add(c.id); });
    return map;
  }, [teachers, subjects, classes]);

  // ── Complétion par classe, au moteur de chaque classe ─────────────────────
  const classCompletion = useMemo(() => {
    const map = {};
    classes.forEach((cls) => {
      const studs = students.filter((s) => s.class_id === cls.id);
      const subs  = subjects.filter((s) => s.class_id === cls.id);
      if (!studs.length) { map[cls.id] = { total: 0, filled: 0, rate: null }; return; }
      const { expected, entered } = classEntryProgress({
        engine: engineOf[cls.id], cls, subs, studs, order: selectedSeq, ...sources,
      });
      map[cls.id] = expected
        ? { total: expected, filled: entered, rate: Math.round((entered / expected) * 100) }
        : { total: studs.length, filled: 0, rate: null };
    });
    return map;
  }, [classes, students, subjects, engineOf, selectedSeq, sources]);

  // ── Complétion par MATIÈRE (pour « matières sans notes ») ──────────────────
  const subjectStats = useMemo(() => {
    const byId = {};
    let missingCount = 0;
    const inTrack = new Set(classes.map((c) => c.id));
    subjects.forEach((subj) => {
      if (!inTrack.has(subj.class_id)) return;
      const studs = students.filter((s) => s.class_id === subj.class_id);
      const stat = subjectEntryRate({
        engine: engineOf[subj.class_id], sub: subj, studs, order: selectedSeq, ...sources,
      });
      byId[subj.id] = stat;
      if (stat.rate === 0) missingCount++;
    });
    return { byId, missingCount };
  }, [subjects, students, classes, engineOf, selectedSeq, sources]);

  const teacherLastActivity = useMemo(() => {
    const map = {};
    notifications.forEach((n) => {
      if (!n.teacher_id) return;
      if (!map[n.teacher_id] || new Date(n.created_at) > new Date(map[n.teacher_id])) map[n.teacher_id] = n.created_at;
    });
    return map;
  }, [notifications]);

  const unassignedClasses = useMemo(() => {
    const assignedIds = new Set(Object.values(teacherClassIds).flatMap((s) => [...s]));
    return classes.filter((c) => !assignedIds.has(c.id));
  }, [classes, teacherClassIds]);

  // Échéance de la période AFFICHÉE (pas seulement de celle qu'ouvre le
  // calendrier : l'utilisateur peut inspecter une période antérieure).
  const deadline = useMemo(() => {
    const dl = effectiveDeadline(currentSeqConfig);
    if (!dl) return { date: null, daysLeft: null, overdue: false, atRisk: false };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const daysLeft = Math.round((Date.parse(`${dl}T00:00:00`) - today.getTime()) / 86400000);
    return { date: dl, daysLeft, overdue: daysLeft < 0, atRisk: daysLeft >= 0 && daysLeft <= 3 };
  }, [currentSeqConfig]);

  // ── Lignes enseignant + SCORE DE RISQUE ───────────────────────────────────
  // Score (0 sain → 100 critique) :
  //   +0.5 × (100 − complétion moyenne)         déficit de saisie ......... 0–50
  //   inactivité : aucune=+25 · >14j=+18 · >7j=+10 .......................... 0–25
  //   échéance : classe en retard=+30 · à risque=+12 ....................... 0–30
  //   matières sans note : +4 par matière (max 20) ......................... 0–20
  // Niveau : rouge ≥55 · orange ≥25 · vert <25 · neutre = aucune classe.
  const teacherRows = useMemo(() => {
    return teachers.map((tc) => {
      const ids = [...(teacherClassIds[tc.id] || [])];
      const cls = classes.filter((c) => ids.includes(c.id));
      const rates = cls.map((c) => classCompletion[c.id]?.rate).filter((r) => r !== null);
      const avgRate = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null;
      const lastActivity = teacherLastActivity[tc.id] ?? null;
      const days = lastActivity ? Math.floor((Date.now() - new Date(lastActivity)) / 86400000) : null;
      const teacherSubs = subjects.filter((s) => s.teacher_id === tc.id);
      const missingSubs = teacherSubs.filter((s) => subjectStats.byId[s.id]?.rate === 0).length;
      const incomplete = cls.some((c) => { const r = classCompletion[c.id]?.rate; return r !== null && r < 100; });
      const hasOverdue = deadline.overdue && incomplete;
      const atRisk     = deadline.atRisk && incomplete;

      let score = 0;
      score += avgRate === null ? 0 : (100 - avgRate) * 0.5;
      if (lastActivity === null) score += 25; else if (days > INACTIVE_DAYS) score += 18; else if (days > STALE_DAYS) score += 10;
      if (hasOverdue) score += 30; else if (atRisk) score += 12;
      score += Math.min(missingSubs * 4, 20);
      score = Math.max(0, Math.min(100, Math.round(score)));

      const level = ids.length === 0 ? 'none' : score >= 55 ? 'red' : score >= 25 ? 'orange' : 'green';

      const statuses = [];
      if (hasOverdue || atRisk) statuses.push('late');
      if (ids.length > 0 && (lastActivity === null || days > INACTIVE_DAYS)) statuses.push('inactive');
      if (avgRate === 100) statuses.push('completed');
      if (avgRate === 0 && rates.length) statuses.push('nograde');

      return { teacher: tc, cls, assignedCount: ids.length, avgRate, lastActivity, days, missingSubs, hasOverdue, atRisk, risk: { score, level }, statuses };
    }).sort((a, b) => b.risk.score - a.risk.score);
  }, [teachers, teacherClassIds, classes, classCompletion, teacherLastActivity, subjects, subjectStats, deadline]);

  // ── KPIs exécutifs ─────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const withClasses = teacherRows.filter((r) => r.assignedCount > 0);
    const allRates = classes.map((c) => classCompletion[c.id]?.rate).filter((r) => r !== null);
    const overall = allRates.length ? Math.round(allRates.reduce((a, b) => a + b, 0) / allRates.length) : null;
    return {
      overall,
      late:      withClasses.filter((r) => r.statuses.includes('late')).length,
      inactive:  withClasses.filter((r) => r.statuses.includes('inactive')).length,
      completed: classes.filter((c) => classCompletion[c.id]?.rate === 100).length,
      blocked:   unassignedClasses.length,
      subjectsMissing: subjectStats.missingCount,
      classesTotal: classes.length,
    };
  }, [teacherRows, classes, classCompletion, unassignedClasses, subjectStats]);

  // ── Centre d'alertes (priorité décroissante) ───────────────────────────────
  const alerts = useMemo(() => {
    const list = [];
    teacherRows.forEach((r) => {
      if (r.risk.level === 'red') {
        list.push({ p: 0, icon: '🔴', teacher: r.teacher,
          title: `${r.teacher.name}`,
          detail: r.hasOverdue
            ? t('En retard — échéance dépassée, saisie incomplète.', 'Late — deadline passed, entry incomplete.', 'Atrasado — plazo vencido.')
            : t('Action immédiate requise (faible saisie / inactif).', 'Immediate action required (low entry / inactive).', 'Acción inmediata requerida.'),
          action: true });
      }
    });
    if (kpi.blocked > 0) list.push({ p: 0, icon: '🚫', title: t('Classes sans enseignant', 'Classes without a teacher', 'Clases sin profesor'), detail: `${kpi.blocked} ${t('classe(s) à assigner', 'class(es) to assign', 'clase(s) por asignar')}` });
    if (kpi.subjectsMissing > 0) list.push({ p: 1, icon: '📭', title: t('Matières sans aucune note', 'Subjects with no grades', 'Asignaturas sin notas'), detail: `${kpi.subjectsMissing} ${t('matière(s)', 'subject(s)', 'asignatura(s)')} · ${periodWord} ${selectedSeq}` });
    teacherRows.filter((r) => r.risk.level === 'orange').slice(0, 5).forEach((r) => {
      list.push({ p: 1, icon: '🟠', teacher: r.teacher, title: r.teacher.name, detail: t('Attention requise — saisie en retard.', 'Attention needed — entry behind.', 'Atención requerida.'), action: true });
    });
    if (!list.length) list.push({ p: 2, icon: '✅', title: t('Tout est à jour', 'Everything is up to date', 'Todo al día'), detail: t('Aucune action requise pour cette période.', 'No action required for this period.', 'Sin acciones para este periodo.') });
    return list.sort((a, b) => a.p - b.p);
  }, [teacherRows, kpi, periodWord, selectedSeq, t]);

  // ── Filtrage de la table ───────────────────────────────────────────────────
  const FILTERS = [
    { id: 'all',       label: t('Tous', 'All', 'Todos') },
    { id: 'late',      label: t('En retard', 'Late', 'Atrasados') },
    { id: 'inactive',  label: t('Inactifs', 'Inactive', 'Inactivos') },
    { id: 'completed', label: t('Terminés', 'Completed', 'Completos') },
    { id: 'nograde',   label: t('Sans note', 'No grades', 'Sin notas') },
  ];
  const filteredRows = useMemo(() => {
    let rows = teacherRows;
    if (filter !== 'all') rows = rows.filter((r) => r.statuses.includes(filter));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) => r.teacher.name?.toLowerCase().includes(q) || r.cls.some((c) => c.name?.toLowerCase().includes(q)));
    }
    return rows;
  }, [teacherRows, filter, search]);

  const roleLabel = role === 'censeur'
    ? t('Vue Censeur', 'Dean view', 'Vista Jefe de estudios')
    : t('Vue Directeur', 'Principal view', 'Vista Director');

  // ── Sélecteur de piste + période (en-tête partagé) ─────────────────────────
  // La période présélectionnée est celle qu'OUVRE le calendrier scolaire ; le
  // clic reste possible pour inspecter une période antérieure.
  const seqSelector = (
    <div className="flex flex-col items-end gap-1.5">
      {trackKeys.length > 1 && (
        <div className="flex gap-1">
          {trackKeys.map((k) => (
            <button key={k} onClick={() => setPickedTrack(k)}
              title={t(TRACKS[k].title.fr, TRACKS[k].title.en, TRACKS[k].title.es)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                activeTrack === k ? 'bg-brand-100 text-brand-700 border border-brand-300'
                                  : 'bg-white border border-gray-200 text-gray-500 hover:border-brand-300'}`}>
              {t(TRACKS[k].unit.fr, TRACKS[k].unit.en, TRACKS[k].unit.es)}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-500 font-medium">{periodWord} :</label>
        <div className="flex gap-1 flex-wrap justify-end">
          {track.periods.map((p) => {
            const isCal = calendarPeriod?.order === p.order;
            return (
              <button key={p.key} onClick={() => setPickedSeq(p.order)}
                title={isCal ? t('Période ouverte au calendrier', 'Period open in the calendar', 'Periodo abierto en el calendario') : undefined}
                className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${
                  selectedSeq === p.order ? 'bg-brand-600 text-white shadow-sm'
                    : isCal ? 'bg-white border border-brand-300 text-brand-700'
                            : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-300'}`}>
                {p.order}
              </button>
            );
          })}
        </div>
      </div>
      {deadline.date ? (
        <p className="text-xs text-gray-400">
          {t('Limite saisie', 'Deadline', 'Cierre')} :&nbsp;
          <span className={`font-semibold ${deadline.overdue ? 'text-red-600' : 'text-gray-600'}`}>
            {new Date(`${deadline.date}T00:00:00`).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })}
          </span>
          {deadline.daysLeft !== null && deadline.daysLeft >= 0 && <span className="text-gray-400"> · J-{deadline.daysLeft}</span>}
          {deadline.overdue && <span className="text-red-500 font-semibold"> · {t('dépassée', 'overdue', 'vencido')}</span>}
        </p>
      ) : (
        <Link to="/app/settings" className="text-xs text-amber-600 hover:text-amber-800 font-medium">
          {t('Aucune date au calendrier — renseigner', 'No calendar date — set it up', 'Sin fechas — configurar')}
        </Link>
      )}
    </div>
  );

  // Le calendrier vit aussi ICI, pas seulement dans les Paramètres (réservés à
  // l'administrateur) : c'est de cette page que le directeur du fondamental ou le
  // proviseur du secondaire pilote les saisies, et ce sont ses échéances qui
  // décident des retards. Chacun n'y voit que sa part (périmètre du compte).
  const tabs = [
    { id: 'cockpit',  label: t('Cockpit', 'Cockpit', 'Cabina'),                   render: renderCockpit },
    { id: 'teachers', label: t('Enseignants', 'Teachers', 'Profesores'),          render: renderTeachers },
    { id: 'journal',  label: t("Journal d'activité", 'Activity log', 'Registro'), render: renderJournal },
    { id: 'calendar', label: t('Calendrier scolaire', 'School calendar', 'Calendario'), render: renderCalendar },
  ];

  return (
    <Layout>
      {composeFor && (
        <ComposeModal teacher={composeFor} schoolId={school?.id} senderName={fullName || t('Administrateur', 'Administrator')} onClose={() => setComposeFor(null)} />
      )}
      <HubTabs
        title={t('Surveillance', 'Monitoring', 'Supervisión')}
        subtitle={(
          <>
            <span className="font-semibold text-brand-700">{roleLabel}</span>
            {' · '}{t('Pilotage des saisies', 'Grade-entry control', 'Control de entradas')} — {school?.current_year}
          </>
        )}
        right={activeTab === 'calendar' ? null : seqSelector}
        tabs={tabs}
        storageKey="nc_monitor_tab"
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
    </Layout>
  );

  // ════════════════════════════════════════════════════════════════════════════
  // ONGLET 1 — COCKPIT : KPIs + Centre d'alertes
  // ════════════════════════════════════════════════════════════════════════════
  function renderCockpit() {
    return (
      <div className="space-y-6">
        {/* KPI exécutifs — chaque carte filtre la table */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard value={kpi.overall === null ? '—' : `${kpi.overall}%`} label={t('Complétion globale', 'Overall completion', 'Completitud global')} tone="brand" />
          <KpiCard value={kpi.late} label={t('Enseignants en retard', 'Teachers late', 'Profesores atrasados')} tone={kpi.late ? 'bad' : 'good'} onClick={() => goTeachers('late')} />
          <KpiCard value={kpi.inactive} label={t('Enseignants inactifs', 'Teachers inactive', 'Profesores inactivos')} tone={kpi.inactive ? 'warn' : 'good'} onClick={() => goTeachers('inactive')} />
          <KpiCard value={`${kpi.completed}/${kpi.classesTotal}`} label={t('Classes terminées', 'Classes completed', 'Clases completas')} tone="good" />
          <KpiCard value={kpi.blocked} label={t('Classes bloquées', 'Classes blocked', 'Clases bloqueadas')} tone={kpi.blocked ? 'warn' : 'good'} />
          <KpiCard value={kpi.subjectsMissing} label={t('Matières sans note', 'Subjects missing grades', 'Asignaturas sin notas')} tone={kpi.subjectsMissing ? 'bad' : 'good'} onClick={() => goTeachers('nograde')} />
        </div>

        {/* Centre d'alertes priorisé */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">{t("Centre d'alertes", 'Alerts center', 'Centro de alertas')}</h2>
            <span className="text-xs text-gray-400">{periodWord} {selectedSeq}</span>
          </div>
          <div className="divide-y divide-gray-50 max-h-[26rem] overflow-y-auto">
            {alerts.map((a, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <span className="text-base shrink-0">{a.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{a.title}</p>
                  <p className="text-xs text-gray-500 truncate">{a.detail}</p>
                </div>
                {a.action && a.teacher && (
                  <button onClick={() => setComposeFor(a.teacher)} className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors">
                    {t('Relancer', 'Nudge', 'Avisar')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ONGLET 2 — ENSEIGNANTS : table de monitoring filtrable + risque
  // ════════════════════════════════════════════════════════════════════════════
  function renderTeachers() {
    return (
      <div className="space-y-4">
        {/* Filtres + recherche */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {FILTERS.map((f) => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${filter === f.id ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-300'}`}>
                {f.label}
              </button>
            ))}
          </div>
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Rechercher…', 'Search…', 'Buscar…')}
            className="form-input ml-auto max-w-[200px] !py-1.5 text-sm"
          />
        </div>

        {filteredRows.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
            <div className="text-3xl mb-2">🔍</div>
            <p className="text-gray-500 text-sm">{teachers.length === 0 ? t('Aucun enseignant configuré.', 'No teachers configured.') : t('Aucun enseignant pour ce filtre.', 'No teacher for this filter.', 'Sin profesores para este filtro.')}</p>
          </div>
        ) : (
          <>
            {/* ── Desktop : table ── */}
            <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs uppercase text-gray-500 tracking-wider">
                    <th className="text-left px-4 py-2.5 w-8"></th>
                    <th className="text-left px-4 py-2.5">{t('Enseignant', 'Teacher', 'Profesor')}</th>
                    <th className="text-left px-4 py-2.5">{t('Classes', 'Classes', 'Clases')}</th>
                    <th className="text-left px-4 py-2.5 w-40">{t('Complétion', 'Completion', 'Completitud')}</th>
                    <th className="text-left px-4 py-2.5">{t('Dernière activité', 'Last activity', 'Última actividad')}</th>
                    <th className="text-left px-4 py-2.5">{t('Statut', 'Status', 'Estado')}</th>
                    <th className="text-right px-4 py-2.5">{t('Action', 'Action', 'Acción')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredRows.map((r) => (
                    <tr key={r.teacher.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3"><RiskDot level={r.risk.level} /></td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{r.teacher.name}</p>
                        <p className="text-xs text-gray-400">{r.teacher.auth_user_id ? t('Compte actif', 'Active account') : t('Sans compte', 'No account')}{r.missingSubs > 0 && <> · <span className="text-red-500">{r.missingSubs} {t('matière(s) vide(s)', 'empty subject(s)', 'asig. vacías')}</span></>}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {r.assignedCount === 0 ? <span className="text-gray-300">—</span> : `${r.assignedCount} ${t('classe(s)', 'class(es)', 'clase(s)')}`}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold w-9 ${r.avgRate === 100 ? 'text-emerald-600' : r.avgRate ? 'text-amber-600' : 'text-red-500'}`}>{r.avgRate === null ? '—' : `${r.avgRate}%`}</span>
                          <div className="flex-1"><ProgressBar rate={r.avgRate} /></div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{r.lastActivity ? timeAgo(r.lastActivity) : <span className="text-red-400">{t('Jamais', 'Never', 'Nunca')}</span>}</td>
                      <td className="px-4 py-3"><StatusTag r={r} /></td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => setComposeFor(r.teacher)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors">{t('Message', 'Message', 'Mensaje')}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Mobile : lignes compactes ── */}
            <div className="md:hidden space-y-2">
              {filteredRows.map((r) => (
                <div key={r.teacher.id} className="bg-white rounded-xl border border-gray-100 p-3">
                  <div className="flex items-center gap-2">
                    <RiskDot level={r.risk.level} />
                    <p className="font-semibold text-gray-900 text-sm flex-1 min-w-0 truncate">{r.teacher.name}</p>
                    <span className={`text-xs font-bold ${r.avgRate === 100 ? 'text-emerald-600' : r.avgRate ? 'text-amber-600' : 'text-red-500'}`}>{r.avgRate === null ? '—' : `${r.avgRate}%`}</span>
                    <button onClick={() => setComposeFor(r.teacher)} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700">{t('Msg', 'Msg', 'Msg')}</button>
                  </div>
                  <div className="mt-2"><ProgressBar rate={r.avgRate} /></div>
                  <div className="flex items-center justify-between mt-1.5 text-xs text-gray-400">
                    <span>{r.assignedCount} {t('classe(s)', 'class(es)', 'clase(s)')}</span>
                    <span>{r.lastActivity ? timeAgo(r.lastActivity) : t('Jamais', 'Never', 'Nunca')}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Classes sans enseignant assigné */}
        {unassignedClasses.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-amber-100">
              <h2 className="font-semibold text-amber-800 text-sm">
                {unassignedClasses.length} {unassignedClasses.length > 1 ? t('classes sans enseignant assigné', 'classes without an assigned teacher') : t('classe sans enseignant assigné', 'class without an assigned teacher')}
              </h2>
              <p className="text-xs text-amber-600 mt-0.5">{t('Assignez un enseignant dans Matières ou Enseignants pour suivre leur activité.', 'Assign a teacher in Subjects or Teachers to track their activity.')}</p>
            </div>
            <div className="px-5 py-3 flex flex-wrap gap-2">
              {unassignedClasses.map((cls) => (
                <span key={cls.id} className="bg-white border border-amber-200 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700">{cls.name}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ONGLET 3 — JOURNAL D'ACTIVITÉ (feed professionnel)
  // ════════════════════════════════════════════════════════════════════════════
  // ════════════════════════════════════════════════════════════════════════════
  // ONGLET 4 — CALENDRIER SCOLAIRE : les échéances qui pilotent tout l'écran
  // ════════════════════════════════════════════════════════════════════════════
  function renderCalendar() {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <SchoolCalendar onSaved={refreshSeqDates} />
      </div>
    );
  }

  function renderJournal() {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">{t("Journal d'activité", 'Activity log', 'Registro de actividad')}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{t('Toutes les saisies enregistrées par les enseignants.', 'All entries recorded by teachers.')}</p>
          </div>
          {notifications.some((n) => !n.read) && (
            <button onClick={() => school?.id && useNotificationsStore.getState().markAllRead(school.id)} className="text-xs text-brand-600 hover:text-brand-700 font-semibold">
              {t('Tout marquer comme lu', 'Mark all as read')}
            </button>
          )}
        </div>
        {notifications.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400">{t("Aucune activité enregistrée pour l'instant.", 'No activity recorded yet.')}</div>
        ) : (
          <div className="divide-y divide-gray-50 max-h-[30rem] overflow-y-auto">
            {notifications.map((n) => {
              const d = new Date(n.created_at);
              return (
                <div key={n.id} onClick={() => markRead(n.id)}
                  className={`flex items-start gap-3 px-5 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${!n.read ? 'bg-brand-50/30' : ''}`}>
                  <span className="text-base mt-0.5 shrink-0">✏️</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${!n.read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                      <span className="text-brand-700">{n.teacher_name}</span>
                      {' '}{t('a saisi des notes', 'entered grades', 'introdujo notas')}
                      {n.class_name && <> — <span className="font-medium">{n.class_name}</span></>}
                      {n.subject_name && <span className="text-gray-500"> · {n.subject_name}</span>}
                      {n.sequence && <span className="text-gray-400 font-normal"> · {periodWord} {n.sequence}</span>}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {d.toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })} · {d.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}
                      <span className="text-gray-300"> · {timeAgo(n.created_at)}</span>
                    </p>
                  </div>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0 mt-1.5" />}
                </div>
              );
            })}
          </div>
        )}
        {/* Messages envoyés (traçabilité des relances) */}
        {messages.length > 0 && (
          <div className="border-t border-gray-100">
            <div className="px-5 py-2.5 bg-gray-50/60"><p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('Relances envoyées', 'Nudges sent', 'Avisos enviados')}</p></div>
            <div className="divide-y divide-gray-50 max-h-48 overflow-y-auto">
              {messages.slice(0, 20).map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <span className="shrink-0">📩</span>
                  <span className="flex-1 truncate text-gray-700">{m.subject || t('Message', 'Message')} {m.to_teacher_name && <span className="text-gray-400">→ {m.to_teacher_name}</span>}</span>
                  <span className="text-xs text-gray-400 shrink-0">{timeAgo(m.created_at)}</span>
                  {!m.read && <span className="text-[10px] font-bold bg-amber-200 text-amber-800 px-1 rounded">{t('Non lu', 'Unread')}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Helpers internes ───────────────────────────────────────────────────────
  function goTeachers(f) {
    setFilter(f);
    setActiveTab('teachers');
    try { localStorage.setItem('nc_monitor_tab', 'teachers'); } catch {}
  }

  function StatusTag({ r }) {
    if (r.assignedCount === 0) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-400">{t('Aucune classe', 'No class', 'Sin clase')}</span>;
    if (r.statuses.includes('completed')) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">{t('Terminé', 'Completed', 'Completo')}</span>;
    if (r.hasOverdue) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">{t('En retard', 'Overdue', 'Atrasado')}</span>;
    if (r.statuses.includes('inactive')) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">{t('Inactif', 'Inactive', 'Inactivo')}</span>;
    if (r.statuses.includes('nograde')) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-600">{t('Aucune note', 'No grades', 'Sin notas')}</span>;
    if (r.atRisk) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">{t('À risque', 'At risk', 'En riesgo')}</span>;
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-600">{t('En cours', 'In progress', 'En curso')}</span>;
  }
}
