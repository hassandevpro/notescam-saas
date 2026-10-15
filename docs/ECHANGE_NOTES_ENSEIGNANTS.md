# Échange de notes entre postes — « chaque enseignant son logiciel »

Un établissement installe NotesCam **chez chaque enseignant**. Chacun saisit ses
notes sur son poste, hors ligne, exporte **un fichier**, et le remet à
l'administration, qui l'importe dans la base de l'école.

> À ne pas confondre avec `IMPORT_FORMAT.md` (format pivot `notescam-import/v1`),
> qui sert à **reprendre l'historique d'un autre logiciel** (élèves, classes,
> années). Ici il s'agit des **notes de l'année en cours**, entre deux postes
> NotesCam.

## Pour l'enseignant

1. Saisir ses notes normalement (matières, compétences ou domaines selon le
   cycle), sur son poste.
2. Écran de saisie → **« Exporter mes notes (fichier) »**.
3. Un fichier `notes-<école>-<enseignant>-<date>.json` est téléchargé. Le
   remettre à l'administration (clé USB, e-mail, WhatsApp — c'est un fichier).

L'export est **global** : toutes ses classes, toutes ses matières, toutes les
séquences, et les trois moteurs par compétences. Pas une grille à la fois.

## Pour l'administration

1. Écran de saisie → **« Importer les notes d'un enseignant »** (visible pour un
   compte `admin` uniquement) → choisir le fichier.
2. Un **aperçu** s'affiche avant toute écriture :
   - combien de notes seront enregistrées,
   - combien sont **déjà identiques** en base,
   - les **conflits** (élève, colonne, période, `ancienne → nouvelle`),
   - les lignes **non rattachées** (classe absente, élève introuvable, matière
     inconnue, note hors barème).
3. **« Enregistrer N note(s) »** applique — et rien d'autre.

Recommencer avec le fichier de chaque enseignant. Les fichiers sont indépendants
et peuvent être importés dans n'importe quel ordre.

## Les trois garanties

**1. Rien n'est deviné.** Le fichier porte son origine (école, année, enseignant)
et, pour chaque note, sa classe, sa matière (ou compétence / critère / UA) et sa
période. L'écran de l'admin ne sert pas de destination : un import ne peut pas
déverser les notes de la 5e dans la 6e parce que la 6e était affichée.

**2. Rien n'est écrasé.** Une note déjà en base dont la valeur **diffère** devient
un *conflit* : la base garde sa valeur, le conflit est listé, l'admin tranche
ensuite. Deux enseignants dont les fichiers se recouvrent ne peuvent donc pas
s'effacer l'un l'autre, et un vieux fichier réimporté par erreur ne ramène pas
d'anciennes notes.

**3. Ce qui ne se rattache pas est dit.** Un élève introuvable, une classe absente
de la base, une note hors barème : c'est affiché, jamais écrit ailleurs. Un élève
se retrouve par identifiant, puis par matricule, puis par nom **dans sa classe** ;
deux homonymes dans la même classe ne sont pas tranchés au hasard, ils sont
signalés.

## Ce que le fichier contient

Format `notescam-notes/v1` (JSON lisible). Les quatre moteurs de l'application :

| Section | Table visée | Identité d'une note |
|---|---|---|
| `classic` | `grades` | classe × élève × séquence × matière |
| `apc` | `apc_notes` | élève × compétence × séquence |
| `prim` | `prim_notes` | élève × compétence × critère × UA |
| `mat` | `mat_observations` | élève × domaine × trimestre |

Le **barème de chaque évaluation** voyage avec la note (`note_max`,
`points_max`) : une colonne notée sur 10 en UA1 et sur 20 en UA3 arrive juste.
Une valeur absente signifie « barème officiel du référentiel », comme en base.

Chaque classe transporte aussi sa liste d'élèves (identifiant, matricule, nom) —
c'est ce qui permet l'appariement à l'arrivée. Une classe sans aucune note ne
voyage pas.

## Limites connues

- Une **période verrouillée** refuse l'écriture : les notes concernées sont
  comptées à part dans le rapport (« refusée(s) : période verrouillée »). Les
  déverrouiller puis réimporter le même fichier.
- Les **conflits ne sont pas résolus** par l'import : ils sont listés pour que
  l'admin les corrige à la main, avec l'enseignant. C'est délibéré — choisir à sa
  place entre deux valeurs, c'est perdre une note sans témoin.
- Le fichier ne crée ni classe, ni élève, ni matière : il **rattache** des notes à
  ce qui existe. Les élèves et les classes doivent donc être à jour sur la base de
  l'admin (c'est le rôle de l'import pivot ou de la synchronisation).

## Où c'est implémenté

| Fichier | Rôle |
|---|---|
| `src/lib/gradeBundle.js` | format, collecte, lecture, **plan d'import** (logique pure) |
| `src/lib/_gradeBundle.test.mjs` | 48 tests, dont l'aller-retour complet sur les 4 moteurs |
| `src/components/grades/GradeBundleIO.jsx` | le panneau (export global + import admin) |

Monté dans les cinq postes de saisie : `Grades.jsx` (classique),
`SubjectTeacherWorkspace`, `ApcCompetenceWorkspace`, `PrimCompetenceWorkspace`,
`MatObservationWorkspace`.

Lancer les tests :

```bash
node --experimental-loader ./scripts/lib/esm-resolve.mjs src/lib/_gradeBundle.test.mjs
```
