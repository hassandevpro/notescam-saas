// Bandeau « Confirmez votre calendrier » : proposé à la direction tant que l'école n'a pas
// validé ses dates de période. Il n'ÉTEINT rien : le suivi tourne déjà avec les dates
// connues (ou sans, en « période estimée »). Il invite seulement à les relire et à confirmer.
import { Link, useNavigate } from 'react-router-dom';
import { useT } from '../../lib/i18n';
import { calendrierConfirme } from '../../lib/calendarConfirm';

export default function CalendarConfirmBanner({ school, role, hasDates }) {
  const t = useT();
  const navigate = useNavigate();
  if (!school || !['admin', 'censeur'].includes(role)) return null;
  if (calendrierConfirme(school)) return null;
  const ouvrir = () => {
    try { localStorage.setItem('nc_settings_tab', 'calendar'); } catch { /* sans stockage : l'onglet par défaut s'ouvre */ }
    navigate('/app/settings');
  };
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3" role="status">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-amber-900 text-sm">{t('Confirmez votre calendrier', 'Confirm your calendar')}</p>
        <p className="text-xs text-amber-900 mt-0.5">
          {hasDates
            ? t('Le suivi des notes utilise les dates déjà saisies. Relisez-les (début, fin, date limite de chaque période) puis confirmez.',
                'Grade tracking uses the dates already entered. Review them (start, end, deadline of each period) then confirm.')
            : t('Aucune date de période n’est renseignée : le suivi des retards est approximatif. Renseignez le début, la fin et la date limite de chaque période.',
                'No period dates are set: delay tracking is approximate. Set the start, end and deadline of each period.')}
        </p>
      </div>
      <button type="button" onClick={ouvrir}
        className="min-h-[44px] px-4 rounded-lg bg-amber-600 text-white text-sm font-semibold shrink-0 hover:bg-amber-700">
        {t('Ouvrir le calendrier', 'Open the calendar')}
      </button>
      <Link to="/app/settings" className="sr-only">{t('Paramètres', 'Settings')}</Link>
    </div>
  );
}
