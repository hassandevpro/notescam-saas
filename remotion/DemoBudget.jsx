// Vidéo de DÉMONSTRATION — module Budget & Dépenses.
//
// Contrairement à NotesCamPromo.jsx (animations 100 % générées), cette vidéo
// montre l'APPLICATION RÉELLE : chaque plan est une capture d'écran prise par
// `remotion/recorder/record-demos.mjs` sur le serveur LAN de démonstration
// (COLLÈGE LA RETRAITE), avec la narration française correspondante.
//
// Les captures et l'audio ne sont PAS versionnés : ils sont régénérés dans
// `out/demo-assets/`, passé à Remotion via `--public-dir`. Voir README.md.
//
// Chaque plan reçoit une boîte `focus` (coordonnées CSS 1920×1080 relevées par
// Playwright au moment de la capture) : la caméra zoome lentement dessus et un
// cadre la souligne. Aucune coordonnée n'est écrite à la main.
import { useEffect, useState } from 'react';
import {
  AbsoluteFill, Audio, Img, Sequence, staticFile,
  interpolate, spring, useCurrentFrame, useVideoConfig,
  delayRender, continueRender,
} from 'remotion';
import { COLORS, FONT, BRAND_GRADIENT } from './theme.js';
import { Logo } from './Logo.jsx';

export const FPS = 30;
const BASE_W = 1920, BASE_H = 1080;
const sec = (s) => Math.round(s * FPS);

// ── Montage ───────────────────────────────────────────────────────────────────
// `audio` : piste de narration (durée réelle mesurée à la génération).
// `shot`  : capture affichée ; absent = carton plein écran.
// `focus` : surbrillance — soit la boîte du manifeste (`fromManifest`), soit une
//           boîte explicite quand on veut souligner autre chose que l'élément
//           repéré à la capture.
export const SCENES = [
  {
    id: 'titre', audio: 's1', dur: 13.14, kind: 'carton',
    titre: 'Budget & Dépenses',
    sous: 'Contrôle de l’exécution budgétaire — démonstration',
  },
  {
    id: 'enveloppe', audio: 's2', dur: 22.15, shot: 's2-enveloppe',
    chapitre: 'L’enveloppe annuelle',
    legende: '45 000 000 XAF votés · réparti, engagé, disponible',
    zoom: { scale: 1.22, x: 0.5, y: 0.26 },
  },
  {
    id: 'lignes', audio: 's3', dur: 22.57, shot: 's3-lignes',
    chapitre: 'Rubriques et lignes',
    legende: 'Chaque ligne affiche sa consommation réelle',
    zoom: { scale: 1.18, x: 0.5, y: 0.6 },
  },
  {
    id: 'imputation', audio: 's4', dur: 20.99, shot: 's4-periodes',
    chapitre: 'Période et secteur',
    legende: 'Alloué · engagé · disponible, par trimestre et par école',
    zoom: { scale: 1.3, x: 0.5, y: 0.38 },
  },
  {
    id: 'seuil-raf', audio: 's5', dur: 21.92, shot: 's5-raf-casA',
    chapitre: 'Connecté en RAF',
    legende: '85 000 XAF — aucun bouton Approuver',
    badge: 'RAF · seuil 25 000',
    zoom: { scale: 1.5, x: 0.55, y: 0.66 },
  },
  {
    id: 'seuil-coord', audio: 's6', dur: 16.25, shot: 's6-coord-casA',
    chapitre: 'Connecté en Coordonnateur général',
    legende: 'Même dépense — « Approuver » apparaît',
    badge: 'Coordonnateur · 25 000 à 250 000',
    zoom: { scale: 1.5, x: 0.55, y: 0.68 },
  },
  {
    id: 'seuil-fond', audio: 's7', dur: 23.87, shot: 's7-coord-casD',
    shot2: 's7-fond-casD', // bascule à mi-plan : même écran, autorité supérieure
    chapitre: 'Au-delà de 250 000',
    legende: '1 250 000 XAF — bloqué au Coordonnateur, ouvert à la Fondatrice',
    badge: 'Fondatrice · au-delà de 250 000',
    zoom: { scale: 1.5, x: 0.55, y: 0.63 },
  },
  {
    id: 'rallonge', audio: 's8', dur: 18.53, shot: 's8-securite',
    chapitre: 'Ligne épuisée',
    legende: 'Dépense bloquée jusqu’à une rallonge tracée',
    zoom: { scale: 1.25, x: 0.5, y: 0.25 },
  },
  {
    id: 'consolidation', audio: 's9', dur: 21.59, shot: 's9-global',
    chapitre: 'Exécution consolidée',
    legende: 'Prévu · engagé · payé · disponible — 67 % du budget consommé',
    zoom: { scale: 1.16, x: 0.5, y: 0.3 },
    final: true,
  },
];

