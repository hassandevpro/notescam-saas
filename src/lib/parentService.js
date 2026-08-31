// ESPACE PARENT — point d'entrée UNIQUE des données du portail parent.
//
// Tout passe par des RPC `parent_*`. Aucune requête `from('students')`,
// `from('grades')` ou `from('student_fees')` n'est faite ici, et il ne faut
// jamais en ajouter : le serveur (RLS en Cloud, scopeGuard + query.js en LAN)
// refuse de toute façon l'API générique à un compte parent. Passer par la table
// donnerait donc une page vide au lieu d'une donnée — et surtout, cela
// déplacerait la décision d'autorisation vers le frontend, ce que le §15 du
// cahier des charges interdit explicitement.
//
// Chaque RPC est gardée côté serveur par `parent_owns_student()`. Un identifiant
// d'élève qui n'appartient pas au parent rend `null` — jamais une erreur, qui
// confirmerait l'existence de l'élève. Les fonctions ci-dessous propagent ce
// `null` tel quel : c'est à l'écran d'afficher « dossier introuvable ».
import { supabase } from './supabase';

async function call(name, params = {}) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) {
    console.error(`[parent] ${name}`, error);
    throw new Error(error.message || 'Erreur réseau');
  }
  return data ?? null;
}

// Profil du parent + la liste de ses enfants. C'est la seule RPC qui n'attend
// pas d'élève : elle EST la liste des élèves autorisés, tout le reste en découle.
export const fetchParentContext = () => call('parent_context');

// Synthèse de l'accueil : un appel, tous les enfants.
export const fetchParentDashboard = () => call('parent_dashboard');

export const fetchChildGrades      = (studentId) => call('parent_child_grades', { p_student: studentId });
export const fetchChildBulletins   = (studentId) => call('parent_child_bulletins', { p_student: studentId });
export const fetchChildAttendance  = (studentId) => call('parent_child_attendance', { p_student: studentId });
export const fetchChildFees        = (studentId, year = null) =>
  call('parent_child_fees', { p_student: studentId, p_year: year });
export const fetchChildDocuments   = (studentId) => call('parent_child_documents', { p_student: studentId });
export const fetchParentNotifications = (limit = 50) => call('parent_notifications', { p_limit: limit });

// La SEULE écriture de tout l'espace parent : sa propre fiche de contact.
export const updateParentProfile = (fullName, phone) =>
  call('parent_update_profile', { p_full_name: fullName ?? null, p_phone: phone ?? null });

// ── Aides de présentation ───────────────────────────────────────────────────

export const RELATIONSHIP_LABEL = {
  pere:   ['Père', 'Father', 'Padre'],
  mere:   ['Mère', 'Mother', 'Madre'],
  tuteur: ['Tuteur', 'Guardian', 'Tutor'],
  autre:  ['Responsable', 'Guardian', 'Responsable'],
};

// Secteur lisible d'un enfant, dérivé de sa classe. Aligné sur classSector()
// de src/core/strictMatrix.js — même vocabulaire, pour que le parent et
// l'administration nomment la même chose de la même façon.
export function childSector(child) {
  const section = child?.class?.section || null;
  const cycle   = child?.class?.cycle   || null;
  if (section === 'premier_cycle' || section === 'second_cycle' || cycle === 'secondaire') return 'college';
  if (section === 'primaire'   || cycle === 'primaire')   return 'primaire';
  if (section === 'maternelle' || cycle === 'maternelle') return 'maternelle';
  return null;
}

export const SECTOR_LABEL = {
  maternelle: ['Maternelle', 'Nursery', 'Preescolar'],
  primaire:   ['Primaire', 'Primary', 'Primaria'],
  college:    ['Collège / Lycée', 'Secondary', 'Secundaria'],
};

// Situation financière résumée, à partir de ce que rend parent_child_fees.
// Le calcul lui-même reste celui du moteur tarifaire existant (feeEngine) : on
// n'additionne rien ici, on ne fait que dérouler les champs déjà calculés.
export function feeSummary(feesPayload) {
  const f = feesPayload?.fee;
  if (!f) return { total: 0, paid: 0, balance: 0, pct: 0, hasData: false };
  const total = Number(f.frais_annuels) || 0;
  const paid  = Number(f.frais_payes) || 0;
  const balance = Math.max(0, total - paid);
  return {
    total, paid, balance,
    pct: total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0,
    hasData: true,
  };
}
