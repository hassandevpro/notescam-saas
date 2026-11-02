// DOUBLONS D'ÉLÈVES — L'ADAPTATEUR, ET LA FAUTE DE COLONNE QU'IL CORRIGE
//
// Ce banc d'essai portait sur l'ancien moteur. Il PASSAIT, et pourtant le code
// était faux : ses jeux d'essai écrivaient `birth_date`, exactement comme le
// moteur les lisait. Or la colonne s'appelle `date_naissance` — `birth_date`
// n'existe nulle part, ni en SQLite, ni en Postgres, ni dans les imports. Deux
// fautes d'accord qui se validaient l'une l'autre, et en production aucune
// comparaison de date n'avait jamais lieu.
//
// Conséquences réelles, rapportées par le responsable le 2026-11-01 :
//   • la détection paraissait porter sur le NOM SEUL — c'était le cas ;
//   • deux VRAIS homonymes (deux dates, deux villes) étaient REFUSÉS.
//
// Le banc est donc réécrit sur les VRAIS noms de colonnes, et il garde en
// premier le contrôle qui aurait dû exister : aucun champ inventé.
//
// Le moteur lui-même (trois niveaux, lieu de naissance, renforts, fratrie,
// scan complet) est éprouvé dans `src/core/_doublonsEleves.test.mjs`.
//
//   node src/lib/_studentDuplicate.test.mjs
import { readFileSync } from 'node:fs';
import {
  checkDuplicate, peutCreerEleve, DUP, NIVEAU, normPhone, normName, isNameVariant,
} from './studentDuplicate.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

// ── 0) LE CONTRÔLE QUI MANQUAIT : les champs lus EXISTENT-ILS ? ────────────
// Un nom de colonne faux ne se voit pas à l'exécution : la lecture rend
// `undefined` et la règle s'éteint en silence. On le vérifie donc sur le
// SCHÉMA, qui est la seule autorité.
{
  const schema = readFileSync(new URL('../../server/schema.sql', import.meta.url), 'utf8');
  const colonnes = schema.slice(schema.indexOf('CREATE TABLE IF NOT EXISTS students'));
  const bloc = colonnes.slice(0, colonnes.indexOf(');'));
  ok(/\bdate_naissance\b/.test(bloc), '0a. `date_naissance` est bien la colonne du schéma');
  ok(!/\bbirth_date\b/.test(schema), '0b. `birth_date` n’existe nulle part dans le schéma');

  const moteur = readFileSync(new URL('../core/doublonsEleves.js', import.meta.url), 'utf8');
  // Le moteur ne doit lire QUE des colonnes réelles. `birth_date` n'apparaît
  // que dans l'en-tête qui raconte la faute — jamais dans le code.
  const code = moteur.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  ok(!/birth_date/.test(code), '0c. le moteur ne lit plus `birth_date`');
  ok(/date_naissance/.test(code) && /lieu_naissance/.test(code),
    '0d. il lit `date_naissance` et `lieu_naissance`');
}

const REGISTRE = [
  {
    id: 'a', name: 'EWODO AYISSI JUAN PAOLO', date_naissance: '2015-02-20',
    lieu_naissance: 'Douala', parent_phone: '674 75 36 54', matricule: 'ELV-001',
  },
  {
    id: 'b', name: 'MBALLA Jeanne', date_naissance: '2014-05-03',
    lieu_naissance: 'Yaoundé', parent_phone: '699000111', matricule: 'ELV-002',
  },
];

// ── 1) LE DOUBLON RÉEL : signalé, et nommé ─────────────────────────────────
{
  const r = checkDuplicate(
    { name: 'ewodo  ayissi juan paolo', date_naissance: '2015-02-20', lieu_naissance: 'DOUALA' },
    REGISTRE,
  );
  ok(r.niveau === NIVEAU.FORT, '1. même nom + même naissance + même lieu → DOUBLON FORT (casse et espaces ignorés)', r.niveau);
  ok(r.matches[0].student.id === 'a', '2. la fiche existante est désignée', r.matches[0]?.student?.name);
  ok(/même date de naissance/.test(r.reason) && /même lieu/.test(r.reason),
    '3. la raison nomme les critères, elle n’est pas générique', r.reason);
}

// ── 2) « ALERTE, JAMAIS BLOCAGE » (consigne du 2026-11-01) ─────────────────
{
  const r = checkDuplicate(
    { name: 'EWODO AYISSI JUAN PAOLO', date_naissance: '2015-02-20', lieu_naissance: 'Douala' },
    REGISTRE,
  );
  ok(r.level !== DUP.BLOCK, '4. l’écran n’est JAMAIS bloqué, même sur un doublon fort', r.level);
  ok(r.level === DUP.WARN, '5. il avertit, et la secrétaire tranche', r.level);
}

