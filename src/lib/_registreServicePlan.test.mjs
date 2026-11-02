// PLANIFIER LA REPRISE D'UN REGISTRE — ce qui s'écrit, et ce qui est refusé
//
// Ce plan décide d'écritures FINANCIÈRES : des abonnements, des créances, des
// versements datés. Chaque cas ci-dessous garde une décision qui, prise à
// l'envers, coûte de l'argent à une école ou à un parent.
//
// Lancer : node --experimental-loader ./scripts/lib/esm-resolve.mjs src/lib/_registreServicePlan.test.mjs
import {
  planifierReprise, dateDeReprise, anneesDe, ANOMALIES_BLOQUANTES, trancherEcriture,
} from './registreServicePlan.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

// Une lecture minimale, de la forme que rend `lireRegistre`.
const LECTURE = {
  eleves: [
    {
      source: { ligne: 7, tableau: 'registre' }, nom: 'MEDJO MANGA WINNIE', classe: 'N1',
      residence: 'ADINA MOTO', tarif: 7500, annuel: 60000, sortant: false, motif: '',
      versements: [{ trimestre: 'T1', montant: 25000 }, { trimestre: 'T2', montant: 23000 },
        { trimestre: 'T3', montant: 12000 }],
      paye: 60000, reste: 0,
    },
    {
      source: { ligne: 11, tableau: 'sortis' }, nom: 'MEDJO PAUL DONNEL', classe: 'N1',
      residence: 'Maétur', tarif: 10000, annuel: 80000, sortant: true,
      motif: 'Jambe fracturée', versements: [], paye: 65000, reste: 15000,
    },
    {
      source: { ligne: 17, tableau: 'releve' }, nom: 'FAMILLE FOMETEU (04)', classe: 'CL3',
      residence: 'EVECHE', tarif: 6000, annuel: 192000, sortant: false, motif: '',
      versements: [], paye: 180000, reste: 12000,
    },
  ],
  anomalies: [
    { type: 'plusieurs_eleves', ligne: 17, nom: 'FAMILLE FOMETEU (04)', nbEleves: 4,
      message: '« FAMILLE FOMETEU (04) » porte 4 élèves sur une seule ligne : il faut leurs noms.' },
  ],
};

// ── 1. L'ANNÉE EST EXPLICITE, JAMAIS DEVINÉE ───────────────────────────────
console.log('\n— L’année —');
ok(anneesDe('2025-2026')[0] === 2025 && anneesDe('2025-2026')[1] === 2026, '« 2025-2026 » → 2025 et 2026');
ok(anneesDe('2026')[1] === 2027, 'une année seule implique la suivante');
ok(anneesDe('')[0] === null && anneesDe(null)[0] === null, 'rien → rien, sans lever');
{
  // Le classeur « TRANSPORT 2026 » est l'année 2025-2026 : ses seules vraies
  // dates courent du 2025-09-22 au 2026-02-04. L'écrire dans l'année en cours
  // ferait devoir de l'argent à 211 élèves qui n'en doivent pas.
  const p = planifierReprise({ lecture: LECTURE, academicYear: '2025-2026', serviceNom: 'Transport' });
  ok(p.resume.annee === '2025-2026', 'le plan porte l’année qu’on lui a donnée, et le dit');
  ok(p.aEcrire[0].echeances[0].period_key === '2025-annee',
    'la clé de période suit la convention du moteur : première année', p.aEcrire[0].echeances[0].period_key);
}

// ── 2. LES DATES : celles de l'école, sinon une convention ÉNONCÉE ─────────
console.log('\n— Les dates —');
{
  const conv = dateDeReprise('T1', { academicYear: '2025-2026' });
  ok(conv.date === '2025-12-31' && conv.source === 'convention',
    'sans trimestres saisis, T1 tombe au 31 décembre, et c’est DIT conventionnel', conv);
  ok(dateDeReprise('T2', { academicYear: '2025-2026' }).date === '2026-03-31', 'T2 → 31 mars de l’année suivante');
  ok(dateDeReprise('T3', { academicYear: '2025-2026' }).date === '2026-06-30', 'T3 → 30 juin');
  // L'ÉCOLE D'ABORD : si elle a saisi ses trimestres, ce sont ses dates.
  const sienne = dateDeReprise('T1', {
    academicYear: '2025-2026',
    periodes: [{ type: 'trimestre', school_year: '2025-2026', name: 'Trimestre 1', teaching_end: '2025-12-19' }],
  });
  ok(sienne.date === '2025-12-19' && sienne.source === 'ecole',
    'une date saisie par l’école gagne sur la convention, et la provenance change', sienne);
  // Et on ne prend pas les trimestres d'une AUTRE année.
  const autreAnnee = dateDeReprise('T1', {
    academicYear: '2025-2026',
    periodes: [{ type: 'trimestre', school_year: '2024-2025', name: 'Trimestre 1', teaching_end: '2024-12-19' }],
  });
  ok(autreAnnee.source === 'convention', 'le trimestre d’une autre année scolaire est ignoré');
  ok(dateDeReprise('T1', {}).date === null, 'sans année, aucune date : on n’en fabrique pas une');
}

