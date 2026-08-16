// Notifications INTERNES (in-app). Le moteur multi-canaux (notificationEngine)
// prévoit email/SMS/WhatsApp mais seul le canal interne est implémenté ici.
import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useT } from '../lib/i18n';
import { timeAgo, fullDate } from '../lib/timeAgo';
import { useAppNotificationsStore } from '../store/appNotificationsStore';

const PER_PAGE = 20;

// Accent d'une ligne selon le `type` de la notification (colonne `type` de la
// table). Le préfixe suffit : les producteurs déclinent chaque famille
// (`expense_paid`, `expense_rejected`…) et une famille garde une seule couleur.
const ACCENTS = [
  [/^discipline_grave/,        { dot: 'bg-rose-500',    soft: 'bg-rose-50',    ring: 'ring-rose-100'    }],
  [/^(discipline|report)/,     { dot: 'bg-amber-500',   soft: 'bg-amber-50',   ring: 'ring-amber-100'   }],
  [/(rejected|cancelled)$/,    { dot: 'bg-rose-500',    soft: 'bg-rose-50',    ring: 'ring-rose-100'    }],
  [/(approved|applied|paid)$/, { dot: 'bg-emerald-500', soft: 'bg-emerald-50', ring: 'ring-emerald-100' }],
  [/^(budget|expense)/,        { dot: 'bg-brand-500',   soft: 'bg-brand-50',   ring: 'ring-brand-100'   }],
  [/^period_/,                 { dot: 'bg-violet-500',  soft: 'bg-violet-50',  ring: 'ring-violet-100'  }],
];
const NEUTRAL = { dot: 'bg-slate-400', soft: 'bg-slate-50', ring: 'ring-slate-100' };
const accentOf = (type) => ACCENTS.find(([re]) => re.test(type || ''))?.[1] || NEUTRAL;

const BellIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);

