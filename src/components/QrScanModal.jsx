// Scanner le QR code d'une carte scolaire → affiche les infos de l'élève.
//
// Décodage 100 % local (jsQR) : la caméra filme, on échantillonne chaque image
// dans un canvas hors-écran et on cherche un QR. Dès qu'un code est lu, on
// appelle `lookup(code)` (fourni par le parent) pour retrouver l'élève, puis on
// affiche une fiche express. Aucun réseau requis → marche hors-ligne / LAN.

import { useEffect, useRef, useState, useCallback } from 'react';
import jsQR from 'jsqr';
import Modal from './Modal';
import StudentAvatar from './StudentAvatar';
import { useT } from '../lib/i18n';

export default function QrScanModal({ open, onClose, lookup, onView, classNameById }) {
  const t = useT();
  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const rafRef    = useRef(0);
  const canvasRef = useRef(null);
  const [error, setError]   = useState('');
  const [ready, setReady]   = useState(false);
  const [result, setResult] = useState(null); // { student } trouvé
  const [notFound, setNotFound] = useState('');

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  // Boucle de décodage : tant qu'aucun élève trouvé, on scanne chaque frame.
  const scanLoop = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) { rafRef.current = requestAnimationFrame(scanLoop); return; }
    const canvas = canvasRef.current || (canvasRef.current = document.createElement('canvas'));
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) { rafRef.current = requestAnimationFrame(scanLoop); return; }
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const code = jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
    if (code?.data) {
      const student = lookup?.(code.data.trim());
      if (student) { stop(); setResult({ student }); return; }
      // Code lu mais inconnu (autre école / QR étranger) → on signale et continue.
      setNotFound(t('Carte non reconnue. Réessayez.', 'Card not recognized. Try again.', 'Tarjeta no reconocida. Inténtelo de nuevo.'));
    }
    rafRef.current = requestAnimationFrame(scanLoop);
  }, [lookup, stop, t]);

  const start = useCallback(async () => {
    setError(''); setNotFound(''); setReady(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t('Caméra non disponible sur cet appareil/navigateur.',
                 'Camera not available on this device/browser.',
                 'Cámara no disponible en este dispositivo/navegador.'));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setReady(true);
      rafRef.current = requestAnimationFrame(scanLoop);
    } catch (err) {
      console.error('getUserMedia (scan)', err);
      setError(
        err?.name === 'NotAllowedError'
          ? t('Accès à la caméra refusé. Autorisez-le dans le navigateur.',
              'Camera access denied. Allow it in your browser.',
              'Acceso a la cámara denegado. Permítalo en el navegador.')
          : t("Impossible d'ouvrir la caméra.", 'Unable to open the camera.', 'No se pudo abrir la cámara.')
      );
    }
  }, [scanLoop, t]);

  useEffect(() => {
    if (!open) return undefined;
    setResult(null);
    start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const handleClose = () => { stop(); onClose?.(); };
  const rescan = () => { setResult(null); setNotFound(''); start(); };

  const s = result?.student;

  return (
    <Modal onClose={handleClose} title={t('Scanner une carte', 'Scan a card', 'Escanear una tarjeta')} size="md">
      <div className="space-y-4">
        {!result ? (
          <>
            <div className="relative mx-auto rounded-xl overflow-hidden bg-slate-900"
                 style={{ width: 320, height: 320, maxWidth: '100%' }}>
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
              {/* Cadre de visée */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div style={{ width: 200, height: 200, border: '3px solid rgba(255,255,255,0.9)', borderRadius: 16, boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)' }} />
              </div>
              {!ready && !error && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-300 text-sm animate-pulse">
                  {t('Ouverture de la caméra…', 'Opening camera…', 'Abriendo la cámara…')}
                </div>
              )}
            </div>
            <p className="text-xs text-center text-gray-500">
              {t('Présentez le QR code de la carte devant la caméra.',
                 'Hold the card’s QR code in front of the camera.',
                 'Coloque el código QR de la tarjeta frente a la cámara.')}
            </p>
            {notFound && <p className="text-sm text-amber-600 text-center">{notFound}</p>}
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          </>
        ) : (
          <div className="text-center">
            <div className="flex flex-col items-center gap-2 py-2">
              <StudentAvatar student={s} size={88} />
              <div className="text-lg font-bold text-gray-900">{s.name}</div>
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-gray-600">
                {classNameById && <span><strong>{t('Classe', 'Class', 'Clase')} :</strong> {classNameById(s.class_id) || '—'}</span>}
                <span><strong>{t('Matricule', 'ID', 'Matrícula')} :</strong> {s.matricule || '—'}</span>
                {s.gender && <span><strong>{t('Sexe', 'Sex', 'Sexo')} :</strong> {s.gender}</span>}
                {s.date_naissance && <span><strong>{t('Né(e) le', 'DOB', 'Nac.')} :</strong> {s.date_naissance}</span>}
              </div>
            </div>
            <div className="flex justify-center gap-2 mt-4">
              <button type="button" onClick={rescan} className="btn-secondary" style={{ width: 'auto' }}>
                {t('Scanner un autre', 'Scan another', 'Escanear otro')}
              </button>
              {onView && (
                <button type="button" onClick={() => { onView(s); handleClose(); }} className="btn-primary"
                  style={{ width: 'auto', paddingInline: '1.5rem' }}>
                  {t('Voir la fiche', 'View profile', 'Ver ficha')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
