// ════════════════════════════════════════════════════════════════════════════
// LIRE LE REGISTRE D'UN SERVICE TENU SOUS EXCEL
// ════════════════════════════════════════════════════════════════════════════
//
// Écrit pour le classeur réel « TRANSPORT 2026.xlsx » de THE GENIUS, qui est la
// manière dont l'école tient son transport depuis des années. On n'a pas
// demandé à l'école de ranger son fichier : c'est NotesCam qui s'adapte.
//
// ── CE QUE CE FICHIER NOUS A APPRIS ────────────────────────────────────────
//
// Une feuille, TROIS tableaux empilés, chacun avec ses colonnes :
//
//  1. LE REGISTRE   « FRAIS/MOIS · FRAIS ANNUEL · 1er TRIM · 2ème TRIM ·
//     3ème TRIM · TOTAL ANNUEL ». Les trois colonnes trimestrielles sont les
//     VERSEMENTS reçus — démontré : leur somme égale TOTAL ANNUEL au franc près,
//     et la ligne TOTAUX de l'école le confirme (12 705 500 encaissés sur
//     13 568 000 attendus).
//
//  2. LES SORTIS    « PAIEMENT MOIS · PAIEMENT ANNUEL · DÉJÀ PAYER ·
//     RESTE A PAYER · OBSERVATIONS OU RAISONS ». Un cumul, pas un détail, et
//     une RAISON écrite à la main : « Affectation des parents », « Démenagés »,
//     « Jambe fracturée », « Défaut de paiement ». Cette colonne est la mémoire
//     de l'école ; la perdre à l'import serait perdre le pourquoi des 690 500
//     qui restent dus par des élèves partis.
//
//  3. UN RELEVÉ     mêmes colonnes que (2), des élèves presque soldés. Onze
//     lignes, dont deux qui figurent DÉJÀ dans le registre.
//
// ── CE QUI EST SIGNALÉ ET JAMAIS CORRIGÉ EN SILENCE ────────────────────────
//
// Le fichier d'une école vivante contient des accrocs, et ce n'est pas à un
// import de les trancher :
//
//  • `reste ≠ annuel − payé` (une ligne : 60 000 − 35 000 donne 25 000, la
//    feuille écrit 2 500) ;
//  • `annuel` non multiple du tarif mensuel (29 élèves sur 203 : des montants
//    négociés, pas des fautes) ;
//  • un même nom dans deux tableaux (22 cas) ;
//  • UNE LIGNE POUR PLUSIEURS ÉLÈVES : « FAMILLE FOMETEU (04) », 6 000/mois et
//    192 000 à l'année, soit quatre enfants sur une seule ligne ;
//  • la colonne OBSERVATIONS contenant un numéro de série Excel (une date).
//
// Chaque accroc sort dans `anomalies`, avec son numéro de ligne, pour qu'un
// humain décide. Rien n'est deviné : une écriture financière inventée coûte
// plus cher qu'un import refusé.
//
// ── CE QUE CE MODULE NE FAIT PAS ───────────────────────────────────────────
//
// Il n'écrit rien. Il rend ce qu'il a lu et ce qu'il n'a pas compris. L'écriture
// est une autre décision, et elle demande une autorisation.

// Les en-têtes, reconnus sur leur SENS et non sur leur position : l'école
// renverra le fichier l'an prochain avec d'autres hauteurs de lignes.
// `exact` là où le mot est trop court pour être cherché en préfixe : « no »
// est le préfixe de « NOMS ET PRENOMS », et sans cette distinction la colonne
// N° volait la colonne des noms dès que la première cellule était vide — ce qui
// est le cas du troisième tableau du classeur de THE GENIUS, resté invisible.
const COLONNES = [
  { cle: 'ordre',     mots: ['n°', 'no', 'num', 'n'], exact: true },
  { cle: 'nom',       mots: ['noms et prenoms', 'noms', 'nom', 'eleve'] },
  { cle: 'classe',    mots: ['classe'] },
  { cle: 'residence', mots: ['residence', 'quartier'] },
  { cle: 'tarif',     mots: ['frais/mois', 'frais mois', 'paiement mois', 'frais par mois'] },
  { cle: 'annuel',    mots: ['frais annuel', 'paiement annuel'] },
  { cle: 't1',        mots: ['1er trim', '1er trimestre'] },
  { cle: 't2',        mots: ['2eme trim', '2ème trim', '2e trim'] },
  { cle: 't3',        mots: ['3eme trim', '3ème trim', '3e trim'] },
  { cle: 'totalPaye', mots: ['total annuel'] },
  { cle: 'dejaPaye',  mots: ['deja payer', 'deja paye', 'montant deja paye', 'montant deja payer'] },
  { cle: 'reste',     mots: ['reste a payer', 'reste'] },
  { cle: 'motif',     mots: ['observations ou raisons', 'observations', 'observation', 'observat'] },
];

