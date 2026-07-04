// Hook pratique : renvoie un formateur lié à la devise de l'établissement.
// Usage : const money = useMoney();  …  {money(250000)} → "250 000 XAF"
// Garantit que TOUT composant financier affiche la devise de l'école sans
// dupliquer la logique de formatage.
import { useAuthStore } from '../store/authStore';
import { formatMoney, formatAmount, currencyCode } from './currency';

export function useMoney() {
  const school = useAuthStore((s) => s.school);
  const code = currencyCode(school);
  const money = (n) => formatMoney(n, code);
  money.amount = (n) => formatAmount(n, code);   // nombre seul (sans symbole)
  money.code = code;
  return money;
}
