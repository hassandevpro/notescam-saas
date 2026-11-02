# Audit de réconciliation — scolarité attendue 2026-2027
## THE GENIUS INTERNATIONAL SCHOOL & COLLEGE

**Date** : 2026-11-01 · **Portée** : lecture seule, aucune donnée ni ligne de code modifiée.
**École** : `6b68407b-3d2e-426b-81ff-c4e68e66120a` (il existe une SECONDE école nommée
« The Genius International School », `9de939d0-…` : ne jamais viser par le nom).
**Source** : base Supabase de production, lue avec la clé service-role.

> Ce document nomme des élèves. Il contient des données personnelles d'une école cliente :
> il n'a pas vocation à être diffusé hors de l'équipe et du coordinateur de l'école.

---

## Le résultat en une ligne

| | Effectif | Scolarité attendue |
|---|---:|---:|
| Document du coordinateur | 713 | **137 950 000** |
| NotesCam | 713 | **134 580 000** |
| **Écart** | **0** | **−3 370 000** |

L'écart est **entièrement expliqué**, sans reste. Ce n'est pas un bug de calcul :
l'application additionne correctement ce qu'elle contient. **Il manque 17 fiches de
frais**, et 9 élèves portent un tarif qui ne correspond pas à leur section.

---

## Étape 1 — Comment l'application calcule « scolarité attendue »

### La chaîne, fichier par fichier

| Rôle | Où |
|------|-----|
| Le total affiché | `src/pages/BudgetGlobal.jsx:88` → `feeForecast(fees, pos.fraction)` |
| Le calcul | `src/lib/budgetAnalyticsEngine.js:65` |
| Consolidation multi-écoles | `src/lib/groupStatsEngine.js:20` (même formule) |
| Le dû par élève (écran Frais) | `src/pages/Fees.jsx:113` → `studentTotalsNetOfGrid` |
| Les remises | `src/lib/feeEngine.js:68` → `applyAdjustments` |
| L'échéancier | `src/lib/feeEngine.js` → `baseSchedule` |

Le calcul tient en une ligne :

```js
// src/lib/budgetAnalyticsEngine.js:65
const expected = fees.reduce((s, x) => s + (Number(x.frais_annuels) || 0), 0);
```

### Ce que cela implique — et c'est tout l'audit

| Question | Réponse constatée |
|----------|-------------------|
| **Source du tarif** | **Par élève**, figé dans `student_fees.frais_annuels`. Pas par classe, pas par cycle. |
| **Un élève sans fiche** | **Compte pour 0**, silencieusement. Aucun écran ne le signale. |
| **Ce qui est inclus** | La scolarité seule. `UNIQUE(student_id, academic_year)`. |
| **Inscription / tenue / cantine** | **Exclues** — elles vivent dans `fee_catalog` / `student_fee_items`, que ce total ne lit pas. |
| **Remises / bourses** | `adjustments` existe, mais le total est **BRUT** : `feeForecast` ne déduit rien. Sans objet ici : **0 ajustement** en base. |
| **Tranches** | Sans effet : le total lit `frais_annuels`, pas la somme des tranches. |
| **Année scolaire** | Filtrée, `academic_year = '2026-2027'`. 696 lignes, aucune autre année, aucun doublon. |
| **Statut d'élève** | **Aucun filtre.** Un élève **archivé** garde sa fiche et reste compté. |
| **Effet de la date du jour** | **Aucun** sur l'attendu. `elapsedFraction` ne sert qu'à la *projection* de recouvrement. |

### La grille tarifaire n'existe pas

`class_fee_grids` est la table prévue pour porter le tarif **par classe**. Pour 2026-2027 :

```
1 grille pour 28 classes — et elle est à ZÉRO
  CP : comptant 0 · échelonné 0 · inscription 0 · tranches (vide)
27 classes sans aucune grille
```

