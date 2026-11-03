# Comment fonctionne la synchronisation

Document court, à lire avant de toucher au moteur. État au **01/11/2026**.
Décisions : [`JOURNAL_DECISIONS.md`](JOURNAL_DECISIONS.md) · incidents :
[`REGISTRE_INCIDENTS.md`](REGISTRE_INCIDENTS.md) · audit d'origine :
[`AUDIT_SYNC.md`](AUDIT_SYNC.md).

## En une phrase

Chaque école a **un** serveur LAN qui garde la vérité localement et échange avec
le Cloud dès qu'il peut le joindre : il **pousse** ce qui a changé chez elle,
**tire** ce qui a changé en ligne, et quand les deux ont touché la même ligne il
**fusionne champ par champ** au lieu d'écraser.

## Les quatre pièces

| Table | Rôle |
|---|---|
| `sync_outbox` | ce qui attend de monter — **une entrée par ligne**, jamais plus |
| `sync_cursor` | où on en est dans le tirage (`pull_at`, `tomb_at`) |
| `sync_shadow` | l'état sur lequel les deux côtés étaient **d'accord** |
| `sync_conflicts` | les désaccords, pour qu'aucun ne soit silencieux |

Côté Cloud, quatre Edge Functions : `sync-push`, `sync-pull`, `sync-verify`,
`sync-repair`. Elles sont authentifiées par le **jeton scellé de l'école**.

## 1. Comment une modification entre dans la file

**Par un déclencheur SQLite, pas par du code applicatif.** Chaque table
synchronisée porte trois déclencheurs (`trg_outbox_<table>_{ins,upd,del}`) qui
inscrivent la ligne dans `sync_outbox` à chaque écriture.

C'est le correctif de I36 : la règle vivait avant dans une fonction
(`recordOutbox`) qu'il fallait **penser à appeler**, et `server/rpc.js` ne
l'appelait pas — 32 écritures ne remontaient jamais. Descendue dans la base, la
règle n'est plus une convention.

> **Si vous ajoutez une table synchronisée**, vous n'avez rien à appeler : le
> déclencheur se pose au démarrage. Mais elle doit figurer dans les **sept
> listes** (voir §6), sinon elle ne circule pas — et `_sync_couverture.test.mjs`
> vous le dira.

**Une ligne en attente = une entrée.** `sync_outbox` porte
`UNIQUE (tablename, row_id)` : enfiler deux fois la même ligne remplace l'entrée
au lieu de l'empiler. C'est le correctif de I35, où la file avait atteint
**13 314 326 entrées** pour quelques milliers de lignes réelles — soit 49
semaines de rattrapage à 500 entrées par cycle.

**L'anti-écho.** La synchronisation écrit aussi en base quand elle applique une
ligne venue du Cloud. Sans garde, le déclencheur la renverrait aussitôt : une
boucle. `sansEcho(fn)` lève un drapeau dans une **table** — pas une variable JS,
parce que c'est SQLite qui l'évalue. Trois chemins le posent : `rawUpsert`, la
suppression de tombstone et la suppression réparée.

## 2. Comment un conflit se règle — par CHAMP

C'était la dernière grosse cause de perte silencieuse :

> 9 h — la secrétaire corrige le **matricule** de Marie, à l'école.
> 10 h — le censeur corrige le **nom** de Marie, en ligne.
> → la ligne distante était « plus récente » : elle écrasait tout. Le matricule
> corrigé à 9 h était perdu, **sans un mot**.

Comparer deux versions ne suffit pas : avec `local = '699…'` et
`distant = '677…'`, on ne peut pas savoir **qui** a changé **quoi**. Il faut un
troisième terme — `sync_shadow`, la dernière valeur que les deux côtés ont vue
ensemble. Avec elle, chaque champ se lit sans ambiguïté :

| local vs base | distant vs base | décision |
|---|---|---|
| inchangé | inchangé | on garde |
| **modifié** | inchangé | **on garde le local** ← la perte cesse ici |
| inchangé | modifié | on prend le distant |
| modifié | modifié | vrai conflit → §3 |

Le départage à la ligne entière devient l'**exception** au lieu de la règle.

**L'ombre se pose à deux instants, et deux seulement** — les deux où un accord
a lieu : quand on applique une ligne tirée, et quand le Cloud accepte une ligne
poussée. Une écriture locale ordinaire n'y touche pas : c'est précisément
l'écart entre l'ombre et le local qui dit « l'école a modifié ce champ ».

