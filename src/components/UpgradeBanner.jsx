import { usePlan, PLAN_META } from '../lib/plan';
import { useT } from '../lib/i18n';

const WA = 'https://wa.me/237670894721?text=Bonjour%2C%20je%20souhaite%20passer%20au%20plan%20';

const PLAN_ORDER = ['starter', 'ecole', 'pro', 'reseau'];

function LockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-brand-500 mb-3">
      <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z" clipRule="evenodd" />
    </svg>
  );
}

export default function UpgradeBanner({ requiredPlan, featureName }) {
  const { plan } = usePlan();
  const t = useT();

  const currentMeta  = PLAN_META[plan]          ?? PLAN_META.starter;
  const requiredMeta = PLAN_META[requiredPlan]   ?? PLAN_META.ecole;

  const waLink = `${WA}${encodeURIComponent(requiredMeta.label)}`;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 max-w-md w-full">
        <LockIcon />

        <h2 className="text-xl font-bold text-gray-900 mb-2">
          {featureName
            ? t(`${featureName} — fonctionnalité réservée`, `${featureName} — premium feature`)
            : t('Fonctionnalité réservée', 'Premium feature')}
        </h2>

        <p className="text-gray-500 text-sm mb-1">
          {t('Votre plan actuel :', 'Your current plan:')} <span className="font-semibold text-gray-700">{currentMeta.label} ({currentMeta.price})</span>
        </p>
        <p className="text-gray-500 text-sm mb-6">
          {t('Plan requis :', 'Required plan:')} <span className="font-semibold text-brand-500">{requiredMeta.label} ({requiredMeta.price})</span>
        </p>

        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm w-full justify-center mb-3"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
          </svg>
          {t('Passer au plan', 'Upgrade to')} {requiredMeta.label}
        </a>

        <p className="text-xs text-gray-400">
          {t('Contactez-nous sur WhatsApp pour activer votre abonnement.', 'Contact us on WhatsApp to activate your subscription.')}
        </p>
      </div>
    </div>
  );
}
