// Capture d'une photo d'élève via la caméra (webcam / téléphone), un à la fois.
//
// Flux : ouvre getUserMedia → aperçu vidéo en direct → « Capturer » fige une
// image → « Utiliser » renvoie un Blob JPEG au parent (qui le passe ensuite
// dans resizeImageToSquare, comme pour un fichier choisi). Le flux caméra est
// systématiquement arrêté à la fermeture (libère le voyant caméra).

import { useEffect, useRef, useState, useCallback } from 'react';
import Modal from './Modal';
import { useT } from '../lib/i18n';

export default function CameraCaptureModal({ open, onClose, onCapture }) {
  const t = useT();
  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const [facing, setFacing]   = useState('user'); // 'user' (frontale) | 'environment' (arrière)
  const [error, setError]     = useState('');
  const [ready, setReady]     = useState(false);
  const [shot, setShot]       = useState(null);    // { url, blob } image figée

  // Coupe le flux caméra et libère la ressource.
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  // (Re)démarre la caméra avec l'orientation choisie.
  const startStream = useCallback(async () => {
    setError('');
    setReady(false);
    stopStream();
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t('Caméra non disponible sur cet appareil/navigateur.',
                 'Camera not available on this device/browser.',
                 'Cámara no disponible en este dispositivo/navegador.'));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setReady(true);
    } catch (err) {
      console.error('getUserMedia', err);
      setError(
        err?.name === 'NotAllowedError'
          ? t('Accès à la caméra refusé. Autorisez-le dans le navigateur.',
              'Camera access denied. Allow it in your browser.',
              'Acceso a la cámara denegado. Permítalo en el navegador.')
          : t("Impossible d'ouvrir la caméra.", 'Unable to open the camera.', 'No se pudo abrir la cámara.')
      );
    }
  }, [facing, stopStream, t]);

  // Démarre/arrête le flux au gré de l'ouverture et du choix d'orientation.
  useEffect(() => {
    if (!open) return undefined;
    if (!shot) startStream();
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facing]);

  // Réinitialise l'état à chaque réouverture.
  useEffect(() => {
    if (open) { setShot(null); setError(''); }
  }, [open]);

  if (!open) return null;

  // Fige l'image courante de la vidéo dans un canvas → Blob JPEG.
  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    // Recadre au carré centré (la photo finale est carrée de toute façon).
    const side = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - side) / 2;
    const sy = (video.videoHeight - side) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = side;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, sx, sy, side, side, 0, 0, side, side);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
    if (!blob) return;
    stopStream();
    setShot({ url: URL.createObjectURL(blob), blob });
  };

  const retake = () => {
    if (shot?.url) URL.revokeObjectURL(shot.url);
    setShot(null);
  };

  const use = () => {
    if (!shot) return;
    onCapture?.(shot.blob);
    if (shot.url) URL.revokeObjectURL(shot.url);
    onClose?.();
  };

  const handleClose = () => {
    stopStream();
    if (shot?.url) URL.revokeObjectURL(shot.url);
    onClose?.();
  };

  return (
    <Modal onClose={handleClose} title={t('Prendre une photo', 'Take a photo', 'Tomar una foto')} size="md">
      <div className="space-y-4">
        {/* Zone caméra / aperçu figé — carré */}
        <div className="relative mx-auto rounded-xl overflow-hidden bg-slate-900"
             style={{ width: 320, height: 320, maxWidth: '100%' }}>
          {shot ? (
            <img src={shot.url} alt="" className="w-full h-full object-cover" />
          ) : (
            <video ref={videoRef} playsInline muted
              className="w-full h-full object-cover"
              style={{ transform: facing === 'user' ? 'scaleX(-1)' : 'none' }} /* effet miroir frontale */
            />
          )}
          {!ready && !shot && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-300 text-sm animate-pulse">
              {t('Ouverture de la caméra…', 'Opening camera…', 'Abriendo la cámara…')}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-500 text-center">{error}</p>}

        {/* Actions */}
        <div className="flex justify-center gap-2">
          {shot ? (
            <>
              <button type="button" onClick={retake} className="btn-secondary" style={{ width: 'auto' }}>
                {t('Reprendre', 'Retake', 'Repetir')}
              </button>
              <button type="button" onClick={use} className="btn-primary" style={{ width: 'auto', paddingInline: '1.5rem' }}>
                {t('Utiliser cette photo', 'Use this photo', 'Usar esta foto')}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
                disabled={!ready} className="btn-secondary disabled:opacity-50" style={{ width: 'auto' }}
                title={t('Changer de caméra', 'Switch camera', 'Cambiar de cámara')}>
                ⇄ {t('Caméra', 'Camera', 'Cámara')}
              </button>
              <button type="button" onClick={capture} disabled={!ready} className="btn-primary disabled:opacity-50"
                style={{ width: 'auto', paddingInline: '1.5rem' }}>
                📷 {t('Capturer', 'Capture', 'Capturar')}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