**Les 180 000 / 190 000 / 210 000 ne sont configurés nulle part.** Ils ont été écrits
élève par élève. C'est la cause racine de tout l'écart : rien, dans le système, ne peut
dire qu'un élève de SIL BIL doit porter 210 000. Donc rien ne détecte qu'il porte
180 000, ni qu'il n'a pas de fiche du tout.

---

## Étape 2 — Les chiffres de l'application, par classe

| L | Classe | Effectif | Archivés | Sans fiche | Attendu app |
|---|--------|---------:|---------:|-----------:|------------:|
| 1 | CRECHES | 9 | 0 | 0 | 1 620 000 |
| 2 | NURSERY 1 A | 38 | 0 | 0 | 7 980 000 |
| 2 | NURSERY 1 B | 37 | 1 | 1 | 7 560 000 |
| 2 | NURSERY 2 A | 41 | 1 | 1 | 8 370 000 |
| 2 | NURSERY 2 B | 40 | 0 | 0 | 8 400 000 |
| 2 | PRE-MATERNELLE A | 38 | 2 | 0 | 7 980 000 |
| 2 | PRE-MATERNELLE B | 36 | 2 | 1 | 7 350 000 |
| 3 | SIL BIL | 22 | 0 | 1 | 4 350 000 |
| 3 | CP BIL | 11 | 0 | 2 | 1 860 000 |
| 3 | CE1 BIL | 8 | 0 | 1 | 1 470 000 |
| 3 | CE2 BIL | 5 | 0 | 1 | 810 000 |
| 4 | CM2 | 26 | 0 | 2 | 4 560 000 |
| 4 | Class 6 | 18 | 0 | 0 | 3 420 000 |
| 5 | SIL | 25 | 0 | 1 | 4 350 000 |
| 5 | CP | 18 | 1 | 0 | 3 240 000 |
| 5 | CE1 | 24 | 0 | 2 | 3 960 000 |
| 5 | CE2 | 25 | 0 | 1 | 4 320 000 |
| 5 | CM1 | 24 | 0 | 1 | 4 140 000 |
| 5 | Class 1 A | 22 | 1 | 0 | 3 990 000 |
| 5 | Class 1 B | 23 | 0 | 0 | 4 170 000 |
| 5 | Class 2 | 39 | 0 | 0 | 7 050 000 |
| 5 | Class 3 | 30 | 0 | 0 | 5 400 000 |
| 5 | Class 4 | 36 | 0 | 1 | 6 300 000 |
| 5 | Class 5 | 31 | 0 | 1 | 5 400 000 |
| 6 | 6eme | 19 | 0 | 0 | 3 610 000 |
| 6 | 5eme | 10 | 0 | 0 | 1 900 000 |
| 6 | FORM1 | 41 | 1 | 0 | 7 790 000 |
| 6 | FORM2 | 17 | 1 | 0 | 3 230 000 |

Les 28 classes de la base se répartissent dans les 6 lignes du document, **sans reste** :
aucune classe n'est hors réconciliation.

### Encaissé et reste

| | Montant |
|---|---:|
| Attendu (`Σ frais_annuels`) | 134 580 000 |
| Encaissé (`Σ frais_payes`) | 86 478 500 |
| **Reste à recouvrer** | **48 101 500** |
| Taux de recouvrement | 64,3 % |

908 versements numérotés pour 2026-2027, reçus n° 1 à 955.

---

## Étape 3 — Réconciliation ligne par ligne