export const DEMO_DURATION = sec(SCENES.reduce((s, x) => s + x.dur, 0));

// Début de chaque scène, en frames.
const starts = (() => {
  let t = 0;
  return SCENES.map((s) => { const a = t; t += sec(s.dur); return a; });
})();

// ── Pièces d'interface ────────────────────────────────────────────────────────

// Entrée/sortie en fondu, bornée aux extrémités de la scène.
const fade = (frame, dur, inF = 12, outF = 12) =>
  Math.min(
    interpolate(frame, [0, inF], [0, 1], { extrapolateRight: 'clamp' }),
    interpolate(frame, [dur - outF, dur], [1, 0], { extrapolateLeft: 'clamp' }),
  );

function Carton({ titre, sous, frame, dur }) {
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 200, mass: 0.6 } });
  const o = fade(frame, dur, 18, 20);
  return (
    <AbsoluteFill style={{
      background: BRAND_GRADIENT, alignItems: 'center', justifyContent: 'center',
      fontFamily: FONT, opacity: o,
    }}>
      <div style={{ transform: `scale(${0.85 + pop * 0.15})`, textAlign: 'center' }}>
        <Logo size={150} />
        <div style={{
          color: COLORS.white, fontSize: 92, fontWeight: 800,
          letterSpacing: -2, marginTop: 44,
        }}>{titre}</div>
        <div style={{
          color: 'rgba(255,255,255,.82)', fontSize: 34, marginTop: 18, fontWeight: 500,
        }}>{sous}</div>
        <div style={{
          color: 'rgba(255,255,255,.6)', fontSize: 23, marginTop: 52,
          letterSpacing: 3, textTransform: 'uppercase',
        }}>COLLÈGE LA RETRAITE · données de démonstration</div>
      </div>
    </AbsoluteFill>
  );
}

// Bandeau bas : chapitre + légende. Glisse depuis le bas, repart à la fin.
function Bandeau({ chapitre, legende, badge, frame, dur }) {
  const { fps } = useVideoConfig();
  const up = spring({ frame: frame - 8, fps, config: { damping: 200 } });
  const out = interpolate(frame, [dur - 14, dur], [0, 70], { extrapolateLeft: 'clamp' });
  return (
    <div style={{
      position: 'absolute', left: 64, right: 64, bottom: 56, fontFamily: FONT,
      transform: `translateY(${(1 - up) * 70 + out}px)`,
      opacity: fade(frame, dur, 14, 14),
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 32,
    }}>
      <div style={{
        background: 'rgba(15,23,42,.93)', borderRadius: 20, padding: '24px 34px',
        backdropFilter: 'blur(10px)', borderLeft: `6px solid ${COLORS.brand500}`,
        boxShadow: '0 22px 60px rgba(0,0,0,.4)', maxWidth: 1180,
      }}>
        <div style={{ color: COLORS.white, fontSize: 40, fontWeight: 700, letterSpacing: -0.5 }}>
          {chapitre}
        </div>
        <div style={{ color: COLORS.slate400, fontSize: 25, marginTop: 8, fontWeight: 500 }}>
          {legende}
        </div>
      </div>
      {badge ? (
        <div style={{
          background: BRAND_GRADIENT, color: COLORS.white, borderRadius: 999,
          padding: '16px 30px', fontSize: 24, fontWeight: 700, whiteSpace: 'nowrap',
          boxShadow: '0 16px 40px rgba(67,56,202,.5)',
        }}>{badge}</div>
      ) : null}
    </div>
  );
}

