import { Composition } from 'remotion';
import { NotesCamPromo, PROMO_DURATION } from './NotesCamPromo.jsx';
import { DemoBudget, DEMO_DURATION, FPS as DEMO_FPS } from './DemoBudget.jsx';

const FPS = 30;

// Un format = une combinaison dimensions × langue.
// Les ids servent à la commande `remotion render <id>`.
const FORMATS = [
  { suffix: 'Vertical', width: 1080, height: 1920 }, // Reels / TikTok / Status WhatsApp
  { suffix: 'Square', width: 1080, height: 1080 },    // Fil Facebook / Instagram
  { suffix: 'Landscape', width: 1920, height: 1080 }, // YouTube / présentation
];

const LANGS = [
  { code: 'fr', tag: 'FR' },
  { code: 'es', tag: 'ES' },
];

export function RemotionRoot() {
  return (
    <>
      {LANGS.flatMap((lang) =>
        FORMATS.map((f) => (
          <Composition
            key={`${lang.tag}-${f.suffix}`}
            id={`Promo-${lang.tag}-${f.suffix}`}
            component={NotesCamPromo}
            durationInFrames={PROMO_DURATION}
            fps={FPS}
            width={f.width}
            height={f.height}
            defaultProps={{ lang: lang.code }}
          />
        )),
      )}

      {/* Démo produit : captures réelles de l'application + narration.
          Nécessite `--public-dir out/demo-assets` (cf. remotion/README.md). */}
      <Composition
        id="Demo-Budget-FR"
        component={DemoBudget}
        durationInFrames={DEMO_DURATION}
        fps={DEMO_FPS}
        width={1920}
        height={1080}
      />
    </>
  );
}