| L | Libellé | Eff. doc | Eff. app | Tarif doc | Tarif app | Montant doc | Montant app | Écart | Cause |
|---|---------|---------:|---------:|----------:|-----------|------------:|------------:|------:|-------|
| 1 | Crèche | 9 | 9 | 180 000 | 180 000 | 1 620 000 | 1 620 000 | 0 | — |
| 2 | Maternelle, autres | 230 | 230 | 210 000 | 210 000 ×226 / 180 000 ×1 | 48 300 000 | 47 640 000 | −660 000 | 3 sans fiche ; 1 tarif déviant |
| 3 | Primaire bilingue | 46 | 46 | 210 000 | 210 000 ×37 / 180 000 ×4 | 9 660 000 | 8 490 000 | −1 170 000 | 5 sans fiche ; 4 tarifs déviants |
| 4 | CM2 / Class 6 | 46 | 44 | 190 000 | 190 000 | 8 740 000 | 7 980 000 | −760 000 | effectif 44 vs 46 ; 2 sans fiche |
| 5 | Autres primaires | 295 | 297 | 180 000 | 180 000 ×286 / 210 000 ×4 | 53 100 000 | 52 320 000 | −780 000 | effectif 297 vs 295 ; 7 sans fiche ; 4 tarifs déviants |
| 6 | Collège | 87 | 87 | 190 000 | 190 000 | 16 530 000 | 16 530 000 | 0 | — |
| | **TOTAL** | **713** | **713** | | | **137 950 000** | **134 580 000** | **−3 370 000** | |

### Décomposition en trois causes, et le bouclage

L'identité employée, exacte par construction et non estimée :

```
Doc_L  = effDoc × tarifDoc
App_L  = (effApp − sansFiche) × tarifDoc + Σ(frais_annuels − tarifDoc)

App_L − Doc_L = (effApp − effDoc) × tarifDoc   ← effectif
              − sansFiche × tarifDoc           ← fiches manquantes
              + Σ(frais_annuels − tarifDoc)    ← tarifs déviants
```

| L | Effectif | Fiches manquantes | Tarifs déviants | Écart de la ligne |
|---|---------:|------------------:|----------------:|------------------:|
| 1 | 0 | 0 | 0 | 0 |
| 2 | 0 | −630 000 | −30 000 | −660 000 |
| 3 | 0 | −1 050 000 | −120 000 | −1 170 000 |
| 4 | −380 000 | −380 000 | 0 | −760 000 |
| 5 | +360 000 | −1 260 000 | +120 000 | −780 000 |
| 6 | 0 | 0 | 0 | 0 |
| **TOTAL** | **−20 000** | **−3 320 000** | **−30 000** | **−3 370 000** |

```
Somme des trois causes : −3 370 000
Écart observé          : −3 370 000
Reste inexpliqué       :           0   ✔
```

Vérification par un autre chemin : `Σ student_fees.frais_annuels` = 134 580 000, et
134 580 000 − 137 950 000 = −3 370 000. Les six lignes couvrent exactement le total de
l'écran : **différence 0**, donc aucun élève n'est hors réconciliation.

---

## Étape 4 — Les sept hypothèses, tranchées

### H1 · Grille de tarifs — **CONFIRMÉE, cause racine**

**Preuve.** `class_fee_grids` pour 2026-2027 : **1 ligne sur 28 classes, à zéro**
(CP : comptant 0, échelonné 0, inscription 0, tranches vides). 27 classes sans grille.

Il n'y a **ni tarif unique ni tarif par défaut** : il n'y a pas de tarif du tout au niveau
de la classe. Les six tarifs du document ne sont configurés nulle part. Les montants sont
des valeurs isolées sur chaque élève — ce qui explique mécaniquement H3.

**Verdict : le document a raison** sur la grille voulue ; l'application ne la connaît pas.

### H2 · Composition des frais — **ÉCARTÉE**

**Preuve.** `expected` ne lit que `student_fees.frais_annuels`. Le catalogue de l'école ne
contient que « Cantine » (15 000) et « Transport » (10 000) ; 4 abonnements, 110 500, et
ils **n'entrent pas** dans les 134 580 000. Aucune grille ne porte d'inscription
(`amount_inscription = 0`). Aucune tranche n'intervient : le total lit `frais_annuels`,
jamais la somme des tranches.

Les trois valeurs effectivement portées — 180 000 / 190 000 / 210 000 — sont **exactement**
les frais unitaires du document. Les deux sources parlent donc bien de la même chose : la
scolarité seule, hors inscription et hors frais annexes.

