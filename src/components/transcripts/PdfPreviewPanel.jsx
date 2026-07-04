// ── Prévisualisation PDF temps réel (Section 8) ──────────────────────────────
// Disposition desktop : paramètres à gauche, document à droite. L'aperçu est le
// MÊME HTML A4 que l'impression et le PDF (zéro divergence), régénéré dès qu'un
// paramètre change.
function Field({ label, value }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-[13px]">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-slate-800 text-right truncate">{value || '—'}</span>
    </div>
  );
}

export default function PdfPreviewPanel({ left = {}, includes = [], building, sheets = [], blockedNode, multiCount, t }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
      {/* Colonne paramètres */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-bold text-slate-800">{t('Paramètres', 'Parameters', 'Parámetros')}</h3>
          <div className="divide-y divide-slate-50">
            <Field label={t('Établissement', 'School', 'Centro')} value={left.schoolName} />
            <Field label={t('Classe', 'Class', 'Clase')} value={left.className} />
            <Field label={t('Élève', 'Student', 'Alumno')} value={left.studentName} />
            <Field label={t('Année', 'Year', 'Año')} value={left.year} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-bold text-slate-800">{t('Contenu du document', 'Document content', 'Contenido')}</h3>
          <ul className="space-y-1">
            {includes.map((it) => (
              <li key={it.id} className="flex items-center gap-2 text-[12px]">
                <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] text-white ${it.ok ? 'bg-emerald-500' : 'bg-slate-300'}`}>{it.ok ? '✓' : ''}</span>
                <span className={it.ok ? 'text-slate-600' : 'text-slate-400'}>{it.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Colonne aperçu */}
      <div className="min-h-[360px] rounded-2xl border border-slate-200 bg-slate-100 p-4">
        {building ? (
          <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-slate-400 animate-pulse">
            {t('Génération de l’aperçu…', 'Generating preview…', 'Generando vista…')}
          </div>
        ) : sheets.length ? (
          <>
            {multiCount > 1 && (
              <p className="mb-3 text-center text-xs text-slate-500">
                {t('Aperçu du 1er relevé', 'Preview of 1st transcript', 'Vista del 1º')} · {multiCount} {t('au total', 'total', 'en total')}
              </p>
            )}
            <div className="flex justify-center overflow-auto">
              <div style={{ transform: 'scale(0.92)', transformOrigin: 'top center' }}
                   dangerouslySetInnerHTML={{ __html: sheets[0] }} />
            </div>
          </>
        ) : blockedNode ? (
          <div className="flex h-full min-h-[320px] items-center justify-center">
            <div className="w-full max-w-md">{blockedNode}</div>
          </div>
        ) : (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center">
            <div className="mb-3 text-4xl">📜</div>
            <p className="text-sm font-medium text-slate-500">
              {t('Choisissez une cible — l’aperçu se génère automatiquement.', 'Pick a target — preview generates automatically.', 'Elija un objetivo.')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
