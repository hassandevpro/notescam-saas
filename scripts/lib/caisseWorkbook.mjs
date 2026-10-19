// Lecture et CLASSIFICATION d'un cahier de caisse scolaire au format
// « ORDRE / REPORT / ENTREES / DATES / SORTIES / MOTIFS / BALANCE / OBSERVAT° ».
//
// Ce module ne touche à aucune base. Il transforme une feuille tenue à la main
// en opérations exploitables, et il DIT ce qu'il n'a pas su lire plutôt que de
// deviner.
//
// Les cinq pièges du format, dans l'ordre où ils font perdre de l'argent :
//
//   1. SOUS-TOTAUX DE GROUPE. La colonne SORTIES porte, en fin de chaque groupe,
//      la somme du groupe (souvent via =SUM(...), parfois tapée à la main). La
//      lire comme une dépense DOUBLE le groupe. Sur les trois cahiers de The
//      Genius, cela représentait 131 404 390 FCFA de dépenses fantômes.
//   2. CELLULES FUSIONNÉES. ORDRE, DATES et BALANCE ne sont saisies que sur la
//      première ligne du groupe. Ce ne sont pas des données manquantes : c'est
//      la même valeur pour tout le groupe. Et la BALANCE ne vaut qu'après la
//      DERNIÈRE ligne du groupe, pas après chacune.
//   3. REPORT DE SOLDE. Il POSITIONNE le solde d'ouverture, il n'ajoute rien.
//      Le compter en recette gonfle les entrées de tout le solde précédent.
//   4. ANNEXES SOUS LA LIGNE TOTAL. Certains cahiers ajoutent, après le TOTAL du
//      mois, des récapitulatifs réglés par la BANQUE (« Salaires du personnel »,
//      « Sorties de banque ») dont le montant est posé en colonne ENTREES et le
//      libellé en colonne ORDRE. Ce ne sont pas des entrées en caisse.
//   5. TITRES FUSIONNÉS SUR TOUTE LA LARGEUR. Le texte du titre se retrouve dans
//      chaque cellule du bloc, y compris celles des montants.
//
// Dépendance : `xlsx` (SheetJS), déjà au projet.
import XLSX from 'xlsx';
import { readFileSync } from 'node:fs';

const MOIS = {
  JANVIER: 1, FEVRIER: 2, MARS: 3, AVRIL: 4, MAI: 5, JUIN: 6,
  JUILLET: 7, AOUT: 8, SEPTEMBRE: 9, OCTOBRE: 10, NOVEMBRE: 11, DECEMBRE: 12,
};

export const sansAccent = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

// Colonnes du cahier, par lettre.
const COL = { ordre: 'A', report: 'B', entree: 'C', date: 'D', sortie: 'E', libelle: 'F', balance: 'G', obs: 'H' };

function colToNum(s) { return [...s].reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0); }
function numToCol(n) { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - r - 1) / 26; } return s; }

// ── Montants ────────────────────────────────────────────────────────────────
// Un montant tapé « 254 08 » ou « 5 997  555 » est du TEXTE. On le lit sans le
// réécrire, et `suspect` dit que la valeur mérite un regard : c'est ainsi qu'on
// a retrouvé la balance « 254 08 » qui valait 254 080.
export function parseMontant(v) {
  if (v === null || v === undefined || v === '') return { value: null, suspect: false };
  if (typeof v === 'number') return { value: v, suspect: false };
  const brut = String(v);
  const s = brut.replace(/\s| /g, '').replace(',', '.');
  if (/^-?\d+(\.\d+)?$/.test(s)) return { value: Number(s), suspect: /\s| /.test(brut) };
  return { value: null, suspect: true, raison: `montant non numérique « ${brut} »` };
}

