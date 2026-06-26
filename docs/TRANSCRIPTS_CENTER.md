# Relevés de notes — Centre de production documentaire

Refonte complète du module `Relevés de notes` : d'une page de génération PDF vers
un **centre intelligent de production et de contrôle** des relevés scolaires, où
le directeur sait immédiatement combien de relevés sont générables, lesquels sont
prêts, lesquels sont bloqués et **pourquoi**.

> **Note sur la stack.** Spec demandait Next.js 15 + TypeScript + shadcn/ui +
> React PDF. NotesCam est **Vite + React 18 (JSX) + Tailwind + jsPDF/pdf-lib**,
> Cloud + LAN. Le module est livré dans la stack réelle (décision déjà actée pour
> le planificateur). Les « interfaces TypeScript » documentent les contrats ; le
> code les applique en JSX. Décisions de périmètre validées avec le client :
> **PDF combiné** (pas de ZIP), **liens portail parents** (pas d'e-mail backend),
> **historique en IndexedDB local** (pas de table cloud).

---

## 1. Architecture UX

```
┌────────────────────────────────────────────────────────────────────┐
│ 📄 Relevés de notes        Production et contrôle des relevés.       │ Header
├────────────────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                     │
│ │523 👨‍🎓 │ │ 18 🏫   │ │497 📄   │ │ 26 ⚠    │  ← KPI cliquables   │ Dashboard
│ │ Élèves  │ │ Classes │ │ Prêts   │ │ Bloqués │                     │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘                     │
├────────────────────────────────────────────────────────────────────┤
│ [👤 Individuel][👥 Classe][🏫 Niveau][📚 Multi-ans][🏛 Tous]        │ Cartes
├────────────────────────────────────────────────────────────────────┤
│ Niveau ▾   Classe ▾   🔎 Recherche   Élève ▾          📅 2025-2026   │ Filtres
├────────────────────────────────────────────────────────────────────┤
│ Classe 3ème A · Effectif 32 · Générables 30 · Prêts 30 · Bloqués 2  │ Contrôle
│                                            [ Voir les détails ]       │
├────────────────────────────────────────────────────────────────────┤
│ Validation : ✓ Classe ✓ Élève ✓ Notes ✗ Moyennes ✓ Matières …      │ Checklist
├────────────────────────────────────────────────────────────────────┤
│ ⚠ Hassan Ousman · Moyenne non calculée            [ Corriger ]       │ Alertes
│ ⚠ ATANGANA Rose · 2 matières sans notes           [ Corriger ]       │
├──────────────────────┬─────────────────────────────────────────────┤
│ Paramètres           │            Prévisualisation PDF              │ Aperçu
│ Établissement …      │            (HTML A4 temps réel)              │
│ Classe · Élève · An  │   ou  ⚠ Diagnostic si bloqué                 │
├──────────────────────┴─────────────────────────────────────────────┤
│ 30 documents · ≈15s   [🖨 Imprimer][📄 Télécharger tout][👪 Parents]│ Masse
│ ██████████░░░░ 87%                                                   │
├────────────────────────────────────────────────────────────────────┤
│ Historique : 12/06 · Hassan · PDF classe · Succès                   │ Historique
└────────────────────────────────────────────────────────────────────┘
```

---

## 2. Parcours utilisateur

1. **Coup d'œil** — le directeur ouvre la page : le dashboard chiffre l'état de
   production de tout l'établissement (calculé à la volée, sans requête).
2. **Cible** — il choisit un type de relevé (carte) puis filtre (classe / niveau /
   élève + recherche instantanée).
3. **Contrôle** — le panneau de classe + la checklist + le panneau d'anomalies lui
   disent *exactement* ce qui est générable et ce qui bloque.
4. **Correction** — un bouton « Corriger » l'amène à la saisie des notes.
5. **Aperçu** — la prévisualisation A4 se régénère automatiquement.
6. **Production** — génération de masse (PDF combiné) avec progression, puis envoi
   des liens portail parents.
7. **Traçabilité** — chaque génération est journalisée (historique local).

---

## 3. Interfaces (contrats de données)

```ts
type Mode = 'single' | 'class' | 'level' | 'multi' | 'all';
type Status = 'ready' | 'warning' | 'blocked';   // générable = status !== 'blocked'

interface IssueCode {
  code: 'no_subjects' | 'no_grades' | 'no_average' | 'missing_subjects' | 'no_rank';
  names?: string[];   // missing_subjects
  count?: number;
}

interface StudentEval {
  id: string; name: string; classId: string; className: string;
  status: Status; issues: IssueCode[];
  generalAvg: number | null; rank: string | null;
}

interface ClassEval {
  applicable: boolean; cls: ClassRow;
  total: number; ready: number; blocked: number; warning: number;
  students: StudentEval[];
}

interface SchoolSummary {
  classesCount: number; studentsCount: number;
  ready: number; blocked: number; warning: number;
  byClass: ClassEval[];
}

interface ChecklistItem { id: string; label: [fr, en, es]; ok: boolean }
interface Diagnostic { cause: string; action: string }   // describeIssue()
interface DocLogEntry {
  id: number; school_id: string; at: number; user_name: string;
  type: Mode; scope: string; count: number; status: 'success' | 'error'; detail: string;
}
```

---

## 4. Composants React

| Fichier | Section | Rôle |
|---|---|---|
| `pages/Transcripts.jsx` | — | Orchestrateur de tout le centre |
| `components/transcripts/TranscriptDashboard.jsx` | 2 | 4 KPI cliquables |
| `components/transcripts/GenerationCards.jsx` | 3 | 5 cartes de type de relevé |
| `components/transcripts/TranscriptFilters.jsx` | 4 | Niveau/Classe/Élève + recherche |
| `components/transcripts/ControlPanel.jsx` | 5 | Synthèse classe + détail élèves |
| `components/transcripts/ValidationChecklist.jsx` | 6 | Checklist 8 pré-requis |
| `components/transcripts/AnomaliesPanel.jsx` | 7 | Anomalies actionnables |
| `components/transcripts/PdfPreviewPanel.jsx` | 8 | Aperçu A4 temps réel (split) |
| `components/transcripts/MassGenerationBar.jsx` | 9 | Masse + progression + parents |
| `components/transcripts/PdfDiagnostic.jsx` | 10 | Erreurs intelligentes |
| `components/transcripts/GenerationHistory.jsx` | 11 | Journal des productions |
| `components/transcripts/ParentLinksModal.jsx` | 9 | Liens portail parents (copie/WhatsApp) |

**Moteurs (purs) :** `lib/transcriptReadiness.js` (statuts/checklist/diagnostic),
`lib/parentLinks.js`, `lib/documentLog.js` (IndexedDB v9 `document_log`).
**Réutilisé :** `lib/transcriptEngine.js`, `core/bulletinEngine.js`,
`lib/transcriptDoc.js`, `lib/transcriptPdf.js`.

---

## 5. Système de validation

`buildChecklist(selection, ctx)` produit 8 items : Classe sélectionnée · Élève
sélectionné · Notes disponibles · Moyennes calculées · Rang calculé · Matières
configurées · Modèle PDF disponible · Année scolaire active. Chaque item est
dérivé de l'évaluation réelle (pas de devinette) ; tant qu'un item est rouge, la
cause est visible et le bouton « Corriger » mène à sa résolution.

**Statuts** (réutilisent le moteur de relevé, zéro recalcul) :
- `blocked` : `generalAvg === null` (aucune note / moyenne) ou aucune matière → **non générable**.
- `warning` : moyenne OK mais ≥1 matière sans note → générable, à corriger.
- `ready`   : tout est complet.

---

## 6. Système de diagnostic PDF

Au lieu de « Erreur PDF », `describeIssue(code)` renvoie **Cause détectée +
Action recommandée** :

| Code | Cause | Action |
|---|---|---|
| `no_grades` | Aucune note enregistrée | Saisir les notes manquantes |
| `no_average` | Moyenne générale absente | Recalculer les moyennes |
| `missing_subjects` | Aucune note pour *Maths, …* | Saisir les notes concernées |
| `no_subjects` | Aucune matière configurée | Configurer les matières |
| `no_rank` | Rang non calculé | Vérifier les moyennes de classe |

Une erreur technique de génération est elle aussi présentée dans ce format (jamais
de stacktrace brute).

---

## 7. Prévisualisation temps réel

Le panneau split affiche **le même HTML A4** que l'impression et le PDF (via
`transcriptSheetHtml` / `multiYearSheetHtml`) → zéro divergence aperçu ⇄ document.
L'aperçu ne construit qu'**une feuille représentative** (rapide même pour « Tous
les relevés ») ; la génération de masse construit l'ensemble à la demande, avec
cache par classe et barre de progression.

