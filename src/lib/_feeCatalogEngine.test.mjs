// Tests du moteur pur Catalogue de frais.  node src/lib/_feeCatalogEngine.test.mjs
import {
  FEE_CATEGORIES, itemApplies, mandatoryItemsFor, optionalItemsFor, snapshotItem,
  paidForItem, itemBalance, balanceByCategory, studentTotals, revenueByFeeType,
  estServiceHorsScolarite,
  decisionSuppression, REFUS_SUPPRESSION,
} from './feeCatalogEngine.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// --- Application par niveau / classe -----------------------------------------
const ctx = { academicYear: '2025-2026', level: '6e', classId: 'c1' };
ok(itemApplies({ active: true, academic_year: '2025-2026' }, ctx), 'global école : applicable');
ok(itemApplies({ active: true, level: '6e' }, ctx), 'ciblé niveau : applicable');
ok(!itemApplies({ active: true, level: '5e' }, ctx), 'niveau différent : non applicable');
ok(itemApplies({ active: true, class_id: 'c1' }, ctx), 'ciblé classe : applicable');
ok(!itemApplies({ active: true, class_id: 'c2' }, ctx), 'classe différente : non applicable');
ok(!itemApplies({ active: false }, ctx), 'inactif : jamais applicable');
ok(!itemApplies({ active: true, academic_year: '2024-2025' }, ctx), 'autre année : non applicable');

// --- Obligatoires / optionnels ----------------------------------------------
{
  const catalog = [
    { id: 'i1', name: 'Inscription', category: 'inscription', mandatory: true, active: true },
    { id: 'i2', name: 'Scolarité', category: 'scolarite', mandatory: true, active: true },
    { id: 'i3', name: 'Cantine', category: 'cantine', mandatory: false, optional: true, active: true },
    { id: 'i4', name: 'Transport', category: 'transport', mandatory: false, optional: true, active: false },
  ];
  ok(mandatoryItemsFor(catalog, ctx).length === 2, '2 frais obligatoires applicables');
  ok(optionalItemsFor(catalog, ctx).length === 1, '1 frais optionnel applicable (inactif exclu)');
}

// --- Snapshot ----------------------------------------------------------------
{
  const snap = snapshotItem({ id: 'i1', name: 'Inscription', category: 'inscription', amount: 25000, mandatory: true, payment_type: 'unique' },
    { studentId: 's1', schoolId: 'sch1', academicYear: '2025-2026' });
  ok(snap.student_id === 's1' && snap.fee_catalog_id === 'i1' && snap.amount === 25000 && snap.mandatory === true && snap.status === 'active', 'snapshot fige les valeurs');
}

// --- Paiements par frais -----------------------------------------------------
{
  const payments = [
    { student_fee_item_id: 'sf1', amount: 10000 },
    { student_fee_item_id: 'sf1', amount: 5000 },
    { student_fee_item_id: 'sf2', amount: 30000 },
    { student_fee_item_id: null, amount: 99999 },  // paiement global hérité (ignoré par frais)
  ];
  ok(paidForItem('sf1', payments) === 15000, 'paiement cumulé par frais');
  const b = itemBalance({ id: 'sf1', amount: 25000 }, payments);
  ok(b.paid === 15000 && b.balance === 10000 && b.status === 'partial', 'solde d’un frais (partiel)');
  ok(itemBalance({ id: 'sf2', amount: 30000 }, payments).status === 'paid', 'frais soldé');
}

// --- Solde par catégorie + totaux -------------------------------------------
{
  const items = [
    { id: 'sf1', category: 'scolarite', amount: 100000, mandatory: true, status: 'active' },
    { id: 'sf2', category: 'cantine', amount: 40000, mandatory: false, status: 'active' },
    { id: 'sf3', category: 'transport', amount: 20000, mandatory: false, status: 'removed' }, // retiré
  ];
  const payments = [{ student_fee_item_id: 'sf1', amount: 60000 }, { student_fee_item_id: 'sf2', amount: 40000 }];
  const cats = balanceByCategory(items, payments);
  ok(cats.find((c) => c.category === 'scolarite').balance === 40000, 'solde catégorie scolarité');
  ok(!cats.find((c) => c.category === 'transport'), 'frais retiré exclu des soldes');
  const tot = studentTotals(items, payments);
  ok(tot.due === 140000 && tot.paid === 100000 && tot.mandatoryDue === 100000 && tot.optionalDue === 40000, 'totaux élève (obligatoire/optionnel)');
}

