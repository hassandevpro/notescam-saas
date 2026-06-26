# Diplômes d'honneur premium — réutilisation du moteur « carte scolaire »

> Objectif : donner aux documents de distinction (tableau d'honneur, major,
> excellence, méritants, disciplinés…) **le même niveau graphique que la carte
> scolaire**, en **réutilisant son moteur** — aucun nouveau moteur PDF, aucun
> nouveau template engine, aucune duplication de logique.

## Principe

La carte scolaire est la **référence graphique**. Son pipeline est :

```
<IdCard/> (React, styles inline)  →  html-to-image (toPng)  →  jsPDF.addImage()
   composant visuel                   capture fidèle             pose sur A4
```

Le moteur de pose+capture (`exportIdCardsPdf` dans `src/lib/idCardPdf.js`) est
**générique** : il capture des nœuds DOM et les place sur A4 via `idCardLayout`.
Les diplômes le réutilisent tel quel — on ne crée que **le composant visuel** et
**l'orchestrateur** (modal), exactement comme la carte.

## Ce qui a été créé (et seulement cela)

| Fichier | Rôle | Analogue carte scolaire |
|---|---|---|
| `src/components/HonorAward.jsx` | Nouveau **template visuel** A4 portrait (diplôme premium) + variantes graphiques | `IdCard.jsx` |
| `src/components/HonorAwardModal.jsx` | Orchestrateur : prétraitement images, aperçu, export | `IdCardModal.jsx` |

## Ce qui a été réutilisé (zéro duplication)

| Brique | Fichier | Usage diplôme |
|---|---|---|
| **Moteur PDF** | `src/lib/idCardPdf.js` → `exportIdCardsPdf` | identique (capture + jsPDF) |
| **Géométrie A4** | `src/lib/idCardLayout.js` → `buildLayout` | identique |
| **Images → data-URL** | `src/lib/idCardService.js` → `imageToDataUrl` | identique (anti-CORS) |
| **Palette / couleurs** | `src/lib/schoolTheme.js` → `getSchoolTheme` | identique |
| **Pays / langue** | `countries.js` → `resolveCountryCode` | identique |
| **Données métier** | `src/lib/honorRollEngine.js` → `applyTemplate` | inchangé (lignes élèves) |

### Unique modification du moteur (extension, pas duplication)

`exportIdCardsPdf` accepte désormais une option `layout` (cols/rows/margin)
transmise à `buildLayout`. Défaut **inchangé** (planche cartes 2×4). Les diplômes
passent `{ cols:1, rows:1, margin:0 }` → **un diplôme par page A4**. Le moteur
reste **unique** dans toute l'application.

## Reprise du langage graphique de la carte

Repris à l'identique de `IdCard` : filigrane **guilloché** (cercles
concentriques SVG), **filigrane logo** établissement, en-tête **République**
(armoiries Cameroun / drapeau Guinée Éq. inline), **dégradés**, **bordures
ornementales** (double cadre navy + or), hiérarchie typographique, **cachet de
repli** (`StampFallback`), gestion **logo / signature / cachet** de l'école,
**aperçu = PDF** (même composant), **export PDF** et **impression** (mode `open`).

## Supprimé du modèle (vs carte d'identité)

QR code · matricule · n° de carte · date d'émission · date d'expiration ·
téléphone · e-mail · toute la structure de **badge d'identification**.

## Zone principale du diplôme

Met en valeur uniquement : **Nom · Classe · Rang · Moyenne · Mention ·
Distinction obtenue** (+ détail par matière optionnel, + félicitations).

### Variantes de distinction (`awardStyleFromTemplate`)

Déduites du modèle (nom / filtres / layout), surchargées par sa personnalisation
(couleur, titre) :

🏆 Tableau d'Honneur · ⭐ Excellence Académique · 🥇 Major de Classe ·
🏅 Félicitations du Conseil · 👑 Meilleures Filles / Meilleurs Garçons ·
🌟 Élèves Méritants · 🎖️ Élèves Disciplinés · 🎓 Distinctions Académiques.

## Intégration cockpit (`HonorRoll.jsx`)

Les modèles de **layout `certificate` ou `diploma`** (documents à encadrer)
routent Aperçu / Imprimer / Générer PDF vers `HonorAwardModal` (moteur carte).
Les layouts **`table` / `poster`** (documents de liste) conservent le pipeline
feuille existant. Résultat : les diplômes et les cartes scolaires partagent la
même chaîne de rendu et la même finition — une seule suite premium NotesCam.
