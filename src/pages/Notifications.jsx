// Notifications INTERNES (in-app). Le moteur multi-canaux (notificationEngine)
// prévoit email/SMS/WhatsApp mais seul le canal interne est implémenté ici.
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuthStore } from '../store/authStore';
import { useT } from '../lib/i18n';
import { fetchMyNotifications, markNotificationRead, markAllRead } from '../lib/notificationService';

export default function Notifications() {
  const t = useT();
  const navigate = useNavigate();
  const school = useAuthStore((s) => s.school);
  const role = useAuthStore((s) => s.role);
  const userId = useAuthStore((s) => s.user?.id);
  const schoolId = school?.id;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    setItems(await fetchMyNotifications(schoolId, userId, role));
    setLoading(false);
  }, [schoolId, userId, role]);
  useEffect(() => { load(); }, [load]);

  const unread = items.filter((n) => !n.read);

  const open = async (n) => {
    if (!n.read) { await markNotificationRead(n.id); setItems((xs) => xs.map((x) => x.id === n.id ? { ...x, read: true } : x)); }
    if (n.link) navigate(n.link);
  };
  const readAll = async () => {
    await markAllRead(schoolId, unread.map((n) => n.id));
    setItems((xs) => xs.map((x) => ({ ...x, read: true })));
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{t('Notifications', 'Notifications', 'Notificaciones')}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {unread.length > 0 ? `${unread.length} ${t('non lue(s)', 'unread', 'sin leer')}` : t('Tout est lu', 'All read', 'Todo leído')}
            </p>
          </div>
          {unread.length > 0 && (
            <button onClick={readAll} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">
              {t('Tout marquer comme lu', 'Mark all read', 'Marcar todo leído')}
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-gray-400 text-sm py-16 text-center animate-pulse">{t('Chargement…', 'Loading…', 'Cargando…')}</div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center text-sm text-gray-500">
            {t('Aucune notification.', 'No notification.', 'Sin notificaciones.')}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((n) => (
              <button key={n.id} onClick={() => open(n)}
                className={`w-full text-left p-4 rounded-xl border transition-colors flex gap-3 ${
                  n.read ? 'border-gray-200 bg-white' : 'border-indigo-200 bg-indigo-50/50'}`}>
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read ? 'bg-gray-300' : 'bg-indigo-500'}`} />
                <span className="flex-1 min-w-0">
                  <span className="font-semibold text-sm text-gray-900 block">{n.title}</span>
                  {n.body && <span className="text-sm text-gray-600 block mt-0.5">{n.body}</span>}
                  <span className="text-[11px] text-gray-400 block mt-1">{String(n.created_at || '').slice(0, 16).replace('T', ' ')}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
