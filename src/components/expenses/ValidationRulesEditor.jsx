import { useState } from 'react';
import Modal from '../Modal';
import { useT } from '../../lib/i18n';
import { useAuthStore } from '../../store/authStore';
import { useMoney } from '../../lib/useMoney';
import { getTiers } from '../../governance/validationEngine';
import { GOVERNANCE_ROLES } from '../../governance/roles';

// Éditeur du barème de validation (seuils -> rôle) PAR ÉTABLISSEMENT.
// Persisté dans schools.validation_rules (JSON). Aucun montant figé : la
// direction règle librement les paliers ; le dernier palier est « au-delà » (∞).
export default function ValidationRulesEditor({ onClose }) {
  const t = useT();
  const money = useMoney();
  const school = useAuthStore((s) => s.school);
  const updateSchool = useAuthStore((s) => s.updateSchool);

  // Charge le barème courant (ou le défaut du moteur), en garantissant un dernier
  // palier sans limite.
  const initial = getTiers(school?.validation_rules, 'expense');
  const withInfinity = initial.some((x) => x.under == null)
    ? initial
    : [...initial, { under: null, role: 'fondatrice' }];
  const [tiers, setTiers] = useState(withInfinity);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const setRole = (i, role) => setTiers((ts) => ts.map((x, k) => (k === i ? { ...x, role } : x)));
  const setUnder = (i, v) => setTiers((ts) => ts.map((x, k) => (k === i ? { ...x, under: v === '' ? '' : Number(v) } : x)));
  const removeTier = (i) => setTiers((ts) => ts.filter((_, k) => k !== i));
  const addTier = () => setTiers((ts) => {
    const last = ts[ts.length - 1];               // garde ∞ en dernier
    const prev = ts.length >= 2 ? ts[ts.length - 2].under : 0;
    return [...ts.slice(0, -1), { under: Number(prev || 0) + 25000, role: 'raf' }, last];
  });

  const save = async () => {
    // Validation : seuils finis strictement croissants ; dernier = ∞.
    const finite = tiers.filter((x) => x.under !== null);
    for (const x of finite) {
      if (x.under === '' || !Number.isFinite(Number(x.under)) || Number(x.under) <= 0) {
        setErr(t('Chaque seuil doit être un montant positif.', 'Each threshold must be a positive amount.', 'Cada umbral debe ser un importe positivo.'));
        return;
      }
    }
    const sorted = [...finite].sort((a, b) => a.under - b.under);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].under === sorted[i - 1].under) {
        setErr(t('Les seuils doivent être distincts.', 'Thresholds must be distinct.', 'Los umbrales deben ser distintos.'));
        return;
      }
    }
    const clean = [...sorted.map((x) => ({ under: Number(x.under), role: x.role })),
      { under: null, role: tiers[tiers.length - 1].role }];
    setSaving(true);
    const { error } = await updateSchool({ validation_rules: JSON.stringify({ expense: clean }) });
    setSaving(false);
    if (error) { setErr(error); return; }
    onClose();
  };

  const field = 'border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none';

  return (
    <Modal title={t('Seuils de validation', 'Validation thresholds', 'Umbrales de validación')} onClose={onClose} size="lg">
      <p className="text-xs text-gray-500 mb-4">
        {t('Le rôle validateur requis dépend du montant. Ces seuils sont propres à votre établissement.',
           'The required approver depends on the amount. These thresholds are specific to your school.',
           'El validador requerido depende del importe. Estos umbrales son propios de su centro.')}
      </p>

      <div className="space-y-2">
        {tiers.map((tier, i) => {
          const isLast = tier.under == null;
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-24 shrink-0">
                {isLast ? t('Au-delà', 'Above', 'Por encima') : t('Jusqu’à <', 'Under', 'Hasta <')}
              </span>
              {isLast ? (
                <span className="text-sm text-gray-400 flex-1">∞</span>
              ) : (
                <input className={`${field} flex-1`} type="number" min="1" step="1"
                  value={tier.under} onChange={(e) => setUnder(i, e.target.value)} />
              )}
              <span className="text-gray-400">→</span>
              <select className={`${field} w-56`} value={tier.role} onChange={(e) => setRole(i, e.target.value)}>
                {GOVERNANCE_ROLES.map((r) => (
                  <option key={r.id} value={r.id}>{t(...r.label)}</option>
                ))}
              </select>
              {!isLast ? (
                <button type="button" onClick={() => removeTier(i)}
                  className="text-rose-400 hover:text-rose-600 text-sm px-1" title={t('Retirer', 'Remove', 'Quitar')}>✕</button>
              ) : <span className="w-5" />}
            </div>
          );
        })}
      </div>

      <button type="button" onClick={addTier}
        className="mt-3 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
        + {t('Ajouter un palier', 'Add a tier', 'Añadir un tramo')}
      </button>

      {err && <p className="text-xs text-rose-600 mt-3">{err}</p>}

      <div className="flex justify-end gap-2 pt-5 mt-4 border-t border-gray-100">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
          {t('Annuler', 'Cancel', 'Cancelar')}
        </button>
        <button type="button" onClick={save} disabled={saving}
          className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {saving ? t('Enregistrement…', 'Saving…', 'Guardando…') : t('Enregistrer', 'Save', 'Guardar')}
        </button>
      </div>
    </Modal>
  );
}
