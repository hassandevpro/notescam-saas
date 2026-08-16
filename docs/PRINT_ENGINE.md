# Moteur d'impression NotesCam — contrat

**Module :** `src/lib/print/`
**Documents couverts :** relevé de notes, relevé multi-années, certificat de scolarité, procès-verbal de délibération, **bulletins** (APC premier cycle, second cycle MINESEC, et — pour les règles de couleur et de saut — les bulletins rendus en React), palmarès, tableaux d'honneur, pièces administratives (finances / RH / patrimoine).

---

## 1. Principe

L'impression passe par le **moteur natif du navigateur**, pas par une génération PDF rasterisée :

```
données → chaîne HTML A4 → fenêtre d'impression → window.print() → papier ou « Enregistrer au format PDF »
```

Ce choix donne trois propriétés qu'aucune rastérisation ne rend : la sortie est **vectorielle** (texte sélectionnable, ~13 Ko par page), l'**aperçu et l'impression partagent la même chaîne HTML** (aucune divergence possible), et la pagination est celle du moteur qui imprime réellement.

**Ne pas remplacer cette architecture par jsPDF / html2canvas.** `lib/transcriptPdf.js` (html-to-image → jsPDF) ne subsiste que pour les deux boutons « Télécharger PDF » du palmarès et des tableaux d'honneur, qui doivent produire un FICHIER sans passer par la boîte d'impression. Il tire lui aussi sa géométrie de page du socle.

## 2. La marge appartient à `@page`

C'est la règle qui structure tout le reste.

Un `padding` sur la feuille ne produit une marge que sur la **première** page : dès qu'un document déborde, la page suivante démarre à 0 mm, dans la zone non imprimable des imprimantes (4 à 6 mm), et le contenu est rogné. La marge est donc portée par `@page`, et la feuille perd son padding à l'impression :

```css
@media print {
  @page { size: A4 portrait; margin: 12mm; }
  .nc-sheet { width: auto !important; padding: 0 !important; min-height: 0 !important; }
}
```

À l'écran, `.nc-sheet` garde largeur et padding pour ressembler à une page : même mesure de texte, mêmes retours à la ligne. **Aperçu = impression.**

> Corollaire : **aucun style d'impression en attribut `style=`**. Un style inline gagne contre la feuille de style et rétablit la marge fantôme des pages suivantes. Les générateurs posent des classes, jamais de géométrie de page.

## 3. Profils de page

Un profil = format + orientation + marge. C'est le seul vocabulaire que manipulent les générateurs.

| Profil | Papier | Orientation | Marge | Zone utile | Documents |
|---|---|---|--:|---|---|
| `standard` | A4 | portrait | 12 mm | 186 × 273 mm | relevés, certificats, palmarès, attestations |
| `large` | A4 | paysage | 8 mm | 281 × 194 mm | procès-verbaux, tableaux larges |
| `dense` | A4 | portrait | 8 mm | 194 × 281 mm | listes, bulletins de paie |
| `bulletin` | A4 | portrait | 8 mm | 194 × 281 mm | bulletins (APC, second cycle, classiques) |
| `compact` | A5 | portrait | 10 mm | 128 × 190 mm | convocations, autorisations de sortie |

Le profil `bulletin` était à **6 mm** avant sa migration : c'était sous la zone
non imprimable d'une partie du parc, et le bas de bulletin (signatures) pouvait
s'y perdre. Les 4 mm rendus sont absorbés par l'auto-ajustement (§ 7 bis).

La marge de 12 mm n'est pas arbitraire : elle couvre la zone non imprimable de toutes les imprimantes jet d'encre et laser d'entrée de gamme, avec la réserve nécessaire à une perforation.

```js
import { pageMetrics } from '../lib/print';
const m = pageMetrics('standard');   // { pageW, pageH, contentW, contentH, …, en mm ET en px }
```

## 4. Contrat de classes CSS

| Classe | Effet à l'impression |
|---|---|
| `nc-sheet` | un document = une feuille ; démarre sur une page neuve ; rend sa marge à `@page` |
| `nc-keep` | bloc solidaire : jamais coupé entre deux pages (signature, cachet, QR, résumé) |
| `nc-ink` | aplat de couleur qui doit sortir à l'encre |
| `nc-break-before` / `nc-break-after` | saut de page forcé |
| `nc-footer` | pied de document, solidaire |

