import { NavLink, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useNotificationsStore } from '../store/notificationsStore';
import { useUiStore } from '../store/uiStore';
import { useT } from '../lib/i18n';
import { usePlan } from '../lib/plan';
import LogoMark from './LogoMark';

// ── SVG Icons ────────────────────────────────────────────────────────────────
const ICONS = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  classes: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11M8 14v3M16 14v3M12 14v3"/>
    </svg>
  ),
  subjects: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
    </svg>
  ),
  students: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
    </svg>
  ),
  grades: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  bulletins: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  reports: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
      <line x1="3" y1="20" x2="21" y2="20"/>
    </svg>
  ),
  monitor: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  absences: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
    </svg>
  ),
  fees: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  ),
  teachers: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
    </svg>
  ),
  year: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  ),
  history: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 3 3 9 9 9"/><polyline points="12 7 12 12 15 14"/>
    </svg>
  ),
  conseil: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 11l-4 4-2-2"/>
    </svg>
  ),
  timetable: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
      <line x1="8" y1="14" x2="8" y2="18"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="16" y1="14" x2="16" y2="18"/>
    </svg>
  ),
  help: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
      <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
};

const LockBadge = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 shrink-0 text-amber-400">
    <path fillRule="evenodd" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7A1.5 1.5 0 0 0 3 8.5v5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11 7V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z" clipRule="evenodd" />
  </svg>
);

