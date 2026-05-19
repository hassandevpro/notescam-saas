import { useAuthStore } from '../store/authStore';

export const PLAN_META = {
  starter: { label: 'Starter',  price: 'Gratuit' },
  ecole:   { label: 'École',    price: '8 500 FCFA/mois' },
  pro:     { label: 'Pro',      price: '15 000 FCFA/mois' },
  reseau:  { label: 'Réseau',   price: 'Sur devis' },
};

export function getPlanFeatures(plan) {
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
  const plan   = school?.plan ?? 'starter';
  return { plan, meta: PLAN_META[plan] ?? PLAN_META.starter, f: getPlanFeatures(plan) };
}
