# Livraison 0.3.15 au serveur LAN de l'école — préparation contrôlée

> **SUPERSÉDÉ POUR LE NUMÉRO DE VERSION, PAS POUR LE CONTENU.** Un travail
> mené en parallèle dans ce même dépôt a porté `package.json` en **0.3.16** et
> produit, le 18/10 à 21 h 35, l'archive `notescam-linux-x64-0.3.16.tar.gz`
> (53 416 669 octets, SHA-256 `5b53d83b…669fc`) avec son propre
> `deploy-0.3.16.sh` et sa notice.
>
> J'ai vérifié que cette archive **porte bien les corrections de ce document** :
> `source_balance_raw` n'est posée ni par `db.js` ni par `schema.sql`,
> `cash_movements` est créée et comparée, aucune base ni clé dans le paquet.
> C'est donc **la 0.3.16 qu'il faut livrer** — l'archive 0.3.15 et le
> `deploy-0.3.15.sh` décrits plus bas sont redondants.
>
> Tout le reste de ce document reste valable : il ne dépend pas du numéro de
> version (audit des colonnes, migrations, sauvegarde vérifiable, aller-retour,
> critères d'arrêt).

> **ÉTAT au 18/10/2026 : PAQUET CONSTRUIT ET VÉRIFIÉ, PAS ENCORE ENVOYÉ À
> L'ÉCOLE.** L'application sur le serveur de l'école n'a pas été touchée.
>
> **Fait, sur autorisation :**
> - les **3 migrations Cloud** en attente sont **appliquées** (option A, §3.3) ;
> - `source_balance_raw` est **retirée du paquet LAN** pour que les deux schémas
>   coïncident — plus aucune colonne LAN-seulement sur les 65 tables
>   synchronisées (§3.1) ;
> - l'**aller-retour LAN↔Cloud est prouvé** contre les fonctions déployées, sur
>   l'école de recette (§7) ;
> - le paquet Linux **0.3.15** est construit et son contenu vérifié par
>   exécution ;
> - `packaging/linux/deploy-0.3.15.sh` : livraison avec sauvegarde **vérifiée**
>   et critères d'arrêt (§4, §6) ;
> - `packaging/linux/NOTICE-MISE-A-JOUR-0.3.15.txt` : notice administrateur.
>
> | | |
> |---|---|
> | Archive | `packaging/linux/Output/notescam-linux-x64-0.3.15.tar.gz` |
> | Taille | 53 409 237 octets |
> | SHA-256 | `e3b6e5b61b42b31a11987c94549db8ca348f2242bb6580ecfd13822943577328` |
>
> **Reste à faire :** envoyer l'archive + le script + la notice à
> l'administrateur de l'école, et qu'il lance la commande du §6.
>
> ⚠ **Les deux artefacts Windows du dossier `packaging/Output*` sont PÉRIMÉS**
> (13 h 02 et 16 h 33, antérieurs aux sources corrigées de 16 h 44 / 17 h 04).
> Ils posent encore `source_balance_raw`. **Ne les appliquer à aucune école**
> avant reconstruction.

## 0. Le vecteur réel : Linux, pas Windows

Le serveur de l'école est un **Ubuntu/Debian** avec un service systemd
(`packaging/linux/`). La livraison se fait donc par :

| Étape | Outil |
|---|---|
| Fabrication | `packaging/linux/build-package.sh` → `Output/notescam-linux-x64-0.3.15.tar.gz` |
| Application | extraction puis `sudo ./install.sh` sur le serveur de l'école |

Le paquet `packaging/Output-maj/notescam-maj-0.3.15-20261018.zip` (fabriqué
aujourd'hui 13 h 27) est un paquet **Windows**. Il ne convient pas à cette
école, et il est de toute façon **périmé** : son `dist/` a été compilé à
12 h 06 alors que `src/pages/Bulletins.jsx` a été modifié ensuite (13 h 25).
L'interface qu'il embarque n'est pas celle de ses propres sources.

`app_releases` ne contient que la 0.2.0, sans URL ni empreinte ni signature :
**le canal de mise à jour automatique n'est pas en service**. La livraison est
manuelle, et c'est l'administrateur de l'école qui l'applique.

## 1. Ce que contient exactement la mise à jour

Le paquet emporte `server/`, `src/`, le `dist/` compilé et `package.json`.
Tous les changements en instance dans ces dossiers partent donc ensemble.

### 1.1 Correctifs de synchronisation (le cœur de la 0.3.15)

| Fichier | Apport | Couvert par |
|---|---|---|
| `server/cloudSync.js` | Le Cloud répond 200 en refusant des lignes : elles ne sont **plus purgées** de l'outbox. Tentatives comptées, motif conservé, quarantaine au 8ᵉ échec. | `_push_refus.test.mjs` **10/10** |
| `server/cloudSync.js` | `adaptLocalRow` / `adaptRemoteRow` : remappage des références de comptes (`school_users.user_id`, `teachers`/`staff.auth_user_id`) dans les deux sens. Comptes « en attente de credential » matérialisés avec une empreinte invérifiable. | `_sync_contract.test.mjs` |
| `server/cloudSync.js` | Journal résumé par table au lieu d'une ligne par enregistrement et par cycle. | — |
| `server/syncRepair.js` | Tombstones **non bloquants** + découpage par lots de 200 ; **isolation par table** dans `autoRepair` ; motif réel du refus remonté. | `_sync_repair.test.mjs` **25/25** |
| `server/syncMetrics.js` | Quarantaine et backlog visibles **par table, avec motif** — diagnostic à distance sans se connecter au PC de l'école. | — |
| `server/syncVerify.js` | `signalements` et `cash_movements` ajoutés à `VERIFY_TABLES`. | `_sync_contract.test.mjs` |

### 1.2 Signalements

Chaîne vérifiée de bout en bout : `signalements` est présente dans
`SYNCED_TABLES` (LAN), dans `PULL_ORDER` **avant ses deux tables enfants**
(sans quoi commentaires et historique descendaient vers une ligne inexistante),
dans `VERIFY_TABLES`, et dans les quatre fonctions Edge — dont les trois
déployées ce jour. Les colonnes de synchronisation (`updated_at`, `version`,
`device_id`) existent côté Cloud : `supabase_sync_signalements.sql` est **déjà
appliquée**.

### 1.3 Filtrage des tombstones

Conservé et complet : `UUID_RE` côté Cloud (`sync-repair/index.ts:38`, déployée
en **v5**) écarte les ids non-UUID qui faisaient échouer tout le lot en HTTP 400 ;
côté LAN, `TOMB_CHUNK = 200` borne la longueur d'URL et le repli non bloquant
garantit qu'une indisponibilité des tombstones ne stoppe plus la réparation.

### 1.4 Journal de caisse

`cash_movements` (table + 3 index), les colonnes de traçabilité sur
`budget_expenses`, l'écran `/app/caisse`, `cashBookEngine`, `cashBookService`,
`sourceKey`. Couvert par `_cash_movements_sync.test.mjs` **38/38**,
`_cashBookEngine.test.mjs` **70 assertions**, `_sourceKey.test.mjs` **19**.

### 1.5 Ce qui part aussi, et qu'il faut savoir

| Fichier | Nature | Remarque |
|---|---|---|
| `server/fileSync.js` (nouveau) | Réplication des photos/logos vers le Cloud | Appelle `asset-sync`, **déjà déployée** (v1). Strictement best-effort : une panne n'interrompt pas la synchro des données. |
| `src/lib/teacherImport.js`, `src/pages/Teachers.jsx` | Import d'enseignants | Hors périmètre caisse, part dans le même paquet. |
| `src/lib/referentielEcole.js` + 4 tables de référentiel | Masquage/renommage de référentiels par école | Tables **présentes** au Cloud. |
| `src/lib/exportCsv.js`, `src/pages/Bulletins.jsx` | Export CSV, bulletin bilingue | Hors périmètre. |

## 2. Migrations : appliquées, et restant à appliquer

### 2.1 Côté LAN — automatique, mesurée sur copie isolée

Aucun script à lancer : `server/db.js` pose le schéma au démarrage. Delta
**mesuré** (base neuve au niveau du dernier commit livré, puis migration 0.3.15
appliquée dessus) :

| | Objets |
|---|---|
| Tables créées (5) | `cash_movements`, `referentiel_libelles`, `apc_competences_masques`, `mat_domaines_masques`, `prim_competences_masques` |
| Colonnes ajoutées (11) | `budget_expenses` × 5 (`source_file`, `source_row`, `import_batch`, `source_balance`, `source_balance_raw`), `school_users` × 3 (`phone`, `photo_url`, `last_login_at`), `school_id` sur 3 tables de référentiel |
| Index créés | 7 |
| **Tables supprimées / colonnes perdues / triggers perdus** | **0 / 0 / 0** |
| **Écarts de comptage de lignes** | **0** sur 116 tables |

**Effet de bord documenté et voulu** : parce que des colonnes sont ajoutées à
des tables synchronisées, `db.js` **remet à zéro le curseur de pull**
(`sync_cursor.pull_at`) pour que les valeurs neuves descendent. Le prochain
pull relit donc **tout** le Cloud — une seule fois, et la résolution LWW rend
l'opération sans effet de bord. Conséquences à connaître : ce premier cycle est
long sur une connexion fine, et c'est **par lui** que les 11 mouvements de
caisse et les 60 dépenses arriveront à l'école. La **file de poussée**
(`sync_outbox`) et les tombstones ne sont **pas** touchés.

### 2.2 Côté Cloud — trois migrations ne sont PAS appliquées

Audit automatique des 205 fichiers `supabase_*.sql` du dépôt contre
`information_schema` :

| Migration | Colonnes absentes du Cloud | Table synchronisée ? |
|---|---|---|
| `supabase_student_quartier_origine.sql` | `students.quartier`, `students.ecole_origine` | **oui** |
| `supabase_student_registre_matricule.sql` | `students.date_entree`, `date_sortie`, `motif_entree`, `motif_sortie`, `profession_tuteur` | **oui** |
| `supabase_subject_category.sql` | `subjects.category` | **oui** |
| `supabase_cash_book_raw_balance.sql` | `budget_expenses.source_balance_raw`, `cash_movements.source_balance_raw` | **oui** (retenue à dessein) |

Les trois premières sont `ADD COLUMN IF NOT EXISTS … TEXT`, nullables,
idempotentes, sans valeur par défaut et sans réécriture de table.

## 3. LE CONTRÔLE QUI ÉCHOUE

### 3.1 Le fait

Comparaison exhaustive des colonnes des **65 tables synchronisées**, schéma LAN
0.3.15 contre schéma Cloud. Dix colonnes existent **en LAN seulement** :

```
students.quartier · students.ecole_origine · students.date_entree
students.date_sortie · students.motif_entree · students.motif_sortie
students.profession_tuteur · subjects.category
budget_expenses.source_balance_raw · cash_movements.source_balance_raw
```

### 3.2 Pourquoi c'est bloquant

`cloudSync.push` envoie la ligne entière (`SELECT * FROM table WHERE id = ?`).
`sync-push` l'applique telle quelle (`admin.from(table).upsert(ch.row)`). Une
colonne absente du schéma Cloud ne peut pas être écrite : l'écriture est
refusée (colonne inconnue du cache de schéma, sinon `42703` côté Postgres).
Rien n'est perdu — depuis cette version la ligne **reste** dans la file avec
son motif, puis passe en quarantaine au 8ᵉ essai — mais **elle n'arrive jamais
au Cloud**.

Les huit colonnes `students`/`subjects` ont été introduites côté LAN le
**15/10/2026** (commits `19e6e5e`, `b5593e6`, versions 0.3.13/0.3.14). Depuis
une installation de ces versions, **aucune création ni modification d'élève ou
de matière ne peut remonter**. Cela recoupe le symptôme décrit dans
`packaging/linux/DIAGNOSTIC-ELEVES-MANQUANTS.txt` (« ce qui ne passe pas, ce
sont les CRÉATIONS ») et répond à la question qui y restait ouverte — « nous ne
savons pas POURQUOI le cloud les refuse » — **pour la période depuis le 15/10
seulement**. L'arrêt constaté le 15/09 est antérieur d'un mois aux colonnes :
il a une autre cause, encore inconnue, et le diagnostic demandé à l'école reste
nécessaire.

Observations de production, lecture seule : dernier élève créé au Cloud le
**15/09**, dernière modification le **08/10**, dernier pull de l'école le
**17/10 à 11 h 54 UTC**. Aucun appel à `sync-push`/`sync-pull` dans les
dernières 24 h en dehors de mes propres sondes — nous sommes dimanche.

### 3.3 Décision demandée

| | Option | Effet |
|---|---|---|
| **A** | Appliquer les **3** migrations en attente, puis livrer | Aligne LAN et Cloud ; **débloque** élèves et matières. `source_balance_raw` reste écartée des deux côtés : je retire alors les 2 `ensureColumn` du paquet. |
| **B** | Appliquer les **4** (dont `source_balance_raw`) | Idem, et la balance brute devient utilisable. Contredit votre consigne « n'applique pas encore la migration `source_balance_raw` ». |
| **C** | Livrer sans rien appliquer | **Déconseillé.** Élèves et matières restent bloqués, et le défaut s'étend aux deux tables financières. |

Mon avis : **A**. Les trois migrations sont de la classe la plus sûre (colonnes
texte nullables, idempotentes) et réparent un défaut vivant ; la balance brute,
elle, n'a aucun usage à l'école (l'import tourne depuis le poste d'édition
vers le Cloud) et peut attendre sa propre fenêtre.

### 3.4 Ce qui a été décidé, et fait

**Option A, retenue et exécutée le 18/10/2026.**

```bash
node scripts/apply-cloud-sql.mjs --apply \
  supabase_student_quartier_origine.sql \
  supabase_student_registre_matricule.sql \
  supabase_subject_category.sql
# => 3 × OK
```

Les trois fichiers ne contiennent que des `ADD COLUMN IF NOT EXISTS … TEXT`, des
`COMMENT ON COLUMN` et un bloc d'auto-contrôle qui lève si une colonne manque.
**Aucune** policy RLS, **aucun** index, **aucune** écriture de donnée, **aucune**
réécriture de table — relu intégralement avant exécution.

Côté LAN, les deux `ensureColumn('…', 'source_balance_raw', …)` sont retirés de
`server/db.js` et la colonne ne figure plus dans le `CREATE TABLE` de
`server/schema.sql`, avec, en commentaire à leur place, la condition exacte de
leur rétablissement. Vérifications :

| Contrôle | Résultat |
|---|---|
| Colonnes LAN-seulement sur les 65 tables synchronisées | **0** (contre 10 avant) |
| `students` ×7 et `subjects.category` au Cloud | **présentes** |
| `source_balance_raw` au Cloud | **absente**, comme demandé |
| `cash_movements` : colonnes LAN / Cloud | **19 / 19** |
| Delta LAN de la 0.3.15 | 5 tables, **10** colonnes (au lieu de 11), 7 index, 0 perte |

Preuve par exécution, depuis l'archive livrable elle-même, sur une base au
niveau 0.3.14 : `cash_movements` créée avec 19 colonnes,
`budget_expenses.source_balance` présente, `source_balance_raw` **absente des
deux tables**, `cash_movements` et `signalements` dans `SYNCED_TABLES`.

## 4. Sauvegarde vérifiable de la base SQLite

`packaging/linux/install.sh` **ne sauvegarde pas la base**.
`deploy-correctif-credentials.sh`, prescrit par les notices précédentes, la
copiait — mais **service encore actif, par `cp`** : une base en mode WAL copiée
pendant qu'un serveur écrit peut donner une copie déchirée, qu'on ne découvre
qu'en voulant s'en servir.

**`packaging/linux/deploy-0.3.15.sh` (écrit pour cette livraison) fait la
séquence correcte** : arrêt du service → copie consolidée (`VACUUM INTO`) →
**vérification** (contrôle d'intégrité + comptages identiques) → et **arrêt pur
et simple si la sauvegarde n'est pas vérifiée**, service remis en marche,
application non touchée. Il n'utilise pas le paquet `sqlite3` (souvent absent
d'un serveur d'école) mais le node embarqué.

Ses deux fragments SQLite ont été **testés contre une vraie base LAN**
(232 élèves, 10 054 notes, 739 versements, 150 entrées en file) : lecture
conforme, copie cohérente, `integrity_check` = `ok`, comptages identiques.

La même séquence, à la main, si l'on préfère ne pas utiliser le script :

```bash
# 1. ARRÊTER le service : une copie prise serveur actif peut être déchirée.
sudo systemctl stop notescam

# 2. Copie COHÉRENTE (VACUUM INTO consolide le WAL ; la source reste intacte).
HORO=$(date +%Y%m%d%H%M%S)
sudo -u notescam sqlite3 /var/lib/notescam/data/notescam.db \
  "VACUUM INTO '/var/lib/notescam/data/notescam.db.avant-0.3.15-$HORO'"
#    sqlite3 absent ? repli, service arrêté, WAL inclus :
#    sudo mkdir -p /var/lib/notescam/sauvegarde-$HORO
#    sudo cp -a /var/lib/notescam/data/notescam.db     /var/lib/notescam/sauvegarde-$HORO/
#    sudo cp -a /var/lib/notescam/data/notescam.db-wal /var/lib/notescam/sauvegarde-$HORO/
#    sudo cp -a /var/lib/notescam/data/notescam.db-shm /var/lib/notescam/sauvegarde-$HORO/

# 3. VÉRIFIER la copie — une sauvegarde non vérifiée n'est pas une sauvegarde.
sudo -u notescam sqlite3 /var/lib/notescam/data/notescam.db.avant-0.3.15-$HORO \
  "PRAGMA integrity_check; SELECT 'eleves', COUNT(*) FROM students
   UNION ALL SELECT 'notes', COUNT(*) FROM grades
   UNION ALL SELECT 'versements', COUNT(*) FROM fee_payments
   UNION ALL SELECT 'file_poussee', COUNT(*) FROM sync_outbox;"
```

Critère : `integrity_check` = `ok` **et** les quatre comptages identiques à ceux
relevés sur la base d'origine avant l'arrêt. Sinon on s'arrête là.

Procédé éprouvé ici : la même séquence a été jouée sur deux bases LAN réelles
(9,4 Mo / 111 tables / 19 139 lignes et 15,3 Mo / 116 tables / 18 699 lignes) —
`integrity_check` = `ok`, **zéro** écart de comptage dans les deux cas.

## 5. Retour arrière

### 5.1 Le code

```bash
# L'archive de la version précédente existe déjà, fabriquée le 16/10 :
#   packaging/linux/Output/notescam-linux-x64-0.3.14.tar.gz
sudo systemctl stop notescam
tar -xzf notescam-linux-x64-0.3.14.tar.gz && cd notescam-linux-x64
sudo ./install.sh                      # remplace /opt/notescam, garde /var/lib/notescam
```

`install.sh` ne touche jamais `/var/lib/notescam/data` ni
`/etc/notescam/notescam.env` : le retour arrière du code ne perd aucune donnée
et ne redemande aucun appairage.

### 5.2 La base

Les objets posés par la 0.3.15 (5 tables, 11 colonnes) **restent** après un
retour au code 0.3.14, et c'est sans danger : l'ancien code ne les lit pas. On
ne restaure donc la sauvegarde que si la base elle-même est en cause :

```bash
sudo systemctl stop notescam
sudo -u notescam cp -a /var/lib/notescam/data/notescam.db.avant-0.3.15-<HORO> \
                       /var/lib/notescam/data/notescam.db
sudo rm -f /var/lib/notescam/data/notescam.db-wal /var/lib/notescam/data/notescam.db-shm
sudo systemctl start notescam
```

⚠ Une restauration **perd les saisies faites depuis la sauvegarde**. À ne faire
que sur décision explicite, jamais par réflexe.

### 5.3 Les migrations Cloud

Si l'option A ou B est retenue et qu'il faut revenir :

```sql
ALTER TABLE public.students DROP COLUMN IF EXISTS quartier;
ALTER TABLE public.students DROP COLUMN IF EXISTS ecole_origine;
ALTER TABLE public.students DROP COLUMN IF EXISTS date_entree;
ALTER TABLE public.students DROP COLUMN IF EXISTS date_sortie;
ALTER TABLE public.students DROP COLUMN IF EXISTS motif_entree;
ALTER TABLE public.students DROP COLUMN IF EXISTS motif_sortie;
ALTER TABLE public.students DROP COLUMN IF EXISTS profession_tuteur;
ALTER TABLE public.subjects DROP COLUMN IF EXISTS category;
```

Ces colonnes étant neuves et nullables, les retirer ramène exactement à l'état
d'avant — à ceci près que les valeurs remontées entre-temps seraient perdues.

## 6. Commandes exactes de livraison

```bash
# — Poste d'édition —
# 1. Contrôles préalables (tous doivent passer)
node server/_sync_contract.test.mjs            # attendu 39 ok, 0 ko
node server/_cash_movements_sync.test.mjs      # attendu 38 ok, 0 ko
node server/_sync_repair.test.mjs              # attendu 25 ok, 0 ko
node server/_push_refus.test.mjs               # attendu 10 ok, 0 ko
npm run validate                                # attendu exit 0

# 2. Fabrication du paquet Linux (Node linux-x64 déjà en cache)  [FAIT]
cd packaging/linux && ./build-package.sh v24.22.0
sha256sum Output/notescam-linux-x64-0.3.15.tar.gz
#   => e3b6e5b61b42b31a11987c94549db8ca348f2242bb6580ecfd13822943577328
#      53 409 237 octets · garde-fou du script : « aucune base, aucune cle »

# 3. À envoyer à l'école, les trois ensemble :
#      Output/notescam-linux-x64-0.3.15.tar.gz
#      deploy-0.3.15.sh
#      NOTICE-MISE-A-JOUR-0.3.15.txt

# — Serveur de l'école, en root, dans le dossier contenant les trois —
sha256sum notescam-linux-x64-0.3.15.tar.gz     # doit égaler l'empreinte ci-dessus
sudo ./deploy-0.3.15.sh notescam-linux-x64-0.3.15.tar.gz
```

Le script enchaîne les contrôles d'avant, la sauvegarde vérifiée, l'installation
et les contrôles d'après, et rend un code de sortie : **0** = tout est PASS,
**2** = sauvegarde non vérifiée (rien n'a été installé), **autre** = nombre de
contrôles en échec. Un code ≠ 0 est le signal d'appeler l'éditeur, **pas** de
tenter une réparation.

### Contrôles AVANT (sur le serveur de l'école, lecture seule)

```bash
grep version /opt/notescam/app/package.json            # version installée
systemctl is-active notescam
sudo -u notescam sqlite3 /var/lib/notescam/data/notescam.db \
 "SELECT 'eleves',COUNT(*) FROM students UNION ALL SELECT 'notes',COUNT(*) FROM grades
  UNION ALL SELECT 'versements',COUNT(*) FROM fee_payments
  UNION ALL SELECT 'file',COUNT(*) FROM sync_outbox;"
```

### Contrôles APRÈS

| # | Contrôle | Attendu |
|---|---|---|
| 1 | `systemctl is-active notescam` | `active` |
| 2 | `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/` | `200` |
| 3 | `grep version /opt/notescam/app/package.json` | `0.3.15` |
| 4 | Les 4 comptages d'avant | **inchangés** |
| 5 | `PRAGMA integrity_check` | `ok` |
| 6 | `SELECT COUNT(*) FROM cash_movements` | table présente |
| 7 | `journalctl -u notescam -n 100` | pas d'erreur répétée ; le pull complet peut durer |
| 8 | Après un cycle : les mouvements et les dépenses sont en LAN | 11 / 5 685 350 et 60 / 4 575 510 |
| 9 | Soldes des deux caisses, recalculés en LAN | collège **268 850**, complexe **230 680** |
| 10 | `sync_outbox_quarantine` | aucune entrée nouvelle |
| 11 | `SELECT COUNT(*) FROM cash_movements WHERE school_id <> '<école>'` | **0** |

### Critères d'arrêt — on s'arrête et on rapporte, sans rien réparer

1. `integrity_check` ≠ `ok`, avant ou après ;
2. un seul des comptages d'avant diminue ;
3. le service ne redevient pas `active`, ou `/` ne rend pas 200 ;
4. une entrée apparaît en quarantaine avec un motif de colonne inconnue ;
5. un solde de caisse diffère de la valeur attendue ;
6. une ligne d'un autre établissement apparaît dans `cash_movements` ;
7. la sauvegarde de §4 n'a pas été vérifiée : **la livraison ne commence pas**.

## 7. Seconde décision demandée : la vérification bout-en-bout

Je ne peux pas piloter le serveur de l'école : son jeton scellé n'existe en base
que sous forme de hachage, et une synchronisation forcée est exclue. Trois voies :

| | Voie | Ce qu'elle prouve | Risque |
|---|---|---|---|
| **1** | Attendre le cycle naturel de l'école après livraison | Tout, en vrai | Aucun. Délai : lundi. |
| **2** | Émettre un jeton pour l'école de test déjà présente dans le Cloud (`Lycée Test Surveillant`), appairer une installation locale, faire l'aller-retour complet | Montée, descente, soldes, isolation — sur un établissement sans enjeu | Crée une ligne de jeton et des données de test au Cloud. Réversible. |
| **3** | Utiliser le jeton valide d'un **autre établissement réel** présent sur ce poste | Idem | **Écrirait 150 lignes en attente d'une autre école en production. Je ne le ferai pas.** |

Recommandation : **2** pour vérifier maintenant, **1** comme confirmation réelle.

### 7.1 Voie 2, exécutée — résultats

École utilisée : **`[RECETTE] École B (isolation)`**
(`b0000000-0000-4000-8000-0000000000b1`), **déjà présente** au Cloud et créée
pour cet usage : aucune école n'a été créée. Jeton d'essai émis (64 caractères,
empreinte `72ec2a6f7ef9…`), base LAN neuve, code 0.3.15, **fonctions Edge
réellement déployées**.

| # | Contrôle | Résultat |
|---|---|---|
| 1 | Cycle 1 — descente initiale | 4 lignes (école, membre, classe, élève) |
| 2 | **ISOLATION** : mouvements de caisse descendus | **0** — les 11 de GENIUS ne sont **pas** venus |
| 3 | Cycle 2 — **montée** d'un mouvement créé en LAN | `pushed=1`, file vidée, quarantaine **0** |
| 4 | Présence au Cloud sous la bonne école | **oui**, `version=1`, montant et libellé exacts |
| 5 | Cycle 3 — **descente** d'un mouvement créé au Cloud | `pulled=2` |
| 6 | Cycle 4 — **idempotence** | `pulled=0 pushed=0` : rien n'est renvoyé |
| 7 | **Doublons** en LAN | **0** |
| 8 | Files : poussée / rejeu / quarantaine | **0 / 0 / 0** |
| 9 | **Solde**, moteur LAN vs SQL Cloud, indépendamment | **20 000 = 20 000** (2 mouvements) |
| 10 | GENIUS pendant tout l'essai | **11 / 5 685 350** et **60 / 4 575 510**, inchangés |

**Nettoyage fait** : les 2 lignes d'essai sont supprimées (0 restante), le jeton
d'essai est **révoqué** (`revoked_at` posé) et le fichier local effacé. GENIUS
revérifié après nettoyage : **11 mouvements, 60 dépenses**.

Ce que cet essai ne prouve pas : il ne passe pas par le serveur HTTP ni par les
gardes de `server/query.js` (il écrit en base puis met en file comme le fait
`recordOutbox`). Le chemin applicatif de l'écran de caisse reste couvert par les
tests, pas par cet essai. Et le serveur **réel** de l'école reste à vérifier :
voie **1**, à son prochain cycle.

## 8. Hors périmètre, mais constaté

- L'installation Windows de ce poste (`C:\Program Files\NotesCam`, **0.3.4**)
  est appairée à **COLLÈGE LA RETRAITE** avec un jeton **inconnu du Cloud**
  (empreinte `058cf10e02`, absente de `school_server_tokens`). D'où les
  **49 réponses 401** sur `credentials-pull` et `publish-server-key` dans les
  journaux des dernières 24 h, et **150 entrées bloquées** dans sa file. Si
  cette installation était un jour réappairée avec un jeton valide, ces
  150 lignes partiraient en production pour cette école.
- 43 colonnes existent **au Cloud seulement** (ex. `students.tel_pere`,
  `teachers.can_print_bulletin`, `classes.evaluation_mode`). `rawUpsert` ne
  recopie que les colonnes locales : une valeur saisie au Cloud dans l'une
  d'elles ne descend pas à l'école. Sans gravité immédiate, à traiter
  séparément.