// ── Nav item ─────────────────────────────────────────────────────────────────
function NavItem({ to, label, icon, end, badge, unreadCount, locked }) {
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

// ── Nav group ────────────────────────────────────────────────────────────────
function NavGroup({ label, links, unreadCount }) {
  return (
    <div className="space-y-0.5">
      {label && (
        <p className="px-3 pt-4 pb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest select-none">
          {label}
        </p>
      )}
      {links.map((link) => (
        <NavItem key={link.to} {...link} unreadCount={unreadCount} />
      ))}
    </div>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
export default function Sidebar({ onLogout, mobileOpen, onClose }) {
  const role      = useAuthStore((s) => s.role);
  const school    = useAuthStore((s) => s.school);
  const fullName  = useAuthStore((s) => s.fullName);
  const { pathname } = useLocation();
  const unreadCount  = useNotificationsStore((s) => s.unreadCount);
  const uiLang       = useUiStore((s) => s.uiLang);
  const toggleLang   = useUiStore((s) => s.toggleLang);
  const t = useT();
  const { f } = usePlan();

  useEffect(() => {
    if (onClose) onClose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const adminGroups = [
    {
      links: [
        { to: '/app', label: t('Tableau de bord', 'Dashboard'), icon: 'home', end: true },
      ],
    },
    {
      label: t('Scolarité', 'Academics'),
      links: [
        { to: '/app/classes',   label: t('Classes', 'Classes'),                   icon: 'classes' },
        { to: '/app/subjects',  label: t('Matières', 'Subjects'),                 icon: 'subjects' },
        { to: '/app/students',  label: t('Élèves', 'Students'),                   icon: 'students' },
        { to: '/app/absences',  label: t('Absences', 'Attendance'),               icon: 'absences', locked: !f.hasAbsences },
        { to: '/app/grades',     label: t('Notes', 'Grades'),                      icon: 'grades' },
        { to: '/app/bulletins', label: t('Bulletins', 'Report Cards'),            icon: 'bulletins' },
        { to: '/app/timetable', label: t('Emploi du temps', 'Timetable'),         icon: 'timetable', locked: !f.hasTimetable },
        { to: '/app/conseil',   label: t('Conseil de classe', 'Class Council'),   icon: 'conseil' },
      ],
    },
    {
      label: t('Analyses', 'Analytics'),
      links: [
        { to: '/app/reports', label: t('Rapports', 'Reports'),       icon: 'reports' },
        { to: '/app/monitor', label: t('Surveillance', 'Monitoring'), icon: 'monitor', badge: true },
      ],
    },
    {
      label: t('Gestion', 'Management'),
      links: [
        { to: '/app/fees',     label: t('Frais scolaires', 'School Fees'), icon: 'fees',     locked: !f.hasFees },
        { to: '/app/teachers', label: t('Enseignants', 'Teachers'),        icon: 'teachers', locked: !f.hasTeachers },
      ],
    },
    {
      label: t('Administration', 'Administration'),
      links: [
        { to: '/app/year',       label: t('Année scolaire', 'Academic Year', 'Año escolar'), icon: 'year' },
        { to: '/app/historique', label: t('Historique', 'History', 'Historial'),             icon: 'history' },
        { to: '/app/settings',   label: t('Paramètres', 'Settings', 'Ajustes'),               icon: 'settings' },
        { to: '/app/aide',       label: t('Guide / Aide', 'Help guide', 'Ayuda'),             icon: 'help' },
      ],
    },
  ];

  // Censeur (Jefe de Estudios) : supervision pédagogique + surveillance + frais.
  // Pas d'accès aux enseignants (création de comptes), année scolaire,
  // historique ni configuration de l'établissement.
  const censeurGroups = [
    {
      links: [
        { to: '/app', label: t('Tableau de bord', 'Dashboard'), icon: 'home', end: true },
      ],
    },
    {
      label: t('Scolarité', 'Academics'),
      links: [
        { to: '/app/classes',   label: t('Classes', 'Classes'),                   icon: 'classes' },
        { to: '/app/subjects',  label: t('Matières', 'Subjects'),                 icon: 'subjects' },
        { to: '/app/students',  label: t('Élèves', 'Students'),                   icon: 'students' },
        { to: '/app/absences',  label: t('Absences', 'Attendance'),               icon: 'absences', locked: !f.hasAbsences },
        { to: '/app/grades',    label: t('Notes', 'Grades'),                      icon: 'grades' },
        { to: '/app/bulletins', label: t('Bulletins', 'Report Cards'),            icon: 'bulletins' },
        { to: '/app/timetable', label: t('Emploi du temps', 'Timetable'),         icon: 'timetable', locked: !f.hasTimetable },
        { to: '/app/conseil',   label: t('Conseil de classe', 'Class Council'),   icon: 'conseil' },
      ],
    },
    {
      label: t('Analyses', 'Analytics'),
      links: [
        { to: '/app/reports', label: t('Rapports', 'Reports'),        icon: 'reports' },
        { to: '/app/monitor', label: t('Surveillance', 'Monitoring'), icon: 'monitor', badge: true },
      ],
    },
    {
      label: t('Gestion', 'Management'),
      links: [
        { to: '/app/fees', label: t('Frais scolaires', 'School Fees'), icon: 'fees', locked: !f.hasFees },
      ],
    },
    {
      label: t('Administration', 'Administration'),
      links: [
        { to: '/app/settings', label: t('Paramètres', 'Settings', 'Ajustes'), icon: 'settings' },
        { to: '/app/aide',     label: t('Guide / Aide', 'Help guide', 'Ayuda'), icon: 'help' },
      ],
    },
  ];

  // Surveillant (Jefe de Disciplina) : discipline, assiduité (absences), élèves.
  // Pas d'accès aux notes, bulletins, frais, paramètres ni année scolaire.
  const surveillantGroups = [
    {
      links: [
        { to: '/app', label: t('Tableau de bord', 'Dashboard'), icon: 'home', end: true },
      ],
    },
    {
      label: t('Vie scolaire', 'School life'),
      links: [
        { to: '/app/students',  label: t('Élèves', 'Students'),                 icon: 'students' },
        { to: '/app/absences',  label: t('Absences', 'Attendance'),             icon: 'absences', locked: !f.hasAbsences },
        { to: '/app/conseil',   label: t('Conseil de classe', 'Class Council'), icon: 'conseil' },
      ],
    },
    {
      label: t('Administration', 'Administration'),
      links: [
        { to: '/app/settings', label: t('Paramètres', 'Settings', 'Ajustes'), icon: 'settings' },
        { to: '/app/aide',     label: t('Guide / Aide', 'Help guide', 'Ayuda'), icon: 'help' },
      ],
    },
  ];

  const teacherGroups = [
    {
      label: t('Mon espace', 'My Space'),
      links: [
        { to: '/app/grades',     label: t('Notes', 'Grades'),              icon: 'grades' },
        { to: '/app/absences',   label: t('Absences', 'Attendance'),       icon: 'absences', locked: !f.hasAbsences },
        { to: '/app/bulletins',  label: t('Bulletins', 'Report Cards'),    icon: 'bulletins' },
        { to: '/app/timetable',  label: t('Emploi du temps', 'Timetable'), icon: 'timetable', locked: !f.hasTimetable },
        { to: '/app/settings',   label: t('Paramètres', 'Settings'),       icon: 'settings' },
        { to: '/app/aide',       label: t('Guide / Aide', 'Help guide'),   icon: 'help' },
      ],
    },
  ];

  const groups  = role === 'teacher' ? teacherGroups
    : role === 'censeur' ? censeurGroups
    : role === 'surveillant' ? surveillantGroups
    : adminGroups;
  const initials = fullName
    ? fullName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <aside className={`
      fixed top-0 left-0 w-60 h-screen z-40
      bg-white border-r border-slate-200/80
      flex flex-col
      transition-transform duration-200 ease-in-out
      ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      md:translate-x-0
    `}>

      {/* ── Logo ── */}
      <div className="px-4 py-4 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-3">
          <LogoMark size={36} className="shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate leading-tight">
              NotesCam
            </p>
            <p className="text-xs text-slate-400 truncate leading-none mt-0.5">
              {t('Gestion scolaire', 'School management', 'Gestión escolar')}
            </p>
          </div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5">
        {groups.map((group, i) => (
          <NavGroup
            key={i}
            label={group.label}
            links={group.links}
            unreadCount={unreadCount}
          />
        ))}
      </nav>

      {/* ── Profil + langue + déconnexion ── */}
      <div className="px-2.5 py-3 border-t border-slate-100 shrink-0">
        {/* Profile card */}
        <div className="flex items-center gap-2.5 px-2.5 py-2 mb-1 rounded-xl bg-slate-50 border border-slate-100">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-800 truncate leading-tight">
              {fullName || '—'}
            </p>
            <p className="text-[10px] text-slate-400 leading-tight mt-0.5 capitalize">
              {role === 'admin' ? t('Administrateur', 'Administrator')
                : role === 'censeur' ? t('Censeur', 'Dean of studies', 'Jefe de estudios')
                : role === 'surveillant' ? t('Surveillant', 'Supervisor', 'Jefe de disciplina')
                : t('Enseignant', 'Teacher')}
            </p>
          </div>
        </div>

        {/* Language toggle — cycle FR → EN → ES */}
        <button
          onClick={toggleLang}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-500 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-all duration-150 font-medium mb-0.5"
          title={
            uiLang === 'fr' ? 'Switch to English'
            : uiLang === 'en' ? 'Cambiar a español'
            : 'Passer en français'
          }
        >
          <span className="w-[18px] h-[18px] shrink-0 flex items-center justify-center text-base leading-none">
            🌐
          </span>
          <span className="flex items-center gap-1.5">
            <span className={uiLang === 'fr' ? 'font-bold text-brand-600' : 'text-slate-400'}>FR</span>
            <span className="text-slate-300">/</span>
            <span className={uiLang === 'en' ? 'font-bold text-brand-600' : 'text-slate-400'}>EN</span>
            <span className="text-slate-300">/</span>
            <span className={uiLang === 'es' ? 'font-bold text-brand-600' : 'text-slate-400'}>ES</span>
          </span>
        </button>

        {/* Logout */}
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all duration-150 font-medium"
        >
          <span className="w-[18px] h-[18px] shrink-0">{ICONS.logout}</span>
          {t('Déconnexion', 'Logout')}
        </button>
      </div>
    </aside>
  );
}
