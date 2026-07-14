import { NavLink } from 'react-router-dom';
import { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useNotificationsStore } from '../../store/notificationsStore';
import { useT } from '../../lib/i18n';
import { usePlan } from '../../lib/plan';
import { getMobilePrimary } from '../../config/navigation';
import { ICONS } from './icons';
import MoreSheet from './MoreSheet';

// Bottom-nav mobile : destinations primaires (config `mobilePrimary`) à portée
// de pouce + bouton « Plus » ouvrant l'arborescence complète. Remplace, sur
// mobile, le tiroir de 18 liens. Caché ≥ md (la sidebar prend le relais).
export default function MobileNav({ onLogout }) {
  const role = useAuthStore((s) => s.role);
  const permissions = useAuthStore((s) => s.permissions);
  const governanceCatalog = useAuthStore((s) => s.governanceCatalog);
  const governanceAssignments = useAuthStore((s) => s.governanceAssignments);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const t = useT();
  const { f } = usePlan();
  const [sheetOpen, setSheetOpen] = useState(false);

  const primary = getMobilePrimary(role, f, 4, permissions, { catalog: governanceCatalog, assignments: governanceAssignments });

  const cell = 'flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] font-medium transition-colors';

  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white border-t border-slate-200 flex items-stretch px-1 pb-[env(safe-area-inset-bottom)]">
        {primary.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) => `${cell} ${isActive ? 'text-brand-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <span className="relative w-6 h-6">
              {ICONS[it.icon]}
              {it.badge && unreadCount > 0 && (
                <span className="absolute -top-1 -right-1.5 min-w-[14px] h-[14px] flex items-center justify-center bg-red-500 text-white text-[8px] font-bold rounded-full px-0.5 leading-none">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </span>
            <span className="truncate max-w-full">{t(...it.label)}</span>
          </NavLink>
        ))}
        <button onClick={() => setSheetOpen(true)} className={`${cell} text-slate-400 hover:text-slate-600`}>
          <span className="w-6 h-6">{ICONS.more}</span>
          <span>{t('Plus', 'More', 'Más')}</span>
        </button>
      </nav>

      <MoreSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onLogout={onLogout} />
    </>
  );
}
