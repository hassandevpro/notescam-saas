# Module CANTINE — audit et proposition

> État : **ÉCRIT le 2026-10-31**, et **non déployé**. Le moteur, l'écran et la
> migration existent dans le dépôt ; la migration **n'a PAS tourné**, ni au
> Cloud ni chez une école, et aucune donnée n'a été écrite en production.
>
> | Pièce | Fichier | État |
> |---|---|---|
> | Migration Cloud | `supabase_cantine_quote_part.sql` | écrite, **jamais exécutée** |
> | Miroir LAN | `server/db.js`, `server/schema.sql` | `ensureColumn` posé, vérifié au démarrage |
> | Moteur | `src/lib/cantineEngine.js` | écrit, **36 contrôles passent** |
> | Écran | `src/pages/Cantine.jsx`, route `/app/cantine`, menu | écrit, ouvert et mesuré sur l'application montée |
>
> ⚠ **Le Cloud d'abord.** `fee_catalog` est synchronisée : voir l'avertissement
> d'ordre en tête de la migration. Un paquet LAN distribué avant elle ferait
> rejeter les lignes de catalogue de l'école EN ENTIER (PGRST204).
>
> Source du besoin : `CANTINE.docx` (trois années : 2024/2025, 2025/2026, 2026/2027),
> audité le 18/10/2026, relu colonne par colonne le 31/10/2026 (§ 5 ter).

## 1. Ce que l'école tient aujourd'hui

Un tableau Word, une ligne par élève, une colonne par mois :

| N° | NOMS | CLASSE | SEPT | OCT | NOV | DEC | JAN | … | OBSERVAT° |
|---|---|---|---|---|---|---|---|---|---|
| 1 | ANGELA HOPP | CL2 | 15 000 | 15 000 | 15 000 | / | 15 000 | … | |
| 5 | NNAKANE MILA | PRE N | 7 500 | 15 000 | 15 000 | / | 15 000 | … | Inscrits le 22/09/25 |
| 8 | ESSONO IVRACK | CL3 | 15 000 | 15 000 | | / | AB | AN | … | |

Quatre conventions de lecture, qui sont le cœur du besoin :

| Dans le cahier | Signifie |
|---|---|
| `15 000` | mois complet dû |
| `7 500` | **demi-mois** (inscription en cours de mois) |
| `/` | élève **non inscrit** ce mois-là — ce n'est pas un impayé |
| `A B A N D O N` (une lettre par cellule) | abandon, les mois suivants ne sont plus dus |

Et, sous le tableau : `Q P = 2 500 X nbre` (2025-2026), devenu `Q P = 3500 X NBRE`
en 2026-2027 — une **quote-part** par élève inscrit et par mois, distincte du
tarif payé par la famille. Enfin des notes de règlement d'eau et d'électricité de
la cantine (15 000, puis 10 000, puis 20 000) : ce sont des **dépenses**.

## 2. Ce que NotesCam sait déjà faire — et c'est presque tout

L'audit des structures existantes donne un résultat net : **le modèle est déjà le
bon**. Ce qui ne satisfait pas l'école, c'est la façon dont on le lui présente,
pas la façon dont il est stocké.

| Besoin | Structure existante | Verdict |
|---|---|---|
| Le service « Cantine » et son tarif par année | `fee_catalog` (`name`, `amount`, `academic_year`, `periodicity`, `billing_periods`, `allow_partial`, `allow_exemption`, `start_date`/`end_date`, `active`) | ✔ rien à ajouter — la catégorie `cantine` existe déjà dans le référentiel |
| L'abonnement d'un élève | `student_fee_items` (`student_id`, `fee_catalog_id`, `academic_year`, `amount`, `status`, **`started_at`**) | ✔ `started_at` porte l'inscription en cours d'année |
| L'échéance **mensuelle** | `fee_schedule_items` (`student_id`, `student_fee_item_id`, `period_key` = `'2025-11'`, `period_label`, `amount_due`, `status`) | ✔ une ligne par élève et par mois |
| `15 000` plein mois | `amount_due = 15000`, `status = 'due'` | ✔ |
| `7 500` demi-mois | `amount_due = 7500` + `allow_partial` | ✔ |
| **`/` non inscrit** | `status = 'not_applicable'` | ✔ **le statut existe déjà** |
| **ABANDON** | `status = 'abandoned'` | ✔ **existe déjà** |
| Exemption | `status = 'exempted'` + `allow_exemption` | ✔ |
| Encaissements | `fee_payments` (+ reçu séquentiel, immuabilité) | ✔ |
| Dépenses de la cantine (eau, lumière, denrées) | `budget_expenses` | ✔ |