// ── Dates ───────────────────────────────────────────────────────────────────
// Les dates sont saisies à la main : « 1er/07/2026 », « 20/007/2026 »,
// « 13/02/025 ». On normalise ce qui est SÛR et on refuse le reste — une année
// sur trois chiffres est trop ambiguë pour être devinée en silence.
export function parseDate(v) {
  if (v === null || v === undefined || v === '') return { iso: null, note: null };
  if (v instanceof Date && !isNaN(v)) {
    return { iso: `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`, note: null };
  }
  if (typeof v === 'number') {
    // Série Excel (système 1900). Au-delà de 20000 ≈ 1954, en-deçà on refuse.
    if (v < 20000 || v > 80000) return { iso: null, note: `série de date hors plage « ${v} »` };
    const d = new Date(Math.round((v - 25569) * 86400000));
    return { iso: d.toISOString().slice(0, 10), note: null };
  }
  const brut = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(brut)) return { iso: brut, note: null };
  const m = brut.replace(/\s| /g, '').match(/^(1er|\d{1,2})[/-](\d{1,3})[/-](\d{2,4})$/i);
  if (!m) return { iso: null, note: `date non reconnue « ${brut} »` };
  const notes = [];
  const jour = /^1er$/i.test(m[1]) ? 1 : Number(m[1]);
  if (/^1er$/i.test(m[1])) notes.push('jour écrit « 1er »');
  const mois = Number(m[2].replace(/^0+(?=\d)/, ''));
  if (m[2].length === 3) notes.push(`mois saisi « ${m[2] }» (lu ${mois})`);
  if (!(mois >= 1 && mois <= 12)) return { iso: null, note: `mois invalide « ${m[2]} »` };
  if (!(jour >= 1 && jour <= 31)) return { iso: null, note: `jour invalide « ${m[1]} »` };
  // Une année sur 3 chiffres (« 025 », « 205 ») n'est PAS corrigée : on ne peut
  // pas distinguer une faute de frappe d'une autre, et une date inventée
  // rattacherait l'opération au mauvais mois comptable.
  if (m[3].length === 3) return { iso: null, note: `année saisie sur 3 chiffres « ${m[3]} »` };
  const annee = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return { iso: `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`, note: notes.join(' ; ') || null };
}

// ── Résolution des fusions ──────────────────────────────────────────────────
// `merged` = prolongement (la valeur vient d'ailleurs) ; `mergedAnchor` = la
// cellule où la valeur est saisie. La distinction n'est pas cosmétique : sans
// elle, l'ancre forme un bloc à elle seule et sa balance est comparée au solde
// du milieu du groupe au lieu de celui de la fin.
function resolveMerges(sheet) {
  for (const m of sheet['!merges'] || []) {
    const anchorRef = `${numToCol(m.s.c + 1)}${m.s.r + 1}`;
    const anchor = sheet[anchorRef];
    if (!anchor || anchor.v === null || anchor.v === undefined) continue;
    const ref = `${anchorRef}:${numToCol(m.e.c + 1)}${m.e.r + 1}`;
    anchor.__anchor = ref;
    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        if (r === m.s.r && c === m.s.c) continue;
        const k = `${numToCol(c + 1)}${r + 1}`;
        const cur = sheet[k];
        if (cur && cur.v !== null && cur.v !== undefined) continue;   // jamais écraser du réel
        // `w` (texte formaté) est repris avec la valeur : sinon une date héritée
        // d'un bloc fusionné se présenterait au contrôleur en série Excel brute.
        sheet[k] = { t: anchor.t, v: anchor.v, w: anchor.w, __merged: ref };
      }
    }
  }
  return sheet;
}

/**
 * Lit un cahier de caisse.
 * @param {string} filePath  chemin du .xlsx
 * @param {object} opts
 * @param {(titre:string)=>string} [opts.etabResolver]  titre de section → clé d'établissement
 * @param {string} [opts.label]  nom de fichier à inscrire dans la traçabilité
 */
