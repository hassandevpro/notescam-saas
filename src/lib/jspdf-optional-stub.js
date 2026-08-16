// Bouchon pour les dépendances OPTIONNELLES de jsPDF.
//
// jsPDF importe dynamiquement `html2canvas`, `canvg` et `dompurify` pour sa
// méthode `jsPDF.html()` — une méthode que cette application n'appelle nulle
// part : elle n'utilise que `addImage` (cartes scolaires, palmarès, tableaux
// d'honneur). Ces trois paquets représentaient pourtant 366 Ko de morceaux
// construits ET précachés par le service worker sur chaque poste.
//
// L'alias de `vite.config.js` les remplace par ce fichier. Si `jsPDF.html()`
// venait à être utilisé un jour, l'erreur ci-dessous dit exactement quoi faire
// plutôt que d'échouer sans explication.
const message =
  'jsPDF.html() nécessite html2canvas / canvg / dompurify, neutralisés dans '
  + 'vite.config.js (voir src/lib/jspdf-optional-stub.js). '
  + "Cette application n'utilise que jsPDF.addImage — si vous avez besoin de "
  + "jsPDF.html(), retirez l'alias correspondant.";

function unavailable() {
  throw new Error(message);
}

export default unavailable;
export const html2canvas = unavailable;
export const Canvg = unavailable;
export const sanitize = unavailable;