Et le moteur `src/lib/feeScheduleEngine.js` implémente déjà la mécanique :

- `PERIODICITIES` contient `'mensuel'` ;
- `SCHEDULE_STATUS` = `due, partial, paid, exempted, abandoned, not_applicable` ;
- `debutServiceEffectif({ startedAt, enrolledAt })` → le mois d'entrée ;
- `echeancierPour(...)` → engendre l'échéancier depuis ce mois ;
- `statutEcheance`, `ventilationEcheancier`, `totauxEcheancier` → inscrits,
  abandons et montants attendus **par mois** ;
- `repartitionVersement` → ventile un versement sur les échéances ;
- `peutChangerStatut` → transitions de statut, exemption sous autorisation.

La synchronisation LAN ↔ Cloud de ces trois tables est déjà en place et couverte
par `server/_sync_contract.test.mjs` (montée, descente, idempotence, isolation
par établissement, ordre des clés étrangères).

## 3. Ce qui manque RÉELLEMENT

Trois choses, et trois seulement.

### 3.1 La quote-part par année — une colonne

`fee_catalog` n'a pas où ranger « 2 500 par élève inscrit et par mois ». Ce n'est
pas un montant facturé à la famille : c'est la part que l'école retient sur le
service. L'inscrire comme un frais la ferait apparaître sur la fiche du parent et
dans les totaux de scolarité — une fausse recette.

**Addition minimale proposée** (migration additive et réversible) :

```sql
ALTER TABLE public.fee_catalog ADD COLUMN IF NOT EXISTS quote_part bigint;
-- Retour arrière : ALTER TABLE public.fee_catalog DROP COLUMN IF EXISTS quote_part;
```

Une colonne nullable sur une table **déjà synchronisée, déjà soumise à RLS, déjà
sauvegardée** : ni table nouvelle, ni politique nouvelle, ni inscription dans les
sept registres de synchronisation. Comme le tarif, elle est portée par la ligne
de catalogue de l'année — d'où le changement 2 500 → 3 500 d'une année à l'autre,
sans reprise de données. Elle servira à l'identique au transport.

La quote-part est un **indicateur calculé** (`quote_part × nombre d'inscrits du
mois`), jamais une écriture : elle n'entre ni dans `fee_payments`, ni dans
`cash_movements`, ni dans `budget_expenses`. C'est ce qui évite de la compter
deux fois.

### 3.2 Le registre mensuel — un écran

Le besoin non couvert est de **présentation** : l'école veut sa grille
élèves × mois, pas une fiche par élève. À construire :
`src/pages/Cantine.jsx` (route `/app/cantine`), qui lit les trois tables et rend

- une grille élèves × mois avec les quatre conventions (`15 000`, `7 500`, `/`, `AB`),
- une ligne de totaux par mois : inscrits, abandons, montant attendu, encaissé, impayé,
- la quote-part du mois, calculée,
- un export CSV de l'état mensuel.

### 3.3 Le moteur d'état mensuel — une fonction pure

`src/lib/cantineEngine.js` : assemble catalogue + abonnements + échéances +
versements en la grille ci-dessus, en **réutilisant** `feeScheduleEngine` au lieu
de recalculer. Tests colocalisés `_cantineEngine.test.mjs`.

## 4. Les règles anti-double comptabilisation

| Nature | Va dans | Ne va PAS dans |
|---|---|---|
| Ce que la famille paie | `fee_payments` | `cash_movements` |
| Ce que la cantine dépense (eau, lumière, denrées) | `budget_expenses` | `cash_movements` |
| Fonds remis à la caisse de la cantine | `cash_movements` (`approvisionnement`) | `fee_payments` |
| Quote-part | **nulle part** — calculée à la lecture | aucune table d'écritures |
| Mois non inscrit (`/`) | `fee_schedule_items.status = 'not_applicable'` | ne crée aucune dette |

