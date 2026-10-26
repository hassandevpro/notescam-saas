// CE QUI PART EN MESURE D'USAGE NE DOIT JAMAIS ÊTRE UNE DONNÉE D'ÉLÈVE
//
//   node src/lib/_analyticsScrub.test.mjs
//
// PostHog a été ajouté le 2026-10-24. Le risque n'est pas la mesure : c'est
// qu'un appelant passe, sans y penser, un nom d'élève, une note, un numéro de
// parent ou l'objet d'une dépense dans les propriétés d'un événement — ou que
// l'URL courante, qui porte l'identifiant de l'élève consulté, parte telle
// quelle. Une donnée envoyée à un tiers ne se reprend pas.
//
// Ces assertions tiennent le filtre : elles échouent si quelqu'un l'assouplit.
import {
  jetons, cleInterdite, cheminDeUrl, sanitizePath, scrubProps,
} from './analyticsScrub.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}${got === undefined ? '' : ` — obtenu : ${JSON.stringify(got)}`}`); }
};

console.log('\n── 1. Découpage des noms de propriété ──');
ok(JSON.stringify(jetons('fullName')) === '["full","name"]', 'camelCase découpé', jetons('fullName'));
ok(JSON.stringify(jetons('school_id')) === '["school","id"]', 'snake_case découpé', jetons('school_id'));

console.log('\n── 2. Le filtre ne se déclenche PAS sur une sous-chaîne ──');
// Le piège : « cycle » contient « cle », « hôtel » contient « tel ». Un filtre
// par `includes` jetterait ces propriétés anodines, on le désactiverait, et il
// ne protégerait plus rien.
ok(!cleInterdite('cycle'), '« cycle » passe (contient pourtant « cle »)');
ok(!cleInterdite('hotel'), '« hotel » passe (contient pourtant « tel »)');
ok(!cleInterdite('role') && !cleInterdite('school_id'), '« role » et « school_id » passent');

console.log('\n── 3. Les clés personnelles sont écartées ──');
for (const k of ['nom', 'fullName', 'email', 'telephone', 'matricule', 'adresse', 'parentPhone', 'photo_url', 'password', 'token']) {
  ok(cleInterdite(k), `« ${k} » écartée`);
}
console.log('\n── 3 bis. Le texte libre aussi : il contient souvent le nom ──');
for (const k of ['note', 'moyenne', 'appreciation', 'commentaire', 'libelle', 'objet', 'recherche']) {
  ok(cleInterdite(k), `« ${k} » écartée`);
}

console.log('\n── 4. Valeurs : écartées, jamais tronquées ──');
const scrub = scrubProps({
  role: 'admin',
  school_id: '6b68407b-3d2e-426b-81ff-c4e68e66120a',
  cycle: 'premier',
  montant: 4500,
  actif: true,
  contact: 'ali.bakari@ecole.cm',                  // e-mail sous une clé anodine
  ligne: '+237 690 11 22 33',                      // téléphone sous une clé anodine
  resume: 'Paiement de la facture SOCADEL du mois de juillet pour le manège et le collège',
  vide: '   ',
  rien: null,
  detail: { eleve: 'Ali Bakari' },                 // objet : on ne sait pas ce qu'il porte
  liste: ['Ali Bakari'],
});
ok(scrub.role === 'admin' && scrub.cycle === 'premier', 'les étiquettes courtes passent');
ok(scrub.montant === 4500 && scrub.actif === true, 'nombres et booléens passent');
ok(scrub.school_id === '6b68407b-3d2e-426b-81ff-c4e68e66120a', 'un identifiant technique passe');
ok(!('contact' in scrub), 'un e-mail est écarté même sous une clé anodine');
ok(!('ligne' in scrub), 'un téléphone est écarté même sous une clé anodine');
ok(!('resume' in scrub), 'un texte libre long est ÉCARTÉ (le tronquer laisserait passer son début)');
ok(!('vide' in scrub) && !('rien' in scrub), 'vide et null ne partent pas');
ok(!('detail' in scrub) && !('liste' in scrub), 'objets et tableaux ne partent jamais');
ok(!JSON.stringify(scrub).includes('Ali Bakari'), 'aucun nom ne subsiste dans la charge utile', scrub);

console.log('\n── 5. Le nombre de propriétés est borné ──');
const large = {}; for (let i = 0; i < 100; i++) large[`p${i}`] = i;
ok(Object.keys(scrubProps(large)).length === 25, 'plafond par défaut à 25 propriétés');
ok(Object.keys(scrubProps(large, { max: 80 })).length === 80, 'plafond relevable pour les propriétés de PostHog');

console.log('\n── 6. Les chemins sont gabarisés ──');
ok(sanitizePath('/app/students/6b68407b-3d2e-426b-81ff-c4e68e66120a') === '/app/students/:id',
   'un identifiant d’élève devient :id', sanitizePath('/app/students/6b68407b-3d2e-426b-81ff-c4e68e66120a'));
ok(sanitizePath('/app/students/6b68407b-3d2e-426b-81ff-c4e68e66120a/notes?q=Ali%20Bakari') === '/app/students/:id/notes',
   'la query est coupée — une recherche contient des noms');
ok(sanitizePath('/app/classes/42') === '/app/classes/:n', 'un numéro devient :n');
ok(cheminDeUrl('https://app.notescam.com/app/students/42?x=1') === '/app/students/42',
   'une URL complète est réduite à son chemin');
ok(sanitizePath('/') === '/', 'la racine reste la racine');

console.log(`\n${pass} réussis · ${fail} échoués`);
process.exit(fail ? 1 : 0);
