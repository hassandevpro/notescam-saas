# Surveillance enseignants → Cockpit de pilotage (refonte)

> Rôle assumé : Senior Product Manager + UX Architect + SaaS Dashboard Expert.
> Cible de qualité : Stripe / Linear / Notion / Google Workspace Admin.
> Page concernée : `/app/monitor` (`src/pages/TeacherMonitor.jsx`).
> **Objectif n°1** : le directeur répond en **< 5 secondes** à 6 questions clés.

---

## 1. Audit UX complet (chaque choix remis en cause)

| # | Problème de l'ancienne version | Pourquoi c'est un problème | Impact administrateur | Solution livrée |
|---|---|---|---|---|
| 1 | **Liste verticale de grosses cartes enseignant** (1 bloc / prof, progress bars + notifs + messages empilés) | Scroll infini ; comparer 2 profs impose de scroller ; densité d'information faible | À 30+ profs, le directeur ne *voit* plus rien ; décision lente | **Table dense triable** (1 ligne/prof) + version mobile compacte |
| 2 | **Aucune hiérarchie de priorité** | Tout est au même niveau visuel ; l'urgent est noyé | L'admin doit tout lire pour trouver le critique | **Centre d'alertes priorisé** (Critique → Warning → Normal) |
| 3 | **Calendrier scolaire intégré au module** | Mélange configuration (dates) et pilotage (suivi) ; hors-sujet | Charge cognitive, module qui « fait deux choses » | Calendrier **déplacé** dans Administration › Paramètres |
| 4 | **Pas de score de risque** | L'admin doit déduire mentalement « ce prof est-il à risque ? » | Jugement subjectif, profs oubliés | **Risk score** 0–100 + pastille vert/orange/rouge |
| 5 | **« Matières manquantes » non mesurées** | La complétion était par *classe* (≥1 note), pas par *matière* | On croit une classe « complète » alors qu'une matière est vide | **Complétion par matière** + KPI « matières sans note » |
| 6 | **Stat cards informatives mais non actionnables** | On lit « 3 classes sans notes » sans pouvoir y aller | Friction : il faut re-chercher manuellement | **KPI cliquables** → filtrent la table |
| 7 | **Inactivité non détectée** | « Dernière activité » affichée mais jamais transformée en alerte | Un prof inactif 3 semaines passe inaperçu | Seuils `STALE_DAYS=7` / `INACTIVE_DAYS=14` → statut + score |
| 8 | **Mono-vue tout-rôle** | Même écran pour directeur/censeur | Bruit pour qui n'a pas le mandat | En-tête de vue par rôle + IA prête au multi-rôle (§7) |
| 9 | **Pas de filtres / recherche** | Trouver « les profs en retard » = lecture intégrale | Inefficace dès 20 profs | Filtres **Tous / En retard / Inactifs / Terminés / Sans note** + recherche |
| 10 | **Pas d'horodatage précis dans le journal** | « il y a 2 h » seulement | Impossible de prouver une date de saisie | Feed avec **date + heure** + temps relatif + relances tracées |

### Les 6 questions répondues en < 5 s
Toutes par l'**onglet Cockpit** (KPIs) + **Centre d'alertes** :
1. Profs en retard → KPI « Enseignants en retard » (clic → table filtrée).
2. Classes sans notes → KPI « Classes bloquées » + alertes.
3. Matières sans notes → KPI « Matières sans note » (clic → filtre `nograde`).
4. Profs inactifs → KPI « Enseignants inactifs » (clic → filtre `inactive`).
5. Classes terminées → KPI « Classes terminées » (`x/total`).
6. Action immédiate → **Centre d'alertes**, items critiques en tête + bouton « Relancer ».

---

## 2. Nouvelle architecture de l'information

```
Surveillance (/app/monitor)   — en-tête : Vue rôle · année · sélecteur de période (partagé)
├── Onglet 1 · COCKPIT
│     ├── 6 KPI exécutifs (cliquables)
│     └── Centre d'alertes priorisé (Critique → Warning → Normal)
├── Onglet 2 · ENSEIGNANTS
│     ├── Filtres (Tous/Retard/Inactifs/Terminés/Sans note) + recherche
│     ├── Table de monitoring (desktop) / lignes compactes (mobile)
│     │     Risque · Enseignant · Classes · Complétion · Dernière activité · Statut · Action
│     └── Classes sans enseignant
└── Onglet 3 · JOURNAL D'ACTIVITÉ
      ├── Feed des saisies (Prof · action · classe · matière · date · heure)
      └── Relances envoyées (traçabilité)
```

Principe : **synthèse → liste actionnable → preuve**. On ne mélange plus pilotage et configuration.

---

## 3. Structure du dashboard (Executive)

