// Modal des cartes scolaires : choix du modèle, aperçu fidèle, export PDF HD.
// L'aperçu et le PDF utilisent le MÊME composant <IdCard/> → rendu identique.

import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import IdCard, { CARD_W, CARD_H } from './IdCard';
import { buildCardId, qrDataUrl } from '../lib/idCardService';
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

export default function IdCardModal({ open, onClose, students = [], school, classNameById }) {
  const t = useT();
  const [variant, setVariant] = useState('premium'); // Premium = défaut
  const [qrMap, setQrMap] = useState({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const palette     = useMemo(() => getSchoolTheme(school).palette, [school]);
  const countryCode = useMemo(() => resolveCountryCode(school), [school]);

  // Pré-calcule les QR (data-URL) de tous les élèves à l'ouverture.
  useEffect(() => {
    if (!open || !students.length) return;
    let cancelled = false;
    (async () => {
      const map = {};
      for (const s of students) {
        const cardId = buildCardId(school?.id, s.id);
        map[s.id] = await qrDataUrl(cardId);
      }
      if (!cancelled) setQrMap(map);
    })();
    return () => { cancelled = true; };
  }, [open, students, school?.id]);

  // Refs sur chaque carte rendue (zone cachée) pour la capture PDF.
  const cardRefs = useRef([]);
  cardRefs.current = [];
  const registerRef = (el) => { if (el) cardRefs.current.push(el); };

  const ready = students.length > 0 && Object.keys(qrMap).length === students.length;

  const handleExport = async (mode) => {
    if (!ready || busy) return;
    setBusy(true);
    setProgress({ done: 0, total: students.length });
    try {
      const safe = (school?.name || 'ecole').replace(/[^\w]+/g, '_');
      await exportIdCardsPdf(cardRefs.current, {
        fileName: `cartes-scolaires-${safe}.pdf`,
        ratio: CARD_W / CARD_H,
        mode,
        onProgress: (done, total) => setProgress({ done, total }),
      });
    } catch (err) {
      console.error('export cartes PDF', err);
      alert(t('Échec de la génération du PDF.', 'PDF generation failed.'));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const cardProps = (s) => ({
    student: s,
    school,
    className: classNameById?.(s.class_id) || '',
    cardId: buildCardId(school?.id, s.id),
    qrSrc: qrMap[s.id],
    countryCode,
    variant,
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
