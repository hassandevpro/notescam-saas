# Vidéos marketing NotesCam (Remotion)

Vidéos promo générées en code avec [Remotion](https://www.remotion.dev/). Le bundler
de Remotion est **totalement isolé** du build Vite de l'application : rien ici n'impacte
`npm run dev` / `npm run build`.

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

## Notes

- Les animations sont pilotées par la frame (`useCurrentFrame`, `interpolate`, `spring`).
  Les animations CSS classiques ne se rendent pas correctement dans une vidéo.
- Pour une vraie police Inter dans le rendu : `npm i @remotion/google-fonts` puis charger
  `@remotion/google-fonts/Inter` dans `theme.js`.
- Pour ajouter une musique : déposer un fichier dans `public/` et utiliser `<Audio>` +
  `staticFile()` dans `NotesCamPromo.jsx`.
