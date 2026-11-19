# Tableaux d'honneur — note de livraison (2026-11-19)

Branche `feat/tableaux-honneur` (sur `feat/vie-scolaire-bulletin`). Phases B à E du cahier des
charges du 2026-11-18.

## Ce qui change pour l'école

- **Seuil** (Paramètres › Tableaux d'honneur) : moyenne minimale **sur 20**, défaut 12, choix
  rapides 10/12/14/16, saisie libre 0–20 (2 décimales). Tout élève qui l'atteint pour la période
  entre au tableau d'honneur. Un modèle peut le remplacer (étape 3 de l'assistant, en évidence).
  Une classe notée sur 100 est comparée au même seuil ramené à son barème (12/20 = 60/100).
- **Période** (haut de la page) : séquence 1–6, trimestre 1–3, année. Moyennes et rangs = ceux des
  rapports de classe (classique, collège APC, primaire MINEDUB). Une classe où la période n'existe
  pas (APC : pas de séquence) est signalée.
- **Niveaux** Encouragements / Félicitations (facultatifs, seuils réglables) ; **exclusion des
  élèves sanctionnés** (blâme, exclusion dans la période), désactivée par défaut.
- **4 modèles visuels** : 1 Classique doré, 2 Moderne, 3 Élégant sobre, 4 Primaire ludique.
  Défaut : 4 au primaire, 1 au secondaire ; réglable pour l'école et par modèle. Chaque modèle
  existe en **certificat individuel** (A4 paysage) et en **palmarès collectif** (A4 portrait).
  L'ancien rendu reste disponible (case « Ancien rendu » de l'assistant).
- **Langue** : automatique (langue de chaque classe), bilingue, français seul, anglais seul ;
  réglage de l'école, remplaçable par modèle et à la génération. Textes personnalisés en FR et
  EN ; un champ vide prend le texte par défaut.
- **Couleurs** : réglées pour les tableaux d'honneur (école ou modèle), sinon extraites du logo
  (dominante + accent) ; l'or reste doré.
- **Génération** : toute l'école, une classe, ou un seul élève ; un PDF par lot, un élève par page,
  trié par classe puis rang ; barre de progression.
- **Modèles enregistrés sur l'établissement** (et non plus dans un navigateur) : visibles depuis
  tout poste ; ceux du navigateur sont recopiés au premier passage d'un administrateur.

## Fichiers

Nouveaux : `src/core/honorSettings.js`, `src/core/honorPeriod.js`, `src/lib/classReportRun.js`
(extrait de `pages/Reports.jsx`), `src/lib/useReportCtx.js`, `src/lib/honneur/` (`couleurs.js`,
`textes.js`, `commun.js`, `modele1.js`, `modeles234.js`, `modeles.js`, `rendu.js`, `exportPdf.js`),
`src/components/honor/HonneurApercu.jsx`, `src/components/settings/HonorSettingsPanel.jsx`,
`server/honorAudit.js`, `public/fonts/honneur/` (polices OFL + `LICENCES.txt`).

Modifiés : `src/lib/honorRollEngine.js`, `honorRollDoc.js`, `honorRollTemplates.js`,
`src/pages/HonorRoll.jsx`, `Settings.jsx`, `Reports.jsx`, `src/components/honor/TemplateWizard.jsx`,
`HonorAwardModal.jsx`, `src/lib/tutelle.js`, `server/db.js`, `server/query.js`.

## Migrations

- `supabase_tableaux_honneur.sql` — **appliquée au Cloud le 2026-11-19** (accord du responsable) :
  `schools.honor_min_avg` (0–20, contrainte), `honor_options`, `honor_roll_templates`, déclencheur
  d'audit. Additive ; retour arrière en fin de fichier.
- `supabase_sanction_categorie.sql` (lot vie scolaire) — appliquée le même jour.
- LAN : mêmes colonnes par `ensureColumn` au démarrage du serveur.

## Droits et traçabilité

Écriture réservée à l'administrateur côté serveur (policy Cloud existante ; `guardSchoolWrite` en
LAN, chemins unitaire et en lot). Seuil validé 0–20 par le serveur. Chaque changement du seuil ou
des options est inscrit dans `audit_events` (auteur, avant → après) ; au Cloud par déclencheur,
en LAN dans la même transaction que l'écriture.

## Polices

Cinzel, Cinzel Decorative, Great Vibes, Lora, Poppins — SIL OFL 1.1, téléchargées de Google
Fonts (jeux latin + latin-ext), servies localement (fonctionne hors ligne). Le pack zip annoncé
n'était pas dans Téléchargements : le rendu suit les PDF de référence, pas les scripts Python.

## Tests

- `src/core/_honorSettings.test.mjs` (34) : seuil, conversion %, barèmes, niveaux, périodes,
  moteur complet, sanctionnés.
- `src/lib/honneur/_honneur.test.mjs` (39) : FR sans anglais / EN sans français / bilingue sur les
  4 modèles, HONOUR, MINESEC/MINEDUB, textes par défaut, couleurs, pagination du palmarès.
- `server/_honorAudit.test.mjs` (10) : droits, validation, journal, chemin en lot.
- `src/lib/_tutelle.test.mjs` (29) : cycle `college`/`lycee` ≠ fondamental.
- Banc visuel (Chromium) : Bright Continent (logo réel) FR / EN / bilingue, école de test aux
  couleurs différentes sans logo, nom d'école très long, devise longue, nom de 4 mots accentué,
  nom court, logo horizontal ; 4 modèles × certificat + palmarès.
- Application (édition LAN, base de démo) : palmarès par classe 14 s (contre ~5 min avant),
  certificats, assistant, paramètres.

## Défauts corrigés en chemin

« Élèves disciplinés » sans PDF (plantage muet) ; palmarès « par classe » sans seuil ;
`isBasicClass` (cycle `college` → MINEDUB) ; mention APC sur les palmarès ; polices absentes des
PDF (`skipFonts`) ; noms en capitales illisibles en calligraphie.

## Limites connues

- Le PDF est une image (JPEG ~200 dpi) : texte non sélectionnable, comme les autres documents.
- Pas de photo d'élève sur le palmarès dans cette version (colonne prévue, non alimentée).
- Non vérifié sur un vrai poste d'école ni à l'impression papier.
