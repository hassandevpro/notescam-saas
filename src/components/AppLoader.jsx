// Animation de chargement commune à toute l'application.
//
// POURQUOI. Sur les PC d'école, un morceau de page peut mettre plusieurs
// secondes à arriver. Un « Chargement… » qui clignote donne l'impression que
// rien ne se passe ; ici le mouvement est continu (anneau + barre), le message
// change toutes les ~3 s, et au-delà de 10 s on dit explicitement que c'est
// normal d'attendre plutôt que de laisser croire à un blocage.
//
// - Apparition retardée de 150 ms (CSS) : une page qui charge en 100 ms ne
//   fait pas clignoter un écran de chargement.
// - `prefers-reduced-motion` : les animations sont coupées (index.css).
// - Même rendu que l'écran statique d'index.html, pour qu'il n'y ait pas de
//   saut visuel entre le premier affichage et React.
import { useEffect, useState } from 'react';
import { useT } from '../lib/i18n';

function Mark({ size = 56 }) {
  return (
    <div className="nc-loader-mark" style={{ width: size, height: size }} aria-hidden="true">
      <span className="nc-loader-ring" />
      <span className="nc-loader-ring nc-loader-ring-2" />
      <span className="nc-loader-logo">N</span>
    </div>
  );
}

function useRotatingMessage(messages, slowMessage) {
  const [i, setI] = useState(0);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const rot = setInterval(() => setI((n) => (n + 1) % messages.length), 3000);
    const late = setTimeout(() => setSlow(true), 10000);
    return () => { clearInterval(rot); clearTimeout(late); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);
  return slow ? slowMessage : messages[i];
}

// Plein cadre : changement de page / démarrage.
export default function AppLoader({ fullScreen = false }) {
  const t = useT();
  const msg = useRotatingMessage(
    [
      t('Chargement en cours…', 'Loading…', 'Cargando…'),
      t('Préparation de vos données…', 'Getting your data ready…', 'Preparando sus datos…'),
      t('Presque prêt…', 'Almost there…', 'Casi listo…'),
    ],
    t('Cela prend un peu plus de temps que d’habitude — merci de patienter.',
      'This is taking a bit longer than usual — thanks for waiting.',
      'Esto tarda un poco más de lo habitual — gracias por esperar.'),
  );
  return (
    <div
      className={`nc-loader ${fullScreen ? 'nc-loader-full' : ''}`}
      role="status" aria-live="polite" aria-busy="true"
    >
      <Mark />
      <p className="nc-loader-msg" key={msg}>{msg}</p>
      <div className="nc-loader-bar" aria-hidden="true"><span /></div>
    </div>
  );
}

// En ligne, dans une carte ou sous un titre : remplace les « Chargement… ».
export function InlineLoader({ label }) {
  const t = useT();
  return (
    <div className="nc-loader nc-loader-inline" role="status" aria-live="polite" aria-busy="true">
      <Mark size={36} />
      <p className="nc-loader-msg">{label || t('Chargement…', 'Loading…', 'Cargando…')}</p>
      <div className="nc-loader-bar" aria-hidden="true"><span /></div>
    </div>
  );
}
