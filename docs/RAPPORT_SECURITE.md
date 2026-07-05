# Rapport de sécurité — NotesCam SaaS

**Date :** 2026-07-04
**Périmètre :** application web (React + Supabase), fonctions edge, édition LAN (Node + SQLite), stockage d'assets, chaîne de vérification des documents.
**Méthode :** revue statique du code source et des scripts SQL versionnés. **Aucune vérification live de la base n'a pu être faite** — les affirmations sur l'état RLS réel doivent être confirmées dans le dashboard Supabase (voir C1).

> ⚠️ Ce rapport prolonge l'audit du 2026-06-23. Plusieurs correctifs ont été **écrits** (`supabase_security_hardening.sql`, fonction `sign-document`) mais **ne sont pas appliqués / pas branchés**. C'est le point le plus important : les vulnérabilités critiques restent ouvertes en pratique.

---

## 1. Synthèse

| # | Sévérité | Faille | État |
|---|----------|--------|------|
| **C1** | 🔴 Critique | Isolation multi-établissements dépend d'une RLS non confirmée sur `school_users`, `schools`, `superadmins`, `fee_payments` | Correctif écrit (PARTIE 1), **non confirmé appliqué** |
| **C2** | 🔴 Critique | Bucket `school-assets` **public** → documents RH (contrats/diplômes), photos d'élèves, signatures/cachets téléchargeables par URL | **Actif** — le code utilise encore `getPublicUrl` |
| **H1** | 🟠 Élevé | Vérification des documents = checksum **djb2 sans secret** → forgeable, la page `/verify` affiche « authentique » | **Actif** — le client n'appelle pas la fonction HMAC `sign-document` |
| **H2** | 🟠 Élevé | Un enseignant peut écrire **toutes** les notes de l'école (policy `grades` non scopée à ses matières) | Correctif écrit (PARTIE 3), **gated** |
| **M1** | 🟡 Moyen | Aucune en-tête de sécurité HTTP (CSP, X-Frame-Options, X-Content-Type-Options…) sur le déploiement web | Actif |
| **M2** | 🟡 Moyen | Injection HTML possible dans les gabarits d'impression/aperçu (`dangerouslySetInnerHTML`, `document.write`) si des données saisies ne sont pas échappées | À auditer |
| **M3** | 🟡 Moyen | Application des plans/quotas 100 % côté client (localStorage) → contournable | Actif (intégrité commerciale) |
| **L1** | 🔵 Faible | Serveur LAN à l'écoute sur `0.0.0.0` (tout le réseau) | Par conception — durcir le pare-feu |
| **L2** | 🔵 Faible | URL + clé anon Supabase en dur dans le source | Acceptable (clé publique) mais renforce la priorité de C1 |

---

## 2. Failles détaillées

### 🔴 C1 — Isolation multi-établissements (RLS pivot)

**Constat.** Toute la sécurité de données repose sur la RLS Supabase, car la clé anon est publique (`src/lib/supabase.js:6`) et embarquée dans le bundle. Or les tables **pivots** de l'isolation ne montrent pas d'`ENABLE ROW LEVEL SECURITY` dans les SQL versionnés :
- `school_users` — table qui définit « qui appartient à quelle école et avec quel rôle » ;
- `schools`, `superadmins`, `fee_payments`.

**Impact.** Si la RLS est réellement absente sur `school_users`, un utilisateur authentifié quelconque peut **s'auto-insérer** une ligne `role='admin'` sur une **autre** école (prise de contrôle totale : notes, élèves, frais, PII) ou s'insérer dans `superadmins` (super-admin plateforme). C'est la faille la plus grave possible pour un SaaS multi-tenant.

**Preuve / correctif.** `supabase_security_hardening.sql` PARTIE 1 active la RLS + `REVOKE INSERT/UPDATE/DELETE` sur ces tables (écritures réservées aux RPC `SECURITY DEFINER`). Ce fichier n'est pas garanti exécuté.

**Action (immédiate) :**
1. Dans Supabase SQL Editor, exécuter :
   ```sql
   SELECT relname, relrowsecurity FROM pg_class
   WHERE relname IN ('school_users','schools','superadmins','fee_payments');
   ```
   Toute ligne à `relrowsecurity = false` ⇒ faille active.
2. Auditer **toutes** les tables publiques :
   ```sql
   SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=false;
   ```
3. Appliquer `supabase_security_hardening.sql` PARTIE 1. Retester login + Settings + inscription.

---

### 🔴 C2 — Bucket `school-assets` public → fuite de PII & falsification

**Constat.** Le bucket `school-assets` est public et le code sert les fichiers par **URL publique** :
- Documents RH (contrats, diplômes) — `src/lib/staffService.js:81` (`uploadStaffDocument` → `getPublicUrl`) ;
- Photos du personnel — `src/lib/staffService.js:67` ;
- Signatures / cachets / logos d'école — `src/lib/schoolService.js:239,254` ;
- Photo de profil utilisateur — `src/lib/userProfileService.js:44` ;
- Gabarits de bulletins — `src/lib/pdfBulletinTemplate.js:35,47`.