Appliquées automatiquement, sans rien écrire : `thead` (répété sur chaque page), `tfoot`, `tr` (jamais coupé), titres (pas d'orphelin en bas de page), `img`.

## 5. Couleurs

Chrome n'imprime **pas** les aplats de couleur par défaut : la case « Graphiques d'arrière-plan » est décochée. Sans traitement, un bandeau institutionnel sort blanc et son texte blanc est rabattu en gris pâle.

Le socle déclare `print-color-adjust: exact` sur `html`, `body` et toute la feuille. **Vérifié au pixel** : le bandeau `#1e3a5f` est présent à l'identique (30 637 px) que la case soit cochée ou non — `scripts/test-print.mjs`, groupe 4.

Aucun générateur ne redéclare cette propriété.

## 6. Garde-fous sur les valeurs

Un document officiel ne doit jamais porter `NaN`, `undefined`, `null`, `Infinity` ou `[object Object]`. Deux niveaux :

```js
import { num, txt, safe, auditDocument } from '../lib/print';

num(12.345, { digits: 2 })   // '12.35'
num(NaN)                     // '—'
safe(student.name)           // texte nettoyé PUIS échappé
auditDocument(html)          // { ok, issues:[{ token, context }] } — relit le texte visible
```

`auditDocument` est appelé avant chaque impression par `usePrintJob` : le document part quand même (l'utilisateur attend son document), mais l'incident est signalé à l'écran, tracé en console et journalisé en **PARTIEL**.

## 7. Pagination

Le découpage est délégué au navigateur — lui seul connaît la hauteur réelle d'une ligne après retour à la ligne. Notre rôle est de lui donner les bonnes contraintes (§4) et de **mesurer** le résultat :

```js
import { measureDocument, pagesForHeight } from '../lib/print';
const { pages, heightPx, overflowX } = measureDocument(html, 'standard');
```

C'est ce que fait le panneau d'aperçu pour annoncer le nombre de pages. Un test vérifie que ce nombre est **exactement** celui du PDF produit par Chrome (`test:print`, groupe 9).

**Capacité mesurée** du profil `standard` (relevé, 6 séquences) : 23 matières par page avec des libellés d'une ligne, 18 avec des libellés qui passent à deux lignes. `npm run test:print:capacity` remesure.

### 7 bis. Auto-ajustement (`fit`)

Certains documents sont d'**une page par nature** : un bulletin officiel ne se
poursuit pas sur une deuxième page pour trois lignes de signature. Pour ceux-là :

```js
printSheets(sheets, titre, { profile: 'bulletin', fit: true });
```

À l'ouverture de la fenêtre, chaque feuille est mesurée à la géométrie
d'impression. Si elle dépasse, elle est réduite proportionnellement
(`transform: scale`) — jamais en dessous de **0,86**, plancher de lisibilité.
Au-delà, la feuille coule normalement sur la page suivante, avec les blocs
solidaires pour que la coupure reste propre. Chaque feuille porte le résultat en
`data-fit` (`1`, un facteur, ou `flow`), ce que les tests vérifient.

> **Réduire visuellement ne suffit pas.** Chrome pagine sur la hauteur de la
> BOÎTE, pas sur son rendu : une feuille réduite mais laissée en hauteur
> automatique continue de déborder (mesuré : nombre de pages identique avec et
> sans réduction). L'auto-ajustement fixe donc aussi la hauteur de la boîte.

**Numérotation « page i sur n »** : non implémentée, volontairement. Chrome ne supporte ni les marges nommées `@page { @bottom-center }` ni les compteurs de page CSS, et un pied positionné en absolu dans un bloc fragmenté n'est pas rendu de façon fiable. À la place, chaque document démarre sur une page neuve et **porte son identification dans l'en-tête de tableau**, réimprimé sur chaque page.

## 8. Volumes et lots

Mesuré (Chrome, poste de bureau) :

| Documents | Construction | HTML | Pagination + PDF | Total | PDF |
|--:|--:|--:|--:|--:|--:|
| 1 | 81 ms | 0,03 Mo | 709 ms | 0,8 s | 0,11 Mo |
| 100 | 2 505 ms | 2,8 Mo | 2 767 ms | 6,2 s | 1,45 Mo |
| 300 | 6 682 ms | 8,5 Mo | 7 714 ms | 16,9 s | 4,16 Mo |
| 500 | 12 598 ms | 14,2 Mo | 21 546 ms | 38,1 s | 6,87 Mo |
| 1000 | 33 670 ms | 28,3 Mo | 34 593 ms | 81,3 s | 13,65 Mo |

Le coût devient super-linéaire au-delà de ~300 documents. Au-delà de `BATCH_SIZE` (150), les ateliers **découpent en lots** : chaque lot part sur un clic de l'utilisateur — qui garde la main, voit sa progression et peut s'arrêter. C'est aussi la seule façon fiable d'ouvrir plusieurs fenêtres sans blocage du navigateur.

## 9. Résultat d'impression et journal

`printSheets` ne parle jamais à l'utilisateur : elle renvoie un résultat que l'atelier traduit dans sa langue.

```js
printSheets(sheets, titre, { profile }) // → 'printed' | 'blocked' | 'empty'
```

Quatre statuts au journal (`documentLog.GEN_STATUS`) : **SUCCESS**, **PARTIAL** (imprimé mais des documents manquent ou des valeurs sont absentes), **BLOCKED** (pop-up refusé), **FAILED** (rien n'a pu être produit). Distinguer ces cas n'est pas cosmétique : « pop-up bloqué » se corrige en deux clics, « données incomplètes » se corrige dans la saisie des notes.

## 9 bis. Impression en page (documents rendus en React)

Les bulletins classiques, GE, primaire et maternelle s'impriment depuis le DOM de
l'application, pas dans une fenêtre séparée. Ils héritent quand même du socle :
`installPrintStyles()` injecte les règles de couleur et de saut au démarrage, et
l'écran actif déclare sa géométrie :

```js
useEffect(() => setPrintProfile('bulletin'), []);   // retire la règle en sortant
```

Le style injecté est **réinséré en fin de `<head>`** à chaque appel : les
feuilles de style d'écran sont chargées à la volée (une route = un import CSS) et
certaines déclarent leur propre `@page` ; à spécificité égale, c'est la dernière
règle du document qui gagne, donc l'écran actif doit parler en dernier.

Le moteur d'auto-fit APC (`core/apcLayout.js`) lit lui aussi sa géométrie dans le
socle : si la marge du profil change, le planificateur s'adapte au lieu de mentir.

## 10. Écrire un nouveau document

```js
import {
  sheetOpen, SHEET_CLOSE, officialHeaderHtml, titleBandHtml,
  signatureBlockHtml, verificationBlockHtml, safe, num, CLASS,
} from './print';

export function monDocumentHtml(data, { school, sys = 'FR', qrSrc, verification }) {
  return `
    ${sheetOpen({ school })}
      ${officialHeaderHtml(school, sys)}
      ${titleBandHtml('TITRE DU DOCUMENT')}

      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr><th colspan="3">${safe(data.eleve)} · ${safe(data.classe)}</th></tr>
          <tr><th>Colonne</th><th>Colonne</th><th>Colonne</th></tr>
        </thead>
        <tbody>${lignes}</tbody>
      </table>

      ${signatureBlockHtml(school, sys)}
      ${verificationBlockHtml(verification, qrSrc, sys)}
    ${SHEET_CLOSE}`;
}
```

Règles : jamais de `width`/`padding`/`@page`/`print-color-adjust` posés à la main ; toute valeur passe par `safe()` ou `num()` ; tout bloc indivisible porte `CLASS.keep` ; toute identification à répéter va dans `<thead>`.

Puis ajouter une entrée au catalogue `printTestUtils.FIXTURES` — le test de non-régression la prendra en charge automatiquement.

## 11. Tests

```bash
npm run test:print            # 131 contrôles : géométrie, fixtures, volumes, couleurs,
                              # blocs solidaires, contrôle visuel, valeurs, PV paysage,
                              # aperçu = impression, bulletins APC/SC, architecture
npm run test:print:capacity   # capacité d'une page selon le nombre de matières
npm run test:print:perf       # 1 → 1000 documents
```

La chaîne de contrôle visuel est **HTML → Chrome → PDF → rastérisation (pdf.js) → analyse de pixels (sharp)**. Un document n'est jamais jugé sur son apparence à l'écran : on vérifie sur les pixels du PDF qu'aucune page n'est vierge, que rien n'entre dans la zone non imprimable, qu'aucune bande blanche anormale n'apparaît et que les aplats institutionnels sont bien là.

Les artefacts (`.print-tests/`, ignorés par git) contiennent les PDF et les PNG de chaque cas : à ouvrir dès qu'un test échoue.
