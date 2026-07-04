import { useMemo } from 'react';
import { useT } from '../../lib/i18n';
import { SECTIONS, classSectionKey } from '../../core/engineResolver';

// Sélecteur de SECTION pédagogique (maternelle / primaire / 1er cycle / 2nd cycle).
// Les postes de saisie fondamentale ne listent que LEUR section ; sans ce sélecteur
// on ne peut plus en sortir. Choisir une autre section sélectionne sa 1re classe :
// l'aiguillage de la page Grades rend alors le poste adapté.
//
// N'apparaît que si l'établissement a au moins deux sections (sinon inutile).
export default function SectionSelect({ classes, classId, setClassId, className }) {
  const t = useT();
  const available = useMemo(() => {
    const present = new Set(classes.map(classSectionKey));
    return SECTIONS.filter((s) => present.has(s.key));
  }, [classes]);

  // Établissement mono-section : rien à choisir, on n'affiche pas le sélecteur.
  if (available.length <= 1) return null;

  const current = classSectionKey(classes.find((c) => c.id === classId) || null);
  const pick = (key) => {
    const first = classes.find((c) => classSectionKey(c) === key);
    if (first) setClassId(first.id);
  };

  return (
    <label className="text-sm">
      <span className="block text-gray-500 mb-1">{t('Section', 'Section')}</span>
      <select
        value={current}
        onChange={(e) => pick(e.target.value)}
        className={className || 'rounded-lg border border-gray-200 px-3 py-2 text-sm'}
      >
        {available.map((s) => <option key={s.key} value={s.key}>{t(s.fr, s.en, s.es)}</option>)}
      </select>
    </label>
  );
}
