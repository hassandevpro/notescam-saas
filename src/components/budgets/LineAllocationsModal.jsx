// Répartition d'une LIGNE (modèle CIBLE v3) : temporelle (% par période) — toujours
// — et sectorielle (% par secteur concerné) si la portée est 'sectors'. L'utilisateur
// saisit les POURCENTAGES, le montant est DÉRIVÉ. Le logiciel ne répartit JAMAIS le
// reste : « X % affectés, Y % restent à répartir ». Le brouillon se sauvegarde même
// incomplet ; l'ACTIVATION (bloquée tant que Σ ≠ 100) se fait depuis la page.
import { useMemo, useState } from 'react';
import Modal from '../Modal';
import { useT } from '../../lib/i18n';
import { useMoney } from '../../lib/useMoney';
import { unitLabel } from './BudgetHierarchyModals';
import { upsertLinePeriod, deleteLinePeriod, upsertLineSector, deleteLineSector } from '../../lib/budgetLineService';
import { financeRemoteMode, emitBudgetIntent } from '../../lib/budgetRemote';
import { toast } from '../../store/toastStore';

const pctInput = 'w-24 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:ring-2 focus:ring-indigo-500 outline-none';
const amt = (base, pct) => Math.round(((Number(base) || 0) * (Number(pct) || 0)) / 100);

