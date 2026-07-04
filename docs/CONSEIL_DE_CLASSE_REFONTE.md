# Refonte — Procès-Verbal du Conseil de Classe

> Transformation d'un tableau administratif en **centre d'aide à la décision pédagogique**.
> Fichier : `src/pages/ConseilDeClasse.jsx` · Styles d'impression : `src/styles/conseil.css`.

---

## 0. Note de stack

La spécification demandait Next.js + TypeScript + shadcn/ui. NotesCam est une SPA
**Vite + React (JSX) + TailwindCSS + Zustand**, et la règle projet est *migration
progressive, ne pas recréer à zéro, préserver la logique métier*. La refonte est donc
livrée **dans la stack réelle**, en reproduisant l'esthétique premium (Linear / Notion /
Stripe) à la main avec Tailwind. Les **interfaces TypeScript** figurent ci-dessous comme
**contrat de conception** (section 5) ; le code reste en JSX pour rester exécutable.

Toute la logique métier d'origine est conservée :
- moteur de classement `buildRanks` (`src/core/bulletinEngine.js`),
- multi-pays FR / EN / Guinée Équatoriale (seuils, libellés, distinctions),
- persistance des décisions & champs spéciaux via `saveGrade` (`__decision__`, `__th__`, …),
- **gabarit d'impression officiel inchangé** (`.pv-paper`) = le « PDF premium ».

---

## 1. Architecture UX

Hiérarchie en 7 strates, du général au particulier (parcours de lecture descendant) :

```
┌────────────────────────────────────────────────────────────────┐
│ 1. HEADER          Titre + contexte + actions (Aperçu / PDF)     │  identité + sortie
│    └ Sélecteurs    Classe · Séquence · Vue (Cartes/Tableau)      │  contrôle
│    └ Méta-barre    Classe · Séq · Effectif · Notes · Date        │  contexte permanent
├────────────────────────────────────────────────────────────────┤
│ 2. DASHBOARD KPI   🟢 Admis 🟡 Surveillance 🔴 Redoub. 🏆 ⚠      │  diagnostic 1-coup-d'œil
│                    (cliquables → filtrent la vue élèves)         │
├────────────────────────────────────────────────────────────────┤
│ 3. RÉSUMÉ CLASSE   Moy. générale · Taux · Meilleure · + basse    │  santé globale
├────────────────────────────────────────────────────────────────┤
│ 5. ANALYSE AUTO    Difficulté · Excellents · Discipline · Risque │  pré-tri intelligent
├────────────────────────────────────────────────────────────────┤
│ 4. VUE ÉLÈVES      Cartes (défaut) ⇄ Tableau                     │  travail unitaire
│    └ par carte     Photo · Nom · Moy · Rang · Abs · Décision     │
│                    + suggestion + bouton Assistant               │
├────────────────────────────────────────────────────────────────┤
│ 7. APERÇU PV       Document A4 fidèle (toggle)                   │  vérification
└────────────────────────────────────────────────────────────────┘
   6. ASSISTANT DE DÉCISION → drawer latéral (overlay, par élève)
   8. PDF PREMIUM         → window.print() sur .pv-paper (inchangé)
```

