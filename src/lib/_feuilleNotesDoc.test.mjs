// Tests du DOCUMENT « feuille de notes » (A4 paysage, à remplir à la main).
// `node --experimental-loader ./scripts/lib/esm-resolve.mjs src/lib/_feuilleNotesDoc.test.mjs`

import { feuilleNotesSheets, FEUILLE_NOTES_PROFIL } from './feuilleNotesDoc.js';
import { auditDocument, pageMetrics } from './print/index.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

const ecole = { name: 'COMPLEXE SCOLAIRE TEST', current_year: '2025-2026' };
const groupe = (id, label, n, bareme = 5) => ({
  id, label,
  colonnes: Array.from({ length: n }, (_, i) => ({ id: `${id}_${i + 1}`, label: `Épreuve ${i + 1}`, bareme })),
});
const eleves = (n) => Array.from({ length: n }, (_, i) => ({ id: `e${i + 1}`, numero: i + 1, nom: `ÉLÈVE ${i + 1}` }));

const base = {
  school: ecole, classe: 'CM2 A', periode: 'UA 2',
  portee: { libelle: 'Compétences', valeur: '2' },
  groupes: [groupe('c1', '1A — Écouter et parler', 4), groupe('c2', '1B — Lire', 3)],
  eleves: eleves(4),
};

// ── Page et profil ──────────────────────────────────────────────────────────
{
  const r = feuilleNotesSheets(base);
  ok(r.profile === FEUILLE_NOTES_PROFIL, 'le document déclare son profil de page');
  ok(pageMetrics(r.profile).orientation === 'landscape',
    'la feuille de notes est en PAYSAGE : une grille large ne tient pas en portrait');
  ok(r.pages === 1 && r.sheets.length === 1, 'un petit effectif tient sur une page');
  // Règle du socle : la géométrie appartient à @page, jamais au document.
  ok(!/@page|\bmargin-left\s*:/.test(r.sheets[0]),
    'aucune géométrie de page posée à la main (contrat lib/print)');
}

// ── Contenu de la grille ────────────────────────────────────────────────────
{
  const html = feuilleNotesSheets(base).sheets[0];
  ok(html.includes('COMPLEXE SCOLAIRE TEST'), 'l’établissement est imprimé');
  ok(html.includes('CM2 A') && html.includes('UA 2'), 'la classe et la période sont imprimées');
  ok(html.includes('1A — Écouter et parler'), 'chaque groupe porte son intitulé');
  ok(html.includes('ÉLÈVE 1') && html.includes('ÉLÈVE 4'), 'tous les élèves de la page sont là');
  ok(/sur 5/.test(html), 'le barème de chaque colonne est écrit sous son intitulé');
  ok(html.includes('/20'), 'le total de points du groupe est annoncé (4 épreuves sur 5)');
  // Une épreuve manquante vaut un total impossible : on n'affiche alors rien.
  const sansBareme = feuilleNotesSheets({
    ...base,
    groupes: [{ id: 'x', label: 'X', colonnes: [{ id: 'x1', label: 'A', bareme: 5 }, { id: 'x2', label: 'B' }] }],
  }).sheets[0];
  ok(!/X\s*<span[^>]*>\//.test(sansBareme), 'pas de total de groupe quand une colonne n’a pas de barème');
}

// ── Vierge / remplie — le cœur de la demande ────────────────────────────────
{
  const valeur = (eleveId, colId) => (eleveId === 'e1' && colId === 'c1_1' ? '13,5' : '');

  const vierge = feuilleNotesSheets({ ...base, valeur, vierge: true }).sheets[0];
  ok(!vierge.includes('13,5'), 'VIERGE : aucune note imprimée, même saisie');
  ok(vierge.includes('ÉLÈVE 1'), 'VIERGE : les noms restent, ce sont les cases qui sont vides');

  const remplie = feuilleNotesSheets({ ...base, valeur, vierge: false }).sheets[0];
  ok(remplie.includes('13,5'), 'REMPLIE : la note saisie est imprimée');
}

// ── Lignes vides à écrire à la main ─────────────────────────────────────────
{
  const avec = feuilleNotesSheets({ ...base, lignesVides: 3 }).sheets[0];
  const sans = feuilleNotesSheets({ ...base, lignesVides: 0 }).sheets[0];
  const lignes = (h) => (h.match(/<tr class="nc-keep-row"/g) || []).length;
  ok(lignes(avec) === lignes(sans) + 3, 'trois lignes vides ajoutent trois lignes au tableau');
}

// ── Découpe en plusieurs pages ──────────────────────────────────────────────
{
  const r = feuilleNotesSheets({
    ...base,
    groupes: [groupe('a', 'A', 6), groupe('b', 'B', 6), groupe('c', 'C', 6)],
    eleves: eleves(60),
  });
  ok(r.pages > 1, 'une grande classe et beaucoup de colonnes débordent sur plusieurs pages');
  ok(r.sheets.every((s) => s.includes('CM2 A')),
    'chaque page se recolle à sa classe (une feuille isolée doit rester identifiable)');
  ok(r.sheets.some((s) => /page 2\//.test(s)), 'les pages sont numérotées');
  ok(r.sheets.some((s) => s.includes('suite')), 'la reprise d’une même grille est marquée « suite »');
}

// ── Garde-fous sur les valeurs (contrat lib/print) ──────────────────────────
{
  // Un document officiel ne porte jamais NaN / undefined / [object Object].
  const sale = feuilleNotesSheets({
    school: { name: undefined, current_year: null },
    classe: undefined, periode: NaN,
    groupes: [{ id: 'g', label: undefined, colonnes: [{ id: 'g1', label: null, bareme: NaN }] }],
    eleves: [{ id: 'e', numero: undefined, nom: undefined }],
  });
  const audit = auditDocument(sale.sheets[0]);
  ok(audit.ok, `aucune valeur parasite imprimée${audit.ok ? '' : ` — ${JSON.stringify(audit.issues)}`}`);
}

// ── Anglais ─────────────────────────────────────────────────────────────────
{
  const en = feuilleNotesSheets({ ...base, sys: 'EN' }).sheets[0];
  ok(en.includes('MARK SHEET'), 'une classe anglophone reçoit une feuille en anglais');
  ok(en.includes('out of 5'), 'le barème est écrit « out of » côté anglophone');
}

// ── Rien à imprimer ─────────────────────────────────────────────────────────
{
  const vide = feuilleNotesSheets({ ...base, groupes: [] });
  ok(vide.sheets.length === 0 && vide.pages === 0,
    'aucune colonne → aucune feuille (et non une page blanche)');
}

console.log(failed ? '\n❌ ÉCHECS' : '\n✅ Tous les tests passent');
process.exit(failed ? 1 : 0);
