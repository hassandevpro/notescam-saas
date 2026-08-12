// Calendrier scolaire — dates de chaque période pour le suivi automatique des
// retards et les alertes aux enseignants.
//
// Un établissement peut faire tourner PLUSIEURS calendriers en parallèle : la
// maternelle évalue par trimestres, le primaire MINEDUB par unités
// d'apprentissage, le secondaire MINESEC par séquences, l'anglophone par terms.
// On affiche donc un tableau par PISTE réellement utilisée (déduite des classes
// et du moteur pédagogique de chacune) — cf. `lib/calendarTracks`.
//
// Composant réutilisable : affiché dans Paramètres (admin) et sur la page
// Surveillance enseignants (/app/monitor).
//
// `canEdit` = false → tableaux en lecture seule (pas de bouton d'enregistrement).
import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSchoolStore } from '../store/schoolStore';
import { useCountry } from '../lib/useCountry';
import { useT } from '../lib/i18n';
import { SEQ_DEFINITIONS, fetchSequenceDates, upsertSequenceDates } from '../lib/sequenceDatesService';
import { TRACKS, tracksForSchool, effectiveDeadline, todayStr } from '../lib/calendarTracks';
import DateField from './DateField';

export default function SchoolCalendar({ canEdit = true }) {
  const t = useT();
  // Libellés localisés portés par les pistes (données, pas UI) : { fr, en, es }.
  const tp = (o) => (o ? t(o.fr, o.en, o.es) : '');
  const school = useAuthStore((s) => s.school);
  const classes = useSchoolStore((s) => s.classes);
  const country = useCountry();

  // Une entrée par `seq_key` persistable — l'état est indexé par clé, plus par
  // position : ajouter une piste ne décale plus les lignes des autres.
  const [rows, setRows] = useState(() =>
    Object.fromEntries(SEQ_DEFINITIONS.map((d) => [d.key, { exam_date: '', deadline_date: '', conseil_date: '' }]))
  );
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState(null);

  useEffect(() => {
    if (!school?.id) return;
    fetchSequenceDates(school.id).then((fetched) => {
      if (!fetched.length) return;
      setRows((prev) => {
        const next = { ...prev };
        for (const r of fetched) {
          if (!next[r.seq_key]) continue;      // clé inconnue (piste retirée) : ignorée
          next[r.seq_key] = {
            exam_date:     r.exam_date     || '',
            deadline_date: r.deadline_date || '',
            conseil_date:  r.conseil_date  || '',
          };
        }
        return next;
      });
    });
  }, [school?.id]);

  // Les pistes à afficher : celles que les classes de l'école utilisent vraiment.
  const trackKeys = useMemo(
    () => tracksForSchool(school, classes, country.code),
    [school, classes, country.code],
  );

  const today = todayStr();

  const setDate = (key, field, val) =>
    setRows((prev) => ({ ...prev, [key]: { ...prev[key], [field]: val } }));

  const handleSave = async () => {
    if (!school?.id) return;
    setSaving(true); setError(null); setSaved(false);
    // On n'enregistre que les clés des pistes affichées : une école qui n'a plus
    // de maternelle n'écrase pas ses lignes maternelle par des dates vides.
    const shown = new Set(trackKeys.flatMap((k) => TRACKS[k].periods.map((p) => p.key)));
    const payload = SEQ_DEFINITIONS
      .filter((d) => shown.has(d.key))
      .map((d) => ({ seq_key: d.key, seq_label: d.label, ...rows[d.key] }));
    const { error: err } = await upsertSequenceDates(school.id, payload);
    setSaving(false);
    if (err) setError(err.message);
    else { setSaved(true); setTimeout(() => setSaved(false), 3500); }
  };

  const FIELDS = ['exam_date', 'deadline_date', 'conseil_date'];

  return (
    <>
      <p className="text-xs text-gray-500 mb-4">
        {t('Dates de chaque période pour le suivi automatique des retards et alertes enseignants. Chaque niveau suit le découpage de sa tutelle.',
           'Dates for each period for automatic tracking of delays and teacher alerts. Each level follows its own ministry’s breakdown.',
           'Fechas de cada periodo para el seguimiento automático de retrasos y alertas.')}
      </p>

      {trackKeys.map((trackKey) => {
        const track = TRACKS[trackKey];
        return (
          <div key={trackKey} className="mb-6">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {tp(track.title)}
            </p>
            {tp(track.subtitle) && (
              <p className="text-xs text-gray-400 mb-2">{tp(track.subtitle)}</p>
            )}
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-sm border-separate border-spacing-y-1">
                <thead>
                  <tr className="text-xs text-gray-400 font-medium">
                    <th className="text-left pb-1 w-28">{tp(track.unit)}</th>
                    <th className="text-left pb-1 px-2">{t("Date d'examen", 'Exam date', 'Fecha del examen')}</th>
                    <th className="text-left pb-1 px-2">{t('Limite saisie notes', 'Grade entry deadline', 'Cierre de captura')}</th>
                    <th className="text-left pb-1 px-2">{t('Conseil de classe', 'Class council', 'Consejo de Curso')}</th>
                  </tr>
                </thead>
                <tbody>
                  {track.periods.map((p) => {
                    const row = rows[p.key] || { exam_date: '', deadline_date: '', conseil_date: '' };
                    const dl = effectiveDeadline(row);
                    const past = dl && dl < today;
                    return (
                      <tr key={`${trackKey}_${p.key}`}>
                        <td className="pr-2">
                          <span className="font-semibold text-gray-700">{tp(p)}</span>
                          {p.hint && <span className="ml-1.5 text-xs text-gray-400">{tp(p.hint)}</span>}
                          {past && <span className="ml-1.5 text-xs text-gray-400">· {t('échue', 'past', 'vencida')}</span>}
                        </td>
                        {FIELDS.map((field) => (
                          <td key={field} className="px-2">
                            <DateField value={row[field]} disabled={!canEdit}
                              onChange={(v) => setDate(p.key, field, v)} />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {canEdit && (
        <div className="flex items-center gap-4 pt-3 mt-3 border-t border-gray-100">
          <button onClick={handleSave} disabled={saving}
            className="btn-primary" style={{ width: 'auto', paddingInline: '1.5rem' }}>
            {saving ? t('Enregistrement…', 'Saving…', 'Guardando…') : t('Enregistrer les dates', 'Save dates', 'Guardar fechas')}
          </button>
          {saved && <span className="text-sm text-emerald-600 font-medium">✓ {t('Dates sauvegardées', 'Dates saved', 'Fechas guardadas')}</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      )}
    </>
  );
}
