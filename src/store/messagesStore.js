import { create } from 'zustand';
import { uuid } from '../lib/uuid';
import {
  fetchMessagesForAdmin,
  fetchMessagesForTeacher,
  sendMessage,
  markMessageRead,
  markAllTeacherMessagesRead,
  subscribeToTeacherMessages,
} from '../lib/messagesService';

export const useMessagesStore = create((set, get) => ({
  messages:    [],
  unreadCount: 0,
  loading:     false,
  _channel:    null,
  _teacherId:  null,

  init: async (schoolId, role, teacherId) => {
    get().cleanup();
    set({ loading: true, _teacherId: teacherId });

    if (role === 'admin') {
      const data = await fetchMessagesForAdmin(schoolId);
      set({ messages: data, unreadCount: 0, loading: false });
    } else if (role === 'teacher' && teacherId) {
      const data  = await fetchMessagesForTeacher(teacherId);
      const unread = data.filter((m) => !m.read).length;
      set({ messages: data, unreadCount: unread, loading: false });

      const channel = subscribeToTeacherMessages(teacherId, (newMsg) => {
        set((s) => ({
          messages:    [newMsg, ...s.messages].slice(0, 50),
          unreadCount: s.unreadCount + (newMsg.read ? 0 : 1),
        }));
      });
      set({ _channel: channel });
    } else {
      set({ loading: false });
    }
  },

  cleanup: () => {
    const { _channel } = get();
    if (_channel) _channel.unsubscribe();
    set({ messages: [], unreadCount: 0, _channel: null });
  },

  send: async (messageData) => {
    const ok = await sendMessage(messageData);
    if (ok) {
      const optimistic = {
        ...messageData,
        id:         uuid(),
        read:       false,
        created_at: new Date().toISOString(),
      };
      set((s) => ({ messages: [optimistic, ...s.messages] }));
    }
    return ok;
  },

  markRead: async (id) => {
    const msg = get().messages.find((m) => m.id === id);
    if (!msg || msg.read) return;
    await markMessageRead(id);
    set((s) => ({
      messages:    s.messages.map((m) => (m.id === id ? { ...m, read: true } : m)),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }));
  },

  markAllRead: async () => {
    const { _teacherId, messages } = get();
    if (_teacherId) await markAllTeacherMessagesRead(_teacherId);
    set((s) => ({
      messages:    s.messages.map((m) => ({ ...m, read: true })),
      unreadCount: 0,
    }));
  },
}));
