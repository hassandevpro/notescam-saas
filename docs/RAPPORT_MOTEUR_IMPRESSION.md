# Rapport — Refonte du moteur d'impression scolaire

**Date :** 2026-08-15
**Objet :** faire de NotesCam une référence de qualité pour l'impression des documents scolaires, sans changer l'architecture (moteur natif du navigateur, aperçu = même HTML = impression).
**État :** livré et vérifié — `npm run test:print` : **131 / 131 PASS** (bulletins compris).

---

## 1. Ce qui a été construit

Un socle d'impression unique, `src/lib/print/`, dont tous les documents dépendent désormais :

| Fichier | Rôle | Lignes |
|---|---|--:|
| `printStyles.js` | Géométrie de page, profils, CSS d'impression — **source unique de vérité** | 216 |
| `printLayout.js` | Feuille, en-tête d'État, signature, cachet, bloc QR, pied, ouverture de la fenêtre | 260 |
| `printPagination.js` | Mesure du nombre de pages, découpage en lots, estimation de durée | 121 |
| `printValidation.js` | Garde-fous `num`/`safe`, auto-contrôle du document assemblé | 140 |
| `printTestUtils.js` | Fixtures de non-régression | 125 |
| `components/documents/usePrintJob.js` | Travail d'impression partagé : progression, lots, statuts, journal | 132 |

Consommateurs migrés : `transcriptDoc.js` (relevé, multi-années, certificat), `pvDoc.js`, `palmaresDoc.js`, `honorRollDoc.js`, `printDoc.js` (pièces administratives), `apcBulletinDoc.js` + `apcBulletinPdf.js` et `scBulletinDoc.js` + `scBulletinPdf.js` (bulletins MINESEC), et les trois ateliers de la page Documents. Le CSS d'impression est également **injecté dans l'application** (`installPrintStyles`, appelé au démarrage comme `installDocumentScaleVars`) : les documents rendus en React — bulletins, conseil de classe — héritent des mêmes règles de couleur et de saut de page, sans duplication.

Documentation du contrat : `docs/PRINT_ENGINE.md`.

---

## 2. AVANT / APRÈS

### AVANT

**P1**
- Les fonds de couleur ne s'imprimaient pas sur le relevé, le certificat, le palmarès et les tableaux d'honneur : `buildPrintDocument` ne déclarait pas `print-color-adjust`, et la case « Graphiques d'arrière-plan » de Chrome est décochée par défaut. Le bandeau institutionnel sortait blanc, son texte blanc rabattu en gris `#ababab`.

**P2**
- Le retour de `printSheets` était ignoré par les trois ateliers : pop-up bloqué ⇒ rien n'est imprimé, mais « Succès » est écrit au journal.
- Les élèves sans moyenne étaient écartés du lot en silence, sans compteur ni message — et l'aperçu, lui, les affichait.

**P3**
- Les procès-verbaux s'affichaient « Relevé » dans l'historique (clés `pv-*` absentes du catalogue).
- `@page { margin: 0 }` en portrait : au-delà de la capacité d'une page, la page 2 démarrait à 0 mm, QR et mention légale dans la zone non imprimable.
- Pas de `page-break-inside: avoid` sur la signature et le bloc de vérification : coupure possible en plein milieu.
- Aperçu réduit au `transform: scale` : bande blanche de 8 % (relevé) à 45 % (PV), et nombre de pages jamais annoncé.
- Estimation de durée ~10× pessimiste (`0,5 s` par document).
- `NaN` imprimable : le rendu ne testait que `=== null`.
- CSS d'impression dispersé : `@page` déclaré dans cinq fichiers avec trois marges différentes, `print-color-adjust` présent à certains endroits et absent ailleurs.

### APRÈS

**P1** — *aucun.*
`print-color-adjust: exact` est posé par le socle sur `html`, `body` et toute la feuille. **Vérifié au pixel** : le bandeau `#1e3a5f` occupe 30 637 px que la case « Graphiques d'arrière-plan » soit cochée ou non. Le correctif profite à tous les documents qui passent par le socle.

