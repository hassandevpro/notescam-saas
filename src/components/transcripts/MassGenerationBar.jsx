// ── Génération de masse (Section 9) ──────────────────────────────────────────
// Produit l'ensemble des documents et les envoie à l'impression (la fenêtre du
// navigateur permet d'enregistrer en PDF), avec estimation, nombre de documents
// et progression temps réel. « Envoyer aux parents » ouvre les liens du portail
// parents (pas d'e-mail backend requis).
//
// IMPRESSION PAR LOTS : au-delà du seuil du socle, le travail est découpé et
// l'utilisateur imprime lot par lot. Chaque lot part sur un clic — c'est aussi
// la seule façon fiable d'ouvrir plusieurs fenêtres sans blocage du navigateur.
export default function MassGenerationBar({
  count, progress, estimateSeconds, canGenerate, canPrint,
  onPrint, onParentLinks, t,
  batches = 1, batchIndex = 0, batched = false,
}) {
  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;
  const busy = !!progress;
  const done = batched && batchIndex >= batches;
  const label = busy
    ? `${t('Génération', 'Generating', 'Generando')} ${progress.done}/${progress.total}…`
    : batched
      ? `🖨 ${t('Imprimer le lot', 'Print batch', 'Imprimir lote')} ${Math.min(batchIndex + 1, batches)}/${batches}`
      : `🖨 ${t('Imprimer', 'Print', 'Imprimir')}`;

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
            {batched && (
              <> · {batches} {t('lots', 'batches', 'lotes')} {t('de', 'of', 'de')} {Math.ceil(count / batches)}</>
            )}
          </p>
          {batched && !busy && (
            <p className="mt-1 text-[12px] text-slate-400">
              {done
                ? t('Tous les lots ont été envoyés à l’impression.', 'All batches have been sent to print.', 'Todos los lotes fueron enviados a imprimir.')
                : t('Volume important : imprimez lot par lot pour garder la main.', 'Large volume: print batch by batch to stay in control.', 'Gran volumen: imprima lote por lote.')}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canPrint && (
            <button type="button" onClick={onPrint} disabled={!canGenerate || busy || done}
              className="btn-primary disabled:opacity-50" style={{ width: 'auto', paddingLeft: '1.25rem', paddingRight: '1.25rem' }}>
              {done ? `✓ ${t('Terminé', 'Done', 'Terminado')}` : label}
            </button>
          )}
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
