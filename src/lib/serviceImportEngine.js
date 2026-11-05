// ════════════════════════════════════════════════════════════════════════════
// IMPORT D'UN REGISTRE DE SERVICE — LE MODÈLE, LA LECTURE STRICTE, LE PLAN
// ════════════════════════════════════════════════════════════════════════════
//
// Module PUR : il ne touche ni la base ni l'écran. Il rend ce qu'il a compris et
// ce qu'il a refusé ; l'écriture est une autre décision (Cantine.jsx).
//
// ── POURQUOI UN MODÈLE À PART, ET PAS L'EXPORT ─────────────────────────────
//
// L'export est fait pour être LU (bloc Service/Année/Mois, N°, ligne Total,
// colonnes calculées « Reste » et « État »). Un fichier à importer doit être
// l'inverse : un en-tête fixe en ligne 1, une ligne par élève ET par mois, rien
// de calculé. Réimporter un export obligerait à deviner où commence le tableau,
// et on ne devine pas quand il s'agit d'argent.
//
// ── LA RÈGLE D'IDEMPOTENCE ─────────────────────────────────────────────────
//
// « Montant payé » du fichier = le CUMUL payé pour (élève, service, mois), pas
// un nouveau versement. L'import n'écrit que l'ÉCART avec ce que la base porte
// déjà. Réimporter le même fichier donne un écart nul : rien n'est écrit.
// Si la base porte DÉJÀ PLUS que le fichier, la ligne est rejetée (on ne retire
// jamais d'argent en silence : une contre-passation a un motif et un auteur).
//
// ── CE QUI N'EST JAMAIS DEVINÉ ─────────────────────────────────────────────
//
// Un homonyme, une classe inconnue, un mois hors année, un dû différent de celui
// de la base : la ligne est mise de côté avec sa raison, jamais « corrigée ».
import { normaliser, cleClasse, indexerEleves, rapprocher } from './rapprochementEleves.js';
import { serieExcelEnDate } from './registreServiceImport.js';

// ── LE MODÈLE ──────────────────────────────────────────────────────────────
export const ENTETES_MODELE = Object.freeze([
  'Mois', 'Matricule', 'Nom de l\'élève', 'Classe', 'Section', 'Service', 'Montant dû', 'Montant payé',
]);

// Les trois premières colonnes minimales + les montants sont obligatoires ;
// Matricule, Classe, Section, Service aident au rapprochement mais peuvent être vides.
const OBLIGATOIRES = ['Mois', 'Nom de l\'élève', 'Montant dû', 'Montant payé'];

export const ETATS_CALCULES = Object.freeze(['Payé', 'Partiel', 'Impayé', 'Exempté']);

const MOIS_NOMS = {
  janvier: 1, jan: 1, janv: 1, january: 1, fevrier: 2, fev: 2, febr: 2, feb: 2, february: 2,
  mars: 3, mar: 3, march: 3, avril: 4, avr: 4, apr: 4, april: 4, mai: 5, may: 5,
  juin: 6, jun: 6, june: 6, juillet: 7, juil: 7, jul: 7, july: 7, aout: 8, aug: 8, august: 8,
  septembre: 9, sept: 9, sep: 9, september: 9, octobre: 10, oct: 10, october: 10,
  novembre: 11, nov: 11, november: 11, decembre: 12, dec: 12, december: 12,
};
const NOMS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
  'septembre', 'octobre', 'novembre', 'décembre'];