**P2** — *aucun.*
`printSheets` renvoie `printed` / `blocked` / `empty`, traité par `usePrintJob` : un pop-up bloqué produit un message explicite et un journal **BLOCKED**. Les documents non produits sont comptés, signalés à l'écran et journalisés en **PARTIAL**.

**P3** — *aucun.*
Marges portées par `@page` (12 mm en portrait, 8 mm en paysage) : toutes les pages, y compris les continuations, sont dans la zone imprimable — vérifié par analyse de pixels sur les quatre bords. `nc-keep` rend la signature, le cachet, le QR, le résumé et les pieds indivisibles. Les clés `pv-*` sont au catalogue, avec quatre statuts distincts. L'aperçu utilise `zoom` (plus de bande blanche), reproduit la page et ses marges, et annonce un nombre de pages **mesuré**. Estimation recalibrée sur mesure réelle. `num()` renvoie « — » pour tout ce qui n'est pas un nombre fini, et `auditDocument` relit le document avant impression.

### Corrigé en cours de route (défauts trouvés par les tests)

- **Procès-verbal : colonnes écrasées.** `table-layout: fixed` lit les largeurs de la **première** ligne du tableau ; la ligne d'identification ajoutée pour les documents multipages (une seule cellule en `colspan`) faisait donc basculer toutes les colonnes en largeur égale : noms d'élèves étalés sur six lignes, colonne « Rang / Mention » rognée. Corrigé par un `<colgroup>` explicite. **Effet mesuré : 40 élèves passent de 6 pages à 3, 60 élèves de 9 à 4.**
- **Décisions tronquées.** « Redouble la classe » débordait de sa cellule et se faisait rogner au bord du tableau. La coupure de mot est désormais autorisée dans cette seule colonne — jamais sur les noms d'élèves.
- **Attente aveugle de 300 ms avant impression.** La fenêtre s'ouvrait sur un document dont les images (logo, cachet, signature, QR) n'étaient pas chargées. Le script d'amorçage attend maintenant les polices et les images, avec un filet de sécurité à 6 s.

---

## 3. Résultats des tests

`npm run test:print` — Chrome réel piloté par Playwright, PDF rastérisé par pdf.js, pixels analysés par sharp.

**Volumes** (1 document = 1 page neuve)

| Volume | Résultat |
|---|---|
| 1 page | **PASS** |
| 2 pages | **PASS** |
| 5 pages | **PASS** |
| 20 pages | **PASS** |
| 100 pages | **PASS** |
| 300 pages | **PASS** |

**Matières par relevé**

| Cas | Résultat | Pages |
|---|---|---|
| 8 | **PASS** | 1 |
| 14 | **PASS** | 1 |
| 22 | **PASS** | 2 (libellés longs) |
| 23 | **PASS** | 1 (libellés courts — limite de capacité) |
| 24 | **PASS** | 2 |
| 25 | **PASS** | 2 |
| 27 | **PASS** | 2 |
| 30 | **PASS** | 2 |
| 35 | **PASS** | 2 |
| 40 | **PASS** | 2 |

Capacité mesurée d'une page : **23 matières** (libellés d'une ligne), **18** (libellés sur deux lignes). Au-delà, le débordement est propre : marges respectées, en-tête et identification répétés, blocs solidaires entiers.

**Contrôles transverses**

