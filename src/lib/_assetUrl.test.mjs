// Tests — UNE SEULE URL PAR AFFICHAGE (lib/storage.js).
//
//   node --experimental-loader ./src/lib/_assetUrl.hooks.mjs src/lib/_assetUrl.test.mjs
//
// Ce qui doit rester vrai :
//   · un asset de bucket PUBLIC ne déclenche AUCUNE signature — c'est la fin du
//     « URL publique puis URL signée », donc du double téléchargement ;
//   · l'URL rendue pour une URL publique déjà stockée est EXACTEMENT la même
//     qu'avant (aucun changement observable, cache CDN préservé) ;
//   · un bucket PRIVÉ passe par la signature, une seule fois ;
//   · une signature en échec ne dégrade jamais : repli sur la valeur d'origine ;
//   · un même asset demandé par N composants au même instant = UNE requête.
//
// Le client Supabase est une doublure qui compte les appels (cf. _assetUrl.hooks.mjs).

globalThis.__assetCalls = [];
globalThis.__assetSign = 'ok';
globalThis.__assetToken = 1;
globalThis.__assetLan = false;   // true = client LAN (URL relative, même origine)

const calls = globalThis.__assetCalls;
const reset = () => { calls.length = 0; globalThis.__assetSign = 'ok'; };
const countOf = (kind) => calls.filter((c) => c.kind === kind).length;

const {
  assetPath, assetUrlPlan, assetUrlSync, assetUrl, signedUrl, isPublicBucket, BUCKET_PUBLIC,
} = await import('./storage.js');

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };
const eq = (a, b, msg) => ok(a === b, `${msg}  (${a} attendu ${b})`);

const PUB = 'https://xyz.supabase.co/storage/v1/object/public/school-assets/ecole1/logo.png';

// ── Visibilité déclarée ──────────────────────────────────────────────────────
ok(isPublicBucket('school-assets') === true, 'school-assets est déclaré public');
ok(isPublicBucket('bulletin-templates') === true, 'bulletin-templates est déclaré public');
ok(isPublicBucket('inconnu') === false, 'un bucket non déclaré est traité comme privé (signature)');
ok(Object.isFrozen(BUCKET_PUBLIC), 'la table de visibilité est figée (pas de mutation à chaud)');

// ── Extraction du chemin (comportement conservé) ─────────────────────────────
eq(assetPath(PUB), 'ecole1/logo.png', 'chemin extrait d’une URL publique');
eq(assetPath('ecole1/logo.png'), 'ecole1/logo.png', 'chemin brut conservé');
eq(assetPath('https://ailleurs.example/logo.png'), null, 'URL hors bucket = non gérée');
eq(assetPath('data:image/png;base64,AAAA'), null, 'data: = non gérée');
eq(assetPath(null), null, 'null = non géré');

// ── Décision PURE ────────────────────────────────────────────────────────────
eq(assetUrlPlan(PUB, true).kind, 'as-is', 'bucket public + URL publique → telle quelle');
eq(assetUrlPlan(PUB, true).url, PUB, 'l’URL rendue est identique à la valeur stockée');
eq(assetUrlPlan('ecole1/logo.png', true).kind, 'public', 'bucket public + chemin → URL publique construite');
eq(assetUrlPlan(PUB, false).kind, 'sign', 'bucket privé → signature');
eq(assetUrlPlan('https://ailleurs.example/l.png', true).kind, 'as-is', 'hors bucket → telle quelle');
eq(assetUrlPlan('https://ailleurs.example/l.png', false).kind, 'as-is', 'hors bucket → telle quelle même en privé');

// ── Bucket public : AUCUNE signature, AUCUN double téléchargement ────────────
reset();
eq(assetUrlSync(PUB), PUB, 'assetUrlSync rend l’URL publique telle quelle');
eq(countOf('createSignedUrl'), 0, 'aucune signature demandée pour un asset public');
eq(countOf('getPublicUrl'), 0, 'aucune reconstruction d’URL quand la valeur en est déjà une');

reset();
const resolved = await assetUrl(PUB);
eq(resolved, PUB, 'assetUrl rend la même URL que assetUrlSync');
eq(countOf('createSignedUrl'), 0, 'assetUrl ne signe pas sur bucket public');
ok(resolved === assetUrlSync(PUB), 'synchrone et asynchrone donnent la MÊME url → une seule ressource chargée');

reset();
const built = assetUrlSync('ecole1/logo.png');
eq(countOf('getPublicUrl'), 1, 'un chemin brut construit l’URL publique (appel local, hors réseau)');
ok(String(built).includes('/object/public/school-assets/ecole1/logo.png'), 'URL publique correctement construite');
eq(countOf('createSignedUrl'), 0, 'toujours aucune signature');