const plat = (v) => String(v ?? '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/** Année de début d'une année scolaire : « 2026-2027 » → 2026. */
export function anneeDebut(annee) {
  const m = String(annee || '').match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

const cle = (an, mo) => `${an}-${String(mo).padStart(2, '0')}`;

/**
 * Traduit la cellule « Mois » en clé de période du service.
 * Accepte : 2026-11 · 11/2026 · Novembre 2026 · Nov 2026 · novembre · date Excel
 * · clé exacte du service (2026-T1) · libellé du service.
 * @returns {{ cle: string|null, raison?: string }}
 */
export function resoudreMois(texte, { mois = [], annee = '' } = {}) {
  const brut = String(texte ?? '').trim();
  if (!brut) return { cle: null, raison: 'Mois manquant.' };
  const cles = new Set(mois.map((m) => m.period_key));
  if (cles.has(brut)) return { cle: brut };
  const p = plat(brut);
  const parLibelle = mois.find((m) => plat(m.label) === p);
  if (parLibelle) return { cle: parLibelle.period_key };

  let an = null; let mo = null;
  let m;
  const serie = serieExcelEnDate(brut);
  if (serie) { [an, mo] = [Number(serie.slice(0, 4)), Number(serie.slice(5, 7))]; }
  else if ((m = p.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?$/))) { an = Number(m[1]); mo = Number(m[2]); }
  else if ((m = p.match(/^(\d{1,2})[-/.](\d{4})$/))) { mo = Number(m[1]); an = Number(m[2]); }
  else if ((m = p.match(/^([a-z]+)\.?\s*(\d{4})?$/)) && MOIS_NOMS[m[1]]) {
    mo = MOIS_NOMS[m[1]];
    an = m[2] ? Number(m[2]) : null;
  } else if ((m = p.match(/^([a-z]+)\.?\s*(\d{2})$/)) && MOIS_NOMS[m[1]]) {
    mo = MOIS_NOMS[m[1]]; an = 2000 + Number(m[2]);
  }
  if (!mo || mo < 1 || mo > 12) return { cle: null, raison: `Mois « ${brut} » non reconnu (écrire par exemple « novembre 2026 » ou « 2026-11 »).` };
  if (!an) {
    const debut = anneeDebut(annee);
    if (!debut) return { cle: null, raison: `Mois « ${brut} » sans année, et l'année scolaire est inconnue.` };
    an = mo >= 9 ? debut : debut + 1;
  }
  const k = cle(an, mo);
  if (!cles.has(k)) {
    return { cle: null, raison: `Le mois ${NOMS_FR[mo - 1]} ${an} n'est pas un mois de ce service pour l'année scolaire ${annee || 'active'}.` };
  }
  return { cle: k };
}

// ── LES CLASSES ET LEURS ALIAS ─────────────────────────────────────────────
const compact = (c) => cleClasse(c).replace(/ /g, '');

// Préfixes courants que les secrétaires abrègent : F1 → FORM1, CL1 → CLASS1.
const ABREVIATIONS = [['FORM', 'F'], ['CLASS', 'CL'], ['NURSERY', 'NURS'], ['NURSERY', 'N']];

/**
 * Retrouve la classe de la base désignée par un texte du fichier.
 * Ordre : alias de l'administrateur → nom exact (casse/accents/espaces) →
 * forme compacte (« Form 1 » = « Form1 ») → abréviation (« F1 » = FORM1).
 * Un texte qui désigne PLUSIEURS classes n'en désigne aucune.
 *
 * @param {string} texte
 * @param {Array<{id, name}>} classes
 * @param {Object<string,string>} aliases  { variante: nom exact de classe }
 * @returns {{ classe: object|null, raison?: string, via?: string }}
 */
export function resoudreClasse(texte, classes = [], aliases = {}) {
  const brut = String(texte ?? '').trim();
  if (!brut) return { classe: null, vide: true };
  const k = compact(brut);

  for (const [variante, cible] of Object.entries(aliases || {})) {
    if (compact(variante) === k) {
      const c = classes.find((x) => compact(x.name) === compact(cible));
      if (c) return { classe: c, via: 'alias' };
    }
  }
  const essais = [
    ['exact', (x) => cleClasse(x.name) === cleClasse(brut)],
    ['compact', (x) => compact(x.name) === k],
  ];
  for (const [via, test] of essais) {
    const r = classes.filter(test);
    if (r.length === 1) return { classe: r[0], via };
    if (r.length > 1) return { classe: null, raison: `Classe « ${brut} » ambiguë : ${r.map((x) => x.name).join(', ')}.` };
  }
  for (const [long, court] of ABREVIATIONS) {
    if (k.startsWith(court) && !k.startsWith(long)) {
      const developpe = long + k.slice(court.length);
      const r = classes.filter((x) => compact(x.name) === developpe);
      if (r.length === 1) return { classe: r[0], via: 'abreviation' };
    }
  }
  return { classe: null, raison: `Classe « ${brut} » inconnue. Voir l'onglet « Listes » du modèle, ou définir une équivalence.` };
}

// ── GÉNÉRER LE MODÈLE ──────────────────────────────────────────────────────
/**
 * Les trois feuilles du modèle, en tableaux de cellules (prêtes pour
 * `downloadExcelSheets`). Aucune ligne Total, aucun en-tête décoratif.
 */
export function genererModele({ service, annee = '', classes = [], mois = [], devise = 'XAF', exemples = null } = {}) {
  const nomService = service?.name || 'Service';
  const m1 = mois[0] || { period_key: '', label: '' };
  const m2 = mois[1] || m1;
  const classe1 = classes[0]?.name || 'FORM1';
  const classe2 = classes[1]?.name || classe1;
  const dû = Number(service?.amount) || 0;
  const defaut = [
    [m1.label || m1.period_key, 'MAT-EXEMPLE-1', 'EXEMPLE - Dupont Marie (supprimer cette ligne)', classe1, '', nomService, dû, dû],
    [m2.label || m2.period_key, '', 'EXEMPLE - Ngono Paul (supprimer cette ligne)', classe2, '', nomService, dû, 0],
  ];
  const importRows = [[...ENTETES_MODELE], ...(exemples || defaut)];

  const instructions = [
    ['Instructions — import d\'un registre de service'],
    [`Service : ${nomService} · Année scolaire : ${annee || '—'} · Devise : ${devise}`],
    [],
    ['Règle générale', 'Une ligne par élève ET par mois. La feuille « Import » commence à la ligne 1 avec l\'en-tête, sans titre, sans ligne Total. Supprimez les deux lignes d\'exemple (marquées EXEMPLE).'],
    [],
    ['Colonne', 'Obligatoire', 'Contenu', 'Formats acceptés'],
    ['Mois', 'Oui', 'Le mois concerné, dans l\'année scolaire du service.', 'novembre 2026 · Nov 2026 · 2026-11 · 11/2026 · ou le libellé exact de l\'onglet « Listes »'],
    ['Matricule', 'Non (conseillé)', 'Identifiant de l\'élève. Il passe AVANT le nom.', 'Texte, tel qu\'il figure dans NotesCam'],
    ['Nom de l\'élève', 'Oui', 'Nom complet. L\'ordre nom/prénom, les accents, les majuscules et les espaces en trop sont tolérés.', 'Texte'],
    ['Classe', 'Non (conseillé)', 'Aide à départager deux homonymes. Doit exister dans l\'établissement.', 'Voir l\'onglet « Listes » ; variantes reconnues (Form 1, F1, 5ème…)'],
    ['Section', 'Non', 'Information seulement : la section est déduite de la classe.', 'Texte'],
    ['Service', 'Non', 'Si rempli, doit être le service de ce registre.', nomService],
    ['Montant dû', 'Oui', `Ce que l'élève doit pour ce mois (${devise}).`, 'Nombre entier ≥ 0, sans texte. 15000 ou 15 000'],
    ['Montant payé', 'Oui', `Le CUMUL déjà payé pour ce mois (${devise}), pas un nouveau versement.`, 'Nombre entier ≥ 0, jamais supérieur au montant dû'],
    [],
    ['Calculé par NotesCam (ne pas saisir)', '', 'Reste à payer et État (Payé / Partiel / Impayé).', ''],
    [],
    ['Règles de rapprochement'],
    ['1', 'Par matricule, si renseigné. Un matricule inconnu rejette la ligne (on ne bascule pas sur le nom).'],
    ['2', 'Sinon par nom normalisé (majuscules, accents, espaces, ordre nom/prénom) ; la classe départage les homonymes.'],
    ['3', 'Deux candidats possibles : la ligne est mise de côté et listée. NotesCam ne choisit jamais au hasard.'],
    [],
    ['Réimport'],
    ['', 'Réimporter le même fichier ne change rien : seul l\'écart entre le payé du fichier et le payé déjà en base est écrit. Si la base a déjà PLUS payé que le fichier, la ligne est rejetée.'],
    ['', 'Les versements importés sont des versements de REPRISE : datés du 1er du mois, hors arrêté de caisse, annulables en bloc.'],
    [],
    ['Erreurs fréquentes'],
    ['', 'Réimporter le fichier EXPORTÉ du registre : c\'est un état à lire, pas un modèle. Utilisez ce modèle.'],
    ['', 'Mois écrit sans année alors que le mois est hors de l\'année scolaire.'],
    ['', 'Montant écrit avec « XAF » ou une virgule décimale : écrire un nombre entier.'],
    ['', 'Ligne Total ajoutée en bas : elle est ignorée, mais ne l\'ajoutez pas, elle fragilise le fichier.'],
  ];

  const nLignes = Math.max(classes.length, mois.length, ETATS_CALCULES.length, 1);
  const listes = [['Classes de l\'établissement', 'Mois de l\'année scolaire', 'Service', 'États (calculés)']];
  for (let i = 0; i < nLignes; i++) {
    listes.push([
      classes[i]?.name || '', mois[i]?.label || mois[i]?.period_key || '',
      i === 0 ? nomService : '', ETATS_CALCULES[i] || '',
    ]);
  }
  return [
    { name: 'Import', rows: importRows },
    { name: 'Instructions', rows: instructions },
    { name: 'Listes', rows: listes },
  ];
}

// ── DÉTECTER UN EXPORT ─────────────────────────────────────────────────────
/**
 * Vrai si la feuille est un EXPORT de registre (bloc Service/Année/Mois, colonnes
 * « Dû (XAF) » / « Payé (XAF) » / « Reste » / « État », ligne « Total du mois »).
 */
export function estUnExport(aoa = []) {
  const lignes = (Array.isArray(aoa) ? aoa : []).slice(0, 40);
  const premiere = (x) => (Array.isArray(x) ? plat(x[0]) : '');
  const bloc = lignes.some((x) => premiere(x) === 'service' && x[1])
    && lignes.some((x) => ['annee', 'year', 'ano'].includes(premiere(x)));
  let colonnes = false; let total = false;
  for (const r of lignes) {
    if (!Array.isArray(r)) continue;
    const p = r.map(plat);
    const dueCol = p.some((c) => /^(du|due|debido)( \(|$)/.test(c));
    const payeCol = p.some((c) => /^(paye|paid|pagado)( \(|$)/.test(c));
    if (dueCol && payeCol) colonnes = true;
    if (p.some((c) => /^(total du mois|month total|total del mes)$/.test(c))) total = true;
  }
  return bloc || colonnes || total;
}

export const MESSAGE_EXPORT =
  'Ce fichier est un export, pas un modèle d\'import. Téléchargez le modèle d\'import (bouton « Télécharger le modèle d\'import »), recopiez-y les données, puis importez-le.';

// ── LIRE LE FICHIER ────────────────────────────────────────────────────────
function lireMontant(v) {
  const s = String(v ?? '').trim();
  if (s === '') return { vide: true };
  const net = s.replace(/[\s  ]/g, '').replace(/(xaf|fcfa|f|cfa)$/i, '');
  if (!/^\d+$/.test(net)) {
    if (/^-\d+$/.test(net)) return { erreur: 'montant négatif' };
    if (/^\d+[.,]\d+$/.test(net)) {
      const n = Number(net.replace(',', '.'));
      if (Number.isInteger(n)) return { valeur: n };
      return { erreur: 'montant avec décimales (écrire un entier)' };
    }
    return { erreur: `« ${s} » n'est pas un nombre` };
  }
  return { valeur: Number(net) };
}

/**
 * Lit la feuille « Import ». STRICT : l'en-tête est en ligne 1.
 * @returns {{ ok: boolean, erreur?: string, estExport?: boolean, lignes: Array, ignorees: Array, rejets: Array }}
 */
export function lireImport(aoa = []) {
  const rows = Array.isArray(aoa) ? aoa : [];
  if (estUnExport(rows)) return { ok: false, estExport: true, erreur: MESSAGE_EXPORT, lignes: [], ignorees: [], rejets: [] };
  const entete = (rows[0] || []).map((c) => plat(c));
  const idx = {};
  for (const nom of ENTETES_MODELE) {
    const i = entete.indexOf(plat(nom));
    if (i >= 0) idx[nom] = i;
  }
  const manquantes = OBLIGATOIRES.filter((n) => idx[n] === undefined);
  if (manquantes.length) {
    return {
      ok: false,
      erreur: `En-tête non conforme en ligne 1 : colonne(s) manquante(s) « ${manquantes.join('», « ')} ». `
        + 'Utilisez le modèle d\'import, sans rien ajouter au-dessus de l\'en-tête.',
      lignes: [], ignorees: [], rejets: [],
    };
  }
  const lignes = []; const ignorees = []; const rejets = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r) || r.every((c) => String(c ?? '').trim() === '')) continue;
    const num = i + 1;
    const val = (nom) => (idx[nom] === undefined ? '' : String(r[idx[nom]] ?? '').trim());
    const nom = val('Nom de l\'élève');
    if (/^exemple\b/i.test(plat(nom))) { ignorees.push({ ligne: num, nom, raison: 'Ligne d\'exemple ignorée.' }); continue; }
    if (/^(total|totaux|total general)\b/i.test(plat(nom)) || /^(total|totaux)\b/i.test(plat(val('Mois')))) {
      ignorees.push({ ligne: num, nom: nom || val('Mois'), raison: 'Ligne Total ignorée.' }); continue;
    }
    const dû = lireMontant(val('Montant dû'));
    const paye = lireMontant(val('Montant payé'));
    const erreurs = [];
    if (!nom && !val('Matricule')) erreurs.push({ colonne: 'Nom de l\'élève', message: 'Nom (ou matricule) manquant.' });
    if (dû.vide) erreurs.push({ colonne: 'Montant dû', message: 'Montant dû manquant.' });
    else if (dû.erreur) erreurs.push({ colonne: 'Montant dû', message: `Montant dû invalide : ${dû.erreur}.` });
    if (paye.vide) erreurs.push({ colonne: 'Montant payé', message: 'Montant payé manquant (écrire 0 si rien n\'est payé).' });
    else if (paye.erreur) erreurs.push({ colonne: 'Montant payé', message: `Montant payé invalide : ${paye.erreur}.` });
    if (!erreurs.length && paye.valeur > dû.valeur) {
      erreurs.push({ colonne: 'Montant payé', message: `Payé (${paye.valeur}) supérieur au dû (${dû.valeur}).` });
    }
    const base = {
      ligne: num, moisTexte: val('Mois'), matricule: val('Matricule'), nom,
      classeTexte: val('Classe'), section: val('Section'), serviceTexte: val('Service'),
      du: dû.valeur ?? null, paye: paye.valeur ?? null,
    };
    if (erreurs.length) rejets.push({ ...base, etat: 'invalide', erreurs, raison: erreurs.map((e) => e.message).join(' ') });
    else lignes.push(base);
  }
  if (!lignes.length && !rejets.length) {
    return {
      ok: false,
      erreur: ignorees.length
        ? 'La feuille « Import » ne contient que des lignes d\'exemple ou de total : remplacez-les par les données de l\'école.'
        : 'La feuille « Import » ne contient aucune ligne de données.',
      lignes, ignorees, rejets,
    };
  }
  return { ok: true, lignes, ignorees, rejets };
}

