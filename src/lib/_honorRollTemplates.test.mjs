// MODÈLES DE TABLEAU D'HONNEUR : UN POSTE NE PERD PAS LES SIENS QUAND L'ÉCOLE A DÉJÀ UNE LISTE.
//
// Le défaut corrigé (2026-11-21) : les modèles passés du navigateur à l'établissement, le
// premier administrateur versait SA liste (parfois les seuls modèles natifs), puis chaque
// autre poste voyait la sienne REMPLACÉE par celle de l'école, sans un mot. Ici : un poste
// garde ses modèles personnalisés ; les natifs ne se dupliquent pas ; une fois versés,
// l'école fait foi (un modèle supprimé ailleurs ne revient pas).
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
};

const { chargerModeles, orphelinsLocaux, marquerVerse, listTemplates, upsertTemplate, blankTemplate, serialiserModeles } =
  await import('./honorRollTemplates.js');

let fails = 0;
const ok = (c, m, got) => { if (c) console.log('  ✓', m); else { fails++; console.error('  ✗', m, got !== undefined ? JSON.stringify(got) : ''); } };
const noms = (l) => l.map((x) => x.name).sort().join(' | ');

// Poste A (premier administrateur) : seulement les modèles natifs → c'est ce qui part à l'école.
const ecoleId = 'e1';
const natifsA = listTemplates(ecoleId);
const school = { id: ecoleId, honor_roll_templates: serialiserModeles(natifsA) };

// Poste B : même école, ses natifs (autres identifiants) + un modèle à lui.
mem.clear();
listTemplates(ecoleId);
upsertTemplate(ecoleId, { ...blankTemplate(), name: 'Major de promotion (poste B)' });
const nbNatifs = natifsA.length;

console.log('Poste B, première ouverture');
ok(orphelinsLocaux(school).map((x) => x.name).join() === 'Major de promotion (poste B)', 'seul le modèle personnalisé est à verser',
  orphelinsLocaux(school).map((x) => x.name));
const vus = chargerModeles(school);
ok(vus.some((x) => x.name === 'Major de promotion (poste B)'), 'le modèle du poste B n’est PAS écrasé par la liste de l’école', noms(vus));
ok(vus.length === nbNatifs + 1, 'les modèles natifs ne sont pas doublés', vus.length);
ok(noms(listTemplates(ecoleId)) === noms(vus), 'le cache du navigateur garde la liste fusionnée');

console.log('Après versement par un administrateur');
const ecoleApres = { id: ecoleId, honor_roll_templates: serialiserModeles(vus) };
marquerVerse(ecoleId);
ok(orphelinsLocaux(ecoleApres).length === 0, 'plus rien à verser');
const sansMajor = vus.filter((x) => x.name !== 'Major de promotion (poste B)');
const ecoleSupprime = { id: ecoleId, honor_roll_templates: serialiserModeles(sansMajor) };
ok(!chargerModeles(ecoleSupprime).some((x) => x.name === 'Major de promotion (poste B)'),
  'supprimé depuis un autre poste : il ne revient pas (l’école fait foi)');

console.log('Poste neuf, école sans modèle');
mem.clear();
ok(chargerModeles({ id: 'e2' }).length === nbNatifs, 'les modèles natifs, comme avant');
ok(orphelinsLocaux({ id: 'e2' }).length === 0, 'rien à fusionner sans liste d’école');

if (fails) { console.error(`\n${fails} échec(s)`); process.exit(1); }
console.log('\nOK');
