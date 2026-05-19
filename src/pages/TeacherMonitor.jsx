import { useState, useMemo, useEffect } from 'react';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { useNotificationsStore } from '../store/notificationsStore';
import { useMessagesStore } from '../store/messagesStore';
import { buildWhatsAppUrl } from '../lib/messagesService';
import { fetchSequenceDates } from '../lib/sequenceDatesService';
import Layout from '../components/Layout';
import { useT, getLang } from '../lib/i18n';

const SEQUENCES_FR = [1, 2, 3, 4, 5, 6];
const SEQUENCES_EN = [1, 2, 3]; // Term 1/2/3

function timeAgo(dateStr) {
  if (!dateStr) return null;
  const isEN = getLang() === 'en';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return isEN ? "Just now" : "À l'instant";
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `${days} ${isEN ? `day${days > 1 ? 's' : ''}` : `jour${days > 1 ? 's' : ''}`}`;
}

function StatusBadge({ rate }) {
  const t = useT();
  if (rate === null) return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-400">{t('Aucun élève', 'No students')}</span>
  );
  if (rate === 100) return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">{t('Complet', 'Complete')}</span>
  );
  if (rate > 0) return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">{t('En cours', 'In progress')} {rate}%</span>
  );
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-600">{t('Aucune note', 'No grades')}</span>
  );
}

