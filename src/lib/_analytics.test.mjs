// LA MESURE D'USAGE NE DOIT NI ATTEINDRE L'ÉDITION LAN, NI CAPTURER L'ÉCRAN
//
//   node src/lib/_analytics.test.mjs
//
// Vérification syntaxique assumée, même approche que `_offlineGate.test.mjs` :
// l'invariant porte sur ce qui est ÉCRIT dans les sources, parce que c'est le
// repliage au build de la constante `IS_LAN` et le caractère DYNAMIQUE de
// l'import qui décident si `posthog-js` entre ou non dans le bundle LAN.
//
// Les trois choses que ce test empêche de revenir :
//
//   1. un poste d'école (LAN), hors ligne par conception, qui se met à appeler
//      un service tiers — et fait sortir de l'école des données scolaires ;
//   2. `autocapture` ou le rejeu de session réactivés : le premier envoie le
//      texte des éléments cliqués, le second envoie l'écran. Sur cette
//      application, ce sont des noms d'élèves, des notes et des montants ;
//   3. une clé d'ingestion écrite en dur dans le dépôt.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const SRC = join(ICI, '..');
const src = readFileSync(join(ICI, 'analytics.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}${got === undefined ? '' : ` — ${got}`}`); }
};

console.log('\n── 1. Jamais en LAN ──');
ok(/import \{ IS_LAN \} from '\.\/edition\.js'/.test(src), 'le drapeau d’édition vient de edition.js');
ok(/return\s+!IS_LAN\s+&&\s+!!CLE/.test(src), 'analyticsActif() exige l’édition cloud ET une clé');
ok(/if \(!analyticsActif\(\)\) return Promise\.resolve\(null\)/.test(src), 'initAnalytics() sort avant tout chargement');

console.log('\n── 2. posthog-js n’entre pas dans le bundle LAN ──');
ok(/await |import\('posthog-js'\)/.test(src) && /import\('posthog-js'\)/.test(src),
   'l’import de posthog-js est DYNAMIQUE');
ok(!/^\s*import .*from 'posthog-js'/m.test(src), 'aucun import statique de posthog-js');

// Aucun autre fichier de src/ ne doit parler à posthog directement : tout passe
// par ce module, sinon les gardes ci-dessus seraient contournées.
const fichiers = [];
(function marche(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) { marche(p); continue; }
    if (/\.(js|jsx|mjs)$/.test(e)) fichiers.push(p);
  }
})(SRC);
const FORMES = ["from 'posthog-js'", "import('posthog-js')", "require('posthog-js')"];
const intrus = fichiers.filter((f) => !f.endsWith('analytics.js') && !f.includes('.test.')
  && FORMES.some((forme) => readFileSync(f, 'utf8').includes(forme)));
ok(intrus.length === 0, 'src/ n’IMPORTE posthog-js que dans src/lib/analytics.js',
   intrus.map((f) => f.replace(SRC, 'src')).join(', '));

console.log('\n── 3. Rien ne capture l’écran ni le texte cliqué ──');
ok(/autocapture:\s*false/.test(src), 'autocapture coupé');
ok(/disable_session_recording:\s*true/.test(src), 'rejeu de session coupé');
ok(/capture_pageview:\s*false/.test(src), 'la vue d’écran automatique est coupée (URL non gabarisée)');
ok(/mask_all_text:\s*true/.test(src) && /mask_all_element_attributes:\s*true/.test(src),
   'masquage du texte et des attributs, en ceinture et bretelles');

console.log('\n── 4. Tout ce qui part est filtré ──');
ok(/sanitize_properties:/.test(src), 'les propriétés fabriquées par PostHog sont filtrées aussi');
ok(/p\.\$current_url = sanitizePath/.test(src), 'l’URL courante est gabarisée (elle porte l’identifiant de l’élève)');
for (const [fn, appel] of [['identifyUser', 'scrubProps'], ['trackEvent', 'scrubProps'], ['trackPageview', 'sanitizePath']]) {
  const corps = src.slice(src.indexOf(`export function ${fn}`));
  ok(corps.slice(0, 400).includes(appel), `${fn}() passe par ${appel}()`);
}
ok(!/\bfullName\b|\bemail\b/.test(src), 'ni le nom ni l’adresse e-mail n’apparaissent dans le module');

console.log('\n── 5. Aucune clé dans le dépôt ──');
ok(!/phc_[A-Za-z0-9]/.test(src), 'aucune clé d’ingestion en dur');
ok(/import\.meta\.env\?\.VITE_POSTHOG_KEY/.test(src), 'la clé vient de l’environnement de build');

console.log('\n── 6. Jamais bloquant ──');
ok(/\.catch\(/.test(src), 'un échec de chargement est avalé');
ok((src.match(/catch \{ \/\* jamais bloquant \*\/ \}/g) || []).length >= 3,
   'chaque appel sortant est protégé');

console.log(`\n${pass} réussis · ${fail} échoués`);
process.exit(fail ? 1 : 0);
