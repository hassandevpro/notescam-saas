# Profil éducatif — Guinée Équatoriale (Guinea Ecuatorial) 🇬🇶

Document de référence du système éducatif équato-guinéen tel qu'implémenté
dans NotesCam. **Aucune hypothèse n'est tirée du système camerounais** : toute
différence est documentée et configurée dans `src/countries/guinea_eq.js`
(source de vérité runtime) et reflétée dans la table SQL
`country_education_config` (`supabase_sprint39_country_education_config.sql`).

> Objectif : un utilisateur équato-guinéen doit avoir l'impression d'un logiciel
> conçu pour son pays, jamais d'une version traduite d'un logiciel camerounais.

---

## Faits vérifiés (sources)

Le système ecuatoguineano calque le **modèle espagnol** :

- **Structure** : Educación Infantil (1-3 ans) → Parvulario/Preescolar (4-6 ans)
  → **Primaria** (6 cursos) → **ESBA** — Educación Secundaria Básica (4 cursos)
  → **Bachillerato** (2 cursos).
- **Notation** : sur **10**, mentions espagnoles (voir §10).
- **Évaluation** : organisée en **trois trimestres**.
- **Examen d'accès à l'université** : la **Selectividad**, administrée par
  l'**UNGE** (Universidad Nacional de Guinea Ecuatorial), après le 2º de
  Bachillerato. *Lengua Española y Literatura* y est obligatoire.
- Scolarité **gratuite et obligatoire jusqu'à 14 ans**.

