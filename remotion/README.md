# Vidéos NotesCam (Remotion)

Deux familles de vidéos, générées avec [Remotion](https://www.remotion.dev/). Le bundler
de Remotion est **totalement isolé** du build Vite de l'application : rien ici n'impacte
`npm run dev` / `npm run build`.

| Famille | Compositions | Contenu à l'image |
|---|---|---|
| **Promo** (marketing) | `Promo-FR-*`, `Promo-ES-*` | animations 100 % générées en code |
| **Démo** (formation / avant-vente) | `Demo-Budget-FR` | **captures réelles de l'application** + narration |

La partie « Promo » est documentée ci-dessous ; la démo produit a sa propre section
[Vidéos de démonstration](#vidéos-de-démonstration-captures-réelles).

## Démarrer le studio (aperçu interactif)

```bash
npm run video
```

Ouvre l'interface Remotion : choisis une composition à gauche, lis l'aperçu, ajuste les
textes/timings, puis exporte.

## Compositions disponibles

Pour chaque langue (`FR` = Cameroun, `ES` = Guinée Équatoriale) et chaque format :

| id                    | Dimensions   | Usage                              |
|-----------------------|--------------|------------------------------------|
| `Promo-FR-Vertical`   | 1080×1920    | Reels / TikTok / Status WhatsApp   |
| `Promo-FR-Square`     | 1080×1080    | Fil Facebook / Instagram           |
| `Promo-FR-Landscape`  | 1920×1080    | YouTube / présentation             |
| `Promo-ES-Vertical`   | 1080×1920    | idem, en espagnol                  |
| `Promo-ES-Square`     | 1080×1080    | idem, en espagnol                  |
| `Promo-ES-Landscape`  | 1920×1080    | idem, en espagnol                  |

## Exporter une vidéo (MP4)

```bash
# Format vertical français pour WhatsApp Status
npm run video:render -- Promo-FR-Vertical out/promo-fr-vertical.mp4

# Version espagnole carrée pour Facebook
npm run video:render -- Promo-ES-Square out/promo-es-square.mp4
```

Les fichiers sortent dans `out/` (ignoré par git).

## Modifier le contenu

- **Textes / slogans** → `remotion/content.js` (blocs `fr` et `es`)
- **Couleurs / police** → `remotion/theme.js` (calé sur `tailwind.config.js`)
- **Logo** → `remotion/Logo.jsx` (repris de `src/components/LogoMark.jsx`)
- **Scènes & animations** → `remotion/scenes.jsx`
- **Montage / durées** → `remotion/NotesCamPromo.jsx`
- **Formats & langues** → `remotion/Root.jsx`

---

## Vidéos de démonstration (captures réelles)

`Demo-Budget-FR` (1920×1080, ~2 min 55) montre le circuit **Budget → Dépense →
Autorisation → Rallonge → Traçabilité** sur l'établissement de démonstration
COLLÈGE LA RETRAITE. Son intérêt tient à un plan : la **même dépense de 85 000 XAF**,
vue successivement par la RAF (aucun bouton « Approuver ») puis par le Coordonnateur
général (le bouton apparaît). Les seuils du cahier des charges — 25 000 et 250 000 —
se démontrent ainsi à l'écran, sans commentaire.

Les captures et l'audio **ne sont pas versionnés** : ils vivent dans `out/demo-assets/`
(ignoré par git) et se régénèrent.

### 1. Préparer la base et le serveur

```bash
node scripts/seed-college-la-retraite.mjs     # jeu de démonstration (si absent)
npm run build:lan                              # OBLIGATOIRE : sinon dist/ est le build cloud
NOTESCAM_DATA_DIR=server/data-demo PORT=8099 npm run server
```

### 2. Enregistrer les captures

```bash
npm run video:record            # --base, --out, --mdp si besoin
```

Écrit `out/demo-assets/shots/*.png` et `out/demo-assets/manifest.json`. Le manifeste
porte, pour chaque plan, la **boîte de l'élément à souligner**, relevée au moment de la
capture : la surbrillance suit donc l'interface, et aucune coordonnée n'est écrite à la
main dans la composition.

### 3. La narration

Neuf pistes `out/demo-assets/audio/s1.mp3` … `s9.mp3`, une par scène. Le texte exact de
chaque scène est dans `SCENES` (`remotion/DemoBudget.jsx`), avec sa durée en secondes.

Les pistes livrées ont été produites avec ElevenLabs, voix **Frédéric Nyobè** (français
d'accent africain), modèle `eleven_multilingual_v2`. Pour les refaire : régénérer chaque
scène, déposer les mp3 sous ce nom, et **reporter la durée réelle** de chaque piste dans
`SCENES[].dur` — c'est elle qui cale le montage, rien n'est recalé automatiquement.

### 4. Rendre

```bash
npx remotion render remotion/index.jsx Demo-Budget-FR out/demo-budget-fr.mp4 \
  --public-dir=out/demo-assets
```

`--public-dir` est indispensable : il pointe Remotion vers les assets générés plutôt que
vers le `public/` de l'application.

Si Remotion n'arrive pas à télécharger son Chrome Headless Shell (réseau filtré), réutilisez
celui de Playwright, déjà installé :

```bash
npx remotion render ... --browser-executable="$LOCALAPPDATA\ms-playwright\chromium-1223\chrome-win64\chrome.exe"
```

### Adapter la vidéo

- **Texte à l'écran, durées, ordre des plans** → `SCENES` dans `remotion/DemoBudget.jsx`
- **Cadrage / zoom d'un plan** → le champ `zoom` de la scène (`x`/`y` en fraction de l'image)
- **Quels écrans sont capturés** → `remotion/recorder/record-demos.mjs`

---

## Notes

- Les animations sont pilotées par la frame (`useCurrentFrame`, `interpolate`, `spring`).
  Les animations CSS classiques ne se rendent pas correctement dans une vidéo.
- Pour une vraie police Inter dans le rendu : `npm i @remotion/google-fonts` puis charger
  `@remotion/google-fonts/Inter` dans `theme.js`.
- Pour ajouter une musique : déposer un fichier dans `public/` et utiliser `<Audio>` +
  `staticFile()` dans `NotesCamPromo.jsx`.
