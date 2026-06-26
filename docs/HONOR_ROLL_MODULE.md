# Module Tableaux d'honneur configurables

> Rôles : Expert logiciels scolaires · UX Designer Senior · Product Manager EdTech.
> Principe directeur : **chaque établissement crée ses propres tableaux — règles, critères, mise en
> page — sans aucune modification de code**. Un tableau = un objet de configuration (donnée).
> Route : `/app/palmares` (Évaluations › Tableaux d'honneur).

---

## 1. Architecture fonctionnelle

```
DONNÉES (store)                MOTEUR (config-driven)           SORTIE
classes/subjects/students  ─►  honorRollEngine.applyTemplate ─► groupes classés
gradeMap                       (scope · filtres · tri · limite)        │
                                                                        ▼
MODÈLE (donnée, no-code)  ───────────────────────────────►  honorRollDoc.buildHonorRollSheets
honorRollTemplates (CRUD + presets)                          (table | certificat | affiche)
                                                                        │
                                            transcriptDoc.printSheets / transcriptPdf ─► Impression / PDF / Aperçu
```

3 couches découplées :
- **Moteur** (`src/lib/honorRollEngine.js`) — transforme données + modèle → groupes classés.
- **Mise en page** (`src/lib/honorRollDoc.js`) — groupes → feuilles A4 HTML (réutilise le pipeline PDF/print des relevés).
- **Modèles** (`src/lib/honorRollTemplates.js`) — presets + CRUD ; un modèle est 100 % donnée.

Aucun type de tableau n'est codé : les 11 tableaux demandés sont des **presets** ; l'admin en crée d'autres.

## 2. Structure base de données

**MVP : zéro migration.** Les modèles sont persistés en `localStorage` par école
(`nc_honor_templates_<schoolId>`). Les notes/élèves viennent du store existant (`gradeMap`, etc.).
Les visuels (logo, signature, tampon) sont déjà sur `schools`.

Évolution cloud (optionnelle, sans changer l'UI) :

| Champ | Table | Type | Rôle |
|---|---|---|---|
| `honor_roll_templates` | `schools` | `jsonb` | partage des modèles entre appareils |
| (réutilisés) `logo_url`, `signature_url`, `stamp_url`, `grade_scale`, `bulletin_font` | `schools` | — | personnalisation déjà disponible |

Le `localStorage` actuel est un cache ; la bascule vers `jsonb` = remplacer les 4 fonctions CRUD de
`honorRollTemplates.js` (lecture/écriture), sans toucher au moteur, aux layouts ni à l'écran.

## 3. Écran administrateur

`/app/palmares` (admin + censeur) — `src/pages/HonorRoll.jsx` :
- **Grille de modèles** (cartes) : nom + badges (périmètre, mise en page, Top N) + état Actif/Inactif (toggle).
- Actions par carte : **Aperçu · Imprimer · PDF · Éditer · Dupliquer · Supprimer**.
- **Nouveau modèle** → builder.
- **Builder (BuilderModal)** — sans code : nom · mise en page · périmètre · matière (si scope matière) ·
  limite · tri · **critères** (moyenne min %, rang max, sexe, conduite min, abs. injust. max, niveaux) ·
  **personnalisation** (titre, couleur, intro, félicitations, mention spéciale, orientation, colonnes).

## 4. Écrans utilisateur (sortie)

- **Aperçu** : iframe plein écran (4 premières feuilles) + boutons Imprimer.
- **Impression** : `printSheets` (fenêtre d'impression navigateur, multi-pages A4).
- **PDF** : `exportTranscriptsPdf` (téléchargement, barre de progression).
- Génération **après le conseil de classe** : l'admin lance le modèle voulu en 1 clic (Imprimer/PDF).

## 5. Wireframes

```
LISTE (admin)                                   BUILDER (modale)
Tableaux d'honneur            [+ Nouveau]       Modèle de tableau
┌─────────────┐ ┌─────────────┐                Nom        [__________]
│ Général      │ │ Excellence  │                Layout [Table▾] Scope [École▾]
│ École·Table  │ │ École·Affiche│               Limite [10]  Tri [Moyenne▾]
│ Top 10 ·Actif│ │ Top15 ·Actif │               ─ Critères ─
│ Aperçu 🖨 PDF │ │ Aperçu 🖨 PDF │               Moy% [80] Rang [5] Sexe [▾]
│ Éditer Dupl. │ │ Éditer Dupl. │               Conduite [16] AbsNJ [0]
└─────────────┘ └─────────────┘                Niveaux [6e][5e][4e]…
                                                ─ Personnalisation ─
APERÇU                                          Titre [____] Couleur [▢]
┌───────────────────────────┐                  Intro/Félicitations/Mention
│ [rendu A4 dans iframe]     │                  Orientation [Portrait▾]
│ 🏆 TABLEAU D'HONNEUR — 6eA │                  Colonnes [rank][name][avg]…
│ 1 ATANGANA 16,2 Très bien  │                  [Enregistrer] [Annuler]
└───────────────────────────┘
```

Mises en page livrées : **certificat individuel** (1 feuille/élève), **table collective**, **affiche
murale** (podium 🥇🥈🥉) — A4 portrait/paysage, avec photo, rang, moyenne, mention, classe, année.

## 6. Logique métier

- **Moyenne annuelle** par élève : `multiAvg` sur toutes les séquences/évaluations de sa classe (`buildRanks`).
- **Comparaison inter-systèmes** : `score = moyenne / barème` (0..1) → FR /20, EN /100, ES /10|/20
  classés équitablement dans un tableau « établissement ».
- **Rang** : `rankInClass` (issu de `buildRanks`) ; le rang affiché d'un groupe est recalculé après filtrage.
- **Conduite** : lettres TB/B/AB/P/M → score /20 (`CONDUITE_SCORE`) pour les seuils.
- **Absences** : somme des absences injustifiées (`__abs_nj__`) sur l'année.
- **Mention** : `getAppreciation` (barème de l'école).

## 7. Règles de classement (critères)

Filtres combinables (`filters`) :

| Critère | Champ | Exemple demandé → config |
|---|---|---|
| Moyenne générale | `minAvgPct` (% du barème) | Moyenne ≥ 16/20 → `minAvgPct: 80` |
| Rang | `maxRank` | Rang ≤ 5 → `maxRank: 5` |
| Sexe | `gender` | Meilleures filles → `gender:'F'` |
| Classe / Niveau / Filière | `classIds` / `levels` / scope | Par niveau → `scope:'level'` |
| Conduite | `conduiteMin` (/20) | Conduite ≥ 18 → `conduiteMin: 18` |
| Absences | `maxAbsNJ` | Aucune absence injust. → `maxAbsNJ: 0` |
| Matière | `scope:'subject'` + `subjectName` | Meilleurs en Maths |
| Top N | `limit` | Top 3 de chaque classe → `scope:'class', limit:3` |

Périmètres (`scope`) : **école · classe · niveau · sexe · matière** (+ personnalisé = école sans filtre).

## 8. Génération PDF / impression

Réutilise le pipeline éprouvé des relevés (zéro duplication) :
- `printSheets(sheets, title)` — impression navigateur multi-A4.
- `exportTranscriptsPdf(sheets, { fileName, onProgress })` — PDF haute résolution.
- `buildPrintDocument(sheets, title)` — HTML complet pour l'**aperçu** iframe.
En-tête officiel hérité du pays (`bulletinOfficials`), police/couleur/logo/signature/tampon de l'école.

## 9. Structure React / fichiers

```
src/lib/honorRollEngine.js     computeStudentRows · computeSubjectRows · applyTemplate · distinct*
src/lib/honorRollDoc.js        tableSheet · certificateSheet · posterSheet · buildHonorRollSheets
src/lib/honorRollTemplates.js  presetTemplates(11) · list/upsert/duplicate/toggle/delete · blank · LAYOUTS/SCOPES/COLS
src/pages/HonorRoll.jsx        page admin : grille + BuilderModal + aperçu iframe + génération
src/App.jsx                    route /app/palmares (admin+censeur)
src/config/navigation.js       entrée « Tableaux d'honneur » (Évaluations) + icône trophy
```

## 10. Plan d'implémentation

1. ✅ Moteur de classement piloté par config (`honorRollEngine`).
2. ✅ Mises en page table / certificat / affiche (`honorRollDoc`).
3. ✅ Modèles : 11 presets + CRUD localStorage (`honorRollTemplates`).
4. ✅ Écran admin : créer/éditer/dupliquer/activer/prévisualiser + Imprimer/PDF.
5. ✅ Route + entrée de navigation + icône.
6. ✅ Build de non-régression vert (`vite build`).
7. ⏭ (Optionnel) persistance cloud `schools.honor_roll_templates` (jsonb) ; génération auto déclenchée
   à la clôture d'un conseil de classe ; export par lot « tous les modèles actifs ».

---

### Multi-pays / multi-systèmes
Séquences (CM-FR), Terms (CM-EN), Trimestres (Guinée Éq.) résolus automatiquement par
`transcriptColumns(sys, cycle, pays)` — le moteur agrège l'annuel quel que soit le découpage. Un futur
pays s'ajoute via `src/countries/*` (déjà le cas pour le reste de l'app), **sans toucher au module**.

### No-code : preuve
Ajouter « Top 3 garçons par niveau, moyenne ≥ 14, affiche murale bleue » =
`{ scope:'level', limit:3, filters:{ gender:'M', minAvgPct:70 }, layout:'poster',
   personalization:{ title:'Meilleurs garçons', primaryColor:'#1d4ed8' } }` — créé entièrement depuis
le builder, aucun déploiement.
</content>
