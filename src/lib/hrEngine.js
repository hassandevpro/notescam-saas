// Moteur PUR du module Ressources Humaines (aucune dépendance : testable Node).
//
// Le RH s'articule autour du DOSSIER PERSONNEL existant (table `staff`, module
// Personnel) via des entités satellites : contrats, congés, évaluations,
// présences, historique professionnel. AUCUNE paie ici (déférée).

// ── Énumérations (extensibles) ────────────────────────────────────────────────
export const HR_CONTRACT_TYPES    = ['cdi', 'cdd', 'stage', 'vacation', 'prestation'];
export const HR_CONTRACT_STATUSES = ['active', 'suspended', 'ended'];
export const HR_LEAVE_TYPES       = ['annuel', 'maladie', 'maternite', 'paternite', 'exceptionnel', 'sans_solde'];
export const HR_LEAVE_STATUSES    = ['pending', 'approved', 'refused'];
export const HR_ATTENDANCE_STATUSES = ['present', 'absent', 'retard', 'conge', 'mission'];
export const HR_CAREER_TYPES      = ['recrutement', 'promotion', 'mutation', 'formation', 'sanction', 'distinction', 'changement_poste', 'autre'];
export const HR_EVAL_STATUSES     = ['draft', 'final'];

// Nombre de jours ENTRE deux dates ISO (bornes incluses). 0 si invalide/incohérent.
export function computeLeaveDays(startISO, endISO) {
  if (!startISO || !endISO) return 0;
  const s = new Date(startISO), e = new Date(endISO);
  if (isNaN(s) || isNaN(e) || e < s) return 0;
  const ms = Date.UTC(e.getFullYear(), e.getMonth(), e.getDate()) - Date.UTC(s.getFullYear(), s.getMonth(), s.getDate());
  return Math.floor(ms / 86400000) + 1;
}

// Un contrat est-il actif à une date donnée ? (statut + fenêtre de dates)
export function isContractActive(contract, todayISO = new Date().toISOString().slice(0, 10)) {
  if (!contract || contract.status === 'ended') return false;
  if (contract.status === 'suspended') return false;
  const start = contract.start_date || null;
  const end = contract.end_date || null;
  if (start && start > todayISO) return false;
  if (end && end < todayISO) return false;
  return true;
}

// Contrat courant d'un agent : le contrat actif le plus récent, sinon le dernier.
export function currentContract(contracts = [], todayISO) {
  const byStart = [...contracts].sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')));
  return byStart.find((c) => isContractActive(c, todayISO)) || byStart[0] || null;
}

// Solde de congés d'un type pour une année : dotation − jours approuvés.
// `year` = 'YYYY' comparé au préfixe de start_date.
export function leaveBalance(entitlementDays, leaves = [], year, type = 'annuel') {
  const used = leaves
    .filter((l) => l.type === type && l.status === 'approved' && (!year || String(l.start_date || '').startsWith(String(year))))
    .reduce((s, l) => s + (Number(l.days) || computeLeaveDays(l.start_date, l.end_date)), 0);
  return { entitlement: Number(entitlementDays) || 0, used, remaining: (Number(entitlementDays) || 0) - used };
}

// Synthèse de présence sur une liste d'enregistrements.
export function attendanceSummary(records = []) {
  const out = { present: 0, absent: 0, retard: 0, conge: 0, mission: 0, total: records.length };
  for (const r of records) if (out[r.status] != null) out[r.status] += 1;
  const worked = out.present + out.retard + out.mission; // jours « au travail »
  out.presenceRate = out.total > 0 ? Math.round((worked / out.total) * 100) : 0;
  return out;
}

// Moyenne des scores d'évaluation (ignore les non numériques).
export function evaluationAverage(evals = []) {
  const scores = evals.map((e) => Number(e.score)).filter((n) => Number.isFinite(n));
  if (!scores.length) return null;
  return Math.round((scores.reduce((s, n) => s + n, 0) / scores.length) * 10) / 10;
}
