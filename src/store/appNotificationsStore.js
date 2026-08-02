// Store des notifications INTERNES génériques (table `notifications`).
//
// À NE PAS CONFONDRE avec `notificationsStore` (activité des enseignants sur les
// notes, table `teacher_notifications`) ni `messagesStore` (messages de
// l'administration aux enseignants). Ces deux-là restent intacts : ce store est
// la TROISIÈME source de la cloche, celle qu'alimentent les producteurs finance
// et vie scolaire (notificationProducers.js).
//
// Fonctionne en LAN comme au Cloud : le fetch et la souscription passent par
// `./supabase`, aliasé vers localClient en LAN (qui émule `.channel()` par
// sondage). Aucun code conditionnel d'édition.
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import {
  fetchMyNotifications, markNotificationRead, markAllRead,
  isNotificationForMe, subscribeToMyNotifications,
} from '../lib/notificationService';

const recount = (items) => items.filter((n) => !n.read).length;

export const useAppNotificationsStore = create((set, get) => ({
  items: [],
  unreadCount: 0,
  loading: false,
  _channel: null,
  _ctx: null,           // { schoolId, userId, role } — nécessaire au filtrage temps réel

  init: async (schoolId, userId, role) => {
    if (!schoolId) return;
    get().cleanup();
    set({ loading: true, _ctx: { schoolId, userId, role } });

    const data = await fetchMyNotifications(schoolId, userId, role);
    set({ items: data, unreadCount: recount(data), loading: false });

    // Le temps réel réapplique le MÊME prédicat que le chargement : une ligne
    // destinée à quelqu'un d'autre ne doit jamais apparaître ici.
    let channel = null;
    try {
      channel = subscribeToMyNotifications(schoolId, (row) => {
        const ctx = get()._ctx;
        if (!ctx || !isNotificationForMe(row, ctx.userId, ctx.role)) return;
        set((s) => {
          const exists = s.items.some((n) => n.id === row.id);
          const items = exists
            ? s.items.map((n) => (n.id === row.id ? row : n))
            : [row, ...s.items].slice(0, 100);
          return { items, unreadCount: recount(items) };
        });
      });
    } catch (e) {
      // Pas de temps réel disponible : la liste reste correcte au chargement.
      console.warn('[appNotifications] temps réel indisponible —', e?.message);
    }
    set({ _channel: channel });
  },

  cleanup: () => {
    const { _channel } = get();
    if (_channel) { try { supabase.removeChannel(_channel); } catch { /* ignore */ } }
    set({ items: [], unreadCount: 0, _channel: null, _ctx: null });
  },

  markRead: async (id) => {
    const n = get().items.find((x) => x.id === id);
    if (!n || n.read) return;
    await markNotificationRead(id);
    set((s) => {
      const items = s.items.map((x) => (x.id === id ? { ...x, read: true } : x));
      return { items, unreadCount: recount(items) };
    });
  },

  markAllRead: async () => {
    const ctx = get()._ctx;
    const unread = get().items.filter((n) => !n.read).map((n) => n.id);
    if (!unread.length) return;
    await markAllRead(ctx?.schoolId, unread);
    set((s) => ({ items: s.items.map((x) => ({ ...x, read: true })), unreadCount: 0 }));
  },
}));
