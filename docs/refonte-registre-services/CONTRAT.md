# Registre des services — dossier de refonte front-end

Tout ce qu'il faut pour redessiner l'écran **« Registre des services »** sans
connaître le reste du dépôt, et sans casser ce qu'il tient aujourd'hui.

| | |
|---|---|
| Écran | `src/pages/Cantine.jsx` (1 417 lignes) · route `/cantine` |
| Onglets | `src/components/services/ListeAbonnes.jsx`, `GrilleMensuelle.jsx`, `ResumeService.jsx` |
| Moteur de calcul | `src/lib/cantineEngine.js`, `src/lib/feeScheduleEngine.js` |
| Jeu d'essai | `registre-services.fixture.json` (16 abonnés, tous les cas) |
| Jeu de volume | `registre-services.volume.json` (320 abonnés, 10 mois) |
| Régénérer | `node scripts/export-registre-services.mjs` |

Les deux JSON ne sont **pas écrits à la main** : ils sortent du moteur réel. Si
une règle de calcul change, on relance le script et la maquette reste juste.

---

## 1. À quoi sert cet écran

Une école camerounaise tient un **registre papier** par service à abonnement
(cantine, transport, internat, tenue, soutien, activités) : une ligne par élève,
une colonne par mois, quatre conventions d'écriture (`15 000`, `7 500`, `/`,
`ABANDON`) et une ligne de quote-part sous le tableau. Cet écran remplace ce
cahier.

**Qui s'en sert** : la secrétaire, au guichet, un parent devant elle.
**Ses trois gestes, dans l'ordre de fréquence** :

1. **trouver un élève** (par nom, matricule ou classe) ;
2. **encaisser** son mois ;
3. **imprimer** l'état.

Tout le reste est rare et vit sous un menu replié « ⋯ Plus ».

### Ce que le responsable reprochait à l'écran précédent

Verbatim, captures du 2026-10-31 et du 2026-11-03 :

- « la page affiche trop d'informations en même temps et devient difficile à
  utiliser pour une secrétaire » ;
- « la liste Élèves abonnés est coupée à droite (colonnes Encaissé, Reste
  invisibles) et demande de faire défiler » ;
- « chaque cellule de mois affiche seulement un chiffre brut (15000), sans dire
  s'il est payé, partiel ou impayé » ;
- six boutons de même poids dans l'en-tête, et le bouton « Abonner un élève »
  qui **disparaissait dès le premier abonné** (corrigé le 2026-11-03).

La refonte doit faire mieux que ça, pas autrement.

---

## 2. Les volumes réels (relevés en base le 2026-11-03)

L'école pilote, mesurée en production :

| Mesure | Valeur |
|---|---|
| Élèves dans l'école | **716** |
| Classes | **28** |
| Services à abonnement | 2 (Cantine, Transport) |
| Cantine — tarif mensuel | **15 000 XAF** |
| Cantine — quote-part école | **3 500 XAF** par élève facturé |
| Cantine — abonnements | **78** |
| Cantine — échéances créées | **146** (septembre et octobre seulement) |
| Cantine — versements rattachés | **144** |
| Transport — tarifs mensuels distincts | **13**, de 5 000 à 15 000 XAF |

Deux conséquences pour la maquette :

- **Le tarif n'est pas unique.** Le registre transport réel porte treize tarifs
  selon la résidence de l'élève. Une cellule doit pouvoir valoir 5 000 à côté
  d'une autre à 15 000 sur la même colonne, et « demi-mois » se juge par rapport
  au tarif **de cet élève**, pas à celui du service.
- **Une école ne facture pas douze mois.** Décembre n'est facturé à personne, et
  avril–juin ne le sont pas encore. Un mois facturé à personne n'est **pas** un
  mois à zéro impayé : aucun état ne doit le montrer en défaut.

---

## 3. Le modèle de données

Trois tables, et le lien qui les joint. Ne pas le court-circuiter : c'est lui
qui empêche d'imputer sur le transport un versement remis pour la cantine.