// Cadre clignotant posé sur la boîte `focus`, en coordonnées de la capture.
function Surbrillance({ box, frame, dur }) {
  if (!box) return null;
  const pad = 10;
  const appear = interpolate(frame, [20, 38], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const pulse = 0.55 + 0.45 * Math.sin((frame / FPS) * 2.4);
  return (
    <div style={{
      position: 'absolute',
      left: box.x - pad, top: box.y - pad,
      width: box.width + pad * 2, height: box.height + pad * 2,
      border: `4px solid rgba(102,126,234,${0.5 + 0.5 * pulse})`,
      borderRadius: 12,
      boxShadow: `0 0 0 9999px rgba(15,23,42,${0.3 * appear}), 0 0 32px rgba(102,126,234,.75)`,
      opacity: appear * fade(frame, dur, 1, 12),
    }} />
  );
}

// Un plan : la capture, zoomée lentement vers `zoom`, avec sa surbrillance.
function Plan({ scene, box, frame, dur }) {
  const z = scene.zoom || { scale: 1.1, x: 0.5, y: 0.5 };
  // Zoom continu sur toute la scène : lent, sans à-coup.
  const s = interpolate(frame, [0, dur], [1.02, z.scale], { extrapolateRight: 'clamp' });
  // Origine du zoom exprimée en pourcentage de l'image.
  const ox = z.x * 100, oy = z.y * 100;

  // Scène à deux captures (Coordonnateur -> Fondatrice) : bascule à 55 %.
  // COUPE FRANCHE assumée, pas un fondu : c'est le changement d'autorité qui
  // doit sauter aux yeux, et un fondu entre deux écrans quasi identiques se
  // lirait comme un flou plutôt que comme une bascule. Un bref éclair signale
  // la coupe sans brouiller la comparaison.
  const bascule = scene.shot2 ? Math.round(dur * 0.55) : null;
  const shot = bascule !== null && frame >= bascule ? scene.shot2 : scene.shot;
  const eclair = bascule === null ? 0
    : interpolate(frame, [bascule - 2, bascule, bascule + 5], [0, 0.5, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: COLORS.ink, opacity: fade(frame, dur, 14, 14) }}>
      <div style={{
        width: BASE_W, height: BASE_H, position: 'relative',
        transform: `scale(${s})`, transformOrigin: `${ox}% ${oy}%`,
      }}>
        <Img src={staticFile(`shots/${shot}.png`)} style={{ width: BASE_W, height: BASE_H, display: 'block' }} />
        <Surbrillance box={box} frame={frame} dur={dur} />
      </div>
      {eclair > 0 ? (
        <AbsoluteFill style={{ background: COLORS.white, opacity: eclair, pointerEvents: 'none' }} />
      ) : null}
    </AbsoluteFill>
  );
}

// Fondu au noir + signature sur le dernier plan.
function Signature({ frame, dur }) {
  const o = interpolate(frame, [dur - 100, dur - 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (o <= 0) return null;
  return (
    <AbsoluteFill style={{
      background: BRAND_GRADIENT, opacity: o, alignItems: 'center',
      justifyContent: 'center', fontFamily: FONT,
    }}>
      <Logo size={132} />
      <div style={{ color: COLORS.white, fontSize: 70, fontWeight: 800, marginTop: 36, letterSpacing: -1.5 }}>
        NotesCam
      </div>
      <div style={{ color: 'rgba(255,255,255,.8)', fontSize: 29, marginTop: 14 }}>
        Chaque décision laisse une trace.
      </div>
    </AbsoluteFill>
  );
}

// ── Composition ───────────────────────────────────────────────────────────────
// Le manifeste est lu AU RENDU (pas à la compilation) : sans lui, la vidéo se
// rend quand même, simplement sans cadre de surbrillance — et surtout les
// compositions promo ne dépendent pas de la présence de `out/demo-assets/`.
export function DemoBudget() {
  const [manifest, setManifest] = useState(null);
  const [handle] = useState(() => delayRender('manifeste des captures'));

  useEffect(() => {
    let vivant = true;
    fetch(staticFile('manifest.json'))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((m) => { if (vivant) { setManifest(m); continueRender(handle); } });
    return () => { vivant = false; };
  }, [handle]);

  const boxOf = (id) => manifest?.shots?.find((s) => s.id === id)?.box || null;

  return (
    <AbsoluteFill style={{ background: COLORS.ink }}>
      {SCENES.map((scene, i) => {
        const dur = sec(scene.dur);
        return (
          <Sequence key={scene.id} from={starts[i]} durationInFrames={dur} name={scene.id}>
            <SceneBody scene={scene} dur={dur} box={boxOf(scene.shot)} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}

// Séparé pour que `useCurrentFrame()` soit relatif à la Sequence.
function SceneBody({ scene, dur, box }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Audio src={staticFile(`audio/${scene.audio}.mp3`)} />
      {scene.kind === 'carton'
        ? <Carton titre={scene.titre} sous={scene.sous} frame={frame} dur={dur} />
        : (
          <>
            <Plan scene={scene} box={box} frame={frame} dur={dur} />
            <Bandeau
              chapitre={scene.chapitre} legende={scene.legende} badge={scene.badge}
              frame={frame} dur={dur}
            />
            {scene.final ? <Signature frame={frame} dur={dur} /> : null}
          </>
        )}
    </AbsoluteFill>
  );
}
