# NotesCam — Import de données historiques (migration depuis une autre app)

> Pour faire remonter les **notes de l'année en cours** depuis le poste de chaque
> enseignant vers la base de l'administration, ce n'est pas ce format : voir
> [docs/ECHANGE_NOTES_ENSEIGNANTS.md](docs/ECHANGE_NOTES_ENSEIGNANTS.md)
> (format `notescam-notes/v1`, export global par enseignant, import avec aperçu
> et détection des conflits).

Permet de reprendre **plusieurs années** d'historique (élèves, classes, matières,
notes, frais, personnel) d'un établissement venant d'un autre logiciel.
Fonctionne **à l'identique en cloud (Supabase) et en LAN (serveur local)** car
l'import passe par le chemin d'écriture canonique de l'app (IndexedDB → syncQueue
→ flush vers le backend actif).

## Workflow

1. **Convertir** l'export de l'ancienne app vers le **format pivot v1** (ci-dessous).
   - C'est l'unique partie spécifique à la source. Voir un exemple complet dans
     `examples/import-bundle.example.json`.
   - **Source SQLite** : squelette `scripts/sqlite-to-pivot.mjs` (n'adapte que les
     7 requêtes SQL en tête de fichier) :
     ```bash
     npm run import:sqlite -- --list ancienne-base.sqlite      # voir tables/colonnes
     npm run import:sqlite -- ancienne-base.sqlite import-bundle.json
     ```
     Si la source n'est pas en SQLite (MySQL, Access/.mdb…), l'exporter d'abord en SQLite.
   - **Source CSV** : squelette `scripts/csv-to-pivot.mjs` (n'adapte que la table
     `MAP` champ→en-tête). Gère plusieurs fichiers (un par entité) **ou** un seul
     fichier à plat (pointer toutes les entités vers le même `file`). Délimiteur
     `,`/`;`/tab détecté automatiquement.
     ```bash
     npm run import:csv -- --list dossier-csv/                 # voir fichiers + colonnes
     npm run import:csv -- dossier-csv/ import-bundle.json
     ```
   - Les deux convertisseurs partagent l'assemblage `scripts/lib/pivot-assemble.mjs`
     (regroupement année→classe→élève, dédoublonnage) et valident le pivot avant écriture.
2. **Importer** : NotesCam → **Paramètres → Import de données** (admin) → déposer
   le `.json` → vérifier l'aperçu → *Lancer l'import*.
3. L'app écrit en local puis synchronise (Supabase ou serveur LAN). Recharger.

L'import **ne crée pas l'école** et **ne change pas l'année active** : il ajoute
des lignes rattachées à l'école courante. Les années importées apparaissent comme
**archives** (NotesCam distingue les années par `classes.current_year`).

## Format pivot v1

