// Réinitialisation d'un mot de passe en édition LAN — logique pure (aucune
// entrée/sortie hors de la base reçue en argument), éprouvée par
// `_reset_password.test.mjs` et pilotée par `reset-password-cli.mjs`.
//
// POURQUOI CET OUTIL EXISTE. En LAN il n'y a ni serveur d'e-mail ni lien
// « mot de passe oublié » : une école sans Internet dont le directeur oublie
// son mot de passe perd l'accès à TOUTE l'administration. L'application ne
// peut rien y faire — l'écran qui redéfinit un mot de passe exige d'être déjà
// connecté (`admin_set_staff_password`, rpc.js). Seul un outil lancé SUR le PC
// du serveur, par quelqu'un qui a les droits de ce PC, peut rouvrir la porte.
//
// CE QU'IL NE FAIT PAS : il ne révèle aucun mot de passe existant (scrypt est à
// sens unique), il ne réinitialise pas tout le monde d'un coup, il ne touche ni
// aux rôles, ni aux périmètres, ni aux données. Il réécrit UNE empreinte, celle
// du compte nommé — et il le dit.
//
// Installation hybride : rien à faire côté cloud. À la première connexion
// réussie, le serveur réplique lui-même le mot de passe en clair vers le cloud
// (`mirrorToCloud`, index.js /api/auth/login), ou le met en file chiffrée
// jusqu'au retour d'Internet.
import { randomInt } from 'node:crypto';

// Même plancher que `admin_set_staff_password` (server/rpc.js) : un outil de
// secours ne doit pas introduire un mot de passe que l'application refuserait.
export const MIN_LENGTH = 8;

// Alphabet sans caractère ambigu (pas de I/l/1, pas de O/0) : ce mot de passe
// est dicté au téléphone ou recopié d'un bout de papier par l'école.
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
const DIGITS  = '23456789';
const ALL     = LETTERS + DIGITS;

function pick(set) { return set[randomInt(set.length)]; }

// Mot de passe lisible : deux groupes de 5, séparés par un tiret (Kf7mq-Bz3Rp).
// Au moins une majuscule et un chiffre PAR CONSTRUCTION, pour satisfaire aussi
// les règles plus strictes d'un éventuel portail cloud.
export function generatePassword() {
  const chars = Array.from({ length: 10 }, () => pick(ALL));
  chars[0] = pick(LETTERS.slice(0, 24));   // majuscule
  chars[6] = pick(DIGITS);                 // chiffre
  return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`;
}

// Un compte de connexion = une ligne de `users`. Les rôles et l'école viennent
// de `school_users` (un même compte peut servir dans plusieurs écoles d'un
// complexe : on agrège au lieu de dupliquer la ligne).
export function listAccounts(db) {
  return db.prepare(`
    SELECT u.id, u.email, u.full_name,
           (SELECT group_concat(DISTINCT su.role) FROM school_users su
             WHERE su.user_id = u.id) AS roles,
           (SELECT group_concat(DISTINCT s.name) FROM school_users su
              JOIN schools s ON s.id = su.school_id
             WHERE su.user_id = u.id) AS ecoles,
           (SELECT min(su.active) FROM school_users su
             WHERE su.user_id = u.id) AS active,
           EXISTS (SELECT 1 FROM superadmins sa WHERE sa.user_id = u.id) AS superadmin
      FROM users u
     ORDER BY u.email COLLATE NOCASE
  `).all();
}

// `users.email` est déclaré COLLATE NOCASE (schema.sql) : « Directeur@… »
// retrouve bien le compte créé en « directeur@… ». C'est exactement le cas
// d'une école qui ne se souvient plus de la casse de son identifiant.
export function findAccount(db, email) {
  const mail = String(email || '').trim();
  if (!mail) return null;
  return db.prepare('SELECT id, email, full_name FROM users WHERE email = ?').get(mail) || null;
}

// Réécrit l'empreinte du compte. `hashPassword` est injecté (server/security.js)
// : la SEULE source du format `salt:hash` reste scrypt côté serveur — un hachage
// recopié ici dériverait un jour et verrouillerait l'école en silence.
export function resetPassword(db, hashPassword, { email, password }) {
  const pwd = String(password ?? '');
  const user = findAccount(db, email);
  if (!user) throw new Error(`Aucun compte avec cet e-mail : ${String(email || '').trim() || '(vide)'}`);
  if (pwd.length < MIN_LENGTH) {
    throw new Error(`Mot de passe trop court (${MIN_LENGTH} caractères minimum) — rien n'a été modifié.`);
  }
  const info = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(hashPassword(pwd), user.id);
  if (info.changes !== 1) throw new Error("La base n'a pas été modifiée (compte disparu entre-temps ?).");
  return { id: user.id, email: user.email, full_name: user.full_name, password: pwd };
}
