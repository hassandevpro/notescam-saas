// BULLETIN DE MATERNELLE — choix du FORMAT (Classique / Enfantin), des émojis et du visage « non acquis ».
// Module PUR (aucun DOM, aucun store) : tout se teste sans navigateur.
//
// Réglages (tous NULLABLES : une école existante ne change pas tant qu'elle n'a rien choisi) :
//   schools.bulletin_mat_format     'classique' | 'enfantin'      → format par défaut de l'école (absent = classique)
//   classes.bulletin_mat_format     'classique' | 'enfantin' | null → surcharge d'UNE classe (null = défaut de l'école)
//   schools.bulletin_mat_emojis     true | false | null            → émojis dans le format Classique (null = jamais choisi
//                                                                    = comme avant, lettres seules)
//   schools.bulletin_mat_visage_na  'encourageant' | 'triste'      → visage du niveau « non acquis » (absent = défaut du format)
//
// Les niveaux stockés ne changent JAMAIS : A / ECA / NA (ECA s'affiche « IP » en anglais).

export const MAT_FORMAT_CLASSIQUE = 'classique';
export const MAT_FORMAT_ENFANTIN = 'enfantin';
export const MAT_FORMATS = [MAT_FORMAT_CLASSIQUE, MAT_FORMAT_ENFANTIN];
export const MAT_VISAGES_NA = ['encourageant', 'triste'];
export const MAT_NIVEAUX = ['A', 'ECA', 'NA'];

const vrai = (v) => v === true || v === 1 || v === '1' || v === 'true';

/** Format d'UNE classe : sa surcharge, sinon le défaut de l'école, sinon Classique (l'ancien bulletin). */
export function formatMaternelle(school, cls) {
  if (MAT_FORMATS.includes(cls?.bulletin_mat_format)) return cls.bulletin_mat_format;
  if (MAT_FORMATS.includes(school?.bulletin_mat_format)) return school.bulletin_mat_format;
  return MAT_FORMAT_CLASSIQUE;
}

/** La classe suit-elle le défaut de l'école ? (valeur initiale du réglage de classe) */
export const classeSuitLeDefaut = (cls) => !MAT_FORMATS.includes(cls?.bulletin_mat_format);

/**
 * Émojis dans le format CLASSIQUE. Lecture stricte : seul un « oui » explicite les allume. NULL / absent = l'école n'a
 * jamais choisi → l'ancien bulletin, lettres seules, à l'identique. Le format ENFANTIN en porte toujours (c'est son sujet).
 */
export const emojisClassique = (school) => vrai(school?.bulletin_mat_emojis);

/** Faut-il demander à l'école de choisir (information à la première ouverture) ? Colonne présente mais jamais renseignée. */
export const emojisAChoisir = (school) => !!school && 'bulletin_mat_emojis' in school && (school.bulletin_mat_emojis === null || school.bulletin_mat_emojis === undefined);

/** Visage du niveau « non acquis » : réglage de l'école, sinon « un peu triste » (Classique) / « encourageant » (Enfantin). */
export function visageNonAcquis(school, format) {
  const v = school?.bulletin_mat_visage_na;
  if (MAT_VISAGES_NA.includes(v)) return v;
  return format === MAT_FORMAT_ENFANTIN ? 'encourageant' : 'triste';
}

/** Tout ce que le bulletin de CETTE classe doit savoir pour se dessiner. */
export function reglagesMaternelle(school, cls) {
  const format = formatMaternelle(school, cls);
  const enfantin = format === MAT_FORMAT_ENFANTIN;
  return { format, emojis: enfantin ? true : emojisClassique(school), visage: visageNonAcquis(school, format) };
}

// ── Observation proposée selon le niveau (l'observation saisie remplace TOUJOURS la phrase automatique) ──
const OBS_AUTO = {
  A:   { FR: 'Très bien', EN: 'Very good', ES: 'Muy bien' },
  ECA: { FR: 'En progrès', EN: 'Getting there', ES: 'En progreso' },
  NA:  { FR: 'Pratiquons ensemble', EN: 'Let’s practise together', ES: 'Practiquemos juntos' },
};
export function observationAutomatique(niveau, sys = 'FR') {
  const o = OBS_AUTO[niveau];
  return o ? (o[sys] || o.FR) : '';
}
/** L'observation à imprimer : celle de l'enseignant si elle existe, sinon la phrase du niveau, sinon « — ». */
export function observationAffichee(observation, niveau, sys = 'FR') {
  const saisie = String(observation ?? '').trim();
  if (saisie) return saisie;
  return observationAutomatique(niveau, sys) || '—';
}

// ── Palette « arc-en-ciel » des domaines (cyclique) : pastille, fond de carte, liseré ──
export const MAT_ARC_EN_CIEL = [
  { pastille: '#f87171', fond: '#fef2f2', filet: '#fecaca' },   // rouge
  { pastille: '#fb923c', fond: '#fff7ed', filet: '#fed7aa' },   // orange
  { pastille: '#facc15', fond: '#fefce8', filet: '#fde68a' },   // jaune
  { pastille: '#4ade80', fond: '#f0fdf4', filet: '#bbf7d0' },   // vert
  { pastille: '#2dd4bf', fond: '#f0fdfa', filet: '#99f6e4' },   // turquoise
  { pastille: '#60a5fa', fond: '#eff6ff', filet: '#bfdbfe' },   // bleu
  { pastille: '#a78bfa', fond: '#f5f3ff', filet: '#ddd6fe' },   // violet
  { pastille: '#f472b6', fond: '#fdf2f8', filet: '#fbcfe8' },   // rose
];
export const couleurDomaine = (i) => MAT_ARC_EN_CIEL[((Number(i) || 0) % MAT_ARC_EN_CIEL.length + MAT_ARC_EN_CIEL.length) % MAT_ARC_EN_CIEL.length];

// Couleurs FIXES des niveaux (anneau, pastille, lettre) — jamais celles de l'école.
export const MAT_NIVEAU_COULEUR = { A: '#16a34a', ECA: '#f59e0b', NA: '#38bdf8' };
export const MAT_NIVEAU_TEXTE = { A: '#15803d', ECA: '#d97706', NA: '#0ea5e9' };

/** Libellé d'une colonne de niveau dans la langue de l'école. */
export function libelleNiveau(niveau, sys = 'FR') {
  const t = {
    A:   { FR: 'Acquis', EN: 'Achieved', ES: 'Logrado' },
    ECA: { FR: 'En cours', EN: 'In progress', ES: 'En proceso' },
    NA:  { FR: 'Non acquis', EN: 'Not achieved', ES: 'No logrado' },
  }[niveau];
  return t ? (t[sys] || t.FR) : '';
}

/** Hauteur de ligne (px de référence) : la page reste UNE page de 6 à 10 domaines, puis se resserre au-delà. */
export function densiteDomaines(n) {
  const k = Math.max(0, Number(n) || 0);
  if (k <= 10) return 1;
  return Math.max(0.55, 10 / k);
}