```jsonc
{
  "format": "notescam-import/v1",
  "teachers": [
    { "name": "M. Abena", "email": "abena@ex.cm", "phone": "...", "specialty": "Maths" }
  ],
  // ── Nouveaux modules (facultatifs, top-level) — reprise depuis un autre logiciel.
  //    Indépendants de `years` : un bundle peut ne contenir QUE ces sections
  //    (import purement « personnel » / « inventaire »).
  "staff": [
    {
      "name": "Awa Sow",                            // ou first_name + last_name
      "matricule": "P-001", "department": "comptabilite", "fonction": "Comptable",
      "gender": "F", "phone": "...", "email": "...", "hire_date": "2022-09-01",
      "contracts":     [ { "type": "cdi", "start_date": "2022-09-01", "salary": 150000 } ],
      "leaves":        [ { "type": "annuel", "start_date": "2024-08-01", "end_date": "2024-08-15", "days": 15 } ],
      "career_events": [ { "event_date": "2023-01-01", "type": "promotion", "title": "Chef comptable" } ]
    }
  ],
  "fee_catalog": [
    { "name": "Cantine", "category": "cantine", "amount": 30000, "academic_year": "2025-2026",
      "mandatory": false, "optional": true, "payment_type": "mensuel" }
  ],
  "assets": [
    { "name": "Photocopieuse", "category": "materiel", "asset_number": "IMM-001",
      "value": 800000, "acquisition_date": "2023-05-10" }
  ],
  "years": [
    {
      "year": "2019-2020",                         // libellé d'année scolaire
      "classes": [
        {
          "name": "6e A", "level": "6e", "section": "A", "system": "FR",
          "teacher": "M. Abena",                    // optionnel (matche teachers[].name/email)
          "subjects": [ { "name": "Mathématiques", "coef": 4, "max": 20 } ],
          "students": [
            {
              "name": "NDONGO Paul", "matricule": "M-2019-001",
              "gender": "M", "date_naissance": "2008-05-01", "statut": "Redoublant",
              "statut_etablissement": "ancien",      // nouveau|ancien -> frais d'inscription
              "lieu_naissance": "Yaoundé",
              "quartier": "Bastos",                  // SECTEUR seul, groupable
              "adresse": "Rue 1.234, Yaoundé",       // le reste du détail
              "parent_phone": "677123456", "contact_urgence": "699987654",
              "nom_pere": "NDONGO Pierre", "profession_pere": "Ingénieur",
              "nom_mere": "ABENA Marie",   "profession_mere": "Enseignante",
              "tuteur": "",                          // si différent des parents
              "profession_tuteur": "",               // pendant de profession_pere/mere
              "ecole_origine": "EP de Bastos",       // ancien établissement
              "date_entree": "2024",                 // registre : année, année scolaire ou date ISO
              "motif_entree": "ED",                  // ED|ET|concours|test… (texte libre)
              "date_sortie": "",                     // vide = toujours inscrit
              "motif_sortie": "",                    // NM|EX|TF|DM|LM|DC… (texte libre)
              "sport_aptitude": "apte",              // apte|inapte (défaut: apte)
              "grades": [ { "subject": "Mathématiques", "sequence": 1, "value": 14 } ],
              "fees": {
                "frais_annuels": 50000,
                "frais_payes": 50000,               // optionnel (sinon = somme des payments)
                "payments": [ { "amount": 25000, "date": "2019-10-05", "note": "1ère tranche" } ]
              }
            }
          ]
        }
      ]
    }
  ]
}
```

### Règles de mapping

| Champ pivot | Cible NotesCam | Notes |
|---|---|---|
| `years[].year` | `classes.current_year` | chaque année = nouveau jeu de classes |
| `classes[].name/level/section/system` | `classes.*` | `system` défaut `FR` |
| `subjects[].name/coef/max` | `subjects.*` | `coef` défaut 1, `max` défaut 20 |
| `students[].name/matricule/gender/...` | `students.*` | `gender` normalisé (M/F → Masculin/Feminin) |
| `students[].quartier` | `students.quartier` | secteur de résidence, **distinct d'`adresse`** : reste groupable |
| `students[].ecole_origine` | `students.ecole_origine` | ancien établissement ; `ancien_etablissement` et `ecole_provenance` acceptés comme alias |
| `students[].date_entree` / `motif_entree` | `students.*` | registre matricule ; `annee_entree` et `motif_admission` acceptés comme alias |
| `students[].date_sortie` / `motif_sortie` | `students.*` | registre matricule ; `annee_sortie` et `motif_depart` acceptés comme alias |
| `students[].sport_aptitude` | `students.sport_aptitude` | `apte`|`inapte` ; **jamais null** (colonne NOT NULL) — absent ⇒ `apte` |
| `grades[].subject/sequence/value` | `grades` | regroupé en 1 ligne IDB par (classe,élève,séquence) ; valeurs en texte |
| `fees` + `fees.payments[]` | `student_fees` + `fee_payments` | `academic_year` = l'année de la classe |
| `staff[]` (+ `contracts`/`leaves`/`career_events`) | `staff` + `hr_contracts`/`hr_leaves`/`hr_career_events` | satellites RH rattachés à l'agent |
| `fee_catalog[]` | `fee_catalog` | frais configurables (obligatoire/optionnel) |
| `assets[]` | `assets` | registre des immobilisations |

### Champs d'un élève

Tous optionnels sauf `name`. Un champ **absent** du fichier n'est pas écrit, donc
n'écrase rien : c'est ce qui rend un réimport de rattrapage sans danger.

