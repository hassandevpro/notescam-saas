// SAISIE SUR TÉLÉPHONE — une carte par élève, au lieu d'un tableau à faire défiler.
//
// LE PROBLÈME. Les trois postes de saisie officiels sont des tableaux
// « élèves × colonnes » : 8 domaines en maternelle, jusqu'à 4 critères au
// primaire, plusieurs compétences au collège. Sur un écran de téléphone, la
// colonne du nom est figée et tout le reste défile horizontalement — pour noter
// un élève sur toutes ses colonnes, il faut balayer l'écran autant de fois, en
// perdant de vue à qui l'on attribue la note. C'est l'usage le plus courant dans
// nos écoles, et c'était le plus pénible.
//
// LA FORME RETENUE. Une carte par élève, dépliable. À l'intérieur, une ligne par
// colonne : le libellé entier au-dessus, le champ en dessous. Plus aucun
// défilement horizontal, et le nom de l'élève reste visible pendant toute sa
// saisie. L'en-tête porte la progression (3/8), pour voir d'un coup d'œil qui
// reste à finir.
//
// Le TABLEAU reste la vue de l'ordinateur : il est plus rapide dès qu'on a la
// place. Cette liste ne le remplace que sous `md`.

import { useState } from 'react';
import { useT } from '../../lib/i18n';

export default function MobileEntryList({
  students,
  columns,          // [{ id, code?, label }]
  renderCell,       // (student, column) => ReactNode — le champ de saisie
  isFilled,         // (student, column) => bool — pour la progression
  subtitle,         // (student) => string | null (matricule…)
}) {
  const t = useT();
  // Le premier élève ouvert : on arrive pour saisir, pas pour contempler une
  // liste de noms fermés.
  const [ouverts, setOuverts] = useState(() => new Set(students.slice(0, 1).map((s) => s.id)));

  const bascule = (id) => setOuverts((prev) => {
    const copie = new Set(prev);
    if (copie.has(id)) copie.delete(id); else copie.add(id);
    return copie;
  });

  const toutOuvrir  = () => setOuverts(new Set(students.map((s) => s.id)));
  const toutFermer  = () => setOuverts(new Set());
  const tousOuverts = ouverts.size === students.length && students.length > 0;

  return (
    <div className="md:hidden space-y-2">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={tousOuverts ? toutFermer : toutOuvrir}
          className="text-xs font-medium text-brand-600 hover:text-brand-700 px-2 py-1"
        >
          {tousOuverts ? t('Tout replier', 'Collapse all') : t('Tout déplier', 'Expand all')}
        </button>
      </div>

      {students.map((stu, i) => {
        const ouvert = ouverts.has(stu.id);
        const faits = columns.filter((c) => isFilled?.(stu, c)).length;
        const complet = faits === columns.length && columns.length > 0;
        const sub = subtitle?.(stu);

        return (
          <div key={stu.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => bascule(stu.id)}
              className="w-full flex items-center gap-3 px-3 py-3 text-left active:bg-gray-50"
            >
              <span className="w-6 shrink-0 text-xs text-gray-400 tabular-nums">{i + 1}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-gray-900 text-sm leading-tight">{stu.name}</span>
                {sub && <span className="block text-[11px] text-gray-400 font-mono">{sub}</span>}
              </span>
              <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums ${
                complet ? 'bg-emerald-100 text-emerald-700'
                        : faits > 0 ? 'bg-amber-100 text-amber-700'
                        : 'bg-gray-100 text-gray-400'
              }`}>
                {faits}/{columns.length}
              </span>
              <span className={`shrink-0 text-gray-300 transition-transform ${ouvert ? 'rotate-90' : ''}`}>›</span>
            </button>

            {ouvert && (
              <div className="border-t border-gray-100 divide-y divide-gray-50">
                {columns.map((c) => (
                  <div key={c.id} className="px-3 py-2.5">
                    <div className="flex items-baseline gap-2 mb-1.5">
                      {c.code && <span className="text-[11px] font-bold text-gray-400 shrink-0">{c.code}</span>}
                      {/* Le libellé ENTIER : c'est tout l'intérêt de cette vue.
                          Dans le tableau il est tronqué faute de largeur. */}
                      <span className="text-xs text-gray-600 leading-snug">{c.label}</span>
                    </div>
                    {renderCell(stu, c)}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
