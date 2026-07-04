# Saisie des notes → Fast Entry (refonte)

> Rôles assumés : Senior PM · UX Architect · Educational Software Expert · Data-Entry Workflow Specialist.
> Cible de qualité : Google Sheets / Notion / Linear.
> Page : `/app/grades` (`src/pages/Grades.jsx`).
> **Objectif n°1** : un enseignant saisit une classe entière le plus vite possible, **sans souris**.

---

## 1. Audit UX complet

| # | Problème | Sévérité | Pourquoi c'est un problème | Impact enseignant | Impact admin | Solution livrée |
|---|---|---|---|---|---|---|
| 1 | **Entrée ne va pas à l'élève suivant** (l'ancien `GradeCell` faisait juste `blur` sur Entrée) | 🔴 Critique | Le geste le plus fréquent (note → suivant) exige Tab puis re-clic | +1 action / élève × 40 = très lent | Saisie tardive → bulletins en retard | **Entrée / ↓ = élève suivant**, **↑ = précédent** |
| 2 | **Pas de collage Excel** | 🔴 Critique | Beaucoup de profs préparent les notes dans Excel/cahier | Re-saisie manuelle de 40 valeurs | — | **Coller une colonne** remplit vers le bas |
| 3 | **Aucune barre de progression** | 🟠 Élevé | Le prof ne sait pas combien d'élèves restent | Oublis d'élèves, allers-retours | Classes « presque finies » invisibles | **Progress %** + saisis/total + restants + « aller au 1er vide » |
| 4 | **Pagination 20/page** au milieu de la saisie | 🟠 Élevé | Le flux clavier casse en bas de page | Perte de rythme | — | **Fast mode sans pagination** (liste continue, inputs légers) |
| 5 | **Verrouillage = `window.confirm` unique** | 🔴 Critique | Un clic = irréversible (sauf admin) ; aucune revue | Verrou accidentel → blocage | Sollicitations de déverrouillage | **Modale Revue → Confirmation** (complétion + case à cocher) |
| 6 | **Grade + Absences + Conduite + Conseil sur le même écran** | 🟠 Élevé | Mélange de tâches/responsabilités (concern mixing) | Charge cognitive | Données discipline noyées | **Fast mode = notes seules** ; Absences/Conduite/Conseil séparés (voir §3) |
| 7 | **Validation seulement au blur, sans signalement clair** | 🟡 Moyen | Une valeur > max était silencieusement rejetée | Le prof croit avoir saisi | Notes manquantes | **Validation inline** : anneau rouge + ⚠ + plage rappelée |
| 8 | **Pas d'indicateur de sauvegarde** | 🟡 Moyen | Le prof doute que ça enregistre | Re-saisie, stress | — | **✓ vert** transitoire après auto-save |
| 9 | **Inputs en tableau scrollable horizontalement (mobile)** | 🟠 Élevé | Colonnes Abs/Conduite poussent la note hors écran | Saisie pénible au téléphone | — | Fast mode **mono-colonne** (nom + 1 input large), zéro scroll horizontal |
| 10 | **Tout le monde voit la même page** | 🟡 Moyen | Prof veut la vitesse, admin veut le suivi | Bruit | Pas de pilotage ici | Rôles : prof = Fast ; admin/censeur = suivi via **Surveillance** (`/app/monitor`) |

---

## 2. Workflow redessiné & points de friction

```
1. Sélection classe      ← persistée (uiStore). Prof : auto-sélection de sa classe.
2. Sélection période     ← séquence/term/trimestre selon le pays (useCountry).
3. Sélection matière     ← onglets matières ; auto-sélection de la 1re.
4. SAISIE  ───────────────► FAST ENTRY : Entrée=suivant · ↑/↓ · coller Excel · auto-save · progress %.
5. Validation            ← le prof voit 100 % avant de signaler « terminé ».
6. Revue + verrouillage  ← admin : modale Revue (complétion par matière) → case → Verrouiller.
7. Bulletins             ← inchangé (lecture du gradeMap).
```

Frictions supprimées : étapes 4 (clavier), 5 (progress visible), 6 (verrou sécurisé). Étapes 1-3 déjà
fluides (persistées) — on n'y touche pas.