**Verdict : les deux sources sont d'accord.** Aucune contribution à l'écart.

### H3 · Remises, bourses, fratries, gratuités — **ÉCARTÉE**

**Preuve.** `adjustments` : **0 élève** sur 696 en porte un. Remise totale **0**.
Attendu net = attendu brut = 134 580 000.

À noter pour la suite : `feeForecast` somme `frais_annuels` **sans** déduire les
ajustements. Le jour où l'école accordera une bourse, le tableau de bord continuera
d'afficher le brut. Ce n'est pas la cause ici, mais c'est un défaut en attente.

**Verdict : aucune remise n'existe.** Aucune contribution à l'écart.

### H4 · Élèves inclus ou exclus à tort — **CONFIRMÉE, l'essentiel de l'écart**

**Preuve.** 713 élèves, **696** fiches de frais → **17 élèves sans fiche**, qui comptent
pour 0 au lieu du tarif de leur section. Impact : **−3 320 000**, soit **98,5 %** de l'écart.

| Classe | Nom | Matricule | Tarif dû |
|--------|-----|-----------|---------:|
| CP BIL | NGOUANE LOKO LUCK | P260001 | 210 000 |
| CP BIL | MEYOU POAKA DIVINE | P260002 | 210 000 |
| SIL BIL | SIMO KENMEGNE SAGESSE | P260165 | 210 000 |
| CE1 BIL | TEKAM EMBELI HEIDY JANICE | P260021 | 210 000 |
| CE2 BIL | TEKAM TEKAM GERRIT | P260038 | 210 000 |
| NURSERY 1 B | SIMO EDEN | M260043 | 210 000 |
| NURSERY 2 A | NOUMBO TAGUELLA JOAS | M260069 | 210 000 |
| PRE-MATERNELLE B | OUEGOUM NGOUANE BEN GEREMI | *(aucun)* | 210 000 |
| CM2 | SIMO KAMMEGNE TATCHEMO IRVING | P260058 | 190 000 |
| CM2 | SIMO POUEMEGNE ORCHIDEE | P260059 | 190 000 |
| SIL | PEUME POAKA ANGE RAPHAEL | P260156 | 180 000 |
| CE1 | KENGNE TAGUELA JESSIYA | P260010 | 180 000 |
| CE1 | MAMBOU LELE FREDY URIEL | P260014 | 180 000 |
| CE2 | POUTOUGNIGNI MOHAMED JALIL | P260034 | 180 000 |
| CM1 | DOKO TAGUELA JEMIMA | P260041 | 180 000 |
| Class 4 | NOMO MAMAYOU GLORIA | P260123 | 180 000 |
| Class 5 | YONSI POAKA CHRIST HAUBIN | P260139 | 180 000 |

**Aucun n'est archivé. Aucun n'a de versement.** Ce ne sont donc pas des élèves partis :
ce sont des élèves dont personne n'a jamais ouvert la fiche de frais. 16 des 17 ont un
matricule régulier, ce qui écarte l'hypothèse d'un import raté sur identifiant.

**Les 103 élèves sans matricule ne sont PAS le problème** — et c'est contre-intuitif :
**102 d'entre eux ont bel et bien une fiche de frais**. Un seul n'en a pas. Répartition :
FORM1 40, PRE-MATERNELLE B 19, 6eme 18, FORM2 16, 5eme 10. L'absence de matricule
n'empêche aucun rattachement, qui se fait sur l'identifiant interne.

**Les 4 matricules atypiques sont tous correctement rattachés** :

| Matricule | Élève | Classe | Fiche de frais |
|-----------|-------|--------|----------------|
| `08092023` | BIVOUNA MEMOA BEVERLY GENYCHA | PRE-MATERNELLE A | présente, 210 000 |
| `260189504` | KUETSOP FONGANG CALEB EMMANUEL | 6eme | présente, 190 000 |
| `250218959` | NYIWE THOMAS YANN ANDY | FORM2 | présente, 190 000 |
| `GEF126-79` | TCHUANDJA MAEVA BETHEL | FORM1 | présente, 190 000 |

