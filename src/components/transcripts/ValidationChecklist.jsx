// ── Checklist de validation automatique (Section 6) ──────────────────────────
// Avant d'autoriser la génération, on coche visuellement les pré-requis. Toute
// condition non remplie est rouge → l'utilisateur sait exactement quoi corriger.
export default function ValidationChecklist({ items, t }) {
  const ready = items.every((i) => i.ok);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">{t('Validation', 'Validation', 'Validación')}</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${ready ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {ready ? t('Prêt à générer', 'Ready to generate', 'Listo') : t('Conditions manquantes', 'Missing conditions', 'Faltan condiciones')}
        </span>
      </div>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-2 text-[13px]">
            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${it.ok ? 'bg-emerald-500' : 'bg-red-500'}`}>
              {it.ok ? '✓' : '✗'}
            </span>
            <span className={it.ok ? 'text-slate-600' : 'text-red-600 font-medium'}>{t(...it.label)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
