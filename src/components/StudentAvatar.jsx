// Avatar d'élève réutilisable : affiche la photo si disponible, sinon une
// silhouette « profil » neutre par défaut. Utilisé dans la liste élèves, la
// fiche élève et l'aperçu du formulaire pour un rendu homogène.
//
// @param {object}  student   doit exposer `photo_url` (peut aussi être une URL
//                            d'aperçu local côté formulaire).
// @param {number}  size      diamètre en px (défaut 32).
// @param {boolean} square    coins arrondis carrés (rounded-2xl) au lieu de rond.
// @param {string}  className  classes additionnelles éventuelles.
export default function StudentAvatar({ student, size = 32, square = false, className = '' }) {
  const radius = square ? 'rounded-2xl' : 'rounded-full';

  if (student?.photo_url) {
    return (
      <img
        src={student.photo_url}
        alt=""
        loading="lazy"
        className={`object-cover shrink-0 border border-gray-200 ${radius} ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center shrink-0 bg-gray-100 text-gray-400 border border-gray-200 ${radius} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: Math.round(size * 0.62), height: Math.round(size * 0.62) }}>
        <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5z" />
      </svg>
    </div>
  );
}
