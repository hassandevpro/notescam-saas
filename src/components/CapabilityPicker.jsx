import { useT } from '../lib/i18n';
import { CAP_GROUPS } from '../config/capabilities';

// Sélecteur GRANULAIRE de capacités (pages autorisées), groupées par module.
// `value` = Set de chemins ; `onToggle(to)` bascule une capacité ; `onToggleGroup(group, on)`.
export default function CapabilityPicker({ value, onToggle, onToggleGroup }) {
  const t = useT();
  return (
    <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
      {CAP_GROUPS.map((group) => {
        const all = group.caps.every((c) => value.has(c.to));
        return (
          <div key={group.module[0]} className="p-2">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-600 mb-1">
              <input type="checkbox" checked={all} onChange={(e) => onToggleGroup(group, e.target.checked)} className="w-3.5 h-3.5" />
              {t(...group.module)}
            </label>
            <div className="grid grid-cols-2 gap-1 pl-5">
              {group.caps.map((c) => (
                <label key={c.to} className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={value.has(c.to)} onChange={() => onToggle(c.to)} className="w-3.5 h-3.5" />
                  {t(...c.label)}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
