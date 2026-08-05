// Gabon — système francophone /20.
// Même structure pédagogique que le Cameroun francophone ; seul l'en-tête
// officiel (mono-langue) et l'identité pays changent.

import { cameroonFr } from './cameroon_fr.js';

export const gabon = {
  ...cameroonFr,
  code: 'gabon',
  name: 'Gabon',
  flag: '🇬🇦',

  officials: {
    primary: {
      republic:    'RÉPUBLIQUE GABONAISE',
      motto:       'Union – Travail – Justice',
      ministry:    "Ministère de l'Éducation Nationale",
      delegations: ['Direction Académique Provinciale {region}', 'Inspection Déléguée {division}'],
      estLabel:    'Établissement N° :',
    },
    secondary: null,
  },
};