export default function LineAllocationsModal({ line, schoolId, periods = [], units = [], linePeriods = [], lineSectors = [], onChange, onClose }) {
  const t = useT();
  const money = useMoney();
  const planned = Number(line?.planned_amount) || 0;
  const isSectors = line?.scope === 'sectors';

  const existingP = useMemo(() => new Map(linePeriods.filter((a) => a.budget_chapter_id === line.id).map((a) => [a.budget_period_id, a])), [linePeriods, line.id]);
  const existingS = useMemo(() => new Map(lineSectors.filter((a) => a.budget_chapter_id === line.id).map((a) => [a.school_unit_id, a])), [lineSectors, line.id]);

  const [pPct, setPPct] = useState(() => Object.fromEntries(periods.map((p) => [p.id, existingP.get(p.id)?.pct ?? ''])));
  const [sOn, setSOn] = useState(() => Object.fromEntries(units.map((u) => [u.id, existingS.has(u.id)])));
  const [sPct, setSPct] = useState(() => Object.fromEntries(units.map((u) => [u.id, existingS.get(u.id)?.pct ?? ''])));
  const [saving, setSaving] = useState(false);

  const sumP = periods.reduce((s, p) => s + (Number(pPct[p.id]) || 0), 0);
  const sumS = units.reduce((s, u) => s + (sOn[u.id] ? (Number(sPct[u.id]) || 0) : 0), 0);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // H3b-4 — gouvernance distante : UNE intention 'allocate' (le LAN applique). On
      // envoie les allocations non nulles ; le retrait d'une allocation se fait au LAN.
      if (await financeRemoteMode(schoolId)) {
        const periodsData = periods.filter((p) => (Number(pPct[p.id]) || 0) > 0)
          .map((p) => ({ budget_period_id: p.id, pct: Number(pPct[p.id]) || 0, amount: amt(planned, pPct[p.id]) }));
        const sectorsData = isSectors ? units.filter((u) => sOn[u.id] && (Number(sPct[u.id]) || 0) > 0)
          .map((u) => ({ school_unit_id: u.id, pct: Number(sPct[u.id]) || 0, amount: amt(planned, sPct[u.id]) })) : [];
        const { error } = await emitBudgetIntent({
          schoolId, op: 'allocate', target: 'allocation', aggregateId: line.id,
          expectedVersion: line.version ?? null, data: { periods: periodsData, sectors: sectorsData },
        });
        if (error) throw error;
        toast.success(t('Demande envoyée · en attente d’application par le serveur de l’école', 'Request sent · awaiting the school server', 'Solicitud enviada · esperando el servidor'));
        onChange?.(); onClose();
        return;
      }
      // — Périodes — upsert (pct>0) / delete (0 ou vide) —
      for (const p of periods) {
        const val = Number(pPct[p.id]) || 0;
        const ex = existingP.get(p.id);
        if (val > 0) {
          const { error } = await upsertLinePeriod({ id: ex?.id, school_id: schoolId, budget_chapter_id: line.id, budget_period_id: p.id, pct: val, amount: amt(planned, val) });
          if (error) throw error;
        } else if (ex) {
          const { error } = await deleteLinePeriod(ex.id);
          if (error) throw error;
        }
      }
      // — Secteurs (portée 'sectors' uniquement) —
      if (isSectors) {
        for (const u of units) {
          const on = sOn[u.id];
          const val = Number(sPct[u.id]) || 0;
          const ex = existingS.get(u.id);
          if (on && val > 0) {
            const { error } = await upsertLineSector({ id: ex?.id, school_id: schoolId, budget_chapter_id: line.id, school_unit_id: u.id, pct: val, amount: amt(planned, val) });
            if (error) throw error;
          } else if (ex) {
            const { error } = await deleteLineSector(ex.id);
            if (error) throw error;
          }
        }
      }
      toast.success(t('Répartition enregistrée', 'Breakdown saved', 'Reparto guardado'));
      onChange?.();
      onClose();
    } catch (e) {
      toast.error(e?.message || t('Échec de l’enregistrement', 'Save failed', 'Error al guardar'));
    } finally {
      setSaving(false);
    }
  };

  const SumBadge = ({ sum }) => {
    const complete = Math.abs(sum - 100) <= 0.01;
    const over = sum > 100.01;
    return (
      <span className={`text-xs font-semibold ${complete ? 'text-emerald-600' : over ? 'text-rose-600' : 'text-amber-600'}`}>
        {sum}% {complete ? '✓' : over ? '— ' + t('dépassé', 'over', 'excedido') : '— ' + t(`${100 - sum}% à répartir`, `${100 - sum}% left`, `${100 - sum}% restante`)}
      </span>
    );
  };

  return (
    <Modal title={`${t('Répartir', 'Break down', 'Repartir')} · ${line.label}`} onClose={onClose} size="lg">
      <div className="space-y-5">
        <div className="text-sm text-gray-500">
          {t('Montant annuel', 'Annual amount', 'Monto anual')} : <b className="text-gray-800">{money(planned)}</b>
        </div>

        {/* Répartition temporelle */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-gray-800">{t('Répartition par période', 'Breakdown by period', 'Reparto por período')}</h3>
            <SumBadge sum={sumP} />
          </div>
          {periods.length === 0 ? (
            <p className="text-xs text-amber-600">{t('Configurez d’abord les périodes de l’année.', 'Configure the year’s periods first.', 'Configure primero los períodos.')}</p>
          ) : (
            <div className="space-y-1.5">
              {periods.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="flex-1 text-sm text-gray-700 truncate">{p.name}</span>
                  <span className="text-xs text-gray-400 tabular-nums w-28 text-right">{money(amt(planned, pPct[p.id]))}</span>
                  <input className={pctInput} type="number" min="0" max="100" step="0.01" value={pPct[p.id]}
                    onChange={(e) => setPPct((m) => ({ ...m, [p.id]: e.target.value }))} placeholder="0" />
                  <span className="text-sm text-gray-400">%</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Répartition sectorielle (portée 'sectors') */}
        {isSectors && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-gray-800">{t('Répartition par secteur concerné', 'Breakdown by concerned sector', 'Reparto por sector')}</h3>
              <SumBadge sum={sumS} />
            </div>
            {units.length === 0 ? (
              <p className="text-xs text-amber-600">{t('Aucune unité configurée (Paramètres → unités).', 'No unit configured (Settings → units).', 'Sin unidades.')}</p>
            ) : (
              <div className="space-y-1.5">
                {units.map((u) => (
                  <div key={u.id} className="flex items-center gap-3">
                    <label className="flex-1 flex items-center gap-2 text-sm text-gray-700 min-w-0">
                      <input type="checkbox" checked={!!sOn[u.id]} onChange={(e) => setSOn((m) => ({ ...m, [u.id]: e.target.checked }))} />
                      <span className="truncate">{unitLabel(t, u)}</span>
                    </label>
                    <span className="text-xs text-gray-400 tabular-nums w-28 text-right">{sOn[u.id] ? money(amt(planned, sPct[u.id])) : '—'}</span>
                    <input className={`${pctInput} disabled:opacity-40`} type="number" min="0" max="100" step="0.01" disabled={!sOn[u.id]}
                      value={sPct[u.id]} onChange={(e) => setSPct((m) => ({ ...m, [u.id]: e.target.value }))} placeholder="0" />
                    <span className="text-sm text-gray-400">%</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-2">{t('Ne cochez que les secteurs réellement concernés. Le logiciel ne répartit jamais le reste automatiquement.', 'Only check the concerned sectors. The software never auto-distributes the remainder.', 'Marque solo los sectores concernidos.')}</p>
          </section>
        )}

        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t('Fermer', 'Close', 'Cerrar')}</button>
          <button type="button" onClick={save} disabled={saving} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? t('Enregistrement…', 'Saving…', 'Guardando…') : t('Enregistrer la répartition', 'Save breakdown', 'Guardar reparto')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
