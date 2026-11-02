# AUDIT — LA VIE SCOLAIRE SUR LES BULLETINS

> **Lecture seule.** Ce document ne change pas une ligne de code. Il constate, il
> explique *pourquoi*, et il propose. Rien ne sera corrigé avant validation.
> Relevé le 2026-11-01 sur `caisse-journal-et-sync-0.3.15`.

## 1. Le constat du responsable, et ce qu'il recouvre vraiment

« Tout ce que le surveillant enregistre ne se retrouve pas sur le bulletin. »

C'est exact, et ce n'est pas un oubli d'affichage : **le bulletin ne lit pas, et
n'a jamais lu, les tables du surveillant.** Il lit un *second* jeu de données,
ressaisi à la main au conseil de classe. Les deux registres coexistent sans que
rien n'oblige à les rapprocher.

## 2. Ce que le surveillant peut saisir — relevé dans le code, pas dans une liste d'idées

Le module « Vie scolaire » compte **huit tables** (`server/schema.sql` l. 1825-2006,
miroir de `supabase_vie_scolaire.sql`), plus l'appel quotidien :

| Table | Contenu | Écran de saisie | Rattachée à une période ? |
|---|---|---|---|
| `attendance` | appel du jour : `absent` / `retard` / `excused`, motif, séance, matière | `/app/absences` | par la **date** |
| `late_arrivals` | retards : heure d'arrivée, motif, justifié, validé | `/app/retards` | `sequence_order` |
| `disciplinary_incidents` | incidents : type, lieu, heure, description, témoins, gravité, décision, statut | `/app/incidents` | `sequence_order` |
| `disciplinary_actions` | sanctions : type, motif, durée en jours, dates de début/fin, décideur | `/app/sanctions` | `sequence_order` |
| `student_warnings` | avertissements : type, catégorie, motif, accusé de réception | **aucun** | **aucune** |
| `student_detentions` | retenues / consignes : horaires, durée en heures, tâche, surveillant, faite ou non | **aucun** | **aucune** |
| `parent_meetings` | convocations : cible, motif, date, lieu, statut, issue | `/app/convocations` | **aucune** |
| `exit_permissions` | sorties : type, heures d'aller/retour, motif, autorisant, accompagnant, retour | `/app/sorties` | **aucune** |
| `discipline_statistics` | conseil de discipline : membres, synthèse, décision, type de sanction | `/app/conseil-discipline` | **aucune** |

Deux anomalies se lisent déjà dans ce tableau :

