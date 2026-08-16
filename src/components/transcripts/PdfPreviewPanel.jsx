// ── Prévisualisation d'impression (Section 8) ────────────────────────────────
// L'aperçu est le MÊME HTML que l'impression — mais ce n'est pas suffisant pour
// qu'il soit fidèle : il faut aussi la même GÉOMÉTRIE. Ce panneau reproduit donc
// la page réelle du profil (A4 portrait ou paysage), sa marge, et découpe le
// document aux mêmes hauteurs de page que le navigateur à l'impression.
//
// Trois exigences tenues ici :
//   1. Ratio et marges exacts — la feuille est posée dans un cadre de la taille
//      réelle de la page, avec la marge @page matérialisée.
//   2. Nombre de pages réel — mesuré (hauteur du contenu ÷ hauteur utile), pas
//      supposé. C'est le nombre de feuilles qui sortiront de l'imprimante.
//   3. Aucune bande blanche — la réduction se fait au `zoom` (qui réduit la
//      place occupée) et non au `transform: scale` (qui laisse un trou de la
//      taille d'origine sous le document).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { pageMetrics, measureDocument } from '../../lib/print';

function Field({ label, value }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-[13px]">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-slate-800 text-right truncate">{value || '—'}</span>
    </div>
  );
}

export default function PdfPreviewPanel({
  left = {}, includes = [], building, sheets = [], blockedNode, multiCount,
  profile = 'standard', maxZoom = 1, previewLabel, t,
}) {
  const m = pageMetrics(profile);
  const frameRef = useRef(null);
  const [zoom, setZoom] = useState(0.5);
  const [info, setInfo] = useState({ pages: 1, heightPx: 0, overflowX: 0 });

  // Zoom = ce qu'il faut pour que la page entière tienne dans la colonne.
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const fit = () => {
      const w = el.clientWidth;
      if (w > 0) setZoom(Math.min(maxZoom, w / m.pageWpx));
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [m.pageWpx, maxZoom]);

  // Mesure réelle du document à la géométrie d'impression.
  useEffect(() => {
    if (!sheets.length) { setInfo({ pages: 1, heightPx: 0, overflowX: 0 }); return; }
    setInfo(measureDocument(sheets[0], profile));
  }, [sheets, profile]);

  const pageCount = info.pages;
  const totalPages = multiCount > 1 ? pageCount * multiCount : pageCount;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
      {/* Colonne paramètres */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-bold text-slate-800">{t('Paramètres', 'Parameters', 'Parámetros')}</h3>
          <div className="divide-y divide-slate-50">
            <Field label={t('Établissement', 'School', 'Centro')} value={left.schoolName} />
            <Field label={t('Classe', 'Class', 'Clase')} value={left.className} />
            <Field label={left.itemLabel || t('Élève', 'Student', 'Alumno')} value={left.studentName} />
            <Field label={t('Année', 'Year', 'Año')} value={left.year} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-bold text-slate-800">{t('Mise en page', 'Page setup', 'Diseño')}</h3>
          <div className="divide-y divide-slate-50">
            <Field label={t('Format', 'Format', 'Formato')} value={`${m.paper} ${m.orientation === 'landscape' ? t('paysage', 'landscape', 'horizontal') : t('portrait', 'portrait', 'vertical')}`} />
            <Field label={t('Marges', 'Margins', 'Márgenes')} value={`${m.margin} mm`} />
            <Field
              label={t('Pages par document', 'Pages per document', 'Páginas por documento')}
              value={sheets.length ? `${pageCount}` : '—'}
            />
            {multiCount > 1 && (
              <Field label={t('Total à imprimer', 'Total to print', 'Total a imprimir')} value={`≈ ${totalPages} ${t('pages', 'pages', 'páginas')}`} />
            )}
          </div>
          {info.overflowX > 2 && (
            <p className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
              {t('Le contenu dépasse la largeur imprimable — colonnes trop nombreuses.',
                 'Content exceeds the printable width — too many columns.',
                 'El contenido excede el ancho imprimible.')}
            </p>
          )}
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
            <p className="mb-3 text-center text-xs text-slate-500">
              {previewLabel || t('Aperçu du 1er document', 'Preview of 1st document', 'Vista del 1º')}
              {' · '}
              {pageCount} {pageCount > 1 ? t('pages', 'pages', 'páginas') : t('page', 'page', 'página')}
              {multiCount > 1 && <> · {multiCount} {t('documents', 'documents', 'documentos')}</>}
            </p>

            <div ref={frameRef} className="nc-preview w-full">
              {/* Cadre à la taille RÉELLE de la page, réduit au zoom pour tenir
                  dans la colonne. Le zoom réduit aussi la place occupée : pas de
                  bande blanche sous le document. */}
              <div
                style={{
                  zoom, width: `${m.pageW}mm`, margin: '0 auto',
                  background: '#fff', boxShadow: '0 1px 8px rgba(15,23,42,.16)', position: 'relative',
                }}
              >
                {/* Zone imprimable : le contenu est posé à l'intérieur des marges. */}
                <div style={{ padding: `${m.margin}mm`, boxSizing: 'border-box' }}>
                  <div className="nc-preview-doc" dangerouslySetInnerHTML={{ __html: sheets[0] }} />
                </div>

                {/* Limites de page : là où le navigateur coupera réellement. */}
                {Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) => (
                  <div
                    key={i}
                    aria-hidden="true"
                    style={{
                      position: 'absolute', left: 0, right: 0,
                      top: `calc(${m.margin}mm + ${(i + 1) * m.contentH}mm)`,
                      borderTop: '1px dashed #94a3b8',
                    }}
                  >
                    <span style={{
                      position: 'absolute', right: 4, top: 2, fontSize: 9,
                      color: '#64748b', background: '#f1f5f9', padding: '0 4px', borderRadius: 3,
                    }}>
                      {t('page', 'page', 'página')} {i + 2}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* La feuille injectée doit occuper la largeur imprimable, sans
                reprendre ses propres marges : celles-ci sont portées par le cadre. */}
            <style>{'.nc-preview .nc-sheet{width:100%!important;min-height:0!important;padding:0!important;margin:0!important;box-shadow:none!important}'}</style>
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
