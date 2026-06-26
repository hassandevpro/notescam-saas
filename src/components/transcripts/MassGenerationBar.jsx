// ── Génération de masse (Section 9) ──────────────────────────────────────────
// Produit l'ensemble des relevés (1 PDF combiné multi-pages), avec estimation,
// nombre de documents et progression temps réel. « Envoyer aux parents » ouvre
// les liens du portail parents (pas d'e-mail backend requis).
export default function MassGenerationBar({
  count, progress, estimateSeconds, canGenerate, canPrint,
  onDownload, onPrint, onParentLinks, t,
}) {
  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;
  const busy = !!progress;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-800">{t('Génération de masse', 'Batch generation', 'Generación masiva')}</p>
          <p className="text-[12px] text-slate-500">
            {count} {t('document(s)', 'document(s)', 'documento(s)')}
            {count > 0 && estimateSeconds != null && (
              <> · {t('temps estimé', 'estimated time', 'tiempo estimado')} ≈ {estimateSeconds}s</>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canPrint && (
            <button type="button" onClick={onPrint} disabled={!canGenerate || busy}
              className="btn-secondary disabled:opacity-50" style={{ width: 'auto' }}>
              🖨 {t('Imprimer', 'Print', 'Imprimir')}
            </button>
          )}
          <button type="button" onClick={onDownload} disabled={!canGenerate || busy}
            className="btn-primary disabled:opacity-50" style={{ width: 'auto', paddingLeft: '1.25rem', paddingRight: '1.25rem' }}>
            {busy ? `${t('Génération', 'Generating', 'Generando')} ${progress.done}/${progress.total}…` : `📄 ${t('Télécharger tout', 'Download all', 'Descargar todo')}`}
          </button>
          <button type="button" onClick={onParentLinks} disabled={!canGenerate || busy}
            className="btn-secondary disabled:opacity-50" style={{ width: 'auto' }}>
            👪 {t('Envoyer aux parents', 'Send to parents', 'Enviar a padres')}
          </button>
        </div>
      </div>

      {busy && (
        <div className="mt-3">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-right text-[11px] font-semibold text-slate-500">{pct}%</p>
        </div>
      )}
    </div>
  );
}
