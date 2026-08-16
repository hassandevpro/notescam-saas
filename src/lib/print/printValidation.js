// ─────────────────────────────────────────────────────────────────────────────
// SOCLE D'IMPRESSION — garde-fous sur les valeurs et auto-contrôle du document.
// ─────────────────────────────────────────────────────────────────────────────
// Un document officiel ne doit JAMAIS porter « NaN », « undefined », « null »,
// « Infinity » ou « [object Object] ». Ces valeurs ne viennent pas d'un bug
// unique mais d'une chaîne : une division par un barème nul, une jointure
// manquante, une propriété renommée. On se protège donc à deux niveaux :
//
//   1. À la source — `num()` / `txt()` : aucun générateur n'interpole une
//      valeur brute, il passe par ces formateurs.
//   2. Au dernier moment — `auditDocument()` : le document assemblé est relu
//      avant d'être envoyé à l'impression. Ce qui a échappé au niveau 1 est
//      détecté, remplacé, et signalé à l'appelant (statut PARTIAL au journal).

/** Marqueur affiché à la place d'une valeur absente. */
export const EMPTY = '—';

/** Jetons interdits dans un document officiel. */
const BAD_TOKENS = ['NaN', 'undefined', 'null', 'Infinity', '-Infinity', '[object Object]'];

const BAD_RE = new RegExp(
  `(?<![\\p{L}\\d_])(${BAD_TOKENS.map((t) => t.replace(/[[\]]/g, '\\$&')).join('|')})(?![\\p{L}\\d_])`,
  'gu',
);

/** `true` si la valeur ne peut pas être imprimée telle quelle. */
export function isBadValue(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'number') return !Number.isFinite(v);
  if (typeof v === 'string') {
    const s = v.trim();
    return s === '' || BAD_TOKENS.includes(s);
  }
  return false;
}

/**
 * Nombre imprimable. Renvoie `fallback` pour tout ce qui n'est pas un nombre
 * fini — y compris NaN, Infinity, null, undefined et les chaînes non numériques.
 *   num(12.345, { digits: 2 })  -> '12.35'
 *   num(NaN)                    -> '—'
 */
export function num(v, { digits = null, fallback = EMPTY, suffix = '' } = {}) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!Number.isFinite(n)) return fallback;
  const s = digits === null ? String(n) : n.toFixed(digits);
  return suffix ? `${s}${suffix}` : s;
}

/** Texte imprimable : vide, null, undefined et jetons interdits → `fallback`. */
export function txt(v, fallback = EMPTY) {
  if (isBadValue(v)) return fallback;
  return String(v);
}

/** Échappement HTML — les données viennent de la saisie utilisateur. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Texte utilisateur, nettoyé puis échappé — le formateur par défaut. */
export const safe = (v, fallback = EMPTY) => esc(txt(v, fallback));

// ── Auto-contrôle du document assemblé ───────────────────────────────────────

/** Contenu textuel d'un HTML (ce que l'œil lira), attributs exclus. */
function textNodesOf(html) {
  const out = [];
  const re = />([^<]+)</g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const s = m[1];
    if (s.trim()) out.push({ text: s, index: m.index + 1 });
  }
  return out;
}

/**
 * Relit un document assemblé et signale ce qui ne doit pas s'imprimer.
 * N'inspecte que le TEXTE VISIBLE : une chaîne « null » dans une URL d'image ou
 * un attribut de style n'est pas une faute d'impression.
 *
 * @returns {{ ok: boolean, issues: Array<{ token: string, context: string }> }}
 */
export function auditDocument(html) {
  const issues = [];
  for (const node of textNodesOf(String(html || ''))) {
    let m;
    BAD_RE.lastIndex = 0;
    while ((m = BAD_RE.exec(node.text)) !== null) {
      const from = Math.max(0, m.index - 30);
      issues.push({
        token: m[1],
        context: node.text.slice(from, m.index + m[1].length + 30).replace(/\s+/g, ' ').trim(),
      });
    }
  }
  return { ok: issues.length === 0, issues };
}

/**
 * Dernier filet : remplace les jetons interdits par « — » dans le TEXTE VISIBLE
 * seulement. À utiliser juste avant l'impression, jamais comme excuse pour ne
 * pas corriger la source — `auditDocument` reste là pour la signaler.
 */
export function scrubDocument(html) {
  return String(html || '').replace(/>([^<]+)</g, (whole, text) => {
    BAD_RE.lastIndex = 0;
    if (!BAD_RE.test(text)) return whole;
    BAD_RE.lastIndex = 0;
    return `>${text.replace(BAD_RE, EMPTY)}<`;
  });
}

/**
 * Contrôle de présence : vérifie qu'un document contient bien les éléments
 * obligatoires attendus. Utilisé par les tests et par l'aperçu (liste
 * « Contenu du document »).
 *
 * @param {string} html
 * @param {string[]} required  clés parmi : logo, qr, signature, stamp, title, table
 */
export function checkParts(html, required = []) {
  const s = String(html || '');
  const has = {
    logo:      /data-part="logo"/.test(s),
    qr:        /data-part="qr"/.test(s),
    signature: /data-part="signature"/.test(s),
    stamp:     /data-part="stamp"/.test(s),
    title:     /data-part="title"/.test(s),
    table:     /<table/.test(s),
    footer:    /data-part="footer"/.test(s),
  };
  const missing = required.filter((k) => !has[k]);
  return { ok: missing.length === 0, has, missing };
}

export default { num, txt, esc, safe, isBadValue, auditDocument, scrubDocument, checkParts, EMPTY };