export function readCashBook(filePath, { etabResolver, label } = {}) {
  // `cellDates: false` À DESSEIN. Avec `cellDates: true`, SheetJS rend un objet
  // Date dont la lecture locale retombe sur la VEILLE : le 16/07 du cahier
  // devenait le 15/07, et toutes les dépenses d'un même groupe glissaient d'un
  // jour — un décalage invisible à l'œil et faux dans les états mensuels. On lit
  // donc la série Excel brute et on la convertit en UTC (cf. parseDate).
  const wb = XLSX.read(readFileSync(filePath), { type: 'buffer', cellFormula: true, cellDates: false, cellNF: true });
  const file = label || filePath.split(/[\\/]/).pop();

  const sections = [], ops = [], controls = [], anomalies = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = resolveMerges(wb.Sheets[sheetName]);
    if (!sheet['!ref']) continue;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    let section = null;

    for (let r = range.s.r; r <= range.e.r; r++) {
      const cell = (letter) => sheet[`${letter}${r + 1}`];
      const val = (letter) => { const c = cell(letter); return c === undefined || c.v === undefined ? null : c.v; };
      const A = val(COL.ordre), B = val(COL.report), C = val(COL.entree), D = val(COL.date);
      const E = val(COL.sortie), F = val(COL.libelle), G = val(COL.balance), H = val(COL.obs);

      const txtA = typeof A === 'string' ? sansAccent(A) : '';
      const txtF = typeof F === 'string' ? sansAccent(F) : '';
      const cellE = cell(COL.sortie);
      const sommeFormule = !!(cellE && cellE.f && /^SUM\s*\(/i.test(cellE.f));

      // ── Titre de section (bloc mensuel) ────────────────────────────────────
      if (typeof A === 'string' && /ETA[TS]{0,2} DES DEPENSES/.test(txtA)) {
        if (cell(COL.ordre).__merged) continue;         // prolongement du titre
        const moisNom = Object.keys(MOIS).find((k) => txtA.includes(k));
        const annee = (txtA.match(/\b(20\d{2})\b/) || [])[1];
        section = {
          file, sheet: sheetName, titleRow: r + 1, titre: String(A).trim(),
          mois: moisNom ? MOIS[moisNom] : null,
          annee: annee ? Number(annee) : null,
          etab: etabResolver ? etabResolver(String(A)) : null,
          suite: txtA.includes('SUITE'),
          totalVu: false,
        };
        sections.push(section);
        continue;
      }

      if (txtA === 'ORDRE' || txtA === 'ODRE') continue;                       // en-tête de colonnes
      if ([A, B, C, D, E, F, G, H].every((x) => x === null)) continue;         // ligne vide

      const base = {
        file, sheet: sheetName, row: r + 1,
        section: section ? `${file}#${section.titleRow}` : null,
        etab: section?.etab ?? null,
        moisSection: section?.annee && section?.mois
          ? `${section.annee}-${String(section.mois).padStart(2, '0')}` : null,
        ordre: A,
        // Valeur de date TELLE QU'AFFICHÉE dans le cahier (`w` = texte formaté).
        // Sans elle, une date lue en série Excel se présenterait au contrôleur
        // sous la forme « 46219 », impossible à rapprocher de la pièce.
        dateSource: D === null ? null : (cell(COL.date)?.w || String(D)),
        // Date NORMALISÉE dès la lecture, y compris sur les lignes de contrôle.
        // Un report porte une date utile (« report au 23/06 ») : la laisser au
        // seul appelant l'obligerait à re-deviner le format, et « 6/23/26 » lu
        // en jour/mois donnerait un mois 23 — donc une date perdue.
        date: parseDate(D).iso,
        libelle: typeof F === 'string' ? F.trim() : null,
        obs: typeof H === 'string' ? H.trim() : null,
        ordreMerged: !!cell(COL.ordre)?.__merged,
        dateMerged: !!cell(COL.date)?.__merged,
        balanceBloc: cell(COL.balance)?.__merged || cell(COL.balance)?.__anchor
          || (G !== null ? `${file}!${COL.balance}${r + 1}` : null),
        balanceSource: G,
      };

      // ── TOTAL du mois, ou total de BANQUE ──────────────────────────────────
      if (/^TOTAL\b/.test(txtA)) {
        const banque = /BANQUE|BAQ|GENERAL/.test(txtA) || txtA === 'TOTAL G' || /BANQUE|BAQ/.test(txtF);
        if (!banque && section) section.totalVu = true;
        controls.push({
          ...base, type: banque ? 'total_banque' : 'total_mensuel',
          report: parseMontant(B).value, entrees: parseMontant(C).value,
          sorties: parseMontant(E).value, solde: parseMontant(G).value,
          montant: parseMontant(C).value ?? parseMontant(E).value,
        });
        continue;
      }

      // Retrait bancaire isolé : montant en ENTREES, mais la banque n'est pas la caisse.
      if (/SORTIES? (GENERALES? )?(DE )?(LA )?BANQUE/.test(txtF) && !parseMontant(E).value) {
        controls.push({ ...base, type: 'total_banque', montant: parseMontant(C).value });
        continue;
      }

      // ── Annexes placées APRÈS le TOTAL : réglées par la banque ─────────────
      if (section?.totalVu) {
        controls.push({ ...base, type: 'annexe_hors_caisse', intitule: typeof A === 'string' ? A.trim() : null, montant: parseMontant(C).value ?? parseMontant(E).value });
        continue;
      }

      // ── Sous-total de groupe : JAMAIS une dépense ─────────────────────────
      const mSortie = parseMontant(E);
      if (sommeFormule || (mSortie.value && !base.libelle && A === null)) {
        controls.push({ ...base, type: 'sous_total_groupe', montant: mSortie.value });
        continue;
      }

      // ── Report de solde : positionne le solde, n'est pas une recette ───────
      const mReport = parseMontant(B);
      if (/REPORT/.test(txtF) || (mReport.value && !parseMontant(C).value && !mSortie.value)) {
        controls.push({ ...base, type: 'report_solde', montant: mReport.value ?? parseMontant(G).value });
        continue;
      }

      // ── Approvisionnement de caisse ───────────────────────────────────────
      const mEntree = parseMontant(C);
      if (mEntree.value && mEntree.value > 0) {
        const d = parseDate(D);
        ops.push({ ...base, type: 'approvisionnement', montant: mEntree.value, date: d.iso, dateNote: d.note });
        continue;
      }

      // ── Dépense ───────────────────────────────────────────────────────────
      if (mSortie.value) {
        const d = parseDate(D);
        ops.push({ ...base, type: 'depense', montant: mSortie.value, date: d.iso, dateNote: d.note });
        continue;
      }

      // ── Ce qui n'a pas pu être classé est SIGNALÉ, pas ignoré ─────────────
      if (base.libelle || mSortie.suspect || mEntree.suspect) {
        anomalies.push({ ...base, probleme: mSortie.raison || mEntree.raison || 'ligne non classable (libellé sans montant)' });
      }
    }
  }

  // ── Soldes recalculés, bloc par bloc ──────────────────────────────────────
  const ecarts = [];
  for (const s of sections) {
    const key = `${s.file}#${s.titleRow}`;
    const items = [...ops, ...controls].filter((x) => x.section === key).sort((a, b) => a.row - b.row);
    const report = items.find((x) => x.type === 'report_solde');
    let solde = report?.montant || 0;
    for (const it of items) {
      if (it.type === 'approvisionnement') solde += it.montant;
      else if (it.type === 'depense') solde -= it.montant;
      else continue;
      it.soldeCalcule = solde;
    }

    // La balance d'un bloc fusionné se compare au solde après la DERNIÈRE
    // opération du bloc. Comparer ligne par ligne produirait un écart sur
    // chacune, pour une seule balance inscrite.
    const blocs = new Map();
    for (const it of items) {
      if (it.type === 'total_mensuel' || it.type === 'report_solde' || it.type === 'total_banque' || it.type === 'annexe_hors_caisse') continue;
      if (!it.balanceBloc) continue;
      if (!blocs.has(it.balanceBloc)) blocs.set(it.balanceBloc, []);
      blocs.get(it.balanceBloc).push(it);
    }
    for (const [bloc, membres] of blocs) {
      const avecOp = membres.filter((x) => x.type === 'depense' || x.type === 'approvisionnement');
      if (!avecOp.length) continue;
      const dernier = avecOp[avecOp.length - 1];
      const brut = membres.find((x) => x.balanceSource !== null && x.balanceSource !== undefined)?.balanceSource;
      const m = parseMontant(brut);
      if (m.value === null) {
        ecarts.push({ section: key, bloc, row: dernier.row, brut, inscrit: null, calcule: dernier.soldeCalcule, probleme: 'balance inscrite non numérique' });
        continue;
      }
      if (m.value !== dernier.soldeCalcule) {
        ecarts.push({ section: key, bloc, row: dernier.row, brut, inscrit: m.value, calcule: dernier.soldeCalcule, delta: dernier.soldeCalcule - m.value, probleme: m.suspect ? 'balance inscrite douteuse (espaces)' : 'balance de bloc ≠ solde recalculé' });
      }
    }

    const dep = items.filter((x) => x.type === 'depense');
    const app = items.filter((x) => x.type === 'approvisionnement');
    const total = items.find((x) => x.type === 'total_mensuel');
    s.resume = {
      nbDepenses: dep.length, nbAppros: app.length,
      sommeDepenses: dep.reduce((a, b) => a + b.montant, 0),
      sommeAppros: app.reduce((a, b) => a + b.montant, 0),
      report: report?.montant ?? null,
      soldeFinal: solde,
      totalInscrit: total ? { report: total.report, entrees: total.entrees, sorties: total.sorties, solde: total.solde } : null,
    };
    if (total) {
      s.resume.concordance = {
        sorties: total.sorties === s.resume.sommeDepenses,
        entrees: total.entrees === s.resume.sommeAppros,
        solde: total.solde === solde,
      };
    }
  }

  // ── Anomalies par opération ───────────────────────────────────────────────
  for (const o of ops) {
    if (o.dateNote) anomalies.push({ ...o, probleme: `date : ${o.dateNote}` });
    if (!o.date) anomalies.push({ ...o, probleme: 'aucune date exploitable' });
    if (o.type === 'depense' && !o.libelle) anomalies.push({ ...o, probleme: 'dépense sans libellé' });
    if (o.type === 'depense' && (o.ordre === null || o.ordre === undefined)) {
      anomalies.push({ ...o, probleme: "n° d'ordre absent de la source" });
    }
    if (o.libelle && (/[,(]$/.test(o.libelle)
        || /\s(le|la|les|du|de|des|pour|et|au|aux|un|une|par|sur|avec|dans|chez)$/i.test(o.libelle))) {
      anomalies.push({ ...o, probleme: 'libellé probablement tronqué (phrase interrompue)' });
    }
  }

  // Doublons POTENTIELS : même établissement, date, montant et libellé normalisé.
  // Le n° d'ordre ne sert PAS de critère : un groupe fusionné porte légitimement
  // plusieurs dépenses sous un même numéro.
  const vus = new Map();
  for (const o of ops.filter((x) => x.type === 'depense')) {
    const k = [o.etab, o.date, o.montant, sansAccent(o.libelle || '').replace(/\s+/g, ' ').trim()].join('|');
    if (!vus.has(k)) vus.set(k, []);
    vus.get(k).push(o.row);
  }
  const doublons = [...vus.entries()].filter(([, rows]) => rows.length > 1)
    .map(([cle, rows]) => ({ cle, rows }));

  return { file, sections, ops, controls, anomalies, ecarts, doublons };
}
