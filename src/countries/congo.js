// Congo (Brazzaville) — système francophone /20.
// Même structure pédagogique que le Cameroun francophone ; seul l'en-tête
// officiel (mono-langue) et l'identité pays changent.

import { cameroonFr } from './cameroon_fr';

export const congo = {
  ...cameroonFr,
  code: 'congo',
  name: 'Congo — Brazzaville',
  flag: '🇨🇬',

  officials: {
    primary: {
      republic:    'RÉPUBLIQUE DU CONGO',
      motto:       'Unité – Travail – Progrès',
      ministry:    "Ministère de l'Enseignement Préscolaire, Primaire, Secondaire et de l'Alphabétisation",
      delegations: ['Direction Départementale {region}', 'Circonscription Scolaire {division}'],
      estLabel:    'Établissement N° :',
    },
    secondary: null,
  },
};