**Aucun doublon, aucune autre année** : `student_fees` ne contient que 2026-2027 pour
cette école, 696 lignes, 0 doublon (la contrainte `UNIQUE(student_id, academic_year)` tient).

#### Le point que ni le document ni l'application ne traitent : les 10 archivés

`feeForecast` **ne filtre pas sur le statut**. Les 10 élèves archivés de l'école gardent
leur fiche et sont comptés pour **2 000 000** dans les 134 580 000 :

| Classe | Élève | Archivé le | Attendu | Déjà payé |
|--------|-------|-----------|--------:|----------:|
| NURSERY 1 B | TCHOKONTE DJEUKAM CIBELE ROXANE | 2026-10-07 | 210 000 | 100 000 |
| NURSERY 2 A | NYAMSI TCHOUNGA MANNIS | 2026-09-15 | 210 000 | 150 000 |
| PRE-MATERNELLE A | DAVID OWEN CODJA | 2026-10-07 | 210 000 | 150 000 |
| PRE-MATERNELLE A | CHEGEM BOGNE YAELLE ELIORA | 2026-10-07 | 210 000 | 150 000 |
| PRE-MATERNELLE B | DONGMO FOKOU ISRAEL ELIE | 2026-10-07 | 210 000 | 150 000 |
| PRE-MATERNELLE B | TANGOMO NGUEGUIM NOEL JIREH | 2026-10-07 | 210 000 | 150 000 |
| CP | NYAMSI TCHOUNGA YOANIS | 2026-09-15 | 180 000 | 130 000 |
| Class 1 A | NINKAM TCHAWE LORRYS | 2026-09-15 | 180 000 | 130 000 |
| FORM1 | MOUHAMMED CHURREM BEN ABOUBAKAR | 2026-08-25 | 190 000 | 100 000 |
| FORM2 | EWODO AYISSI JUAN PAOLO JUNIOR | 2026-08-26 | 190 000 | 140 000 |

Ils réclament **2 000 000** dont **1 350 000** déjà encaissés, soit **650 000** de reste
réclamé à des élèves sortis. Le document les compte aussi (713 des deux côtés), donc cela
n'explique rien de l'écart — **mais les deux sources sont alors fausses ensemble**, dans le
même sens. C'est une **question de politique**, pas un bug : à trancher avec le coordinateur.

**Verdict : l'application a tort** sur les 17 fiches (une fiche manquante n'est pas une
décision, c'est un oubli). **Les deux sources sont incomplètes** sur les 10 archivés.

### H5 · Bug de calcul — **ÉCARTÉE**

**Preuve.** Trois contrôles :

- **Arrondis** : tous les `frais_annuels` sont des multiples de 10 000. Aucun centime.
- **Date du jour** : `expected` est la somme annuelle pleine. `elapsedFraction` n'entre que
  dans `projectedCollection`. Changer la date ne change pas l'attendu.
- **Attendu limité aux payeurs** : non. 696 fiches sont sommées, alors que les versements ne
  couvrent qu'un sous-ensemble d'élèves. Les élèves à 0 payé sont bien comptés.

La réconciliation boucle à **0 franc de reste** : il n'y a pas de place pour un bug
arithmétique. **L'application additionne juste. Ce qu'elle additionne est incomplet.**

**Verdict : l'application a raison** sur le calcul.

### H6 · Les 2 élèves d'écart CM2 / Class 6 — **NON DÉCIDABLE en base**

**Preuve.** Effectif total identique des deux côtés : **713 = 713**. Ligne 4 : 44 (app)
contre 46 (doc), **−2**. Ligne 5 : 297 (app) contre 295 (doc), **+2**. Les deux écarts se
compensent exactement.

