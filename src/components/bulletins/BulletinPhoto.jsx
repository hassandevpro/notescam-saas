// Emplacement photo des bulletins (contexte impression).
// Affiche la photo de l'élève si disponible, sinon une silhouette « profil »
// neutre par défaut — même rendu que StudentAvatar, mais en cadre rectangulaire
// (type photo d'identité) avec styles inline pour fiabilité à l'impression.
//
// @param {string} src     student.photo_url (ou null)
// @param {number} width   largeur px (défaut 56)
// @param {number} height  hauteur px (défaut 70)
// @param {number} radius  arrondi px (défaut 4)
import { useSignedUrl } from '../AssetImg';

export default function BulletinPhoto({ src, width = 56, height = 70, radius = 4 }) {
  const frame = { width, height, border: '1px solid #9ca3af', borderRadius: radius, flexShrink: 0 };
  const resolved = useSignedUrl(src); // URL signée (sécurité C2), repli sur l'origine

  if (resolved) {
    return <img src={resolved} alt="" style={{ ...frame, objectFit: 'cover' }} />;
  }

  const icon = Math.round(Math.min(width, height) * 0.62);
  return (
    <div style={{ ...frame, background: '#f3f4f6', color: '#9ca3af', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: icon, height: icon }}>
        <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5z" />
      </svg>
    </div>
  );
}
