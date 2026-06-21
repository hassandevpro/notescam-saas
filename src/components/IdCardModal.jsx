// Modal des cartes scolaires : choix du modèle, aperçu fidèle, export PDF HD.
// L'aperçu et le PDF utilisent le MÊME composant <IdCard/> → rendu identique.

import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import IdCard, { CARD_W, CARD_H } from './IdCard';
import { buildCardId, qrDataUrl, imageToDataUrl } from '../lib/idCardService';
import { exportIdCardsPdf } from '../lib/idCardPdf';
import { getSchoolTheme } from '../lib/schoolTheme';
import { resolveCountryCode } from '../countries';
import { useT } from '../lib/i18n';

const MODELS = [
  { key: 'premium',     fr: 'Premium',      en: 'Premium' },
  { key: 'classique',   fr: 'Classique',    en: 'Classic' },
  { key: 'bilingue',    fr: 'Bilingue',     en: 'Bilingual' },
  { key: 'minimaliste', fr: 'Minimaliste',  en: 'Minimalist' },
];

export default function IdCardModal({ open, onClose, students = [], school, classNameById, classSystemById }) {
  const t = useT();
  const [variant, setVariant] = useState('premium'); // Premium = défaut
  const [qrMap, setQrMap] = useState({});
  const [photoMap, setPhotoMap] = useState({});   // student.id → photo data-URL
  const [schoolImgs, setSchoolImgs] = useState(null); // logo/signature/cachet en data-URL
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const palette     = useMemo(() => getSchoolTheme(school).palette, [school]);
  const countryCode = useMemo(() => resolveCountryCode(school), [school]);

  // Pré-calcule, à l'ouverture, TOUT ce que la capture PDF aura besoin :
  //   - les QR (data-URL) de chaque élève,
  //   - les images de l'école (logo/signature/cachet) converties UNE fois,
  //   - la photo de chaque élève convertie en data-URL.
  // Résultat : au moment de la capture, plus aucune image distante à charger
  // → export rapide et insensible aux soucis réseau / CORS (cf. imageToDataUrl).
  useEffect(() => {
    if (!open || !students.length) return;
    let cancelled = false;
    (async () => {
      // Images de l'école : identiques pour toutes les cartes → résolues une fois.
      // Images de l'école : petites à l'affichage (logo ~60 px, cachet/signature
      // ~50 px) → maxDim modeste suffit et allège fortement chaque capture.
      const [logo, signature, stamp] = await Promise.all([
        imageToDataUrl(school?.logo_url,      { maxDim: 400 }),
        imageToDataUrl(school?.signature_url, { maxDim: 400 }),
        imageToDataUrl(school?.stamp_url,     { maxDim: 400 }),
      ]);
      if (cancelled) return;
      // En cas d'échec de conversion (URL cassée / hôte sans CORS) on conserve
      // l'URL d'origine : l'image reste affichable, sans régression visuelle.
      setSchoolImgs({
        logo_url: logo ?? school?.logo_url ?? null,
        signature_url: signature ?? school?.signature_url ?? null,
        stamp_url: stamp ?? school?.stamp_url ?? null,
      });

      // QR + photos des élèves (en parallèle, mais bornés pour ne pas saturer
      // le navigateur sur de très grands effectifs).
      const qr = {};
      const photos = {};
      for (const s of students) {
        const cardId = buildCardId(school?.id, s.id);
        const [q, p] = await Promise.all([
          qrDataUrl(cardId),
          imageToDataUrl(s?.photo_url, { maxDim: 600 }), // photo carte ~110×130 px
        ]);
        if (cancelled) return;
        qr[s.id] = q;
        photos[s.id] = p ?? s?.photo_url ?? null; // repli sur l'URL d'origine
      }
      if (cancelled) return;
      setQrMap(qr);
      setPhotoMap(photos);
    })();
    return () => { cancelled = true; };
  }, [open, students, school?.id, school?.logo_url, school?.signature_url, school?.stamp_url]);

  // Refs sur chaque carte rendue (zone cachée) pour la capture PDF.
  const cardRefs = useRef([]);
  cardRefs.current = [];
  const registerRef = (el) => { if (el) cardRefs.current.push(el); };

  const ready =
    students.length > 0 &&
    schoolImgs !== null &&
    Object.keys(qrMap).length === students.length;

  // École avec ses images déjà en data-URL (capture sans fetch ni risque CORS).
  const resolvedSchool = useMemo(
    () => (schoolImgs ? { ...school, ...schoolImgs } : school),
    [school, schoolImgs]
  );

  const handleExport = async (mode) => {
    if (!ready || busy) return;
    setBusy(true);
    setProgress({ done: 0, total: students.length });
    try {
      const safe = (school?.name || 'ecole').replace(/[^\w]+/g, '_');
      const res = await exportIdCardsPdf(cardRefs.current, {
        fileName: `cartes-scolaires-${safe}.pdf`,
        ratio: CARD_W / CARD_H,
        mode,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      if (res?.failed > 0) {
        alert(t(
          `${res.failed} carte(s) sur ${res.total} n'ont pas pu être générées et ont été ignorées.`,
          `${res.failed} of ${res.total} card(s) could not be generated and were skipped.`
        ));
      }
    } catch (err) {
      console.error('export cartes PDF', err);
      alert(t('Échec de la génération du PDF.', 'PDF generation failed.'));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const cardProps = (s) => ({
    // Photo déjà convertie en data-URL (ou null → placeholder de la carte).
    student: { ...s, photo_url: photoMap[s.id] ?? null },
    school: resolvedSchool,
    className: classNameById?.(s.class_id) || '',
    cardId: buildCardId(school?.id, s.id),
    qrSrc: qrMap[s.id],
    countryCode,
    variant,
    // Classe anglophone (système EN) → carte en anglais (sauf modèle bilingue).
    classLang: classSystemById?.(s.class_id) === 'EN' ? 'en' : 'fr',
    palette,
  });

  const preview = students[0];

  // Échelle d'aperçu pour tenir dans le modal.
  const previewScale = 0.72;

  return (
    <Modal onClose={onClose} title={t('Cartes scolaires', 'ID cards')} size="lg">
      <div className="space-y-4">

        {/* Sélecteur de modèle */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
            {t('Modèle', 'Template')}
          </p>
          <div className="flex flex-wrap gap-2">
            {MODELS.map((m) => (
              <button
                key={m.key}
                onClick={() => setVariant(m.key)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                  variant === m.key
                    ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
                }`}
              >
                {t(m.fr, m.en)}
                {m.key === 'premium' && (
                  <span className={`ml-1.5 text-[10px] ${variant === m.key ? 'text-amber-200' : 'text-amber-500'}`}>★</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Aperçu (1ère carte) */}
        <div className="rounded-xl bg-slate-100 p-4 flex items-center justify-center overflow-hidden">
          {preview && qrMap[preview.id] ? (
            <div style={{ width: CARD_W * previewScale, height: CARD_H * previewScale }}>
              <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left' }}>
                <IdCard {...cardProps(preview)} />
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-400 py-16 animate-pulse">{t('Préparation de l’aperçu…', 'Preparing preview…')}</div>
          )}
        </div>

        <p className="text-xs text-gray-400 text-center">
          {students.length} {t('carte', 'card')}{students.length !== 1 ? 's' : ''} · {t('aperçu du 1ᵉʳ élève', 'preview of 1st student')}
        </p>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary">{t('Fermer', 'Close')}</button>
          <button
            onClick={() => handleExport('open')}
            disabled={!ready || busy}
            className="btn-secondary disabled:opacity-50"
          >
            {t('Aperçu / Imprimer', 'Preview / Print')}
          </button>
          <button
            onClick={() => handleExport('save')}
            disabled={!ready || busy}
            className="btn-primary disabled:opacity-50"
          >
            {busy ? t('Génération…', 'Generating…') : t('Télécharger le PDF', 'Download PDF')}
          </button>
        </div>
      </div>

      {/* Overlay de progression pendant la génération */}
      {busy && (() => {
        const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl px-8 py-7 w-80 text-center">
              <svg className="w-10 h-10 mx-auto text-brand-600 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-90" d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
              </svg>
              <p className="mt-4 text-sm font-semibold text-gray-800">
                {t('Génération du PDF…', 'Generating PDF…')}
              </p>
              <p className="mt-1 text-3xl font-extrabold text-brand-600 tabular-nums">
                {progress.done}<span className="text-gray-300 text-xl font-bold">/{progress.total}</span>
              </p>
              <p className="text-xs text-gray-400">{t('cartes traitées', 'cards processed')}</p>
              <div className="mt-3 h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-brand-500 rounded-full transition-all duration-200" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1.5 text-xs font-bold text-gray-500">{pct}%</p>
            </div>
          </div>
        );
      })()}

      {/* Zone de rendu cachée (hors écran) pour la capture html2canvas —
          toutes les cartes en taille réelle, sinon la capture serait floue. */}
      <div style={{ position: 'fixed', left: -100000, top: 0, zIndex: -1 }} aria-hidden="true">
        {ready && students.map((s) => (
          <div key={s.id} style={{ marginBottom: 20 }}>
            <IdCard {...cardProps(s)} innerRef={registerRef} />
          </div>
        ))}
      </div>
    </Modal>
  );
}
