import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useUiStore }   from '../store/uiStore';
import { useNotificationsStore } from '../store/notificationsStore';
import { useMessagesStore } from '../store/messagesStore';
import { flushSyncQueue, clearSyncQueue, pruneExpiredItems } from '../lib/sync';
import Sidebar from './nav/Sidebar';
import MobileNav from './nav/MobileNav';
import NotificationBell from './NotificationBell';
import UserMenu from './UserMenu';
import LanguageMenu from './LanguageMenu';
import { localeForLang } from '../lib/i18n';

// ── Horloge d'en-tête (date + heure du jour) ───────────────────────────────
// Affichée à côté des notifications. Se met à jour chaque minute.
function HeaderClock() {
  const uiLang = useUiStore((s) => s.uiLang);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const locale = localeForLang(uiLang);
  const date = now.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  const time = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="hidden sm:flex flex-col items-end leading-tight mr-1" title={now.toLocaleString(locale)}>
      <span className="text-xs font-semibold text-slate-600 capitalize">{date}</span>
      <span className="text-[11px] text-slate-400 tabular-nums">{time}</span>
    </div>
  );
}

// ── Indicateur de synchronisation ─────────────────────────────────────────
function SyncIndicator() {
  const online       = useUiStore((s) => s.online);
  const syncStatus   = useUiStore((s) => s.syncStatus);
  const pendingCount = useUiStore((s) => s.pendingCount);
  const failedCount  = useUiStore((s) => s.failedCount);
  const failedItems  = useUiStore((s) => s.failedItems);
  const [open,    setOpen]    = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (syncStatus !== 'synced') return;
    const t = setTimeout(() => useUiStore.getState().setIdle(), 3000);
    return () => clearTimeout(t);
  }, [syncStatus]);

  // Ferme le popover si on clique ailleurs
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);

  const handleRetry = async (e) => {
    e.stopPropagation();
    setRetrying(true);
    setOpen(false);
    useUiStore.getState().setSyncing();
    await pruneExpiredItems();
    const { failed, failedItems = [] } = await flushSyncQueue();
    setRetrying(false);
    if (failed === 0) {
      useUiStore.getState().setSynced();
      setTimeout(() => useUiStore.getState().setIdle(), 3000);
    } else {
      useUiStore.getState().setSyncError(failed, failedItems);
    }
  };

  const handleClear = async (e) => {
    e.stopPropagation();
    setOpen(false);
    await clearSyncQueue();
  };

  if (!online) return (
    <span className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
      Hors ligne{pendingCount > 0 ? ` · ${pendingCount} en attente` : ''}
    </span>
  );

  if (syncStatus === 'syncing' || retrying) return (
    <span className="flex items-center gap-1.5 text-xs text-brand-500 font-medium animate-pulse">
      <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      Sync…
    </span>
  );

  if (syncStatus === 'synced') return (
    <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 13l4 4L19 7"/>
      </svg>
      Synchronisé
    </span>
  );

  if (syncStatus === 'error') return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-red-500 font-medium px-2.5 py-1 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 animate-pulse" />
        {failedCount} échec{failedCount > 1 ? 's' : ''} sync
        <svg className="w-3 h-3 ml-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 9l-7 7-7-7"/>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-card-lg border border-slate-200 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-700">
              {failedCount} opération{failedCount > 1 ? 's' : ''} en échec
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Échec après plusieurs tentatives. Ces données ne seront plus retentées.
            </p>
          </div>

          {/* Détail des erreurs */}
          {failedItems.length > 0 && (
            <div className="px-4 py-3 border-b border-slate-100 space-y-2 max-h-40 overflow-y-auto">
              {failedItems.map((item, i) => (
                <div key={i} className="bg-red-50 rounded-lg p-2">
                  <p className="text-xs font-semibold text-red-700">
                    {item.table} · {item.operation}
                  </p>
                  <p className="text-xs text-red-500 mt-0.5 break-words">{item.error}</p>
                </div>
              ))}
            </div>
          )}

          <div className="px-4 py-3 flex flex-col gap-2">
            <button
              onClick={handleRetry}
              className="w-full py-2 px-3 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              Réessayer maintenant
            </button>
            <button
              onClick={handleClear}
              className="w-full py-2 px-3 bg-slate-50 hover:bg-red-50 hover:text-red-600 text-slate-500 text-xs font-medium rounded-lg border border-slate-200 transition-colors"
            >
              Vider la file d'attente
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (pendingCount > 0) return (
    <span className="flex items-center gap-1.5 text-xs text-amber-600 font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
      {pendingCount} en attente
    </span>
  );

  return null;
}