// ── LE PLAN ────────────────────────────────────────────────────────────────
export const MODE_REPRISE = 'reprise';

/**
 * Compare le fichier à la base et dit, ligne par ligne, ce qui serait écrit.
 * Rien n'est écrit ici.
 *
 * @param {object}   o
 * @param {Array}    o.lignes      sortie de `lireImport().lignes`
 * @param {Array}    o.eleves      [{ id, name, className, matricule }]
 * @param {Array}    o.classes     [{ id, name }]
 * @param {object}   o.aliases     { variante: nom de classe }
 * @param {Array}    o.mois        [{ period_key, label }]
 * @param {string}   o.annee       année scolaire
 * @param {object}   o.service     { id, name }
 * @param {Array}    o.abonnements abonnements de CE service [{ id, student_id, status }]
 * @param {Array}    o.echeances   échéances de CE service [{ id, student_id, period_key, amount_due, status }]
 * @param {function} o.payeDe      (echeanceId) → somme déjà versée (contre-passations incluses)
 */
export function planifierImport({
  lignes = [], eleves = [], classes = [], aliases = {}, mois = [], annee = '',
  service = null, abonnements = [], echeances = [], payeDe = () => 0,
} = {}) {
  const index = indexerEleves(eleves);
  const parMatricule = new Map();
  for (const e of eleves) {
    const m = normaliser(e.matricule);
    if (m) parMatricule.set(m, [...(parMatricule.get(m) || []), e]);
  }
  const aboParEleve = new Map(
    abonnements.filter((a) => a.status !== 'removed').map((a) => [a.student_id, a]));
  const echParCle = new Map(echeances.map((e) => [`${e.student_id}|${e.period_key}`, e]));
  const nomService = normaliser(service?.name);

  const retenues = []; const rejets = []; const ambigus = []; const avertissements = [];
  const vues = new Map();   // doublons dans le fichier

  const rejeter = (l, etat, raison, extra = {}) => rejets.push({ ...l, etat, raison, ...extra });

  for (const l of lignes) {
    // — mois
    const m = resoudreMois(l.moisTexte, { mois, annee });
    if (!m.cle) { rejeter(l, 'mois', m.raison, { colonne: 'Mois' }); continue; }
    // — service
    if (l.serviceTexte && nomService && normaliser(l.serviceTexte) !== nomService) {
      rejeter(l, 'service', `Ligne d'un autre service (« ${l.serviceTexte} » au lieu de « ${service?.name} »).`, { colonne: 'Service' }); continue;
    }
    // — classe
    const c = resoudreClasse(l.classeTexte, classes, aliases);
    if (!c.vide && !c.classe) {
      rejeter(l, 'classe', c.raison, { colonne: 'Classe' }); continue;
    }
    // — élève : matricule d'abord
    let eleve = null; let passe = null;
    if (l.matricule) {
      const t = parMatricule.get(normaliser(l.matricule)) || [];
      if (t.length === 1) { eleve = t[0]; passe = 'matricule'; }
      else if (t.length > 1) {
        ambigus.push({ ...l, etat: 'ambigu', raison: `Le matricule « ${l.matricule} » désigne ${t.length} élèves.`, candidats: t.map(({ id, name, className }) => ({ id, name, className })) });
        continue;
      } else { rejeter(l, 'matricule', `Matricule « ${l.matricule} » introuvable en base.`, { colonne: 'Matricule' }); continue; }
    } else {
      const r = rapprocher({ nom: l.nom, classe: c.classe?.name || l.classeTexte }, index);
      if (r.etat === 'ambigu') {
        ambigus.push({ ...l, etat: 'ambigu', raison: 'Plusieurs élèves portent ce nom : ajouter le matricule ou la classe.', candidats: r.candidats.map(({ id, name, className }) => ({ id, name, className })) });
        continue;
      }
      if (r.etat !== 'trouve') { rejeter(l, 'absent', 'Élève introuvable en base (aucun élève créé en silence).', { colonne: 'Nom de l\'élève' }); continue; }
      eleve = r.eleve; passe = r.passe;
    }
    if (c.classe && eleve.className && cleClasse(eleve.className) !== cleClasse(c.classe.name)) {
      avertissements.push({ ligne: l.ligne, message: `Classe du fichier (${c.classe.name}) différente de celle de la base (${eleve.className}) pour ${eleve.name}.` });
    }
    // — doublon dans le fichier
    const clef = `${eleve.id}|${m.cle}`;
    const deja = vues.get(clef);
    if (deja) {
      if (deja.du === l.du && deja.paye === l.paye) {
        rejeter(l, 'doublon', `Doublon exact de la ligne ${deja.ligne} : ignoré.`, { benin: true });
      } else {
        rejeter(l, 'doublon', `Même élève et même mois que la ligne ${deja.ligne} avec des montants différents.`);
      }
      continue;
    }
    vues.set(clef, l);

    // — contre la base
    const abo = aboParEleve.get(eleve.id) || null;
    const ech = echParCle.get(clef) || null;
    const dejaPaye = ech ? Math.max(0, Math.floor(Number(payeDe(ech.id)) || 0)) : 0;
    if (ech && ['exempted', 'abandoned', 'not_applicable'].includes(ech.status)) {
      rejeter(l, 'statut', `Ce mois est « ${ech.status} » en base : décision manuelle de l'école, non modifiée.`); continue;
    }
    if (ech && Number(ech.amount_due) !== l.du) {
      rejeter(l, 'du_different', `Dû différent : ${ech.amount_due} en base, ${l.du} dans le fichier. Corriger l'un ou l'autre.`, { colonne: 'Montant dû' }); continue;
    }
    if (dejaPaye > l.paye) {
      rejeter(l, 'deja_plus', `La base porte déjà ${dejaPaye} payé, le fichier seulement ${l.paye}. Rien n'est retiré en silence (contre-passation manuelle).`, { colonne: 'Montant payé' }); continue;
    }
    const delta = l.paye - dejaPaye;
    const statut = !ech ? 'nouveau' : (delta > 0 ? 'maj' : 'identique');
    retenues.push({
      ...l, statut, passe, student_id: eleve.id, period_key: m.cle,
      eleveBase: { name: eleve.name, className: eleve.className, matricule: eleve.matricule, created_at: eleve.created_at || null },
      classeId: c.classe?.id || null,
      abonnement: abo ? { id: abo.id } : null,
      creerAbonnement: !abo,
      echeance: ech ? { id: ech.id } : null,
      creerEcheance: !ech,
      dejaPaye, versement: delta,
    });
  }

  const bénins = rejets.filter((r) => r.benin);
  const somme = (a, f) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  return {
    retenues, rejets, ambigus, avertissements,
    resume: {
      lues: lignes.length,
      rapprochees: retenues.length,
      nouvelles: retenues.filter((x) => x.statut === 'nouveau').length,
      majs: retenues.filter((x) => x.statut === 'maj').length,
      identiques: retenues.filter((x) => x.statut === 'identique').length,
      doublons: bénins.length + rejets.filter((r) => r.etat === 'doublon' && !r.benin).length,
      rejetees: rejets.length,
      ambigues: ambigus.length,
      abonnementsACreer: new Set(retenues.filter((x) => x.creerAbonnement).map((x) => x.student_id)).size,
      totalDu: somme(retenues, (x) => x.du),
      totalPayeFichier: somme(retenues, (x) => x.paye),
      totalAEcrire: somme(retenues, (x) => x.versement),
    },
  };
}

