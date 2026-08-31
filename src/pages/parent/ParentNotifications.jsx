import { useEffect } from 'react';
import { useParentStore } from '../../store/parentStore';
import { useT } from '../../lib/i18n';
import { Card, Empty, fmtDate } from './parentUi';

// NOTIFICATIONS — §10.
//
// La liste vient de `parent_notifications`, qui ne rend que les lignes dont le
// destinataire EST le compte appelant (`recipient_id = auth.uid()`). Le filtrage
// par destinataire n'est donc jamais fait ici : une notification adressée à un
// autre parent n'arrive tout simplement pas.
export default function ParentNotifications() {
  const t = useT();
  const notifications = useParentStore((s) => s.notifications);
  const refresh = useParentStore((s) => s.refreshNotifications);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <Card title={t('Notifications', 'Notifications', 'Notificaciones')}>
      {notifications.length === 0 ? (
        <Empty>{t('Aucune notification.', 'No notification.', 'Sin notificaciones.')}</Empty>
      ) : (
        <ul className="divide-y divide-gray-50">
          {notifications.map((n) => (
            <li key={n.id} className="py-3 flex gap-3">
              <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read ? 'bg-gray-200' : 'bg-brand-500'}`} />
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${n.read ? 'text-gray-600' : 'font-semibold text-gray-900'}`}>{n.title}</p>
                {n.body && <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>}
                <p className="text-[11px] text-gray-300 mt-1">{fmtDate(n.created_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