// ── Valeurs non gérées ───────────────────────────────────────────────────────
reset();
eq(assetUrlSync('https://ailleurs.example/logo.png'), 'https://ailleurs.example/logo.png', 'logo distant rendu tel quel');
eq(assetUrlSync(null), null, 'null → null');
eq(assetUrlSync(''), null, 'chaîne vide → null');
eq(assetUrlSync(undefined), null, 'undefined → null');
eq(countOf('createSignedUrl'), 0, 'aucune requête pour une valeur non gérée');

// ── Bucket privé : c’est la signature qui prend le relais ────────────────────
eq(assetUrlSync(PUB, false), null, 'bucket privé : pas d’URL synchrone → signature requise');

reset();
const sgn = await signedUrl('ecole1/prive-a.png');
eq(countOf('createSignedUrl'), 1, 'bucket privé : une seule signature');
ok(String(sgn).includes('/object/sign/'), 'une URL signée est bien renvoyée');

// ── Cache : le même asset ne se resigne pas ─────────────────────────────────
reset();
const c1 = await signedUrl('ecole1/prive-a.png'); // déjà signée juste avant
eq(countOf('createSignedUrl'), 0, 'second appel servi par le cache, aucune requête');
eq(c1, sgn, 'le cache rend exactement la même URL');

// ── Concurrence : 60 bulletins, un seul logo, une seule signature ───────────
reset();
const many = await Promise.all(Array.from({ length: 60 }, () => signedUrl('ecole1/prive-concurrent.png')));
eq(countOf('createSignedUrl'), 1, '60 demandes simultanées = 1 signature (déduplication en vol)');
ok(many.every((u) => u === many[0]), 'les 60 consommateurs reçoivent la même URL');

// ── Changement de source : deux assets = deux signatures ────────────────────
reset();
await signedUrl('ecole1/prive-b.png');
await signedUrl('ecole1/prive-c.png');
eq(countOf('createSignedUrl'), 2, 'deux chemins distincts = deux signatures');

// ── Erreurs : ne jamais dégrader l’existant ─────────────────────────────────
reset();
globalThis.__assetSign = 'error';
const e1 = await signedUrl('ecole1/err-1.png');
eq(e1, 'ecole1/err-1.png', 'signature refusée → repli sur la valeur d’origine');

reset();
globalThis.__assetSign = 'throw';
const e2 = await signedUrl('ecole1/err-2.png');
eq(e2, 'ecole1/err-2.png', 'exception réseau → repli sur la valeur d’origine');

reset();
globalThis.__assetSign = 'empty';
const e3 = await signedUrl('ecole1/err-3.png');
eq(e3, 'ecole1/err-3.png', 'réponse sans URL → repli sur la valeur d’origine');

// Un échec ne doit pas empoisonner le cache : le prochain essai retente.
reset();
globalThis.__assetSign = 'ok';
const e4 = await signedUrl('ecole1/err-1.png');
eq(countOf('createSignedUrl'), 1, 'après un échec, une nouvelle tentative est bien émise');
ok(String(e4).includes('/object/sign/'), 'la reprise après échec renvoie une URL signée');

// ── Invariant central du chantier ───────────────────────────────────────────
reset();
for (let i = 0; i < 5; i++) assetUrlSync(PUB); // 5 remontages du même logo
eq(calls.length, 0, 'INVARIANT : afficher 5 fois un asset public ne déclenche AUCUNE requête');

// ═══════════════════════════════════════════════════════════════════════════
// RÉGRESSION — URL RELATIVE DE L'ÉDITION LAN (photos qui « disparaissent »)
// ═══════════════════════════════════════════════════════════════════════════
// `localClient.getPublicUrl` sert les fichiers sur la MÊME ORIGINE que la SPA :
// il écrit donc `/files/<bucket>/<chemin>` en base, une URL RELATIVE. Or
// `assetPath` ne cherchait le marqueur de bucket que dans une URL `http(s)` :
// la valeur tombait dans la branche « chemin déjà relatif », son préfixe
// `/files/school-assets/` était conservé, puis RÉAPPLIQUÉ à la construction.
//
// Résultat observé en production LAN :
//     /files/school-assets/files/school-assets/ecole1/students/eleve42.jpg → 404
//
// Photo de bulletin, logo, signature et tampon passent tous par ce chemin
// (`AssetImg`, `BulletinPhoto`) : tous étaient donc absents des bulletins LAN.
const LAN = '/files/school-assets/ecole1/students/eleve42.jpg?v=1760000000000';

eq(assetPath(LAN), 'ecole1/students/eleve42.jpg',
  'LAN : le chemin extrait est RELATIF AU BUCKET (préfixe /files/<bucket>/ retiré)');
