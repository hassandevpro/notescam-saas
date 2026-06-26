// Cameroun — Enseignement Technique Industriel. Filières (séries) F2
// (Électronique), F3 (Électrotechnique), F4 (Génie Civil) × 3 niveaux
// (Seconde / Première / Terminale). Jeu de départ représentatif — l'admin
// ajoute/retire des filières et matières après génération (#6).

const S = (rows) => rows.map(([name, coef, opts = {}]) => ({ name, coef, ...opts }));

// Tronc commun (matières générales) de l'enseignement technique industriel.
const GENERAL = [
  ['Français', 2], ['Anglais', 2], ['Mathématiques', 4], ['Sciences Physiques', 3],
  ['Histoire-Géographie', 1], ['ECM', 1], ['EPS', 1], ['Informatique', 2],
];

// Matières professionnelles par filière.
const PRO = {
  F2: [['Électronique', 6], ['Technologie (Électronique)', 4], ['Dessin Technique', 3], ['Travaux Pratiques (Atelier)', 4]],
  F3: [['Électrotechnique', 6], ['Technologie (Électrotechnique)', 4], ['Dessin Technique', 3], ['Travaux Pratiques (Atelier)', 4]],
  F4: [['Génie Civil', 6], ['Béton Armé / Construction', 4], ['Dessin de Bâtiment', 3], ['Travaux Pratiques (Chantier)', 4]],
};

const FILIERES = [
  { code: 'F2', label: 'Électronique' },
  { code: 'F3', label: 'Électrotechnique' },
  { code: 'F4', label: 'Génie Civil' },
];
const LEVELS = ['Seconde', 'Première', 'Terminale'];

const classes = [];
for (const f of FILIERES) {
  for (const lvl of LEVELS) {
    classes.push({
      name: `${lvl} ${f.code}`,
      level: `${lvl} ${f.code}`,
      section: f.code,
      cycle: 'secondaire',
      system: 'FR',
      subjects: S([...GENERAL, ...PRO[f.code]]),
    });
  }
}

export default {
  id: 'cameroon_technical_industrial',
  country: 'cameroon',
  type: 'technical_industrial',
  label: { fr: 'Cameroun – Technique Industriel', en: 'Cameroon – Industrial Technical', es: 'Camerún – Técnico Industrial' },
  description: { fr: 'Filières F2, F3, F4 (Seconde → Terminale).', en: 'Streams F2, F3, F4.', es: 'Series F2, F3, F4.' },
  defaultSystem: 'FR',
  classes,
};
