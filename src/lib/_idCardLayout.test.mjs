// Test de la géométrie de la planche A4 des cartes scolaires.
// Vérifie que la pose des images préserve l'aspect (donc AUCUN étirement /
// reflux du texte) et que les positions/pages sont exactes. Pur, sans navigateur.
//
// NB : un test de différence visuelle pixel-à-pixel (aperçu vs PDF) nécessite un
// navigateur headless (Playwright) — non couvert ici ; cette suite verrouille la
// partie déterministe (placement + ratio). Voir idCardPdf.js pour le rendu fidèle.
import { buildLayout, A4 } from './idCardLayout.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const ratio = 660 / 416;
const L = buildLayout({ count: 10, ratio });

// 1) Ratio préservé : la carte posée a exactement l'aspect de l'aperçu.
ok(near(L.cardW / L.cardH, ratio), 'aspect carte == aspect aperçu (pas d\'étirement)');
ok(near(L.cardW, 89), `largeur carte = 89mm (obtenu ${L.cardW.toFixed(2)})`);

// 2) Pagination.
ok(L.perPage === 8, '8 cartes par page (2×4)');
ok(L.pages === 2, '10 cartes → 2 pages');
ok(L.slots.length === 10, '10 emplacements générés');

// 3) Positions de la première page.
ok(near(L.slots[0].x, 12) && near(L.slots[0].y, 12), 'carte 0 en haut-gauche (12,12)');
ok(near(L.slots[1].x, 12 + L.cardW + 8) && near(L.slots[1].y, 12), 'carte 1 à droite, même ligne');
ok(L.slots[1].page === 0 && L.slots[7].page === 0, 'cartes 1 et 7 sur page 0');
ok(L.slots[8].page === 1 && near(L.slots[8].x, 12) && near(L.slots[8].y, 12), 'carte 8 → page 1, haut-gauche');

// 4) Tout tient dans la page (marges respectées).
const inside = L.slots.every((s) =>
  s.x >= 12 - 1e-9 &&
  s.y >= 12 - 1e-9 &&
  s.x + s.w <= A4.w - 12 + 1e-6 &&
  s.y + s.h <= A4.h - 12 + 1e-6
);
ok(inside, 'toutes les cartes dans les marges A4');

// 5) Aucun chevauchement entre cartes d'une même page.
let overlap = false;
for (let i = 0; i < L.slots.length; i++) {
  for (let j = i + 1; j < L.slots.length; j++) {
    const a = L.slots[i], b = L.slots[j];
    if (a.page !== b.page) continue;
    const sep = a.x + a.w <= b.x + 1e-9 || b.x + b.w <= a.x + 1e-9 ||
                a.y + a.h <= b.y + 1e-9 || b.y + b.h <= a.y + 1e-9;
    if (!sep) overlap = true;
  }
}
ok(!overlap, 'aucun chevauchement de cartes');

console.log(failed ? '\n❌ ÉCHEC' : '\n✅ OK');
process.exit(failed ? 1 : 0);
