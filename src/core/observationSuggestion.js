// SUGGESTION D'OBSERVATION DE L'ENSEIGNANT(E) — règle pure, déterministe, hors ligne.
//
// L'application fonctionne sans connexion : aucune IA externe, aucun appel réseau. La suggestion est
// COMPOSÉE à partir des cotes de l'élève par compétence, avec des phrases-modèles. C'est une AIDE : elle ne
// remplace jamais un texte déjà saisi (l'écran demande confirmation avant d'écraser), et l'enseignant la
// modifie librement.
//
// ── LES TROIS CATÉGORIES ─────────────────────────────────────────────────────────────────────────────────
//   A+ / A  → point fort      ECA → en progression      NA → point faible
// Les compétences sont REGROUPÉES par matière lisible (1A et 1B ne sont pas la même matière ; 3A et 3B, si :
// « valeurs »). Une matière qui regroupe plusieurs compétences prend la MOYENNE de leurs rangs de cote.
//
// ── LE PROFIL GLOBAL CHOISIT LE TON ──────────────────────────────────────────────────────────────────────
//   presque tout en A/A+ (≥ 80 %, aucun NA)  → félicitations
//   presque tout en NA (≥ 80 %)              → ton encourageant mais exigeant
//   sinon                                    → points forts d'abord, puis points à renforcer
// Au plus TROIS matières citées par catégorie : les plus fortes, et les plus faibles.

const RANG = { 'A+': 4, A: 3, ECA: 2, NA: 1 };
const normCote = (c) => {
  const k = String(c ?? '').trim().toUpperCase();
  if (k === 'EA') return 'ECA';              // l'ancien libellé du moteur anglophone
  return RANG[k] ? k : null;
};

// Matière lisible d'une compétence nationale : { fr, en }. Clé = code officiel (1A, 1B…).
const MATIERE_PAR_CODE = {
  '1A': { fr: 'français', en: 'French' },
  '1B': { fr: 'anglais', en: 'English' },
  '1C': { fr: 'langue nationale', en: 'national language' },
  '2A': { fr: 'mathématiques', en: 'mathematics' },
  '2B': { fr: 'sciences', en: 'science' },
  '3A': { fr: 'valeurs', en: 'values' },
  '3B': { fr: 'valeurs', en: 'values' },
  '4A': { fr: 'autonomie et initiative', en: 'autonomy and initiative' },
  '5A': { fr: 'TIC', en: 'ICT' },
  '6A': { fr: 'sport', en: 'sport' },
  '6B': { fr: 'activités artistiques', en: 'artistic activities' },
};

// Repli : la matière se lit dans l'INTITULÉ configuré quand le code est inconnu (compétence ajoutée par l'école,
// code renuméroté…). Mots-clés sans accent, du plus précis au plus général.
const MOTS = [
  [/(langue\s+nationale|national\s+language)/, { fr: 'langue nationale', en: 'national language' }],
  [/(francais|french)/, { fr: 'français', en: 'French' }],
  [/(anglais|english)/, { fr: 'anglais', en: 'English' }],
  [/(mathemat|calcul|maths?\b)/, { fr: 'mathématiques', en: 'mathematics' }],
  [/(\btic\b|numerique|informatique|\bict\b|computer)/, { fr: 'TIC', en: 'ICT' }],
  [/(science|technolog)/, { fr: 'sciences', en: 'science' }],
  [/(valeur|citoyen|civique|moral)/, { fr: 'valeurs', en: 'values' }],
  [/(autonomi|initiative)/, { fr: 'autonomie et initiative', en: 'autonomy and initiative' }],
  [/(sport|physique|\beps\b|motric)/, { fr: 'sport', en: 'sport' }],
  [/(artistique|art\b|arts\b|dessin|musique|creati)/, { fr: 'activités artistiques', en: 'artistic activities' }],
];
const sansAccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Matière lisible d'une compétence : par code officiel, puis par intitulé, sinon l'intitulé lui-même. */
export function matiereDe(code, intitule, sys = 'FR') {
  const k = String(code || '').trim().toUpperCase();
  const lang = sys === 'EN' ? 'en' : 'fr';
  if (MATIERE_PAR_CODE[k]) return MATIERE_PAR_CODE[k][lang];
  const t = sansAccent(intitule);
  for (const [re, m] of MOTS) if (re.test(t)) return m[lang];
  const brut = String(intitule || '').trim();
  return brut ? brut.charAt(0).toLowerCase() + brut.slice(1) : '';
}

