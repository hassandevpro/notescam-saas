// Calendrier scolaire — dates de chaque séquence/trimestre pour le suivi
// automatique des retards et les alertes aux enseignants.
// Composant réutilisable : affiché dans Paramètres (admin) et sur la page
// Surveillance enseignants (/app/monitor).
//
// `canEdit` = false → tableaux en lecture seule (pas de bouton d'enregistrement).
import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useCountry } from '../lib/useCountry';
import { useT } from '../lib/i18n';
import { SEQ_DEFINITIONS, fetchSequenceDates, upsertSequenceDates } from '../lib/sequenceDatesService';
import DateField from './DateField';

export default function SchoolCalendar({ canEdit = true }) {
  const t = useT();
  const school = useAuthStore((s) => s.school);
  const country = useCountry();
  const isGE = country.code === 'guinea_eq';

  const [seqRows, setSeqRows] = useState(() =>
    SEQ_DEFINITIONS.map((d) => ({
      seq_key:       d.key,
      seq_label:     d.label,
      exam_date:     '',
      deadline_date: '',
      conseil_date:  '',
    }))
  );
  const [seqSaving, setSeqSaving] = useState(false);
  const [seqSaved,  setSeqSaved]  = useState(false);
  const [seqError,  setSeqError]  = useState(null);

  useEffect(() => {
    if (!school?.id) return;
    fetchSequenceDates(school.id).then((rows) => {
      if (!rows.length) return;
      setSeqRows((prev) =>
        prev.map((r) => {
          const found = rows.find((x) => x.seq_key === r.seq_key);
          if (!found) return r;
          return {
            ...r,
            exam_date:     found.exam_date     || '',
            deadline_date: found.deadline_date || '',
            conseil_date:  found.conseil_date  || '',
          };
        })
      );
    });
  }, [school?.id]);

  const setSeqDate = (idx, field, val) =>
    setSeqRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: val } : r)));

  const handleSeqSave = async () => {
    if (!school?.id) return;
    setSeqSaving(true); setSeqError(null); setSeqSaved(false);
    const { error } = await upsertSequenceDates(school.id, seqRows);
    setSeqSaving(false);
    if (error) setSeqError(error.message);
    else { setSeqSaved(true); setTimeout(() => setSeqSaved(false), 3500); }
  };

  const saveBar = (
    <div className="flex items-center gap-4 pt-3 mt-3 border-t border-gray-100">
      <button onClick={handleSeqSave} disabled={seqSaving}
        className="btn-primary" style={{ width: 'auto', paddingInline: '1.5rem' }}>
        {seqSaving ? t('Enregistrement…', 'Saving…') : t('Enregistrer les dates', 'Save dates')}
      </button>
      {seqSaved && <span className="text-sm text-emerald-600 font-medium">✓ {t('Dates sauvegardées', 'Dates saved')}</span>}
      {seqError && <span className="text-sm text-red-600">{seqError}</span>}
    </div>
  );

  return (
    <>
      <p className="text-xs text-gray-500 mb-4">
        {t('Dates de chaque séquence pour le suivi automatique des retards et alertes enseignants.', 'Dates for each period for automatic tracking of delays and teacher alerts.')}
      </p>

      {/* Guinea Ecuatorial — un seul tableau, 3 trimestres officiels */}
      {isGE && (
        <div className="mb-5">
          <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2">
            Sistema equatoguineano — 3 Trimestres
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-y-1">
              <thead>
                <tr className="text-xs text-gray-400 font-medium">
                  <th className="text-left pb-1 w-32">Trimestre</th>
                  <th className="text-left pb-1 px-2">Fecha del examen</th>
                  <th className="text-left pb-1 px-2">Cierre de captura</th>
                  <th className="text-left pb-1 px-2">Consejo de Curso</th>
                </tr>
              </thead>
              <tbody>
                {['Primer Trimestre', 'Segundo Trimestre', 'Tercer Trimestre'].map((label, idx) => {
                  const row = seqRows[idx] || { exam_date: '', deadline_date: '', conseil_date: '' };
                  return (
                    <tr key={idx}>
                      <td className="font-semibold text-gray-700 pr-2">{label}</td>
                      {['exam_date', 'deadline_date', 'conseil_date'].map((field) => (
                        <td key={field} className="px-2">
                          <DateField value={row[field]} disabled={!canEdit}
                            onChange={(v) => setSeqDate(idx, field, v)} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {canEdit && saveBar}
        </div>
      )}

      {!isGE && (<>
        <div className="mb-5">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('Système francophone — Séquences', 'Francophone system — Sequences')}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-y-1">
              <thead>
                <tr className="text-xs text-gray-400 font-medium">
                  <th className="text-left pb-1 w-20">{t('Séquence', 'Sequence')}</th>
                  <th className="text-left pb-1 px-2">{t("Date d'examen", 'Exam date')}</th>
                  <th className="text-left pb-1 px-2">{t('Limite saisie notes', 'Grade entry deadline')}</th>
                  <th className="text-left pb-1 px-2">{t('Conseil de classe', 'Class council')}</th>
                </tr>
              </thead>
              <tbody>
                {seqRows.slice(0, 6).map((row, idx) => (
                  <tr key={row.seq_key}>
                    <td className="font-semibold text-gray-700 pr-2">{row.seq_label}</td>
                    {['exam_date', 'deadline_date', 'conseil_date'].map((field) => (
                      <td key={field} className="px-2">
                        <DateField value={row[field]} disabled={!canEdit}
                          onChange={(v) => setSeqDate(idx, field, v)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mb-5">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('Système anglophone — Terms', 'Anglophone system — Terms')}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-y-1">
              <thead>
                <tr className="text-xs text-gray-400 font-medium">
                  <th className="text-left pb-1 w-20">Term</th>
                  <th className="text-left pb-1 px-2">{t("Date d'examen", 'Exam date')}</th>
                  <th className="text-left pb-1 px-2">{t('Limite saisie notes', 'Grade entry deadline')}</th>
                  <th className="text-left pb-1 px-2">{t('Conseil de classe', 'Class council')}</th>
                </tr>
              </thead>
              <tbody>
                {seqRows.slice(6).map((row, idx) => (
                  <tr key={row.seq_key}>
                    <td className="font-semibold text-gray-700 pr-2">{row.seq_label}</td>
                    {['exam_date', 'deadline_date', 'conseil_date'].map((field) => (
                      <td key={field} className="px-2">
                        <DateField value={row[field]} disabled={!canEdit}
                          onChange={(v) => setSeqDate(6 + idx, field, v)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {canEdit && saveBar}
      </>)}
    </>
  );
}