Les chemins sont **déterministes** (`{schoolId}/staff/{staffId}.jpg`, etc.) → devinables si l'on connaît les identifiants.

**Impact.** Toute personne connaissant/ devinant un chemin peut télécharger des **documents RH nominatifs** et des **photos d'élèves** (PII sensible, mineurs), et **réutiliser les signatures/cachets** pour falsifier des documents. Fuite RGPD-like + risque de faux.

**Note.** Un helper `createSignedUrl` existe déjà (`src/lib/storage.js:41`) mais **n'est pas utilisé** par les services ci-dessus.

**Action :**
1. Basculer les services PII (RH, photos élèves, signatures) de `getPublicUrl` vers `createSignedUrl(path, ttl)` (helper `storage.js`).
2. Pour la génération PDF, les images sont déjà converties en data-URL avant capture → une URL signée à courte durée suffit.
3. Une fois l'app basculée, exécuter `supabase_security_hardening.sql` PARTIE 2b (`UPDATE storage.buckets SET public=false` + policy SELECT scopée à l'école).
4. Interim faible risque applicable tout de suite : PARTIE 2a coupe l'**énumération** anonyme des objets.

---

### 🟠 H1 — Vérification de documents forgeable (djb2 sans secret)

**Constat.** La chaîne de vérification (relevés, diplômes) utilise un checksum **djb2** non secret :
- `src/lib/transcriptEngine.js:214` (`djb2`) et `:263` (`decodeVerification` recalcule le djb2 et compare) ;
- La page publique `/verify` appelle `decodeVerification` (`src/pages/VerifyTranscript.jsx:23`) et affiche « authentique ».

Une fonction edge HMAC-SHA256 correcte existe (`supabase/functions/sign-document/index.ts`), **mais aucun appel client ne l'utilise** (`grep sign-document|functions.invoke` dans `src/` = 0 résultat).

**Impact.** N'importe qui peut fabriquer un payload (nom, moyenne, décision de son choix) et calculer le djb2 correspondant (algorithme public) → la page officielle de vérification le déclarera **authentique**. La fonctionnalité anti-fraude ne protège pas.

**Action :**
1. Déployer `sign-document` avec `DOC_SIGNING_SECRET` (`supabase secrets set DOC_SIGNING_SECRET=$(openssl rand -hex 32)`).
2. À l'émission d'un document : appeler `action:"sign"` (auth requise) et encoder la `sig` HMAC dans le QR/payload à la place du djb2.
3. Sur `/verify` : appeler `action:"verify"` et n'afficher « authentique » que si la fonction renvoie `valid:true`. Conserver djb2 uniquement comme garde anti-corruption, jamais comme preuve d'authenticité.

---

### 🟠 H2 — Intégrité des notes (tout enseignant écrit toutes les notes)

**Constat.** La policy d'écriture `grades` couvre l'école entière pour `role IN ('admin','teacher')` : un enseignant peut modifier les notes de **toutes** les matières et classes, pas seulement les siennes. Pas d'audit d'acteur historique.

**Impact.** Modification malveillante ou accidentelle de notes hors périmètre ; pas de traçabilité de l'auteur.

**Action :** `supabase_security_hardening.sql` PARTIE 3 :
- **3a (sûr, tout de suite)** : colonne `grades.updated_by` + trigger `set_grade_actor` (trace `auth.uid()`).
- **3b (à tester)** : policy scopée `subjects.teacher_id ↔ teachers.auth_user_id` — vérifier d'abord que chaque matière a bien un `teacher_id` pour ne pas bloquer la saisie légitime.

---

### 🟡 M1 — En-têtes de sécurité HTTP absents

**Constat.** `vercel.json` ne définit que du cache ; aucune en-tête de sécurité globale.

**Impact.** Pas de défense en profondeur contre le clickjacking, le MIME-sniffing, ni de CSP pour atténuer un XSS (voir M2).

**Action :** ajouter dans `vercel.json` un bloc `headers` sur `/(.*)` avec au minimum :
`Content-Security-Policy` (au moins `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security`. Tester la CSP en mode `report-only` d'abord (l'app fait du `dangerouslySetInnerHTML` et charge des images Supabase/data-URL).

---

### 🟡 M2 — Injection HTML dans les gabarits d'impression/aperçu

**Constat.** Plusieurs vues injectent du HTML brut construit par templates :
- `dangerouslySetInnerHTML` : `src/components/timetable/TimetablePrint.jsx:20,54`, `src/components/transcripts/PdfPreviewPanel.jsx:57` ;
- `window.document.write(html)` : `idCardService.js:243`, `receiptDoc.js:263`, `staffExport.js:177`, `transcriptDoc.js:329`, `Fees.jsx:597`, `Reports.jsx:248`, `Students.jsx:478`, `Teachers.jsx:670`.

