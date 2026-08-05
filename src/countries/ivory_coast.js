// Côte d'Ivoire — système francophone /20.
// Réutilise la structure pédagogique du Cameroun francophone (cycles, périodes,
// évaluation /20) et ne redéfinit que l'identité pays + l'en-tête officiel,
// mono-langue (français). Aucun module existant n'est modifié.

import { cameroonFr } from './cameroon_fr.js';

export const ivoryCoast = {
  ...cameroonFr,
  code: 'ivory_coast',
  name: "Côte d'Ivoire",
  flag: '🇨🇮',

  officials: {
    primary: {
      republic:    "RÉPUBLIQUE DE CÔTE D'IVOIRE",
      motto:       'Union – Discipline – Travail',
      ministry:    "Ministère de l'Éducation Nationale et de l'Alphabétisation",
      delegations: ['Direction Régionale {region}', 'Direction Départementale {division}'],
      estLabel:    'Établissement N° :',
    },
    secondary: null, // mono-langue
  },
};