// « en X, en Y et en Z » (FR) / « in X, Y and Z » (EN).
export function enumerer(items, sys = 'FR') {
  const l = items.filter(Boolean);
  if (!l.length) return '';
  if (sys === 'EN') {
    const corps = l.length === 1 ? l[0] : `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`;
    return `in ${corps}`;
  }
  const p = l.map((x) => `en ${x}`);
  return p.length === 1 ? p[0] : `${p.slice(0, -1).join(', ')} et ${p[p.length - 1]}`;
}

/** Genre de l'élève d'après sa fiche : 'F' | 'M' | null (inconnu → formulation neutre). */
export function genreDe(student) {
  const g = sansAccent(student?.gender ?? student?.sexe ?? '').trim();
  if (/^(f|fem)/.test(g)) return 'F';
  if (/^(m|h|mas|hom)/.test(g)) return 'M';
  return null;
}

const MAX_PAR_CATEGORIE = 3;

/**
 * Regroupe les compétences par matière et les classe.
 * @param rows [{ code, intitule, cote }]  — `cote` null/'' = pas évaluée : ignorée.
 * @returns {{ fortes: string[], progres: string[], faibles: string[], evaluees: number }}
 */
export function classerMatieres(rows, sys = 'FR') {
  const parMatiere = new Map();     // matière → { rangs: [], ordre }
  let ordre = 0;
  for (const r of rows || []) {
    const cote = normCote(r?.cote);
    if (!cote) continue;
    const m = matiereDe(r.code, r.intitule, sys);
    if (!m) continue;
    if (!parMatiere.has(m)) parMatiere.set(m, { rangs: [], ordre: ordre++ });
    parMatiere.get(m).rangs.push(RANG[cote]);
  }
  const liste = [...parMatiere.entries()].map(([nom, v]) => ({
    nom, ordre: v.ordre, score: v.rangs.reduce((a, b) => a + b, 0) / v.rangs.length,
  }));
  const fortes = liste.filter((x) => x.score >= 3).sort((a, b) => b.score - a.score || a.ordre - b.ordre);
  const progres = liste.filter((x) => x.score >= 2 && x.score < 3).sort((a, b) => b.score - a.score || a.ordre - b.ordre);
  const faibles = liste.filter((x) => x.score < 2).sort((a, b) => a.score - b.score || a.ordre - b.ordre);
  const nom = (x) => x.nom;
  return {
    fortes: fortes.slice(0, MAX_PAR_CATEGORIE).map(nom),
    progres: progres.slice(0, MAX_PAR_CATEGORIE).map(nom),
    faibles: faibles.slice(0, MAX_PAR_CATEGORIE).map(nom),
    evaluees: liste.length,
    // Effectifs RÉELS par catégorie (avant le plafond de trois) : c'est eux qui décident du profil global.
    nbFortes: fortes.length, nbProgres: progres.length, nbFaibles: faibles.length,
  };
}

const PHRASES = {
  FR: {
    excellent: 'Excellent travail, résultats très satisfaisants. Continuez ainsi.',
    insuffisant: 'Résultats insuffisants dans la plupart des domaines. Un travail régulier et un accompagnement à la maison sont nécessaires.',
    progres: (l) => `Progrès encourageants ${l}.`,
    efforts: (l) => `Des efforts soutenus restent indispensables ${l}.`,
    consolider: (l) => `Les acquis restent à consolider ${l}.`,
    regularite: { F: 'Elle doit travailler avec plus de régularité.', M: 'Il doit travailler avec plus de régularité.', N: 'L’élève doit travailler avec plus de régularité.' },
  },
  EN: {
    excellent: 'Excellent work, very satisfactory results. Keep it up.',
    insuffisant: 'Insufficient results in most areas. Regular work and support at home are necessary.',
    progres: (l) => `Encouraging progress ${l}.`,
    efforts: (l) => `Sustained effort remains essential ${l}.`,
    consolider: (l) => `What has been learned still needs consolidating ${l}.`,
    regularite: { F: 'She must work more regularly.', M: 'He must work more regularly.', N: 'The pupil must work more regularly.' },
  },
};

