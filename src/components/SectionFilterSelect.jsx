import { useMemo } from 'react';
import { useT } from '../lib/i18n';
import { SECTIONS, classSectionKey } from '../core/engineResolver';

// Sélecteur de SECTION pédagogique pour FILTRER une liste de classes (maternelle /
// primaire / 1er cycle / 2nd cycle). À placer devant un sélecteur/filtre de classe :
// choisir une section raccourcit la liste des classes. Contrôlé par la page
// (value/onChange). N'apparaît que si l'établissement a au moins 2 sections.
export default function SectionFilterSelect({ classes, value, onChange, className, style, allLabel, label, wrapClassName }) {
  const t = useT();
  const available = useMemo(() => {
    const present = new Set((classes || []).map(classSectionKey));
    return SECTIONS.filter((s) => present.has(s.key));
  }, [classes]);

  if (available.length <= 1) return null;

  const select = (
    <select
      className={className || 'form-input'}
      style={style}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{allLabel || t('Toutes les sections', 'All sections', 'Todas las secciones')}</option>
      {available.map((s) => <option key={s.key} value={s.key}>{t(s.fr, s.en, s.es)}</option>)}
    </select>
  );

  // Variante « cellule étiquetée » (grilles de filtres) : tout le bloc disparaît
  // si l'établissement n'a qu'une section (available.length <= 1 → null plus haut).
  if (label) {
    return (
      <div className={wrapClassName}>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
        {select}
      </div>
    );
  }
  return select;
}

// Prédicat pratique : la classe `c` appartient-elle à la section `key` (ou pas de filtre).
export const inSection = (c, key) => !key || classSectionKey(c) === key;
