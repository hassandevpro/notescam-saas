# Déploiement du journal de caisse — procédure et retour arrière

> **FAIT le 18/10/2026, sur autorisation.** `sync-push` **v9 → v10**,
> `sync-pull` **v12 → v13**, `sync-repair` **v4 → v5**. `sync-verify` laissée en
> **v4** à dessein (§2). Code déployé revérifié par téléchargement : identique au
> local, à l'octet, pour les trois fonctions.
>
> **Pas encore appliqué** : `supabase_cash_book_raw_balance.sql`, le rejeu de
> l'import, et `supabase_backup_restore.sql`.
>
> **Reste à faire pour que l'école en profite** : livrer la mise à jour
> applicative au serveur LAN (elle porte le correctif `server/syncVerify.js` et
> les colonnes de traçabilité). L'ordre Edge → application est maintenant
> respecté.

## 0. Pourquoi l'ordre compte

L'école a un **jeton serveur actif**. Les 60 dépenses de la reprise sont déjà au
Cloud et `budget_expenses` figure dans la fonction `sync-pull` déployée : elles
**descendront** au prochain pull. Les 11 mouvements de caisse, eux, ne
descendront pas tant que `cash_movements` n'est pas dans la liste déployée.

Conséquence si l'application est mise à jour avant les fonctions Edge : l'écran
de caisse du LAN affiche les sorties sans les entrées, soit

| Caisse | Solde affiché au LAN | Solde réel |
|---|---|---|
| Collège | **−2 031 150** | 268 850 |
| Complexe | **−2 544 360** | 230 680 |

**Donc : fonctions Edge d'abord, application de l'école ensuite.** Jamais
l'inverse.

## 1. Contrôles avant déploiement

```bash
# Les sept listes du contrat de synchronisation s'accordent
node server/_sync_contract.test.mjs          # attendu : 39 ok, 0 ko
# La caisse traverse dans les deux sens, sans doublon ni double comptabilisation
node server/_cash_movements_sync.test.mjs    # attendu : 38 ok, 0 ko
npm run validate                              # attendu : exit 0
npx vite build                                # attendu : exit 0
```

Relever les versions actives, pour pouvoir y revenir :

```bash
supabase functions list --project-ref ltxopwoxvgslsgzixbpx
```

Versions constatées le 18/10/2026 : `sync-push` **v9**, `sync-pull` **v12**,
`sync-verify` **v4**, `sync-repair` **v4** — toutes `ACTIVE`, déployées dans le
même lot.

## 2. Écart exact à déployer

Le dépôt et le déploiement ne diffèrent que par **une entrée de liste blanche
par fonction**. Les autres changements non committés du dépôt (mécanisme
`rejected` de `sync-push`, `'signalements'`, filtre UUID des tombstones de
`sync-repair`) **sont déjà en production** : vérifié en lisant le code déployé
des quatre fonctions.

Comparaison faite le 18/10/2026 en **téléchargeant le code déployé** :

```bash
supabase functions download <slug> --project-ref ltxopwoxvgslsgzixbpx \
  --use-api --workdir <répertoire jetable>      # --workdir : n'écrase pas les sources
diff <déployé>/index.ts <local>/index.ts
```

| Fonction | Lignes déployé → local | Lignes de **code** modifiées |
|---|---|---|
| `sync-push` | 131 → 135 | **0** |
| `sync-pull` | 182 → 185 | **0** |
| `sync-verify` | 101 → 105 | **0** |
| `sync-repair` | 91 → 95 | **0** |

Toutes les lignes qui diffèrent sont soit un commentaire, soit une entrée de
liste de tables. Jeton scellé, `schoolOfToken`, `belongs()`, la défense L1
(`existing[scopeCol] !== schoolId`), `wins()`, `upsert onConflict:'id'`,
`eq(scopeCol, schoolId)` et la RLS sont **inchangés**.

### Quelles fonctions doivent RÉELLEMENT être redéployées

| Fonction | Rôle de sa liste | Redéploiement |
|---|---|---|
| `sync-push` | `if (!ALLOWED.has(ch.table)) continue` → **liste bloquante** | **OUI** — sans elle, montée écartée en silence |
| `sync-pull` | `for (const t of TABLES)` → **liste d'itération** | **OUI** — sans elle, rien ne descend |
| `sync-repair` | `if (!TABLES.has(table)) return 400 'bad_table'` → **liste bloquante** | **OUI** — sans elle, la réparation est refusée |
| `sync-verify` | `const requested = body.tables?.length ? body.tables : TABLES` → **simple valeur par défaut** | **NON** |

`sync-verify` n'a pas besoin d'être redéployée : le serveur LAN envoie toujours
sa propre liste (`server/syncVerify.js`, ligne 234 :
`edge({ op: 'tablelevel', tables: compareTables })`, dérivée de
`VERIFY_TABLES`). C'est donc le **correctif LAN** qui active la comparaison de
la caisse, et il voyage avec la mise à jour applicative, pas avec un
déploiement Edge. Sa liste déployée ne sert qu'à un client qui n'enverrait rien.

