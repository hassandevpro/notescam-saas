// Notifications éphémères (toasts) globales — succès / erreur / info.
// Zustand, cohérent avec les autres stores. Aucun provider requis : le store est
// global, un seul <ToastHost/> (monté dans App) l'affiche.
import { create } from 'zustand';

let _id = 0;

export const useToastStore = create((set, get) => ({
  toasts: [],
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  push: (type, message, ttl) => {
    const id = ++_id;
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }));
    // Les erreurs restent un peu plus longtemps (lecture d'un message d'échec).
    const delay = ttl ?? (type === 'error' ? 5000 : 3200);
    if (delay) setTimeout(() => get().remove(id), delay);
    return id;
  },
}));

// Accès direct (hors composant : handlers, services). Ex. : toast.success('…').
export const toast = {
  success: (message) => useToastStore.getState().push('success', message),
  error:   (message) => useToastStore.getState().push('error', message),
  info:    (message) => useToastStore.getState().push('info', message),
};
