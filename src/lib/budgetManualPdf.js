// Manuel d'emploi du système budgétaire hybride — PDF téléchargeable.
//
// Généré côté client avec jsPDF (comme idCardPdf.js) : aucun appel réseau, donc
// disponible en LAN hors ligne comme au Cloud. Le contenu est la version courte
// de docs/MANUEL_BUDGET_HYBRIDE.md — quand ce document change, mettre à jour LES
// DEUX.
//
// CARACTÈRES — vérifié en générant réellement un PDF puis en le relisant :
//   OK      : accents (é è à ç ê î ô û), « », tiret cadratin —, apostrophe ’, …
//   CASSÉS  : flèches (→ devient « !’ »), coches (✓ devient « ' »), emoji.
// Le contenu est donc écrit en français correctement accentué, et `clean()` ne
// neutralise QUE ce qui ne se dessine pas.
import { jsPDF } from 'jspdf';

const A4 = { w: 210, h: 297 };
const M = { top: 20, bottom: 18, left: 18, right: 18 };
const CONTENT_W = A4.w - M.left - M.right;

// Neutralise UNIQUEMENT ce que la police ne sait pas dessiner. Les accents, les
// guillemets français, le tiret cadratin et l'apostrophe typographique sont
// conservés : ils sortent correctement (testé).
function clean(s) {
  return String(s ?? '')
    .replace(/[→⟶]/g, '->').replace(/[←⟵]/g, '<-')
    .replace(/[✓✔]/g, '')
    // Emoji et pictogrammes divers.
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── Contenu du manuel (structure déclarative) ────────────────────────────────
// Types : h1 | h2 | h3 | p | bullets | kv (2 colonnes) | note | space | page
const DOC = [
  { h1: "Manuel d’emploi — Système budgétaire hybride" },
  { p: "Ce manuel décrit le parcours complet, de la création des rôles jusqu’au suivi de l’exécution." },
  { note: "Le principe à retenir : l’argent est géré SUR PLACE (le serveur LAN de l’école est la seule autorité qui écrit), et la gouvernance se fait À DISTANCE (la direction décide depuis le Cloud). Le Cloud ne modifie jamais directement une donnée financière : il envoie des demandes que le serveur de l’école applique." },

  { h2: 'Phase A — Préparation technique' },
  { h3: 'Étape 1 — Migrations et redéploiement' },
  { p: "À faire une seule fois par établissement, avant toute utilisation. Dans Supabase (SQL Editor), exécuter dans l’ordre :" },
  { bullets: [
    'supabase_budget_lines_v3.sql — modèle de budget v3',
    'supabase_budget_enforcement_v3.sql — contrôles serveur',
    'supabase_budget_ops_v3.sql — réallocation et révision',
    'supabase_budget_finance_grants_v4.sql — droits financiers',
    'supabase_governance.sql et supabase_governance_catalog.sql — rôles',
    'supabase_validation_rules.sql — barème de validation',
    'supabase_notifications.sql — notifications internes',
    'supabase_phase_f_budget_rls.sql — isolation par rôle et par secteur',
  ] },
  { p: "Puis redéployer les fonctions edge : sync-pull, sync-push, sync-verify, sync-repair." },
  { note: "Sauter cette étape ne produit aucun message clair : le budget semble fonctionner, puis perd des données à la synchronisation. Vérifiez-la en premier devant tout comportement étrange." },

  { h3: 'Étape 2 — Activer le mode hybride' },
  { bullets: [
    "Côté Cloud : Paramètres, puis Préparer le mode hybride, puis générer un code d’appairage (valable 30 minutes).",
    "Côté serveur LAN : écran d’accueil, puis « Connecter à une école Cloud », puis saisir le code.",
    "Attendre la fin de la synchronisation initiale.",
  ] },
  { p: "Repère permanent : un bandeau orange « Gouvernance à distance » apparaît en haut de la page Budgets côté Cloud. Ce bandeau change le sens de tous les boutons d’enregistrement (voir étape 17)." },

  { h2: "Phase B — Structure de l’établissement" },
  { h3: 'Étape 3 — Déclarer les unités (secteurs)' },
  { p: "Paramètres, puis Unités de l’établissement. Créez une unité par secteur réel : Maternelle, Primaire, Collège, Lycée. Ce sont des unités STRUCTURELLES, pas des classes." },

  { h3: 'Étape 4 — Créer les comptes du personnel' },
  { p: "Personnel, puis choisir le département, puis Ajouter un agent. Renseignez au minimum le nom, le DÉPARTEMENT, et créez l’accès. Sans compte, une personne ne reçoit ni notification ni droit." },

  { h3: 'Étape 5 — Attribuer les rôles de gouvernance' },
  { p: "Personnel, onglet Gouvernance, puis Attributions. Ces rôles s’AJOUTENT au rôle de base du compte." },
  { kv: [
    ['Fondatrice', 'Complexe — autorité la plus haute, dernier recours'],
    ['Coordonnateur Général', 'Complexe — valide selon les seuils, arbitre'],
    ['RAF', 'Complexe — prépare le budget, valide les petits montants'],
    ['Contrôleur', 'Complexe — consultation et audit uniquement'],
    ['Caissier', 'Complexe — décaisse uniquement'],
    ['Principal / Vice-principal', 'Collège — demandent, ne valident pas'],
    ['Directrice du primaire (et adjointe)', 'Primaire — demandent, ne valident pas'],
    ['Responsable de la maternelle', 'Maternelle — demande, ne valide pas'],
  ] },
  { note: "Règle de conception : les chefs de secteur DEMANDENT, ils ne valident pas. La validation revient au RAF, au Coordonnateur et à la Fondatrice selon le montant. Le Caissier ne fait que payer ce qui est déjà approuvé." },

  { h3: 'Étape 6 — Régler le barème de validation' },
  { p: "Le barème répond à une seule question : quel montant exige quelle signature ? Valeurs par défaut :" },
  { kv: [
    ['Moins de 25 000', 'RAF'],
    ['De 25 000 à 250 000', 'Coordonnateur Général'],
    ['Au-delà de 250 000', 'Fondatrice'],
  ] },
  { p: "Ces seuils sont modifiables par établissement : aucun montant n’est figé dans le logiciel. Le validateur est celui dont le palier correspond EXACTEMENT au montant ; seule la Fondatrice fait office de dernier recours." },

  { page: true },

  { h2: 'Phase C — Construction du budget' },
  { p: "Le modèle comporte trois niveaux : BUDGET ANNUEL, puis RUBRIQUE, puis LIGNE. C’est la LIGNE qui porte l’argent ; la rubrique n’est qu’un regroupement. Les totaux par période et par secteur sont CALCULÉS à partir des lignes, jamais saisis deux fois." },

  { h3: 'Étape 7 — Configurer les périodes budgétaires' },
  { p: "Budgets, puis bouton Périodes. Créez les périodes de l’exercice : nom libre, date de début, date de fin. Ces périodes sont propres au budget (ce ne sont pas les séquences de notes) et ne doivent JAMAIS se chevaucher." },

  { h3: 'Étape 8 — Créer le budget annuel' },
  { p: "Budgets, puis Créer le budget annuel, puis saisir l’enveloppe de l’exercice. Le statut n’est jamais saisi : il se déduit des lignes." },
  { kv: [
    ['Brouillon', "aucune ligne activée"],
    ['Partiellement actif', 'certaines lignes activées'],
    ['Actif', 'toutes les lignes prévues sont activées'],
    ['Clôturé', "l’exercice a été explicitement fermé"],
  ] },

  { h3: 'Étape 9 — Créer les rubriques et les lignes' },
  { p: "Créez vos rubriques (Fonctionnement, Personnel, Investissement), puis les lignes. Pour chaque ligne : un libellé, un MONTANT ANNUEL, et une PORTÉE — soit Complexe (toute l’école), soit Secteurs (certaines unités seulement)." },

  { h3: 'Étape 10 — Répartir chaque ligne' },
  { p: "Ouvrir la ligne, puis Répartir. Indiquez le pourcentage du montant annuel consommable sur chaque période : la somme doit faire 100 %. Si la portée est Secteurs, cochez les secteurs concernés et donnez leur pourcentage : la somme doit aussi faire 100 %." },
  { note: "Le logiciel ne répartit JAMAIS le reste à votre place. Il affiche « X % restent à répartir » et vous laisse décider : une répartition automatique serait une décision budgétaire prise par la machine." },

  { h3: 'Étape 11 — Activer les lignes' },
  { p: "Une ligne en brouillon n’engage rien : aucune dépense ne peut s’y imputer. L’activation est refusée tant que le montant n’est pas défini, que la somme des pourcentages diffère de 100 %, ou que l’activation ferait dépasser l’enveloppe annuelle." },
  { p: "Vous n’avez pas besoin que toutes les rubriques soient prêtes : une ligne bien configurée s’active seule et devient utilisable." },
  { note: "Une ligne activée se FIGE. Son montant, sa portée et ses répartitions ne se modifient plus directement ; il faut passer par une réallocation ou une révision, qui laissent une trace. C’est la garantie qu’un budget voté ne se réécrit pas en silence." },

  { page: true },

  { h2: 'Phase D — Exploitation quotidienne' },
  { h3: 'Étape 12 — Saisir une dépense' },
  { p: "Dépenses, puis sélectionner la LIGNE, puis Nouvelle dépense. Renseignez catégorie, fournisseur, montant, demandeur, DATE, justificatif." },
  { bullets: [
    "La PÉRIODE n’est pas choisie : elle est déduite de la date de la dépense. Si aucune période ne couvre cette date, ou si deux se chevauchent, la dépense est refusée.",
    "Le SECTEUR doit être autorisé par la ligne, ou bien Complexe / Global. Une dépense Maternelle sur une ligne réservée au Primaire est refusée.",
  ] },

  { h3: 'Étape 13 — Le circuit de validation' },
  { p: "Brouillon, puis Soumise, puis Approuvée, puis Payée. Avec deux issues latérales : Refusée, et Annulée (tracée, jamais supprimée)." },
  { kv: [
    ['Brouillon', "n’engage rien, modifiable, supprimable"],
    ['Soumise', 'engage le budget, part vers le validateur du palier'],
    ['Approuvée', 'bon à payer'],
    ['Payée', 'décaissée par le Caissier'],
    ['Annulée', 'conservée avec son motif, jamais effacée'],
  ] },
  { p: "Le blocage en cas de dépassement est dur et vérifié côté serveur, à quatre niveaux successifs : la ligne, la période, le secteur, puis l’enveloppe annuelle. Le premier niveau qui manque de place bloque la dépense et vous indique lequel." },

  { h3: 'Étape 14 — Une ligne est épuisée' },
  { p: "Quand une dépense dépasse le disponible, elle est bloquée. Vous pouvez demander un DÉBLOCAGE depuis le même écran. La demande part au décideur habilité pour ce montant, qui a trois réponses possibles :" },
  { kv: [
    ['Refuser', 'rien ne change'],
    ['Autoriser exceptionnellement', 'ce dépassement passe, la ligne reste intacte'],
    ['Augmenter la ligne', 'le montant est relevé définitivement'],
  ] },
  { p: "Toutes les demandes et décisions sont historisées avec leur auteur, leur date et leur motif." },

  { h3: 'Étape 15 — Réallouer ou réviser' },
  { bullets: [
    "RÉALLOCATION : déplacer du montant d’une ligne vers une autre. Le total annuel ne change pas. On ne peut pas retirer ce qui est déjà engagé.",
    "RÉVISION : changer l’enveloppe annuelle. Elle ne peut pas descendre sous les engagements ni sous la somme des lignes activées.",
  ] },

  { h2: 'Phase E — Suivi et incidents' },
  { h3: "Étape 16 — Suivre l’exécution" },
  { p: "Budget global : vue d’ensemble du budget annuel jusqu’à la ligne, avec ventilation par période et par secteur. Un chef de secteur n’y voit que son secteur. Tableau de bord du groupe : vue consolidée de la direction générale. Pour chaque ligne vous lisez : alloué, engagé, payé, disponible." },

  { h3: 'Étape 17 — Ce qui change vraiment en mode hybride' },
  { p: "Section la plus importante de ce manuel, et source de la quasi-totalité des incompréhensions." },
  { note: "Quand le bandeau orange est affiché, les boutons d’enregistrement du Cloud N’ENREGISTRENT PAS : ils envoient une demande." },
  { p: "Concrètement, si vous répartissez une ligne depuis le Cloud : vous validez ; le message affiché est « Demande envoyée, en attente d’application par le serveur de l’école » ; les champs reviennent à 0 % parce que rien n’a encore été écrit ; le serveur LAN applique dès qu’il est joignable ; alors seulement les pourcentages apparaissent." },
  { p: "Votre saisie n’est pas perdue : le bandeau orange liste les demandes en attente et leur état. Une demande qui reste en attente très longtemps signale que le serveur de l’école n’est pas joignable, ou que sa synchronisation est bloquée." },
  { p: "Le serveur LAN revérifie tout avant d’appliquer (droit, école, version, plafonds) et peut donc REFUSER une demande ; vous serez notifié du refus avec son motif." },
  { kv: [
    ["À faire sur le poste de l’école (LAN)", 'périodes, lignes, répartitions, activations, saisie des dépenses'],
    ['À faire depuis le Cloud', 'approuver, refuser, arbitrer un déblocage, trancher une révision'],
  ] },

  { h3: 'Étape 18 — Notifications' },
  { kv: [
    ['Dépense soumise', 'le validateur du palier correspondant au montant'],
    ['Dépense approuvée', 'le demandeur et le Caissier'],
    ['Dépense refusée, payée, annulée', 'le demandeur'],
    ['Déblocage demandé', 'le décideur habilité au montant'],
    ['Déblocage tranché', 'le demandeur'],
    ['Réallocation ou révision', 'le décideur, puis le demandeur'],
  ] },
  { note: "À ce jour, seules les notifications INTERNES existent (cloche et page Notifications). L’e-mail, le SMS et WhatsApp sont prévus mais aucun message n’est encore envoyé vers l’extérieur." },

  { page: true },

  { h2: 'Dépannage' },
  { kv: [
    ['La répartition revient à 0 % après enregistrement', "Mode hybride : c’était une demande, pas un enregistrement. Vérifier le bandeau orange et l’état des demandes."],
    ["Impossible d’activer une ligne", "Somme des pourcentages différente de 100 %, ou dépassement de l’enveloppe. Le bouton indique la raison exacte."],
    ['Dépense refusée : aucune période', "La date ne tombe dans aucune période budgétaire. Corriger la date ou la période."],
    ['Dépense refusée : chevauchement', 'Deux périodes couvrent la même date. Corriger leurs dates.'],
    ['Ligne active : allocations non modifiables', 'Comportement normal. Passer par une réallocation ou une révision.'],
    ["Le Cloud affiche moins que le poste de l’école", "Synchronisation incomplète, ou migrations de l’étape 1 non appliquées."],
    ['Un utilisateur ne voit pas le menu Budgets', 'Aucun rôle de gouvernance attribué à son compte (étape 5).'],
    ["Un directeur ne voit qu’une partie des données", 'Comportement normal : son rôle est borné à son secteur.'],
  ] },

  { h2: 'Limites connues à ce jour' },
  { bullets: [
    "PAS DE RECETTES : le budget ne couvre que les dépenses. Les recettes prévisionnelles ne s’y saisissent pas, donc pas de solde prévisionnel.",
    "PAS D’ENVOI EXTERNE : aucune notification ne part par e-mail, SMS ou WhatsApp.",
    "Pas de rapport d’exécution imprimable consolidé, ni de document de clôture d’exercice.",
    "Contrôles d’action côté serveur incomplets : « le Caissier ne crée pas » et « le RAF ne valide pas au-dessus de son palier » sont appliqués par l’interface ; le serveur contrôle l’accès au module et le secteur, mais pas encore chaque action individuellement.",
    "Pas de tableau de bord dédié par rôle : chacun voit le tableau de bord général, filtré à son périmètre.",
  ] },
];

// ── Moteur de rendu ──────────────────────────────────────────────────────────
export function buildBudgetManualPdf({ schoolName = null } = {}) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  let y = M.top;

  const footer = () => {
    const n = pdf.internal.getNumberOfPages();
    pdf.setFont('helvetica', 'normal').setFontSize(8).setTextColor(140);
    pdf.text(clean(schoolName || 'NotesCam'), M.left, A4.h - 10);
    pdf.text(String(n), A4.w - M.right, A4.h - 10, { align: 'right' });
    pdf.setTextColor(0);
  };

  const newPage = () => { footer(); pdf.addPage(); y = M.top; };
  // Réserve la place du bloc à venir ; saute de page si elle manque.
  const need = (h) => { if (y + h > A4.h - M.bottom) newPage(); };

  const write = (text, { size = 10, style = 'normal', color = 0, indent = 0, gap = 4 } = {}) => {
    pdf.setFont('helvetica', style).setFontSize(size).setTextColor(color);
    const lines = pdf.splitTextToSize(clean(text), CONTENT_W - indent);
    const lh = size * 0.42;
    for (const line of lines) {
      need(lh);
      pdf.text(line, M.left + indent, y);
      y += lh;
    }
    y += gap;
    pdf.setTextColor(0);
  };

  for (const block of DOC) {
    if (block.page) { newPage(); continue; }
    if (block.space) { y += block.space; continue; }

    if (block.h1) {
      write(block.h1, { size: 19, style: 'bold', gap: 2 });
      pdf.setDrawColor(79, 70, 229).setLineWidth(0.8);
      need(3); pdf.line(M.left, y, M.left + 45, y); y += 6;
      continue;
    }
    if (block.h2) {
      need(16); y += 3;
      write(block.h2, { size: 14, style: 'bold', color: 60, gap: 3 });
      continue;
    }
    if (block.h3) { need(12); write(block.h3, { size: 11, style: 'bold', gap: 2.5 }); continue; }
    if (block.p)  { write(block.p, { size: 10, gap: 3.5 }); continue; }

    if (block.bullets) {
      for (const b of block.bullets) {
        const lh = 4.2;
        need(lh);
        pdf.setFont('helvetica', 'normal').setFontSize(10);
        pdf.text('-', M.left + 2, y);
        write(b, { size: 10, indent: 7, gap: 1.5 });
      }
      y += 2;
      continue;
    }

    if (block.kv) {
      const colW = 62;
      for (const [k, v] of block.kv) {
        pdf.setFont('helvetica', 'bold').setFontSize(9.5);
        const kLines = pdf.splitTextToSize(clean(k), colW - 3);
        pdf.setFont('helvetica', 'normal');
        const vLines = pdf.splitTextToSize(clean(v), CONTENT_W - colW);
        const h = Math.max(kLines.length, vLines.length) * 4 + 2.5;
        need(h);
        const y0 = y;
        pdf.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(40);
        kLines.forEach((l, i) => pdf.text(l, M.left, y0 + i * 4));
        pdf.setFont('helvetica', 'normal').setTextColor(0);
        vLines.forEach((l, i) => pdf.text(l, M.left + colW, y0 + i * 4));
        y = y0 + h;
      }
      y += 2.5;
      continue;
    }

    if (block.note) {
      pdf.setFont('helvetica', 'normal').setFontSize(9.5);
      const lines = pdf.splitTextToSize(clean(block.note), CONTENT_W - 10);
      const h = lines.length * 4 + 7;
      need(h);
      pdf.setFillColor(255, 251, 235).setDrawColor(251, 191, 36);
      pdf.rect(M.left, y - 3.5, CONTENT_W, h - 2, 'FD');
      pdf.setTextColor(120, 53, 15);
      lines.forEach((l, i) => pdf.text(l, M.left + 5, y + 1.5 + i * 4));
      pdf.setTextColor(0);
      y += h + 1.5;
      continue;
    }
  }

  footer();
  return pdf;
}

// Télécharge le manuel. `mode:'open'` l'ouvre dans un onglet à la place.
export function downloadBudgetManualPdf({ schoolName = null, mode = 'save' } = {}) {
  const pdf = buildBudgetManualPdf({ schoolName });
  const fileName = 'Manuel-Budget-Hybride.pdf';
  if (mode === 'open') window.open(pdf.output('bloburl'), '_blank');
  else pdf.save(fileName);
  return fileName;
}
