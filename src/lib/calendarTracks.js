// PISTES DE CALENDRIER SCOLAIRE — logique PURE (ni React, ni store, ni réseau).
//
// Un même établissement fait tourner PLUSIEURS calendriers en parallèle, un par
// tutelle / niveau. Les découpages officiels ne coïncident pas :
//
//   • MINESEC — secondaire francophone ... 6 séquences            (fr_seq_1…6)
//   • Sous-système anglophone ............ 3 terms                (en_term_1…3)
//   • MINEDUB — primaire APC ............. 8 unités d'apprentissage (prim_ua_1…8)
//   • MINEDUB — maternelle ............... 3 trimestres           (mat_trim_1…3)
//   • Guinée équatoriale ................. 3 trimestres           (fr_seq_1…3 *)
//
//   (*) La Guinée équatoriale RÉUTILISE les clés `fr_seq_1..3` : c'est ce que
//   l'écran calendrier écrivait déjà avant l'ajout des pistes — on ne re-clé
//   aucune donnée existante.
//
// Ces clés (`seq_key`) sont celles de la table `sequence_dates`, dont la colonne
// est du texte libre : ajouter une piste ne demande AUCUNE migration.
//
// Ce module ne connaît que des DONNÉES : il ne sait pas lire la base, ne rend
// rien, et se teste en Node (`node src/lib/_calendarTracks.test.mjs`).

import { resolveClassEngine } from '../core/engineResolver.js';
import { filterClassesByScope, isGlobalScope } from '../core/surveillantScope.js';
import { trimestreOfUA } from '../core/primEngine.js';

const range = (n) => Array.from({ length: n }, (_, i) => i + 1);

// Une période de piste : { key (seq_key), order (1-based), fr, en, es, hint? }
const periods = (prefix, count, label, hint = null) =>
  range(count).map((n) => ({
    key:   `${prefix}${n}`,
    order: n,
    ...label(n),
    hint:  hint ? hint(n) : null,
  }));

export const TRACKS = {
  fr_seq: {
    key:      'fr_seq',
    unit:     { fr: 'Séquence', en: 'Sequence', es: 'Secuencia' },
    title:    { fr: 'Système francophone — Séquences', en: 'Francophone system — Sequences', es: 'Sistema francófono — Secuencias' },
    subtitle: { fr: 'MINESEC — 6 séquences regroupées en 3 trimestres', en: 'MINESEC — 6 sequences grouped into 3 terms', es: 'MINESEC — 6 secuencias en 3 trimestres' },
    periods:  periods('fr_seq_', 6,
      (n) => ({ fr: `Séq ${n}`, en: `Seq ${n}`, es: `Sec ${n}` }),
      (n) => ({ fr: `Trim. ${Math.ceil(n / 2)}`, en: `Term ${Math.ceil(n / 2)}`, es: `Trim. ${Math.ceil(n / 2)}` })),
  },
  en_term: {
    key:      'en_term',
    unit:     { fr: 'Term', en: 'Term', es: 'Term' },
    title:    { fr: 'Système anglophone — Terms', en: 'Anglophone system — Terms', es: 'Sistema anglófono — Terms' },
    subtitle: { fr: 'Sous-système anglophone — 3 terms', en: 'Anglophone sub-system — 3 terms', es: 'Subsistema anglófono — 3 terms' },
    periods:  periods('en_term_', 3, (n) => ({ fr: `Term ${n}`, en: `Term ${n}`, es: `Term ${n}` })),
  },
  prim_ua: {
    key:      'prim_ua',
    unit:     { fr: 'UA', en: 'LU', es: 'UA' },
    title:    { fr: "MINEDUB — Primaire (unités d'apprentissage)", en: 'MINEDUB — Primary (learning units)', es: 'MINEDUB — Primaria (unidades)' },
    subtitle: { fr: "Carnet officiel APC : 8 UA réparties sur 3 trimestres", en: 'Official APC record: 8 LUs across 3 terms', es: 'Cuaderno APC: 8 unidades en 3 trimestres' },
    periods:  periods('prim_ua_', 8,
      (n) => ({ fr: `UA ${n}`, en: `LU ${n}`, es: `UA ${n}` }),
      (n) => ({ fr: `Trim. ${trimestreOfUA(n)}`, en: `Term ${trimestreOfUA(n)}`, es: `Trim. ${trimestreOfUA(n)}` })),
  },
  mat_trim: {
    key:      'mat_trim',
    unit:     { fr: 'Trimestre', en: 'Term', es: 'Trimestre' },
    title:    { fr: 'MINEDUB — Maternelle (trimestres)', en: 'MINEDUB — Nursery (terms)', es: 'MINEDUB — Preescolar (trimestres)' },
    subtitle: { fr: 'Préscolaire : observations A / ECA / NA par trimestre', en: 'Pre-school: A / ECA / NA observations per term', es: 'Preescolar: observaciones por trimestre' },
    periods:  periods('mat_trim_', 3, (n) => ({ fr: `Trim ${n}`, en: `Term ${n}`, es: `Trim ${n}` })),
  },
  ge_trim: {
    key:      'ge_trim',
    unit:     { fr: 'Trimestre', en: 'Term', es: 'Trimestre' },
    title:    { fr: 'Système équatoguinéen — 3 trimestres', en: 'Equatoguinean system — 3 terms', es: 'Sistema equatoguineano — 3 Trimestres' },
    subtitle: { fr: '', en: '', es: '' },
    // Clés historiques `fr_seq_1..3` — voir l'en-tête de fichier.
    periods:  periods('fr_seq_', 3, (n) => ({
      fr: ['Trimestre 1', 'Trimestre 2', 'Trimestre 3'][n - 1],
      en: ['First Term', 'Second Term', 'Third Term'][n - 1],
      es: ['Primer Trimestre', 'Segundo Trimestre', 'Tercer Trimestre'][n - 1],
    })),
  },
};

