// Calendrier scolaire — dates de chaque période pour le suivi automatique des
// retards et les alertes aux enseignants.
//
// Un établissement peut faire tourner PLUSIEURS calendriers en parallèle : la
// maternelle évalue par trimestres, le primaire MINEDUB par unités
// d'apprentissage, le secondaire MINESEC par séquences, l'anglophone par terms.
// On affiche donc un tableau par PISTE réellement utilisée (déduite des classes
// et du moteur pédagogique de chacune) — cf. `lib/calendarTracks`.
//
// Deux filtres, et deux seulement :
//   • le MOTEUR DE BULLETIN de l'école décide des découpages possibles
//     (« Classique » n'a jamais de tableau MINEDUB) ;
//   • le PÉRIMÈTRE du compte décide de la part que cette personne règle — dans un
//     complexe scolaire, le directeur du fondamental et le proviseur du
//     secondaire ne touchent pas aux mêmes lignes.
//
// Monté depuis Paramètres → Calendrier scolaire (admin) et Surveillance →
// Calendrier scolaire (admin + censeur, donc les chefs d'unité).
// `canEdit` = false → tableaux en lecture seule (pas de bouton d'enregistrement).
import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSchoolStore } from '../store/schoolStore';
import { useCountry } from '../lib/useCountry';
import { useT } from '../lib/i18n';
import { SEQ_DEFINITIONS, fetchSequenceDates, upsertSequenceDates } from '../lib/sequenceDatesService';
import { TRACKS, tracksForSchool, effectiveDeadline, todayStr } from '../lib/calendarTracks';
import { isOfficialEngine } from '../core/engineResolver';
import { scopeSummary } from '../core/surveillantScope';
import DateField from './DateField';

export default function SchoolCalendar({ canEdit = true, onSaved }) {
  const t = useT();
  // Libellés localisés portés par les pistes (données, pas UI) : { fr, en, es }.
  const tp = (o) => (o ? t(o.fr, o.en, o.es) : '');
  const school = useAuthStore((s) => s.school);
  // Périmètre du compte (school_users.scope) : dans un complexe scolaire, le
  // directeur du fondamental et le proviseur du secondaire ne règlent pas les
  // mêmes dates. Périmètre vide = tout l'établissement (comportement historique).
  const scope = useAuthStore((s) => s.scope);
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

  // Les pistes à afficher : le moteur de bulletin décide des découpages
  // possibles, le PÉRIMÈTRE du compte décide de la part que cette personne règle.
  const trackKeys = useMemo(
    () => tracksForSchool(school, classes, country.code, scope),
    [school, classes, country.code, scope],
  );
  const scopeLabel = scopeSummary(scope, t);

  const isOfficial = isOfficialEngine(school?.bulletin_engine);
  const today = todayStr();

  const setDate = (key, field, val) =>
    setRows((prev) => ({ ...prev, [key]: { ...prev[key], [field]: val } }));

  const handleSave = async () => {
    if (!school?.id) return;
    setSaving(true); setError(null); setSaved(false);
    // On n'enregistre QUE les clés des pistes affichées. Deux propriétés en
    // dépendent : une école qui n'a plus de maternelle n'écrase pas ses lignes
    // maternelle par des dates vides, et le directeur du fondamental ne peut pas
    // effacer les séquences réglées par le proviseur (ni l'inverse).
    const shown = new Set(trackKeys.flatMap((k) => TRACKS[k].periods.map((p) => p.key)));
    const payload = SEQ_DEFINITIONS
      .filter((d) => shown.has(d.key))
      .map((d) => ({ seq_key: d.key, seq_label: d.label, ...rows[d.key] }));
    const { error: err } = await upsertSequenceDates(school.id, payload);
    setSaving(false);
    if (err) setError(err.message);
    else { setSaved(true); onSaved?.(); setTimeout(() => setSaved(false), 3500); }
  };

  const FIELDS = ['exam_date', 'deadline_date', 'conseil_date'];

  return (
    <>
      <p className="text-xs text-gray-500">
        {t('Dates de chaque période pour le suivi automatique des retards et alertes enseignants. Chaque niveau suit le découpage de sa tutelle.',
           'Dates for each period for automatic tracking of delays and teacher alerts. Each level follows its own ministry’s breakdown.',
           'Fechas de cada periodo para el seguimiento automático de retrasos y alertas.')}
      </p>

      {/* Les découpages proposés découlent du MOTEUR DE BULLETIN choisi : seul le
          cas de l'école retenue est affiché. On le rappelle ici, sinon un
          administrateur ne comprend pas pourquoi les tableaux MINEDUB
          apparaissent — ou n'apparaissent pas. */}
      <p className="text-xs mb-4 mt-1.5 text-gray-400">
        {t('Moteur de bulletin', 'Report-card engine', 'Motor de boletín')} :{' '}
        <span className="font-semibold text-gray-600">
          {isOfficial ? t('Officiel Cameroun', 'Official Cameroon', 'Oficial Camerún') : t('Classique', 'Classic', 'Clásico')}
        </span>
        {' — '}
        {isOfficial
          ? t('maternelle et primaire suivent le MINEDUB, le secondaire le MINESEC.',
              'nursery and primary follow MINEDUB, secondary follows MINESEC.',
              'preescolar y primaria siguen MINEDUB.')
          : t('toutes les classes suivent les séquences (aucun référentiel officiel).',
              'every class follows sequences (no official framework).',
              'todas las clases siguen las secuencias.')}
        {canEdit && ` ${t('Il se change dans l’onglet Établissement.', 'Change it in the School tab.', 'Se cambia en la pestaña Centro.')}`}
      </p>

      {/* Complexe scolaire : chacun règle sa part. Le directeur du fondamental
          tient les dates MINEDUB, le proviseur celles du secondaire — le
          périmètre du compte fait foi. */}
      {scopeLabel && (
        <p className="text-xs -mt-2 mb-4 px-3 py-2 rounded-lg bg-brand-50 border border-brand-100 text-brand-800">
          {t('Votre périmètre', 'Your scope', 'Su ámbito')} : <span className="font-semibold">{scopeLabel}</span>
          {' — '}
          {t('vous ne réglez que les dates de cette partie du complexe ; les autres responsables gardent les leurs.',
             'you only set the dates for this part of the complex; other heads keep theirs.',
             'usted solo fija las fechas de esta parte; los demás conservan las suyas.')}
        </p>
      )}

      {trackKeys.length === 0 && (
        <p className="text-sm text-gray-500 py-6">
          {t('Aucune classe dans votre périmètre : il n’y a pas de dates à régler ici.',
             'No class in your scope: there are no dates to set here.',
             'Ninguna clase en su ámbito: no hay fechas que fijar aquí.')}
        </p>
      )}

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

      {canEdit && trackKeys.length > 0 && (
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
