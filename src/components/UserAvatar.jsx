// Avatar du compte utilisateur (personnel : admin/censeur/surveillant/
// enseignant). Affiche la photo de profil si disponible, sinon un avatar par
// défaut élégant : les initiales sur un dégradé (cohérent avec la pastille de la
// sidebar) ou une silhouette neutre si le nom est inconnu.
//
// @param {string} name      nom complet (sert aux initiales + alt).
// @param {string} photoUrl  URL de la photo (optionnelle).
// @param {number} size      diamètre en px (défaut 36).
// @param {string} className classes additionnelles éventuelles.
// @param {boolean} ring     ajoute un anneau blanc (utile sur fonds colorés).
export default function UserAvatar({ name, photoUrl, size = 36, className = '', ring = false }) {
  const ringCls = ring ? 'ring-2 ring-white shadow-sm' : '';

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name || ''}
        loading="lazy"
        className={`object-cover shrink-0 rounded-full border border-slate-200 ${ringCls} ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  const initials = name
    ? name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : '';

  if (initials) {
    return (
      <div
        className={`flex items-center justify-center shrink-0 rounded-full bg-gradient-to-br from-brand-500 to-purple-500 text-white font-bold ${ringCls} ${className}`}
        style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.4)) }}
        aria-hidden="true"
      >
        {initials}
      </div>
    );
  }

  // Repli silhouette (aucun nom connu).
  return (
    <div
      className={`flex items-center justify-center shrink-0 rounded-full bg-slate-100 text-slate-400 border border-slate-200 ${ringCls} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: Math.round(size * 0.62), height: Math.round(size * 0.62) }}>
        <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5z" />
      </svg>
    </div>
  );
}