**Aucun élève ne manque.** Deux élèves que le coordinateur place en CM2/Class 6 sont, dans
NotesCam, rattachés à une autre classe du primaire. Les nommer demanderait la ventilation
par classe de la ligne 5 du document, que le document ne donne pas (il n'annonce que le
total 295). **Je ne peux pas les désigner sans cette ventilation, et je ne devine pas.**

Impact : **−20 000** seulement — l'écart entre 190 000 et 180 000, deux fois.

**Verdict : indéterminé, en attente du coordinateur.** C'est la question 2 ci-dessous.

### H7 · Cohérence Cloud / LAN — **NON VÉRIFIABLE sur cette machine**

**Preuve.** Les deux bases LAN présentes ici ne sont pas celles de cette école :

```
server/data/notescam.db       → « Lycée Test Surveillant »      2 student_fees
server/data-demo/notescam.db  → « COLLÈGE LA RETRAITE »       232 student_fees
```

THE GENIUS dispose d'une édition LAN (paquet `tar.gz`, Linux), mais **sa base n'est pas sur
cette machine**. La comparaison demande une copie de son fichier `notescam.db`.

**Je ne conclus donc rien sur une divergence de synchronisation** — ni qu'elle existe, ni
qu'elle n'existe pas. Pour la trancher il faut le fichier ; c'est la question 6 ci-dessous.

---

## Causes classées par impact

| Rang | Cause | Impact | Part | Verdict | Correction proposée |
|-----:|-------|-------:|-----:|---------|---------------------|
| 1 | **17 fiches de frais absentes** | **−3 320 000** | 98,5 % | l'application a tort | Créer les 17 `student_fees` au tarif de la section. |
| 2 | **9 tarifs déviants** | **−30 000** | 0,9 % | à trancher (remise ou faute de saisie ?) | Corriger après arbitrage du coordinateur. |
| 3 | **2 élèves classés différemment** | **−20 000** | 0,6 % | indéterminé | Obtenir la ventilation du document. |
| — | *10 archivés encore facturés* | *2 000 000 réclamés* | *hors écart* | les deux sources sont incomplètes | Filtrer `archived_at`, après décision. |
| — | *Grille tarifaire absente* | *0 aujourd'hui* | *cause racine* | l'application a tort | Saisir les 6 tarifs dans `class_fee_grids`. |

### Les 9 tarifs déviants, nominativement

| L | Classe | Nom | Matricule | Appliqué | Tarif de la section | Écart |
|---|--------|-----|-----------|---------:|--------------------:|------:|
| 2 | NURSERY 2 A | SUGAING KUATE JULIE | M260074 | 180 000 | 210 000 | −30 000 |
| 3 | SIL BIL | MADJO NZOUEKEU ANGELA | GEN260313 | 180 000 | 210 000 | −30 000 |
| 3 | SIL BIL | AKONO ASSEN MARIE KEZIA | GEN260307 | 180 000 | 210 000 | −30 000 |
| 3 | CP BIL | NOUSSI KUETCHE BENEL | GEN260292 | 180 000 | 210 000 | −30 000 |
| 3 | CE2 BIL | OWONO NSIA YANEL LUCAS | GEN260136 | 180 000 | 210 000 | −30 000 |
| 5 | SIL | KENGNE ALEXANDRE KARL NOE | GEN260298 | 210 000 | 180 000 | +30 000 |
| 5 | Class 1 A | TCHUENBU KOM RHEANE GRACE | GEN260165 | 210 000 | 180 000 | +30 000 |
| 5 | Class 1 B | YADAH-JOY DAVID | GEN260168 | 210 000 | 180 000 | +30 000 |
| 5 | Class 2 | MOANGONO OLINGA CYNDI ROSE | GEN260291 | 210 000 | 180 000 | +30 000 |

**Le motif est lisible : 5 élèves portent le tarif non-bilingue en section bilingue, 4
portent le tarif bilingue en section classique.** Ce n'est pas aléatoire — c'est la
signature d'une saisie faite avant un changement de section, ou d'une inversion au moment
de l'inscription. 5 × (−30 000) + 4 × (+30 000) = **−30 000** net : les erreurs se
compensent presque, ce qui explique pourquoi personne ne l'a vu.

