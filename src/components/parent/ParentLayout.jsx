import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useParentStore } from '../../store/parentStore';
import { PARENT_NAV, parentNavPath } from '../../config/navigation';
import { ICONS } from '../nav/icons';
import { useT } from '../../lib/i18n';
import { childSector, SECTOR_LABEL } from '../../lib/parentService';
import StudentAvatar from '../StudentAvatar';

// Coquille de l'ESPACE PARENT — indépendante de Layout.jsx (personnel).
//
// Elle ne monte NI la Sidebar du personnel, NI `schoolStore` : ce dernier charge
// l'établissement entier pour le travail de l'école. Un parent n'a aucune raison
// de télécharger ça, et surtout aucun de ses écrans n'en dépend — tout vient des
// RPC `parent_*`, déjà bornées à ses enfants.

// Sélecteur d'enfant. Il n'ouvre aucun droit : les enfants listés sont
// exactement ceux que le serveur a renvoyés, et chaque écran redemande sa
// section, qui est revérifiée à chaque appel.
function ChildSwitcher() {
  const t = useT();
  const children   = useParentStore((s) => s.children);
  const selectedId = useParentStore((s) => s.selectedId);
  const select     = useParentStore((s) => s.select);

  if (children.length < 2) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      {children.map((c) => {
        const active = c.student.id === selectedId;
        const sector = childSector(c);
        return (
          <button
            key={c.student.id}
            onClick={() => select(c.student.id)}
            className={`flex items-center gap-2 shrink-0 rounded-xl border px-3 py-2 transition-colors ${
              active
                ? 'border-brand-500 bg-brand-50 text-brand-800'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
            }`}
          >
            <StudentAvatar student={c.student} size={28} />
            <span className="text-left leading-tight">
              <span className="block text-sm font-semibold">{c.student.name}</span>
              <span className="block text-[11px] text-gray-400">
                {c.class?.name}{sector ? ` · ${t(...SECTOR_LABEL[sector])}` : ''}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function ParentLayout() {
  const t = useT();
  const navigate = useNavigate();
  const logout   = useAuthStore((s) => s.logout);
  const fullName = useAuthStore((s) => s.fullName);
  const init       = useParentStore((s) => s.init);
  const reset      = useParentStore((s) => s.reset);
  const loading    = useParentStore((s) => s.loading);
  const error      = useParentStore((s) => s.error);
  const children   = useParentStore((s) => s.children);
  const selectedId = useParentStore((s) => s.selectedId);
  const unread     = useParentStore((s) => s.notifications.filter((n) => !n.read).length);

  useEffect(() => { init(); return () => reset(); }, [init, reset]);

  const school = children[0]?.school || null;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 animate-pulse text-sm">{t('Chargement…', 'Loading…', 'Cargando…')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* En-tête */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          {school?.logo_url ? (
            <img src={school.logo_url} alt="" className="w-9 h-9 rounded-xl object-contain border border-gray-100" />
          ) : (
            <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600 font-bold">
              {(school?.name || 'N')[0]}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest leading-none">
              {t('Espace Parent', 'Parent area', 'Espacio de padres')}
            </p>
            <h1 className="text-sm font-bold text-gray-900 leading-tight truncate">
              {school?.name || t('Mon espace', 'My area', 'Mi espacio')}
            </h1>
          </div>
          <span className="hidden sm:block text-xs text-gray-400 truncate max-w-[180px]">{fullName}</span>
          <button
            onClick={async () => { await logout(); navigate('/parent', { replace: true }); }}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors shrink-0"
          >
            {t('Déconnexion', 'Sign out', 'Cerrar sesión')}
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto w-full px-4 py-4 flex-1 flex flex-col gap-4">
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3">{error}</div>
        )}

        {children.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <div className="text-4xl mb-3">👪</div>
            <h2 className="text-base font-bold text-gray-900 mb-1">
              {t('Aucun enfant rattaché', 'No child linked', 'Ningún hijo vinculado')}
            </h2>
            <p className="text-sm text-gray-500">
              {t("Votre compte n'est encore rattaché à aucun élève. Contactez le secrétariat de l'établissement.",
                 'Your account is not linked to any student yet. Please contact the school office.',
                 'Su cuenta aún no está vinculada a ningún alumno. Contacte con la secretaría.')}
            </p>
          </div>
        ) : (
          <>
            <ChildSwitcher />
            <nav className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-1">
              {PARENT_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={parentNavPath(item, selectedId)}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                      isActive ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
                    }`}
                >
                  <span className="w-4 h-4">{ICONS[item.icon]}</span>
                  <span>{t(...item.label)}</span>
                  {item.to === '/app/parent/notifications' && unread > 0 && (
                    <span className="ml-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center">
                      {unread}
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>
            <Outlet />
          </>
        )}
      </div>

      <footer className="text-center text-[11px] text-gray-300 py-4">
        NotesCam · {t("Données réservées à la famille de l'élève",
                      "Data reserved for the student's family",
                      'Datos reservados a la familia del alumno')}
      </footer>
    </div>
  );
}
