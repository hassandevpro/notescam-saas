import { Composition } from 'remotion';
import { NotesCamPromo, PROMO_DURATION } from './NotesCamPromo.jsx';

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
    </>
  );
}
