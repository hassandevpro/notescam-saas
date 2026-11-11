// LA FEUILLE DE NOTES : une ligne par élève, une colonne par matière à NOTE UNIQUE — logique pure.
//
// Une compétence du primaire prend d'ordinaire quatre notes (Oral, Écrit, Pratique, Savoir-être). Une école
// qui n'évalue qu'à l'écrit n'en garde qu'UNE (barème > 0) : sa matière « Dictée-Question /40 » est alors une
// simple colonne de la feuille de notes papier. Ce module décide QUELLES compétences sont de cette sorte, lit
// ce qu'un enseignant a tapé, et calcule les colonnes de droite (Total, Moyenne /20, Rang, Cote). Aucun accès
// au store ni à l'écran : tout se teste sans navigateur.

import { baremeEnVigueur } from './primColumnBareme.js';
import { primCote, primNkey } from './primEngine.js';

export const PRIM_NOTE_MAX = 20;

/**
 * Les barèmes déjà posés par la classe pour (compétence, critère), toutes UA confondues : { 'comp|crit': { ua: max } }.
 * Une seule passe sur les notes, quel que soit le nombre de colonnes.
 */
export function baremesParUA(notes, eleveIds) {
  const miens = new Set(eleveIds || []);
  const out = {};
  for (const r of Object.values(notes || {})) {
    if (!r || !miens.has(r.eleve_id)) continue;
    const m = Number(r.points_max);
    if (!Number.isFinite(m) || m <= 0) continue;
    const k = `${r.competence_id}|${r.critere_id}`;
    (out[k] ||= {})[r.ua] = m;
  }
  return out;
}

/**
 * Le barème d'une colonne pour cette UA : celui des notes déjà saisies, sinon celui de l'UA la plus proche où la
 * classe l'a déjà posé (la Dictée vaut /40 à chaque UA), sinon le barème officiel. 0 = la colonne n'existe pas.
 */
export function baremeColonne({ notesColonne, officiel, parUA, ua }) {
  const direct = baremeEnVigueur(notesColonne, officiel);
  if (Number(direct) > 0) return Number(direct);
  const memoire = parUA || {};
  const uas = Object.keys(memoire).map(Number).sort((a, b) => Math.abs(a - ua) - Math.abs(b - ua));
  return uas.length ? memoire[uas[0]] : 0;
}

/**
 * Sépare les compétences de la classe en colonnes de feuille de notes (UN SEUL critère de barème > 0) et en
 * compétences à critères multiples (qui gardent la saisie actuelle).
 *
 *   competences : [{ id, code, intitule }]
 *   criteresDe  : (competenceId) => [{ id, nom, points_max }]  — critères applicables, y compris ceux à 0
 *   notes       : primNotes ({ nkey: ligne })
 *   eleveIds    : élèves de la classe
 */
export function colonnesNoteUnique({ competences, criteresDe, notes, eleveIds, ua, exclure = [], ouvertureDe }) {
  const parUA = baremesParUA(notes, eleveIds);
  const colonnes = [];
  const multiples = [];
  for (const c of competences || []) {
    if (exclure.includes(c.id)) { multiples.push(c); continue; }
    const actifs = [];
    const tous = criteresDe(c.id) || [];
    for (const cr of tous) {
      const notesColonne = (eleveIds || []).map((id) => notes?.[primNkey(id, c.id, cr.id, ua)]);
      const max = baremeColonne({ notesColonne, officiel: cr.points_max, parUA: parUA[`${c.id}|${cr.id}`], ua });
      if (max > 0) actifs.push({ cr, max });
    }
    // Une matière JAMAIS OUVERTE à cette UA (aucune note, aucun barème posé, rien de national) n'a pas de barème :
    // on lui applique celui que le classeur ouvre d'ordinaire — Écrit, au barème que l'école emploie déjà — sans
    // rien écrire tant qu'aucune note n'est tapée. Sans cela, seule la matière déjà ouverte apparaissait.
    if (!actifs.length && typeof ouvertureDe === 'function') {
      const ouverts = Object.entries(ouvertureDe(c.id, tous.map((x) => x.id)) || {}).filter(([, v]) => Number(v) > 0);
      if (ouverts.length === 1) {
        const [critereId, max] = ouverts[0];
        const cr = tous.find((x) => x.id === critereId);
        if (cr) actifs.push({ cr, max: Number(max), parDefaut: true });
      }
    }
    if (actifs.length === 1) {
      colonnes.push({
        competenceId: c.id, code: c.code, intitule: c.intitule,
        critereId: actifs[0].cr.id, critereNom: actifs[0].cr.nom, bareme: actifs[0].max, parDefaut: !!actifs[0].parDefaut,
      });
    } else if (actifs.length > 1) multiples.push(c);
    // 0 critère actif : la compétence n'est pas évaluée dans cette classe, elle n'a aucune colonne.
  }
  return { colonnes, multiples };
}

