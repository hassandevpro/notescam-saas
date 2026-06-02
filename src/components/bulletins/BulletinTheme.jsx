// Wrapper qui applique le thème visuel propre à l'école sur n'importe quel
// bulletin (Classique, Moderne, APC, Boletín…).
// Injecte des variables CSS que les .bulletin-* peuvent consommer pour des
// variations légères mais distinctes d'une école à l'autre.

import { getSchoolTheme } from '../../lib/schoolTheme';

export default function BulletinTheme({ school, children }) {
  if (!school) return children;
  const theme = getSchoolTheme(school);

  return (
    <div
      className="bulletin-themed"
      style={{
        ...theme.cssVars,
        // Filigrane discret (nom de l'école) en fond — visible seulement à l'écran,
        // jamais à l'impression pour ne pas gêner la lisibilité.
        position: 'relative',
      }}
      data-school-shape={theme.cardShape}
      data-school-header={theme.headerStyle}
    >
      {theme.showWatermark && (
        <div
          aria-hidden
          className="no-print"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            opacity: 0.04,
            zIndex: 0,
          }}
        >
          <div
            style={{
              transform: 'rotate(-30deg)',
              fontSize: '4.5rem',
              fontWeight: 900,
              color: 'var(--school-primary)',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
            }}
          >
            {school.name || 'NotesCam'}
          </div>
        </div>
      )}
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  );
}
