// Traitement d'image côté client pour les photos d'élèves.
//
// Les photos prises au téléphone pèsent souvent plusieurs Mo : on les
// redimensionne et recadre en carré JPEG AVANT l'upload. Bénéfices :
//   • upload rapide même en 3G / LAN ;
//   • stockage léger (bucket school-assets) ;
//   • rendu net dans les avatars ronds, cartes scolaires et bulletins.

// Recadre au centre en carré puis réduit à `size`×`size`, encode en JPEG.
// Respecte l'orientation EXIF des photos de téléphone (imageOrientation).
// @returns {Promise<Blob>} blob JPEG prêt à uploader.
export async function resizeImageToSquare(file, size = 400, quality = 0.82) {
  if (!file) throw new Error('resizeImageToSquare : fichier manquant.');

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('resizeImageToSquare : encodage JPEG impossible.');
  return blob;
}

// Formats image acceptés pour les photos de profil / d'élève.
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
export const ACCEPTED_IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp'];
const MAX_IMAGE_BYTES = 12 * 1024 * 1024; // 12 Mo en entrée (recompressé ensuite)

// Valide un fichier image AVANT traitement/upload. Vérifie le type MIME (avec
// repli sur l'extension, certains navigateurs/OS laissant le type vide) et la
// taille brute. Renvoie { ok, error } — `error` est un message déjà lisible.
export function validateImageFile(file) {
  if (!file) return { ok: false, error: 'Aucun fichier sélectionné.' };
  const ext = (file.name?.split('.').pop() || '').toLowerCase();
  const typeOk = file.type
    ? ACCEPTED_IMAGE_TYPES.includes(file.type.toLowerCase())
    : ACCEPTED_IMAGE_EXT.includes(ext);
  if (!typeOk) {
    return { ok: false, error: 'Format non supporté. Utilisez JPG, PNG ou WEBP.' };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'Image trop volumineuse (12 Mo max).' };
  }
  return { ok: true, error: null };
}