Les générateurs disposent d'un helper `esc()` (apcBulletinDoc, receiptDoc, transcriptDoc, staffExport, honorRollDoc, palmaresDoc, officialDocHeader…).

**Impact.** Si **une seule** donnée saisie (nom d'élève, nom d'établissement, nom de parent, intitulé) est interpolée **sans** `esc()`, un utilisateur (ex. un enseignant saisissant un nom d'élève) peut injecter du script qui s'exécute quand un autre acteur (ex. l'admin) imprime → XSS stocké inter-rôles.

**Action :** auditer chaque template pour garantir que **toute** interpolation de donnée utilisateur passe par `esc()`. La CSP de M1 sert de filet.

---

### 🟡 M3 — Application des plans/quotas côté client

**Constat.** `src/lib/plan.js` calcule les limites (max classes/élèves, filigrane, quota d'impression Starter) à partir de `school.plan` et de `localStorage` (`nc_print_daily`). Aucune application serveur.

**Impact.** Contournable : éditer le localStorage réinitialise le quota d'impression ; comme la RLS autorise le membre à écrire ses données, rien n'empêche de dépasser `maxStudents`. Enjeu de **revenu**, pas de fuite de données.

**Action (si pertinent commercialement) :** faire respecter les quotas structurants côté RPC/serveur (ex. contrôle du nombre d'élèves à l'insertion). Priorité basse.

---

### 🔵 L1 — Serveur LAN exposé sur tout le réseau

**Constat.** `server/index.js:29` : `HOST = 0.0.0.0`. L'API est joignable par **tout** appareil du LAN (pas seulement via le navigateur → CORS ne protège pas les appels directs). L'auth est un JWT HS256 avec secret par installation (`server/security.js`), mots de passe `scrypt` + comparaison à temps constant — **bien fait**.

**Impact.** Surface d'attaque = le LAN de l'école. Sans faille d'auth, le risque est modéré, mais un LAN ouvert (wifi invité) élargit l'exposition.

**Action :** documenter la recommandation pare-feu (restreindre le port au sous-réseau de confiance) ; envisager une option `HOST=127.0.0.1` quand serveur et client sont sur le même poste.

---

### 🔵 L2 — Clé anon Supabase en dur

**Constat.** `src/lib/supabase.js:6` embarque URL + clé anon en repli. La clé anon **est** publique par nature (elle finit dans le bundle de toute façon) — ce n'est pas une fuite en soi. Mais cela souligne que **toute** la sécurité repose sur la RLS (cf. C1).

**Action :** aucune urgence ; garder la clé anon, prioriser C1. Ne jamais embarquer la `service_role` (vérifié absente du client ✅).

---

## 3. Points positifs (à conserver)

- **Fonctions edge bien conçues** : `service_role` isolée côté serveur uniquement ; authentification par **jeton scellé haché** (`sha256`) et révocable ; périmètre strictement scopé à l'école du jeton ; résolution LWW ; anti-détournement de `school_id` (`provision-tenant`). Voir `set-password`, `provision-tenant`, `sync-push`.
- **RPC `signup_school_and_admin`** `SECURITY DEFINER`, exige `auth.uid()`, empêche le double-rattachement, ne crée qu'une **nouvelle** école — pas d'escalade vers une école existante.
- **Édition LAN** : `scrypt` + `timingSafeEqual`, JWT HS256 à secret par installation (fichier `0600`), licence **Ed25519** vérifiée hors-ligne, verrou machine par empreinte.
- **Secrets** : `.gitignore` couvre `.env*`, données serveur LAN, `private-key.pem` ; seul `.env.example` est suivi ; aucune `service_role` dans le client.
- **Réseau** : `fetchWithTimeout` (anti-blocage), pas de dépendance native superflue côté LAN.

---

## 4. Plan d'action priorisé

**À faire avant toute mise en production / montée en charge :**
1. **C1** — Vérifier l'état RLS réel + appliquer PARTIE 1 (+ auditer toutes les tables publiques). *(bloquant)*
2. **C2** — Basculer les assets PII sur `createSignedUrl` puis bucket privé (PARTIE 2). *(bloquant si PII réelle en prod)*
3. **H1** — Brancher `sign-document` (HMAC) côté émission + `/verify` ; déployer avec `DOC_SIGNING_SECRET`.
4. **H2-3a** — Appliquer l'audit d'acteur `grades.updated_by` (sûr).

**Ensuite :**
5. **M1** — En-têtes de sécurité (CSP en report-only d'abord).
6. **M2** — Audit `esc()` des gabarits d'impression.
7. **H2-3b** — Policy notes scopée par enseignant (après contrôle des `teacher_id`).

**Optionnel / selon besoin :**
8. **M3** — Quotas côté serveur. **L1** — Durcissement pare-feu LAN.

---

*Rapport généré le 2026-07-04. Revue statique — confirmer C1 sur la base réelle avant conclusion définitive.*
