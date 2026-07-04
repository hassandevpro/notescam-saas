import { NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useNotificationsStore } from '../../store/notificationsStore';
import { useUiStore } from '../../store/uiStore';
import { useT } from '../../lib/i18n';
import { usePlan } from '../../lib/plan';
import { getNavGroups } from '../../config/navigation';
import { ICONS, LockBadge } from './icons';
import LogoMark from '../LogoMark';

const COLLAPSE_KEY = 'nc_nav_collapsed';

function loadCollapsed() {
  try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY)) || {}; } catch { return {}; }
}

// ── Item ─────────────────────────────────────────────────────────────────────
function NavItem({ to, label, icon, end, badge, locked, unreadCount }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-150 ${
          isActive
            ? 'bg-brand-50 text-brand-700 font-semibold shadow-sm'
            : 'text-slate-500 font-medium hover:bg-slate-50 hover:text-slate-800'
        }`
      }
    >
      <span className="w-[18px] h-[18px] shrink-0">{ICONS[icon]}</span>
      <span className="flex-1 truncate">{label}</span>
      {locked && <LockBadge />}
      {badge && unreadCount > 0 && (
        <span className="min-w-[1.2rem] h-5 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1 leading-none">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </NavLink>
  );
}

// ── Groupe repliable ──────────────────────────────────────────────────────────
function NavGroup({ group, t, unreadCount, open, onToggle, forcedOpen }) {
  const isOpen = forcedOpen || open;

  // Groupe sans label (entrée racine « Tableau de bord ») : rendu à plat.
  if (!group.label) {
    return (
      <div className="space-y-0.5">
        {group.items.map((it) => (
          <NavItem key={it.to} {...it} label={t(...it.label)} unreadCount={unreadCount} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center gap-2 px-3 pt-4 pb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest select-none hover:text-slate-600 transition-colors"
      >
        <span className="flex-1 text-left">{t(...group.label)}</span>
        <span className={`w-3 h-3 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>
          {ICONS.chevron}
        </span>
      </button>
      {isOpen && group.items.map((it) => (
        <NavItem key={it.to} {...it} label={t(...it.label)} unreadCount={unreadCount} />
      ))}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
export default function Sidebar({ mobileOpen, onClose }) {
  const role     = useAuthStore((s) => s.role);
  const { pathname } = useLocation();
  const unreadCount  = useNotificationsStore((s) => s.unreadCount);
  const sidebarHidden  = useUiStore((s) => s.sidebarHidden);
  const toggleSidebar  = useUiStore((s) => s.toggleSidebar);
  const t = useT();
  const { f } = usePlan();

  const [collapsed, setCollapsed] = useState(loadCollapsed);

  // Ferme la sidebar mobile à chaque changement de route
  useEffect(() => { if (onClose) onClose(); /* eslint-disable-next-line */ }, [pathname]);

  const groups = getNavGroups(role, f);

  // Groupe contenant la route active → toujours déplié (l'utilisateur ne perd
  // jamais de vue où il se trouve).
  const activeGroupId = groups.find((g) =>
    g.items.some((it) => it.end ? pathname === it.to : pathname.startsWith(it.to))
  )?.id;

  const toggle = useCallback((id) => {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return (
    <aside className={`
      fixed top-0 left-0 w-60 h-screen z-40
      bg-white border-r border-slate-200/80
      flex flex-col
      transition-transform duration-200 ease-in-out
      ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      ${sidebarHidden ? 'md:-translate-x-full' : 'md:translate-x-0'}
    `}>
      {/* Logo */}
      <div className="px-4 py-4 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-3">
          <LogoMark size={36} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-800 truncate leading-tight">NotesCam</p>
            <p className="text-xs text-slate-400 truncate leading-none mt-0.5">
              {t('Gestion scolaire', 'School management', 'Gestión escolar')}
            </p>
          </div>
          {/* Replier la barre — desktop uniquement */}
          <button
            type="button"
            onClick={toggleSidebar}
            className="hidden md:flex shrink-0 p-1.5 -mr-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            title={t('Replier la barre latérale', 'Collapse sidebar', 'Ocultar barra lateral')}
            aria-label={t('Replier la barre latérale', 'Collapse sidebar', 'Ocultar barra lateral')}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2"/>
              <line x1="9" y1="4" x2="9" y2="20"/>
              <path d="M16 9l-3 3 3 3"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5">
        {groups.map((group) => (
          <NavGroup
            key={group.id}
            group={group}
            t={t}
            unreadCount={unreadCount}
            open={!collapsed[group.id]}
            forcedOpen={group.id === activeGroupId}
            onToggle={() => toggle(group.id)}
          />
        ))}
      </nav>
    </aside>
  );
}