**6 KPI** (`KpiCard`), grille `2 / 3 / 6` colonnes (mobile / tablette / desktop) :

| KPI | Source | Ton | Action au clic |
|---|---|---|---|
| Complétion globale | moyenne des taux de classes | brand | — |
| Enseignants en retard | `statuses.includes('late')` | rouge si >0 | filtre `late` |
| Enseignants inactifs | `inactive` (>14 j / jamais) | orange si >0 | filtre `inactive` |
| Classes terminées | `rate===100` / total | vert | — |
| Classes bloquées | classes sans enseignant | orange si >0 | — |
| Matières sans note | `subjectStats.missingCount` | rouge si >0 | filtre `nograde` |

**Centre d'alertes** : liste triée par priorité `p` (0 critique → 2 normal). Chaque item critique lié à un prof porte un bouton **Relancer** (ouvre la modale message/WhatsApp).

---

## 4. Wireframe mobile (smartphone)

```
┌───────────────────────────────┐
│ Surveillance     [Séq ▸ 1..6] │  header compact, sélecteur scrollable
│ Vue Directeur · 2025-26       │
│ [Cockpit][Enseignants][Journal]│  onglets scrollables
├───────────────────────────────┤
│ ┌─────────┐ ┌─────────┐        │  KPI en grille 2 colonnes
│ │  78%    │ │   3 ▸   │        │  (chiffre + label, tap = filtre)
│ │ Complét.│ │ Retard  │        │
│ └─────────┘ └─────────┘        │
│ … (6 KPI)                      │
│ ── Centre d'alertes ──         │
│ 🔴 M. Nkoa  Relancer ▸         │  1 ligne / alerte, pas de carte
│ 🟠 Mme Ada  Relancer ▸         │
└───────────────────────────────┘

Onglet Enseignants (mobile) :
┌───────────────────────────────┐
│ [Tous][Retard][Inactifs]…  🔎 │  filtres scrollables + recherche
│ ● M. Nkoa            78%  Msg │  ● = pastille risque
│ ▓▓▓▓▓▓▓░░░                     │  barre fine
│ 3 classes · il y a 2 j        │
│ ● Mme Ada            12%  Msg │
└───────────────────────────────┘
```
Anti-patterns évités : pas de grosses cartes, pas d'info répétée, pas de scroll sans fin (table dense + filtres).

---

## 5. Wireframe desktop

```
Surveillance                                  Vue Directeur · 2025-26   [Séquence: 1 2 3 4 5 6]  J-2
[ Cockpit ] Enseignants  Journal
┌──────┬──────┬──────┬──────┬──────┬──────┐
│ 78%  │  3   │  1   │ 5/8  │  2   │  4   │   ← KPI cliquables
│Compl.│Retard│Inact.│Termin│Bloq. │Mat.∅ │
└──────┴──────┴──────┴──────┴──────┴──────┘
Centre d'alertes ───────────────────────────
🔴 M. Nkoa — échéance dépassée, saisie incomplète        [Relancer]
🚫 Classes sans enseignant — 2 classes à assigner
🟠 Mme Ada — attention requise, saisie en retard         [Relancer]

Onglet Enseignants :
[Tous][En retard][Inactifs][Terminés][Sans note]                 🔎 Rechercher
● Enseignant      Classes   Complétion        Dern. activité  Statut      Action
● M. Nkoa         3 cl.     78% ▓▓▓▓▓▓▓░      il y a 2 j      En retard   [Message]
● Mme Ada         2 cl.     12% ▓░░░░░░░      Jamais          Inactif     [Message]
```

---

## 6. Implications base de données

**Aucune migration requise** pour la version livrée — tout est dérivé du `gradeMap`, `subjects`, `classes`, `students`, `notifications`, `messages` déjà chargés.

Améliorations optionnelles pour la **scalabilité (100+ profs, multi-campus)** :

