import { AbsoluteFill, Series } from 'remotion';
import { CONTENT } from './content.js';
import {
  IntroScene,
  ProblemScene,
  FeaturesScene,
  ProofScene,
  CtaScene,
} from './scenes.jsx';

// Vidéo promo NotesCam. La même composition sert FR (Cameroun) et ES (Guinée Eq)
// selon la prop `lang`, et tous les formats (vertical / carré / paysage) via les
// dimensions de la <Composition>.
export function NotesCamPromo({ lang = 'fr' }) {
  const c = CONTENT[lang] ?? CONTENT.fr;
  return (
    <AbsoluteFill>
      <Series>
        <Series.Sequence durationInFrames={90}>
          <IntroScene tagline={c.tagline} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <ProblemScene problem={c.problem} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={195}>
          <FeaturesScene title={c.featuresTitle} features={c.features} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <ProofScene proof={c.proof} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <CtaScene cta={c.cta} />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
}

// Durée totale (doit correspondre à la somme ci-dessus) — réutilisée dans Root.
export const PROMO_DURATION = 90 + 120 + 195 + 120 + 120; // 645 frames