### Flux de décision (cas nominal)
1. L'utilisateur choisit **Classe + Séquence**.
2. Le **dashboard** révèle immédiatement la répartition (combien à risque, combien de distinctions).
3. Un clic sur un **KPI** (ex. 🔴) filtre la vue sur les seuls élèves concernés.
4. L'**analyse automatique** propose des listes pré-triées (raccourci vers un élève).
5. Sur chaque **carte**, une **décision suggérée** est proposée (1 clic pour l'appliquer).
6. Pour les cas complexes, l'**Assistant** (drawer) regroupe distinctions, sanctions, assiduité et décision finale.
7. **Aperçu PV** confirme le rendu, puis **Imprimer / PDF** produit le document officiel.

---

## 2. Wireframes (ASCII)

### 2.1 Vue d'ensemble (desktop ≥ 1280px)

```
 Conseil de classe ·····························  [👁 Aperçu PV] [🖨 Imprimer/PDF]
 Procès-verbal du conseil de classe
 Centre d'aide à la décision pédagogique…
 ┌──────────────────────────────────────────────────────────────────────┐
 │ Classe [6e A ▾]   Séquence [Séq. 2 ▾]            [ Cartes | Tableau ]  │
 │ ──────────────────────────────────────────────────────────────────── │
 │ Classe 6e A · Séquence Séq.2 · Effectif 48 · Notes 46/48 · 12 juin '26│
 └──────────────────────────────────────────────────────────────────────┘

 ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
 │🟢   31 │ │🟡    7 │ │🔴    5 │ │🏆    9 │ │⚠    11 │   ← cliquables = filtres
 │Admis   │ │Surveil.│ │Redoub. │ │Distinc.│ │Cas part│
 └────────┘ └────────┘ └────────┘ └────────┘ └────────┘

 ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
 │ Moy. gén.│ │ Taux     │ │ Meilleure│ │ + basse  │
 │ 11.84/20 │ │ 78% ▓▓▓░ │ │ 17.20    │ │ 6.10     │
 └──────────┘ └──────────┘ └──────────┘ └──────────┘

 ┌──📉 Difficulté─┐ ┌──⭐ Excellents─┐ ┌──⚖️ Discipline┐ ┌──🔻 Risque────┐
 │ • Awono   9.1  │ │ • Bella  17.2  │ │ • Kamga (Bl.T)│ │ • Njoya  6.1  │
 │ • Fouda   9.4  │ │ • Tabi   16.8  │ │ • Eyenga(Excl)│ │ • Mballa 7.0  │
 └────────────────┘ └────────────────┘ └───────────────┘ └───────────────┘

 Vue élèves  31/48                              [Voir tous les élèves ✕]
 ┌───────────────────────┐ ┌───────────────────────┐ ┌──────────────────────┐
 │▎(•) 📷 Bella Marie  17 │ │▎(•) 📷 Tabi Jean   16 │ │▎(•) 📷 Njoya P.   6  │
 │   MAT-0231        /20  │ │   MAT-0188       /20  │ │   MAT-0290      /20  │
 │ [Rang 1] [2 abs] [🏆]  │ │ [Rang 3] [0 abs]      │ │ [Rang48][5 nj][Bl.C] │
 │ [Admis ▾]        [⚙︎]  │ │ [Admis ▾]        [⚙︎]  │ │ [— ▾]           [⚙︎] │
 │                        │ │                        │ │ 💡 Proposé: Redoubl. │
 └───────────────────────┘ └───────────────────────┘ └──────────────────────┘
```

### 2.2 Carte élève (anatomie)

```
 ▎ = barre statut (vert/ambre/rouge/gris)
 ┌─▎──────────────────────────────────────┐
 │ [photo]  (•) Nom Prénom            16.40│  ← moyenne colorée vs seuil
 │ 44px     MATRICULE                 / 20 │
 │                                         │
 │ [Rang 3] [4 abs (2 nj)] [🏆 T.H] [Bl.T1]│  ← chips contextuels
 │ ───────────────────────────────────────│
 │ [ Décision ▾ ]                    [ ⚙︎ ]│  ← select inline + Assistant
 │ 💡 Proposé : Admis — cliquer pour appl. │  ← visible si ≠ décision actuelle
 └─────────────────────────────────────────┘
```

### 2.3 Assistant de décision (drawer droite, max-w 28rem)

```
                              ┌───────────────────────────────────┐
                              │ [photo] Bella Marie            [✕] │
                              │ Moyenne 16.40/20 · Rang 3          │
                              ├───────────────────────────────────┤
                              │ 💡 Décision suggérée               │
                              │ [ Appliquer : Admis ]              │
                              │                                    │
                              │ DISTINCTIONS                       │
                              │ Tableau d'honneur          (○──)   │  switches
                              │ Encouragements             (──●)   │
                              │ Félicitations              (○──)   │
                              │                                    │
                              │ TRAVAIL & DISCIPLINE               │
                              │ Avertissement travail   [− 0 +]    │  steppers
                              │ Blâme travail           [− 1 +]    │
                              │ Blâme conduite          [− 0 +]    │
                              │ Exclusions              [− 0 +]    │
                              │                                    │
                              │ ASSIDUITÉ                          │
                              │ Abs. justifiées (h)     [− 2 +]    │
                              │ Abs. non justifiées (h) [− 0 +]    │
                              │                                    │
                              │ DÉCISION DU CONSEIL                │
                              │ [ Admis ] [ Redoublant ]           │  toggles
                              │ [ Renvoyé ]                        │
                              ├───────────────────────────────────┤
                              │ [           Terminé            ]   │
                              └───────────────────────────────────┘
```

### 2.4 Responsive
- **< 640px** : KPI 2 colonnes, résumé 2 col., cartes 1 col., drawer plein écran, table scroll-x.
- **640–1279px** : cartes 2 col., analyse 2 col.
- **≥ 1280px** : cartes 3 col., analyse 4 col.

---

## 3. Composants React produits

| Composant            | Rôle | Réutilisable |
|----------------------|------|:---:|
| `ConseilDeClasse`    | Page + état (classId, seq, filter, view, preview, assistId) | — |
| `Meta`               | Paire label/valeur de la barre méta | ✓ |
| `SummaryStat`        | Carte stat (valeur + barre de progression optionnelle) | ✓ |
| `Avatar`             | Photo élève ou initiales en dégradé | ✓ |
| `AnalysisPanel`      | Panneau d'analyse auto (liste cliquable, top 5 + compteur) | ✓ |
| `StudentCard`        | Carte élève (statut, chips, décision, suggestion) | — |
| `DecisionAssistant`  | Drawer : distinctions/discipline/assiduité/décision | — |
| `Toggle`             | Switch (style Linear) | ✓ |
| `Stepper`            | Compteur −/+ pour champs numériques | ✓ |

Helpers purs (testables, sans DOM) : `analyze()`, `honor()`, `hasIssue()`, `num()`, `initials()`.

---

## 4. Moteur d'analyse automatique

`analyze(row, pass, scale, honorMode, isGE)` dérive, sans aucune écriture :

| Champ        | Règle |
|--------------|-------|
| `status`     | `pending` (pas de moyenne) · `risk` (< seuil) · `watch` (≥ seuil mais discipline OU < seuil + 7.5 %·échelle) · `success` |
| `excellent`  | moyenne ≥ 80 % de l'échelle **ou** félicitations/encouragements |
| `struggling` | moyenne < seuil + 10 % de l'échelle |
| `disc`       | au moins un avert./blâme/exclusion/abs. non justifiée |
| `hon`        | distinction présente |
| `suggested`  | `admis`/`aprobado` · `redoublant`/`repite` · `recuperacion` (GE, surveillance) |

Les seuils sont **relatifs à l'échelle** (`scale`) → cohérents en /10 (GE), /20 (FR), /100 (EN) et barèmes custom (`gOpts.maxScale`).

---

## 5. Interfaces TypeScript (contrat de conception)

```ts
type System = 'FR' | 'EN' | 'ES';
type HonorMode = 'fr' | 'en' | 'es';
type StudentStatus = 'success' | 'watch' | 'risk' | 'pending';

/** Champs « spéciaux » stockés dans gradeMap (clés __…__). */
interface SpecialScores {
  __decision__?: string;        // '' | 'admis' | 'redoublant' | 'renvoye' | 'aprobado' | …
  __th__?: 'true' | 'false';
  __encouragement__?: 'true' | 'false';
  __felicitation__?: 'true' | 'false';
  __abs_j__?: string;           // entiers stockés en chaîne
  __abs_nj__?: string;
  __aver_travail__?: string;
  __blame_travail__?: string;
  __aver_conduite__?: string;
  __blame_conduite__?: string;
  __exclusions__?: string;
  [subjectId: string]: string | undefined;  // notes par matière
}

interface Student { id: string; name: string; matricule?: string; photo_url?: string | null; class_id: string; }

/** Ligne enrichie consommée par toute l'UI. */
interface CouncilRow {
  stu: Student;
  scores: SpecialScores;
  avg: number | null;   // moyenne de la séquence
  rang: string | null;  // « 1er », « 3ème », « — »
  a: StudentAnalysis;
}

interface StudentAnalysis {
  avg: number | null;
  status: StudentStatus;
  failing: boolean;
  watch: boolean;
  struggling: boolean;
  excellent: boolean;
  disc: boolean;        // a au moins une sanction / absence non justifiée
  hon: boolean;         // a une distinction
  suggested: string;    // décision proposée (valeur)
}

interface DecisionOption { value: string; label: string; }

interface ClassStats {
  total: number; graded: number;
  admis: number; surveil: number; risque: number;
  distincts: number; issues: number; decisions: number;
  moy: number | null; best: CouncilRow | null; worst: CouncilRow | null;
  taux: number | null;  // % réussite
}

// Persistance — signature existante préservée
type SaveGrade = (classId: string, studentId: string, seq: number, partialScores: SpecialScores) => Promise<void>;
```

---

## 6. Styles Tailwind — système visuel

- **Couleurs sémantiques** : `emerald` (réussite) · `amber` (surveillance) · `red` (risque) · `purple` (distinctions) · `slate` (neutre) · `brand` (action).
- **Élévation** : `shadow-sm` au repos → `shadow-md` au survol (profondeur Stripe).
- **Rayons** : `rounded-2xl` (cartes/panneaux), `rounded-xl` (contrôles), `rounded-lg` (chips/boutons).
- **Statut** : barre latérale 1 px colorée + point `●` (lisible même en N&B).
- **Chiffres** : `tabular-nums` pour l'alignement des moyennes.
- **KPI actifs** : `ring-2 ring-brand-400` (état sélectionné = filtre, repère Linear).
- **Drawer** : overlay `bg-slate-900/30 backdrop-blur-[1px]`, panneau `shadow-2xl`.
- **Impression** : tout l'écran est `.no-print` ; seul `.pv-paper` sort (A4, en-tête République, barre-titre bleu marine) — **aucun changement** au document officiel.

---

## 7. Justification UX

| Problème d'origine | Réponse de la refonte | Pourquoi |
|--------------------|-----------------------|----------|
| **Trop vide** | Dashboard + résumé + analyse auto remplissent l'espace d'informations *actionnables* | densité utile ≠ remplissage décoratif |
| **Peu esthétique** | Système visuel cohérent (cartes, ombres, rayons, couleurs sémantiques) | crédibilité « établissement premium » |
| **Tableaux illisibles** | Vue **Cartes** par défaut (1 élève = 1 unité scannable), tableau conservé pour le scan rapide | la carte réduit la charge cognitive ; le tableau reste pour la comparaison |
| **KPI peu pertinents** | KPI = leviers de décision (à risque, surveillance, distinctions) **et** filtres cliquables | un KPI doit déclencher une action, pas seulement informer |
| **Pas de synthèse** | Résumé de classe + récapitulatif PV (moyenne, taux, extrêmes) | situer chaque élève dans la dynamique de classe |
| **Pas de prévisualisation** | Aperçu PV fidèle au document imprimé (toggle) | « ce que je vois = ce que j'imprime », zéro surprise |
| **Pas d'analyse auto** | `analyze()` pré-trie en difficulté/excellents/discipline/risque + décisions suggérées | l'outil fait le premier tri, l'humain tranche |

**Principe directeur** : *« diagnostiquer en un coup d'œil, agir en un clic, vérifier avant d'imprimer »* — du panorama (KPI) au geste unitaire (carte / assistant), sans jamais perdre le contexte (méta-barre permanente).

**Sécurité métier** : aucune décision n'est jamais automatique. Les suggestions sont explicites, optionnelles et réversibles ; le document officiel reste identique et n'est valable qu'avec signature + cachet.
