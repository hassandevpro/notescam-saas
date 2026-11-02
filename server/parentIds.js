// IDENTIFIANTS DÉTERMINÉS DES DEUX TABLES PARENTS.
//
// LE PIÈGE QUE CECI ÉVITE, et il est documenté depuis `supabase_cash_book.sql`.
// `parent_accounts` porte UNIQUE(user_id) et `parent_student_links` porte
// UNIQUE(parent_user_id, student_id) — des DEUX côtés, LAN et Cloud.
//
// Avec un `id` aléatoire, le même rattachement créé à l'école hors ligne ET en
// ligne par le secrétariat donne deux lignes : même clé naturelle, ids
// différents. Le push bute sur la contrainte, et `sync-push` refuse la ligne —
// pas seulement elle, la TABLE entière sur ce lot. C'est exactement la raison
// pour laquelle `fee_payments.receipt_no` n'a pas d'unique non plus.
//
// LA PARADE : dériver l'id de la clé naturelle. Les deux côtés calculent alors
// le MÊME id, l'upsert écrase au lieu de heurter, et le départage LWW habituel
// s'applique — sans doublon, et sans bloquer la file.
//
// POURQUOI UN NAMESPACE PROPRE. `NS_NOTESCAM_IMPORT` sert aux reprises de
// documents. Un namespace distinct garantit qu'aucun id de lien parent ne
// pourra jamais entrer en collision avec un id de ligne importée, même si les
// deux clés naturelles se ressemblaient par accident.
//
// ⚠️ CES VALEURS SONT UN CONTRAT. Les changer réécrirait tous les ids et
// recréerait les doublons qu'elles suppriment. Le préfixe et l'ordre des
// champs ne se touchent pas.
import { uuidV5 } from '../src/lib/sourceKey.js';

// UUID v5 tiré de la DNS namespace RFC 4122, dédié aux tables parents.
export const NS_NOTESCAM_PARENT = '1b671a64-40d5-491e-99b0-da01ff1f3341';

/** Compte parent — clé naturelle : l'utilisateur authentifié. */
export function idCompteParent(userId) {
  return uuidV5(`parent_account:${String(userId)}`, NS_NOTESCAM_PARENT);
}

/** Rattachement parent → élève — clé naturelle : le couple (parent, élève). */
export function idLienParentEleve(parentUserId, studentId) {
  return uuidV5(`parent_link:${String(parentUserId)}:${String(studentId)}`, NS_NOTESCAM_PARENT);
}