| Besoin | Implication DB | Priorité |
|---|---|---|
| Multi-campus | colonne `campus_id` sur `classes`/`teachers` + filtre cockpit | Moyenne |
| Activité précise (action/matière) | enrichir `notifications` avec `subject_id`/`subject_name`, `action` (`enter`,`update`,`lock`) | Faible (le feed s'adapte déjà si présents) |
| Score historisé (tendance) | table `monitoring_snapshots(school_id, period, teacher_id, rate, score, at)` (cron quotidien) | Faible |
| Performance 100+ profs | calcul de complétion côté SQL (vue matérialisée `class_completion`) au lieu du client | Moyenne à grande échelle |

Le score de risque reste **calculé côté client** (transparent, instantané, zéro coût serveur) tant que les volumes tiennent en mémoire (cas réel : 1 école). Au-delà → vue matérialisée.

---

## 7. Structure des composants React

```
pages/TeacherMonitor.jsx          (orchestrateur — hooks de données + 3 render d'onglets)
  ├── ComposeModal                (message in-app + WhatsApp)            [existant, conservé]
  ├── KpiCard                     (carte KPI cliquable)                  [nouveau]
  ├── RiskDot                     (pastille risque vert/orange/rouge)    [nouveau]
  ├── ProgressBar                 (barre de complétion)                  [conservé]
  ├── StatusTag (interne)         (badge de statut dérivé)               [nouveau]
  ├── renderCockpit()             KPIs + Centre d'alertes
  ├── renderTeachers()            filtres + table (desktop) / lignes (mobile) + classes non assignées
  └── renderJournal()            feed activité + relances
components/hubs/HubTabs.jsx        coquille onglets — désormais CONTRÔLABLE (activeTab/onTabChange)
```

Données dérivées (toutes `useMemo`, donc recalcul minimal) :
`teacherClassIds` · `classCompletion` · **`subjectStats`** (par matière) · `teacherLastActivity` ·
`unassignedClasses` · `deadline` · **`teacherRows`** (avec `risk`) · **`kpi`** · **`alerts`** · `filteredRows`.

### Logique du score de risque (documentée dans le code)
```
score = 0
score += 0.5 × (100 − complétion_moyenne)          // déficit de saisie ....... 0–50
inactivité : aucune → +25 · > 14 j → +18 · > 7 j → +10 ........................ 0–25
échéance   : classe en retard → +30 · à risque (≤3 j) → +12 ................... 0–30
matières sans note : +4 par matière (plafonné) ............................... 0–20
score = clamp(0, 100)
niveau = rouge ≥ 55 · orange ≥ 25 · vert < 25 · neutre = aucune classe assignée
```
Lisible, ajustable (constantes en tête de fichier), explicable à un directeur.

---

## 8. Structure des routes

Inchangée et volontairement simple : **une route, trois onglets** (état persistant `localStorage` `nc_monitor_tab`).

```
/app/monitor            → cockpit | enseignants | journal (onglet mémorisé)
```
Évolutif sans refonte : ajouter une route imbriquée `/app/monitor/:tab` est trivial si des URLs
partageables deviennent nécessaires (les onglets sont déjà pilotés par un id contrôlé).

Accès (cf. `App.jsx`) : `allow={['admin','censeur']}` — voir §10 pour le rôle Surveillant.

---

## 9. Plan d'implémentation étape par étape

1. ✅ Rendre `HubTabs` contrôlable (`activeTab` / `onTabChange`) — prérequis des KPI cliquables.
2. ✅ Calcul `subjectStats` (complétion **par matière**) → KPI « matières sans note ».
3. ✅ `teacherRows` + **score de risque** + `statuses` dérivés.
4. ✅ Onglet **Cockpit** : 6 `KpiCard` cliquables + **Centre d'alertes** priorisé.
5. ✅ Onglet **Enseignants** : filtres + recherche + **table desktop** / **lignes mobiles** + classes non assignées.
6. ✅ Onglet **Journal** : feed (date + heure) + relances tracées.
7. ✅ Calendrier **retiré** du module (déjà dans Paramètres).
8. ✅ En-tête de vue par rôle ; sélecteur de période multi-système (séq/term/trimestre).
9. ✅ Build de non-régression vert (`vite build`).
10. ⏭ (Optionnel) multi-campus, snapshots de tendance, vue SQL pour 100+ profs (§6).

---

## 10. Recommandations « production-ready »

- **Rôles** : aujourd'hui Directeur (admin) & Censeur voient le cockpit complet (pédagogie). Pour le
  **Surveillant général** (discipline/assiduité), créer une variante d'alertes orientée absences plutôt
  que saisie de notes — même coquille `HubTabs`, jeu de KPIs différent. L'IA est prête (gating par rôle).
- **Performance** : au-delà de ~150 enseignants, basculer `classCompletion`/`subjectStats` vers une vue
  matérialisée Supabase + pagination de la table (les `useMemo` actuels suffisent pour 1 école).
- **Multi-campus / multi-pays** : ajouter un sélecteur de campus dans l'en-tête (à côté de la période) ;
  le vocabulaire de période est déjà multi-système (`periodWord` = Séquence/Term/Trimestre via `useCountry`).
- **Action depuis l'alerte** : la « Relance » est tracée dans le Journal (preuve administrative). Étendre
  avec des modèles de message pré-remplis par type d'alerte (retard, inactivité).
- **Tendance** : afficher une flèche ↑/↓ sur la complétion globale via les snapshots quotidiens (§6).
- **Accessibilité** : les KPI sont des `<button>` (focus clavier) ; conserver ce pattern pour toute carte
  actionnable.
</content>
