# Rapport — Moteur PDF de la page « Documents »

**Date :** 2026-08-15
**Périmètre :** route `/app/releves` (libellé « Documents ») et toute la chaîne de production de ses trois documents : relevé de notes, procès-verbal de délibération, certificat de scolarité.
**Méthode :** lecture du code + banc d'essai exécuté (Chrome réel piloté par Playwright, pipeline d'impression Blink). Toutes les mesures citées ont été produites sur ce poste — voir §7.

---

## 1. Résumé exécutif

Le « moteur PDF » de cette page **n'est pas jsPDF** : c'est le moteur d'impression du navigateur. L'application produit une chaîne HTML A4, l'ouvre dans une fenêtre séparée et déclenche `window.print()` ; c'est l'utilisateur qui choisit « Enregistrer au format PDF » dans la boîte de dialogue. Aucun fichier `.pdf` n'est écrit par l'application sur cette page.

Ce choix est le bon : sortie **vectorielle** (texte sélectionnable, ~13 Ko/page, 300 relevés = 3,9 Mo), aperçu et impression rigoureusement identiques (même chaîne HTML), pagination fiable (N feuilles → N pages, vérifié jusqu'à 300).

Un défaut visuel de premier ordre subsiste néanmoins : **les fonds de couleur ne s'impriment pas par défaut** sur le relevé et le certificat (le PV, lui, est correct). Le bandeau titre bleu marine et les en-têtes de tableau sortent en blanc, et Chrome dégrade leur texte blanc en gris pâle. Correctif : **une ligne** dans `buildPrintDocument`.

| Gravité | Constat | Fichier |
|:--:|---|---|
| **P1** | Fonds de couleur absents à l'impression (relevé, certificat, palmarès, tableaux d'honneur) | `lib/transcriptDoc.js:303` |
| **P2** | Pop-up bloqué → rien n'est imprimé, mais « Succès » est journalisé | `pages/Transcripts.jsx:329` + 2 ateliers |
| **P2** | Élèves sans moyenne écartés du lot en silence (aperçu ≠ impression) | `pages/Transcripts.jsx:303` |
| **P3** | Les PV s'affichent « Relevé » dans l'historique | `lib/documentLog.js:7` |
| **P3** | Au-delà de 24 matières, le bloc QR passe en page 2 collé au bord | `lib/transcriptDoc.js:317` |
| **P3** | Aperçu : bande blanche sous le document (8 % relevé, 45 % PV) | `components/transcripts/PdfPreviewPanel.jsx:58` |
| **P3** | Estimation de durée ~10× pessimiste | `pages/Transcripts.jsx:378` |
| **P3** | `NaN` imprimable si un barème matière est nul | `lib/transcriptDoc.js:164` |

---

## 2. Architecture réelle de la chaîne

```
données (stores)                    identité
  ├─ transcriptEngine / bulletinEngine  ├─ classIdentity(school, cls, units)   → logo/cachet de l'unité
  ├─ pvEngine (APC, APC primaire, classique)
  └─ buildVerification + qrDataUrl      → QR 240 px (data-URL, ~4 Ko)
        │
        ▼
  transcriptDoc.js / pvDoc.js      ← SOURCE UNIQUE du rendu (chaîne HTML A4)
        │
        ├──────────────► PdfPreviewPanel  (dangerouslySetInnerHTML, scale 0.92 / 0.55)
        │
        └─ buildPrintDocument(sheets, titre, {orientation})
              └─ printSheets → window.open + document.write
                    └─ window.onload → setTimeout 300 ms → window.print()
                          └─ Chrome/Edge → imprimante OU « Enregistrer au format PDF »
        │
        └─ recordGeneration → IndexedDB `document_log` (journal local, non bloquant)
```

**Fichiers du moteur**

| Rôle | Fichier |
|---|---|
| Page + atelier Relevé | `src/pages/Transcripts.jsx` (526 l.) |
| Atelier PV | `src/components/documents/PvWorkspace.jsx` |
| Atelier Certificat | `src/components/documents/CertificateWorkspace.jsx` |
| Rendu HTML relevé / multi-années / certificat + enveloppe d'impression | `src/lib/transcriptDoc.js` |
| Rendu HTML PV (A4 paysage) + synthèse établissement | `src/lib/pvDoc.js` |
| Dimensionnement proportionnel (logo, cachet, signature) | `src/lib/documentScale.js` — `A4_PX = 794×1123`, catégorie `standard` |
| Aperçu partagé par les 3 ateliers | `src/components/transcripts/PdfPreviewPanel.jsx` |
| Journal des générations | `src/lib/documentLog.js` (IndexedDB, par poste) |