// ── Layout principal ───────────────────────────────────────────────────────
export default function Layout({ children, bleed = false }) {
  const navigate    = useNavigate();
  const { school, logout } = useAuthStore();
  const viewYear    = useUiStore((s) => s.viewYear);
  const clearViewYear = useUiStore((s) => s.clearViewYear);
  const sidebarHidden = useUiStore((s) => s.sidebarHidden);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const role     = useAuthStore((s) => s.role);
  const teacherId = useAuthStore((s) => s.teacherId);

  const initNotifications   = useNotificationsStore((s) => s.init);
  const cleanupNotifications = useNotificationsStore((s) => s.cleanup);
  const initMessages        = useMessagesStore((s) => s.init);
  const cleanupMessages     = useMessagesStore((s) => s.cleanup);

  // Init selon le rôle quand l'école est connue
  useEffect(() => {
    if (!school?.id) return;
    if (role === 'admin') {
      initNotifications(school.id);
      initMessages(school.id, 'admin', null);
    } else if (role === 'teacher') {
      initMessages(school.id, 'teacher', teacherId);
    }
    return () => {
      cleanupNotifications();
      cleanupMessages();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school?.id, role, teacherId]);

  const handleLogout = async () => {
    cleanupNotifications();
    cleanupMessages();
    await logout();
    navigate('/login');
  };

  // Ferme la sidebar mobile à chaque changement de route
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const isArchive = viewYear !== null;

  return (
    <div className="h-screen overflow-hidden bg-slate-50 font-sans">

      {/* Overlay mobile pour fermer la sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 md:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Bandeau année archivée */}
      {isArchive && (
        <div className={`fixed top-0 left-0 ${sidebarHidden ? 'md:left-0' : 'md:left-60'} right-0 z-[60] bg-amber-400 text-amber-900 flex items-center justify-between px-4 md:px-6 py-1.5 text-sm font-semibold shadow-sm transition-all`}>
          <div className="flex items-center gap-2 min-w-0">
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            </svg>
            <span className="truncate">Archive&nbsp;<strong>{viewYear}</strong>&nbsp;(lecture seule)</span>
          </div>
          <button
            onClick={clearViewYear}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1 bg-amber-900/15 hover:bg-amber-900/25 rounded-lg transition-colors text-xs font-bold ml-2"
          >
            ✕&nbsp;<span className="hidden sm:inline">Retour à {school?.current_year || "l'année active"}</span>
          </button>
        </div>
      )}

      {/* Header fixe */}
      <header className={`fixed ${isArchive ? 'top-9' : 'top-0'} left-0 ${sidebarHidden ? 'md:left-0' : 'md:left-60'} right-0 h-14 z-50 bg-white/90 backdrop-blur-xl border-b border-slate-200/60 flex items-center px-4 md:px-6 gap-3 transition-all shadow-sm`}>
        {/* Hamburger — mobile uniquement */}
        <button
          className="md:hidden p-2 -ml-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
          onClick={() => setSidebarOpen(true)}
          aria-label="Ouvrir le menu"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6"  x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>

        {/* Afficher la barre latérale — desktop, visible quand elle est repliée */}
        {sidebarHidden && (
          <button
            className="hidden md:flex p-2 -ml-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
            onClick={toggleSidebar}
            title="Afficher la barre latérale"
            aria-label="Afficher la barre latérale"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6"  x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
        )}

        {/* School name */}
        <div className="flex-1 min-w-0">
          {school?.name && (
            <p className="text-sm font-semibold text-slate-700 truncate">{school.name}</p>
          )}
          <p className="text-xs text-slate-400 leading-none">
            {isArchive
              ? <span className="text-amber-600 font-semibold">{viewYear} · Archive</span>
              : school?.current_year
            }
          </p>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <HeaderClock />
          <LanguageMenu />
          {!isArchive && <SyncIndicator />}
          {!isArchive && <NotificationBell />}
          <div className="w-px h-6 bg-slate-200 mx-0.5 hidden sm:block" />
          <UserMenu onLogout={handleLogout} />
        </div>
      </header>

      {/* Sidebar (desktop/tablette) */}
      <Sidebar mobileOpen={sidebarOpen} onClose={closeSidebar} />

      {/* Contenu principal scrollable */}
      <main className={`ml-0 ${sidebarHidden ? 'md:ml-0' : 'md:ml-60'} ${isArchive ? 'mt-[calc(3.5rem+2.25rem)]' : 'mt-14'} ${isArchive ? 'h-[calc(100vh-3.5rem-2.25rem)]' : 'h-[calc(100vh-3.5rem)]'} overflow-y-auto transition-all`}>
        {/* pb-24 sur mobile : dégage la bottom-nav fixe (h-16). En mode `bleed`
            (écran plein écran focalisé), la page gère elle-même son padding et
            occupe toute la hauteur disponible. */}
        {bleed ? (
          <div className="h-full pb-16 md:pb-0">{children}</div>
        ) : (
          <div className="p-4 pb-24 md:p-8">{children}</div>
        )}
      </main>

      {/* Bottom-nav (mobile uniquement) */}
      <MobileNav onLogout={handleLogout} />
    </div>
  );
}