// Ordre d'affichage stable (du plus jeune au plus âgé, anglophone en dernier).
export const TRACK_ORDER = ['mat_trim', 'prim_ua', 'fr_seq', 'en_term', 'ge_trim'];

// Toutes les périodes persistables, dédoublonnées par `seq_key` (ge_trim partage
// ses clés avec fr_seq). C'est la source de `SEQ_DEFINITIONS`.
export const ALL_CALENDAR_PERIODS = (() => {
  const seen = new Set();
  const out = [];
  for (const tk of ['fr_seq', 'en_term', 'prim_ua', 'mat_trim']) {
    for (const p of TRACKS[tk].periods) {
      if (seen.has(p.key)) continue;
      seen.add(p.key);
      out.push({ ...p, track: tk });
    }
  }
  return out;
})();

// ── Résolution piste ↔ classe ───────────────────────────────────────────────

// La piste de calendrier d'UNE classe. Elle suit le MOTEUR pédagogique effectif
// (donc le niveau de la classe et la surcharge `classes.bulletin_engine`), pas le
// seul drapeau école : une école « officiel » évalue sa maternelle par trimestres
// et sa 3e par séquences le même jour.
export function trackKeyForClass(school, cls, countryCode = null) {
  if (countryCode === 'guinea_eq') return 'ge_trim';
  switch (resolveClassEngine(school, cls)) {
    case 'maternelle':   return 'mat_trim';
    case 'apc_primaire': return 'prim_ua';
    default: {
      const sys = cls?.system || (school?.language === 'anglophone' ? 'EN' : 'FR');
      return sys === 'EN' ? 'en_term' : 'fr_seq';
    }
  }
}

// Les pistes de calendrier à proposer à un établissement, dans l'ordre
// d'affichage. Deux règles, et deux seulement :
//
//  1. Les pistes MINEDUB (maternelle, primaire APC) ne sont proposées QUE si le
//     MOTEUR DE BULLETIN les fait tourner sur une classe réelle. Une école
//     « Classique » ne voit donc jamais de trimestres de maternelle ni d'UA,
//     même si elle a une classe nommée « Petite Section » ou « CM2 » : chez elle
//     ces niveaux sont notés /20 comme le reste (cf. resolveClassEngine).
//
//  2. Les deux SOUS-SYSTÈMES linguistiques restent toujours ouverts : le
//     découpage anglophone en terms est proposé en permanence (le Cameroun est
//     bilingue et une section anglaise peut s'ouvrir en cours d'année), et les
//     séquences francophones dès que l'école n'est pas purement anglophone.
//  3. Un responsable au PÉRIMÈTRE restreint ne configure que sa part : dans un
//     complexe scolaire, le directeur du fondamental règle les dates MINEDUB
//     (maternelle, primaire) et le proviseur celles du secondaire. Le périmètre
//     est celui déjà porté par le compte (`school_users.scope`, cf.
//     core/surveillantScope). Périmètre global ⇒ tout le calendrier.
export function tracksForSchool(school, classes, countryCode = null, scope = null) {
  if (countryCode === 'guinea_eq') return ['ge_trim'];

  const inScope = filterClassesByScope(scope, classes || []);
  const used = new Set(tracksInUse(school, inScope, countryCode, { fallback: isGlobalScope(scope) }));

  // Les sous-systèmes linguistiques ne sont proposés « à blanc » qu'à qui règle
  // TOUT l'établissement. Un responsable de cycle n'a que ses propres pistes —
  // celles de ses classes suffisent, et elles couvrent déjà son cas anglophone.
  if (isGlobalScope(scope)) {
    if (school?.language !== 'anglophone') used.add('fr_seq');
    used.add('en_term');
  }

  return TRACK_ORDER.filter((k) => used.has(k));
}

