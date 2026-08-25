// BLOC « accès rapide ».
//
// Les raccourcis sont DÉRIVÉS de la navigation (config/navigation.js), pas d'une
// liste écrite à la main : ce qui apparaît ici est donc exactement ce que la
// personne peut ouvrir — rôle de base, capacités déléguées et rôles de gouvernance
// compris. Une entrée de menu ajoutée ailleurs devient éligible ici sans retouche,
// et aucun raccourci ne peut pointer vers une page fermée.

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useT } from '../../lib/i18n';
import { usePlan } from '../../lib/plan';
import { getNavGroups } from '../../config/navigation';
import { useStrictMatrix } from '../../lib/useStrictMatrix';
import { ICONS } from '../nav/icons';

// Ordre de préférence des raccourcis PAR DOMAINE : ce qu'on veut sous la main en
// premier. Les routes absentes du menu de la personne sont ignorées.
const PREFERRED = {
  school:     ['/app/grades', '/app/bulletins', '/app/students', '/app/fees', '/app/reports', '/app/classes'],
  academics:  ['/app/grades', '/app/bulletins', '/app/conseil', '/app/reports', '/app/students', '/app/palmares'],
  discipline: ['/app/retards', '/app/incidents', '/app/sanctions', '/app/convocations', '/app/absences', '/app/sorties'],
  finance:    ['/app/depenses', '/app/budgets', '/app/budget-global', '/app/approbations', '/app/reports', '/app/groupe'],
  cash:       ['/app/depenses', '/app/notifications', '/app/signalements'],
  teaching:   ['/app/grades', '/app/bulletins', '/app/conseil', '/app/absences', '/app/settings'],
};

export default function QuickAccess({ domain, max = 6 }) {
  const t = useT();
  const role = useAuthStore((s) => s.role);
  const permissions = useAuthStore((s) => s.permissions);
  const governanceCatalog = useAuthStore((s) => s.governanceCatalog);
  const governanceAssignments = useAuthStore((s) => s.governanceAssignments);
  const { f } = usePlan();
  const { ctx: strictCtx } = useStrictMatrix();

  const items = useMemo(() => {
    const gov = { catalog: governanceCatalog, assignments: governanceAssignments };
    const flat = getNavGroups(role, f, permissions, gov, strictCtx)
      .flatMap((g) => g.items)
      .filter((it) => it.to !== '/app' && !it.locked);   // ni l'accueil, ni un module verrouillé par le plan
    const byRoute = new Map(flat.map((it) => [it.to, it]));

    const picked = [];
    for (const route of PREFERRED[domain] || []) {
      const it = byRoute.get(route);
      if (it) picked.push(it);
      if (picked.length >= max) break;
    }
    // Complément : les premières entrées disponibles, pour ne jamais afficher
    // une grille vide à un profil inattendu (compte délégué très restreint).
    for (const it of flat) {
      if (picked.length >= max) break;
      if (!picked.some((p) => p.to === it.to)) picked.push(it);
    }
    return picked;
  }, [role, f, permissions, governanceCatalog, governanceAssignments, domain, max, strictCtx]);

  if (items.length === 0) return null;

  return (
    <div>
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        {t('Accès rapide', 'Quick access', 'Acceso rápido')}
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {items.map((it) => (
          <Link
            key={it.to}
            to={it.to}
            className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:border-brand-300 hover:shadow-md transition-all group"
          >
            <span className="inline-flex w-9 h-9 rounded-lg bg-brand-50 text-brand-600 items-center justify-center mb-2">
              <span className="w-[18px] h-[18px]">{ICONS[it.icon] || null}</span>
            </span>
            <div className="font-semibold text-gray-800 text-sm group-hover:text-brand-700">{t(...it.label)}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
