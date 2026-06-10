// Textes marketing bilingues (FR = Cameroun, ES = Guinée Équatoriale).
// La composition reçoit `lang` en prop → on choisit le bloc correspondant.
export const CONTENT = {
  fr: {
    tagline: 'La gestion scolaire, simplifiée.',
    problem: {
      time: '23h00',
      line: 'Vous faites encore les bulletins à la main ?',
    },
    featuresTitle: 'NotesCam fait le travail à votre place',
    features: [
      { icon: '📄', text: 'Bulletins de toute une classe en 4 minutes' },
      { icon: '📶', text: 'Fonctionne hors-ligne, synchronise au retour du réseau' },
      { icon: '💳', text: 'Frais scolaires suivis en temps réel' },
      { icon: '💬', text: 'Résultats envoyés aux parents par WhatsApp' },
    ],
    proof: [
      { value: '37', label: 'écoles nous font confiance' },
      { value: '94%', label: 'des directeurs recommandent' },
      { value: '8 h', label: 'économisées chaque semaine' },
    ],
    cta: {
      line1: 'Essai gratuit',
      line2: 'sans carte bancaire',
      url: 'notescam.vercel.app',
    },
  },
  es: {
    tagline: 'La gestión escolar, simplificada.',
    problem: {
      time: '23:00',
      line: '¿Todavía haces los boletines a mano?',
    },
    featuresTitle: 'NotesCam trabaja por ti',
    features: [
      { icon: '📄', text: 'Boletines de toda una clase en 4 minutos' },
      { icon: '📶', text: 'Funciona sin conexión, sincroniza al volver la red' },
      { icon: '💳', text: 'Tasas escolares con seguimiento en tiempo real' },
      { icon: '💬', text: 'Resultados enviados a las familias por WhatsApp' },
    ],
    proof: [
      { value: '37', label: 'centros confían en nosotros' },
      { value: '94%', label: 'de los directores lo recomiendan' },
      { value: '8 h', label: 'ahorradas cada semana' },
    ],
    cta: {
      line1: 'Prueba gratis',
      line2: 'sin tarjeta bancaria',
      url: 'notescam.vercel.app',
    },
  },
};
