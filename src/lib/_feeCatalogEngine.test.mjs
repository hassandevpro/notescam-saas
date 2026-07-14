// Tests du moteur pur Catalogue de frais.  node src/lib/_feeCatalogEngine.test.mjs
import {
  FEE_CATEGORIES, itemApplies, mandatoryItemsFor, optionalItemsFor, snapshotItem,
  paidForItem, itemBalance, balanceByCategory, studentTotals, revenueByFeeType,
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

console.log(failed ? '\n❌ Fee catalog KO' : '\n✅ Fee catalog OK');
process.exit(failed ? 1 : 0);