Le solde de caisse continue de se lire comme aujourd'hui (`cashBookEngine`) :
`cash_movements` + dépenses `paid`. Les recettes de cantine n'y entrent pas
directement, elles relèvent de la caisse de scolarité (`fee_payments` +
`cash_sessions`). Mélanger les deux serait exactement la double comptabilité que
l'architecture écarte.

## 4 bis. Spécification fonctionnelle

### 4bis.1 Objets manipulés

| Objet | Porté par | Clé | Durée de vie |
|---|---|---|---|
| Service « Cantine » de l'année | `fee_catalog` | (école, `academic_year`, `name`) | une année scolaire |
| Abonnement d'un élève | `student_fee_items` | (école, élève, `fee_catalog_id`, année) | de `started_at` à l'abandon |
| Échéance mensuelle | `fee_schedule_items` | (abonnement, `period_key`) | un mois |
| Encaissement | `fee_payments` | reçu séquentiel | immuable |
| Dépense de la cantine | `budget_expenses` | — | — |

### 4bis.2 Règles de gestion

1. **Mois dû.** Un abonnement engendre une échéance par mois de la période de
   facturation du service, à partir du mois de `started_at` inclus. Avant ce
   mois : aucune échéance (et non une échéance à zéro — la nuance compte, une
   échéance à zéro apparaîtrait dans les états).
2. **Demi-mois.** Une entrée en cours de mois donne une échéance à tarif réduit
   sur ce seul mois. Le taux du demi-mois est un paramètre, pas une constante
   (le cahier emploie 7 500 pour 15 000, soit la moitié).
3. **Non inscrit (« / »).** Statut `not_applicable` : ne crée aucune dette,
   n'entre ni dans l'attendu, ni dans les impayés, ni dans la quote-part.
4. **Abandon.** Statut `abandoned` à partir du mois d'arrêt. Les mois déjà dus
   restent dus ; les mois suivants sortent de l'attendu. Un abandon n'efface
   jamais un impayé antérieur.
5. **Exemption.** Statut `exempted`, soumis à `allow_exemption` sur le service,
   et tracé — c'est une décision, pas une correction de saisie.
6. **Réinscription.** Un élève qui revient après un abandon reprend des
   échéances `due` aux mois suivants ; les mois d'absence restent
   `not_applicable` ou `abandoned` selon ce qui s'est passé.
7. **Quote-part.** Indicateur **calculé** : `quote_part × effectif facturé du
   mois`. Jamais stocké comme écriture, jamais additionné aux recettes.
8. **Changement d'exercice.** Le tarif et la quote-part sont portés par la ligne
   de catalogue de l'année. Deux années coexistent sans reprise de données
   (déjà prouvé pour les échéances, cas 14-15 du test de contrat).

### 4bis.3 États mensuels attendus

Pour un mois donné et une unité donnée :