---

## Trouvaille annexe, hors scolarité : 4 abonnements orphelins

En vérifiant la composition des frais (H2), j'ai trouvé quatre `student_fee_items` dont le
`fee_catalog_id` est **NULL** — leur service a été supprimé, et la clause
`ON DELETE SET NULL` a laissé l'abonnement derrière :

| Libellé | Montant | Créé le |
|---------|--------:|---------|
| FETE DE FIN D'ANNNEE | 5 000 | 2026-09-14 |
| Tenue Scolaire Secondaire | 35 000 | 2026-09-14 |
| Tenue Scolaire Maternelle | 35 500 | 2026-09-14 |
| Tenue Scolaire | 35 000 | 2026-10-19 |

**110 500 au total, 0 versement, 0 échéance.** Ils sont invisibles sur les écrans de
service — qui filtrent par service — et absents de l'attendu scolarité. C'est exactement le
piège documenté en `docs/JOURNAL_DECISIONS.md` D35, **ici en production et avant toute
intervention de ma part** (créés en septembre et octobre). Sans argent attaché, ils sont
inoffensifs ; ils restent à nettoyer. Hors périmètre de cet audit : **rien n'a été touché**.

---

## Questions au coordinateur

**1. Les 17 élèves sans fiche de frais** — sont-ils inscrits définitivement ? Leur fiche
doit-elle être créée au tarif plein de leur section (ce qui ajouterait 3 320 000 à
l'attendu), ou sont-ils en attente d'inscription ? Aucun n'a versé un franc à ce jour, ce
qui peut signifier l'un comme l'autre.

**2. Les 2 élèves de la ligne 4** — pouvez-vous demander la ventilation **par classe** de la
ligne « Autres classes du primaire » (295) ? Les deux élèves que le document place en
CM2/Class 6 sont ailleurs dans NotesCam, et seule cette ventilation permet de les nommer.
Impact 20 000 : à régler pour la justesse, pas pour le montant.

**3. Les 9 tarifs déviants** — s'agit-il de **remises accordées** (auquel cas il faut les
saisir comme ajustements, et non en modifiant le tarif, pour qu'elles soient traçables), ou
de **fautes de saisie** à corriger ? Le motif — 5 au tarif classique en bilingue, 4 au tarif
bilingue en classique — fait plutôt penser à une inversion.

**4. Les 10 élèves archivés** — l'école réclame-t-elle encore leur scolarité annuelle
pleine ? Ils ont déjà versé 1 350 000 sur 2 000 000. Si l'attendu doit s'arrêter à leur
départ, **les deux sources sont à corriger**, et il faut dire au prorata de quoi.

**5. La grille tarifaire** — confirmez-vous les six tarifs (Crèche 180 000, autres
maternelles 210 000, bilingue 210 000, CM2/Class 6 190 000, autres primaires 180 000,
collège 190 000) comme la grille officielle à saisir dans l'application ? C'est elle qui
rendra tout écart futur détectable automatiquement.

**6. L'édition LAN** — une copie du `notescam.db` de l'école permettrait de vérifier que le
même calcul y donne le même total. Sans elle, je ne peux rien affirmer sur une divergence de
synchronisation.

---

## Fichiers produits

Hors du dépôt, parce qu'ils nomment des élèves :

| Fichier | Contenu |
|---------|---------|
| `ecarts-eleves.csv` | 135 élèves : tout élève archivé, sans fiche, à tarif déviant ou sans matricule, avec son motif |
| `causes-eleves.csv` | 26 élèves imputables à l'écart : 17 fiches manquantes + 9 tarifs déviants, avec l'impact en FCFA |

---

## Phase 2 — ce qui a été corrigé le 2026-11-01

### Les 17 fiches de frais : FAIT, sur autorisation explicite

| | Avant | Après |
|---|---:|---:|
| Fiches `student_fees` 2026-2027 | 696 | **713** |
| Élèves sans fiche | 17 | **0** |
| Scolarité attendue | 134 580 000 | **137 900 000** |
| Écart avec le document | −3 370 000 | **−50 000** |

Les 3 320 000 annoncés par l'audit ont été ajoutés, au franc. **L'écart restant de 50 000
est exactement celui que l'audit avait laissé ouvert** : les 9 tarifs déviants (−30 000) et
les 2 élèves classés différemment (−20 000) — tous deux en attente d'arbitrage.

### Comment, et avec quelles garanties

`scripts/ouvrir-fiches-frais.mjs`, qui s'appuie sur la fonction pure
`src/lib/ficheFraisManquante.js` (40 tests, `_ficheFraisManquante.test.mjs`).

- **La grille tarifaire est un FICHIER passé en argument**, jamais une constante du dépôt :
  les tarifs d'une école viennent de l'école.
- **Des `INSERT` uniquement.** Aucune ligne existante n'est modifiée ni supprimée : aucun
  versement, aucun reçu, aucune créance en place ne pouvait être altéré.
- **`insert`, pas `upsert`** : si une fiche existait, la contrainte
  `UNIQUE(student_id, academic_year)` doit faire échouer l'écriture, pas l'écraser. Écraser
  une fiche, c'est perdre un montant.
- **Idempotent** : une seconde passe ne crée rien (vérifié par test, §2).
- **Les élèves archivés sont écartés** par principe — facturer un élève sorti est une
  décision de l'école, pas un correctif technique. (Les 10 archivés avaient déjà une fiche :
  cette règle n'a rien changé ici, mais elle est désormais explicite et testée.)
- **Aucun montant inventé** : une classe absente de la grille part dans les écartés.
- **Sauvegarde et retour arrière écrits AVANT le premier `INSERT`**, et `--confirmer` est
  refusé sans `--sauvegarde`.
- **Vérification par relecture** après écriture : la RLS peut refuser sans lever d'erreur.

### Les six contrôles indépendants, après coup

```
1. élèves 713 · fiches 713 · sans fiche 0
2. doublons student_id : 0
3. 134 580 000 + 3 320 000 = 137 900 000 ; écart restant −50 000
4. 17 fiches tracées, frais_payes = 0 sur les 17
5. updated_at à maintenant, 0 fiche à updated_at NULL → le pull LAN les tirera
6. versements 908, reçus n° 1 à 955 — INCHANGÉS
```

### Ce que porte chaque fiche créée

Mode `echelonne`, `tranches` et `adjustments` à `'[]'`, `frais_payes` à 0,
`date_dernier_paiement` nul, `version` 1 — la convention relevée sur les 696 fiches
existantes de cette école, pour que les nouvelles soient indistinguables des autres sur les
écrans. Plus une note de provenance :

> Fiche ouverte le 2026-11-01 — audit de réconciliation (tarif de section 210 000, aucun
> versement)

### Synchronisation LAN ↔ en ligne

`student_fees` figure dans les trois listes de tables (`sync-pull`, `sync-push`,
`server/cloudSync.js`). Le pull est un keyset sur `(updated_at, id)` : les 17 fiches
portent `updated_at` à l'instant de l'écriture, donc l'édition LAN de l'école les tirera à
sa prochaine synchronisation. **Aucune file n'a été réinitialisée.**

### Retour arrière

`avant-ouverture-fiches-2026-11-01.json` (hors du dépôt) contient les 17 identifiants, les
17 lignes complètes, la grille employée et le `DELETE` tout prêt. Ces fiches ne portent
aucun versement : les supprimer rétablit exactement l'état d'avant.

### Ce qui n'a PAS été touché

La grille `class_fee_grids` reste vide, les 9 tarifs déviants restent tels quels, les 10
archivés restent facturés, les 4 abonnements orphelins restent en place. Les questions 2 à 6
attendent le coordinateur.
