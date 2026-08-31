// État de l'ESPACE PARENT.
//
// Store DÉLIBÉRÉMENT séparé de `schoolStore` : celui-ci charge l'établissement
// entier (élèves, notes, frais, personnel) en IndexedDB pour le travail du
// personnel. Y faire entrer un parent reviendrait à lui télécharger l'école sur
// son téléphone — et à faire dépendre son cloisonnement d'un filtre d'affichage.
// Ici, rien n'est chargé qui ne vienne d'une RPC déjà bornée à ses enfants.
//
// Aucune écriture de donnée scolaire ou financière n'existe dans ce fichier, et
// il ne faut pas en ajouter : l'espace parent est en lecture seule.
import { create } from 'zustand';
import {
  fetchParentDashboard, fetchChildGrades, fetchChildBulletins,
  fetchChildAttendance, fetchChildFees, fetchChildDocuments,
  fetchParentNotifications, updateParentProfile,
} from '../lib/parentService';

// Cache par enfant et par section : le parent navigue entre ses enfants, on ne
// rappelle pas le serveur à chaque aller-retour. Clé = `${section}:${studentId}`.
const key = (section, id) => `${section}:${id}`;

export const useParentStore = create((set, get) => ({
  loading: true,
  error: null,
  parent: null,
  children: [],
  notifications: [],
  selectedId: null,     // enfant courant (null = aucun enfant lié)
  sections: {},         // { 'grades:<id>': payload, … }
  sectionLoading: {},

  // Charge l'accueil : profil, enfants, synthèses, notifications récentes.
  init: async () => {
    set({ loading: true, error: null });
    try {
      const data = await fetchParentDashboard();
      if (!data) { set({ loading: false, parent: null, children: [] }); return; }
      const children = data.children || [];
      set({
        loading: false,
        parent: data.parent || null,
        children,
        notifications: data.notifications || [],
        // Conserve la sélection si l'enfant est toujours rattaché ; sinon le premier.
        selectedId: children.some((c) => c.student.id === get().selectedId)
          ? get().selectedId
          : (children[0]?.student?.id ?? null),
      });
    } catch (e) {
      set({ loading: false, error: e.message });
    }
  },

  select: (studentId) => {
    // Ne jamais sélectionner un id absent de la liste rendue par le serveur.
    // Ce n'est pas une mesure de sécurité (le serveur refuserait de toute façon)
    // mais cela évite d'afficher un écran vide sur une URL bricolée.
    if (!get().children.some((c) => c.student.id === studentId)) return;
    set({ selectedId: studentId });
  },

  selectedChild: () => get().children.find((c) => c.student.id === get().selectedId) || null,

  // Charge une section pour un enfant. `force` refait l'appel malgré le cache.
  loadSection: async (section, studentId, force = false) => {
    if (!studentId) return null;
    const k = key(section, studentId);
    if (!force && get().sections[k] !== undefined) return get().sections[k];
    set((s) => ({ sectionLoading: { ...s.sectionLoading, [k]: true } }));
    const loaders = {
      grades:     fetchChildGrades,
      bulletins:  fetchChildBulletins,
      attendance: fetchChildAttendance,
      fees:       fetchChildFees,
      documents:  fetchChildDocuments,
    };
    try {
      // `null` est une réponse LÉGITIME : le serveur dit « pas votre enfant ».
      // On le range tel quel dans le cache pour que l'écran affiche un refus
      // plutôt qu'un chargement perpétuel.
      const data = await loaders[section](studentId);
      set((s) => ({
        sections: { ...s.sections, [k]: data },
        sectionLoading: { ...s.sectionLoading, [k]: false },
      }));
      return data;
    } catch (e) {
      set((s) => ({
        sections: { ...s.sections, [k]: null },
        sectionLoading: { ...s.sectionLoading, [k]: false },
        error: e.message,
      }));
      return null;
    }
  },

  section: (section, studentId) => get().sections[key(section, studentId)],
  isSectionLoading: (section, studentId) => !!get().sectionLoading[key(section, studentId)],

  refreshNotifications: async () => {
    try { set({ notifications: (await fetchParentNotifications(50)) || [] }); }
    catch (e) { set({ error: e.message }); }
  },

  saveProfile: async (fullName, phone) => {
    const ctx = await updateParentProfile(fullName, phone);
    if (ctx?.parent) set({ parent: ctx.parent });
    return ctx;
  },

  reset: () => set({
    loading: true, error: null, parent: null, children: [],
    notifications: [], selectedId: null, sections: {}, sectionLoading: {},
  }),
}));