/**
 * Ce que l'enseignant a tapé, interprété contre le barème de la colonne.
 *   '' / '-'          → { type: 'vide' }
 *   'ABS' / 'A'        → { type: 'absent' }
 *   28,5 / 28.5        → { type: 'note', valeur: '28.5' }
 *   hors 0..max / texte → { type: 'erreur', message: 'max 40' }
 */
export function lireSaisie(brut, max) {
  const v = String(brut ?? '').trim().toUpperCase();
  if (v === '' || v === '-') return { type: 'vide' };
  if (v === 'ABS' || v === 'A') return { type: 'absent' };
  if (!/^\d+([.,]\d+)?$/.test(v)) return { type: 'erreur', message: `0–${max}` };
  const n = parseFloat(v.replace(',', '.'));
  if (n > max) return { type: 'erreur', message: `max ${max}` };
  return { type: 'note', valeur: String(Math.round(n * 100) / 100) };
}

/** Un bloc copié depuis Excel (tabulations, retours à la ligne) → matrice de textes. Une cellule seule → null. */
export function matriceCollee(texte) {
  const s = String(texte ?? '').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  if (!s.includes('\t') && !s.includes('\n')) return null;
  return s.split('\n').map((l) => l.split('\t').map((x) => x.trim()));
}

/**
 * Total, moyenne /20 et cote d'une ligne. Moyenne = total des notes ÷ (total des barèmes ÷ 20), sur les colonnes
 * où l'élève a une NOTE : une case vide ou une absence n'entre ni au numérateur ni au dénominateur (« non notée »).
 *
 *   cellules : [{ bareme, note, statut }]  — note = nombre, '' ou null
 */
export function calculerLigne(cellules, bareme) {
  let total = 0, possible = 0, saisies = 0;
  for (const c of cellules || []) {
    if (c.statut === 'absent') continue;
    if (c.note == null || c.note === '') continue;
    const n = Number(c.note);
    if (!Number.isFinite(n)) continue;
    total += n; possible += Number(c.bareme); saisies += 1;
  }
  if (!saisies || possible <= 0) return { total: null, possible: null, moyenne: null, cote: null, saisies: 0 };
  const moyenne = Math.round((total / (possible / PRIM_NOTE_MAX)) * 100) / 100;
  const c = primCote(moyenne, PRIM_NOTE_MAX, bareme);
  return { total: Math.round(total * 100) / 100, possible, moyenne, cote: c ? c.cote : null, saisies };
}

/** Rangs « à la compétition » : deux ex æquo partagent le rang, le suivant saute. Sans moyenne : pas de rang. */
export function rangsDesMoyennes(moyennes) {
  const valides = Object.entries(moyennes || {}).filter(([, m]) => m != null).sort((a, b) => b[1] - a[1]);
  const out = {};
  let rang = 0;
  valides.forEach(([id, m], i) => {
    if (i === 0 || m !== valides[i - 1][1]) rang = i + 1;
    out[id] = rang;
  });
  return out;
}

/** Cases vides par colonne : « 24/26 saisies ». Une absence déclarée compte comme traitée. */
export function compteurColonne(cellules) {
  let faites = 0;
  for (const c of cellules || []) if (c.statut === 'absent' || (c.note != null && c.note !== '')) faites += 1;
  return { faites, total: (cellules || []).length };
}
