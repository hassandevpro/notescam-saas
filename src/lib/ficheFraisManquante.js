// ── Les fiches de frais absentes : décider QUI en reçoit une, et à quel tarif ─
//
// Défaut constaté le 2026-11-01 sur THE GENIUS (audit de réconciliation,
// `docs/AUDIT_SCOLARITE_GENIUS.md`) : 17 élèves sur 713 n'avaient AUCUNE ligne
// `student_fees` pour l'année. Or la scolarité attendue se calcule
// `Σ student_fees.frais_annuels` (`budgetAnalyticsEngine.js`) : un élève sans
// fiche compte pour ZÉRO, en silence. Résultat, 3 320 000 FCFA de scolarité
// jamais réclamés, et aucun écran pour le dire.
//
// Pourquoi une fonction pure, et pas directement un script : ouvrir une fiche de
// frais crée une créance au nom d'un élève. La règle qui décide doit être lisible
// et testable hors de toute base, parce qu'une erreur ici facture quelqu'un à
// tort — ou le dispense à tort.
//
// LA GRILLE EST UN PARAMÈTRE, JAMAIS UNE CONSTANTE. Les tarifs d'une école ne
// vivent pas dans ce dépôt : ils viennent de l'école. Un tarif codé en dur ici
// serait faux pour la deuxième école qui l'utiliserait.

// Les trois raisons de NE PAS créer une fiche. Nommées, parce qu'un refus muet
// est un refus que personne ne vérifie.
export const REFUS_FICHE = Object.freeze({
  DEJA_LA:   'deja_la',    // une fiche existe : la recréer doublerait la créance
  ARCHIVE:   'archive',    // élève sorti : facturer un partant est une décision, pas un correctif
  SANS_TARIF: 'sans_tarif', // sa classe n'est dans aucune ligne de la grille : on ne devine pas
});

function cle(nom) {
  return String(nom ?? '').trim().toUpperCase();
}

/**
 * Indexe une grille tarifaire par nom de classe.
 *
 * @param grille [{ libelle, tarif, classes:[nom…] }]
 * @returns { parClasse: Map<string, {libelle, tarif}>, doublons:[nom…] }
 *
 * Une classe citée par DEUX lignes est un défaut de la grille, pas un détail à
 * arbitrer : deux tarifs pour une même classe, et le résultat dépendrait de
 * l'ordre de lecture. On le signale au lieu de choisir.
 */
export function indexerGrille(grille = []) {
  const parClasse = new Map();
  const doublons = [];
  for (const ligne of grille || []) {
    const tarif = Math.max(0, Math.floor(Number(ligne?.tarif) || 0));
    for (const nom of ligne?.classes || []) {
      const k = cle(nom);
      if (!k) continue;
      if (parClasse.has(k)) { doublons.push(nom); continue; }
      parClasse.set(k, { libelle: ligne?.libelle || '', tarif });
    }
  }
  return { parClasse, doublons };
}

/**
 * Décide, élève par élève, s'il faut ouvrir une fiche de frais.
 *
 * @param eleves         [{ id, nom, classe, archive }]
 * @param feesExistantes [{ student_id }] — les fiches DÉJÀ là pour cette année
 * @param grille         voir `indexerGrille`
 * @returns { aCreer, ecartes, resume }
 *
 * `aCreer` ne porte QUE ce qui est décidable sans deviner : l'élève, sa classe,
 * et le tarif que la grille attribue à cette classe. Le montant n'est jamais
 * inventé : sans ligne de grille, l'élève part dans `ecartes`.
 */
export function planifierFichesManquantes({ eleves = [], feesExistantes = [], grille = [] } = {}) {
  const { parClasse, doublons } = indexerGrille(grille);
  const deja = new Set((feesExistantes || []).map((f) => f?.student_id).filter(Boolean));

  const aCreer = [];
  const ecartes = [];
  for (const e of eleves || []) {
    if (!e?.id) continue;
    const base = { id: e.id, nom: e.nom || '—', classe: e.classe || '—', matricule: e.matricule || '' };

    if (deja.has(e.id)) { ecartes.push({ ...base, refus: REFUS_FICHE.DEJA_LA }); continue; }
    // Un élève archivé a quitté l'école. Lui ouvrir une créance de scolarité
    // annuelle pleine est un choix de politique — il appartient à l'école, pas
    // à un correctif technique. On l'écarte et on le dit.
    if (e.archive) { ecartes.push({ ...base, refus: REFUS_FICHE.ARCHIVE }); continue; }

    const ligne = parClasse.get(cle(e.classe));
    if (!ligne) { ecartes.push({ ...base, refus: REFUS_FICHE.SANS_TARIF }); continue; }

    aCreer.push({ ...base, frais_annuels: ligne.tarif, section: ligne.libelle });
  }

  const parRefus = {};
  for (const x of ecartes) parRefus[x.refus] = (parRefus[x.refus] || 0) + 1;

  return {
    aCreer,
    ecartes,
    resume: {
      eleves: (eleves || []).length,
      aCreer: aCreer.length,
      ecartes: ecartes.length,
      parRefus,
      montant: aCreer.reduce((s, x) => s + x.frais_annuels, 0),
      grilleDoublons: doublons,
      // Le bouclage : tout élève est soit à créer, soit écarté avec un motif.
      // Si cette égalité tombe, un élève s'est perdu en route.
      boucle: aCreer.length + ecartes.length === (eleves || []).filter((e) => e?.id).length,
    },
  };
}
