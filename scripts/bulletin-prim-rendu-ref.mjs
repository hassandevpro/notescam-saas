// Rendu de référence des bulletins PRIMAIRES (3 dispositions du carnet) pour comparer AVANT/APRÈS un refactor.
// NC_OUT = dossier de sortie. Données fictives.
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs scripts/bulletin-prim-rendu-ref.mjs
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement } = require('react');
globalThis.__VITE_ENV__ = {};
const SRC = new URL('../src/', import.meta.url).href;
const OUT = process.env.NC_OUT; mkdirSync(OUT, { recursive: true });
const { default: Compact } = await import(`${SRC}components/bulletins/BulletinPrimCompact.jsx`);

const school = { id: 's', name: 'ÉCOLE TEST', country_code: 'cameroon', current_year: '2026-2027' };
const student = { id: 'e', name: 'AKATEU MEGNE Indira Falida', matricule: 'P260048', gender: 'F' };
const rows = Array.from({ length: 9 }, (_, i) => ({
  code: `${i + 1}A`, intitule: `Compétence ${i + 1}`, parCritere: { oral: { note: 7, max: 10 }, ecrit: { note: 12, max: 20 } },
  achieved: 19 + i, possible: 30, cote: ['A+', 'A', 'ECA', 'NA'][i % 4], appreciation: 'Acquis',
}));
const base = {
  school, cls: { name: 'CM2' }, student, sys: 'FR', effectif: 26, periodLabel: 'Séquence 1',
  critereColumns: [{ id: 'oral', nom: 'Oral' }, { id: 'ecrit', nom: 'Écrit' }], rows,
  overall: { achieved: 260.5, possible: 400, pct: 65, evaluees: 9, nonEvaluees: 0 },
  moyenneGenerale: 13.03, coteGenerale: 'ECA', appreciationGenerale: 'En cours d’acquisition', decision: 'Admis',
  rank: 19, observations: 'Peut mieux faire.', coteBareme: [{ cote: 'A+', libelle: 'Très bien acquis', seuil_min: 90 }, { cote: 'A', libelle: 'Acquis', seuil_min: 70 }, { cote: 'ECA', libelle: 'En cours', seuil_min: 50 }, { cote: 'NA', libelle: 'Non acquis', seuil_min: 0 }],
  mentions: { avertissement: 'non', tableauHonneur: 'non', encouragement: 'non', felicitation: 'non' },
  statsClasse: { premier: 17.74, dernier: 11.79, generale: 15.25, reussis: 25, echoues: 0, reussite: 100 },
  repartition: [[0, 3.99], [4, 5.99], [6, 7.99], [8, 9.99], [10, 11.99], [12, 13.99], [14, 15.99], [16, 17.99], [18, 20]].map(([a, b], i) => ({ label: `[${a}-${b}]`, n: i })),
  repartitionTotal: 36, signatureParent: true, groupes: true, titulaire: 'ATEBA TONJON CYNTHIA',
};
let n = 0;
for (const disposition of ['criteres', 'epreuves', 'matieres']) {
  for (const variante of ['plein', 'sansRang', 'sansStats']) {
    const p = { ...base, disposition, ...(variante === 'sansRang' ? { masquerRang: true } : {}), ...(variante === 'sansStats' ? { statsClasse: null, mentions: undefined, repartition: [] } : {}) };
    writeFileSync(join(OUT, `${disposition}-${variante}.html`), renderToStaticMarkup(createElement(Compact, p)), 'utf8');
    n += 1;
  }
}
console.log(`${n} rendus écrits`);