**Pas d'ombre, pas de fusion.** Pour une ligne jamais encore échangée,
`fusionner()` rend `null` et l'appelant retombe sur le départage à la ligne.
C'est volontaire, et transitoire : l'ombre se pose au premier échange.

**La version fusionnée porte `max(local, distant) + 1`.** Sans cela, le Cloud la
reverrait comme périmée et la réécraserait au cycle suivant : la fusion serait
défaite à chaque tour.

## 3. L'horloge — et pourquoi ce n'est pas celle du PC

Un vrai conflit de champ se départage **par `version`**, un compteur monotone,
donc une horloge **logique**. Les horodatages ne servent qu'en second recours
(versions égales), et le `device_id` tranche en tout dernier pour que le
résultat soit **le même sur les deux nœuds** — un départage non déterministe
ferait diverger les bases, ce qui est pire qu'un mauvais choix.

> La raison est de terrain : l'horloge d'un poste d'école peut avoir des mois
> d'écart — une pile de carte mère vide suffit. Avec un départage par
> horodatage, ce poste gagnerait, ou perdrait, **tous** les conflits.

## 4. Ce qui ne s'écrase jamais en silence

La liste est dans [`server/syncSensible.js`](../server/syncSensible.js), à part
du moteur, pour qu'un relecteur de l'école puisse la lire et la contester sans
ouvrir le moteur. **Si une colonne y manque, elle s'écrase en silence.**

