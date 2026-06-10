// UI transient state — online status, sync indicator, UI language.
// uiLang is persisted to localStorage; other values are recalculated on start.

import { create } from 'zustand';

const _SUPPORTED_LANGS = ['fr', 'en', 'es'];
const _stored = localStorage.getItem('notescam_ui_lang') || 'fr';
const _savedLang = _SUPPORTED_LANGS.includes(_stored) ? _stored : 'fr';

export const useUiStore = create((set) => ({
  online: navigator.onLine,
  syncStatus: 'idle',  // 'idle' | 'syncing' | 'synced' | 'error'
  pendingCount: 0,
  failedCount: 0,
  failedItems: [],

  viewYear: null,

  // 'fr' | 'en' | 'es'
  uiLang: _savedLang,

  // Bulletins page navigation — persisted across route changes
  bulletinsClassId:   '',
  bulletinsPeriodKey: 'seq_1',
  bulletinsStudentId: '',
  bulletinsFormat:    'apc',
  setBulletinsClassId:   (v) => set({ bulletinsClassId: v }),
  setBulletinsPeriodKey: (v) => set({ bulletinsPeriodKey: v }),
  setBulletinsStudentId: (v) => set({ bulletinsStudentId: v }),
  setBulletinsFormat:    (v) => set({ bulletinsFormat: v }),

  // Grades page navigation — persisted across route changes
  gradesClassId:   '',
  gradesSequence:  1,
  gradesSubjectId: '',
  setGradesClassId:   (v) => set({ gradesClassId: v }),
  setGradesSequence:  (v) => set({ gradesSequence: v }),
  setGradesSubjectId: (v) => set({ gradesSubjectId: v }),

  // Absences page navigation — persisted across route changes
  absencesTab:          'saisie',
  absencesClassId:      '',
  absencesSubjectId:    '',
  absencesSession:      '',
  absencesDate:         '',
  absencesStatsClassId: '',
  setAbsencesTab:          (v) => set({ absencesTab: v }),
  setAbsencesClassId:      (v) => set({ absencesClassId: v }),
  setAbsencesSubjectId:    (v) => set({ absencesSubjectId: v }),
  setAbsencesSession:      (v) => set({ absencesSession: v }),
  setAbsencesDate:         (v) => set({ absencesDate: v }),
  setAbsencesStatsClassId: (v) => set({ absencesStatsClassId: v }),

  setOnlineStatus: (online) => set({ online }),
  setSyncing:      ()        => set({ syncStatus: 'syncing' }),
  setSynced:       ()        => set({ syncStatus: 'synced', pendingCount: 0, failedCount: 0, failedItems: [] }),
  setSyncError:    (failed, items = []) => set({ syncStatus: 'error', failedCount: failed, failedItems: items }),
  setIdle:         ()        => set({ syncStatus: 'idle' }),

  setPendingCount:  (n)  => set({ pendingCount: n }),
  incrementPending: ()   => set((s) => ({ pendingCount: s.pendingCount + 1 })),
  decrementPending: ()   => set((s) => ({ pendingCount: Math.max(0, s.pendingCount - 1) })),

  setViewYear:   (year) => set({ viewYear: year }),
  clearViewYear: ()     => set({ viewYear: null }),

  // toggleLang : cycle fr → en → es → fr.
  // Marque la préférence comme "choisie manuellement" pour ne plus la réécraser
  // par la valeur par défaut du pays de l'école.
  toggleLang: () => set((s) => {
    const order = ['fr', 'en', 'es'];
    const idx = order.indexOf(s.uiLang);
    const next = order[(idx + 1) % order.length] || 'fr';
    localStorage.setItem('notescam_ui_lang', next);
    localStorage.setItem('notescam_ui_lang_user_set', 'true');
    return { uiLang: next };
  }),

  // setLang : usage interne (Signup, auto-sync pays). Ne marque PAS la préférence
  // comme utilisateur. Utiliser setLangManual() depuis l'UI utilisateur.
  setLang: (lang) => set(() => {
    const next = _SUPPORTED_LANGS.includes(lang) ? lang : 'fr';
    localStorage.setItem('notescam_ui_lang', next);
    return { uiLang: next };
  }),

  setLangManual: (lang) => set(() => {
    const next = _SUPPORTED_LANGS.includes(lang) ? lang : 'fr';
    localStorage.setItem('notescam_ui_lang', next);
    localStorage.setItem('notescam_ui_lang_user_set', 'true');
    return { uiLang: next };
  }),
}));