// ── 3. CE QUI EST ÉCARTÉ, ET POURQUOI ──────────────────────────────────────
console.log('\n— Les écartés —');
{
  const p = planifierReprise({ lecture: LECTURE, academicYear: '2025-2026', serviceNom: 'Transport' });
  ok(p.resume.ecartes === 1, 'la ligne « quatre enfants » est écartée', p.resume.ecartes);
  ok(p.ecartes[0].nom === 'FAMILLE FOMETEU (04)', 'et c’est bien elle');
  ok(/il faut leurs noms/.test(p.ecartes[0].pourquoi[0]), 'avec la raison, en clair');
  ok(!p.aEcrire.some((x) => /FOMETEU/.test(x.nom)), 'elle n’est nulle part dans ce qui serait écrit');
  ok(ANOMALIES_BLOQUANTES.includes('reste_incoherent'),
    'une feuille qui se contredit sur un montant bloque aussi : on ne tranche pas sur l’argent');
  ok(!ANOMALIES_BLOQUANTES.includes('annuel_non_multiple'),
    'mais un montant négocié ne bloque pas : l’annuel fait foi');
  ok(!ANOMALIES_BLOQUANTES.includes('doublon'), 'ni un doublon : la dernière mention gagne');
}

// ── 4. LE MODÈLE : une échéance ANNUELLE, et les versements dessus ─────────
console.log('\n— Reprise historique —');
{
  const p = planifierReprise({ lecture: LECTURE, academicYear: '2025-2026', serviceNom: 'Transport' });
  const w = p.aEcrire.find((x) => x.nom === 'MEDJO MANGA WINNIE');
  ok(w.echeances.length === 1, 'UNE échéance, pas trois : le fichier ne dit pas le dû par trimestre');
  ok(w.echeances[0].amount_due === 60000, 'au montant ANNUEL du fichier');
  ok(w.abonnement.amount === 60000, 'l’abonnement porte le même engagement annuel');
  ok(/7500\/mois/.test(w.echeances[0].notes), 'le tarif mensuel vit dans le détail : il renseigne, il n’engage pas');
  ok(/ADINA MOTO/.test(w.echeances[0].notes), 'la résidence est conservée — c’est elle qui explique le tarif');
  ok(/reprise du registre Excel/.test(w.echeances[0].notes), 'et la mention de reprise est portée');
  ok(w.versements.length === 3, 'les trois versements sont écrits séparément');
  ok(w.versements[0].date === '2025-12-31', 'chacun daté de la fin de SON trimestre', w.versements[0].date);
  ok(w.versements.every((v) => /T[123]/.test(v.note)), 'et chacun nomme son trimestre : le détail n’est pas perdu');
  ok(w.encaisse === 60000, 'la somme reprise égale ce que l’école avait encaissé');
  // LE POINT QUI PROTÈGE L'ARRÊTÉ DE CAISSE.
  ok(w.versements.every((v) => v.recorded_by === null),
    'AUCUN versement n’est attribué à un caissier : son arrêté réclamerait ces millions en espèces');
  ok(p.resume.sansCaissier === p.resume.versements, 'et le résumé le vérifie sur tout le lot');
  // Un cumul n'est pas une écriture réelle, et il est signalé comme tel.
  const s = p.aEcrire.find((x) => x.nom === 'MEDJO PAUL DONNEL');
  ok(s.cumul === true && s.versements.length === 1, 'un tableau sans détail donne UN cumul, signalé');
  ok(/cumul/.test(s.versements[0].note), 'et son libellé le dit, pour qu’on ne le prenne pas pour un encaissement');
  ok(/SORTI/.test(s.echeances[0].notes) && /Jambe fracturée/.test(s.echeances[0].notes),
    'le motif de sortie est conservé mot pour mot');
  ok(s.attendu - s.encaisse === 15000, 'et sa dette reste : un sortant qui doit, doit encore');
}

