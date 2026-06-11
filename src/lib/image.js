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