| Contrôle | Résultat | Preuve |
|---|---|---|
| Couleurs (case « arrière-plans » décochée) | **PASS** | bandeau `#1e3a5f` : 30 637 px avec et sans |
| QR entier, jamais coupé | **PASS** | bloc `nc-keep`, dernière page non vierge sur 24/25/30/40 matières |
| Signature entière | **PASS** | idem, `data-part="signature"` présent |
| Cachet | **PASS** | `data-part="stamp"`, absent proprement quand l'école n'en a pas |
| Aperçu = impression | **PASS** | `measureDocument` chargé dans le navigateur, comparé au PDF : 1=1, 2=2, 1=1 |
| Aucun `NaN` / `undefined` / `Infinity` | **PASS** | y compris barème matière nul, notes partielles, élève sans aucune note |
| Rien dans la zone non imprimable | **PASS** | 0 pixel d'encre dans les 4 mm extérieurs, sur toutes les pages testées |
| Aucune page vierge | **PASS** | ratio d'encre contrôlé page par page |
| Aucun débordement horizontal | **PASS** | PV 12 / 40 / 60 élèves : 0 px au-delà de 1 062 px |
| En-tête de tableau répété | **PASS** | vérifié en pixels sur la page 2 du PV |
| Géométrie A4 | **PASS** | 595 × 842 pt (portrait), 842 × 595 pt (paysage) |

**Bulletins MINESEC** (migrés sur le socle après la première livraison)

| Contrôle | Résultat | Preuve |
|---|---|---|
| APC 6×2, 10×3, 14×4 : une feuille = une page | **PASS** | 2→2, 2→2, 3→3 pages |
| APC : couleurs identiques avec et sans arrière-plans | **PASS** | 140 589 px dans les deux cas |
| APC : rien dans la zone non imprimable | **PASS** | 0 px sur les quatre bords |
| Auto-fit APC : police ≥ 10 pt | **PASS** | 10 pt à 12 matières × 4 compétences |
| SC : une feuille = une page | **PASS** | 3 bulletins → 3 pages |
| SC : aucune valeur interdite | **PASS** | audit du document assemblé |
| Géométrie unique (plus de `@page` local, plus de marge en dur) | **PASS** | `bulletin.css`, `core/apcLayout.js` |
| Un seul point d'entrée `window.open` | **PASS** | 4 générateurs vérifiés |

**Total : 131 / 131 PASS.**

---

## 3 bis. Migration des bulletins

Trois piles distinctes coexistaient :

| Pile | Avant | Après |
|---|---|---|
| Bulletin APC (premier cycle) | HTML → html-to-image → jsPDF (image pleine page) | socle vectoriel, profil `bulletin` |
| Bulletin second cycle (SC) | idem | socle vectoriel, profil `bulletin` |
| Bulletins classiques / GE / primaire / maternelle | React + `bulletin.css`, `@page` local 6 mm | règles du socle injectées, géométrie déclarée par l'écran |