// Comparaison tolérante : les en-têtes réels portent des accents, des degrés,
// des doubles espaces et des retours à la ligne.
function plat(v) {
  return String(v ?? '').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

// Meme en-tete, espaces en moins. La feuille COLLEGE du classeur de THE GENIUS
// titre « FRAIS / MOIS » (espaces autour de la barre) la ou les deux autres
// ecrivent « FRAIS/MOIS » : aucun mot de `COLONNES` ne tombait dessus, la
// colonne du tarif restait introuvable, et les 37 eleves du college sortaient
// tous en `sans_tarif` — un fichier de l'annee EN COURS, refuse en entier pour
// deux espaces. On compare donc aussi les formes sans espace : c'est la meme
// regle que le reste du lecteur (reconnaitre le SENS, pas la frappe).
const compacte = (v) => plat(v).replace(/ /g, '');

function nombre(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

// Un numéro de série Excel glissé dans une colonne de texte. 40000 ≈ 2009,
// 50000 ≈ 2036 : hors de cette fourchette, c'est un vrai nombre, pas une date.
export function serieExcelEnDate(v) {
  const s = String(v ?? '').trim();
  if (!/^\d{5}$/.test(s)) return null;
  const n = Number(s);
  if (n < 40000 || n > 50000) return null;
  const d = new Date(Math.round((n - 25569) * 86400000));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// Une ligne qui désigne PLUSIEURS élèves : « FAMILLE FOMETEU (04) ». Le nombre
// entre parenthèses est l'effectif. On ne fabrique pas quatre élèves à partir
// d'un nom de famille — on le signale.
export function compteEleves(nom) {
  const m = String(nom ?? '').match(/\((\d{1,2})\)\s*$/);
  if (m) return Math.max(1, Number(m[1]));
  return /\bfamille\b/i.test(String(nom ?? '')) ? 0 : 1;   // 0 = effectif inconnu
}

// L'ANNEE QUE LA FEUILLE ANNONCE DANS SON TITRE.
//
// Le classeur de THE GENIUS porte DESORMAIS trois feuilles et DEUX annees :
// « ... FRAIS DE TRANSPORT DU TROISIEME TRIMESTRE ANNEE SCOLAIRE 2025/2026 »,
// puis « ... DU 1er TRIMESTRE ANNEE 2026/2027 » et la feuille du COLLEGE,
// 2026/2027 elle aussi. Importer la premiere dans l'annee en cours ferait
// devoir une annee entiere de transport a 211 eleves qui l'ont deja payee, et
// gonflerait la recette de l'exercice de treize millions.
//
// Le lecteur ne decide rien et ne corrige rien : il REND ce que la feuille dit
// d'elle-meme, et c'est l'ecran qui compare avec l'annee visee. Null quand la
// feuille ne dit pas son annee — on ne devine pas une annee comptable.
export function anneeAnnoncee(aoa = []) {
  const rows = Array.isArray(aoa) ? aoa.slice(0, 6) : [];
  for (const r of rows) {
    if (!Array.isArray(r)) continue;
    const texte = r.map((c) => String(c ?? '')).join(' ');
    const m = /\b(20\d{2})\s*[/–—-]\s*(20\d{2})\b/.exec(texte);
    if (m && Number(m[2]) === Number(m[1]) + 1) return `${m[1]}-${m[2]}`;
  }
  return null;
}

/**
 * Repère les tableaux d'une feuille et lit leurs lignes.
 *
 * @param {Array<Array>} aoa  la feuille en tableau de tableaux (XLSX header:1)
 * @returns {{ tableaux: Array, anomalies: Array, eleves: Array }}
 */
export function lireRegistre(entree = []) {
  // `= []` ne couvre QUE `undefined` : un `null` passait au travers et levait.
  // Un lecteur de fichier doit refuser proprement, jamais planter — il est
  // appelé sur ce que l'utilisateur a sous la main.
  const aoa = Array.isArray(entree) ? entree : [];
  const tableaux = [];
  const anomalies = [];

  // ── Les lignes d'en-tête : celles qui nomment au moins le NOM et un MONTANT.
  const entetes = [];
  aoa.forEach((r, i) => {
    if (!Array.isArray(r)) return;
    const vus = {};
    r.forEach((cell, c) => {
      const p = plat(cell);
      if (!p) return;
      for (const col of COLONNES) {
        if (vus[col.cle] !== undefined) continue;
        const k = compacte(cell);
        const touche = col.exact
          ? col.mots.some((m) => p === m || k === compacte(m))
          : col.mots.some((m) => p === m || p.startsWith(m)
            || k === compacte(m) || k.startsWith(compacte(m)));
        if (touche) { vus[col.cle] = c; break; }
      }
    });
    if (vus.nom !== undefined && (vus.tarif !== undefined || vus.annuel !== undefined)) {
      entetes.push({ ligne: i, cols: vus });
    }
  });

  if (!entetes.length) {
    return { tableaux: [], anomalies: [{ type: 'aucun_tableau', message: 'Aucune ligne d’en-tête reconnue.' }], eleves: [], annee: anneeAnnoncee(aoa) };
  }

  // ── Chaque tableau court de son en-tête jusqu'au suivant, ou à la fin.
  entetes.forEach((e, k) => {
    const fin = k + 1 < entetes.length ? entetes[k + 1].ligne : aoa.length;
    const { cols } = e;
    const lignes = [];
    let totaux = null;
    for (let i = e.ligne + 1; i < fin; i++) {
      const r = aoa[i];
      if (!Array.isArray(r)) continue;
      const nomBrut = String(r[cols.nom] ?? '').trim();
      if (!nomBrut) continue;

      // La ligne TOTAUX de l'école : on la garde pour SE CONTRÔLER, et on ne la
      // confond jamais avec un élève. C'est elle qui m'a évité de lire
      // « 1 754 750 /mois » comme le tarif d'un enfant.
      // « TOTAUX » au premier tableau, « TOTAL » aux deux autres. Le motif
      // /^totaux?$/ ne reconnaissait que le premier, et les deux lignes de
      // total devenaient des élèves — dont un « tarif » de 117 000/mois.
      if (/^(total|totaux|totals|totales|total general)$/i.test(plat(nomBrut))) {
        totaux = {
          ligne: i + 1,
          tarif: nombre(r[cols.tarif]), annuel: nombre(r[cols.annuel]),
          t1: nombre(r[cols.t1]), t2: nombre(r[cols.t2]), t3: nombre(r[cols.t3]),
          totalPaye: nombre(r[cols.totalPaye]), dejaPaye: nombre(r[cols.dejaPaye]),
          reste: nombre(r[cols.reste]),
        };
        continue;
      }
      if (COLONNES.some((c) => c.mots.includes(plat(nomBrut)))) continue;   // en-tête répété

      const tarif = nombre(r[cols.tarif]);
      const annuel = nombre(r[cols.annuel]);
      const motifBrut = cols.motif !== undefined ? String(r[cols.motif] ?? '').trim() : '';
      const dateDansMotif = serieExcelEnDate(motifBrut);

      const versements = [];
      if (cols.t1 !== undefined) {
        [['T1', cols.t1], ['T2', cols.t2], ['T3', cols.t3]].forEach(([p, c]) => {
          const v = nombre(r[c]);
          if (v > 0) versements.push({ trimestre: p, montant: v });
        });
      }
      const paye = cols.t1 !== undefined
        ? versements.reduce((s, v) => s + v.montant, 0)
        : nombre(r[cols.dejaPaye]);
      const resteEcrit = cols.reste !== undefined ? nombre(r[cols.reste]) : null;
      const totalEcrit = cols.totalPaye !== undefined ? nombre(r[cols.totalPaye]) : null;

      lignes.push({
        source: { ligne: i + 1 },
        nom: nomBrut.replace(/\s+/g, ' '),
        nbEleves: compteEleves(nomBrut),
        classe: String(r[cols.classe] ?? '').trim(),
        residence: cols.residence !== undefined ? String(r[cols.residence] ?? '').trim() : '',
        tarif, annuel, versements, paye,
        reste: resteEcrit !== null ? resteEcrit : Math.max(0, annuel - paye),
        resteEcrit, totalEcrit,
        // Un motif qui n'est qu'une date n'est pas un motif : on le déplace.
        motif: dateDansMotif ? '' : motifBrut,
        // ATTENTION : cette date est celle que l'école a notée dans la colonne
        // OBSERVATIONS, et on NE SAIT PAS ce qu'elle datait — un départ, un
        // dernier versement, un rappel. Elle n'est donc jamais présentée comme
        // la date d'un versement : ce serait inventer une écriture de caisse.
        dateObservee: dateDansMotif,
      });
    }
    // ── LE TYPE SE DÉCIDE SUR LE CONTENU, PAS SUR L'EN-TÊTE ────────────────
    //
    // Défaut trouvé au banc le 2026-10-31 : « a une colonne OBSERVATIONS donc
    // liste des partants » est faux. Le classeur de THE GENIUS a DEUX tableaux
    // à colonne d'observations — l'un recense les élèves SORTIS avec leur
    // raison (« Affecté à Yaoundé », « Jambe fracturée »), l'autre est un
    // simple relevé d'élèves ACTIFS presque soldés, dont la colonne est vide.
    // Les prendre tous pour des partants aurait abandonné onze abonnements en
    // cours : une erreur qui coûte de l'argent, pas de l'affichage.
    //
    // Deux indices décident, et ils se renforcent : l'école a titré la colonne
    // « OBSERVATIONS OU RAISONS » quand elle y notait des motifs, et ces
    // tableaux-là portent effectivement un motif sur la plupart de leurs
    // lignes. Il faut les deux faisceaux pour conclure au départ.
    const avecMotif = lignes.filter((l) => l.motif).length;
    const enteteDitRaison = cols.motif !== undefined
      && plat(aoa[e.ligne]?.[cols.motif]).includes('raison');
    const type = cols.t1 !== undefined ? 'registre'
      : (enteteDitRaison || (lignes.length > 0 && avecMotif / lignes.length >= 0.5)) ? 'sortis'
        : 'releve';
    for (const l of lignes) l.source.tableau = type;
    tableaux.push({ type, ligneEntete: e.ligne + 1, cols, lignes, totaux });
  });

  // ── Les accrocs, ligne par ligne, jamais corrigés ────────────────────────
  const vuPar = new Map();
  for (const tb of tableaux) {
    for (const l of tb.lignes) {
      const k = plat(l.nom);
      vuPar.set(k, [...(vuPar.get(k) || []), l.source]);

      if (l.nbEleves === 0) {
        anomalies.push({ type: 'effectif_inconnu', ligne: l.source.ligne, nom: l.nom,
          message: `« ${l.nom} » désigne une famille sans effectif chiffré.` });
      } else if (l.nbEleves > 1) {
        anomalies.push({ type: 'plusieurs_eleves', ligne: l.source.ligne, nom: l.nom, nbEleves: l.nbEleves,
          message: `« ${l.nom} » porte ${l.nbEleves} élèves sur une seule ligne : il faut leurs noms.` });
      }
      if (l.resteEcrit !== null && l.annuel > 0 && l.resteEcrit !== l.annuel - l.paye) {
        anomalies.push({ type: 'reste_incoherent', ligne: l.source.ligne, nom: l.nom,
          message: `${l.annuel} − ${l.paye} = ${l.annuel - l.paye}, mais la feuille écrit ${l.resteEcrit}.` });
      }
      if (l.totalEcrit !== null && l.totalEcrit !== l.paye) {
        anomalies.push({ type: 'total_incoherent', ligne: l.source.ligne, nom: l.nom,
          message: `la somme des trimestres fait ${l.paye}, la colonne TOTAL écrit ${l.totalEcrit}.` });
      }
      if (l.tarif > 0 && l.annuel > 0 && l.annuel % l.tarif !== 0) {
        anomalies.push({ type: 'annuel_non_multiple', ligne: l.source.ligne, nom: l.nom,
          message: `${l.annuel} ÷ ${l.tarif} = ${(l.annuel / l.tarif).toFixed(2)} périodes : montant négocié à confirmer.` });
      }
      // CE QUI BLOQUE, C'EST L'ABSENCE D'ENGAGEMENT ANNUEL, PAS CELLE DU MOIS.
      // `planifierReprise` ecrit l'abonnement et l'echeance au montant ANNUEL ;
      // le tarif mensuel ne vit que dans le libelle (« il renseigne, il n'engage
      // pas »). Les confondre dans un seul refus ecartait une ligne parfaitement
      // ecrivable, et le message affirmait « ni tarif ni montant annuel » devant
      // un montant annuel bien present.
      if (!l.annuel) {
        anomalies.push({ type: 'sans_tarif', ligne: l.source.ligne, nom: l.nom,
          message: l.tarif
            ? `tarif mensuel ${l.tarif} mais aucun montant annuel : l'engagement de l'annee ne se deduit pas du mois.`
            : 'ni tarif mensuel ni montant annuel : rien a ecrire.' });
      } else if (!l.tarif) {
        anomalies.push({ type: 'tarif_mensuel_absent', ligne: l.source.ligne, nom: l.nom,
          message: `montant annuel ${l.annuel} sans tarif mensuel : l'annuel suffit a ecrire, le mois n'est qu'une indication.` });
      }
      if (l.paye > l.annuel && l.annuel > 0) {
        anomalies.push({ type: 'trop_percu', ligne: l.source.ligne, nom: l.nom,
          message: `${l.paye} encaissés pour ${l.annuel} dus.` });
      }
    }
    // Le contrôle qui compte : ma lecture contre la ligne TOTAUX de l'école.
    if (tb.totaux) {
      const somme = (f) => tb.lignes.reduce((s, l) => s + f(l), 0);
      const mien = { annuel: somme((l) => l.annuel), paye: somme((l) => l.paye) };
      if (tb.totaux.annuel && mien.annuel !== tb.totaux.annuel) {
        anomalies.push({ type: 'total_tableau', ligne: tb.totaux.ligne, nom: 'TOTAUX',
          message: `attendu : je lis ${mien.annuel}, la feuille totalise ${tb.totaux.annuel}.` });
      }
      const payeFeuille = tb.totaux.totalPaye || tb.totaux.dejaPaye;
      if (payeFeuille && mien.paye !== payeFeuille) {
        anomalies.push({ type: 'total_tableau', ligne: tb.totaux.ligne, nom: 'TOTAUX',
          message: `encaissé : je lis ${mien.paye}, la feuille totalise ${payeFeuille}.` });
      }
    }
  }
  for (const [k, sources] of vuPar) {
    if (sources.length > 1) {
      anomalies.push({ type: 'doublon', nom: k, ligne: sources[0].ligne, sources,
        message: `présent dans ${sources.length} lignes (${sources.map((s) => s.tableau + ' L' + s.ligne).join(', ')}).` });
    }
  }

  // ── Les élèves, dédoublonnés : la DERNIÈRE mention gagne ────────────────
  // Un élève du registre repris au tableau des sortis EST un sortant : sa
  // situation la plus récente est celle du bas de la feuille, pas celle du haut.
  const eleves = [];
  const parNom = new Map();
  for (const tb of tableaux) {
    for (const l of tb.lignes) {
      const k = plat(l.nom);
      const dejaLa = parNom.get(k);
      const enrichi = { ...l, sortant: tb.type === 'sortis' };
      if (dejaLa === undefined) { parNom.set(k, eleves.length); eleves.push(enrichi); }
      else eleves[dejaLa] = { ...enrichi, repris: [...(eleves[dejaLa].repris || []), eleves[dejaLa].source] };
    }
  }

  return { tableaux, anomalies, eleves, annee: anneeAnnoncee(aoa) };
}

/** Le compte, pour le rapport de simulation. */
export function resumeRegistre({ tableaux = [], anomalies = [], eleves = [] } = {}) {
  const somme = (l, f) => l.reduce((s, x) => s + f(x), 0);
  const parType = {};
  for (const a of anomalies) parType[a.type] = (parType[a.type] || 0) + 1;
  return {
    nbTableaux: tableaux.length,
    parTableau: tableaux.map((tb) => ({
      type: tb.type, lignes: tb.lignes.length,
      annuel: somme(tb.lignes, (l) => l.annuel), paye: somme(tb.lignes, (l) => l.paye),
      reste: somme(tb.lignes, (l) => l.reste),
      totauxFeuille: tb.totaux,
    })),
    elevesDistincts: eleves.length,
    sortants: eleves.filter((e) => e.sortant).length,
    tarifs: [...new Set(eleves.map((e) => e.tarif).filter((v) => v > 0))].sort((a, b) => a - b),
    attendu: somme(eleves, (l) => l.annuel),
    encaisse: somme(eleves, (l) => l.paye),
    restant: somme(eleves, (l) => l.reste),
    versements: somme(eleves, (l) => l.versements.length),
    // AUCUN versement n'a de date dans ce fichier : les colonnes trimestrielles
    // donnent des montants, jamais un jour. C'est la décision qui reste à
    // prendre avant d'écrire, et elle n'est pas technique.
    sansDate: somme(eleves, (l) => l.versements.length),
    datesObservees: eleves.filter((l) => l.dateObservee).length,
    anomalies: parType,
    bloquantes: anomalies.filter((a) => ['plusieurs_eleves', 'effectif_inconnu', 'sans_tarif'].includes(a.type)).length,
  };
}
