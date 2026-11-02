# RELEVÉ DES PV PAPIER — structure lue sur les photos

> **Rien n'est codé.** Ce document est le relevé à valider avant de construire
> quoi que ce soit. Chaque barème ci-dessous a été lu sur la photo redressée et
> agrandie, pas déduit. Ce que je n'ai pas pu lire est dit comme tel.
> Relevé le 2026-11-01.

## 0. Trois corrections à l'hypothèse de départ

1. **Les PV 2 et 3 ne sont pas du CM1.** Le titre manuscrit en haut à gauche du
   PV 2 se lit **« 1ère éval 2627 CE1 … »**. C'est donc une classe de **CE1**,
   pas du cours moyen. Le dernier caractère (le groupe : A, B, 2 ?) reste illisible.
2. **PV 1 et PV 2/3 ne sont pas la même classe** — les listes d'élèves diffèrent :
   PV 1 commence par ABDOUL AZIZ **ADAMA** (35 élèves), PV 2/3 par ABDOUL AZIZ
   **ALKASSOUM** (31 à 33 élèves). L'hypothèse « deux classes différentes » est
   donc confirmée ; reste à nommer celle du PV 1.
3. **« Remplacer les PV actuels » demande une décision.** Le PV existant de
   l'application (`src/lib/pvDoc.js`, 339 lignes) est un **PV de délibération** :
   une ligne par élève, moyennes, décisions, trois blocs de signature. Les
   feuilles photographiées sont tout autre chose : des **feuilles de saisie de
   notes par matière**. Les remplacer détruirait un document qui fonctionne et
   qui n'a pas le même usage. Je propose d'**ajouter** un « PV de notes » et de
   laisser le PV de délibération en place — à confirmer.

---

## 1. PV 1 — tableau par matières avec barèmes

**35 élèves.** Colonnes `Total`, `Moyenne` et `Rang` présentes mais **vides**
sur toute la feuille.

| # | Intitulé lu | Barème |
|---|---|---|
| 1 | `dict -` → Dictée | **40** |
| 2 | `Prod` → Production d'écrit | **30** |
| 3 | `anglai` → Anglais | **30** |
| 4 | `calcul` → Calcul | **20** |
| 5 | `problè` → Problème | **50** |
| 6 | `sc.e…` → Sciences et … *(fin illisible)* | **50** |
| 7 | `conn` → Connaissances ? *(à confirmer)* | **40** |
| 8 | `TIC` | **30** |
| 9 | `EPS` | **20** |
| | **Somme des barèmes** | **310** ✅ *(votre lecture est confirmée)* |

Puis : `Total` | `Moyenne` | `Rang`.

### Ce que je n'ai pas pu lire sur le PV 1

* L'intitulé complet des colonnes **6** (`sc.e…`) et **7** (`conn`).
* **Aucun en-tête n'est imprimé** : pas d'établissement, pas d'année, pas de
  classe, pas d'enseignant, pas de date, pas de zone de signature. La feuille
  commence directement au tableau. Il faudra donc **composer** l'en-tête à partir
  des champs standard — il n'y a rien à reproduire.

---

## 2. PV 2 et 3 — grilles par compétences (CE1)

Deux pages de la même feuille : PV 2 porte les compétences **1 à 3**, PV 3 les
compétences **4 à 6**, pour les mêmes élèves dans le même ordre.

Chaque sous-compétence a son propre bloc de colonnes. Les colonnes sont
toujours, dans cet ordre : **oral · écrit · *(3ᵉ colonne)* · *(4ᵉ colonne)* · total**,
chacune avec sa ligne « sur N ». La 3ᵉ colonne porte un libellé imprimé en
petits caractères pâles qui se lit **« pratique »** ; la **4ᵉ n'a pas de
libellé** (un simple trait).