**Tables en ajout seul** — `fee_payments`, `deleted_fee_payments`. Une écriture
comptable ne se modifie pas : elle se **contre-passe** (une ligne négative qui
pointe l'originale). Le Cloud peut seulement **remplir** un champ encore vide —
le numéro de reçu attribué par le serveur en est le cas normal. Il ne peut
jamais changer un champ qui porte déjà une valeur, **quelle que soit sa
version, et que l'école y ait touché ou non**.

**Champs sensibles** — notes (`grades.value`), périodes verrouillées
(`academic_periods.is_locked`, `status`, bornes de saisie), montants dus
(`student_fees`), caisse comptée (`cash_sessions`), archivage d'élève. Ici
l'écrasement n'est pas interdit : il est interdit **en silence**. Le local est
conservé et le conflit est inscrit dans `sync_conflicts`, à arbitrer par
l'école — pas par l'ordre d'arrivée des paquets réseau.

Un conflit répété au fil des cycles reste **une** ligne : sans cela l'écran
afficherait « 400 conflits » pour une seule case de note.

## 5. Quand ça se déclenche

Sur l'événement **« le serveur est joignable »**, jamais sur l'horloge. Les
heures d'ouverture de l'école (lun–ven, ~7 h–16 h Douala) sont une information
de **supervision** : elles n'ouvrent ni ne ferment la synchronisation. Une école
qui rallume son serveur un dimanche soir doit rattraper.

Le cycle tire **puis** pousse : une fusion est donc enfilée, poussée et la file
purgée **dans le même tour**.

> **Cadence (02/11/2026, code écrit, NON déployé)** — voir §10. Le tirage tourne
> toutes les **30 s** (et non 5 min), un envoi part **3 s** après une écriture locale,
> le tirage boucle tant que le Cloud dit `done: false`, et chaque appel est borné à
> 30 s. Le contrôle d'intégrité et les fichiers gardent leur rythme de 5 min.

## 6. Les sept listes, et le cliquet

Une table synchronisée doit figurer dans **sept** endroits : `SYNCED_TABLES`
(db.js), `PULL_ORDER` (cloudSync.js), `VERIFY_TABLES` (syncVerify.js), et les
quatre listes des Edge Functions.

`_sync_contract.test.mjs` recoupe ces sept listes — mais il **part de
`SYNCED_TABLES`** : une table absente de celle-ci n'est réclamée par aucune
comparaison. Elle n'apparaît nulle part, le test passe, et elle ne circule pas.
**C'est par là que `parent_student_links` est passée** : les frères et sœurs
saisis à l'école ne remontaient jamais, et rien ne le signalait.

`_sync_couverture.test.mjs` est le cliquet qui manquait : il part du **schéma**
et exige que **chaque** table soit classée répliquée, locale avec motif, ou
inscrite à brancher. Une table neuve non classée fait échouer le test.

Aujourd'hui : **67 répliquées · 44 locales · 10 à brancher**.

## 7. Ce que ça ne fait pas encore

À écrire noir sur blanc, pour que personne ne croie le contraire :

- **Le Cloud, lui, départage encore à la ligne entière.** `sync-push` applique
  sa propre LWW. Nos lignes fusionnées passent parce qu'elles portent une
  version supérieure, mais une modification faite dans l'interface web entre
  notre tirage et notre poussée peut être écrasée par la ligne fusionnée. La
  fenêtre est étroite ; elle n'est pas nulle.
- **10 tables ne circulent pas**, dont 6 sans colonne `id` (clé composite) :
  elles ne peuvent pas traverser le moteur sans identifiant déterminé. Elles
  sont **inscrites** dans le cliquet, avec leur blocage.
- **L'arbitrage ne se propage qu'au cycle suivant.** Trancher enfile la ligne ;
  elle part à la synchronisation suivante, pas dans la seconde.
  *(L'écran, lui, existe depuis le 02/11/2026 : « Désaccords à trancher », dans
  `/app/synchronisation`. Voir §9 et I39.)*
- ~~**Pas de déclenchement événementiel** : le cycle reste périodique (5 min).~~
  *Levé dans le code le 02/11/2026 (§10) ; vrai tant que ce code n'est pas livré.*
  **Reste vrai** : le Cloud ne peut pas appeler une école (routeur), donc le sens
  Cloud → école reste un **sondage** — au plus l'intervalle (30 s) après la saisie,
  jamais instantané.
- **Les fichiers et pièces jointes** ne sont pas synchronisés incrémentalement.

## 8. Les tests à ne pas casser

| Fichier | Ce qu'il garde |
|---|---|
| `_sync_outbox_dedup.test.mjs` | une ligne = une entrée ; la migration sur base engorgée |
| `_sync_capture_ecritures.test.mjs` | aucune écriture ne contourne la file ; l'anti-écho |
| `_sync_couverture.test.mjs` | aucune table ne peut être oubliée |
| `_sync_contract.test.mjs` | les sept listes concordent |
| `_sync_fusion.test.mjs` | la fusion par champ ; la liste de protection ne vise pas des colonnes fantômes |
| `_sync_fusion_bout_en_bout.test.mjs` | deux nœuds convergent et **restent** convergés |

Règle du dépôt (I26) : **un détecteur qu'on n'a jamais vu détecter n'est pas un
détecteur.** Chacun de ces contrôles a été vu échouer sur le défaut réintroduit.

## 9. L'écran, et comment on tranche

`/app/synchronisation` (administrateur uniquement). Trois blocs, dans cet ordre :
santé, **désaccords à trancher**, journal. Les désaccords passent devant le
journal parce qu'ils attendent une décision humaine — un arbitrage en attente sur
une note bloque un bulletin, une ligne de journal ne bloque rien.

L'écran dit « **à l'école** » et « **en ligne** ». Jamais « local » et
« distant » : ces mots ne veulent rien dire pour une secrétaire, et la question
se pose devant elle comme « qui a raison, celle qui a saisi ici, ou celui qui a
saisi sur le site ? ».

| Ce qu'on voit | Ce que ça veut dire |
|---|---|
| **n en attente** | le moteur a REFUSÉ de trancher — note, période verrouillée, encaissement |
| badge **auto : en ligne** | le moteur a tranché seul (champ ordinaire) ; on peut revenir dessus |
| *(vide)* / *(chaîne vide)* | un champ jamais saisi et un champ effacé ne sont pas la même chose |
| **Valeur d'avant** | la base : la dernière valeur sur laquelle les deux côtés étaient d'accord |

**Trancher repousse la ligne dans les deux cas**, y compris « Garder l'école »,
où il n'y a pourtant rien à écrire en base. Sans cela, le Cloud renverrait sa
version au cycle suivant et le conflit se rouvrirait indéfiniment. Un arbitrage
qui ne se propage pas n'est pas un arbitrage.

L'ombre périmée est **retirée**, pas réécrite : la laisser fausse ferait
reparaître le conflit, l'inventer ferait passer la décision pour un accord qui
n'a pas eu lieu. Elle se repose au premier échange réussi.

Chaque arbitrage est journalisé (`kind: 'conflict-resolve'`) avec QUI l'a pris —
même exigence que pour la contre-passation d'un versement.

> **Les appels passent par `src/lib/lanFetch.js`, et c'est obligatoire.** Les
> routes `/api/sync/*` exigent le jeton d'administrateur. Un `fetch` nu rend
> **403**, et un `.catch(() => {})` le rend invisible : c'est exactement ce qui
> a rendu cet écran entièrement muet pendant des mois (I39). Ne rajoutez pas un
> `fetch` nu ici.

## 10. Cadence, délai réseau et voyant (02/11/2026 — **écrit, non déployé**)

Objectif demandé : synchro LAN ↔ Cloud en moins de 30 s dans les deux sens.

| Mécanisme | Où | Réglage (défaut) |
|---|---|---|
| Envoi **3 s** après la dernière écriture locale, plafonné à 15 s si la saisie continue | `cloudSync.js` (`declencherEnvoi`) | `NOTESCAM_SYNC_DEBOUNCE_MS` (3 000) · `…_DEBOUNCE_MAX_MS` (15 000) |
| Tirage périodique | `cloudSync.js` (`planifierPeriodique`) | `NOTESCAM_SYNC_INTERVAL_MS` (**30 000**) |
| Tirage **en boucle** tant que `done === false` | `cloudSync.js` (`pull`) | `NOTESCAM_PULL_MAX_PAGES` (25) |
| Délai de **30 s** par appel, corps compris | `edgeReseau.js` | `NOTESCAM_EDGE_TIMEOUT_MS` (30 000) · fichiers 120 000 |
| Un seul cycle à la fois, recul ×2 après échec (plafond 5 min) | `cloudSync.js` | `NOTESCAM_SYNC_BACKOFF_MAX_MS` |
| Contrôle d'intégrité + fichiers **gardent 5 min** | `cloudSync.js` | `NOTESCAM_VERIFY_EVERY_MS` (300 000) |

**Comment on voit une écriture.** Le déclencheur SQLite (I36) enfile toute écriture,
quel que soit son chemin. On surveille donc la **base**, pas le code : le compteur
`sqlite_sequence` de `sync_outbox`, lu chaque seconde. `AUTOINCREMENT` le rend
strictement croissant, y compris quand la file se vide et après la reconstruction de
table d'I35 (qui le conserve). Brancher un appel dans chaque écriture ressusciterait la
convention qu'I36 a supprimée.

**Ce que 30 s garantit, et ne garantit pas.** École → Cloud : ≈ 3 s + durée d'un cycle.
Cloud → école : **au plus l'intervalle** (30 s) + durée du cycle, en moyenne 15 s. « Moins
de 30 s » est donc tenu *en moyenne*, pas au pire cas : le garantir exigerait un intervalle
≤ ~20 s, soit 5 328 appels/jour/école au lieu de 3 888. Seul un canal poussé par le
Cloud (Realtime) donnerait de l'instantané — non retenu : nouvelle technologie, à décider.

**Un lien coupé n'est pas la faute de la ligne.** Une erreur `reseau` (timeout, connexion
refusée) ne compte **pas** dans les tentatives de la file. Sans cela, à 30 s de cadence,
huit échecs tiennent dans quatre minutes de Wi-Fi coupé et la tête de file saine partait
en quarantaine. Seules les réponses du Cloud (HTTP, refus) comptent.