---

## 3. Architecture de l'information : séparer les responsabilités

**Recommandation : séparer.** Sur le même écran, ne garder que ce qui sert *la saisie de notes*.

| Élément | Reste avec les notes ? | Où | Raison |
|---|---|---|---|
| **Notes** | ✅ cœur | `/app/grades` (Fast/Table) | C'est la tâche |
| **Absences** | ❌ | `/app/absences` (existe déjà) | Tâche & rythme différents (quotidien vs périodique) |
| **Conduite** | ⚠️ optionnel | Table mode uniquement | Concept FR, périodique ; hors Fast |
| **Conseil de classe** | ❌ | `/app/conseil` (existe déjà) | Délibération, pas saisie |
| **Statistiques** | ➖ résumé léger | barre stats + progress | Le détail/pilotage → `/app/monitor` |
| **Import/Export CSV** | ✅ action contextuelle | bouton dans la barre | Lié à la saisie en masse |

Le **Fast mode** n'affiche QUE nom + note (+ progress). Absences/Conduite/Conseil restent accessibles
via leurs modules (déjà dans la nav « Vie scolaire » / « Évaluations »), et via le **Table mode** pour
qui veut tout sur un écran. C'est le principe « un écran = une intention ».

---

## 4. Wireframe desktop (Fast Entry)

```
6ème A · 42 élèves · Séquence 3                 [Importer CSV] [Exporter]
Onglets: [Maths]* [Français] [Anglais] [SVT] …          ← matière active
[ Saisie rapide ]  Tableau          Maths — 71%  ▓▓▓▓▓▓▓░░  30/42 · 12 restant(s)
┌───────────────────────────────────────────────┐  ↳ Aller au 1er vide
│  1  ATANGANA Rose          [ 12.5 ] ✓          │
│  2  BELLA Marie            [  7.6 ] ✓          │
│  3  ESSOMBA Paul           [ 15.2 ] ✓          │
│  4  FOUDA Jean             [      ] ←  focus    │
│  …                                             │
│  Entrée/↓ suivant · ↑ précédent · Coller Excel · ABS · Auto-save │
└───────────────────────────────────────────────┘
```

## 5. Wireframe mobile (Fast Entry)

```
┌──────────────────────────┐
│ 6ème A · Séq 3            │
│ [Maths▾]  71%  30/42      │  matière en menu, progress compacte
│ ─────────────────────────│
│ 1 ATANGANA Rose   [12.5]✓ │  une ligne / élève
│ 2 BELLA Marie     [ 7.6]✓ │  input large (≥44px), clavier décimal
│ 3 ESSOMBA Paul    [    ]  │
│ …                         │
│ [Entrée = suivant]        │
└──────────────────────────┘
```
Anti-patterns évités : **pas de scroll horizontal** (mono-colonne), **pas de minuscule input**
(`inputMode="decimal"`, hauteur tactile), **pas de tableau géant**.

## 6. Fast Entry Mode — spécification (livré)

Composant `FastGradeEntry` (`src/pages/Grades.jsx`) :
- **Clavier** : `Entrée`/`↓` = commit + focus suivant ; `↑` = commit + focus précédent ; `Échap` = annuler la cellule.
- **Auto-save** : commit au blur/déplacement via `saveGrade(classId, studentId, seq, { [subjectId]: v })`.
- **Coller Excel** : `onPaste` détecte les retours-ligne → remplit les élèves consécutifs, place le focus après.
- **Validation inline** : `validateGrade(raw, max)` (réutilisé) → `''`, `ABS`, ou nombre 0..max ; sinon anneau rouge + ⚠.
- **Feedback** : ✓ vert transitoire après sauvegarde.
- **Progress** : `ProgressHeader` (saisis/total, %, restants) + bouton « aller au 1er vide ».
- **Souris non requise** : tout le parcours est au clavier.

## 7. Workflow de validation & verrouillage (livré)

