import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationsStore } from '../store/notificationsStore';
import { useMessagesStore } from '../store/messagesStore';
import { useAppNotificationsStore } from '../store/appNotificationsStore';
import { useAuthStore } from '../store/authStore';
import { useT, tStatic } from '../lib/i18n';

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return tStatic("À l'instant", 'Just now', 'Ahora mismo');
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs} h`;
  return `${Math.floor(hrs / 24)} ${tStatic('j', 'd', 'd')}`;
}

// ── Vue ADMIN : activité notes des profs ──────────────────────────────────────
function AdminDropdown({ onClose }) {
  const t = useT();
  const navigate = useNavigate();
  const school        = useAuthStore((s) => s.school);
  const notifications = useNotificationsStore((s) => s.notifications);
  const unreadCount   = useNotificationsStore((s) => s.unreadCount);
  const markRead      = useNotificationsStore((s) => s.markRead);
  const markAllRead   = useNotificationsStore((s) => s.markAllRead);

  const handleClick = async (notif) => {
    await markRead(notif.id);
    onClose();
    navigate('/app/monitor');
  };

  return (
    <>
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <p className="text-sm font-bold text-slate-800">
          {t('Activité enseignants', 'Teacher activity', 'Actividad de profesores')}
          {unreadCount > 0 && (
            <span className="ml-2 text-xs font-semibold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded-full">
              {unreadCount} {t('nouveau', 'new', 'nuevo')}{unreadCount > 1 ? 'x' : ''}
            </span>
          )}
        </p>
        {unreadCount > 0 && (
          <button onClick={() => school?.id && markAllRead(school.id)}
            className="text-xs text-slate-400 hover:text-brand-600 transition-colors">
            {t('Tout lire', 'Mark all read', 'Marcar todo leído')}
          </button>
        )}
      </div>

      <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
        {notifications.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-slate-400">{t('Aucune activité', 'No activity', 'Sin actividad')}</div>
        )}
        {notifications.map((notif) => (
          <button key={notif.id} onClick={() => handleClick(notif)}
            className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex gap-3 items-start ${!notif.read ? 'bg-brand-50/40' : ''}`}>
            <span className="text-base mt-0.5 shrink-0">✏️</span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm leading-snug ${!notif.read ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                <span className="text-brand-700">{notif.teacher_name}</span>
                {` — ${t('notes', 'grades', 'notas')} `}
                <span className="font-semibold">{notif.class_name}</span>
                {notif.sequence && <span className="text-slate-400 font-normal"> · {t('Séq', 'Seq', 'Sec')} {notif.sequence}</span>}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">{timeAgo(notif.created_at)}</p>
            </div>
            {!notif.read && <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0 mt-1.5" />}
          </button>
        ))}
      </div>

      <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/50">
        <button onClick={() => { onClose(); navigate('/app/monitor'); }}
          className="text-xs text-brand-600 hover:text-brand-700 font-semibold transition-colors">
          {t('Tableau de surveillance', 'Monitoring board', 'Panel de seguimiento')} →
        </button>
      </div>
    </>
  );
}

