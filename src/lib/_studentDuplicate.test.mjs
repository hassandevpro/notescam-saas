// DOUBLONS D'ÉLÈVES — le cas réel qui a motivé la règle (THE GENIUS, 26/08/2026)
// et les limites qu'on lui pose volontairement.
import { checkDuplicate, DUP, normPhone, normName, isNameVariant } from './studentDuplicate.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

const REGISTRE = [
  { id: 'a', name: 'EWODO AYISSI JUAN PAOLO', birth_date: '2015-02-20', phone: '674 75 36 54', matricule: 'ELV-001' },
  { id: 'b', name: 'MBALLA Jeanne',           birth_date: '2014-05-03', phone: '699000111',    matricule: 'ELV-002' },
];

// ── Le doublon exact : refusé ───────────────────────────────────────────────
{
  const r = checkDuplicate({ name: 'ewodo  ayissi juan paolo', birth_date: '2015-02-20' }, REGISTRE);
  ok(r.level === DUP.BLOCK, '1. même nom + même naissance → BLOQUÉ (casse et espaces ignorés)', r.level);
}
{
  const r = checkDuplicate({ name: 'Tout Autre Nom', matricule: 'elv-001' }, REGISTRE);
  ok(r.level === DUP.BLOCK && r.matches[0].on === 'matricule', '2. matricule déjà attribué → BLOQUÉ', r);
}

// ── Le cas EWODO : « JUNIOR » ajouté, même naissance, même numéro ───────────
{
  const r = checkDuplicate({ name: 'EWODO AYISSI JUAN PAOLO JUNIOR', birth_date: '2015-02-20', phone: '674753654' }, REGISTRE);
  ok(r.level === DUP.WARN, '3. « JUNIOR » ajouté, même naissance et même numéro → AVERTISSEMENT', r.level);
  ok(r.matches[0].student.id === 'a', '4. la fiche existante est désignée', r.matches[0]);
}

// ── Ce qu'on refuse de bloquer, et pourquoi ────────────────────────────────
{
  // Jumeaux : même naissance, même téléphone du parent, noms différents.
  const r = checkDuplicate({ name: 'EWODO AYISSI SARAH', birth_date: '2015-02-20', phone: '674753654' }, REGISTRE);
  ok(r.level === DUP.WARN, '5. jumeaux : averti, JAMAIS bloqué — sinon leur inscription est impossible', r.level);
}
{
  const r = checkDuplicate({ name: 'NKOULOU Bertrand', birth_date: '2016-01-01', phone: '655112233' }, REGISTRE);
  ok(r.level === DUP.NONE, '6. un élève sans rapport passe', r.level);
}
{
  const r = checkDuplicate({ id: 'a', name: 'EWODO AYISSI JUAN PAOLO', birth_date: '2015-02-20' }, REGISTRE);
  ok(r.level === DUP.NONE, '7. modifier une fiche ne la déclare pas doublon d’elle-même', r.level);
}

// ── Normalisations ─────────────────────────────────────────────────────────
ok(normPhone('674 75 36 54') === normPhone('674753654'), '8. « 674 75 36 54 » = « 674753654 »');
ok(normPhone('+237 674753654') === normPhone('674753654'), '9. l’indicatif pays est ignoré');
ok(normName('Mbàllá  JEAN') === 'MBALLA JEAN', '10. accents et espaces multiples normalisés', normName('Mbàllá  JEAN'));
ok(isNameVariant('EWODO AYISSI JUAN PAOLO', 'EWODO AYISSI JUAN PAOLO JUNIOR'), '11. suffixe ajouté = variante');
ok(isNameVariant('MBALLA JEANNE', 'JEANNE MBALLA'), '12. prénoms inversés = variante');
ok(!isNameVariant('MBALLA JEANNE', 'MBALLA PIERRE'), '13. deux enfants d’une même famille ne sont pas une variante');

console.log(`\n${fail === 0 ? '✅' : '❌'} Doublons : ${pass} ok, ${fail} ko`);
process.exit(fail === 0 ? 0 : 1);