**Point de dette :** `src/lib/transcriptPdf.js` (`exportTranscriptsPdf`, html-to-image → jsPDF, rastérisation `pixelRatio: 3`) **n'est plus appelé par cette page**. Ses seuls appelants sont `apcBulletinPdf.js` et `scBulletinPdf.js` (page Bulletins). Le nom du fichier et son en-tête (« Export PDF des relevés de notes ») induisent en erreur : à renommer `rasterPdf.js` / `bulletinPdf.js`.

**Les deux moteurs du produit**

| | Documents (cette page) | Bulletins APC/SC |
|---|---|---|
| Chaîne | HTML → `window.print()` | HTML → `toPng` → `jsPDF.addImage` |
| Sortie | vectorielle, texte sélectionnable | image PNG pleine page |
| Poids | ~13 Ko/page (mesuré : 300 p. = 3,9 Mo) | plusieurs centaines de Ko/page |
| Fichier `.pdf` produit par l'app | non (l'utilisateur passe par la boîte d'impression) | oui (`pdf.save`) |

---

## 3. Défauts constatés

### P1 — Les fonds de couleur ne s'impriment pas (relevé, certificat)

`buildPrintDocument` (`transcriptDoc.js:303-325`) ne déclare **pas** `print-color-adjust: exact`. Or la case « Graphiques d'arrière-plan » de Chrome est **décochée par défaut**.

Preuve — opérateurs de remplissage relevés dans le PDF produit par Chrome pour le même relevé, avec puis sans arrière-plans :

| Couleur | Rôle | avec fonds | sans fonds (défaut) |
|---|---|:--:|:--:|
| `#1e3a5f` | bandeau titre + en-tête de tableau | 2 | **0** |
| `#f8fafc` / `#e8edf2` / `#f1f5f9` | bandeaux d'identité, ligne moyenne générale, statistiques | 3 | **0** |
| `#ffffff` | texte du bandeau titre | 4 | 3 (+ `#ababab` ×2) |

Le texte blanc du bandeau n'est pas perdu : Chrome le rabat en gris `#ababab` — un titre gris pâle sur fond blanc, sans le bleu institutionnel. Les couleurs de mention sont également assombries (`#3b82f6` → `#2655a2`).

`pvDoc.js` fait déjà le nécessaire (constante `PCX`, ligne 31), de même que `receiptDoc.js` et `officialDocHeader.js` — l'incohérence est purement locale à `transcriptDoc.js`.