---

## 8. Justification UX (par amélioration)

| Avant | Après | Pourquoi |
|---|---|---|
| Grande zone vide | Dashboard 4 KPI | Donner l'état global en < 2 s (Stripe) |
| Aucun indicateur | Panneau de contrôle classe | Décider sans ouvrir 30 fiches |
| Aucun diagnostic | Checklist + anomalies + diagnostic | L'utilisateur sait *pourquoi* et *quoi faire* (Linear : clarté actionnable) |
| « Erreur PDF » opaque | Cause + action | Supprime le support ticket : auto-résolution |
| Pas d'aperçu fiable | Aperçu = document réel | Confiance avant impression (Canva) |
| Pas de vue établissement | `evaluateSchool` school-wide | Pilotage direction, pas seulement 1 classe |
| Aucune traçabilité | Historique local | Savoir qui a généré quoi, quand |
| Sélecteurs ternes | Cartes à icônes, rounded-2xl, ombres douces | ERP premium (Notion) |

**Décisions clés** : statut calculé en réutilisant le moteur de relevé existant
(une seule source de vérité pour moyennes/rang) ; « générable » = `status ≠
blocked` (un warning reste imprimable mais signalé) ; aperçu mono-feuille pour la
réactivité, build complet seulement au téléchargement ; envoi parents via le
portail existant (honnête, sans promettre un e-mail inexistant).

---

## 9. Notes techniques

- **IndexedDB** bumpé en **v9** (`db.js`) : nouveau store `document_log`
  (auto-migré au prochain `open`, aucune action utilisateur).
- Aucune migration SQL (Cloud/LAN) : tout le nouveau est client-side ou local.
- Réutilise `parent_token` (portail parents) + `parent_phone` (WhatsApp pré-rempli).
```