// --- Recettes par type -------------------------------------------------------
{
  const items = [{ id: 'sf1', category: 'scolarite' }, { id: 'sf2', category: 'cantine' }];
  const payments = [
    { student_fee_item_id: 'sf1', amount: 60000 }, { student_fee_item_id: 'sf2', amount: 40000 },
    { student_fee_item_id: 'sf1', amount: 40000 }, { student_fee_item_id: null, amount: 999 },
  ];
  const rev = revenueByFeeType(items, payments);
  ok(rev[0].category === 'scolarite' && rev[0].collected === 100000, 'recettes par type triées');
  ok(rev.reduce((s, r) => s + r.collected, 0) === 140000, 'total recettes typées (global exclu)');
}

ok(FEE_CATEGORIES.includes('inscription') && FEE_CATEGORIES.includes('cantine'), 'catégories exemples présentes');

// ════════════════════════════════════════════════════════════════════════════
// UN MÊME FRAIS COMPTÉ DEUX FOIS — le défaut « 50 000 de plus à payer »
// ════════════════════════════════════════════════════════════════════════════
// Relevé chez une école le 16/10/2026. Deux endroits déclarent le même frais :
// la GRILLE de classe (`amount_inscription`) et le CATALOGUE (catégorie
// `inscription`). Le « Dû » additionnait les deux.
//
// Le cas réel, chiffres compris :
//   grille    650 000 comptant, inscription 50 000
//   catalogue tenues 35 000 + inscription 50 000  = 85 000
//   attendu   650 000 + 85 000 = 735 000 ; après 85 000 versés -> reste 650 000
//   constaté  650 000 + 50 000 + 85 000 = 785 000 ; reste 700 000  (+50 000)
{
  const { gridDuplicates, studentTotalsNetOfGrid, studentTotals } = await import('./feeCatalogEngine.js');

  const items = [
    { id: 'i1', category: 'tenue',       name: 'Tenues',      amount: 35000, mandatory: true,  status: 'active' },
    { id: 'i2', category: 'inscription', name: 'Inscription', amount: 50000, mandatory: true,  status: 'active' },
  ];
  const grille = { inscription: 50000, tuition: 650000 };

  // Témoin : l'ancien calcul réclamait bien les 85 000 en entier.
  ok(studentTotals(items).due === 85000, 'temoin : l ancien du catalogue vaut 85 000');

  const dup = gridDuplicates(items, grille);
  ok(dup.ignored.length === 1, 'un seul frais est en doublon');
  ok(dup.ignored[0].id === 'i2', 'et c est bien l inscription');
  ok(dup.ignoredDue === 50000, 'le doublon vaut 50 000 — exactement le surplus');

  const net = studentTotalsNetOfGrid(items, [], grille);
  ok(net.ignoredDue === 50000, 'et annonce les 50 000 ecartes');
  // DEUX portes de sortie DIFFERENTES, et le decor de l'incident le montre :
  // l'inscription sort parce que la GRILLE la porte deja (doublon), les tenues
  // sortent parce que c'est un SERVICE (regle du 31/10 : « tous les services
  // sortent »). Il ne reste donc rien du catalogue sur CET ecran.
  ok(net.due === 0, 'il ne reste rien : doublon ecarte d un cote, service de l autre', net.due);
  ok(net.servicesDue === 35000, 'les tenues sont nommees comme service, pas effacees', net.servicesDue);
  // Le total de l'élève reste celui que l'école attend — il se lit seulement en
  // DEUX endroits maintenant : la scolarité ici, le service dans son registre.
  ok(650000 + 50000 + net.due + net.servicesDue === 735000,
     'scolarite + inscription + catalogue net + service = 735 000, comme avant');

  // LA GRILLE NE COUVRE PAS L'INSCRIPTION -> le catalogue est la seule source,
  // il doit COMPTER. Sans ce cas, le correctif ferait disparaitre l'inscription
  // des ecoles qui ne la gerent QUE par le catalogue.
  const sansGrille = studentTotalsNetOfGrid(items, [], { inscription: 0, tuition: 650000 });
  ok(sansGrille.due === 50000,
     'grille sans inscription -> l inscription du catalogue compte, en entier', sansGrille.due);
  ok(sansGrille.ignoredDue === 0, 'et rien n est ecarte COMME DOUBLON');
  ok(sansGrille.servicesDue === 35000, 'les tenues sortent quand meme : elles sont un service');

  // Montants DIFFERENTS : c'est encore la meme inscription saisie deux fois.
  // Ne dedoublonner qu a montant egal laisserait reclamer 95 000 pour une seule.
  const inegal = studentTotalsNetOfGrid(
    [{ id: 'i3', category: 'inscription', amount: 45000, status: 'active' }], [],
    { inscription: 50000, tuition: 650000 },
  );
  ok(inegal.due === 0, 'montants differents : le doublon est quand meme ecarte');

  // Scolarité déclarée aux deux endroits : même règle.
  const scol = studentTotalsNetOfGrid(
    [{ id: 'i4', category: 'scolarite', amount: 650000, status: 'active' }], [],
    { inscription: 0, tuition: 650000 },
  );
  ok(scol.due === 0, 'scolarite en doublon de la grille : ecartee');
  ok(scol.ignoredDue === 650000, 'et annoncee');

  // Un frais RETIRÉ ne compte ni comme dû ni comme doublon.
  const retire = gridDuplicates(
    [{ id: 'i5', category: 'inscription', amount: 50000, status: 'removed' }], grille,
  );
  ok(retire.ignored.length === 0, 'un frais retire n est pas un doublon');

  // Robustesse : rien ne doit lever.
  ok(gridDuplicates(null, grille).ignoredDue === 0, 'items null -> aucun doublon');
  ok(gridDuplicates(items, null).ignoredDue === 0, 'grille absente -> aucun doublon (le catalogue fait foi)');
  ok(gridDuplicates(items, {}).ignoredDue === 0, 'grille vide -> aucun doublon');
  ok(studentTotalsNetOfGrid(items).due === 50000,
     'sans grille passee -> rien n est dedoublonne, seul le service sort');
}


