# Format des référentiels APC (MINESEC) — import v1

Ce document décrit le **format pivot JSON** utilisé pour importer les compétences
officielles du premier cycle secondaire camerounais dans le moteur
`APC_MINISTERIEL_MINESEC`.

> ⚠️ **Aucune compétence n'est livrée pré-remplie.** Le contenu officiel doit être
> fourni par le ministère / l'établissement. Le dossier `examples/apc/` ne contient
> qu'un **gabarit vide** et un **exemple factice** clairement marqué
> « EXEMPLE NON-OFFICIEL », uniquement pour valider le pipeline d'import.

## Pré-requis

1. Avoir exécuté `supabase_apc_minesec.sql` (crée les tables + seed de la structure
   fixe : cycle, classes, trimestres, séquences, matières).
2. Variables d'environnement pour le script d'import (clé **service role**, jamais
   exposée au client) :
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

## Identifiants stables (slugs)

Les blocs référencent la structure par **slug** (déjà seedés en base) :

| Entité     | Slugs valides |
|------------|---------------|
| `cycle`    | `premier_cycle` |
| `classe`   | `6e`, `5e`, `4e`, `3e` |
| `trimestre`| `t1`, `t2`, `t3` |
| `matiere`  | `anglais`, `francais`, `mathematiques`, `informatique`, `histoire`, `geographie`, `sciences`, `svteehb`, `pct`, `eps`, `esf`, `travail_manuel`, `eac`, `ecm`, `cultures_nat`, `langues_nat`, `latin`, `grec`, `allemand`, `arabe`, `espagnol`, `italien`, `chinois` |

Un slug inconnu **arrête l'import** (on n'invente jamais de matière ni de classe).

### Sous-système ANGLOPHONE (CBA — Forms 1–5)

Le premier cycle anglophone (Competency-Based Approach) a ses compétences PROPRES,
rangées sous des clés de classe distinctes pour coexister avec le référentiel
francophone. Pré-requis : exécuter `supabase_apc_anglophone.sql` (seed structure).

| Entité     | Slugs valides (anglophone) |
|------------|----------------------------|
| `classe`   | `form1`, `form2`, `form3`, `form4`, `form5` |
| `trimestre`| `t1`, `t2`, `t3` (identiques) |
| `matiere`  | `english`, `french`, `mathematics`, `biology`, `chemistry`, `physics`, `computer_science`, `history`, `geography`, `citizenship`, `physical_education`, `literature`, `economics`, `commerce`, `food_science`, `manual_labour`, `religious_studies`, `national_languages`, `german`, `spanish` |

Format du pivot identique — seuls les slugs changent (voir
`examples/apc/anglophone_example.json`). La résolution est automatique : une classe
« Form 3 » (Système = EN) résout vers `form3` et lit ces compétences.

## Héritage trimestre → séquences

Une compétence est attachée à un **trimestre**, pas à une séquence. Elle est
automatiquement utilisée par les **deux séquences** du trimestre
(`t1`→S1+S2, `t2`→S3+S4, `t3`→S5+S6), **sans duplication**.

## Schéma du fichier

Un fichier = **une version** de référentiel, contenant plusieurs blocs `entries` :

```json
{
  "version": { "label": "MINESEC Premier cycle 2024", "source": "Arrêté n° ..." },
  "cycle": "premier_cycle",
  "entries": [
    {
      "classe": "6e",
      "trimestre": "t1",
      "matiere": "francais",
      "competences": [
        { "ordre": 1, "intitule": "Orthographier correctement un dialogue et une lettre privée", "coefficient": 1 },
        { "ordre": 2, "intitule": "..." }
      ]
    }
  ]
}
```

### Champs

- `version.label` (requis) — nom lisible de la version (ex. année / arrêté).
- `version.source` (optionnel) — référence officielle (numéro d'arrêté, URL).
- `cycle` (optionnel, défaut `premier_cycle`).
- `entries[]` :
  - `classe`, `trimestre`, `matiere` (requis, slugs ci-dessus).
  - `competences[]` :
    - `ordre` (requis, entier ≥ 1, **unique** dans le bloc).
    - `intitule` (requis, texte officiel de la compétence).
    - `coefficient` (optionnel) — laissez vide si la compétence n'a pas de
      coefficient propre (le moteur applique alors le poids 1).

## Import

```bash
# Variables d'environnement requises (clé service role)
export SUPABASE_URL="https://xxxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="..."

# Un fichier
node scripts/import-apc-referentiel.mjs examples/apc/exemple-6e-francais-t1.json

# Validation seule (n'écrit rien)
node scripts/import-apc-referentiel.mjs --dry-run examples/apc/exemple-6e-francais-t1.json
```

Comportement :
1. Crée une ligne `apc_referentiel_versions` (active).
2. **Désactive** les versions précédentes (sauf `--keep-old`).
3. Insère / met à jour les compétences (`upsert` sur
   `(classe, trimestre, matiere, ordre)`), rattachées à la nouvelle version.

Chaque (ré)import = nouvelle version → l'historique des réformes est conservé.