**La géométrie était déclarée trois fois** : `bulletin.css` (`@page margin: 6mm`), `core/apcLayout.js` (`MARGIN = 6` en dur, qui pilote l'auto-fit), et le socle. `apcLayout` lit désormais `pageMetrics('bulletin')`, `bulletin.css` ne déclare plus de `@page`, et l'écran Bulletins pose son profil à l'affichage (`setPrintProfile('bulletin')`, retiré en sortant). Le style injecté est réinséré en fin de `<head>` à chaque appel : les CSS d'écran sont chargées à la volée et certaines déclarent leur propre `@page` ; à spécificité égale, la dernière règle gagne.

**Marge 6 mm → 8 mm.** 6 mm est sous la zone non imprimable d'une partie du parc : le bas de bulletin (signatures) pouvait s'y perdre. Coût : 4 mm de hauteur utile (1,4 %), absorbés par l'auto-ajustement.

### Le défaut que la rastérisation masquait

Le passage au vectoriel a révélé que **les bulletins ne tenaient pas sur une page** : le second cycle dépasse de 22 mm à 12 matières, de 80 mm à 16 ; une feuille APC sur trois dépassait de 20 mm. L'ancien chemin appelait `pdf.addImage(image, 0, 0, 210, 297)` — il **écrasait la feuille trop haute dans une page A4**, sans que personne ne le voie.

Réponse : un auto-ajustement dans le socle (`fit: true`), réservé aux documents d'une page par nature. La feuille est mesurée à la géométrie d'impression et réduite proportionnellement, jamais sous 0,86 (plancher de lisibilité) ; au-delà elle coule normalement, blocs solidaires en place.

> Point technique qui a coûté deux essais : **réduire visuellement ne suffit pas.** Chrome pagine sur la hauteur de la BOÎTE, pas sur son rendu — avec `zoom` seul comme avec `transform: scale` seul, le nombre de pages ne bougeait pas. Il faut fixer aussi la hauteur de la boîte à la hauteur réduite.

---

## 4. Performance et montée en charge

`npm run test:print:perf`

| Documents | Construction | HTML | Fenêtre | Pagination + PDF | **Total** | PDF | Pages |
|--:|--:|--:|--:|--:|--:|--:|--:|
| 1 | 81 ms | 0,03 Mo | 41 ms | 709 ms | **0,8 s** | 0,11 Mo | 1 ✓ |
| 10 | 150 ms | 0,29 Mo | 90 ms | 751 ms | **1,0 s** | 0,24 Mo | 10 ✓ |
| 50 | 1 286 ms | 1,42 Mo | 603 ms | 2 038 ms | **3,9 s** | 0,78 Mo | 50 ✓ |
| 100 | 2 505 ms | 2,83 Mo | 976 ms | 2 767 ms | **6,2 s** | 1,45 Mo | 100 ✓ |
| 300 | 6 682 ms | 8,49 Mo | 2 552 ms | 7 714 ms | **16,9 s** | 4,16 Mo | 300 ✓ |
| 500 | 12 598 ms | 14,15 Mo | 3 949 ms | 21 546 ms | **38,1 s** | 6,87 Mo | 500 ✓ |
| 1000 | 33 670 ms | 28,29 Mo | 13 020 ms | 34 593 ms | **81,3 s** | 13,65 Mo | 1000 ✓ |

Le nombre de pages est exact à tous les volumes. Le coût devient super-linéaire au-delà de ~300 documents (28 Mo de HTML dans une seule fenêtre), d'où le **découpage en lots à 150 documents** : chaque lot part sur un clic, l'utilisateur voit sa progression et peut s'arrêter. Un établissement de 1 600 élèves imprime ainsi 11 lots d'environ 10 s, au lieu d'une fenêtre unique de plusieurs minutes qu'il ne peut pas interrompre.

L'estimation affichée est recalibrée : 22 s annoncées pour 300 documents contre 16,9 s mesurées (elle annonçait 150 s auparavant).

---

## 5. Ce qui n'est pas fait, et pourquoi

- **Numérotation « page i sur n » en pied de page.** Chrome n'implémente ni les marges nommées `@page { @bottom-center }` ni les compteurs de page CSS ; un pied positionné en absolu dans un bloc fragmenté n'est pas rendu de façon fiable. Compensation retenue : chaque document démarre sur une page neuve et porte son identification (élève ou classe, période, année) dans `<thead>`, réimprimé en tête de chaque page. Une page isolée reste rattachable à son document.
- **Densité du procès-verbal au-delà de 34 colonnes de notes.** Le moteur bascule alors sur les moyennes de matière seules (comportement existant, conservé) : au-delà, les colonnes deviendraient illisibles.

---

## 6. Comment vérifier

```bash
npm run test:print            # 131 contrôles — géométrie, fixtures, volumes, couleurs,
                              # blocs solidaires, visuel, valeurs, PV paysage,
                              # aperçu = impression, bulletins APC/SC, architecture
npm run test:print:capacity   # capacité d'une page selon le nombre de matières
npm run test:print:perf       # 1 → 1000 documents
```

Les artefacts sont écrits dans `.print-tests/` (ignoré par git) : PDF et PNG rastérisés de chaque cas. En cas d'échec, l'image de la page concernée est directement consultable.

Ajouter un document au filet de non-régression = ajouter une ligne à `FIXTURES` dans `src/lib/print/printTestUtils.js`.