function ProgressBar({ rate }) {
  if (rate === null) return null;
  const color = rate === 100 ? 'bg-emerald-500' : rate > 0 ? 'bg-amber-400' : 'bg-red-300';
  return (
    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full ${color} transition-all`} style={{ width: `${rate}%` }} />
    </div>
  );
}

function DeadlineBadge({ seqConfig, rate }) {
  const t = useT();
  if (!seqConfig?.deadline_date || rate === 100 || rate === null) return null;
  const deadline = new Date(seqConfig.deadline_date);
  const today    = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil((deadline - today) / 86400000);
  if (daysLeft < 0) return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 whitespace-nowrap">
      {t('En retard', 'Overdue')}
    </span>
  );
  if (daysLeft <= 3) return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 whitespace-nowrap">
      {t('À risque', 'At risk')} · J{daysLeft > 0 ? `-${daysLeft}` : ''}
    </span>
  );
  return null;
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
    const text = subject.trim()
      ? `[${subject.trim()}]\n\n${body.trim()}`
      : body.trim();
    window.open(buildWhatsAppUrl(teacher.phone, text), '_blank', 'noopener');
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {sent ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">✅</div>
            <p className="font-semibold text-gray-800 mb-1">{t('Message envoyé', 'Message sent')}</p>
            <p className="text-sm text-gray-500 mb-5">
              <strong>{teacher.name}</strong> {t('recevra une notification dès sa prochaine connexion.', 'will receive a notification on their next login.')}
            </p>
            <button onClick={onClose} className="btn-primary" style={{ width: 'auto', paddingInline: '2rem' }}>
              {t('Fermer', 'Close')}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold shrink-0">
                {teacher.name?.[0]?.toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-gray-900 text-sm">{t('Message à', 'Message to')} {teacher.name}</p>
                {teacher.phone && (
                  <p className="text-xs text-gray-400">📱 {teacher.phone}</p>
                )}
              </div>
              <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="form-label">{t('Objet (optionnel)', 'Subject (optional)')}</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={t('Ex : Rappel saisie notes Séquence 3', 'E.g. Reminder: enter grades Sequence 3')}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">{t('Message *', 'Message *')}</label>
                <textarea
                  rows={5}
                  className="form-input resize-none"
                  placeholder={t(
                    'Bonjour, je souhaitais vous rappeler que les notes de la Séquence 3 ne sont pas encore saisies pour la classe de…',
                    'Hello, I wanted to remind you that grades for Sequence 3 have not yet been entered for the class of…',
                  )}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-5">
              <button
                onClick={handleSend}
                disabled={sending || !body.trim()}
                className="btn-primary"
                style={{ width: 'auto', paddingInline: '1.5rem' }}
              >
                {sending ? t('Envoi…', 'Sending…') : `📩 ${t("Envoyer dans l'app", 'Send in app')}`}
              </button>
              <button
                onClick={handleWhatsApp}
                disabled={!body.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-[#25D366] hover:bg-[#1ebe57] disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </button>
              <button onClick={onClose} className="btn-secondary" style={{ width: 'auto' }}>
                {t('Annuler', 'Cancel')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Carte statistique
function StatCard({ value, label, sub, color = 'border-brand-400' }) {
  return (
    <div className={`bg-white rounded-xl border-l-4 ${color} p-5 shadow-sm`}>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm font-semibold text-gray-700 mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function TeacherMonitor() {
  const t = useT();
  const { school, fullName } = useAuthStore();
  const schoolLanguage = school?.language || 'francophone';
  const isENSchool     = schoolLanguage === 'anglophone';
  const SEQUENCES      = isENSchool ? SEQUENCES_EN : SEQUENCES_FR;
  const classes    = useSchoolStore((s) => s.classes);
  const subjects   = useSchoolStore((s) => s.subjects);
  const students   = useSchoolStore((s) => s.students);
  const teachers   = useSchoolStore((s) => s.teachers);
  const gradeMap   = useSchoolStore((s) => s.gradeMap);

  const notifications  = useNotificationsStore((s) => s.notifications);
  const markRead       = useNotificationsStore((s) => s.markRead);

  const messages       = useMessagesStore((s) => s.messages);

  const [selectedSeq,  setSelectedSeq]  = useState(1);
  const [composeFor,   setComposeFor]   = useState(null); // teacher object
  const [seqDatesMap,  setSeqDatesMap]  = useState({}); // seq_key → row

  useEffect(() => {
    if (!school?.id) return;
    fetchSequenceDates(school.id).then((rows) => {
      const map = {};
      rows.forEach((r) => { map[r.seq_key] = r; });
      setSeqDatesMap(map);
    });
  }, [school?.id]);

  // Current sequence date config
  const currentSeqKey    = `fr_seq_${selectedSeq}`;
  const currentSeqConfig = seqDatesMap[currentSeqKey] ?? null;

  // ── Classes assignées par enseignant ──────────────────────────────────────
  const teacherClassIds = useMemo(() => {
    const map = {};
    teachers.forEach((tc) => { map[tc.id] = new Set(); });
    subjects.forEach((s) => {
      if (s.teacher_id && map[s.teacher_id]) map[s.teacher_id].add(s.class_id);
    });
    classes.forEach((c) => {
      if (c.teacher_id && map[c.teacher_id]) map[c.teacher_id].add(c.id);
    });
    return map;
  }, [teachers, subjects, classes]);

  // ── Taux de complétion par classe pour la séquence sélectionnée ───────────
  const classCompletion = useMemo(() => {
    const map = {};
    classes.forEach((cls) => {
      const studs = students.filter((s) => s.class_id === cls.id);
      const total = studs.length;
      if (!total) { map[cls.id] = { total: 0, filled: 0, rate: null }; return; }
      const filled = studs.filter((s) => {
        const entry = gradeMap[`${cls.id}_${s.id}_${selectedSeq}`];
        return entry && Object.keys(entry).some((k) => !k.startsWith('__') && entry[k] !== '');
      }).length;
      map[cls.id] = { total, filled, rate: Math.round((filled / total) * 100) };
    });
    return map;
  }, [classes, students, gradeMap, selectedSeq]);

  // ── Dernière activité par enseignant (via notifications) ──────────────────
  const teacherLastActivity = useMemo(() => {
    const map = {};
    notifications.forEach((n) => {
      if (!n.teacher_id) return;
      if (!map[n.teacher_id] || new Date(n.created_at) > new Date(map[n.teacher_id])) {
        map[n.teacher_id] = n.created_at;
      }
    });
    return map;
  }, [notifications]);

  // ── Stats globales ────────────────────────────────────────────────────────
  const globalStats = useMemo(() => {
    const teachersWithClasses = teachers.filter((tc) => (teacherClassIds[tc.id]?.size ?? 0) > 0);
    const allRates = classes
      .map((c) => classCompletion[c.id]?.rate)
      .filter((r) => r !== null);
    const avgRate = allRates.length
      ? Math.round(allRates.reduce((a, b) => a + b, 0) / allRates.length)
      : null;
    const complete  = classes.filter((c) => classCompletion[c.id]?.rate === 100).length;
    const missing   = classes.filter((c) => (classCompletion[c.id]?.rate ?? -1) === 0 && (classCompletion[c.id]?.total ?? 0) > 0).length;
    const activeTeachers = teachersWithClasses.filter((tc) => {
      return [...(teacherClassIds[tc.id] || [])].some((cId) => (classCompletion[cId]?.rate ?? 0) > 0);
    }).length;
    return { total: teachers.length, active: activeTeachers, complete, missing, avgRate };
  }, [teachers, classes, teacherClassIds, classCompletion]);

  // ── Classes sans enseignant ───────────────────────────────────────────────
  const unassignedClasses = useMemo(() => {
    const assignedIds = new Set(Object.values(teacherClassIds).flatMap((s) => [...s]));
    return classes.filter((c) => !assignedIds.has(c.id));
  }, [classes, teacherClassIds]);

  const dateLocale = getLang() === 'en' ? 'en-GB' : 'fr-FR';

  return (
    <Layout>
      <div className="max-w-6xl space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('Surveillance enseignants', 'Teacher monitoring')}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {t('Suivi des saisies de notes', 'Grade entry tracking')} — {school?.current_year}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 font-medium">{isENSchool ? 'Term :' : `${t('Séquence', 'Sequence')} :`}</label>
              <div className="flex gap-1">
                {SEQUENCES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSelectedSeq(s)}
                    className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${
                      selectedSeq === s
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-300'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            {currentSeqConfig?.deadline_date && (
              <p className="text-xs text-gray-400">
                {t('Limite saisie', 'Deadline')} :&nbsp;
                <span className="font-semibold text-gray-600">
                  {new Date(currentSeqConfig.deadline_date).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })}
                </span>
                {currentSeqConfig.exam_date && (
                  <> · {t('Examen', 'Exam')} : <span className="font-semibold text-gray-600">
                    {new Date(currentSeqConfig.exam_date).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })}
                  </span></>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            value={globalStats.total}
            label={t('Enseignants', 'Teachers')}
            sub={`${globalStats.active} ${globalStats.active > 1 ? t('actifs', 'active') : t('actif', 'active')} ${isENSchool ? `term ${selectedSeq}` : `${t('séquence', 'sequence')} ${selectedSeq}`}`}
            color="border-brand-400"
          />
          <StatCard
            value={`${globalStats.avgRate ?? '—'}${globalStats.avgRate !== null ? '%' : ''}`}
            label={t('Complétion globale', 'Overall completion')}
            sub={isENSchool ? `Term ${selectedSeq}` : `${t('Séquence', 'Sequence')} ${selectedSeq}`}
            color="border-blue-400"
          />
          <StatCard
            value={globalStats.complete}
            label={t('Classes complètes', 'Complete classes')}
            sub={`/ ${classes.length} ${t('classes', 'classes')}`}
            color="border-emerald-400"
          />
          <StatCard
            value={globalStats.missing}
            label={t('Classes sans notes', 'Classes with no grades')}
            sub={isENSchool ? t('No entries this term', 'No entries this term') : t('Aucune saisie pour cette séq.', 'No entries for this sequence')}
            color="border-red-400"
          />
        </div>

        {/* Tableau enseignants */}
        {teachers.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
            <div className="text-4xl mb-3">👨‍🏫</div>
            <p className="text-gray-500 text-sm">{t('Aucun enseignant configuré.', 'No teachers configured.')}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">
                {t('Activité par enseignant', 'Activity by teacher')} — {isENSchool ? `Term ${selectedSeq}` : `${t('Séquence', 'Sequence')} ${selectedSeq}`}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {t('Cliquez sur un enseignant pour voir le détail de ses notifications.', 'Click on a teacher to view their notification details.')}
              </p>
            </div>

            <div className="divide-y divide-gray-50">
              {teachers.map((teacher) => {
                const assignedIds   = [...(teacherClassIds[teacher.id] || [])];
                const assignedCls   = classes.filter((c) => assignedIds.includes(c.id));
                const lastActivity  = teacherLastActivity[teacher.id] ?? null;
                const recentNotifs   = notifications
                  .filter((n) => n.teacher_id === teacher.id)
                  .slice(0, 3);
                const sentMessages  = messages
                  .filter((m) => m.to_teacher_id === teacher.id)
                  .slice(0, 3);

                // Complétion globale pour cet enseignant (séq sélectionnée)
                const rates  = assignedCls
                  .map((c) => classCompletion[c.id]?.rate)
                  .filter((r) => r !== null);
                const avgRate = rates.length
                  ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length)
                  : null;

                return (
                  <div key={teacher.id} className="px-6 py-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      {/* Info prof */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm shrink-0">
                          {teacher.name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-900 text-sm">{teacher.name}</p>
                            {teacher.auth_user_id ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">
                                {t('Compte actif', 'Active account')}
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-400">
                                {t('Sans compte', 'No account')}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {assignedCls.length > 0
                              ? assignedCls.map((c) => c.name).join(' · ')
                              : t('Aucune classe assignée', 'No class assigned')}
                          </p>
                        </div>
                      </div>

                      {/* Bouton message */}
                      <button
                        onClick={() => setComposeFor(teacher)}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors border border-brand-100"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                        </svg>
                        {t('Message', 'Message')}
                      </button>

                      {/* Stats + dernière activité */}
                      <div className="flex items-center gap-6 shrink-0">
                        {lastActivity && (
                          <div className="text-right">
                            <p className="text-xs font-semibold text-gray-500">{t('Dernière activité', 'Last activity')}</p>
                            <p className="text-xs text-gray-400">{timeAgo(lastActivity)}</p>
                          </div>
                        )}
                        <div className="text-right">
                          <p className="text-xs font-semibold text-gray-500">{isENSchool ? `Completion Term ${selectedSeq}` : `${t('Complétion', 'Completion')} ${t('Séq', 'Seq')} ${selectedSeq}`}</p>
                          <p className={`text-sm font-bold ${
                            avgRate === 100 ? 'text-emerald-600' :
                            avgRate !== null && avgRate > 0 ? 'text-amber-600' : 'text-red-500'
                          }`}>
                            {avgRate !== null ? `${avgRate}%` : '—'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Barres de progression par classe */}
                    {assignedCls.length > 0 && (
                      <div className="mt-4 grid gap-2">
                        {assignedCls.map((cls) => {
                          const comp = classCompletion[cls.id];
                          return (
                            <div key={cls.id} className="flex items-center gap-3">
                              <span className="text-xs font-medium text-gray-600 w-32 shrink-0 truncate">{cls.name}</span>
                              <div className="flex-1">
                                <ProgressBar rate={comp?.rate ?? null} />
                              </div>
                              <DeadlineBadge seqConfig={currentSeqConfig} rate={comp?.rate ?? null} />
                              <div className="w-28 shrink-0 text-right">
                                <StatusBadge rate={comp?.rate ?? null} />
                              </div>
                              <span className="text-xs text-gray-400 w-16 text-right shrink-0">
                                {comp?.rate !== null ? `${comp.filled}/${comp.total} ${t('élèves', 'students')}` : ''}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Activité notes récente */}
                    {recentNotifs.length > 0 && (
                      <div className="mt-3 space-y-1">
                        {recentNotifs.map((notif) => (
                          <div
                            key={notif.id}
                            onClick={() => markRead(notif.id)}
                            className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                              notif.read ? 'bg-gray-50 text-gray-400' : 'bg-brand-50 text-brand-700 font-medium'
                            }`}
                          >
                            <span>✏️</span>
                            <span>{t('Notes', 'Grades')} — <strong>{notif.class_name}</strong>{notif.sequence && ` · ${isENSchool ? 'Term' : t('Séq', 'Seq')} ${notif.sequence}`}</span>
                            <span className="ml-auto text-gray-400 font-normal">{timeAgo(notif.created_at)}</span>
                            {!notif.read && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Messages envoyés à ce prof */}
                    {sentMessages.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {sentMessages.map((msg) => (
                          <div key={msg.id}
                            className={`flex items-start gap-2 text-xs px-3 py-1.5 rounded-lg ${
                              msg.read ? 'bg-gray-50 text-gray-400' : 'bg-amber-50 text-amber-700 font-medium'
                            }`}
                          >
                            <span className="shrink-0">📩</span>
                            <span className="flex-1 truncate">
                              {msg.subject || t('Message envoyé', 'Message sent')}
                              {!msg.read && <span className="ml-1 text-[10px] font-bold bg-amber-200 text-amber-800 px-1 rounded">{t('Non lu', 'Unread')}</span>}
                            </span>
                            <span className="ml-auto text-gray-400 font-normal shrink-0">{timeAgo(msg.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Classes non assignées */}
        {unassignedClasses.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
            <div className="px-6 py-3 border-b border-amber-100">
              <h2 className="font-semibold text-amber-800 text-sm">
                {unassignedClasses.length} {unassignedClasses.length > 1 ? t('classes sans enseignant assigné', 'classes without an assigned teacher') : t('classe sans enseignant assigné', 'class without an assigned teacher')}
              </h2>
              <p className="text-xs text-amber-600 mt-0.5">
                {t("Assignez un enseignant dans Matières ou Enseignants pour suivre leur activité.", 'Assign a teacher in Subjects or Teachers to track their activity.')}
              </p>
            </div>
            <div className="px-6 py-3 flex flex-wrap gap-2">
              {unassignedClasses.map((cls) => {
                const comp = classCompletion[cls.id];
                return (
                  <div key={cls.id} className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-1.5 text-sm">
                    <span className="font-medium text-gray-700">{cls.name}</span>
                    <StatusBadge rate={comp?.rate ?? null} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Modal de composition */}
        {composeFor && (
          <ComposeModal
            teacher={composeFor}
            schoolId={school?.id}
            senderName={fullName || t('Administrateur', 'Administrator')}
            onClose={() => setComposeFor(null)}
          />
        )}

        {/* Historique complet des notifications */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-800">{t("Journal d'activité", 'Activity log')}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{t('Toutes les saisies enregistrées par les enseignants.', 'All entries recorded by teachers.')}</p>
            </div>
            {notifications.some((n) => !n.read) && (
              <button
                onClick={() => school?.id && useNotificationsStore.getState().markAllRead(school.id)}
                className="text-xs text-brand-600 hover:text-brand-700 font-semibold"
              >
                {t('Tout marquer comme lu', 'Mark all as read')}
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-400">
              {t("Aucune activité enregistrée pour l'instant.", 'No activity recorded yet.')}
            </div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => markRead(notif.id)}
                  className={`flex items-start gap-3 px-6 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                    !notif.read ? 'bg-brand-50/30' : ''
                  }`}
                >
                  <span className="text-base mt-0.5 shrink-0">✏️</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${!notif.read ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                      <span className="text-brand-700">{notif.teacher_name}</span>
                      {' — '}
                      <span>{notif.class_name}</span>
                      {notif.sequence && (
                        <span className="text-gray-400 font-normal"> · {isENSchool ? 'Term' : t('Séquence', 'Sequence')} {notif.sequence}</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{timeAgo(notif.created_at)}</p>
                  </div>
                  {!notif.read && <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0 mt-1.5" />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