| Compétence | oral | écrit | *pratique* | *(4ᵉ)* | **total** | contrôle |
|---|---|---|---|---|---|---|
| 1a | 12 | 15 | 3 | — | **30** | 12+15+3 = 30 ✅ |
| 1b | 12 | 15 | 3 | — | **30** | ✅ |
| 1c | 10 | 6 | 2 | 2 | **20** | 10+6+2+2 = 20 ✅ |
| 2a | 8 | 28 | 4 | — | **40** | 8+28+4 = 40 ✅ |
| 2b | 6 | 7 | 20 | 7 | **40** | 6+7+20+7 = 40 ✅ |
| 3a | 3 | 8 | 5 | 4 | **20** | 3+8+5+4 = 20 ✅ |
| 3b | 3 | 9 | 5 | 3 | *(coupé)* | 3+9+5+3 = 20 → **/20 présumé** |
| 4 | 5 | 2 | 11 | 2 | **20** | 5+2+11+2 = 20 ✅ |
| 5 | 4 | 10 | 20 | 6 | **40** | 4+10+20+6 = 40 ✅ |
| 6a1 | 2 | 2 | 12 | 4 | **20** | 2+2+12+4 = 20 ✅ |
| 6a2 | 3 | 15 | 2 | — | **20** | 3+15+2 = 20 ✅ |
| 6b | 2 | 4 | 12 | 2 | **20** | 2+4+12+2 = 20 ✅ |

**Chaque ligne se vérifie** : la somme des colonnes fait exactement le total
annoncé. C'est ce qui donne confiance dans le relevé, y compris pour 3b dont le
total est coupé au bord de la photo.

Totaux : **PV 2 = 200 points**, **PV 3 = 120 points**, ensemble **320**.

### Ce que je n'ai pas pu lire sur les PV 2 et 3

* Le **libellé pédagogique des six compétences** : le papier ne porte que
  « compétence 1a », « compétence 2b »… jamais ce qu'elles évaluent.
* Le libellé exact de la **3ᵉ colonne** (« pratique » est une lecture probable,
  pas une certitude) et le fait que la **4ᵉ n'en ait aucun** — est-ce voulu ?
* Le **total de la compétence 3b** (bord de page).
* Le **groupe de la classe** dans le titre (« CE1 … »).

---

## 3. Les marques dans les cases — **deux signes différents**

Le PV 1 porte **deux marques distinctes**, et elles ne peuvent pas vouloir dire
la même chose :

* une **croix** (`×`, parfois `xxxx` couvrant plusieurs cases) ;
* un **trait horizontal** (`—`), par exemple l'élève n° 2 en Dictée et en
  Production d'écrit.

Les PV 2 et 3 portent surtout des croix, en blocs couvrant toutes les colonnes
d'une compétence.

L'application distingue déjà **une note absente** (`null` / `''` / `'ABS'`,
exclue des moyennes) d'un **zéro** (`src/core/apcEngine.js:106`,
`bulletinEngine.js:29`). Mais elle ne distingue **pas** « absent » de
« non évalué » : les deux deviennent « pas de note ». Les séparer est faisable
et additif.

**Question :** la croix et le trait désignent-ils deux choses différentes
(par exemple croix = élève absent, trait = compétence non évaluée) ou la même ?

---

## 4. Ce qui existe déjà et qu'il n'y a pas à reconstruire

* **Les barèmes par classe existent.** La table `subjects` est déjà **par
  classe** (`class_id`), avec `name`, `coef`, **`max`** et `position`
  (`server/schema.sql:142`). Le PV 1 est donc exactement l'impression des
  matières de la classe avec leur `max` : **aucune table nouvelle**, et la somme
  310 est `Σ subjects.max`.
* **Le socle d'impression A4 paysage existe** (`src/lib/print`,
  `documentScale.js`), avec le contrôle « une feuille = une page » mesuré par
  `npm run test:print`.
* **Les calculs APC existent** et ne seront pas touchés.

---

## 5. Les quatre points à trancher avant que je construise

1. **La classe du PV 1** — CM2 comme vous le pensez, ou autre ? Et le groupe du
   CE1 des PV 2/3.
2. **La règle de calcul du PV 1.** Je propose : `Total = Σ notes` ;
   `Moyenne = Total ÷ 310 × 20`, arrondie à 2 décimales ; `Rang` par moyenne
   décroissante, ex æquo au même rang et rang suivant sauté (1, 2, 2, 4). Les
   trois colonnes étant vides sur votre photo, **je ne devine pas** : confirmez.
3. **Croix et trait** : deux sens, ou un seul ? (§ 3)
4. **Remplacer ou ajouter** le PV de délibération existant (§ 0.3).

Et, pour que la maquette soit juste du premier coup : **les intitulés des six
compétences du CE1**, que le papier ne porte pas.