| Colonne | Calcul |
|---|---|
| Inscrits | échéances de statut `due`, `partial` ou `paid` |
| Demi-mois | parmi elles, celles au tarif réduit |
| Abandons | échéances `abandoned` |
| Non inscrits | échéances `not_applicable` (ou absence d'échéance) |
| Exemptés | échéances `exempted` |
| Attendu | Σ `amount_due` des échéances dues |
| Encaissé | Σ versements rattachés à ces échéances |
| Impayé | Attendu − Encaissé (jamais négatif ; un trop-perçu est un autre sujet) |
| Quote-part | `quote_part × Inscrits` |

### 4bis.4 Ce que l'écran doit permettre

Consulter la grille élèves × mois ; poser un statut sur une échéance (avec
l'autorisation correspondante) ; saisir un encaissement par le mécanisme
existant ; exporter l'état mensuel en CSV. **Aucune écriture financière nouvelle
n'est introduite** : les recettes passent par `fee_payments`, les dépenses par
`budget_expenses`.

## 5. Tableau des calculs possibles, et deux ambiguïtés à lever

### 5.1 Les effectifs sont établis, eux

La ligne « Q P » du cahier 2025/2026 permet de retrouver l'effectif de chaque
mois, et la vérification boucle : **2 500 × 246 mois-élèves = 615 000**, qui est
exactement le « TOTAL GENERAL » inscrit par l'école. Les effectifs ci-dessous
sont donc fiables.

| Mois | Effectif | Q P inscrite (2 500) |
|---|---|---|
| Septembre 2025 | 33 | 82 500 |
| Octobre | 37 | 92 500 |
| Novembre | 28 | 70 000 |
| Décembre | 0 | / |
| Janvier 2026 | 35 | 87 500 |
| Février | 32 | 80 000 |
| Mars | 37 | 92 500 |
| Avril | 11 | 27 500 |
| Mai | 33 | 82 500 |
| **Total** | **246** | **615 000** ✔ |

### 5.2 Ambiguïté n° 1 — le tarif mensuel

| Hypothèse | Attendu des familles sur l'année (246 mois-élèves) | Quote-part de l'école | Rapport |
|---|---|---|---|
| **A — 15 000** (valeur lue dans les trois cahiers) | **3 690 000** | 615 000 | l'école garde **17 %** |
| **B — 500** (valeur de la demande écrite) | **123 000** | 615 000 | la quote-part vaut **5 fois** ce que paient les familles |

L'hypothèse B est arithmétiquement intenable : la part retenue par l'école
dépasserait de cinq fois la somme encaissée. **Le tarif est donc presque
certainement 15 000**, et « 500 » une coquille. Je n'implémente ni l'un ni
l'autre avant confirmation écrite de l'administration.

Avec la quote-part 2026-2027 (3 500) et à effectif comparable :
246 × 3 500 = **861 000** par an.

### 5.3 Ambiguïté n° 2 — TRANCHÉE : la cantine est TENUE PAR L’ÉCOLE (2026-10-31)

> **Tranchée le 2026-10-31 par le responsable : « non c’est l’école ».**
> C’est la **lecture 2**. Ce qui suit est le raisonnement d’origine, conservé
> parce qu’il pose correctement les deux lectures ; voir § 5 ter.B pour la
> réponse et pour l’erreur d’interprétation qu’elle corrige.

En recoupant les totaux, le cahier ne totalise **pas** ce que paient les
familles : il totalise les **quote-parts**.

- 2025/2026 : `TOTAL GENERAL + EAU ET LUMIERE = 615 000 + 35 000 = 650 000`,
  et 615 000 est exactement Σ(quote-parts).
- 2024/2025 : `TOTAL GENERAL = 855 000`, et les totaux mensuels (135 000,
  135 000, 117 500, …) sont posés dans les sous-colonnes « Q P ». 135 000 / 2 500
  = 54 élèves.

Deux lectures en découlent, et elles ne conduisent pas au même modèle :

| | Lecture 1 — cantine **exploitée par un tiers** | Lecture 2 — cantine **tenue par l'école** |
|---|---|---|
| Les 15 000 | encaissés par le prestataire, **n'entrent jamais** dans les comptes de l'école | encaissés par l'école |
| La quote-part | **recette** de l'école (2 500/élève/mois) | affectation interne, pas une recette |
| Eau et lumière (35 000) | contribution versée **à** l'école | dépense **de** l'école |
| Dans NotesCam | QP → recette (`fee_catalog` « Quote-part cantine », ou `cash_movements` en `recette_diverse`) ; les 15 000 ne sont **pas** des `fee_payments` | 15 000 → `fee_payments` ; QP → indicateur calculé ; eau/lumière → `budget_expenses` |

La proposition du §3 suppose la **lecture 2**. Si c'est la lecture 1 qui vaut,
enregistrer les 15 000 en `fee_payments` créerait **3 690 000 de recettes
fictives** sur l'année — exactement la double comptabilisation à éviter.

Il faut donc trancher cette question **avant** le tarif. Une phrase de
l'administration suffit : « la cantine est-elle tenue par l'école, ou par un
prestataire qui lui verse une quote-part ? »

### 5.4 Ambiguïté n° 3 — TRANCHÉE PAR COMPTAGE (2026-10-31)

> **Résolue le 2026-10-31 — voir § 5 ter.C.** Aucun élève n’a payé le mois plein
> en avril : l’hypothèse « 11 élèves à 2 500 » est morte. **La quote-part suit le
> demi-mois** (1 250).

Avril 2026 : quote-part 27 500, soit 11 élèves à 2 500. Or plusieurs lignes
d'avril portent 7 500 (demi-mois). 27 500 est donc compatible avec 11 élèves à
taux plein **ou** 22 élèves à demi-taux (22 × 1 250). À préciser : **la
quote-part suit-elle le demi-mois ?**

## 5 bis. Un chiffre à confirmer avant toute saisie

La demande mentionne « un tarif mensuel de **500 FCFA** ». Les documents audités
donnent **15 000 FCFA** par mois (et 7 500 le demi-mois), la quote-part étant de
2 500 puis 3 500.

| Source | Tarif mensuel | Quote-part |
|---|---|---|
| `CANTINE.docx` 2024/2025 et 2025/2026 | 15 000 | 2 500 |
| `CANTINE.docx` 2026/2027 | 15 000 (ligne BRYANT FIDELE) | 3 500 |
| Demande écrite | **500** | 2 500 / 3 500 |

Le tarif étant un **paramètre** (`fee_catalog.amount`), l'architecture est
indifférente à sa valeur. Mais aucune ligne ne sera créée avant que vous ayez
confirmé le montant : à 500 FCFA, le montant attendu d'un mois à 37 inscrits
tombe de 555 000 à 18 500, et tous les états mensuels seraient faux.


## 5 ter. Ce que le registre tranche, mesuré le 2026-10-31

Relecture de `CANTINE.docx` par extraction du `document.xml`, colonne par
colonne. Deux des trois ambiguïtés tombent sans qu'il faille écrire à l'école.

### A. Les deux années se bouclent EXACTEMENT sur la quote-part

```
2024/2025   135 000 + 135 000 + 117 500 + 117 500 + 87 500 + 92 500 + 97 500 + 72 500
            = 855 000      le cahier écrit « TOTAL GENERAL = 855 000 FCFA »
2025/2026    82 500 +  92 500 +  70 000 +  87 500 + 80 000 + 92 500 + 27 500 + 82 500
            = 615 000      le cahier écrit « 615 000 + 35 000 = 650 000 FCFA »
```

Les totaux du cahier ne totalisent donc PAS les 15 000 des familles. Ils
totalisent les quote-parts, et rien d'autre.

### B. Ambiguïté n° 2 — TRANCHÉE PAR LE PROPRIÉTAIRE : c'est l'ÉCOLE

**Réponse du responsable, 2026-10-31 : « non c'est l'école ».** La cantine est
TENUE PAR L'ÉCOLE. C'est la **lecture 2**, celle que le § 3 supposait depuis le
début, et le § 3 reste donc valide tel qu'il est écrit.

J'avais conclu l'inverse quelques heures plus tôt, à partir du signe de
l'addition (`615 000 + 35 000`) et de la formule « VERSEMENT eau et lumière DE
LA CANTINE ». Le raisonnement était faux, et il faut dire POURQUOI, sinon il
reviendra : **ce cahier n'est pas un état de caisse, c'est un état de RÉSULTAT de
l'activité cantine.** Il ne totalise pas ce que l'école encaisse ; il totalise ce
que la cantine lui RAPPORTE — la marge par élève, plus la facture d'eau et de
lumière que l'activité a réglée elle-même, donc que l'école n'a pas eu à payer.
Une somme que l'on n'a pas déboursée s'ajoute au résultat exactement comme une
recette. D'où l'addition, sans aucun tiers dans l'histoire.

### Ce que la lecture 2 impose, et c'est l'inverse de ce que j'avais écrit

| Flux | Nature | Où, dans NotesCam |
|---|---|---|
| 15 000 / élève / mois (7 500 le demi-mois) | **RECETTE** de l'école | `fee_payments` sur une ligne `fee_catalog` de catégorie `cantine` |
| Nourriture, cuisinier, eau et lumière | **DÉPENSES** de l'école | `budget_expenses` |
| Quote-part 2 500 (3 500 en 2026/2027) | **INDICATEUR CALCULÉ** — la marge | nulle part en écriture |

La quote-part ne doit JAMAIS devenir une écriture. Elle est déjà CONTENUE dans
les 15 000 : l'enregistrer en plus la compterait deux fois. C'est précisément la
règle anti-double-comptabilisation du § 4, et c'est elle qui tient.

De même, les 35 000 d'eau et lumière ne sont pas une recette : c'est une
**dépense** de l'école, que le cahier présente en positif parce qu'il raisonne en
résultat d'activité, pas en trésorerie.

### C. Ambiguïté n° 3 — le comptage d'avril la tranche

Avril 2026 portait une quote-part de 27 500, compatible sur le papier avec
11 élèves à 2 500 ou 22 à 1 250. Le comptage colonne par colonne décide :

```
colonne AVR, sur les 33 lignes lisibles en colonnes du cahier 2025/2026
    7 500 (demi-mois)   19
    /                   11
    ABANDON / vide       3
    15 000 (mois plein)  0     <-- AUCUN
```

**Aucun élève n'a payé le mois plein en avril**, et dix-neuf sont déjà au
demi-mois — plus que les onze qu'exigerait l'hypothèse du taux plein. Trois
demi-mois d'avril supplémentaires se trouvent dans les lignes 34-47, que
l'extraction rend à plat : 19 + 3 = 22, et 22 × 1 250 = **27 500**, au franc près.

**La quote-part suit le demi-mois** : 1 250 quand l'élève paie 7 500.

### D. Ce qui reste à confirmer — et l'enjeu est REDEVENU entier

Sous la lecture 2, l'ambiguïté n° 1 (tarif 500 ou 15 000) **redevient critique** :
les 15 000 sont maintenant la recette elle-même. À 246 mois-élèves, l'écart entre
les deux hypothèses est de **3 690 000 contre 123 000 FCFA** sur l'année.

L'arithmétique tranche déjà, et le § 5.2 le montrait : à 500 FCFA encaissés, une
quote-part de 2 500 retenue par l'école vaudrait **cinq fois** la somme perçue.
C'est impossible. **Le tarif est 15 000**, et « 500 » est une coquille — très
probablement pour « 2 500 », qui est la quote-part.

Il reste à le faire confirmer par une ligne de l'administration avant la première
saisie, non parce que le doute est réel, mais parce qu'un montant faux dans un
état financier ne se rattrape pas : il se propage.

### E. Deux règles que la spécification ne couvre pas encore

1. **Le rattrapage.** « Certains parents (03) n'ayant pas payé se sont rattrapés
   au mois de Janvier 2026 », et deux lignes portent **30 000** en janvier — deux
   mois en un versement. Le mois PAYÉ n'est pas le mois SERVI : l'effectif de
   novembre doit rester 28, sans quoi la quote-part de janvier serait gonflée.
2. **Décembre n'existe pas.** La colonne DEC vaut `/` pour tout le monde en
   2025/2026, et le cahier 2024/2025 ne la porte pas du tout. Un mois sans
   cantine n'est pas un mois à zéro impayé : il doit être neutre.

## 6. Tests prévus

| Cas | Ce qui doit être prouvé |
|---|---|
| Inscription en cours d'année | `started_at` au 22/09 → aucune échéance avant septembre, et septembre à 7 500 |
| Demi-mois | `amount_due = 7500` accepté, et compté comme tel dans le montant attendu |
| Abandon en cours d'année | les mois suivants passent `abandoned` et **sortent du dû** |
| Élève non inscrit (`/`) | `not_applicable` ne crée aucune dette et n'entre pas dans les impayés |
| Changement d'exercice | 2025-2026 à 2 500 et 2026-2027 à 3 500 coexistent sans s'écraser (déjà prouvé pour les échéances par le test de contrat, cas 14-15) |
| Impayés | attendu − encaissé par mois, sans compter les mois exemptés/abandonnés/non applicables |
| Relance de synchronisation | une échéance de cantine montée deux fois ne crée qu'une ligne ; une décision venue du Cloud converge en LAN |
| Quote-part | recalculée à la lecture, et absente de toute table d'écritures |

## 7. Ce que cela représente

| | Fichiers | Nature |
|---|---|---|
| Migration | `supabase_cantine_quote_part.sql` | 1 colonne nullable, réversible |
| Miroir LAN | `server/schema.sql`, `server/db.js` | 1 `ensureColumn` |
| Moteur | `src/lib/cantineEngine.js` + test | pur, réutilise `feeScheduleEngine` |
| Écran | `src/pages/Cantine.jsx` + route + navigation | lecture et saisie du registre |
| Tables nouvelles | **aucune** | |
| Registres de synchronisation à modifier | **aucun** | `fee_catalog` y est déjà |

C'est le résultat le plus utile de cet audit : le besoin cantine ne demande pas
un module parallèle, il demande **une colonne et un écran**.
