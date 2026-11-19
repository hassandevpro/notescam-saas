// TABLEAUX D'HONNEUR — langues, couleurs, pagination (rendu pur, sans navigateur).
//
// Ce qui est vérifié est ce qui se verrait sur un document remis aux familles :
//   • 100 % français : AUCUN mot anglais (en-tête compris) ; 100 % anglais : aucun français ;
//   • « HONOUR ROLL », jamais « HONOR ROLL » ;
//   • MINESEC au secondaire, MINEDUB au primaire ;
//   • un champ personnalisé vide reprend le texte par défaut (jamais de trou) ;
//   • couleurs : réglage manuel > logo > défaut ; un logo noir et blanc ne donne pas de couleur ;
//   • palmarès : pagination sans perdre ni dupliquer un élève.
import { certificatHtml, palmaresHtml, MODELES, modeleParDefaut } from './modeles.js';
import { paletteHonneur, couleursDuLogo, DEFAUT } from './couleurs.js';
import { langueDePage, faitA, rang, nombre } from './textes.js';
import { nomCalligraphie } from './commun.js';

let fails = 0;
const ok = (c, m, got) => { if (c) console.log('  ✓', m); else { fails++; console.error('  ✗', m, got !== undefined ? JSON.stringify(got).slice(0, 300) : ''); } };
const texte = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

const T = { profPrincipal: { fr: 'Le Professeur principal', en: 'Class Master' }, chef: { fr: "Le Chef d'établissement", en: 'Principal' } };
const doc = (lang, extra = {}) => ({
  lang, basic: false, niveau: 'th', palette: paletteHonneur({}),
  ecole: { nom: 'COLLÈGE TEST', devise: 'Travail', logo: '', lieu: 'Yaoundé', annee: '2026-2027' },
  eleve: { nom: 'NGONO Prisca', classe: '4e A', periodeKey: 'term_1', moyenne20: 14.25, rang: 3, effectif: 41 },
  signataires: { gauche: { titre: T.profPrincipal, nom: 'M. X' }, droite: { titre: T.chef, nom: 'Mme Y' } },
  faitA: faitA('Yaoundé', lang === 'bi' ? 'fr' : lang, new Date('2026-11-20T10:00:00Z')),
  ...extra,
});