/** Identifiant de lot : sert de référence aux versements et de repère d'annulation. */
export function nouveauLot(maintenant = new Date(), hasard = Math.random) {
  const p = (n) => String(n).padStart(2, '0');
  const d = maintenant;
  const alea = Math.floor(hasard() * 36 ** 3).toString(36).padStart(3, '0').toUpperCase();
  return `IMPORT-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}-${alea}`;
}

/** Date d'un versement de reprise : le 1er du mois concerné. */
export const dateReprise = (periodKey) => {
  const m = String(periodKey || '').match(/^(\d{4})-(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-01` : null;
};

/** Rapport téléchargeable : tout ce qui n'est pas passé, avec sa raison, au format du modèle. */
export function lignesRapport({ plan, importees = [], devise = 'XAF' } = {}) {
  const entete = ['Ligne', 'Résultat', 'Raison', ...ENTETES_MODELE];
  const brut = (l) => [l.moisTexte, l.matricule, l.nom, l.classeTexte, l.section, l.serviceTexte, l.du ?? '', l.paye ?? ''];
  const rows = [entete];
  for (const l of importees) rows.push([l.ligne, `Importée (${l.statut})`, l.versement ? `+${l.versement} ${devise}` : '', ...brut(l)]);
  for (const l of plan?.ambigus || []) rows.push([l.ligne, 'Ambigu', `${l.raison} Candidats : ${(l.candidats || []).map((c) => `${c.name} (${c.className || '—'})`).join(' ; ')}`, ...brut(l)]);
  for (const l of plan?.rejets || []) if (!l.benin) rows.push([l.ligne, 'Rejetée', l.raison, ...brut(l)]);
  return rows;
}

/** Même rapport, mais SEULEMENT les lignes rejetées/ambiguës, au format du modèle : à corriger puis réimporter. */
export function lignesAReimporter(plan) {
  const brut = (l) => [l.moisTexte, l.matricule, l.nom, l.classeTexte, l.section, l.serviceTexte, l.du ?? '', l.paye ?? ''];
  return [
    [...ENTETES_MODELE],
    ...[...(plan?.ambigus || []), ...(plan?.rejets || []).filter((r) => !r.benin)].map(brut),
  ];
}
