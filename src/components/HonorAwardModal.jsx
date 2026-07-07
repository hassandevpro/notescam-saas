// Modal des diplômes / tableaux d'honneur premium.
//
// RÉUTILISE l'infrastructure de la carte scolaire :
//   - prétraitement des images (imageToDataUrl) → capture sans fetch ni CORS,
//   - rendu off-screen du MÊME composant pour l'aperçu ET le PDF,
//   - moteur PDF unique exportIdCardsPdf (html-to-image → jsPDF),
//   - palette d'école (getSchoolTheme), pays (resolveCountryCode).
// Seule différence avec IdCardModal : pas de QR, et pose 1 document par page A4.

import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import HonorAward, { awardSize, awardStyleFromTemplate } from './HonorAward';
import { imageToDataUrl } from '../lib/idCardService';
import { exportIdCardsPdf } from '../lib/idCardPdf';
import { getSchoolTheme } from '../lib/schoolTheme';
import { resolveCountryCode } from '../countries';
import { classIdentity } from '../lib/schoolIdentity';
import { useT } from '../lib/i18n';

export default function HonorAwardModal({ open, onClose, rows = [], school, units = [], classes = [], template, year, onGenerated }) {
  const t = useT();
  const [photoMap, setPhotoMap] = useState({});
  // Assets convertis en data-URL, indexés par URL source (une conversion par URL
  // distincte). Chaque diplôme prend l'identité de l'UNITÉ de la classe du lauréat.
  const [imgMap, setImgMap] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  // Identité effective (unité pédagogique) d'une ligne palmarès via sa classe.
  const identityForRow = (r) => classIdentity(school, classes.find((c) => c.id === r.classId), units);

  // Diplôme : PAYSAGE UNIQUEMENT.
  const orientation = 'landscape';
  const palette     = useMemo(() => getSchoolTheme(school).palette, [school]);
  const countryCode = useMemo(() => resolveCountryCode(school), [school]);
  const style       = useMemo(() => awardStyleFromTemplate(template || {}), [template]);
  const size        = awardSize();

  // Prétraitement (comme IdCardModal) : images école + photos élèves en data-URL.
  useEffect(() => {
    if (!open || !rows.length) return;
    let cancelled = false;
    (async () => {
      // URLs d'assets distinctes à travers les identités par ligne (unité du lauréat).
      const urls = new Set();
      for (const r of rows) {
        const id = identityForRow(r);
        [id?.logo_url, id?.signature_url, id?.stamp_url].forEach((u) => { if (u) urls.add(u); });
      }
      const urlList = [...urls];
      const converted = await Promise.all(urlList.map((u) => imageToDataUrl(u, { maxDim: 600 })));
      if (cancelled) return;
      const map = {};
      urlList.forEach((u, i) => { map[u] = converted[i] ?? u; });
      setImgMap(map);

      const photos = {};
      for (const r of rows) {
        if (!r.photo_url) { photos[r.id] = null; continue; }
        const p = await imageToDataUrl(r.photo_url, { maxDim: 600 });
        if (cancelled) return;
        photos[r.id] = p ?? r.photo_url ?? null;
      }
      if (cancelled) return;
      setPhotoMap(photos);
    })();
    return () => { cancelled = true; };
  }, [open, rows, school, classes, units]);

  const cardRefs = useRef([]);
  cardRefs.current = [];
  const registerRef = (el) => { if (el) cardRefs.current.push(el); };

  const ready = rows.length > 0 && imgMap !== null && Object.keys(photoMap).length === rows.length;

  // Identité (unité) de la ligne, assets déjà convertis en data-URL.
  const resolvedSchoolFor = (r) => {
    const id = identityForRow(r);
    if (!imgMap) return id;
    const swap = (u) => (u ? (imgMap[u] ?? u) : (u ?? null));
    return {
      ...id,
      logo_url:      swap(id?.logo_url),
      signature_url: swap(id?.signature_url),
      stamp_url:     swap(id?.stamp_url),
    };
  };

  const awardProps = (r) => ({
    award: { ...r, photo_url: photoMap[r.id] ?? null },
    school: resolvedSchoolFor(r),
    style,
    countryCode,
    year: year || school?.current_year || '',
  });

  const handleExport = async (mode) => {
    if (!ready || busy) return;
    setBusy(true);
    setProgress({ done: 0, total: rows.length });
    try {
      const safe = (template?.name || 'tableau-honneur').toLowerCase().replace(/[^\w]+/g, '-');
      const res = await exportIdCardsPdf(cardRefs.current, {
        fileName: `${safe}-${year || ''}.pdf`,
        ratio: size.w / size.h,
        orientation,
        // Une planche = un diplôme pleine page A4 (le moteur reste unique).
        layout: { cols: 1, rows: 1, margin: 0, gapX: 0, gapY: 0 },
        pixelRatio: 2.5, // ~300 DPI : net pour encadrement
        mode,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      if (res?.failed > 0) {
        alert(t(
          `${res.failed} document(s) sur ${res.total} n'ont pas pu être générés.`,
          `${res.failed} of ${res.total} document(s) could not be generated.`,
        ));
      }
      onGenerated?.();
    } catch (err) {
      console.error('export diplômes PDF', err);
      alert(t('Échec de la génération du PDF.', 'PDF generation failed.'));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const preview = rows[0];
  const previewScale = 0.5;

  return (
    <Modal onClose={onClose} title={t("Tableau d'honneur — Diplômes", 'Honour roll — Diplomas')} size="lg">
      <div className="space-y-4">

        <div className="rounded-xl bg-slate-100 p-4 flex items-center justify-center overflow-auto" style={{ maxHeight: '60vh' }}>
          {preview && ready ? (
            <div style={{ width: size.w * previewScale, height: size.h * previewScale }}>
              <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left' }}>
                <HonorAward {...awardProps(preview)} />
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-400 py-16 animate-pulse">{t('Préparation de l’aperçu…', 'Preparing preview…')}</div>
          )}
        </div>

        <p className="text-xs text-gray-400 text-center">
          {rows.length} {t('diplôme', 'diploma')}{rows.length !== 1 ? 's' : ''} · {t('aperçu du 1ᵉʳ élève', 'preview of 1st student')}
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary">{t('Fermer', 'Close')}</button>
          <button onClick={() => handleExport('open')} disabled={!ready || busy} className="btn-secondary disabled:opacity-50">
            {t('Aperçu / Imprimer', 'Preview / Print')}
          </button>
          <button onClick={() => handleExport('save')} disabled={!ready || busy} className="btn-primary disabled:opacity-50">
            {busy ? t('Génération…', 'Generating…') : t('Télécharger le PDF', 'Download PDF')}
          </button>
        </div>
      </div>

      {busy && (() => {
        const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl px-8 py-7 w-80 text-center">
              <svg className="w-10 h-10 mx-auto text-brand-600 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-90" d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
              </svg>
              <p className="mt-4 text-sm font-semibold text-gray-800">{t('Génération du PDF…', 'Generating PDF…')}</p>
              <p className="mt-1 text-3xl font-extrabold text-brand-600 tabular-nums">
                {progress.done}<span className="text-gray-300 text-xl font-bold">/{progress.total}</span>
              </p>
              <p className="text-xs text-gray-400">{t('diplômes traités', 'diplomas processed')}</p>
              <div className="mt-3 h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-brand-500 rounded-full transition-all duration-200" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1.5 text-xs font-bold text-gray-500">{pct}%</p>
            </div>
          </div>
        );
      })()}

      {/* Zone de rendu cachée (taille réelle) pour la capture html-to-image. */}
      <div style={{ position: 'fixed', left: -100000, top: 0, zIndex: -1 }} aria-hidden="true">
        {ready && rows.map((r) => (
          <div key={r.id} style={{ marginBottom: 20 }}>
            <HonorAward {...awardProps(r)} innerRef={registerRef} />
          </div>
        ))}
      </div>
    </Modal>
  );
}