ok(!String(assetPath(LAN)).includes('files/school-assets'),
  'LAN : le préfixe de service ne subsiste jamais dans le chemin');

// Sous le client LAN (cf. __assetLan dans _assetUrl.hooks.mjs), l'URL rendue
// doit être EXACTEMENT celle que le serveur d'école sert.
reset();
globalThis.__assetLan = true;
eq(assetUrlSync(LAN), '/files/school-assets/ecole1/students/eleve42.jpg?v=1760000000000',
  'LAN : URL rendue identique à celle servie par le serveur — et `?v=` PRÉSERVÉ');
ok(!String(assetUrlSync(LAN)).includes('school-assets/files/'),
  'LAN : plus aucun double préfixe (le 404 d’origine)');
eq(countOf('createSignedUrl'), 0, 'LAN : aucune signature pour un bucket public');
globalThis.__assetLan = false;

// Le chemin remis aux API de stockage ne doit JAMAIS porter le suffixe : signer
// « x.jpg?v=1 » ne désigne aucun objet.
reset();
await signedUrl(LAN, 60);
eq(calls.find((c) => c.kind === 'createSignedUrl')?.path, 'ecole1/students/eleve42.jpg',
  'LAN : la signature porte sur le chemin NU, sans le cache-buster');

// Même forme relative sans cache-buster, et avec fragment.
eq(assetPath('/files/school-assets/ecole1/logo.png'), 'ecole1/logo.png',
  'LAN : forme relative sans query');
eq(assetPath('/files/school-assets/ecole1/logo.png#page=1'), 'ecole1/logo.png',
  'LAN : le fragment est retiré du chemin');
reset();
ok(String(assetUrlSync('/files/school-assets/ecole1/logo.png#page=1')).endsWith('#page=1'),
  'LAN : le fragment est préservé dans l’URL rendue');

// ── Le cache-buster survit aussi sur une URL absolue (cloud) ────────────────
const PUB_V = `${PUB}?v=42`;
eq(assetPath(PUB_V), 'ecole1/logo.png', 'cloud : query ignorée pour le chemin');
reset();
eq(assetUrlSync(PUB_V), PUB_V, 'cloud : URL absolue rendue telle quelle, `?v=` compris');

// ── Un chemin brut conserve son suffixe une fois l’URL construite ───────────
reset();
ok(String(assetUrlSync('ecole1/logo.png?v=7')).endsWith('/school-assets/ecole1/logo.png?v=7'),
  'chemin brut + query → URL publique construite AVEC la query');

// ── Aucune régression sur les valeurs étrangères ────────────────────────────
eq(assetPath('https://ailleurs.example/x/school-assets-faux.png'), null,
  'un chemin qui RESSEMBLE au marqueur sans l’être reste hors bucket');
eq(assetPath('/files/autre-bucket/ecole1/x.png'), 'files/autre-bucket/ecole1/x.png',
  'un autre bucket n’est pas réécrit (comportement inchangé)');
// ── Séparateur doublé : un chemin de stockage ne commence jamais par « / » ──
// `createSignedUrl('/x.jpg')` et `createSignedUrl('x.jpg')` désignent deux clés
// différentes, et seule la seconde existe. Une valeur « …/school-assets//x.jpg »
// laissait un slash en tête du chemin extrait, d'où une URL « …//x.jpg ».
eq(assetPath('/files/school-assets//eleve42.jpg'), 'eleve42.jpg',
  'séparateur doublé après le marqueur : chemin nu');
eq(assetPath('//files/school-assets/eleve42.jpg'), 'eleve42.jpg',
  'double slash initial : chemin nu');
eq(assetPath(`${PUB.replace('/school-assets/', '/school-assets//')}`), 'ecole1/logo.png',
  'séparateur doublé dans une URL absolue : chemin nu');
reset();
globalThis.__assetLan = true;
ok(!/[^:]\/\//.test(String(assetUrlSync('/files/school-assets//eleve42.jpg'))),
  'aucune URL rendue ne porte de double slash');
eq(assetUrlSync('/files/school-assets//eleve42.jpg'), '/files/school-assets/eleve42.jpg',
  'séparateur doublé → URL normalisée');
globalThis.__assetLan = false;

eq(assetPath('/files/school-assets/'), '', 'marqueur en fin de chaîne → chemin vide (valeur rendue telle quelle)');
eq(assetPath('  '), null, 'valeur blanche = non gérée');
eq(assetPath('data:image/png;base64,c2Nob29sLWFzc2V0cw=='), null,
  'data: reste non géré même si son contenu encodé évoque le bucket');

console.log(failed ? '\n❌ Des tests ont échoué' : '\n✅ Tous les tests passent');
process.exit(failed ? 1 : 0);