export default function Notifications() {
  const t = useT();
  const navigate = useNavigate();

  // MÊME source que la cloche : lire ici décrémente la pastille immédiatement.
  // (Avant, cette page tenait son propre état local et les deux divergeaient.)
  // Le chargement est fait une fois pour toutes par Layout à l'ouverture de
  // l'école — inutile de refetcher à chaque visite.
  const items      = useAppNotificationsStore((s) => s.items);
  const loading    = useAppNotificationsStore((s) => s.loading);
  const markRead   = useAppNotificationsStore((s) => s.markRead);
  const readAll    = useAppNotificationsStore((s) => s.markAllRead);

  const [filter, setFilter] = useState('all');   // all | unread | read
  const [query, setQuery]   = useState('');
  const [page, setPage]     = useState(1);

  const unreadCount = items.filter((n) => !n.read).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((n) => {
      if (filter === 'unread' && n.read) return false;
      if (filter === 'read' && !n.read)  return false;
      if (!q) return true;
      return `${n.title || ''} ${n.body || ''}`.toLowerCase().includes(q);
    });
  }, [items, filter, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  // Un filtre plus étroit peut laisser la page courante au-delà du dernier
  // écran : sans ce recadrage, la liste s'afficherait vide alors qu'elle a des
  // résultats.
  useEffect(() => { setPage((p) => Math.min(p, pageCount)); }, [pageCount]);
  useEffect(() => { setPage(1); }, [filter, query]);

  const shown = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const open = async (n) => {
    if (!n.read) await markRead(n.id);
    if (n.link) navigate(n.link);
  };

  const FILTERS = [
    ['all',    t('Toutes', 'All', 'Todas')],
    ['unread', t('Non lues', 'Unread', 'Sin leer')],
    ['read',   t('Lues', 'Read', 'Leídas')],
  ];

  const stats = [
    [t('Non lues', 'Unread', 'Sin leer'), unreadCount, unreadCount > 0 ? 'text-rose-600' : 'text-slate-400'],
    [t('Total', 'Total', 'Total'), items.length, 'text-brand-600'],
    [t('Cette page', 'This page', 'Esta página'), shown.length, 'text-slate-900'],
  ];

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-4">

        {/* ── En-tête ─────────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-brand-50/70 via-white to-emerald-50/40 p-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-brand-100/80 flex items-center justify-center shrink-0">
              <BellIcon className="w-6 h-6 text-brand-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-brand-600">
                {t("Centre d'alertes", 'Alert center', 'Centro de alertas')}
              </p>
              <h1 className="text-2xl font-bold text-slate-900 leading-tight">
                {t('Notifications', 'Notifications', 'Notificaciones')}
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {t('Gérez vos notifications et alertes', 'Manage your notifications and alerts', 'Gestione sus notificaciones y alertas')}
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              {stats.map(([label, value, tone]) => (
                <div key={label} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-center min-w-[86px]">
                  <p className="text-[11px] text-slate-500 whitespace-nowrap">{label}</p>
                  <p className={`text-xl font-bold leading-tight ${tone}`}>{value}</p>
                </div>
              ))}
              <button
                onClick={readAll}
                disabled={unreadCount === 0}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold flex items-center gap-2 transition-colors
                           enabled:text-slate-700 enabled:hover:bg-slate-50 enabled:hover:border-slate-300
                           disabled:text-slate-300 disabled:cursor-not-allowed">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                     strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m2 12 5 5L17 7" /><path d="m13 15 2 2 7-7" />
                </svg>
                {t('Tout marquer comme lu', 'Mark all as read', 'Marcar todo como leído')}
              </button>
            </div>
          </div>
        </div>

        {/* ── Recherche & filtres ─────────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[220px]">
            <svg className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                 viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                 strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('Rechercher dans les notifications…', 'Search notifications…', 'Buscar en las notificaciones…')}
              aria-label={t('Rechercher dans les notifications', 'Search notifications', 'Buscar en las notificaciones')}
              className="w-full rounded-full border border-slate-200 bg-white pl-11 pr-4 py-2.5 text-sm text-slate-700
                         placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-300"
            />
          </div>

          <div className="flex items-center gap-2">
            {FILTERS.map(([key, label]) => (
              <button key={key} onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${
                  filter === key
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Liste ───────────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          {loading ? (
            <div className="py-20 text-center text-sm text-slate-400 animate-pulse">
              {t('Chargement…', 'Loading…', 'Cargando…')}
            </div>
          ) : shown.length === 0 ? (
            <div className="py-20 px-6 text-center">
              <div className="w-14 h-14 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-4">
                <BellIcon className="w-7 h-7 text-brand-500" />
              </div>
              {items.length === 0 ? (
                <>
                  <p className="text-base font-semibold text-slate-900">
                    {t('Aucune notification', 'No notification', 'Sin notificaciones')}
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    {t("Vous n'avez aucune notification.", 'You have no notifications.', 'No tiene ninguna notificación.')}
                  </p>
                </>
              ) : (
                // Le vide vient du filtre ou de la recherche, pas de la boîte :
                // le dire, et offrir la sortie plutôt qu'un cul-de-sac.
                <>
                  <p className="text-base font-semibold text-slate-900">
                    {t('Aucun résultat', 'No result', 'Sin resultados')}
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    {t('Aucune notification ne correspond à votre recherche.',
                       'No notification matches your search.',
                       'Ninguna notificación coincide con su búsqueda.')}
                  </p>
                  <button onClick={() => { setFilter('all'); setQuery(''); }}
                    className="mt-4 text-sm font-semibold text-brand-600 hover:text-brand-700">
                    {t('Réinitialiser les filtres', 'Reset filters', 'Restablecer filtros')}
                  </button>
                </>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {shown.map((n) => {
                // Une ligne lue perd sa couleur : sinon un halo vif entoure un
                // point éteint, et l'écran ne distingue plus le lu du non-lu.
                const a = n.read ? NEUTRAL : accentOf(n.type);
                return (
                  <li key={n.id}>
                    <button onClick={() => open(n)}
                      className={`w-full text-left px-5 py-4 flex gap-3.5 items-start transition-colors hover:bg-slate-50 ${
                        n.read ? '' : 'bg-brand-50/40'}`}>
                      <span className={`w-9 h-9 rounded-xl shrink-0 flex items-center justify-center ring-4 ${a.soft} ${a.ring}`}>
                        <span className={`w-2 h-2 rounded-full ${a.dot}`} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className={`block text-sm text-slate-900 ${n.read ? 'font-medium' : 'font-bold'}`}>
                          {n.title}
                        </span>
                        {n.body && <span className="block text-sm text-slate-600 mt-0.5">{n.body}</span>}
                      </span>
                      <span className="text-xs text-slate-400 shrink-0 whitespace-nowrap pt-0.5"
                            title={fullDate(n.created_at)}>
                        {timeAgo(n.created_at)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 bg-slate-50/60">
              <p className="text-xs text-slate-500">
                {t('Page', 'Page', 'Página')} {page} / {pageCount} · {filtered.length} {t('résultat(s)', 'result(s)', 'resultado(s)')}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold transition-colors
                             enabled:text-slate-700 enabled:hover:bg-slate-100 disabled:text-slate-300 disabled:cursor-not-allowed">
                  {t('Précédent', 'Previous', 'Anterior')}
                </button>
                <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold transition-colors
                             enabled:text-slate-700 enabled:hover:bg-slate-100 disabled:text-slate-300 disabled:cursor-not-allowed">
                  {t('Suivant', 'Next', 'Siguiente')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