**Le voyant** (`SyncBadge` côté école, `CloudSyncBadge` côté Cloud, règle commune
`src/lib/syncStatus.js`) : ✓ OK · ⏳ En attente · ✕ Échec. Côté Cloud, l'école *dit* son
état dans le corps de `sync-pull` (`etat`) ; la fonction l'écrit dans
`sync_client_state` (colonnes `lan_*`, `supabase_sync_etat_lan.sql`) et la lit
`sync_etat_ecole(p_school)`, réservée à l'administrateur de l'école. **Écriture séparée à
erreur ignorée** : la fonction peut être déployée avant ou après la migration sans casser
le tirage.

**À livrer, dans cet ordre, chacun sur autorisation explicite :**
1. `supabase_sync_etat_lan.sql` (additive, idempotente) ;
2. `supabase functions deploy sync-pull` (porte aussi `done: remaining > 0`) ;
3. le paquet LAN (Linux pour GENIUS, Windows pour les autres).
Tant que 2 n'est pas fait, un LAN neuf marche mais coûte un appel de plus par changement
(`done` n'est vrai que sur page vide) ; tant que 1 n'est pas fait, le voyant Cloud se tait.

**Mutations vues échouer (I26)** : boucle de tirage supprimée · plafond de pages retiré ·
page vide qui ne stoppe plus · délai réseau retiré · délai du corps retiré · un échec
réseau compté contre la ligne · cycles qui se chevauchent · contrôle à chaque cycle · recul
retiré · plafond du débounce retiré · guetteur d'écritures retiré · rattrapage supprimé.
