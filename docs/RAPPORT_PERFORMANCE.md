# Rapport — Performance de l'application

**Date :** 2026-08-15
**Méthode :** mesure avant conclusion, mesure après correction. Bancs reproductibles (`perf:bundle`, `perf:engines`, `perf:selectors`, `perf:network`), build réel analysé, schéma de base lu.
**État :** corrections appliquées. Non-régression : `npm run test:print` **131/131 PASS**, `npm run test:sync-batch` **24/24 PASS**.

---

## 1. Résumé

Le coût n'était pas là où on le cherche d'habitude. **Les calculs sont rapides** : classer une classe prend 1 à 3 ms, calculer les statistiques de tout un établissement de 1 600 élèves prend 8 ms. Il n'y avait rien à gagner sur les moteurs.

Tout partait dans le réseau et dans le poids transporté.

| # | Problème | Avant | Après |
|:--:|---|---|---|
| 1 | Deux pages lourdes téléchargées avant l'écran de connexion | 357 Ko gzip | — |
| 2 | Dictionnaires espagnol + turc dans le chemin critique | +64 Ko gzip | — |
| | **Premier chargement, total** | **357 Ko gzip** | **199 Ko gzip (−44 %)** |
| 3 | Le service worker précache tout dès la 1<sup>re</sup> visite | 4 242 Ko (1 324 Ko gzip) | **3 114 Ko (972 Ko gzip)** |
| 4 | Police chargée depuis Google Fonts | requête **bloquante**, échoue hors ligne | non bloquante |
| 5 | Notes rechargées entièrement (1 600 élèves, 4G) | **144 requêtes, 43,8 Mo, 34,7 s** | **24 requêtes, 25,5 Mo, 9,4 s** |
| 6 | Rechargement complet après chaque saisie synchronisée | à chaque vidage de file | **supprimé** |
| 7 | File de synchro rejouée une opération à la fois | 55 allers-retours pour une classe | **1 requête** |

---

## 2. Premier chargement : 357 → 199 Ko gzip

`npm run build && npm run perf:bundle`

### 2.1 Deux pages préchargées avant la connexion

`vite.config.js` nommait deux pages dans `manualChunks` :

```js
'page-bulletins': ['./src/pages/Bulletins.jsx'],
'page-grades':    ['./src/pages/Grades.jsx'],
```

Une page nommée dans `manualChunks` entre dans le graphe **initial** : Vite lui ajoute un `<link rel="modulepreload">` dans `index.html`. Les deux pages partaient donc au téléchargement avant même l'écran de connexion — ce qui annulait exactement le `lazy()` posé sur elles dans `App.jsx`.

| | Avant | Après |
|---|--:|--:|
| Chemin critique | 1 269 Ko / **357 Ko gzip** | 920 Ko / **259 Ko gzip** |
| `page-grades` préchargée | 517 Ko (154 Ko gzip) | plus préchargée |
| `page-bulletins` préchargée | 198 Ko (58 Ko gzip) | plus préchargée |

Les deux pages restent des morceaux séparés chargés à l'ouverture de l'écran (`Grades` 81 Ko, `Bulletins` 144 Ko). Deux lignes supprimées, avec un commentaire qui explique pourquoi ne pas les remettre.

### 2.2 Les dictionnaires de traduction voyageaient avec tout le monde

`src/lib/i18n.js` importait **statiquement** les deux tables de traduction (83 Ko et 125 Ko bruts, 25 et 39 Ko gzip). Comme `useT()` est utilisé par presque toutes les pages, elles atterrissaient dans le morceau d'entrée — vérifié, des chaînes turques étaient présentes dans `index-*.js`. Une école camerounaise francophone téléchargeait 64 Ko d'espagnol et de turc avant d'afficher l'écran de connexion.

Elles sont désormais chargées à la demande : `ensureDict(lang)` fait un `import()` dynamique, mémorise le dictionnaire et prévient les composants montés ; `useT()` déclenche le chargement au changement de langue et redessine à l'arrivée. Le chargement démarre dès l'import du module pour la langue enregistrée, donc une école hispanophone récupère sa table en parallèle du reste, sans attendre le premier rendu.

**259 → 199 Ko gzip.** FR et EN sont dans le code : ils ne chargent rien.

### 2.3 Précache : 4 242 → 3 114 Ko

`workbox.globPatterns: ['**/*.{js,css,html,svg,woff2}']` téléchargeait **104 fichiers dès la première visite**, quel que soit l'écran ouvert : le découpage en routes était annulé au premier passage.

Deux corrections :

