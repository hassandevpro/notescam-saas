import { useAuthStore } from '../store/authStore';
import { IS_LAN } from './edition';

export const PLAN_META = {
  starter: { label: 'Starter',  price: 'Gratuit' },
  ecole:   { label: 'École',    price: '8 500 FCFA/mois' },
  pro:     { label: 'Pro',      price: '15 000 FCFA/mois' },
  reseau:  { label: 'Réseau',   price: 'Sur devis' },
};

// Toutes les fonctionnalités débloquées (équivalent plan « Réseau »).
const FULL_FEATURES = {
  maxClasses:      Infinity,
  maxStudents:     Infinity,
  watermark:       false,
  hasFees:         true,
  hasTeachers:     true,
  hasAbsences:     true,
  hasTimetable:    true,
  hasParentPortal: true,
};

export function getPlanFeatures(plan) {
  // Édition LAN (.exe) : produit complet vendu sous licence. L'accès est déjà
  // verrouillé par l'activation hors-ligne (LanLicenseGate) ; une fois l'app
  // ouverte, AUCUNE limite « version d'essai » / Starter ne s'applique — tout
  // est accessible.
  if (IS_LAN) return { ...FULL_FEATURES };
  const p = plan ?? 'starter';
  const isEcoleOrMore = p === 'ecole' || p === 'pro' || p === 'reseau';
  const isProOrMore   = p === 'pro'   || p === 'reseau';
  return {
    maxClasses:      p === 'starter' ? 1 : Infinity,
    maxStudents:     p === 'starter' ? 30 : Infinity,
    watermark:       p === 'starter',
    hasFees:         isEcoleOrMore,
    hasTeachers:     isEcoleOrMore,
    hasAbsences:     isEcoleOrMore,
    hasTimetable:    isProOrMore,
    hasParentPortal: isProOrMore,
  };
}

export function usePlan() {
  const school = useAuthStore((s) => s.school);
  let plan = school?.plan ?? 'starter';
  // LAN (.exe) : pas de palier « Starter » / version d'essai. Le plan effectif
  // est au minimum « Pro » pour que toutes les vérifications `plan === 'starter'`
  // disséminées dans l'app considèrent l'installation comme complète.
  if (IS_LAN && (!plan || plan === 'starter')) plan = 'pro';
  return { plan, meta: PLAN_META[plan] ?? PLAN_META.starter, f: getPlanFeatures(plan) };
}

export const STARTER_DAILY_PRINT_LIMIT = 2;
const PRINT_STORAGE_KEY = 'nc_print_daily';

export function getDailyPrintInfo() {
  const today = new Date().toISOString().split('T')[0];
  try {
    const raw = localStorage.getItem(PRINT_STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.date === today) return { date: today, count: data.count || 0 };
    }
  } catch {}
  return { date: today, count: 0 };
}

export function incrementDailyPrint() {
  const info = getDailyPrintInfo();
  const updated = { date: info.date, count: info.count + 1 };
  localStorage.setItem(PRINT_STORAGE_KEY, JSON.stringify(updated));
  return updated.count;
}

export function getStarterPrintRemaining(plan) {
  if (plan !== 'starter') return Infinity;
  const info = getDailyPrintInfo();
  return Math.max(0, STARTER_DAILY_PRINT_LIMIT - info.count);
}
