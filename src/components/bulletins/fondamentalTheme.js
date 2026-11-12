// IDENTITÉ VISUELLE DES BULLETINS DU FONDAMENTAL (maternelle ET primaire) — un seul endroit.
//
// Avant : le primaire portait ses couleurs en constantes locales, la maternelle les siennes (violet, coins
// arrondis, émojis). Deux bulletins du même ministère (MINEDUB) ne se ressemblaient donc pas, et une correction de
// style faite d'un côté n'arrivait jamais de l'autre. Désormais les deux lisent CE fichier.
//
// Les valeurs sont celles que le primaire utilisait déjà : le bulletin du primaire ne change pas d'un pixel.

export const FOND_ACCENT = '#047857';
export const FOND_TH_BG  = '#d1fae5';
export const FOND_TH_TXT = '#065f46';

// Couleur d'une cote (primaire : A+/A/ECA/NA ; maternelle : A/ECA/NA — mêmes teintes pour les mêmes lettres).
export const FOND_COTE_COLORS = { 'A+': '#059669', A: '#10b981', ECA: '#f59e0b', NA: '#ef4444' };