// ── 3) LE CAS EWODO DU 26/08/2026, tel qu'il est vraiment en base ──────────
{
  // « JUNIOR » ajouté, même date, même téléphone — mais AUCUN lieu de naissance
  // saisi. Le lieu étant obligatoire pour le niveau fort, la paire ressort « à
  // vérifier », avec le téléphone affiché comme renfort.
  const r = checkDuplicate(
    { name: 'EWODO AYISSI JUAN PAOLO JUNIOR', date_naissance: '2015-02-20', parent_phone: '674753654' },
    REGISTRE.map(({ lieu_naissance, ...s }) => s),
  );
  ok(r.niveau === NIVEAU.VERIFIER, '6. « JUNIOR » ajouté, sans lieu de naissance → À VÉRIFIER', r.niveau);
  ok(r.candidats[0].renforts.includes('telephone'), '7. le téléphone du parent est affiché comme renfort', r.candidats[0]?.renforts);
}

// ── 4) CE QUI NE DOIT RIEN DÉCLENCHER ──────────────────────────────────────
{
  // Jumeaux : même date, même lieu, même téléphone du parent, prénoms différents.
  const r = checkDuplicate(
    { name: 'EWODO AYISSI SARAH', date_naissance: '2015-02-20', lieu_naissance: 'Douala', parent_phone: '674753654' },
    REGISTRE,
  );
  ok(r.level === DUP.NONE, '8. jumeaux : AUCUNE alerte — le prénom diffère, et c’est décisif', r.level);
}
{
  // LE DÉFAUT RAPPORTÉ : deux vrais homonymes, deux dates, deux villes.
  const r = checkDuplicate(
    { name: 'EWODO AYISSI JUAN PAOLO', date_naissance: '2018-11-04', lieu_naissance: 'Garoua' },
    REGISTRE,
  );
  ok(r.level === DUP.NONE, '9. homonyme réel (autre date, autre ville) : AUCUNE alerte — était BLOQUÉ', r.level);
}
{
  const r = checkDuplicate({ name: 'NKOULOU Bertrand', date_naissance: '2016-01-01', parent_phone: '655112233' }, REGISTRE);
  ok(r.level === DUP.NONE, '10. un élève sans rapport passe', r.level);
}
{
  const r = checkDuplicate({ id: 'a', name: 'EWODO AYISSI JUAN PAOLO', date_naissance: '2015-02-20' }, REGISTRE);
  ok(r.level === DUP.NONE, '11. modifier une fiche ne la déclare pas doublon d’elle-même', r.level);
}

// ── 5) LE GARDE D'IMPORT : la même SAISIE, et elle seule ───────────────────
{
  const meme = { name: 'EWODO AYISSI JUAN PAOLO', date_naissance: '2015-02-20', lieu_naissance: 'Douala' };
  ok(!peutCreerEleve(meme, REGISTRE).ok, '12. la même ligne réimportée est refusée (un rejeu ne recrée pas l’élève)');
  ok(peutCreerEleve({ ...meme, lieu_naissance: 'Garoua' }, REGISTRE).ok,
    '13. même nom, même date, AUTRE ville : deux enfants — on laisse passer');
  ok(peutCreerEleve(meme, REGISTRE, { doublonConfirme: true }).ok,
    '14. et une confirmation donnée à l’écran l’emporte');
  ok(!peutCreerEleve({ name: 'Tout Autre Nom', matricule: 'elv-001' }, REGISTRE).ok,
    '15. un matricule déjà attribué est refusé');
}

// ── 6) Normalisations ──────────────────────────────────────────────────────
ok(normPhone('674 75 36 54') === normPhone('674753654'), '16. « 674 75 36 54 » = « 674753654 »');
ok(normPhone('+237 674753654') === normPhone('674753654'), '17. l’indicatif pays est ignoré');
ok(normName('Mbàllá  JEAN') === 'MBALLA JEAN', '18. accents et espaces multiples normalisés', normName('Mbàllá  JEAN'));
ok(isNameVariant('EWODO AYISSI JUAN PAOLO', 'EWODO AYISSI JUAN PAOLO JUNIOR'), '19. suffixe ajouté = variante');
ok(isNameVariant('MBALLA JEANNE', 'JEANNE MBALLA'), '20. prénoms inversés = variante');
ok(!isNameVariant('MBALLA JEANNE', 'MBALLA PIERRE'), '21. deux enfants d’une même famille ne sont pas une variante');

console.log(`\n${fail === 0 ? '✅' : '❌'} Doublons : ${pass} ok, ${fail} ko`);
process.exit(fail === 0 ? 0 : 1);
