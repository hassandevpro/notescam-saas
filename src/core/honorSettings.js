// RÉGLAGES DES TABLEAUX D'HONNEUR — logique pure.
//
// Décisions (responsable, 2026-11-18) :
//   • Un SEUIL réglé par l'établissement, sur 20 (défaut 12), fait entrer automatiquement
//     au tableau d'honneur tout élève dont la moyenne de la période l'atteint.
//   • Chaque modèle peut le remplacer. Toujours AFFICHÉ et SAISI sur 20, jamais en %.
//   • Les anciens modèles portaient `filters.minAvgPct` (80 % = 16/20) : convertis À LA
//     LECTURE, sans réécrire le modèle stocké tant que l'école ne l'enregistre pas.
//   • Une classe dont le barème n'est pas /20 (anglophone /100…) : le seuil est ramené à
//     SON barème (12/20 → 60/100), pour que « 12 » veuille dire la même chose partout.
//   • Niveaux facultatifs : Encouragements, Félicitations (seuils réglables) au-dessus du
//     Tableau d'honneur. Un seul niveau reste possible (les deux autres désactivés).
//   • Exclure les élèves sanctionnés (blâme, exclusion) : réglable, DÉSACTIVÉ par défaut.

export const SEUIL_DEFAUT = 12;
export const SEUILS_PROPOSES = [10, 12, 14, 16];

export const NIVEAUX = [
  { key: 'th',  fr: "Tableau d'honneur", en: 'Honour Roll' },
  { key: 'enc', fr: 'Encouragements',    en: 'Encouragements' },
  { key: 'fel', fr: 'Félicitations',     en: 'Congratulations' },
];

export const LANGUES = ['auto', 'bilingue', 'fr', 'en'];

const arrondi2 = (n) => Math.round(n * 100) / 100;

/** Valide un seuil saisi : nombre de 0 à 20, deux décimales. Renvoie { ok, valeur, erreur }. */
export function validerSeuil(v) {
  if (v === '' || v === null || v === undefined) return { ok: false, erreur: 'vide' };
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) return { ok: false, erreur: 'nombre' };
  if (n < 0 || n > 20) return { ok: false, erreur: 'bornes' };
  return { ok: true, valeur: arrondi2(n) };
}

function parseJson(v) {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try { const o = JSON.parse(v); return o && typeof o === 'object' ? o : {}; } catch { return {}; }
}

/** Réglages effectifs de l'établissement (valeurs par défaut comprises). */
export function lireReglagesHonneur(school) {
  const seuil = validerSeuil(school?.honor_min_avg);
  const minAvg = seuil.ok ? seuil.valeur : SEUIL_DEFAUT;
  const o = parseJson(school?.honor_options);
  const lv = o.levels || {};
  const niveau = (k, defMin) => {
    const s = validerSeuil(lv[k]?.min);
    return { on: !!lv[k]?.on, min: s.ok ? s.valeur : defMin };
  };
  return {
    minAvg,
    levels: { enc: niveau('enc', 14), fel: niveau('fel', 16) },
    excludeSanctioned: !!o.excludeSanctioned,
    lang: LANGUES.includes(o.lang) ? o.lang : 'auto',
    design: o.design || null,
    colors: o.colors || null,
  };
}

/** `honor_options` à écrire (JSON texte), à partir des réglages édités. */
export function serialiserOptions(r) {
  return JSON.stringify({
    levels: { enc: { on: !!r.levels?.enc?.on, min: r.levels?.enc?.min }, fel: { on: !!r.levels?.fel?.on, min: r.levels?.fel?.min } },
    excludeSanctioned: !!r.excludeSanctioned,
    lang: LANGUES.includes(r.lang) ? r.lang : 'auto',
    ...(r.design ? { design: r.design } : {}),
    ...(r.colors ? { colors: r.colors } : {}),
  });
}

/**
 * Un modèle tel que l'écran et le moteur le lisent : `filters.minAvg20` (sur 20) remplace
 * `filters.minAvgPct`. Copie : l'objet reçu n'est jamais modifié.
 */
export function normaliserModele(tpl) {
  if (!tpl) return tpl;
  const f = { ...(tpl.filters || {}) };
  if (f.minAvg20 == null && f.minAvgPct != null && f.minAvgPct !== '') {
    const pct = Number(f.minAvgPct);
    if (Number.isFinite(pct)) f.minAvg20 = arrondi2(pct / 5);   // 80 % de 20 = 16
  }
  delete f.minAvgPct;
  return { ...tpl, filters: f };
}

/** Seuil (sur 20) qui s'applique à un modèle : le sien s'il en a un, sinon celui de l'école. */
export function seuilDuModele(tpl, reglages) {
  const s = validerSeuil(normaliserModele(tpl)?.filters?.minAvg20);
  return s.ok ? s.valeur : reglages.minAvg;
}

/** Un seuil sur 20 ramené au barème d'une classe (/100 → ×5). */
export function seuilAuBareme(seuil20, scaleMax) {
  return arrondi2(seuil20 * (Number(scaleMax) || 20) / 20);
}

/** Moyenne d'une classe ramenée sur 20. */
export function versSur20(avg, scaleMax) {
  if (avg == null) return null;
  return arrondi2(avg * 20 / (Number(scaleMax) || 20));
}

/**
 * Niveau de distinction atteint par une moyenne SUR 20 : le plus élevé des niveaux actifs
 * dont le seuil est atteint. `seuil` = seuil du tableau d'honneur pour ce modèle.
 * Renvoie la clé ('fel' | 'enc' | 'th') ou null.
 */
export function niveauAtteint(avg20, seuil, reglages) {
  if (avg20 == null || avg20 < seuil) return null;
  const { enc, fel } = reglages.levels;
  if (fel.on && avg20 >= fel.min) return 'fel';
  if (enc.on && avg20 >= enc.min) return 'enc';
  return 'th';
}

export function libelleNiveau(key, langue = 'fr') {
  const n = NIVEAUX.find((x) => x.key === key);
  return n ? (langue === 'en' ? n.en : n.fr) : '';
}