// ── Vue ENSEIGNANT : messages reçus de l'admin ────────────────────────────────
function TeacherDropdown({ onClose }) {
  const t = useT();
  const messages   = useMessagesStore((s) => s.messages);
  const unreadCount = useMessagesStore((s) => s.unreadCount);
  const markRead   = useMessagesStore((s) => s.markRead);
  const markAllRead = useMessagesStore((s) => s.markAllRead);

  const [expanded, setExpanded] = useState(null);

  const handleClick = async (msg) => {
    await markRead(msg.id);
    setExpanded((prev) => (prev === msg.id ? null : msg.id));
  };

  return (
    <>
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <p className="text-sm font-bold text-slate-800">
          {t('Messages', 'Messages', 'Mensajes')}
          {unreadCount > 0 && (
            <span className="ml-2 text-xs font-semibold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded-full">
              {unreadCount} {t('nouveau', 'new', 'nuevo')}{unreadCount > 1 ? 'x' : ''}
            </span>
          )}
        </p>
        {unreadCount > 0 && (
          <button onClick={markAllRead}
            className="text-xs text-slate-400 hover:text-brand-600 transition-colors">
            {t('Tout lire', 'Mark all read', 'Marcar todo leído')}
          </button>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
        {messages.length === 0 && (
          <div className="px-4 py-8 text-center">
            <div className="text-2xl mb-2">📩</div>
            <p className="text-sm text-slate-400">{t("Aucun message de l'administration", 'No messages from administration', 'Sin mensajes de la administración')}</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id}
            className={`cursor-pointer hover:bg-slate-50 transition-colors ${!msg.read ? 'bg-brand-50/30' : ''}`}
            onClick={() => handleClick(msg)}>
            <div className="px-4 py-3 flex gap-3 items-start">
              <span className="text-base mt-0.5 shrink-0">📩</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={`text-sm truncate ${!msg.read ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                    {msg.subject || 'Message de l\'administration'}
                  </p>
                  <span className="text-xs text-slate-400 shrink-0">{timeAgo(msg.created_at)}</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 truncate">{msg.sender_name}</p>
              </div>
              {!msg.read && <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0 mt-1.5" />}
            </div>

            {/* Corps du message déplié */}
            {expanded === msg.id && (
              <div className="px-4 pb-4 ml-9">
                <div className="bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap shadow-sm">
                  {msg.body}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ── Vue COMMUNE : notifications génériques (finance, RH, discipline…) ─────────
// Troisième source de la cloche, alimentée par notificationProducers.js. Visible
// par TOUS les rôles — contrairement aux deux vues ci-dessus qui sont réservées
// à l'admin et à l'enseignant.
function AppNotificationsSection({ onClose }) {
  const t = useT();
  const navigate = useNavigate();
  const items       = useAppNotificationsStore((s) => s.items);
  const unreadCount = useAppNotificationsStore((s) => s.unreadCount);
  const markRead    = useAppNotificationsStore((s) => s.markRead);
  const markAllRead = useAppNotificationsStore((s) => s.markAllRead);

  const handleClick = async (n) => {
    await markRead(n.id);
    onClose();
    if (n.link) navigate(n.link);
  };

  if (!items.length) return null;          // rien à dire = pas de section vide

  return (
    <>
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <p className="text-sm font-bold text-slate-800">
          {t('Alertes', 'Alerts', 'Alertas')}
          {unreadCount > 0 && (
            <span className="ml-2 text-xs font-semibold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded-full">
              {unreadCount} {t('nouveau', 'new', 'nuevo')}{unreadCount > 1 ? 'x' : ''}
            </span>
          )}
        </p>
        {unreadCount > 0 && (
          <button onClick={markAllRead}
            className="text-xs text-slate-400 hover:text-brand-600 transition-colors">
            {t('Tout lire', 'Mark all read', 'Marcar todo leído')}
          </button>
        )}
      </div>

      <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
        {items.slice(0, 20).map((n) => (
          <button key={n.id} onClick={() => handleClick(n)}
            className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex gap-3 items-start ${!n.read ? 'bg-brand-50/40' : ''}`}>
            <span className="text-base mt-0.5 shrink-0">🔔</span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm leading-snug ${!n.read ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                {n.title}
              </p>
              {n.body && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>}
              <p className="text-xs text-slate-400 mt-0.5">{timeAgo(n.created_at)}</p>
            </div>
            {!n.read && <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0 mt-1.5" />}
          </button>
        ))}
      </div>

      <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/50">
        <button onClick={() => { onClose(); navigate('/app/notifications'); }}
          className="text-xs text-brand-600 hover:text-brand-700 font-semibold transition-colors">
          {t('Toutes les notifications', 'All notifications', 'Todas las notificaciones')} →
        </button>
      </div>
    </>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function NotificationBell() {
  const role        = useAuthStore((s) => s.role);
  const adminUnread = useNotificationsStore((s) => s.unreadCount);
  const teacherUnread = useMessagesStore((s) => s.unreadCount);
  const appUnread   = useAppNotificationsStore((s) => s.unreadCount);
  const appItems    = useAppNotificationsStore((s) => s.items);

  // Compteur UNIFIÉ : la pastille annonce tout ce que la cloche contient.
  const roleUnread = role === 'admin' ? adminUnread : (role === 'teacher' ? teacherUnread : 0);
  const unreadCount = roleUnread + appUnread;

  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  // La cloche s'affiche dès qu'elle a quelque chose à montrer. Les rôles autres
  // qu'admin/enseignant (caissier, censeur, surveillant…) n'ont pas de vue
  // dédiée mais reçoivent bien des notifications génériques.
  const hasRoleView = role === 'admin' || role === 'teacher';
  if (!hasRoleView && !appItems.length) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[1.1rem] h-[1.1rem] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-0.5 leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden max-h-[80vh] overflow-y-auto">
          {/* Alertes d'abord : elles demandent une action (valider, décaisser…). */}
          <AppNotificationsSection onClose={() => setOpen(false)} />
          {role === 'admin' && <AdminDropdown onClose={() => setOpen(false)} />}
          {role === 'teacher' && <TeacherDropdown onClose={() => setOpen(false)} />}
        </div>
      )}
    </div>
  );
}