console.log('Langues, sur les 4 modèles');
const ANGLAIS = /REPUBLIC|Awarded|HONOUR|Class Master|Principal\b|Done at|Average|Position|OUT OF/;
const FRANCAIS = /RÉPUBLIQUE|Décerné|TABLEAU D'HONNEUR|Professeur|Fait à|Moyenne|Rang|SUR 20|trimestre/;
for (const m of MODELES.map((x) => x.id)) {
  const fr = texte(certificatHtml(m, doc('fr'))), en = texte(certificatHtml(m, doc('en'))), bi = texte(certificatHtml(m, doc('bi')));
  ok(!ANGLAIS.test(fr), `modèle ${m} — français : aucun mot anglais`, fr.match(ANGLAIS)?.[0]);
  ok(!FRANCAIS.test(en), `modèle ${m} — anglais : aucun mot français`, en.match(FRANCAIS)?.[0]);
  ok(/TABLEAU D'HONNEUR/.test(bi) && /HONOUR ROLL/i.test(bi), `modèle ${m} — bilingue : les deux titres`);
  ok(!/HONOR ROLL/i.test(fr + en + bi), `modèle ${m} — jamais « HONOR ROLL »`);
  ok(/MINESEC/.test(fr) && /MINEDUB/.test(texte(certificatHtml(m, doc('fr', { basic: true, primaire: true })))), `modèle ${m} — MINESEC / MINEDUB selon le cycle`);
}
const en = texte(certificatHtml(1, doc('en')));
ok(/1st Term/.test(en) && /3rd \/ 41/.test(en) && /14\.25/.test(en) && /Done at Yaoundé, on 20 November 2026/.test(en), 'anglais : période, rang, nombre, date', en.match(/1st Term|3rd|14\.25|Done at[^\n]*/g));
const fr = texte(certificatHtml(1, doc('fr')));
ok(/1er trimestre/.test(fr) && /3e \/ 41/.test(fr) && /14,25/.test(fr) && /Fait à Yaoundé, le 20 novembre 2026/.test(fr), 'français : période, rang, virgule, date');

console.log('Textes personnalisés');
const vide = texte(certificatHtml(1, doc('bi', { textes: { felFr: '', felEn: '' } })));
ok(/en reconnaissance de son travail/.test(vide) && /in recognition of outstanding effort/.test(vide), 'champs vides : textes par défaut FR et EN');
const perso = texte(certificatHtml(1, doc('bi', { textes: { felFr: 'Bravo Prisca', felEn: '' } })));
ok(/Bravo Prisca/.test(perso) && /in recognition of outstanding effort/.test(perso), 'FR personnalisé, EN vide → EN par défaut');
ok(/Bravo pour tes efforts/.test(texte(certificatHtml(4, doc('fr', { primaire: true, basic: true })))), 'primaire : message adapté aux enfants');
ok(/FÉLICITATIONS/.test(texte(certificatHtml(1, doc('fr', { niveau: 'fel' })))), 'niveau Félicitations : titre du niveau');

console.log('Couleurs');
ok(paletteHonneur({}).primaire === DEFAUT.primaire, 'sans logo ni réglage : couleur par défaut');
ok(paletteHonneur({ manuel: { primaire: '#7a1022' }, logo: { dominante: '#307744', accent: null } }).primaire === '#7a1022', 'réglage manuel prioritaire sur le logo');
ok(paletteHonneur({ logo: { dominante: '#307744', accent: '#bd2426' } }).or === DEFAUT.accent, 'accent rouge du logo : l’or reste doré');
const px = (r, g, b, n) => Array.from({ length: n }, () => [r, g, b, 255]).flat();
ok(couleursDuLogo(new Uint8ClampedArray([...px(255, 255, 255, 500), ...px(10, 10, 10, 500), ...px(128, 128, 128, 300)])) === null, 'logo noir et blanc : aucune couleur (réglage manuel conseillé)');
const lg = couleursDuLogo(new Uint8ClampedArray([...px(255, 255, 255, 800), ...px(48, 119, 68, 300), ...px(189, 36, 38, 400), ...px(240, 200, 40, 60)]));
ok(lg?.dominante && lg.accent && lg.dominante !== lg.accent, 'logo coloré : dominante et accent distincts', lg);

console.log('Palmarès');
const lignes = Array.from({ length: 50 }, (_, i) => ({ nom: `ÉLÈVE ${i + 1}`, classe: '4e A', moyenne20: 18 - i * 0.1, rang: i + 1, niveau: 'th' }));
const html = palmaresHtml(2, doc('fr', { lignes, groupe: '4e A' }));
const nPages = (html.match(/class="hon-page"/g) || []).length;
ok(nPages === 3, '50 élèves : 3 pages (19 + 25 + 6)', nPages);
ok(lignes.every((l) => html.includes(`>${l.nom}<`)) && (html.match(/>ÉLÈVE 1</g) || []).length === 1, 'chaque élève une fois, aucun perdu');
ok(/data-orientation="portrait"/.test(html), 'palmarès en A4 portrait');

console.log('Divers');
ok(langueDePage('auto', 'EN') === 'en' && langueDePage('auto', 'FR') === 'fr' && langueDePage('bilingue', 'EN') === 'bi', 'langue automatique = langue de la classe');
ok(rang(1, 'fr') === '1er' && rang(2, 'en') === '2nd' && rang(11, 'en') === '11th' && rang(23, 'en') === '23rd', 'rangs ordinaux');
ok(nombre(12, 'fr') === '12,00' && nombre(12, 'en') === '12.00', 'nombres');
ok(nomCalligraphie('ATANGANA Landry') === 'Atangana Landry' && nomCalligraphie('MBAPPÉ-NKOULOU Éloïse') === 'Mbappé-Nkoulou Éloïse', 'capitales adoucies pour la calligraphie');
ok(modeleParDefaut(true) === 4 && modeleParDefaut(false) === 1, 'défaut : 4 au primaire, 1 au secondaire');

if (fails) { console.error(`\n${fails} échec(s)`); process.exit(1); }
console.log('\nOK');
