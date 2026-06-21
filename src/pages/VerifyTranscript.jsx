import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { decodeVerification } from '../lib/transcriptEngine';
import { useT } from '../lib/i18n';

// Page publique de vérification d'un relevé de notes (cible du QR Code).
// Auto-contenue : le payload du QR porte tous les faits + un checksum. On décode,
// on recalcule le checksum et on confronte → aucune base de données requise
// (fonctionne en cloud comme en LAN, sur n'importe quel poste du réseau).

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-900 text-right">{value || '—'}</span>
    </div>
  );
}

export default function VerifyTranscript() {
  const t = useT();
  const { code } = useParams();
  const res = useMemo(() => decodeVerification(code || ''), [code]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-5">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
        <div className="bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-5 text-white text-center">
          <div className="text-2xl mb-1">🔎</div>
          <h1 className="text-lg font-bold">{t('Vérification de relevé', 'Transcript verification', 'Verificación de certificación')}</h1>
          <p className="text-brand-100 text-xs mt-0.5">NotesCam</p>
        </div>

        <div className="p-6">
          {!res.ok ? (
            <div className="text-center py-6">
              <div className="text-3xl mb-2">⚠️</div>
              <p className="text-sm text-gray-600 font-medium">
                {t('Code de vérification illisible ou invalide.',
                   'Verification code unreadable or invalid.',
                   'Código ilegible o inválido.')}
              </p>
            </div>
          ) : (
            <>
              <div className={`rounded-xl px-4 py-3 mb-5 flex items-center gap-3 ${res.valid ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
                <span className="text-2xl">{res.valid ? '✅' : '❌'}</span>
                <div>
                  <p className={`text-sm font-bold ${res.valid ? 'text-emerald-800' : 'text-red-800'}`}>
                    {res.valid
                      ? t('Relevé authentique', 'Authentic transcript', 'Certificación auténtica')
                      : t('Intégrité non confirmée', 'Integrity not confirmed', 'Integridad no confirmada')}
                  </p>
                  <p className={`text-xs ${res.valid ? 'text-emerald-600' : 'text-red-600'}`}>
                    {res.valid
                      ? t('Les données du QR sont cohérentes.', 'QR data is consistent.', 'Los datos del QR son coherentes.')
                      : t('Le contenu a pu être modifié.', 'Content may have been altered.', 'El contenido pudo ser alterado.')}
                  </p>
                </div>
              </div>

              {res.data?.sn && (
                <p className="text-center text-sm font-bold text-gray-900 mb-3">{res.data.sn}</p>
              )}

              <div className="bg-gray-50 rounded-xl px-4 py-2">
                <Row label={t('Élève', 'Student', 'Alumno')}              value={res.data?.n} />
                <Row label={t('Matricule', 'Reg. No.', 'Matrícula')}      value={res.data?.m} />
                <Row label={t('Classe', 'Class', 'Clase')}                value={res.data?.c} />
                <Row label={t('Année', 'Year', 'Año')}                    value={res.data?.y} />
                <Row label={t('Moyenne annuelle', 'Annual average', 'Media anual')} value={res.data?.a} />
                <Row label={t('Rang', 'Rank', 'Puesto')}                  value={res.data?.r} />
                <Row label={t('Décision', 'Decision', 'Decisión')}        value={res.data?.d} />
              </div>

              <p className="text-[11px] text-gray-400 mt-4 leading-relaxed text-center">
                {t("Comparez ces informations avec le relevé papier. Toute divergence indique une falsification. Ce document n'est valable qu'avec la signature et le cachet du chef d'établissement.",
                   'Compare this information with the paper transcript. Any discrepancy indicates forgery. Valid only with the signature and stamp of the head of school.',
                   'Compare con el documento en papel. Cualquier discrepancia indica falsificación. Válido solo con firma y sello del director.')}
              </p>
            </>
          )}

          <div className="mt-6 text-center">
            <Link to="/" className="text-xs text-brand-600 hover:text-brand-700 font-medium">← {t('Accueil', 'Home', 'Inicio')}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