// --- LES SERVICES SORTENT DES FRAIS SCOLAIRES --------------------------------
// « Les frais scolaires de GENIUS n'incluent rien d'autre que pension et
// inscription ; la cantine se gère à part » (responsable, 31/10/2026), puis,
// le même jour : « oui TOUS les services sortent » — y compris ceux à
// versement unique. La règle tient en une phrase : cet écran ne porte que de
// l'académique.
//
// Ce que ces cas protègent, et il y avait DEUX fautes, pas une : une cantine
// mensuelle affichait « dû 15 000 » quand huit mois étaient dus (son `amount`
// est le prix d'UNE période), et « Non payé » alors que l'élève avait versé —
// ses versements pendent aux ÉCHÉANCES, que `paidForItem` ne regarde pas.
{
  // Import local, comme le bloc « doublons de grille » plus haut.
  const { studentTotalsNetOfGrid } = await import('./feeCatalogEngine.js');

  const cantine   = { id: 'sv1', category: 'cantine',   amount: 15000, payment_type: 'echelonne', status: 'active' };
  const transport = { id: 'sv2', category: 'transport', amount: 10000, payment_type: 'echelonne', status: 'active' };
  const tenue1fois= { id: 'sv3', category: 'tenue',     amount: 12000, payment_type: 'unique',    status: 'active' };
  const scolarite = { id: 'ac1', category: 'scolarite', amount: 90000, payment_type: 'echelonne', status: 'active' };
  const apee      = { id: 'ac2', category: 'apee',      amount: 5000,  payment_type: 'unique',    status: 'active' };

  ok(estServiceHorsScolarite(cantine),   'cantine : service, donc dehors');
  ok(estServiceHorsScolarite(transport), 'transport : service, donc dehors');
  ok(estServiceHorsScolarite(tenue1fois),
    'une tenue a versement UNIQUE sort aussi — « oui tous les services sortent »');
  ok(!estServiceHorsScolarite(scolarite),
    'la scolarite est echelonnee mais ACADEMIQUE : jamais ecartee, c est le coeur de l ecran');
  ok(!estServiceHorsScolarite(apee), 'APEE : academique');
  ok(!estServiceHorsScolarite(null) && !estServiceHorsScolarite({}),
    'robustesse : ni null ni objet vide ne levent');
  ok(estServiceHorsScolarite({ category: 'cantine' }),
    'la regle ne depend PAS de payment_type : une saisie qui le laisse par defaut sort quand meme');

  const tous = [scolarite, apee, cantine, transport, tenue1fois];
  const net = studentTotalsNetOfGrid(tous, [], {});

  ok(net.due === 90000 + 5000,
    'le du de l ecran ne porte QUE l academique : pension + APEE', net.due);
  ok(net.services.length === 3, 'les trois services sont ecartes', net.services.length);
  ok(net.servicesDue === 37000,
    'et NOMMES avec leur montant — jamais tus, comme pour les doublons de grille',
    net.servicesDue);

  // GENIUS : pension + inscription, et rien d'autre.
  const genius = studentTotalsNetOfGrid(
    [{ id: 'i', category: 'inscription', amount: 50000, payment_type: 'unique', status: 'active' },
     scolarite, cantine],
    [], {});
  ok(genius.due === 140000,
    'GENIUS : inscription + pension = 140 000, la cantine n entre pas', genius.due);
  ok(genius.services.length === 1 && genius.services[0].category === 'cantine',
    'et la cantine est renvoyee a son registre');

  // La grille passe AVANT : un doublon reste un doublon, pas un service.
  const avecGrille = studentTotalsNetOfGrid([scolarite, cantine], [],
    { inscription: 0, tuition: 90000 });
  ok(avecGrille.ignored.length === 1 && avecGrille.services.length === 1,
    'grille et services s ecartent pour des motifs DIFFERENTS, et les deux sont rendus');
  ok(avecGrille.due === 0, 'il ne reste alors plus rien a reclamer sur cet ecran', avecGrille.due);
}

