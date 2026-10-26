// DERNIER FILET AVANT L'ENVOI D'UNE MESURE D'USAGE
//
// NotesCam affiche des noms d'élèves, des notes, des montants et des téléphones
// de parents. Rien de cela ne doit sortir de l'école. La règle est de n'envoyer
// que des identifiants techniques — mais une donnée partie ne se reprend pas,
// donc on ne compte pas sur la discipline de l'appelant : ces fonctions font
// respecter la règle même quand quelqu'un se trompe de propriété.
//
// Module PUR : aucun import, aucun accès à `import.meta.env`, donc exécutable
// tel quel sous node (`node src/lib/_analyticsScrub.test.mjs`).

const UUID      = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL     = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const TELEPHONE = /(?:\+?\d[ .\-]?){8,}/;

// Au-delà de cette longueur, une chaîne n'est plus une étiquette : c'est du
// texte libre (une appréciation, l'objet d'une dépense, une note de service),
// et du texte libre peut tout contenir.
const MAX_TEXTE = 64;

// Jetons de nom de propriété dont la valeur est, par nature, personnelle ou
// libre. La comparaison se fait par JETON, jamais par sous-chaîne : « cycle »
// contient « cle », « hôtel » contient « tel » — un `includes` jetterait des
// propriétés parfaitement anodines et on finirait par désactiver le filtre.
const JETONS_INTERDITS = new Set([
  'nom', 'noms', 'prenom', 'prenoms', 'name', 'names', 'surname',
  'email', 'mail', 'courriel', 'phone', 'tel', 'telephone', 'mobile', 'whatsapp',
  'matricule', 'adresse', 'address', 'quartier', 'parent', 'parents', 'tuteur',
  'photo', 'avatar', 'password', 'passe', 'token', 'secret', 'key', 'cle',
  'note', 'notes', 'moyenne', 'appreciation', 'commentaire', 'comment',
  'description', 'libelle', 'label', 'objet', 'titre', 'title',
  'fournisseur', 'supplier', 'recherche', 'search', 'query',
]);

// « fullName » → ['full','name'] ; « school_id » → ['school','id'].
export function jetons(cle = '') {
  return String(cle)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function cleInterdite(cle = '') {
  return jetons(cle).some((j) => JETONS_INTERDITS.has(j));
}

// Le chemin d'une URL, sans origine, sans query, sans ancre. Une URL complète
// porte le domaine ET les paramètres : les deux sont inutiles à la mesure.
export function cheminDeUrl(url = '') {
  const s = String(url);
  try { return new URL(s).pathname; } catch { return s.split('?')[0].split('#')[0]; }
}

// `/app/students/8f3a…-…/notes` → `/app/students/:id/notes`.
// Un identifiant dans l'URL n'est pas un nom, mais il désigne une personne :
// il n'a rien à faire dans un entonnoir de navigation.
export function sanitizePath(pathname = '') {
  const nu = cheminDeUrl(pathname);
  const parts = nu.split('/').map((seg) => {
    if (!seg) return seg;
    if (UUID.test(seg)) return ':id';
    if (/^\d+$/.test(seg)) return ':n';
    if (seg.length > 24) return ':x';      // un segment aussi long n'est pas une route
    return seg;
  });
  return parts.join('/') || '/';
}

// Ne laisse passer que des scalaires jugés sûrs. Tout le reste — objet,
// tableau, fonction, texte libre, adresse, téléphone — est ÉCARTÉ, pas tronqué :
// tronquer un texte libre laisse passer son début, qui est souvent le nom.
export function scrubProps(props = {}, { max = 25 } = {}) {
  const out = {};
  if (!props || typeof props !== 'object') return out;
  for (const [cle, val] of Object.entries(props)) {
    if (Object.keys(out).length >= max) break;
    if (cleInterdite(cle)) continue;
    if (val === null || val === undefined) continue;
    if (typeof val === 'number' || typeof val === 'boolean') { out[cle] = val; continue; }
    if (typeof val !== 'string') continue;
    const v = val.trim();
    if (!v) continue;
    if (UUID.test(v)) { out[cle] = v; continue; }   // identifiant technique : c'est précisément ce qu'on veut
    if (v.length > MAX_TEXTE) continue;
    if (EMAIL.test(v) || TELEPHONE.test(v)) continue;
    out[cle] = v;
  }
  return out;
}