`Validation → Revue → Confirmation → Verrou`, anti-accident :
1. **Validation** : la barre de progression montre 100 % atteignable.
2. **Revue** : `LockReviewModal` affiche la complétion globale + **les matières incomplètes** et leur nombre de notes manquantes.
3. **Confirmation** : case à cocher obligatoire « J'ai vérifié les notes ».
4. **Verrou** : `lockSequence(...)` ; le déverrouillage reste réservé à l'admin (confirm simple) → **récupération** possible.

Erreurs gérées : note > max / négative → rejet + signal ; vide → autorisé (compté « restant ») ; ABS → valeur valide ; double soumission → commit seulement si la valeur change ; verrou accidentel → revue + checkbox.

## 8. Structure des composants React

```
pages/Grades.jsx
  ├── validateGrade(raw,max)         règles de validation       [réutilisé]
  ├── gradeColor(...)                couleur réussite/échec      [réutilisé]
  ├── ProgressHeader                 barre de progression        [nouveau]
  ├── FastGradeEntry                 saisie clavier + paste      [nouveau]
  ├── LockReviewModal                revue → confirmation        [nouveau]
  ├── GradeCell / StudentRowSingle   mode Tableau                [conservé]
  ├── SubjectTabs / SubjectStatsBar  navigation matières + stats [conservé]
  ├── GradeImportPanel               import CSV en masse         [conservé]
  └── ConseillDeClasse               (Table mode, FR)            [conservé]
```
État ajouté : `entryMode` (`fast|table`, persistant `localStorage`), `showLockModal`.
Dérivés `useMemo` : `subjectProgress` (matière courante), `lockReview` (toutes matières).

## 9. Structure des routes

Inchangée : `/app/grades` (sélection classe/période/matière persistée). Le mode (Fast/Table) est une
préférence locale, pas une route. Aucune route à ajouter — la simplicité est volontaire.

## 10. Implications base de données

**Aucune migration.** Le stockage reste `grades` indexé par `(class_id, student_id, sequence)` → objet
`{ subjectId: valeur }` (lecture via `gradeMap`, écriture via `saveGrade`). Pistes futures optionnelles :

| Besoin | Implication | Priorité |
|---|---|---|
| Audit fin de saisie (qui/quand par note) | colonne `updated_by`/`updated_at` sur `grades` | Faible |
| Historique de note (corrections) | table `grade_history` | Faible |
| 100+ élèves × 20 matières perf | la saisie reste par matière (≤100 inputs) → OK ; sinon virtualisation liste | Moyenne |

## 11. Feuille de route d'implémentation

1. ✅ `ProgressHeader` (progression matière).
2. ✅ `FastGradeEntry` : Entrée/flèches, Échap, **coller Excel**, validation inline, ✓ auto-save.
3. ✅ Bascule **Saisie rapide / Tableau** (préférence persistée), Fast = notes seules.
4. ✅ `LockReviewModal` : revue de complétion + case à cocher → verrou ; déverrouillage admin conservé.
5. ✅ Mémos `subjectProgress` / `lockReview`.
6. ✅ Build de non-régression vert (`vite build`).
7. ⏭ (Optionnel) virtualisation liste au-delà de ~200 lignes ; audit `updated_by` ; raccourci global « matière suivante ».

## 12. Recommandations production

- **Défaut = Fast mode** pour les enseignants (productivité) ; Table mode reste pour Abs/Conduite/Conseil.
- **Scalabilité** : 10→100 élèves OK (inputs légers, sans pagination) ; 5→20 matières via onglets ;
  multi-système géré (séquence/term/trimestre via `useCountry`, échelle `/max` par matière, ES /10|/20).
- **Mobile** : Fast mode mono-colonne, `inputMode="decimal"` (pavé numérique), cibles tactiles ≥ 44 px.
- **Récupération** : tout verrou est réversible par l'admin → jamais de cul-de-sac.
- **Rôles** : pilotage (retards, manquants, complétion) déjà couvert par le cockpit **Surveillance**
  (`/app/monitor`) — ne pas dupliquer ici ; garder la page de saisie focalisée sur l'action.
- **Prochain gain** : raccourci clavier « matière suivante » (Ctrl+→) pour enchaîner les matières sans souris.
</content>
