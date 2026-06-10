import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from 'remotion';
import { COLORS, BRAND_GRADIENT, FONT } from './theme.js';
import { Logo } from './Logo.jsx';

// ── Helpers d'animation ────────────────────────────────────────────────────

// Apparition fondu + glissement vertical, calée sur la frame.
function useRise(delay = 0, distance = 40) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return {
    opacity: interpolate(s, [0, 1], [0, 1]),
    transform: `translateY(${interpolate(s, [0, 1], [distance, 0])}px)`,
  };
}

// Fond dégradé commun à toutes les scènes.
function Backdrop({ children, style }) {
  return (
    <AbsoluteFill
      style={{
        background: BRAND_GRADIENT,
        fontFamily: FONT,
        color: COLORS.white,
        justifyContent: 'center',
        alignItems: 'center',
        padding: '8%',
        textAlign: 'center',
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

// Échelle de police relative au format (vertical / carré / paysage).
function useScale() {
  const { width, height } = useVideoConfig();
  return Math.min(width, height) / 1080;
}

// ── Scène 1 — Intro logo + tagline ──────────────────────────────────────────

export function IntroScene({ tagline }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = useScale();
  const pop = spring({ frame, fps, config: { damping: 12, mass: 0.6 } });
  const logoStyle = { transform: `scale(${interpolate(pop, [0, 1], [0.4, 1])})` };
  const tag = useRise(18);

  return (
    <Backdrop>
      <div style={logoStyle}>
        <Logo size={260 * k} />
      </div>
      <div style={{ marginTop: 48 * k, fontSize: 96 * k, fontWeight: 800, letterSpacing: -1 }}>
        NotesCam
      </div>
      <div style={{ ...tag, marginTop: 16 * k, fontSize: 44 * k, fontWeight: 500, opacity: 0.85 }}>
        {tagline}
      </div>
    </Backdrop>
  );
}

// ── Scène 2 — Le problème ────────────────────────────────────────────────────

export function ProblemScene({ problem }) {
  const k = useScale();
  const clock = useRise(6, 30);
  const line = useRise(24, 30);
  return (
    <Backdrop style={{ background: COLORS.ink }}>
      <div style={{ ...clock, fontSize: 150 * k, fontWeight: 800, color: COLORS.brand500 }}>
        {problem.time}
      </div>
      <div
        style={{
          ...line,
          marginTop: 40 * k,
          maxWidth: 900 * k,
          fontSize: 60 * k,
          fontWeight: 700,
          lineHeight: 1.2,
        }}
      >
        {problem.line}
      </div>
    </Backdrop>
  );
}

// ── Scène 3 — Fonctionnalités ────────────────────────────────────────────────

export function FeaturesScene({ title, features }) {
  const k = useScale();
  const head = useRise(4);
  return (
    <Backdrop style={{ justifyContent: 'center' }}>
      <div style={{ ...head, fontSize: 56 * k, fontWeight: 800, marginBottom: 60 * k, maxWidth: 950 * k }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 * k, width: '100%', maxWidth: 980 * k }}>
        {features.map((f, i) => (
          <FeatureRow key={i} icon={f.icon} text={f.text} delay={20 + i * 14} k={k} />
        ))}
      </div>
    </Backdrop>
  );
}

function FeatureRow({ icon, text, delay, k }) {
  const r = useRise(delay, 60);
  return (
    <div
      style={{
        ...r,
        display: 'flex',
        alignItems: 'center',
        gap: 28 * k,
        background: 'rgba(255,255,255,0.10)',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: 28 * k,
        padding: `${26 * k}px ${34 * k}px`,
        textAlign: 'left',
      }}
    >
      <span style={{ fontSize: 64 * k, lineHeight: 1 }}>{icon}</span>
      <span style={{ fontSize: 40 * k, fontWeight: 600, lineHeight: 1.25 }}>{text}</span>
    </div>
  );
}

// ── Scène 4 — Preuve sociale (chiffres) ──────────────────────────────────────

export function ProofScene({ proof }) {
  const k = useScale();
  return (
    <Backdrop>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 70 * k }}>
        {proof.map((p, i) => (
          <Stat key={i} value={p.value} label={p.label} delay={i * 18} k={k} />
        ))}
      </div>
    </Backdrop>
  );
}

function Stat({ value, label, delay, k }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 14, mass: 0.5 } });
  return (
    <div style={{ opacity: interpolate(s, [0, 1], [0, 1]), transform: `scale(${interpolate(s, [0, 1], [0.6, 1])})` }}>
      <div style={{ fontSize: 150 * k, fontWeight: 900, lineHeight: 1, letterSpacing: -2 }}>{value}</div>
      <div style={{ fontSize: 42 * k, fontWeight: 500, opacity: 0.85, marginTop: 8 * k }}>{label}</div>
    </div>
  );
}

// ── Scène 5 — Appel à l'action ───────────────────────────────────────────────

export function CtaScene({ cta }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = useScale();
  const pop = spring({ frame, fps, config: { damping: 12 } });
  const url = useRise(26, 30);
  // Léger battement sur le bouton URL pour attirer l'œil.
  const pulse = 1 + 0.03 * Math.sin((frame / fps) * Math.PI * 2);

  return (
    <Backdrop>
      <div style={{ transform: `scale(${interpolate(pop, [0, 1], [0.5, 1])})` }}>
        <Logo size={160 * k} />
      </div>
      <div style={{ marginTop: 36 * k, fontSize: 88 * k, fontWeight: 900 }}>{cta.line1}</div>
      <div style={{ fontSize: 46 * k, fontWeight: 500, opacity: 0.85, marginTop: 6 * k }}>{cta.line2}</div>
      <div
        style={{
          ...url,
          marginTop: 56 * k,
          transform: `${url.transform} scale(${pulse})`,
          background: COLORS.white,
          color: COLORS.indigo,
          fontWeight: 800,
          fontSize: 50 * k,
          padding: `${24 * k}px ${56 * k}px`,
          borderRadius: 999,
          boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
        }}
      >
        {cta.url}
      </div>
    </Backdrop>
  );
}

export { Easing };
