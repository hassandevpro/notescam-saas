# Format du référentiel SECOND CYCLE MINESEC — import v1

Format pivot JSON pour importer la matrice officielle de l'**arrêté MINESEC du
07 mars 2022** (coefficients + charges horaires par série × classe × matière) dans
le moteur Second Cycle.

> ✅ **Référentiel officiel disponible** : `examples/sc/referentiel-officiel-second-cycle.json`
> contient l'intégralité de l'arrêté n°092/22/MINESEC du 07 mars 2022 — **12 séries**
> (A1–A5, ABI, C, D, E, TI, SH, AC) × 3 classes, **495 lignes coef/charge**, **43 matières**.
> Extrait du PDF officiel et **validé** : chaque « Total Groupe 1/2 » calculé concorde
> avec les totaux imprimés de l'arrêté. Dans cet arrêté, la **charge horaire = le
> coefficient** pour chaque cellule. Les **séries D et TI n'ont pas de Seconde** (entrée
> en Première). SQL prêt à coller : `supabase_sc_referentiel_data.sql`.
>
> `examples/sc/` contient aussi un **gabarit** et un **exemple non-officiel** (Tle C /
> 1ère D) pour tester le pipeline.

## Pré-requis

1. Avoir exécuté `supabase_sc_minesec.sql` (tables + seed des séries & groupes).
2. Pour le script Node : `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`.
   (Ou utiliser le `.sql` généré — aucune clé à manipuler.)

## Slugs

| Entité   | Valeurs |
|----------|---------|
| `serie`  | `a1` `a2` `a3` `a4` `a5` `abi` `c` `d` `e` `ti` `sh` `ac` |
| `classe` | `2nde` `1ere` `tle` |
| `groupe` | `g1` (Groupe 1, principales) · `g2` (Groupe 2, complémentaires) |
| `matiere`| slug libre (ex. `mathematiques`, `svteehb`, `philosophie`) — défini dans `matieres[]` |

Un slug `serie`/`classe`/`groupe` inconnu **arrête l'import**. Une `matiere` inconnue
est acceptée **si** elle est déclarée dans `matieres[]` (elle est alors ajoutée au
catalogue) — sinon l'import s'arrête. On n'invente jamais de coefficient.

## Schéma

```json
{
  "version": { "label": "Arrêté MINESEC 07/03/2022", "source": "Arrêté n° ..." },
  "series":  [ { "id": "c", "nom": "C", "categorie": "scientifique", "description": "" } ],
  "matieres":[ { "id": "mathematiques", "nom": "Mathématiques", "code": "MATH", "domaine": "Sciences" } ],
  "entries": [
    { "serie": "c", "classe": "tle", "matiere": "mathematiques", "groupe": "g1", "coef": 7, "charge": 8, "obligatoire": true },
    { "serie": "c", "classe": "tle", "matiere": "physique",      "groupe": "g1", "coef": 4 }
  ]
}
```

- `version.label` (requis). `series[]` / `matieres[]` (optionnels) étendent les catalogues.
- `entries[]` : `serie`, `classe`, `matiere`, `groupe`, `coef` (requis) ; `charge`,
  `obligatoire` (optionnels). **Identité** = (serie, classe, matiere).

## Import

```bash
# Référentiel OFFICIEL (arrêté 092/22) — Option A : Node (clé service role)
export SUPABASE_URL=...; export SUPABASE_SERVICE_ROLE_KEY=...
node scripts/import-sc-referentiel.mjs examples/sc/referentiel-officiel-second-cycle.json
node scripts/import-sc-referentiel.mjs --dry-run examples/sc/referentiel-officiel-second-cycle.json   # validation seule (hors-ligne OK)

# Référentiel OFFICIEL — Option B : SQL à coller dans Supabase (aucune clé)
node scripts/sc-referentiel-to-sql.mjs examples/sc/referentiel-officiel-second-cycle.json supabase_sc_referentiel_data.sql
# (le fichier supabase_sc_referentiel_data.sql est déjà généré dans le dépôt)
```

Chaque import crée une **nouvelle version** (désactive l'ancienne) → l'historique des
arrêtés est conservé. Ensuite : `UPDATE schools SET bulletin_engine='minesec' WHERE id='...'`.
À la création d'une classe (ex. « Terminale C »), les matières + coefficients + groupes
sont alors créés automatiquement.
