// Logo NotesCam (N-mark) — version Remotion du composant src/components/LogoMark.jsx.
// Pas de useId() ici : un id de gradient fixe suffit dans le rendu vidéo isolé.
export function Logo({ size = 200 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="NotesCam"
    >
      <defs>
        <linearGradient id="ncLogoGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1d4ed8" />
          <stop offset="100%" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#ncLogoGrad)" />
      <rect width="64" height="32" rx="15" fill="white" fillOpacity="0.08" />
      <path d="M13 14H21.5V50H13V14Z M42.5 14H51V50H42.5V14Z" fill="white" />
      <path d="M21.5 14H29.5L42.5 50H34.5Z" fill="white" />
    </svg>
  );
}