**Correctif (une ligne, couvre tous les documents passant par `printSheets` — relevé, certificat, PV, palmarès, tableaux d'honneur) :**

```diff
   @media print {
     body { background:#fff; }
+    html, body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
     .nc-sheet { box-shadow:none; margin:0 auto; }
```

### P2 — Pop-up bloqué : « Succès » journalisé alors que rien n'est imprimé

`printSheets` (`transcriptDoc.js:328-338`) renvoie `false` et affiche une alerte si `window.open` échoue. **Les trois ateliers ignorent ce retour** (`Transcripts.jsx:329`, `CertificateWorkspace.jsx:163`, `PvWorkspace.jsx:192`) et enchaînent sur `logAndRefresh('success', …)`. L'utilisateur voit « Succès » dans l'historique, aucun document n'est sorti.

À corriger avec le message de l'alerte, actuellement en français en dur (`transcriptDoc.js:331`) alors que les trois ateliers sont trilingues :

```diff
-      printSheets(all, `${t('Relevés', …)} — ${school?.name || ''}`);
+      if (!printSheets(all, `${t('Relevés', …)} — ${school?.name || ''}`))
+        throw new Error(t('Pop-ups bloqués — autorisez les fenêtres pour imprimer.', …));
```

### P2 — Élèves écartés du lot en silence

`Transcripts.jsx:303` : `if (d && d.generalAvg !== null) out.push(…)` — sans `failed++` ni message. L'aperçu (ligne 266) n'applique pas ce filtre : **un relevé affiché à l'écran peut manquer à l'impression**, et le compteur « X document(s) » de la barre de génération reste celui du périmètre. Il faut soit compter ces élèves dans `failed` (le bandeau « n relevé(s) ignoré(s) » existe déjà), soit les traiter comme « bloqués » en amont dans `transcriptReadiness`.

### P3 — Historique : les procès-verbaux s'affichent en « Relevé »

`PvWorkspace.jsx:182` journalise `type: 'pv-class' | 'pv-level' | 'pv-all'`, absents de `DOC_TYPES` (`documentLog.js:7-17`) ; `GenerationHistory.jsx:37` retombe alors sur le libellé par défaut `['Relevé', 'Transcript', 'Certificación']`. Trois lignes à ajouter.

### P3 — Débordement en page 2 sans marge

Mesures (relevé FR, 6 colonnes de séquence, noms de matière longs) :

| Matières | Hauteur de la feuille | Résultat |
|:--:|:--:|---|
| 8 / 14 / 22 / 24 | 1119 px | 1 page |
| 25 | 1129 px | 2 pages |
| 30 | 1241 px | 2 pages — 118 px débordent |

La capacité réelle est donc de **24 matières** (au-delà, la ligne de moyenne générale, les statistiques, la signature ou le bloc QR basculent). Deux faiblesses se cumulent alors :

1. `@page { margin: 0 }` en portrait (`transcriptDoc.js:317`) : la marge du document est portée par le `padding: 10mm` de la feuille, qui ne s'applique qu'en haut de la **première** page. La page 2 démarre donc à 0 mm : au rendu, le QR et la mention légale se retrouvent collés au bord supérieur, dans la zone non imprimable de la plupart des imprimantes (4 à 6 mm). Le cas paysage a été traité (marge portée par `@page`, `padding` neutralisé), pas le portrait.
2. Les blocs signature et vérification n'ont pas de `page-break-inside: avoid` (présent dans `pvDoc.js:163` et `:203`) : la coupure peut tomber au milieu de la signature.

### P3 — Aperçu : bande blanche sous le document

`PdfPreviewPanel.jsx:58` réduit la feuille avec `transform: scale(0.92)` (0,55 pour le PV). Une transformation ne modifie pas la place occupée dans le flux : le conteneur conserve la hauteur d'origine, d'où ~8 % de blanc sous un relevé et ~45 % sous un PV. Utiliser `zoom`, ou compenser par un `margin-bottom` négatif de `(1 − scale) × hauteur`.

### P3 — Estimation de durée ~10× pessimiste

`Transcripts.jsx:378` annonce `docCount × 0,5 s`. Mesure sur 300 relevés complets (QR réel par élève) : **~15 s au total**, contre 150 s annoncées (détail au §7). Une constante de 0,05 s/document serait plus juste, y compris avec une marge pour les postes modestes.

### P3 — `NaN` imprimable

`transcriptDoc.js:164` ne teste que `generalAvg === null`. `calcFR` divise par `subject.max` (`core/bulletinEngine.js:81`) : un barème matière nul ou non numérique produit `NaN`, la feuille imprime **« NaN »** et la décision bascule en « Redouble la classe » (`NaN >= seuil` est faux) alors que les moyennes par matière, elles, restent affichées correctement. La colonne `subjects.max` est `NOT NULL` en base, donc le cas est peu probable en production — mais la garde `Number.isFinite` coûte un caractère et évite un document officiel absurde.

---

## 4. Ce qui est solide

- **Source unique de vérité.** La même chaîne HTML alimente l'aperçu, l'impression et (côté bulletins) la capture : zéro divergence possible entre ce que l'utilisateur voit et ce qu'il imprime.
- **Pagination fiable.** 1, 2, 5, 20 puis 300 feuilles → exactement 1, 2, 5, 20 et 300 pages A4 (595×842 pt).
- **En-têtes de tableau répétés.** Relevé et PV utilisent `<thead>` : sur un document multipage, l'en-tête se réimprime.
- **Sortie vectorielle.** 373 fragments de texte par relevé, 4 images seulement (logo, signature, cachet, QR) ; ~13 Ko/page.
- **Sécurité du rendu.** Échappement systématique (`esc`) des données de saisie ; polices **système** uniquement (`schoolTheme.BULLETIN_FONTS`) — la fenêtre d'impression, qui ne charge aucune feuille de style de l'application, rend donc la même typographie.
- **Dimensionnement proportionnel.** Aucune taille en dur : `documentScale` dérive logo, cachet et signature de la largeur de page.
- **Robustesse du lot.** Une feuille en erreur n'interrompt pas la génération (`try/catch` par élève) ; le journal ne peut jamais bloquer une impression.
- **Identité par unité pédagogique.** `classIdentity(school, cls, schoolUnits)` : le primaire imprime son logo et son directeur, pas ceux du groupe scolaire.

**Points de vigilance sans gravité :** les `mix-blend-mode: multiply` de la signature et du cachet (`transcriptDoc.js:66,69`) créent 3 groupes de transparence dans le PDF — le texte reste vectoriel, mais certains RIP anciens aplatissent ces zones. Le certificat de scolarité laisse ~55 % de page blanche sous la signature (le pied de page n'est pas ancré en bas). Enfin, l'en-tête de `transcriptDoc.js` annonce encore « Trois signatures : Chef d'établissement, Censeur, Surveillant Général » alors que `signaturesHtml` n'en pose qu'une, conformément au standard décrit ligne 61 — commentaire à corriger.

---

## 5. Performance mesurée (lot de 300 relevés)

| Étape | Temps | Remarque |
|---|--:|---|
| Construction (QR + HTML), séquentielle | 4 960 ms | 16,5 ms/relevé, dominé par le QR (7,8 ms) |
| HTML transmis à la fenêtre | — | **8,2 Mo** (`document.write`) |
| Chargement de la fenêtre d'impression | 2 330 ms | |
| Pagination + génération PDF par Chrome | 8 213 ms | |
| **Total** | **~15,5 s** | PDF final : **3,9 Mo / 300 pages** |

Extrapolation à 1 000 relevés : ~28 Mo de HTML dans une seule fenêtre et ~50 s. C'est tenable sur un poste correct, mais c'est la limite du modèle « tout dans une fenêtre ». Si des établissements dépassent le millier d'élèves, découper en lots par classe ou par niveau (plusieurs fenêtres d'impression successives) plutôt que d'optimiser le rendu.

---

## 6. Plan de correction proposé

| # | Action | Coût | Gain |
|:--:|---|:--:|---|
| 1 | `print-color-adjust: exact` dans `buildPrintDocument` | 1 ligne | **P1** — rend leurs couleurs à tous les documents imprimés |
| 2 | Exploiter le retour de `printSheets` dans les 3 ateliers + message i18n | ~10 lignes | **P2** — plus de faux « Succès » |
| 3 | Compter (ou bloquer en amont) les élèves sans moyenne | ~5 lignes | **P2** — aperçu et impression enfin cohérents |
| 4 | Ajouter les clés `pv-*` à `DOC_TYPES` | 3 lignes | **P3** — historique lisible |
| 5 | Marge portée par `@page` en portrait + `page-break-inside: avoid` sur signature et bloc QR | ~5 lignes | **P3** — documents longs imprimables |
| 6 | `Number.isFinite` sur `generalAvg` | 1 ligne | **P3** — plus de « NaN » officiel |
| 7 | Corriger l'échelle de l'aperçu et l'estimation de durée | ~5 lignes | **P3** — confort |
| 8 | Renommer `transcriptPdf.js` et corriger les commentaires obsolètes | — | Dette |

Les points 1 à 4 représentent une vingtaine de lignes et traitent tout ce qui est visible par un utilisateur.

---

## 7. Reproductibilité du banc d'essai

Les mesures ont été obtenues en important directement les modules de rendu de l'application (`lib/transcriptEngine.js`, `lib/transcriptDoc.js`) dans Node, puis en passant les feuilles produites dans le Chrome installé sur le poste, piloté par Playwright (`channel: 'chrome'`, même moteur de pagination Blink que la boîte de dialogue d'impression) :

- comptage de pages et hauteur de feuille : `page.pdf({ format: 'A4', preferCSSPageSize: true })` + `pdf-lib` ;
- effet de la case « Graphiques d'arrière-plan » : même page rendue avec `printBackground: true` puis `false`, opérateurs `setFillRGBColor` extraits avec `pdfjs-dist` ;
- jeu de données synthétique (1 classe, 6 séquences, 8 à 30 matières, noms longs, logo/signature/cachet présents).

Deux précautions valent d'être notées pour qui rejouerait l'exercice : les imports du dépôt sont sans extension (il faut un *resolver* Node), et un fragment de feuille découpé à la main doit être vérifié équilibré — une première série de mesures « 5 feuilles → 4 pages » n'était qu'un artefact de découpe, la pagination réelle étant exacte.