* `student_warnings` et `student_detentions` sont **lues** (dossier disciplinaire
  de l'élève) mais **aucun écran ne permet de les saisir**. Le service les expose
  pourtant (`src/lib/vieScolaireService.js` l. 90-91).
* **Cinq tables sur huit n'ont aucune colonne de période.** `sequence_order`
  n'existe que sur `late_arrivals`, `disciplinary_incidents` et
  `disciplinary_actions` (`server/db.js` l. 186-188,
  `supabase/migrations/20260806000500_vie_scolaire_periods.sql`). Une convocation,
  une retenue ou une sortie **ne peut structurellement pas** être rattachée à un
  trimestre : il n'y a pas où l'écrire.

## 3. Ce que le bulletin lit — et d'où il le tient

Tous les modèles lisent les mêmes **clés spéciales du `gradeMap`** :
`__abs_j__`, `__abs_nj__`, `__conduite__`, `__th__`, `__encouragement__`,
`__felicitation__`, `__aver_travail__`, `__blame_travail__`, `__exclusions__`,
`__aver_conduite__`, `__blame_conduite__` (`src/pages/Bulletins.jsx:224`,
fonction `getAbsCond`). Ces clés sont **saisies à la main** dans l'écran Conseil
de classe.

Le commentaire du code le dit sans détour (`Bulletins.jsx:432`) :
*« Discipline / conduite / mentions : mêmes clés que la saisie existante, donc
rien à ressaisir. »* — rien à ressaisir **par rapport aux autres bulletins**,
mais tout à ressaisir par rapport au travail du surveillant.

### Les deux seuls ponts existants — et pourquoi ils ne suffisent pas

| Pont | Ce qu'il couvre | Comment il se déclenche |
|---|---|---|
| `attendanceEngine.attendanceAuto` | `attendance` + `late_arrivals` → heures justifiées / non justifiées / retards | **proposition** : un `window.confirm` dans Conseil de classe, séquence par séquence (`ConseilDeClasse.jsx:353-365`) |
| `scEngine.vieScolaireAutoConduite` | `disciplinary_actions` → avertissements, blâmes, exclusions | **proposition** : bouton « appliquer » par champ (`AutoHint`) |

Ils sont bien écrits — l'`attendanceEngine` convertit correctement journées,
demi-journées et heures d'après l'emploi du temps, et refuse de compter deux
fois. Mais ils **proposent**, ils ne relient pas : tant que personne ne clique,
le bulletin porte l'ancien chiffre, ou rien. Et ils couvrent **3 tables sur 9**.

## 4. La matrice : donnée du surveillant × modèle de bulletin

Légende — ✅ affiché · ⛔ **étiquette imprimée, valeur vide en dur** · ❌ absent

| Donnée | Source réelle | SC | BIL | **APC** | PRIM | **MAT** | GE |
|---|---|---|---|---|---|---|---|
| Abs. justifiées (h) | `__abs_j__` | ✅ | ✅ | ⛔ | ❌ | ❌ | ✅ |
| Abs. non justifiées (h) | `__abs_nj__` | ✅ | ✅ | ⛔ | ❌ | ❌ | ✅ |
| Retards (nombre) | `late_arrivals`, `attendance` | ❌ | ❌ | ⛔ | ❌ | ❌ | ❌ |
| Consignes / retenues (h) | `student_detentions` | ❌ | ❌ | ⛔ | ❌ | ❌ | ❌ |
| Conduite | `__conduite__` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Avertissement | `__aver_travail__` / `student_warnings` | ❌ | ❌ | ⛔ | ✅¹ | ❌ | ❌ |
| Blâme de conduite | `__blame_conduite__` | ❌ | ❌ | ⛔ | ❌ | ❌ | ❌ |
| Exclusions (jours) | `__exclusions__` / `disciplinary_actions` | ✅ | ✅ | ⛔ | ❌ | ❌ | ❌ |
| Exclusion définitive | **aucune source** | ❌ | ❌ | ⛔ | ❌ | ❌ | ❌ |
| Tableau d'honneur | `__th__` | ❌ | ❌ | ❌ | ✅¹ | ❌ | ❌ |
| Encouragements | `__encouragement__` | ❌ | ❌ | ❌ | ✅¹ | ❌ | ❌ |
| Félicitations | `__felicitation__` | ❌ | ❌ | ❌ | ✅¹ | ❌ | ❌ |
| Incidents | `disciplinary_incidents` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Convocations | `parent_meetings` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Sorties | `exit_permissions` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Conseil de discipline | `discipline_statistics` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

¹ uniquement si le mode « carnet » est actif (`primMentionsFor`, `Bulletins.jsx:2208`).

### Le cas APC, à lire en entier

`src/components/bulletins/BulletinApcOfficial.jsx` l. 159-163 et
`src/lib/apcBulletinDoc.js` l. 360 impriment **huit étiquettes** — Abs. non just.,
Abs. just., Retards, Consignes, Avertissement, Blâme de conduite, Exclusions,
Exclusion définitive — chacune avec **`v=""` écrit en dur**. Le cadre
« Discipline » sort donc sur **tous** les bulletins APC, parfaitement vide,
depuis toujours. C'est la forme la plus littérale du constat du responsable.

### Le cas maternelle

`BulletinMatOfficial.jsx` ne contient **aucun** bloc de vie scolaire. Pas une
étiquette, pas une valeur.

## 5. Causes racines

1. **Deux magasins, aucun lien obligatoire.** Le surveillant écrit dans neuf
   tables ; le bulletin lit onze clés d'un autre magasin, remplies à la main.
   `student_absences` n'est pas une source : elle est **dérivée** de ces clés
   (`src/lib/schoolService.js:292-302`).
2. **Cinq tables sans colonne de période** — rattachement impossible (§ 2).
3. **`sequence_order` est un défaut d'écran, pas un calcul.** Les écrans posent
   `sequence_order: activeSequence` (`Incidents.jsx:19`, `Sanctions.jsx:19`,
   `LateArrivals.jsx:15`). Si aucune période n'est marquée active, la valeur est
   `null`, et `vieScolaireAutoConduite` l'exclut (`seqSet.has(null)` est faux) :
   la sanction existe, elle n'entre dans aucun bulletin, et rien ne le dit.
   `Reports.jsx:518` compte déjà ces orphelins — la preuve que le cas se produit.
4. **Gabarits vides** : huit `v=""` en dur côté APC.
5. **Modèles jamais équipés** : maternelle, APC annuel.
6. **`discipline_statistics` est hors synchronisation LAN↔Cloud** : absente de
   `server/cloudSync.js` l. 78-84 comme des quatre fonctions `sync-*`. Un conseil
   de discipline tenu en LAN ne monte jamais ; tenu en ligne, il ne descend jamais.
7. **Deux tables sans écran de saisie** : `student_warnings`, `student_detentions`.

### Sur la fraîcheur

Les bulletins **ne sont pas figés** : ils se recalculent à l'affichage depuis le
magasin. Le problème de fraîcheur est ailleurs, et plus sournois : le chiffre du
bulletin est une **copie prise au moment du clic**. Le surveillant peut saisir
vingt heures d'absence après le conseil de classe sans que le bulletin bouge, ni
qu'aucun écran ne signale l'écart. L'indicateur réclamé reste donc nécessaire,
mais il doit comparer *source* et *copie*, pas *génération* et *saisie*.

## 6. Plan de correction proposé — à valider

**A. Une seule fonction de lecture, partagée.** Un module
`core/vieScolaireBulletin.js` qui, pour (élève, période), renvoie l'état complet
depuis **les tables du surveillant**, en réutilisant `attendanceEngine` et
`vieScolaireAutoConduite` plutôt que de recopier leurs règles. Les onze clés
`__…__` restent lues et **l'emportent quand elles sont renseignées** : aucune
saisie existante n'est perdue ni écrasée.

**B. Rattachement de période pour les cinq tables qui n'en ont pas.** Migration
additive `sequence_order integer` + déduction par la date quand la colonne est
vide (même règle que `attendanceEngine.sequenceOfDate`), afin que l'historique
déjà saisi se rattache sans ressaisie.

**C. Le bloc APC cesse d'être un gabarit.** Les huit `v=""` reçoivent la valeur.

**D. La maternelle reçoit un bloc**, réduit à ce qui a un sens à cet âge
(absences, retards, observations) — à cadrer avec le responsable.

**E. Indicateur d'écart**, là où le bulletin affiche une copie plus ancienne que
la source, avec un bouton de report. Verrous de période respectés, trace d'audit.

**F. Test de couverture.** Un test qui énumère les neuf tables et échoue si une
donnée n'est ni affichée sur les bulletins, ni déclarée « non affichée » avec sa
raison, dans un registre explicite. Aucun type futur ne pourra être oublié.

**G. `discipline_statistics` entre dans la synchronisation.**

## 7. Questions ouvertes

1. **La place sur le papier.** Huit lignes de discipline tiennent sur un bulletin
   APC ; le détail (nature + date de chaque sanction) ne tient pas. Décompte
   seul, décompte + détail court, ou annexe ?
2. **Le bulletin annuel** : cumul de l'année, ou report du dernier trimestre ?
3. **Maternelle** : quelles lignes a-t-elle vraiment lieu de porter ?
4. **Les cinq tables sans période** : rattacher l'historique par la date est un
   calcul, donc une interprétation. Est-elle acceptée ?