**366 Ko de code jamais exécuté, supprimés du build.** jsPDF importe dynamiquement `html2canvas`, `canvg` et `dompurify` pour sa méthode `jsPDF.html()` — que l'application n'appelle nulle part (elle n'utilise que `addImage`). Les trois paquets sont désormais aliasés vers `src/lib/jspdf-optional-stub.js`, qui lève une erreur explicite si `jsPDF.html()` était utilisé un jour.

| Poids | Morceau | Statut |
|--:|---|---|
| 198 Ko | `html2canvas` | supprimé du build |
| 147 Ko | `canvg` | supprimé du build |
| 22 Ko | `dompurify` | supprimé du build |

**Les bibliothèques d'export sortent du précache.** `xlsx` (419 Ko) et `jspdf` (349 Ko) servent à des fonctions ponctuelles. Elles passent en `CacheFirst` : mises en cache à la **première utilisation**, donc disponibles hors ligne ensuite, mais elles ne ralentissent plus la première ouverture.

> Contrepartie assumée : une école qui passerait hors ligne **avant** d'avoir jamais exporté ne pourrait pas exporter hors ligne. À arbitrer si l'export hors ligne au premier jour est un besoin réel.

### 2.4 La police ne bloque plus le rendu

`index.html` chargeait Inter depuis `fonts.googleapis.com` par une feuille de style **bloquante** : aller-retour DNS + TLS + CSS, puis un second vers `fonts.gstatic.com`. Hors ligne, la requête échouait — dans un produit dont l'argument principal est de fonctionner sans connexion.

Elle est maintenant chargée en `media="print"` puis basculée en `all` : le texte s'affiche immédiatement avec la pile système (déjà déclarée dans `tailwind.config.js`), puis passe à Inter. Hors ligne : la pile système, sans requête en attente. Un `<noscript>` conserve le comportement d'origine sans JavaScript.

Pour supprimer complètement la dépendance à Google, héberger deux graisses d'Inter en `woff2` dans `public/` — ~60 Ko, déjà couverts par le précache.

---

## 3. Chargement des données : 34,7 → 9,4 s

`npm run perf:network`

### 3.1 Le problème

Le schéma stocke **une ligne par note**. Pour 1 600 élèves, 15 matières et 6 séquences : **144 000 lignes**, récupérées via `select('*')`, paginées 1 000 par 1 000 (plafond PostgREST), **séquentiellement**.

| Élèves | Lignes | Requêtes | JSON `select('*')` |
|--:|--:|--:|--:|
| 500 | 45 000 | 45 | 13,7 Mo |
| 1 000 | 90 000 | 90 | 27,4 Mo |
| **1 600** | **144 000** | **144** | **43,8 Mo** |
| 3 300 | 297 000 | 297 | 90,4 Mo |

Et ce rechargement complet partait à l'ouverture de session, au retour de connexion, **et après chaque vidage de la file de synchro**. Un enseignant qui saisissait une note déclenchait, quelques secondes plus tard, le re-téléchargement des 144 000 notes de l'établissement.

### 3.2 Les trois corrections

**a. Seules les colonnes utiles.** `gradeRowsToMap` en utilise cinq ; `select('*')` en transportait huit. `id` n'est lu par personne et PostgREST sait trier sur une colonne absente de la projection. **319 → 184 octets par ligne, −42 %.**

**b. Pagination parallèle.** `fetchAllRows` enchaînait les pages une par une, chacune payant un aller-retour complet. Elle demande maintenant **six pages de front** ; une vague incomplète marque la fin du jeu de données. Le chemin LAN (sans plafond ni `.range()`) est inchangé, et la gestion d'erreur conserve le comportement d'origine : première vague en échec → `null` (l'appelant garde ses données locales), échec ultérieur → ce qui a été récupéré.

**c. Plus de rechargement après un push.** L'application vient d'écrire ces lignes : elle les connaît. Le `_refreshFromSupabase` déclenché après `flushSyncQueue` est supprimé. Le rafraîchissement depuis le cloud reste déclenché à l'ouverture de session et au retour de connexion, là où d'autres postes ont pu écrire.

| Réseau | 500 élèves | 1 000 élèves | 1 600 élèves |
|---|--:|--:|--:|
| Fibre / bureau | 1,6 → **0,4 s** | 3,3 → **0,8 s** | 5,2 → **1,2 s** |
| ADSL urbain | 7,1 → **2,0 s** | 14,2 → **3,8 s** | 22,8 → **6,1 s** |
| 4G correcte | 10,9 → **3,0 s** | 21,7 → **5,9 s** | **34,7 → 9,4 s** |
| 3G / zone rurale | 24,9 → **8,1 s** | 49,9 → **15,8 s** | **79,8 → 25,4 s** |

### 3.3 La file de synchro part en un seul envoi

`flushSyncQueue` rejouait un `upsert` par élément : une classe de 55 élèves saisie hors ligne = 55 allers-retours (≈ 19 s à 350 ms de latence).

Les éléments consécutifs de même table et même opération sont maintenant regroupés en une seule requête — PostgREST accepte un tableau de lignes, ce que fait déjà le chemin en ligne. **En cas d'échec du lot, les éléments sont rejoués un par un** : une ligne invalide ne peut pas bloquer les autres et le décompte des échecs reste exact, élément par élément. Les suppressions sont groupées par `.in('id', …)`.

Tables groupables : `grades`, `student_absences`, `apc_notes`, `mat_observations`, `prim_notes` — chacune avec sa cible de conflit. Les autres passent par le chemin unitaire d'origine, avec leurs assainissements de charge utile.

Couvert par `npm run test:sync-batch` : 55 éléments → 1 requête, lot en échec → 5 reprises unitaires, ligne invalide isolée, ordre de la file conservé, suppressions groupées, élément isolé inchangé.

---

## 4. Ce qui va bien — vérifié, non touché

**Les moteurs de calcul** (`npm run perf:engines`, 1 600 élèves) :

| Opération | Sans composites | Avec matières composites |
|---|--:|--:|
| Une moyenne générale (6 séquences) | < 0,1 ms | < 0,1 ms |
| Classement d'une classe | 1,0 ms | 2,3 ms |
| Statistiques d'une classe | 0,9 ms | 2,0 ms |
| Page Relevés — une classe entière | 9,6 ms | 8,9 ms |
| Statistiques de tout l'établissement | 29,5 ms | 120,5 ms |

Seul le dernier chiffre mérite un regard : recalculé à chaque rendu d'un tableau de bord, 120 ms se sentent. Un `useMemo` suffirait — pas une réécriture.

**Les re-filtrages** (`npm run perf:selectors`) : découper les élèves de toutes les classes d'un établissement de 1 600 élèves coûte **0,67 ms** ; un index `Map` le ramène à 0,04 ms. Le motif `students.filter(s => s.class_id === id)`, présent partout, n'est pas un problème.

**Le reste :** 46 routes différées, listes paginées, sélecteurs zustand stables (aucun `filter`/`map` dans un sélecteur), pagination Supabase correcte (pas de troncature silencieuse à 1 000 lignes), notes stockées en IndexedDB **groupées** par (classe, élève, séquence) — 9 600 enregistrements, pas 144 000.

**Empreinte mémoire du `gradeMap` :** 0,6 Mo à 500 élèves, 2,1 Mo à 1 600, 4,3 Mo à 3 300. C'est le plafond à surveiller au-delà de 5 000 élèves.

---

## 5. Ce qui reste ouvert

**Tirage incrémental sur `updated_at`.** La colonne existe déjà sur `grades` et n'est jamais utilisée : la file ne fait que pousser, le tirage est toujours complet. En mémorisant l'horodatage du dernier tirage réussi et en filtrant `.gt('updated_at', …)`, un rafraîchissement courant ramènerait quelques dizaines de lignes au lieu de 144 000 — l'ouverture de session deviendrait quasi instantanée. C'est la correction structurante ; elle demande de traiter les suppressions (les tables de pierres tombales existent : `supabase_sync_tombstone_gc.sql`) et mérite ses propres tests. Environ une journée.

**Mémoïsation du tableau de bord établissement** si les 120 ms mesurées se retrouvent dans un rendu répété.

**Auto-hébergement de la police** pour couper la dernière dépendance réseau tierce.

---

## 6. Reproduire

```bash
npm run build && npm run perf:bundle   # chemin critique, précache, poids mort
npm run perf:engines                   # moteurs de calcul, 100 → 1 600 élèves
npm run perf:selectors                 # coût des re-filtrages, index comparé
npm run perf:network                   # requêtes, octets et temps, avant / après
npm run test:sync-batch                # non-régression du rejeu par lots
npm run test:print                     # non-régression des documents imprimés
```

`perf:network` ne devine pas les volumes : il construit une ligne réelle de la table `grades` (mêmes colonnes que le schéma), mesure son poids JSON et déroule l'arithmétique. Les temps réseau sont des modèles explicites (latence × requêtes + octets ÷ débit), pas des relevés de terrain : à confirmer sur place, mais les ordres de grandeur n'en dépendent pas.

---

## 7. Fichiers modifiés

| Fichier | Changement |
|---|---|
| `vite.config.js` | pages retirées de `manualChunks` ; alias des dépendances optionnelles de jsPDF ; précache restreint + `CacheFirst` sur les bibliothèques d'export |
| `index.html` | police chargée sans bloquer le rendu |
| `src/lib/i18n.js` | dictionnaires ES/TR en import dynamique |
| `src/lib/jspdf-optional-stub.js` | *(nouveau)* bouchon explicite |
| `src/lib/schoolService.js` | `fetchAllRows` parallèle ; `fetchGrades` sur 5 colonnes ; `absenceEntryToRow` extrait |
| `src/lib/sync.js` | rejeu par lots avec repli unitaire ; suppressions groupées |
| `src/App.jsx` | plus de rechargement complet après un push |
| `src/lib/_syncBatch.test.mjs` + `.hooks.mjs` | *(nouveaux)* tests du rejeu par lots |
| `scripts/perf-*.mjs` | *(nouveaux)* quatre bancs de mesure |