Conséquence assumée : la source locale de `sync-verify` reste **en avance** sur
la déployée. C'est une dérive bénigne (un commentaire et une entrée de défaut),
mais elle doit être connue — le test de contrat compare les **sources**, pas les
déploiements.

## 3. Déploiement

```bash
supabase functions deploy sync-push   --project-ref ltxopwoxvgslsgzixbpx
supabase functions deploy sync-pull   --project-ref ltxopwoxvgslsgzixbpx
supabase functions deploy sync-repair --project-ref ltxopwoxvgslsgzixbpx
# sync-verify : PAS de déploiement (cf. §2)
```

## 4. Vérification après déploiement

1. `supabase functions list` → `sync-push` v10, `sync-pull` v13, `sync-repair` v5
   (et `sync-verify` **reste** v4).
2. Confirmer que la liste déployée contient bien la table :
   re-télécharger dans un répertoire jetable et `grep cash_movements`.
3. **Test ciblé, jamais une synchronisation forcée globale** : depuis le serveur
   LAN de l'école, un cycle de synchronisation normal, puis
   ```sql
   -- Côté Cloud : les 11 mouvements doivent être inchangés
   select count(*), sum(amount) from cash_movements
    where school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a';   -- attendu 11 / 5 685 350
   ```
   et côté LAN, les mêmes 11 lignes.
4. Rapprocher les soldes des deux caisses des deux côtés : **collège 268 850**,
   **complexe 230 680**.

## 5. Retour arrière

### 5.1 Fonctions Edge

Supabase n'offre **pas** de redéploiement d'une version antérieure : `functions
deploy` ne prend pas de numéro de version. Le retour arrière consiste donc à
redéployer une **source**. Deux chemins, tous deux reposant sur des sources
réellement en main :

**Chemin 1 — l'instantané pris avant le déploiement (exact, octet pour octet).**
Les sources déployées ont été téléchargées le 18/10/2026 avant toute
modification, dans
`…/scratchpad/deployed/supabase/functions/<slug>/index.ts`
(`sync-push`, `sync-pull`, `sync-verify`, `sync-repair`). Les recopier à la place
des sources locales et redéployer rend l'état d'avant à l'identique.

> Le bac à sable est propre à la session. **Avant de déployer, copier cet
> instantané dans un emplacement durable** (ou le rejouer par
> `supabase functions download` dans un répertoire jetable : il rendra la version
> alors déployée, c'est-à-dire la nouvelle — d'où l'intérêt de l'instantané pris
> AVANT).

**Chemin 2 — retirer la ligne (équivalent, et toujours disponible).**
L'écart étant d'une seule entrée de liste et d'un commentaire, supprimer
`'cash_movements'` des fichiers concernés puis redéployer reproduit exactement la
liste d'avant. Ce chemin ne dépend d'aucun instantané.

```bash
supabase functions deploy sync-push sync-pull sync-repair \
  --project-ref ltxopwoxvgslsgzixbpx
```

Effet d'un retour arrière : les mouvements de caisse cessent de circuler. Ceux
déjà descendus au LAN **y restent** (rien n'est supprimé), et ceux déjà au Cloud
y restent aussi. On revient à l'état d'avant, sans perte — c'est la propriété
qui rend ce déploiement peu risqué.

### 5.2 Migration de la balance brute

```sql
-- Retour arrière complet, sans perte d'autre chose que la colonne ajoutée :
ALTER TABLE public.cash_movements  DROP COLUMN IF EXISTS source_balance_raw;
ALTER TABLE public.budget_expenses DROP COLUMN IF EXISTS source_balance_raw;
DROP INDEX IF EXISTS public.cash_movements_balance_a_valider_idx;
DROP INDEX IF EXISTS public.budget_expenses_balance_a_valider_idx;
```

La migration ne modifie **aucune donnée existante** : la retirer ramène
exactement à l'état d'avant.

### 5.3 Rejeu de l'import (si autorisé)

Les identifiants étant déduits de l'origine (`src/lib/sourceKey.js`), un rejeu
réécrit les mêmes 71 lignes. Empreinte vérifiée le 18/10/2026 : les champs
métier du SQL régénéré sont **identiques** à ceux de la production
(`md5` par fichier, en ordre numérique de `source_row`). Seule
`source_balance_raw` serait renseignée. Il n'y a donc rien à annuler, sinon la
colonne elle-même (§5.2).

### 5.4 Script de sauvegarde

```sql
DROP FUNCTION IF EXISTS public.backup_snapshot_all();
DROP FUNCTION IF EXISTS public.backup_snapshot_now(uuid);
DROP FUNCTION IF EXISTS public._backup_snapshot(uuid, text);
DROP FUNCTION IF EXISTS public.backup_catalog(uuid);
DROP FUNCTION IF EXISTS public._backup_catalog_internal();
DROP FUNCTION IF EXISTS public._backup_is_excluded(text);
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'notescam-school-backups';
DROP TABLE IF EXISTS public.school_backups;   -- ⚠ emporte les instantanés déjà pris
```

La dernière ligne supprime les sauvegardes elles-mêmes : à ne jouer que si l'on
renonce au dispositif, pas pour corriger un détail.