| Champ | Sens |
|---|---|
| `name` **(requis)** | nom complet ; normalisé en majuscules à l'écriture |
| `matricule` | identifiant de l'école ; sert de clé naturelle avec la classe |
| `gender` | `M`/`F`/`Masculin`/`Feminin`/`male`… → normalisé |
| `statut` | dans la **classe** : `nouveau`|`redoublant`|`transfere` — informatif |
| `statut_etablissement` | dans l'**école** : `nouveau`|`ancien` — pilote les frais d'inscription |
| `date_naissance` | `AAAA-MM-JJ` (le tableur accepte aussi `JJ/MM/AAAA` et les séries Excel) |
| `lieu_naissance` | lieu de naissance |
| `quartier` | **quartier de résidence** : le secteur seul, pour grouper (ramassage, convocations) |
| `adresse` | le reste de l'adresse (rue, repère, ville) |
| `parent_phone` | téléphone du parent/tuteur — destinataire des SMS |
| `contact_urgence` | second numéro, en cas d'urgence |
| `nom_pere` / `profession_pere` | père |
| `nom_mere` / `profession_mere` | mère |
| `tuteur` | tuteur légal, si différent des parents |
| `profession_tuteur` | profession du tuteur / du parent responsable |
| `ecole_origine` | **ancien établissement** (établissement de provenance) |
| `date_entree` | entrée dans l'établissement : `2024`, `2024-2025` ou `2024-09-15` |
| `motif_entree` | registre matricule : `ED` = étude de dossier, `ET` = dossier + test ; **texte libre** |
| `date_sortie` | sortie, même format ; vide = toujours inscrit |
| `motif_sortie` | `NM` normale, `EX` exclusion, `TF` transfert, `DM` démission, `LM` longue maladie, `DC` décès ; **texte libre** |
| `sport_aptitude` | `apte`|`inapte` — barème EPS du carnet MINEDUB primaire (compétence 6A) |

> **Les dates du registre sont du TEXTE, pas des dates.** Les registres portent
> le plus souvent l'ANNÉE seule (« 2024 ») : une colonne `date` aurait forcé à
> inventer un mois et un jour, ou à jeter la valeur. Les trois formes admises se
> trient correctement entre elles.
>
> **Les motifs ne sont pas contraints** (aucun enum, aucun CHECK). Les registres
> réels portent « concours » ou « test » là où la légende ne prévoit que ED et
> ET : une contrainte aurait fait échouer l'import de l'élève entier.

> `quartier` et `ecole_origine` exigent `supabase_student_quartier_origine.sql`
> côté cloud ; `date_entree`, `motif_entree`, `date_sortie`, `motif_sortie` et
> `profession_tuteur` exigent `supabase_student_registre_matricule.sql`. En LAN,
> `server/db.js` les pose au démarrage. **Si la colonne manque d'un côté, la
> valeur est jetée en silence** à l'écriture comme à la synchronisation — c'est
> le défaut qui avait vidé les champs parents.

### Clés naturelles & idempotence

L'import est **ré-exécutable sans doublon**. Identités :
- **classe** = `année + nom`
- **matière** = `classe + nom`
- **élève** = `classe + (matricule sinon nom)`
- **note** = `(classe, élève, séquence)` (écrasement)
- **frais** = `(élève, année)`
- **versement** = `(élève, année, montant, date, note)` (dédoublonné)
- **agent (staff)** = `matricule sinon nom`
- **frais au catalogue** = `année + nom`
- **immobilisation** = `n° d'inventaire sinon nom`
- **satellite RH** (contrat/congé/carrière) = signature `(agent, type, dates…)` (dédoublonné)

> Un même enfant présent sur 6 ans devient **6 lignes `students`** (une par
> année/classe) : c'est le modèle attendu par NotesCam, pas un doublon.

## Implémentation

- `src/lib/dataImportCore.js` — logique **pure** (validation + transformation
  pivot → enregistrements, résolution FK, idempotence). Testable hors navigateur :
  `node src/lib/_dataImport.test.mjs`.
- `src/lib/dataImport.js` — IO : lecture IDB existante, écriture en lot,
  empilement `syncQueue`, flush.
- `src/components/DataImportPanel.jsx` — UI admin (aperçu + import + rapport).
- `scripts/sqlite-to-pivot.mjs`, `scripts/csv-to-pivot.mjs` — convertisseurs
  source→pivot (squelettes à adapter). `scripts/lib/pivot-assemble.mjs` — assemblage commun.
