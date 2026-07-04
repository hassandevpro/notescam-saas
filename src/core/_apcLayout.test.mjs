// Validation du MOTEUR DE MISE EN PAGE du bulletin APC premier cycle
// (src/core/apcLayout.js) — section 10 du cahier des charges « moteur PDF APC ».
//
// On vérifie, pour 6e / 5e / 4e / 3e avec le nombre MAXIMAL de matières APC
// officielles :
//   ✓ police ≥ 10 pt (jamais en dessous — lisibilité prioritaire) ;
//   ✓ deux pages maximum pour une charge officielle réaliste ;
//   ✓ aucune compétence perdue ni dupliquée à la pagination ;
//   ✓ continuité « (suite) » cohérente quand une matière est scindée ;
//   ✓ pied (TOTAL + synthèse) sur la DERNIÈRE page ;
//   ✓ pages équilibrées (pas de « page 1 = 80 %, page 2 = 20 % »).
// Plus un cas EXTRÊME (charge ingérable) : le moteur reste à ≥ 10 pt même s'il doit
// produire plus de 2 pages (repli best-effort, lisibilité avant densité).
//
// Pur (aucune dépendance React/DOM) : exécutable via `node src/core/_apcLayout.test.mjs`.

import { planApcLayout } from './apcLayout.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// Fabrique une matière APC : `n` compétences dont l'intitulé fait ~`len` caractères
// (les intitulés officiels sont longs et s'enroulent sur 2 lignes dans la colonne).
let uid = 0;
const long = (len) => 'Mobiliser des ressources pour résoudre une situation problème '.padEnd(len, 'x').slice(0, len);
const matiere = (nom, n, len = 62) => ({
  id: `m${uid++}`, nom, coef: 2, enseignant: 'M. Test',
  competences: Array.from({ length: n }, (_, i) => ({ intitule: `${i + 1}. ${long(len)}`, note: 12 })),
  moyenne: 12, ponderee: 24, cote: 'CA',
});

// Charge officielle réaliste d'un premier cycle : 13 matières, 2 à 4 compétences
// chacune (≈ 39 compétences), intitulés de longueur variable. Représentative de 6e→3e.
function officialLoad() {
  uid = 0;
  const noms = [
    'Français', 'Anglais', 'Mathématiques', 'SVTEEHB', 'PCT', 'Histoire',
    'Géographie', 'ECM', 'Informatique', 'EPS', 'ESF', 'Travail manuel', 'Langues nationales',
  ];
  const counts = [4, 3, 4, 3, 3, 2, 2, 2, 3, 2, 3, 3, 3];   // ≈ 37 compétences
  return noms.map((nom, i) => matiere(nom, counts[i], 60 + (i % 3) * 12));
}

// Aplati toutes les compétences rendues (toutes pages, tous chunks) → détecte
// pertes / doublons introduits par la pagination.
const flatComps = (pages) => pages.flatMap((pg) => pg.flatMap((ch) => ch.comps));

// Vérifie la cohérence des marqueurs de continuation « (suite) ».
function checkContinuations(pages) {
  const byId = new Map();   // matiereId → chunks dans l'ordre des pages
  pages.forEach((pg) => pg.forEach((ch) => {
    if (!byId.has(ch.m.id)) byId.set(ch.m.id, []);
    byId.get(ch.m.id).push(ch);
  }));
  for (const chunks of byId.values()) {
    if (chunks.length === 1) {
      if (chunks[0].contFromPrev || chunks[0].contToNext) return false;   // pas de suite parasite
      continue;
    }
    // Scindée : le 1er marque contToNext, le dernier marque contFromPrev.
    if (!chunks[0].contToNext) return false;
    if (!chunks[chunks.length - 1].contFromPrev) return false;
  }
  return true;
}

for (const classe of ['6e', '5e', '4e', '3e']) {
  const matieres = officialLoad();
  const totalComps = matieres.reduce((a, m) => a + m.competences.length, 0);
  const { fontPt, pages, footerPageIndex, totalPages } = planApcLayout(matieres);

  ok(fontPt >= 10, `${classe} : police ${fontPt}pt ≥ 10pt (lisibilité)`);
  ok(totalPages <= 2, `${classe} : ${totalPages} page(s) ≤ 2 (charge officielle)`);
  ok(pages.length === totalPages, `${classe} : cohérence pages.length == totalPages`);

  const flat = flatComps(pages);
  ok(flat.length === totalComps, `${classe} : ${flat.length}/${totalComps} compétences (aucune perte ni doublon)`);

  ok(footerPageIndex === totalPages - 1, `${classe} : pied sur la dernière page (index ${footerPageIndex})`);
  ok(checkContinuations(pages), `${classe} : marqueurs « (suite) » cohérents`);

  // Équilibrage (section 4) : sur 2 pages, aucune page ne doit être quasi vide.
  if (totalPages === 2) {
    const comps0 = pages[0].reduce((a, ch) => a + ch.comps.length, 0);
    const comps1 = pages[1].reduce((a, ch) => a + ch.comps.length, 0);
    ok(comps0 > 0 && comps1 > 0, `${classe} : les 2 pages portent des matières (p1=${comps0}, p2=${comps1} comp.)`);
    // Pas de déséquilibre extrême type 80/20 : la page la moins remplie garde ≥ 25 %
    // des compétences (la page 2 porte en plus le pied, d'où le seuil souple).
    const ratio = Math.min(comps0, comps1) / (comps0 + comps1);
    ok(ratio >= 0.22, `${classe} : équilibre raisonnable (part min = ${(ratio * 100).toFixed(0)} %)`);
  }
}

// Cas 1 page : charge légère (3 matières courtes) → doit tenir sur 1 page à 11pt.
{
  uid = 0;
  const light = [matiere('Français', 2, 40), matiere('Maths', 2, 40), matiere('Anglais', 1, 40)];
  const { fontPt, totalPages, footerPageIndex } = planApcLayout(light);
  ok(totalPages === 1, `Charge légère : 1 page (obtenu ${totalPages})`);
  ok(fontPt >= 10, `Charge légère : police ${fontPt}pt ≥ 10pt`);
  ok(footerPageIndex === 0, 'Charge légère : pied sur la page 1');
}

// Cas EXTRÊME : charge ingérable (25 matières × 6 compétences très longues).
// Le moteur PEUT dépasser 2 pages mais NE DOIT JAMAIS descendre sous 10pt.
{
  uid = 0;
  const heavy = Array.from({ length: 25 }, (_, i) => matiere(`Matière ${i + 1}`, 6, 90));
  const totalComps = heavy.reduce((a, m) => a + m.competences.length, 0);
  const { fontPt, pages, footerPageIndex, totalPages } = planApcLayout(heavy);
  ok(fontPt >= 10, `Charge extrême : police ${fontPt}pt ≥ 10pt (lisibilité avant densité)`);
  ok(flatComps(pages).length === totalComps, `Charge extrême : ${totalComps} compétences préservées`);
  ok(footerPageIndex === totalPages - 1, 'Charge extrême : pied sur la dernière page');
  console.log(`   ↳ charge extrême rendue sur ${totalPages} page(s) à ${fontPt}pt (repli best-effort)`);
}

console.log(failed ? '\n❌ DES TESTS DE MISE EN PAGE ONT ÉCHOUÉ' : '\n✅ Tous les tests de mise en page APC passent');
process.exit(failed ? 1 : 0);
