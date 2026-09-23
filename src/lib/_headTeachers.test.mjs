// DEUX ENSEIGNANTS PRINCIPAUX PAR CLASSE — CE QUI S'IMPRIME
//
// Lancer : node --experimental-loader ./scripts/lib/esm-resolve.mjs src/lib/_headTeachers.test.mjs
import { headTeacherNames, headTeacherText, headTeacherLabel, SEPARATEUR } from './headTeachers.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

const PROFS = [
  { id: 't1', name: 'MBARGA Paul' },
  { id: 't2', name: 'NGONO Marie' },
  { id: 't3', name: 'ABENA Jean' },
];

ok(headTeacherText({ teacher_id: 't1', teacher2_id: 't2' }, PROFS) === `MBARGA Paul${SEPARATEUR}NGONO Marie`,
  '1. les deux noms, dans l’ordre saisi', headTeacherText({ teacher_id: 't1', teacher2_id: 't2' }, PROFS));
ok(headTeacherText({ teacher_id: 't1' }, PROFS) === 'MBARGA Paul',
  '2. un seul titulaire : rendu inchangé par rapport à aujourd’hui');
ok(headTeacherText({}, PROFS) === '', '3. aucun titulaire → chaîne vide (la ligne se masque)');
ok(headTeacherText(null, PROFS) === '', '4. aucune classe → chaîne vide, sans planter');

// Le second SEUL : la classe reste nommée, même si le premier a été retiré.
ok(headTeacherText({ teacher2_id: 't2' }, PROFS) === 'NGONO Marie',
  '5. second seul renseigné → il s’imprime quand même');

// Saisies fautives que l'écran laisse passer.
ok(headTeacherText({ teacher_id: 't1', teacher2_id: 't1' }, PROFS) === 'MBARGA Paul',
  '6. le même enseignant choisi deux fois n’est imprimé qu’une fois');
ok(headTeacherText({ teacher_id: 'parti', teacher2_id: 't2' }, PROFS) === 'NGONO Marie',
  '7. enseignant supprimé de l’école : ignoré, pas de trou dans l’énumération');
ok(headTeacherText({ teacher_id: 't1', teacher2_id: 'parti' }, PROFS) === 'MBARGA Paul',
  '8. idem pour le second');
ok(headTeacherNames({ teacher_id: 't1', teacher2_id: 't2' }, []).length === 0,
  '9. liste d’enseignants vide → rien, plutôt qu’un identifiant brut');

// Séparateur : une virgule serait ambiguë dans « NGONO ép. MBALLA, Marie ».
ok(!headTeacherText({ teacher_id: 't1', teacher2_id: 't2' }, PROFS).includes(','),
  '10. le séparateur n’est pas une virgule');

// ── Accord du libellé ──────────────────────────────────────────────────────
ok(headTeacherLabel(1, 'FR') === 'P. principal', '11. FR singulier');
ok(headTeacherLabel(2, 'FR') === 'P. principaux', '12. FR pluriel — pas de faute d’accord sur un bulletin');
ok(headTeacherLabel(1, 'FR', { basic: true }) === 'Enseignant(e)', '13. fondamental, singulier');
ok(headTeacherLabel(2, 'FR', { basic: true }) === 'Enseignant(e)s', '14. fondamental, pluriel');
ok(headTeacherLabel(1, 'EN') === 'Form master' && headTeacherLabel(2, 'EN') === 'Form masters',
  '15. anglais : accord aussi');
ok(headTeacherLabel(2, 'EN', { basic: true }) === 'Class teachers', '16. anglais, fondamental');
ok(headTeacherLabel(0, 'FR') === 'P. principal', '17. zéro nom → libellé au singulier (ligne masquée de toute façon)');

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exitCode = fail === 0 ? 0 : 1;
