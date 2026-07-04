# Module Profil utilisateur

Système de profil professionnel pour les comptes du personnel (administrateur,
censeur, surveillant, enseignant). Apporte photo de profil, menu utilisateur
dans l'en-tête, page profil dédiée et horodatage des connexions.

## Vue d'ensemble

| Besoin | Implémentation |
| --- | --- |
| Champs de profil (photo, tél., dernière connexion…) | colonnes ajoutées à `school_users` |
| Modifier son profil | RPC `update_my_profile`, `set_my_photo` (self-only) |
| Photo (upload/remplacement/suppression) | bucket `school-assets/<school_id>/users/<user_id>.jpg` |
| Avatar par défaut | initiales sur dégradé, sinon silhouette |
| Accès rapide | menu utilisateur en haut à droite (profil + déconnexion) + carte mobile (MoreSheet) |
| Langue | sélecteur déplacé dans l'en-tête, à côté de la date (`LanguageMenu.jsx`) |
| Dernière connexion | RPC `touch_my_last_login` appelée après login |

## Base de données — `supabase_user_profile.sql`

Colonnes ajoutées à `public.school_users` (100 % additif, rétro-compatible) :

- `phone text`
- `photo_url text`
- `last_login_at timestamptz`
- `created_at timestamptz default now()` (repli pour les comptes existants)

RPC `SECURITY DEFINER` (écriture directe sur `school_users` révoquée par
`supabase_security_hardening.sql` → tout passe par des fonctions contrôlées) :

- `update_my_profile(p_full_name, p_phone)` — met à jour son nom + téléphone
  (+ miroir sur la fiche `teachers` liée).
- `set_my_photo(p_photo_url)` — définit/retire sa photo (NULL = retrait).
  Séparée pour ne jamais effacer la photo lors d'une simple édition du nom.
- `touch_my_last_login()` — horodate la dernière connexion.

Chaque RPC n'agit que sur la ligne de `auth.uid()` : un utilisateur ne peut
modifier QUE son propre profil. Les administrateurs ne peuvent pas modifier le
profil d'un autre compte via ce module (la gestion des autres comptes reste dans
les pages Enseignants / Personnel).

> ⚠️ À exécuter une fois dans l'éditeur SQL Supabase. **Avant** la migration, le
> code retombe automatiquement sur l'ancienne sélection de colonnes
> (`getCurrentUserContext`) : aucune connexion n'est cassée.

## Routes

- `GET /app/profile` — page « Mon profil » (tous les rôles du personnel).
  Paramètres d'URL pris en charge (deep-links depuis le menu) :
  `?edit=1` (ouvre l'édition), `?photo=1` (ouvre le sélecteur de photo),
  `?password=1` (ouvre le changement de mot de passe).

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `supabase_user_profile.sql` | migration (colonnes + RPC) |
| `src/lib/userProfileService.js` | `updateMyProfile`, `uploadMyPhoto`, `removeMyPhoto`, `touchLastLogin` |
| `src/lib/image.js` | `validateImageFile`, `resizeImageToSquare` (formats jpg/jpeg/png/webp, compression) |
| `src/lib/roleLabel.js` | libellé traduit d'un rôle (réutilisé partout) |
| `src/components/UserAvatar.jsx` | avatar (photo / initiales / silhouette) |
| `src/components/UserMenu.jsx` | menu déroulant de l'en-tête (profil + déconnexion) |
| `src/components/LanguageMenu.jsx` | sélecteur de langue de l'en-tête |
| `src/pages/Profile.jsx` | page profil (infos, photo, mot de passe) |
| `src/store/authStore.js` | champs `phone/photoUrl/lastLogin/createdAt/specialty` + `applyProfile` |
| `src/lib/auth.js` | `getCurrentUserContext` charge les champs de profil (avec repli) |

## Photo de profil

- Formats acceptés : **jpg, jpeg, png, webp** (validation MIME + extension).
- Recadrage carré centré + compression JPEG 400×400 côté client
  (`resizeImageToSquare`) avant upload → léger même en 3G/LAN.
- Chemin déterministe : un fichier par compte, remplacé à chaque upload.
- Suppression = retire le fichier du stockage + met `photo_url` à NULL.
- Avatar par défaut si aucune photo : initiales sur dégradé brand→violet,
  silhouette neutre si le nom est inconnu.

## En-tête responsive (rappel)

Le bas de la sidebar (ancienne carte profil + langue + déconnexion) a été
**retiré** : il faisait doublon avec le menu utilisateur de l'en-tête. La langue
est désormais dans l'en-tête à côté de la date.

Le menu utilisateur masque le nom sous le breakpoint `sm` (seuls photo +
chevron restent) ; le nom de l'établissement utilise `truncate`/`min-w-0`. La
carte scolaire (`IdCard.jsx`) borne le nom d'établissement (3 lignes max,
ellipsis, police adaptative, `title` au survol) pour éviter tout débordement de
son en-tête.