```
fee_catalog            le SERVICE        (id, name, category, amount, quote_part,
                                          periodicity, billing_periods, allow_exemption)
   ▲ fee_catalog_id
student_fee_items      l'ABONNEMENT      (id, student_id, fee_catalog_id, amount,
                                          status, started_at)
   ▲ student_fee_item_id
fee_schedule_items     l'ÉCHÉANCE du mois(id, student_id, period_key, period_label,
                                          amount_due, status)
   ▲ fee_schedule_item_id
fee_payments           le VERSEMENT      (id, amount, date, method, receipt_no,
                                          reversal_of, void_reason)
```

- `amount` sur l'**abonnement** = le tarif propre à cet élève. Il gagne sur
  `fee_catalog.amount`, qui n'est qu'un repli.
- **Pas de colonne `amount_paid`** sur l'échéance : ce qui est payé se somme
  depuis `fee_payments` filtrés sur `fee_schedule_item_id`. Une contre-passation
  est un versement **négatif** (`reversal_of` renseigné) — elle ramène
  l'échéance à l'état dû.
- `period_key` vaut `2026-09` (mensuel), `2026-T1` (trimestriel) ou
  `2026-annee` (annuel). La périodicité du service décide ; `billing_periods`
  peut l'écraser explicitement.
- **Aucune échéance ≠ échéance à zéro.** Absence = « non inscrit » (`/`), et
  l'élève sort des états du mois. Une échéance à zéro y entrerait.

### Les valeurs calculées

Fournies déjà calculées dans `derivees` du jeu d'essai — **ne pas les
recalculer dans le front**, elles viennent de fonctions pures et testées.

Une **ligne de grille** (un élève) :

```json
{ "student_id": "s03", "name": "…", "className": "CE2", "matricule": "M260103",
  "du": 60000, "paye": 22000, "reste": 38000, "cellules": [ … ] }
```

Une **cellule** (un élève × un mois) :

```json
{ "period_key": "2026-10", "echeance_id": "ech-s03-2026-10",
  "convention": "plein", "statut": "partial",
  "montantDu": 15000, "paye": 7000, "reste": 8000, "texte": "15000" }
```

`convention` ∈ `plein` · `demi` · `non_inscrit` · `abandon` · `exempte`
`statut` ∈ `due` · `partial` · `paid` · `exempted` · `abandoned` · `not_applicable`

L'**état d'un mois** (`parMois[i]`) porte `inscrits`, `demiMois`, `abandons`,
`nonInscrits`, `exemptes`, `attendu`, `encaisse`, `encaisseSurDus`, `impaye`,
`quotePart`, et le drapeau **`moisSansService`**.

L'**état d'un abonné** se déduit de sa ligne, et c'est la seule information que
la secrétaire lit sans calculer :

| État | Règle | Ton actuel |
|---|---|---|
| `sans_dette` — « Rien dû » | `du <= 0` | ardoise |
| `a_jour` — « À jour » | `reste <= 0` | vert |
| `partiel` — « Partiel » | `paye > 0` | ambre |
| `impaye` — « Impayé » | sinon | rouge |

---

## 4. Les trois onglets

### Onglet 1 — « Élèves abonnés » (par défaut)

Ne porte que ce qu'il faut pour les trois gestes : **le nom** (classe dessous),
**le reste à payer**, **un état lisible sans calcul**, **le bouton Encaisser**.
Matricule, section, mois créés, attendu, encaissé existent toujours — dans la
fiche de l'élève, à un clic.

Contraintes tenues aujourd'hui, à ne pas perdre :

- **Pas de `<table>`.** À 375 px, huit colonnes débordent et ce sont justement
  « Reste » et « Encaisser » qui sortent de l'écran. Des lignes en grille qui se
  replient en carte sous `sm`.
- **Rendu par tranches de 60**, avec « Afficher les N autres ». Pas de
  virtualisation tierce (voir § 7). Le compte total est toujours annoncé :
  personne ne doit croire voir toute la liste.