Sources :
- [Sistema educativo de Guinea Ecuatorial — Wikipedia](https://es.wikipedia.org/wiki/Sistema_educativo_de_Guinea_Ecuatorial)
- [Estudiar en Guinea Ecuatorial — Ministerio de Educación FP y Deportes (España)](https://www.educacionfpydeportes.gob.es/guineaecuatorial/estudiar/en-guinea-ecuatorial.html)
- [Selectividad 2025 en Guinea Ecuatorial — AhoraEG](https://ahoraeg.com/cultura/2025/07/16/selectividad-2025-en-guinea-ecuatorial-cifras-oficiales-confirman-mas-del-50-de-aprobados/)
- [Evaluación de competencias 3º y 6º de Primaria — UNICEF](https://www.unicef.org/equatorialguinea/comunicados-prensa/evaluaci%C3%B3n-de-competencias-en-tercero-y-sexto-grado-de-primaria-en-guinea)

---

## 9. Examens officiels

| Examen | Niveau concerné | Rôle |
|--------|-----------------|------|
| **Selectividad** (UNGE) | Fin de 2º Bachillerato | Accès à l'université — examen à fort enjeu |
| Évaluation de compétences (UNICEF/MEC) | 3º et 6º Primaria | Mesure nationale des apprentissages (pas une condition de passage) |
| Fin de cycle ESBA | 4º ESBA | Fin de la secondaire de base |

`examClasses = ['6º Primaria', '4º ESBA', '2º Bachillerato']` — ces classes
peuvent recevoir un bulletin/relevé adapté (mention de l'examen de fin de cycle).
**Pas de terminologie « CEP / BEPC / Probatoire / Baccalauréat »** (camerounais).

> ⚠️ Le détail réglementaire des barèmes Selectividad n'est pas publié
> publiquement ; ne pas coder de règle de calcul Selectividad spécifique tant
> qu'une source ministérielle n'est pas confirmée.

## 10. Coefficients et pondérations

- Les matières portent un **coefficient** (`coef`), comme dans le modèle espagnol.
- La moyenne est pondérée par coefficient et **ramenée sur 10** (`calcES`).
- Pas de différenciation de barème par niveau documentée à ce jour ; matières
  obligatoires/facultatives gérées au niveau de l'école (pas de règle nationale codée).

## 11. Décisions de fin d'année

| Valeur | Libellé | Condition (indicative) |
|--------|---------|------------------------|
| `aprobado` | Aprobado — pasa al curso siguiente | media anual ≥ 5 |
| `recuperacion` | Examen de recuperación | 4 ≤ media < 5 |
| `repite` | Repite el curso | media < 4 ou échec en recuperación |
| `expulsado` | Expulsado del centro | décision disciplinaire |

**Mentions / apreciaciones (sur 10)** : Sobresaliente (9-10), Notable (7-8.99),
Bien (6-6.99), Suficiente (5-5.99), Insuficiente (0-4.99).

## 12. Administration scolaire

Intitulés **en espagnol** (jamais « Proviseur / Censeur / DSCE ») :

- **Director / Directora** — chef d'établissement (signataire principal).
- **Jefe de Estudios** — adjoint pédagogique.
- **Secretario Académico** — secrétariat académique.
- **Profesor / Profesora** — enseignant.
- **Tutor / Tutora** — professeur référent de la classe.

Documents officiels signés par le **Director/a** + **sello del centro** (cachet).

## 13. Documents scolaires

- **Boletín de calificaciones** (bulletin) → `BoletinGE.jsx`.
- **Informe de resultados** (rapport de classe) → `Reports.jsx` (impression ES).
- **Acta de la Junta de Evaluación** (PV) → `ConseilDeClasse.jsx`.
- **Carné escolar** (carte scolaire) → `idCardService.js` (drapeau + entête ES).
- À venir si demandé : Certificado de escolaridad, Certificado de asistencia,
  Ficha individual del alumno, Registro de clase.

## 14. Paramètres pays (`country_education_config`)

Table créée par `supabase_sprint39_country_education_config.sql`. Champs : pays,
langue principale/secondaire, système de notation, périodes, appréciations,
décisions, examens, niveaux, matières par défaut, règles promotion/redoublement,
modèle de bulletin, intitulés administratifs, types de documents, vocabulaire.

> La **source de vérité runtime** reste `src/countries/guinea_eq.js`. La table
> est le miroir persistant (SuperAdmin / audit / futures éditions serveur) ;
> garder les deux cohérents lors de l'ajout d'un pays.

## 15. Migration et compatibilité

Stratégie **100 % additive, sans modification des données existantes** :

1. **Sprint 37** — colonne `schools.country_system` + back-fill depuis `language`
   (`anglophone→cameroon_en`, sinon `cameroon_fr`). Les écoles existantes
   continuent comme avant.
2. **Sprint 38** — `classes.system` accepte `'ES'` (en plus de `FR`/`EN`).
3. **Sprint 39** — table `country_education_config` (additive, `on conflict do nothing`).
4. **Résolution** : `resolveCountryCode()` → `country_system` (DB) → localStorage
   → inférence `language`. Aucune écriture destructive.
5. **Bascule GE** : une école passe en GE via `country_system='guinea_eq'` ;
   l'app charge alors automatiquement périodes, notation, décisions, libellés et
   documents espagnols, et **masque** toute option camerounaise (séquences,
   trimestres FR, Term, formats APC/Classique/Moderne, conseil de classe FR).

### Ce qui était déjà en place (non refait)
Profil `guinea_eq.js`, `BoletinGE`, `calcES`/`esGrade`, périodes ES dans
Grades & Bulletins, masquage du sélecteur de format pour GE, décisions ES,
bannière officielle ES, drapeau + entête ES de la carte.

### Ajouté par ce sprint (ce qui manquait)
- `ConseilDeClasse.jsx` : trimestres ES, seuil /10, décisions/distinctions ES,
  titres administratifs ES, en-têtes & signatures ES.
- `Reports.jsx` : périodes trimestrielles ES, seuil /10, échelle /10, mentions
  `esGrade`, document imprimé entièrement en espagnol, pills de période ES.
- `Grades.jsx` : masquage du bloc « Conseil de classe » (concept camerounais) en GE.
- `idCardService.js` : libellés ES (matricule, titre du document).
- `country_education_config` (SQL) + cette documentation.

---

## 16. Moteur d'évaluation et de calcul des notes

### Méthode officielle équato-guinéenne (vérifiée)

- **Échelle** : notes sur **10** (configurable /20 par l'admin via `ge_grade_max`).
- **Périodes** : **3 trimestres** ; **évaluation continue** (*evaluación continua*).
- **Note de matière par trimestre** : note **consolidée** de l'évaluation continue.
  La répartition contrôle continu / examen **n'est pas fixée au niveau national** ;
  elle relève du centre/de l'enseignant → l'app enregistre la note consolidée du
  trimestre (pas de double colonne CC/examen imposée).
- **Note finale d'une matière** : moyenne des trois trimestres.
- **Moyenne trimestrielle** : moyenne pondérée par **coefficient** (Secondaire/
  Bachillerato) ; au **Primaire**, coefficients optionnels (réglage `ge_primary_coef`,
  par défaut désactivés → poids égal).
- **Moyenne annuelle** : moyenne des trois trimestres.
- **Arrondi** : 2 décimales (`half_up`).
- **Seuil de réussite** : **5** sur /10 (= `maxScale / 2`, soit 10 sur /20).
- **Classement** : par moyenne décroissante, ex æquo partagés (`buildRanks`).

### Règles de promotion / redoublement (vérifiées)

- **Primaire** : promotion si la moyenne annuelle ≥ seuil de réussite.
- **ESBA / Bachillerato** : promotion avec **2 matières non validées maximum**,
  **sauf** si ce sont simultanément **Matemáticas ET Lengua Española**.
- **2º Bachillerato** : exige **toutes** les matières validées.
- **Recuperación** : les matières non validées passent à un **examen extraordinaire**.
- **Examen officiel** : **Selectividad** (UNGE) après 2º Bachillerato.

> Implémenté comme fonction pure `geAnnualDecision(subjects, gradesOnScale,
> passThreshold)` dans `bulletinEngine.js`, utilisée comme **suggestion
> automatique** de décision dans les deux boletines GE (l'admin peut toujours
> saisir manuellement la décision).

### Moteur configurable par profil

Chaque profil porte son propre bloc **`evaluation`** dans `src/countries/<pays>.js`
(Cameroun FR /20 séquentiel, Cameroun EN /100 terms, Guinée Eq /10 trimestres
continue). Le `bulletinEngine` calcule par système (`FR`/`EN`/`ES`) et reçoit
`maxScale` + `useCoef` via `gradingOpts(school, cycle)`. **Aucune formule n'est
partagée entre pays.** Le Cameroun bilingue conserve ses règles via le `system`
de chaque classe (`FR` ou `EN`).

### Table `EvaluationSystem` (item 16)

`supabase_sprint43_evaluation_system.sql` — miroir persistant des blocs
`evaluation` : type de période, modèle d'évaluation, formules matière/période/
annuelle, coefficients, pondérations, seuils réussite/redoublement, règles de
classement et d'arrondi, examen officiel. Source de vérité runtime = le code.
