import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  subscribeToNotifications,
} from '../lib/notificationsService';

export const useNotificationsStore = create((set, get) => ({
  notifications: [],
  unreadCount:   0,
  loading:       false,
  _channel:      null,

  init: async (schoolId) => {
    if (!schoolId) return;

    // Cleanup previous subscription
    get().cleanup();

    set({ loading: true });
    const data  = await fetchNotifications(schoolId);
    const unread = data.filter((n) => !n.read).length;
    set({ notifications: data, unreadCount: unread, loading: false });

    // Realtime: handles both INSERT and UPDATE (upsert model — one row per teacher/class/seq)
    const channel = subscribeToNotifications(schoolId, (notif) => {
      set((s) => {
        const exists = s.notifications.find((n) => n.id === notif.id);
        if (exists) {
          // UPDATE: replace in list, recount unread
          const updated = s.notifications.map((n) => n.id === notif.id ? notif : n);
          return { notifications: updated, unreadCount: updated.filter((n) => !n.read).length };
        }
        // INSERT: prepend
        const updated = [notif, ...s.notifications].slice(0, 100);
        return { notifications: updated, unreadCount: updated.filter((n) => !n.read).length };
      });
    });
    set({ _channel: channel });
  },

  cleanup: () => {
    const { _channel } = get();
    if (_channel) {
      supabase.removeChannel(_channel);
    }
    set({ notifications: [], unreadCount: 0, _channel: null });
  },

  markRead: async (id) => {
    const notif = get().notifications.find((n) => n.id === id);
    if (!notif || notif.read) return;
    await markNotificationRead(id);
    set((s) => ({
      notifications: s.notifications.map((n) => n.id === id ? { ...n, read: true } : n),
      unreadCount:   Math.max(0, s.unreadCount - 1),
    }));
  },

  markAllRead: async (schoolId) => {
    await markAllNotificationsRead(schoolId);
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
      unreadCount:   0,
    }));
  },
}));