// Les pistes portées par AU MOINS UNE classe. À distinguer de `tracksForSchool` :
// le calendrier PROPOSE des découpages à remplir (dont l'anglophone, toujours),
// alors qu'un écran de suivi ne doit montrer que des pistes où il y a réellement
// des classes à surveiller — sinon l'onglet ouvre sur une liste vide.
export function tracksInUse(school, classes, countryCode = null, { fallback = true } = {}) {
  if (countryCode === 'guinea_eq') return ['ge_trim'];
  const used = new Set((classes || []).map((c) => trackKeyForClass(school, c, countryCode)));
  const list = TRACK_ORDER.filter((k) => used.has(k));
  // Aucune classe : on retombe sur le découpage par défaut de la langue — sauf
  // pour un périmètre restreint, où « aucune classe » veut dire « rien à régler
  // ici », pas « proposer les séquences ».
  if (!list.length && fallback) return school?.language === 'anglophone' ? ['en_term'] : ['fr_seq'];
  return list;
}

// ── Période courante, lue DANS le calendrier ────────────────────────────────

// 'YYYY-MM-DD' local (pas UTC : à Douala, `toISOString()` décale d'un jour le
// soir et ferait basculer une échéance 24 h trop tôt).
export function todayStr(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

// Échéance de saisie effective d'une ligne calendrier : la limite de saisie si
// elle est renseignée, sinon la date d'examen (une école qui ne remplit qu'une
// colonne reste suivie).
export const effectiveDeadline = (row) => row?.deadline_date || row?.exam_date || null;

const daysBetween = (fromStr, toStr) =>
  Math.round((Date.parse(`${toStr}T00:00:00`) - Date.parse(`${fromStr}T00:00:00`)) / 86400000);

/**
 * La période OUVERTE d'une piste au jour dit : la première (dans l'ordre) dont
 * l'échéance de saisie n'est pas encore passée. Si toutes sont passées, c'est la
 * dernière — elle reste « en retard » tant que la saisie n'est pas faite.
 *
 * @returns null si AUCUNE date n'est renseignée pour cette piste (le calendrier
 *          n'a pas été rempli : l'appelant doit retomber sur son heuristique).
 *          Sinon { trackKey, order, key, period, dates, deadline, daysLeft,
 *                  overdue, atRisk, last }.
 */
export function currentPeriodOfTrack(trackKey, datesByKey, today = new Date()) {
  const track = TRACKS[trackKey];
  const t = todayStr(today);
  if (!track || !t) return null;

  const dated = track.periods
    .map((p) => ({ period: p, dates: datesByKey?.[p.key] || null }))
    .filter((r) => effectiveDeadline(r.dates));
  if (!dated.length) return null;

  const open = dated.find((r) => effectiveDeadline(r.dates) >= t);
  const row  = open || dated[dated.length - 1];
  const deadline = effectiveDeadline(row.dates);
  const daysLeft = daysBetween(t, deadline);

  return {
    trackKey,
    order:    row.period.order,
    key:      row.period.key,
    period:   row.period,
    dates:    row.dates,
    deadline,
    daysLeft,
    overdue:  daysLeft < 0,
    atRisk:   daysLeft >= 0 && daysLeft <= 3,
    last:     !open,        // plus aucune période ouverte : fin d'année scolaire
  };
}

// Les périodes d'une piste dont l'échéance est DÉPASSÉE (saisie attendue depuis
// longtemps). Sert aux alertes de retard cumulé.
export function overduePeriods(trackKey, datesByKey, today = new Date()) {
  const track = TRACKS[trackKey];
  const t = todayStr(today);
  if (!track || !t) return [];
  return track.periods.filter((p) => {
    const d = effectiveDeadline(datesByKey?.[p.key]);
    return d && d < t;
  });
}

// Libellé localisé d'une période (langue courante fournie par l'appelant, pour
// garder ce module libre de toute dépendance i18n).
export const periodLabel = (period, lang = 'fr') => period?.[lang] || period?.fr || '';
export const trackLabel  = (trackKey, field, lang = 'fr') =>
  TRACKS[trackKey]?.[field]?.[lang] ?? TRACKS[trackKey]?.[field]?.fr ?? '';

// Période d'une piste par son rang (1-based), ou null.
export const periodAt = (trackKey, order) =>
  TRACKS[trackKey]?.periods.find((p) => p.order === Number(order)) || null;