/**
 * Observation suggérée pour UN élève. '' si aucune compétence n'est évaluée (rien à dire, rien d'inventé).
 * @param rows   [{ code, intitule, cote }]
 * @param sys    'FR' | 'EN' (ES retombe sur le français, comme le reste des bulletins)
 * @param genre  'F' | 'M' | null
 */
export function suggererObservation({ rows, sys = 'FR', genre = null } = {}) {
  const P = PHRASES[sys === 'EN' ? 'EN' : 'FR'];
  const lang = sys === 'EN' ? 'EN' : 'FR';
  const c = classerMatieres(rows, lang);
  if (!c.evaluees) return '';

  const n = c.evaluees;
  if (c.nbFaibles === 0 && c.nbProgres === 0) return P.excellent;                    // tout en A / A+
  if (c.nbFaibles === 0 && c.nbFortes / n >= 0.8) return P.excellent;                // presque tout en A / A+
  if (c.nbFaibles / n >= 0.8) return P.insuffisant;                                  // presque tout en NA

  const phrases = [];
  if (c.fortes.length) phrases.push(P.progres(enumerer(c.fortes, lang)));
  if (c.faibles.length) phrases.push(P.efforts(enumerer(c.faibles, lang)));
  else if (c.progres.length) phrases.push(P.consolider(enumerer(c.progres, lang)));
  // Rien de fort à dire : une phrase d'efforts seule paraît sèche — on ajoute l'exigence de régularité,
  // accordée au genre de l'élève.
  if (!c.fortes.length) phrases.push(P.regularite[genre === 'F' ? 'F' : genre === 'M' ? 'M' : 'N']);
  return phrases.join(' ');
}

/**
 * Cotes par compétence d'UN élève pour UNE UA, lues dans les notes déjà saisies (`primNotes`).
 * Même principe que le total de la saisie : Σ des points obtenus sur Σ des barèmes des critères NOTÉS ; une
 * absence justifiée sort du calcul. Une compétence sans note n'a pas de cote — elle n'entre pas dans la suggestion.
 *
 * @param index        Map issue de `indexerNotes` (calculé UNE fois pour toute la classe)
 * @param competences  [{ id, code, intitule }]
 * @param cote         fonction (achieved, possible) => { cote } | null   (primCote du barème de l'école)
 */
export function indexerNotes(primNotes) {
  const idx = new Map();
  for (const n of Object.values(primNotes || {})) {
    if (!n || !n.eleve_id || !n.competence_id) continue;
    const k = `${n.eleve_id}|${n.competence_id}|${n.ua}`;
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(n);
  }
  return idx;
}

export function cotesDeLEleve(index, eleveId, ua, competences, cote) {
  return (competences || []).map((c) => {
    let obtenu = 0; let possible = 0; let vu = false;
    for (const n of index.get(`${eleveId}|${c.id}|${ua}`) || []) {
      if (n.statut === 'absent') continue;
      if (n.note == null || n.note === '') continue;
      const v = Number(String(n.note).replace(',', '.'));
      const max = Number(n.points_max);
      if (!Number.isFinite(v) || !(max > 0)) continue;
      obtenu += v; possible += max; vu = true;
    }
    const r = vu ? cote(obtenu, possible) : null;
    return { code: c.code, intitule: c.intitule, cote: r ? r.cote : null };
  });
}

/**
 * Ce qu'il faut ÉCRIRE quand on applique une suggestion — ou null s'il ne faut rien écrire.
 * Un texte déjà saisi n'est JAMAIS écrasé sans `ecraser: true` (l'écran le demande d'abord à l'enseignant ;
 * la suggestion « pour toute la classe » ne l'active jamais). Une suggestion vide n'écrit rien.
 */
export function aEcrire(actuel, suggestion, { ecraser = false } = {}) {
  const s = String(suggestion ?? '').trim();
  if (!s) return null;
  const deja = String(actuel ?? '').trim();
  if (deja && !ecraser) return null;
  return s === deja ? null : s;
}