- Tri : `nom` · `reste` · `statut` (l'ordre `statut` remonte les impayés).
- Le bouton **« + Abonner un élève »** est dans l'en-tête de la liste, en
  secondaire (contour), et doit rester visible **liste pleine comme liste
  vide** — c'est le défaut corrigé le 2026-11-03, verrouillé par
  `src/components/services/_listeAbonnes.test.mjs`.

### Onglet 2 — « Grille mensuelle » (ou « trimestrielle » selon le service)

Élèves × périodes. Chaque case porte un **ton** (`pastilleCellule`) :
`vide` · `solde` · `partiel` · `impaye` · `exempte` · `abandon`.
Le seul chiffre conservé dans la case est le **reste** d'un partiel ou d'un
impayé — celui qu'on réclame. Le montant dû complet est en infobulle, et un
interrupteur « Afficher les montants » les rend tous.

Le ton porte **fond ET texte** : un écran mal réglé, une impression en noir et
blanc ou un daltonien doivent lire la même chose. La couleur n'est jamais la
seule information.

Une ligne « Impayé par mois » reste visible ; les cinq autres lignes de synthèse
sont repliables. Le mois courant est surligné.

### Onglet 3 — « Résumé »

Quatre cartes — attendu, encaissé, reste à encaisser, nombre d'abonnés — puis le
détail par mois, la quote-part et l'export CSV.

### Les totaux suivent le filtre

Règle du responsable : « les totaux doivent refléter le filtre actif ». Elle est
utile (le total de la cantine du Primaire) et dangereuse : un total partiel pris
pour un total général est un faux chiffre, et c'est celui que l'école recopie
dans son cahier. Donc **dès qu'un filtre est posé, l'écran l'annonce** avec
l'effectif concerné : « 23 / 78 élèves — les totaux portent sur cette
sélection ». À conserver dans les trois onglets.

---

## 5. Les états à dessiner

Le jeu d'essai en contient un exemplaire de chacun (champ `cas_couverts`) :

| Cas | Ce que la maquette doit montrer |
|---|---|
| À jour, tous les mois | le cas fréquent : 220 des 320 lignes du jeu de volume |
| Impayé total | se repère **sans lire les chiffres** |
| Partiel (7 000 / 15 000) | le reste, pas le payé |
| Demi-mois (7 500) | entrée en cours de mois, distincte d'un partiel |
| Abandon en janvier | les mois suivants ne sont pas des impayés |
| Exempté toute l'année | enfant du personnel, ni dette ni défaut |
| Abonné en novembre | septembre/octobre valent `/`, pas 0 |
| Rien dû | bouton « Encaisser » **inactif**, avec son infobulle |
| Deux versements sur un mois | soldé, deux reçus |
| Contre-passation | l'échéance **redevient due** |
| Homonymes | deux élèves de même nom : seul le matricule les sépare |
| Nom de 38 caractères | troncature, jamais de débordement |
| Élève sans classe | « — » sous le nom |
| Mois sans service | décembre, avril–juin : **aucun défaut affiché** |
| Liste vide | message + « Abonner des élèves » |
| 320 abonnés | `registre-services.volume.json` |

États techniques à prévoir aussi : **chargement**, **aucun service au catalogue**
(l'école doit pouvoir en créer un depuis cet écran), **message d'erreur** après
un refus d'écriture, et **écran refusé** (`🔒`) quand l'utilisateur n'a pas
l'autorité financière.

---

## 6. Droits, langues, sorties

**Droits** (`useStrictMatrix`) :

- `isFinanceReader` faux **et** école en `strict_role_enforcement` → l'écran
  entier est remplacé par un refus : « Cet écran montre de l'argent : il demande
  une autorité financière. »
- `canCollectFees` faux → lecture seule : pas de bouton Encaisser, pas de
  « Abonner », pas de création/modification de service. `onAbonner` vaut alors
  `null` : le composant ne doit **jamais** rendre l'action en dur.

**Trois langues**, toujours : `t('Français', 'English', 'Español')`. Aucun
libellé en dur dans un composant. Les quatre états d'abonné et les libellés de
mois sont dans `vocabulaire` du jeu d'essai.

**Monnaie** : `money(15000)` → `« 15 000 XAF »`. Zéro décimale, espace comme
séparateur de milliers, code de la devise **de l'école** (pas toujours XAF).
Les montants s'alignent à droite en `tabular-nums`.

**Sorties** : impression PDF de l'état (portée : année entière ou un mois),
export Excel, export CSV (point-virgule **et** BOM — Excel francophone ouvre
sinon le fichier en une seule colonne et rend « Février » illisible), modèle
d'import Excel et import d'un registre.

**Hors-ligne** : l'écran tourne aussi en édition LAN, sans Internet, sur des
postes d'école. Le catalogue passe par un cache local (`loadWithCache`). Une
maquette qui suppose une requête par interaction ne tiendra pas.

---

## 7. Ce qu'il ne faut pas faire

Contraintes du dépôt (`AGENTS.md`), pas des préférences :

1. **Ne pas modifier la logique de calcul** — moyennes, montants, quote-part,
   états. Le front affiche ce que le moteur rend.
2. **Aucune écriture financière nouvelle** depuis cet écran. Les recettes passent
   par `fee_payments` (guichet des frais), les dépenses par `budget_expenses`.
   Ici on **lit** la grille et on **pose** un statut sur une échéance.
3. **Pas de nouvelle dépendance** (librairie de tableau, de virtualisation, de
   composants) sans autorisation explicite. Le rendu par tranches existe pour
   cette raison.
4. **La quote-part n'est jamais stockée.** Elle est calculée à la lecture ;
   l'enregistrer la compterait deux fois.
5. **Aucun défilement horizontal** sur la liste, y compris à 375 px.
6. **Cibles tactiles ≥ 44 px** sur les actions principales (36 px pour les
   secondaires). On travaille au guichet, debout, parfois au téléphone.
7. **Une seule action principale** dans l'en-tête : « Encaisser un paiement ».
   Le reste sous « ⋯ Plus ». Si la refonte remonte une action, elle doit dire
   laquelle elle redescend.
8. **Toute donnée masquée reste accessible en un clic** — c'est la contrepartie
   acceptée du masquage.

---

## 8. Comment utiliser les deux JSON

```js
import fixture from './registre-services.fixture.json';

// Les props exactes de chaque composant, déjà calculées :
<ListeAbonnes {...fixture.props.ListeAbonnes} money={money} t={t} />

// Ou les entrées brutes, pour rebrancher le moteur :
fixture.entrees.echeances   // fee_schedule_items
fixture.derivees.grille     // ce que le moteur en fait
```

Les champs `(fn) …` dans `props` décrivent un rappel à fournir : ils ne sont pas
sérialisables. Le champ `_cas` sur chaque élève dit quel état il illustre.

Pour le volume : `registre-services.volume.json` porte les mêmes clés
(`abonnes`, `grille`, `parMois`, `total`) avec 320 abonnés sur 10 mois, et sa
`repartition_statuts` annonce ce que l'œil doit pouvoir retrouver : **220 à
jour, 64 impayés, 36 partiels**. Il ne contient volontairement aucun « Rien dû »
— ce quatrième état n'existe que dans le jeu d'essai, où il est seul à montrer
le bouton « Encaisser » inactif.

---

## 9. Critères d'acceptation

À prouver, pas à affirmer :

1. Aucun défilement horizontal sur la liste à 375 px, avec le nom de 38
   caractères du jeu d'essai.
2. Les 320 abonnés du jeu de volume s'affichent et se trient sans gel
   perceptible.
3. Les seize états du § 5 sont tous visibles dans la maquette.
4. Un filtre posé → l'avertissement « les totaux portent sur cette sélection »
   apparaît dans les trois onglets.
5. `canCollectFees` faux → aucun bouton d'écriture n'est rendu.
6. Chaque libellé existe en français, anglais et espagnol.
7. Les tons restent lisibles en noir et blanc à l'impression et en mode sombre.
8. Les chiffres affichés sont ceux de `derivees` — comparaison champ par champ,
   aucun recalcul côté front.
