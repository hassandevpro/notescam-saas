import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useNotificationsStore } from '../../store/notificationsStore';
import { useUiStore } from '../../store/uiStore';
import { useT } from '../../lib/i18n';
import { usePlan } from '../../lib/plan';
import { getNavGroups } from '../../config/navigation';
import { ICONS, LockBadge } from './icons';
import UserAvatar from '../UserAvatar';
import { roleLabel } from '../../lib/roleLabel';

// Bottom-sheet mobile : arborescence COMPLÈTE (même source que la sidebar).
// Ouverte par le bouton « Plus » de la MobileNav.
export default function MoreSheet({ open, onClose, onLogout }) {
  const role = useAuthStore((s) => s.role);
  const fullName = useAuthStore((s) => s.fullName);
  const photoUrl = useAuthStore((s) => s.photoUrl);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const uiLang     = useUiStore((s) => s.uiLang);
  const toggleLang = useUiStore((s) => s.toggleLang);
  const t = useT();
  const { f } = usePlan();

  if (!open) return null;
  const groups = getNavGroups(role, f);

  return (
    <div className="fixed inset-0 z-[70] md:hidden" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] bg-white rounded-t-2xl shadow-2xl flex flex-col animate-slide-up">
        <div className="flex items-center justify-between px-5 pt-3 pb-2 border-b border-slate-100 shrink-0">
          <div className="absolute left-1/2 -translate-x-1/2 top-2 w-10 h-1 rounded-full bg-slate-200" />
          <p className="text-sm font-bold text-slate-800 mt-1">{t('Menu', 'Menu', 'Menú')}</p>
          <button onClick={onClose} className="p-1.5 -mr-1.5 text-slate-400 hover:text-slate-700" aria-label="Fermer">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {/* Carte « Mon profil » */}
          <NavLink
            to="/app/profile"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 mb-1 rounded-xl bg-slate-50 border border-slate-100 hover:bg-brand-50 transition-colors"
          >
            <UserAvatar name={fullName} photoUrl={photoUrl} size={36} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800 truncate leading-tight">{fullName || '—'}</p>
              <p className="text-xs text-slate-400 leading-tight mt-0.5">{roleLabel(role, t)}</p>
            </div>
            <span className="w-4 h-4 shrink-0 text-slate-300">{ICONS.chevron}</span>
          </NavLink>

          {groups.map((group) => (
            <div key={group.id} className="mb-1">
              {group.label && (
                <p className="px-3 pt-3 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {t(...group.label)}
                </p>
              )}
              {group.items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={it.end}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm ${
                      isActive ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-slate-600 font-medium hover:bg-slate-50'
                    }`
                  }
                >
                  <span className="w-[20px] h-[20px] shrink-0">{ICONS[it.icon]}</span>
                  <span className="flex-1 truncate">{t(...it.label)}</span>
                  {it.locked && <LockBadge />}
                  {it.badge && unreadCount > 0 && (
                    <span className="min-w-[1.2rem] h-5 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1 leading-none">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </div>

        <div className="shrink-0 border-t border-slate-100 px-3 py-2.5 flex items-center gap-2">
          <button onClick={toggleLang} className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50 rounded-xl font-medium">
            🌐 <span className="font-bold text-brand-600 uppercase">{uiLang}</span>
          </button>
          <button onClick={() => { onClose(); onLogout(); }} className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-xl font-medium">
            <span className="w-[18px] h-[18px]">{ICONS.logout}</span>
            {t('Déconnexion', 'Logout', 'Salir')}
          </button>
        </div>
      </div>
    </div>
  );
}
