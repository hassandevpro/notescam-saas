// BARÈME DE SAISIE D'UNE COLONNE — la pastille « /20 » dans l'en-tête du tableau
// de notes, et le dialogue qui permit enfin à l'enseignant de la changer.
//
// LE DÉFAUT QUE CECI CORRIGE : les deux moteurs par compétences imposaient leur
// barème officiel (compétence /20 en APC, points par critère en primaire). Un
// enseignant qui interroge à l'oral sur 10 ou fait une dictée sur 15 devait donc
// convertir de tête AVANT de saisir — conversion fausse une fois sur trois, et
// plus rien derrière pour la rattraper.
//
// Désormais la pastille s'ouvre, l'enseignant saisit l'échelle de SON épreuve, et
// le calcul ramène la note au barème officiel (src/core/baremeOverride.js) : le
// bulletin reste un bulletin officiel.
//
// Montée par ApcCompetenceWorkspace (par compétence) et PrimCompetenceWorkspace
// (par critère : Oral, Écrit, Pratique, Savoir-être).

import { useEffect, useState } from 'react';
import { useT } from '../../lib/i18n';
import { BAREME_MIN, BAREME_MAX } from '../../core/baremeOverride';
import Modal from '../Modal';

// Échelles proposées d'un clic. Celles qu'on rencontre réellement dans les
// cahiers : /5 et /10 pour un oral ou un contrôle court, /20 le barème officiel,
// /40 et /50 pour un devoir surveillé, /100 pour un pourcentage.
const PRESETS = [5, 10, 15, 20, 25, 30, 40, 50, 100];

export default function BaremeChip({
  // Barème actuellement en vigueur pour cette colonne, et barème officiel.
  value, officialMax,
  // Libellé de la colonne (titre du dialogue) — compétence ou critère.
  label,
  // Nombre de notes déjà saisies dans cette colonne (0 = rien à convertir).
  noteCount = 0,
  disabled = false,
  // onSave(nouveauMax, { convertir: boolean })
  onSave,
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [convert, setConvert] = useState(true);
  const [busy, setBusy] = useState(false);

  // Rouvrir le dialogue repart TOUJOURS du barème en vigueur : garder le brouillon
  // d'une tentative abandonnée ferait enregistrer une valeur jamais confirmée.
  useEffect(() => {
    if (open) { setDraft(String(value)); setConvert(noteCount > 0); }
  }, [open, value, noteCount]);

  const custom = Number(value) !== Number(officialMax);
  const n = Number(String(draft).replace(',', '.'));
  const valid = isFinite(n) && n >= BAREME_MIN && n <= BAREME_MAX;
  const changed = valid && n !== Number(value);

  const commit = async (max) => {
    if (busy) return;
    setBusy(true);
    try {
      await onSave(max, { convertir: convert && noteCount > 0 && max !== Number(value) });
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        title={disabled
          ? t('Barème non modifiable ici', 'Scale cannot be changed here')
          : t('Changer le barème de saisie de cette colonne', 'Change this column’s entry scale')}
        className={`inline-flex items-center gap-0.5 rounded px-1 text-[11px] font-medium transition-colors
          ${disabled
            ? 'text-gray-300 cursor-default'
            : custom
              ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
              : 'text-gray-400 hover:bg-gray-200 hover:text-gray-600'}`}
      >
        /{value}
        {!disabled && (
          <svg className="w-2.5 h-2.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-8.5 8.5a1 1 0 01-.44.26l-3 .857a.5.5 0 01-.618-.618l.857-3a1 1 0 01.26-.44l8.613-8.387z" />
          </svg>
        )}
      </button>

      {open && (
        <Modal size="sm" onClose={() => setOpen(false)}
          title={t('Barème de saisie', 'Entry scale')}>
          <div className="space-y-4 text-sm">
            <div>
              <div className="font-medium text-gray-800">{label}</div>
              <p className="mt-1 text-xs text-gray-500">
                {t(
                  'Saisissez vos notes sur l’échelle de votre épreuve. Le bulletin, lui, reste sur le barème officiel : la conversion est faite pour vous.',
                  'Enter marks on your own test’s scale. The report card stays on the official scale: the conversion is done for you.',
                )}
                {' '}
                <span className="text-gray-400">
                  {t('Barème officiel', 'Official scale')} : /{officialMax}.
                </span>
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((v) => (
                <button key={v} type="button" onClick={() => setDraft(String(v))}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors
                    ${Number(draft) === v
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}>
                  /{v}
                  {v === Number(officialMax) && (
                    <span className="ml-1 text-[10px] text-gray-400">
                      {t('officiel', 'official')}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <label className="block">
              <span className="block text-xs text-gray-500 mb-1">
                {t('Ou une autre valeur', 'Or another value')}
                {` (${BAREME_MIN}–${BAREME_MAX})`}
              </span>
              <input
                type="text" inputMode="decimal" autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && changed) commit(n); }}
                className={`w-28 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1
                  ${valid
                    ? 'border-gray-200 focus:border-brand-500 focus:ring-brand-300'
                    : 'border-red-300 focus:border-red-400 focus:ring-red-200'}`}
              />
              {!valid && draft !== '' && (
                <span className="ml-2 text-xs text-red-500">
                  {t('Valeur hors limites', 'Value out of range')}
                </span>
              )}
            </label>

            {/* La conversion est le point délicat : sans elle, un 16 saisi sur /20
                se relit 16/10 — au-dessus du barème, et faux au bulletin. On ne la
                propose que s'il y a vraiment des notes à convertir. */}
            {noteCount > 0 && (
              <label className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 p-3">
                <input type="checkbox" checked={convert} onChange={(e) => setConvert(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-brand-600 focus:ring-brand-400" />
                <span className="text-xs text-amber-800">
                  <span className="font-medium">
                    {t('Convertir les notes déjà saisies', 'Convert marks already entered')}
                    {` (${noteCount})`}
                  </span>
                  <span className="block mt-0.5 text-amber-700">
                    {t(
                      'Chaque note est mise à la nouvelle échelle (16/20 devient 8/10). Décochez pour garder les valeurs brutes — à vous de les reprendre.',
                      'Each mark is rescaled (16/20 becomes 8/10). Uncheck to keep the raw values — you will have to redo them yourself.',
                    )}
                  </span>
                </span>
              </label>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              {custom ? (
                <button type="button" disabled={busy}
                  onClick={() => { setDraft(String(officialMax)); commit(Number(officialMax)); }}
                  className="text-xs font-medium text-gray-500 hover:text-gray-700 underline disabled:opacity-50">
                  {t('Rétablir le barème officiel', 'Restore official scale')} (/{officialMax})
                </button>
              ) : <span />}
              <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
                  {t('Annuler', 'Cancel')}
                </button>
                <button type="button" disabled={!changed || busy} onClick={() => commit(n)}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40">
                  {busy ? t('Enregistrement…', 'Saving…') : t('Enregistrer', 'Save')}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
