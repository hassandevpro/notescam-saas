// Cameroun — Enseignement Technique Commercial. Séries G1 (Techniques
// administratives), G2 (Techniques quantitatives de gestion), G3 (Commerce)
// × 3 niveaux. Jeu de départ représentatif — ajustable après génération (#6).

const S = (rows) => rows.map(([name, coef, opts = {}]) => ({ name, coef, ...opts }));

const GENERAL = [
  ['Français', 2], ['Anglais', 2], ['Mathématiques', 3], ['Histoire-Géographie', 1],
  ['ECM', 1], ['EPS', 1], ['Informatique', 2],
];

const PRO = {
  G1: [['Techniques Administratives', 5], ['Comptabilité', 4], ['Droit', 3], ['Économie', 3], ['OGE', 2]],
  G2: [['Comptabilité', 5], ['Mathématiques Financières', 4], ['Économie', 3], ['Droit', 3], ['Statistiques', 3]],
  G3: [['Commerce / Vente', 5], ['Comptabilité', 3], ['Économie', 3], ['Droit', 3], ['Marketing', 3]],
};

const FILIERES = [
  { code: 'G1', label: 'Techniques administratives' },
  { code: 'G2', label: 'Techniques quantitatives de gestion' },
  { code: 'G3', label: 'Commerce' },
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
  id: 'cameroon_technical_commercial',
  country: 'cameroon',
  type: 'technical_commercial',
  label: { fr: 'Cameroun – Technique Commercial', en: 'Cameroon – Commercial Technical', es: 'Camerún – Técnico Comercial' },
  description: { fr: 'Séries G1, G2, G3 (Seconde → Terminale).', en: 'Streams G1, G2, G3.', es: 'Series G1, G2, G3.' },
  defaultSystem: 'FR',
  classes,
};