// ── 5. L'ANNÉE EN COURS : rien de réclamé, rien d'inventé ──────────────────
console.log('\n— Année en cours —');
{
  const p = planifierReprise({
    lecture: LECTURE, academicYear: '2026-2027', serviceNom: 'Transport', portee: 'annee_courante',
  });
  ok(p.resume.portee === 'annee_courante', 'la portée est portée au résumé');
  ok(p.resume.versements === 0, 'AUCUN versement : l’argent de l’an dernier n’est pas de cet exercice');
  ok(p.resume.avecEcheances === false, 'et AUCUNE échéance par défaut');
  ok(p.aEcrire.every((x) => x.echeances.length === 0), 'donc rien n’est réclamé à aucun parent');
  ok(p.resume.attendu === 0, 'l’attendu est zéro, et le dit', p.resume.attendu);
  ok(p.resume.engagementLu > 0, 'tandis que le montant LU reste visible, pour que l’école le retrouve');
  ok(p.aEcrire.every((x) => x.abonnement.amount > 0), 'les abonnements gardent leur tarif propre');
  // UN SORTANT NE SE RÉABONNE PAS.
  ok(!p.aEcrire.some((x) => x.nom === 'MEDJO PAUL DONNEL'),
    'un élève sorti n’est pas réabonné : il devrait une année de bus qu’il ne prend pas');
  ok(p.ecartes.some((x) => /non réabonné/.test(x.pourquoi[0])), 'et le plan dit pourquoi il est resté dehors');
  ok(p.resume.eleves === 1, 'il reste le seul élève réabonnable', p.resume.eleves);
  // Les échéances sur demande, et c'est alors un choix énoncé.
  const forcees = planifierReprise({
    lecture: LECTURE, academicYear: '2026-2027', serviceNom: 'Transport',
    portee: 'annee_courante', avecEcheances: true,
  });
  ok(forcees.resume.avecEcheances === true && forcees.aEcrire[0].echeances.length === 1,
    '`avecEcheances: true` les crée quand même');
  ok(/à confirmer/.test(forcees.aEcrire[0].echeances[0].notes),
    'et l’échéance dit que son montant vient du registre précédent, à confirmer',
    forcees.aEcrire[0].echeances[0].notes);
}

// ── 6. LES REFUS ───────────────────────────────────────────────────────────
console.log('\n— Robustesse —');
ok(planifierReprise().resume.eleves === 0, 'aucun argument ne lève pas');
ok(planifierReprise({ lecture: { eleves: [], anomalies: [] } }).resume.eleves === 0, 'une lecture vide ne produit rien');
{
  const sansAnnee = planifierReprise({ lecture: LECTURE, serviceNom: 'Transport' });
  ok(sansAnnee.aEcrire.every((x) => x.versements.length === 0),
    'sans année, aucune date ne peut être calculée — donc aucun versement n’est écrit');
}


// ── 7. CE QUI PART VRAIMENT — la règle qui empêche de facturer deux fois ───
console.log('\n— Trancher l’écriture —');
{
  const plan = {
    aEcrire: [{ nom: 'A', source: { ligne: 7 } }, { nom: 'B', source: { ligne: 8 } }],
    ecartes: [{ nom: 'FAMILLE X (04)', source: { ligne: 9 }, pourquoi: ['il faut leurs noms'] }],
  };
  const rappro = {
    prets: [
      { nom: 'A', student_id: 's1', eleveBase: { name: 'A', className: 'N1' } },
      { nom: 'B', student_id: 's2', eleveBase: { name: 'B', className: 'N2' } },
    ],
    aTrancher: [],
  };
  const vierge = trancherEcriture({ plan, rappro, dejaAbonnes: [] });
  ok(vierge.prets.length === 2, 'sur une base vierge, les deux partent', vierge.prets.length);
  ok(vierge.rejets.length === 1, 'et la ligne écartée par le plan est rejetée, avec son motif');
  ok(/il faut leurs noms/.test(vierge.rejets[0].raison), 'le motif du plan est repris tel quel');

  // LE SECOND IMPORT. L'école corrige son fichier et le réimporte : sans ce
  // filtre, B recevrait un SECOND abonnement et paierait le service deux fois.
  const second = trancherEcriture({ plan, rappro, dejaAbonnes: ['s2'] });
  ok(second.prets.length === 1 && second.prets[0].student_id === 's1',
    'un élève déjà abonné n’est JAMAIS réabonné : pas de double facturation', second.prets.length);
  ok(second.resume.dejaAbonnes === 1, 'et il est compté');
  ok(second.rejets.some((r) => r.etat === 'deja_abonne'),
    'il figure dans les rejets : un rejet silencieux est un élève que personne ne cherche');

  // Un troisième import n'écrit plus rien, et le dit.
  const troisieme = trancherEcriture({ plan, rappro, dejaAbonnes: ['s1', 's2'] });
  ok(troisieme.prets.length === 0, 'réimporter deux fois n’écrit rien de plus');
  ok(troisieme.rejets.length === 3, 'tout est rejeté, rien n’est perdu', troisieme.rejets.length);

  // LE COMPTE DOIT SE REFERMER : chaque ligne du fichier est écrite ou rejetée.
  for (const [nom, r] of [['vierge', vierge], ['second', second], ['troisième', troisieme]])
    ok(r.resume.boucle === true, 'le compte se referme (' + nom + ') : écrit + rejeté = lignes du fichier');

  // Un Set est accepté comme une liste — l'écran passe l'un ou l'autre.
  ok(trancherEcriture({ plan, rappro, dejaAbonnes: new Set(['s2']) }).prets.length === 1,
    'un Set vaut une liste : l’appelant n’a pas à convertir');
  ok(trancherEcriture().prets.length === 0, 'aucun argument ne lève pas');
  ok(trancherEcriture({ plan, rappro }).prets.length === 2, 'sans abonnés connus, rien n’est filtré');
}

console.log(fail === 0 ? '\n✅ Tous les tests passent' : `\n❌ ÉCHEC : ${fail}`);
if (fail > 0) process.exit(1);