console.log(failed ? '\n❌ Fee catalog KO' : '\n✅ Fee catalog OK');

// ── SUPPRIMER UN SERVICE : CE QUI EST REFUSÉ, ET POURQUOI ──────────────────
//
// `supabase_fee_integrity.sql` révoque le DELETE sur `fee_payments` : l'app n'a
// PAS le droit d'effacer un encaissement. Et `student_fee_item_id` est en
// `ON DELETE SET NULL`. Supprimer les abonnements d'un service qui porte de
// l'argent laisserait donc la recette orpheline — invisible à l'écran, toujours
// comptée en balance. Chaque cas ci-dessous garde cette porte fermée.
console.log('\n— Supprimer un service —');
{
  const vers = (...montants) => montants.map((m, i) => ({ id: 'p' + i, amount: m }));

  // 1. Rien d'attaché : la suppression passe.
  const vide = decisionSuppression({ versements: [], montant: 0 });
  ok(vide.ok === true, 'un service sans versement se supprime');

  // 2. DE L'ARGENT VIF : refus, et le montant est dit.
  const argent = decisionSuppression({ versements: vers(15000), montant: 15000 });
  ok(argent.ok === false, 'un service qui porte de l argent NE se supprime PAS');
  ok(argent.refus === REFUS_SUPPRESSION.ARGENT, 'et le motif est nomme : argent encaisse');
  ok(argent.montant === 15000, 'le montant est rendu, pour que l ecran le dise');

  // AUCUN forcage ne leve ce refus : ce n est pas une preference d ecran,
  // c est un droit que l application n a pas.
  const force = decisionSuppression({ versements: vers(15000), montant: 15000 }, { forcer: true });
  ok(force.ok === false && force.refus === REFUS_SUPPRESSION.ARGENT,
    'le forcage ne leve PAS le refus sur de l argent vif : sinon la recette devient orpheline');

  // 3. SOMME NULLE par contre-passation : des lignes restent, on le dit.
  const solde = decisionSuppression({ versements: vers(15000, -15000), montant: 0 });
  ok(solde.ok === false, 'une somme nulle ne suffit pas : les LIGNES survivront');
  ok(solde.refus === REFUS_SUPPRESSION.LIGNES_SOLDEES, 'et le motif le distingue de l argent vif');
  ok(solde.versements === 2, 'les deux lignes sont comptees');

  // Sur demande explicite, on passe — parce que la somme est juste et que
  // l ecole sait desormais que les lignes resteront.
  const assume = decisionSuppression({ versements: vers(15000, -15000), montant: 0 }, { forcer: true });
  ok(assume.ok === true, 'avec la case cochee, un service solde par contre-passation se supprime');

  // 4. UN REMBOURSEMENT NET ne doit pas passer pour un solde.
  const negatif = decisionSuppression({ versements: vers(-5000), montant: -5000 });
  ok(negatif.ok === false && negatif.refus === REFUS_SUPPRESSION.ARGENT,
    'un solde NEGATIF est de l argent aussi : il bloque autant qu un positif', negatif.refus);

  // 5. Les refus d entree.
  ok(decisionSuppression(null).ok === false, 'aucune dependance lue : on ne supprime pas a l aveugle');
  ok(decisionSuppression(null).refus === REFUS_SUPPRESSION.AUCUN_SERVICE, 'et le motif le dit');
  ok(decisionSuppression({}).ok === true, 'un objet vide vaut : rien d attache');
  ok(decisionSuppression({ versements: vers(0, 0), montant: 0 }).refus === REFUS_SUPPRESSION.LIGNES_SOLDEES,
    'deux versements a zero sont quand meme des lignes qui resteront');
}
process.exit(failed ? 1 : 0);

