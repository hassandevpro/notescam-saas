# DocumentScaleManager + `<DocumentAssets />`

> Moteur de dimensionnement intelligent des éléments graphiques de tous les
> documents NotesCam. **Plus aucune taille fixe** (80/100/120px…) : toutes les
> dimensions sont calculées en proportion de la page, selon le type de document,
> l'orientation et les dimensions de page.

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/lib/documentScale.js` | **DocumentScaleManager** — calcul pur des tailles (`createDocumentScale`). |
| `src/components/DocumentAssets.jsx` | **Composant unique** : logo, tampon, signature, filigrane (+ `SealedSignature`). |

## Moteur — `createDocumentScale`

```js
const scale = createDocumentScale({
  docType: 'diploma',      // ou category: 'prestige' | 'standard' | 'compact'
  orientation: 'landscape',
  pageWidth: 1273,         // px (documents capturés) ou mm (feuilles HTML)
  pageHeight: 900,
});
// → { logo, logoSm, ministryLogo, stamp, signatureWidth, signatureHeight,
//     watermark, watermarkOpacity, medal, badge, ornament, category, … }
```

Unité-agnostique : la valeur de retour est dans la **même unité** que `pageWidth`.

### Catégories (fractions de la largeur de page)

| Métrique | prestige | standard | compact |
|---|---|---|---|
| logo | 0.12 | 0.10 | 0.12 |
| logoSm (en-tête) | 0.058 | 0.05 | 0.07 |
| ministryLogo | 0.05 | 0.045 | 0.097 |
| stamp (carré) | 0.12 | 0.11 | 0.076 |
| signatureWidth | 0.22 | 0.20 | 0.17 |
| signatureHeight | 0.05 | 0.07 | 0.045 |
| watermark | 0.52 | 0.48 | 0.35 |
| medal | 0.12 | 0.10 | 0.09 |
| badge | 0.044 | 0.045 | 0.04 |
| ornament | 0.115 | 0.10 | 0.09 |
| opacité filigrane | 0.04 | 0.05 | 0.05 |

- **prestige** → diplôme d'excellence, tableau d'honneur, major, certificats → logos / tampons / signatures **beaucoup plus grands**.
- **standard** → bulletins, relevés, procès-verbaux → taille intermédiaire.
- **compact** → cartes scolaires / élèves → taille réduite.

Mapping `docType → catégorie` dans `TYPE_CATEGORY` (extensible sans toucher aux générateurs). Le **filigrane** est borné à ≤ 70 % de la hauteur (reste centré sans déborder en paysage), opacité toujours dans **0.03–0.06**.

## Composant — `<DocumentAssets />`

Sous-composants (aucune taille fixe, ils lisent `scale`) :

- `DocumentWatermark` — logo **centré**, 40–60 % de la largeur, opacité 0.03–0.06.
- `DocumentLogo` — `kind="school" | "school-sm" | "ministry"` ; PNG transparent, **aucun fond** (si pas d'URL → rien, jamais de rectangle blanc).
- `DocumentSignature` — fond neutralisé par `mix-blend-mode: multiply`.
- `DocumentStamp` — carré, `multiply` (le blanc résiduel d'un scan disparaît) ; `fallback` possible.
- `SealedSignature` — signature + cachet en **léger chevauchement** + libellé.

API unifiée : `<DocumentAssets part="watermark|logo|logo-sm|ministry|signature|stamp|sealed-signature" scale={scale} school={school} />`.

### Règles appliquées

- **Tampons / cachets** : PNG transparents ; `multiply` à l'affichage ; chevauchement léger sur la signature.
- **Logos** : PNG transparents, dimensionnés selon le document, aucun rectangle blanc.
- **Filigranes** : centrés, 40–60 % de la largeur utile, opacité 0.03–0.06.

> `mix-blend-mode: multiply` neutralise visuellement le **fond blanc** d'un tampon/signature scanné sur papier blanc. Les éléments idéaux restent des **PNG transparents** ; le multiply est un filet de sécurité.

## Adoption — TOUS les générateurs

| Document | Catégorie | Mécanisme |
|---|---|---|
| `HonorAward.jsx` (diplôme / honneur / major / certificat) | prestige | `createDocumentScale` (px) — logo, filigrane, signatures scellées, rosette, badges, lauriers |
| `IdCard.jsx` (carte scolaire / élève) | compact | `createDocumentScale` (px) — filigrane, armoiries/logo, logo en-tête, tampon, signature |
| `transcriptDoc.js` (relevés) | standard | `createDocumentScale` + `pageDimsPx` → px dans le HTML (logo, 3 signatures, cachet) |
| `palmaresDoc.js` (palmarès) | standard | idem (logo d'en-tête) |
| `honorRollDoc.js` (listes : table collective / affiche) | standard | idem (logo, signature, cachet) |
| `ConseilDeClasse.jsx` (procès-verbal `pv-paper`) | standard | `createDocumentScale` inline (logo, signature, cachet) |
| `bulletin.css` (bulletins, y c. GE) | standard | variables CSS `--doc-*` posées par `installDocumentScaleVars()` (App) |

### Bulletins — variables CSS

`installDocumentScaleVars()` (appelé une fois dans `App.jsx`) pose sur `:root` :
`--doc-logo`, `--doc-logo-sm`, `--doc-stamp`, `--doc-signature`, `--doc-medal`,
calculés par le manager (catégorie standard). `bulletin.css` les consomme via
`var(--doc-*, <repli>)` — donc plus aucune taille fixe en dur, repli sûr conservé.

> Le moteur est unité-agnostique : px pour les documents capturés (carte, diplôme),
> px-A4 (`pageDimsPx`) pour les gabarits HTML, et variables CSS pour les bulletins.
> Une seule source de vérité, aucune duplication.
