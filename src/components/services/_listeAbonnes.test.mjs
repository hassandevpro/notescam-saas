// Tests — L'ONGLET « ÉLÈVES ABONNÉS » TIENT SES CRITÈRES D'ACCEPTATION.
//
//   node src/components/services/_listeAbonnes.test.mjs
//
// Vérification au niveau de la SOURCE, comme src/components/_syncGuards.test.mjs
// et server/_schema_upgrade.test.mjs : il n'y a pas de moteur de rendu React
// dans ce dépôt, et les invariants tenus ici sont bien syntaxiques — dans
// quelle branche une action est écrite, quelle piste de grille est déclarée,
// sur quel élément l'infobulle est posée. Ce que seul un navigateur peut dire
// (débordement réel, fluidité) est couvert par `e2e/02-registre-services`.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const lire = (f) => readFileSync(join(here, f), 'utf8');
const liste = lire('ListeAbonnes.jsx');
const ligne = lire('LigneAbonne.jsx');
const banniere = lire('BanniereFiltre.jsx');
const filtres = lire('FiltresRegistre.jsx');
const grille = lire('GrilleMensuelle.jsx');

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };
const compte = (s, motif) => s.split(motif).length - 1;

// ── CRITÈRE 9 — « Abonner un élève » visible liste vide ET liste pleine ───
//
// LE DÉFAUT QUE CECI VERROUILLE. `ListeAbonnes` ne rendait le bouton que dans
// sa branche de LISTE VIDE (`if (!abonnes.length)`). Dès le premier abonné, la
// branche n'était plus prise et le bouton disparaissait : le seul chemin pour
// abonner le deuxième élève passait par le menu replié « ⋯ Plus ». Constaté le
// 2026-11-03 sur la cantine de THE GENIUS, 8 abonnés — c'est-à-dire exactement
// le cas normal d'une rentrée, où l'on inscrit les élèves un par un pendant
// des semaines. Un bouton présent uniquement à vide est le pire des deux
// mondes : il montre que l'action existe, puis se dérobe dès qu'on s'en sert.
const iVide = liste.indexOf('if (!abonnes.length)');
const iListe = liste.indexOf('\n  return (', iVide);
ok(iVide > 0, 'la branche « liste vide » existe toujours');
ok(iListe > iVide, 'la branche « liste pleine » vient après elle');

const brancheVide = liste.slice(iVide, iListe);
const brancheListe = liste.slice(iListe);

ok(compte(brancheVide, 'boutonAbonner(') >= 1,
  'la liste VIDE propose toujours d’abonner (on ne régresse pas l’inverse)');
ok(compte(brancheListe, 'boutonAbonner(') >= 1,
  'LA LISTE PLEINE propose aussi d’abonner — c’est le défaut corrigé');

// Il doit être EN HAUT, pas enterré sous les lignes : une liste de 8 élèves
// tient à l'écran, une liste de 320 non, et l'action se chercherait au
// kilomètre.
const iUl = brancheListe.indexOf('<ul');
const iBouton = brancheListe.indexOf('boutonAbonner(');
ok(iUl > 0 && iBouton > 0 && iBouton < iUl,
  'le bouton est dans l’en-tête de la liste, avant les lignes');

// Le geste est réservé à qui encaisse : `Cantine.jsx` ne passe `onAbonner` que
// si `canCollectFees`. Le composant ne doit donc jamais le rendre en dur.
ok(/onAbonner &&/.test(liste),
  'le composant n’ouvre pas l’abonnement lui-même : il dépend du prop fourni');
ok(!/onClick=\{\(\)\s*=>\s*setAbonnement/.test(liste),
  'aucun état d’abonnement n’est piloté depuis le composant de liste');

// ── CRITÈRE 1 — aucun défilement horizontal à 375 px ──────────────────────
//
// `1fr` prend pour minimum la taille de son contenu : un nom de 38 caractères
// élargirait la grille au-delà de l'écran MALGRÉ le `truncate`, et c'est la
// cause exacte du « coupé à droite » signalé par le responsable. `minmax(0,
// 1fr)` est la correction, et elle doit rester.
ok(/grid-cols-\[minmax\(0,1fr\)_auto\]/.test(ligne),
  'la rangée déclare minmax(0,1fr) sur petit écran, pas 1fr');
ok(/sm:grid-cols-\[minmax\(0,1fr\)_8rem_7rem_auto\]/.test(ligne),
  'la rangée déclare minmax(0,1fr) aussi à partir de sm');
ok(/truncate/.test(ligne), 'le nom est tronqué, il ne pousse pas la grille');
ok(!/overflow-x/.test(liste) && !/overflow-x/.test(ligne),
  'la liste n’a AUCUN conteneur à défilement horizontal');
// Le dépôt est en CRLF : `/\/\/.*$/m` ne mord pas, parce que `.` s'arrête
// avant le `\r` et que `$` cherche la position juste avant le `\n`. On
// découpe donc sur ce qui n'est NI `\r` NI `\n`.
const sansCommentaires = (src) => src.replace(/\/\/[^\r\n]*/g, '');
ok(!/<table/.test(sansCommentaires(liste)) && !/<table/.test(sansCommentaires(ligne)),
  'aucun <table> dans la liste : il imposerait sa largeur');

// ── CRITÈRE 10 — le rendu par tranches annonce le bon N ───────────────────
ok(/const PAR_TRANCHE = 60;/.test(liste), 'la tranche vaut 60 lignes');
ok(/abonnes\.slice\(0, PAR_TRANCHE\)/.test(liste), 'seule la tranche est rendue');
ok(/abonnes\.length - PAR_TRANCHE/.test(liste),
  '« Afficher les N autres » calcule N depuis le total, pas une constante');
ok(/data-role="afficher-tout"/.test(liste), 'le bouton « tout afficher » est repérable en e2e');
ok(/data-role="compte-abonnes"/.test(liste) && /sur \$\{abonnes\.length\}/.test(liste),
  'le compte annonce « N sur M » tant que la liste est tronquée');

// ── Le tri, en pastilles, avec l'option retenue visible ───────────────────
ok(/aria-pressed=\{tri === cle\}/.test(liste),
  'les pastilles de tri annoncent laquelle est retenue (aria-pressed)');
ok(/\['nom',[\s\S]*\['reste',[\s\S]*\['statut',/.test(liste),
  'les trois tris sont nom, reste et statut');

// ── « Rien dû » n'affiche pas un zéro ─────────────────────────────────────
// Un « 0 XAF » sur un élève à qui l'école ne facture rien laisserait croire
// qu'il a payé. Les autres portent leur reste, zéro compris.
ok(/a\.statut === 'sans_dette' \? '—' : money\(a\.reste\)/.test(ligne),
  '« Rien dû » affiche un tiret ; tout autre état affiche son reste');

// ── L'infobulle d'un bouton éteint ────────────────────────────────────────
// Un bouton `disabled` ne reçoit pas d'événement de survol : son `title` ne
// s'affiche jamais, et la secrétaire reste sans explication.
const iSpanTitre = ligne.indexOf('title={rienAEncaisser');
const iBoutonEnc = ligne.indexOf('disabled={rienAEncaisser}');
ok(iSpanTitre > 0 && iBoutonEnc > iSpanTitre,
  'l’infobulle « Rien à encaisser » est sur le conteneur, pas sur le bouton éteint');
ok(/aria-label=\{`\$\{t\('Encaisser'/.test(ligne),
  'le bouton Encaisser porte un aria-label qui nomme l’élève');

// ── CRITÈRE 2 — la ligne est mémoïsée ─────────────────────────────────────
ok(/export default memo\(LigneAbonne\)/.test(ligne),
  'la ligne est mémoïsée : 320 lignes ne se reconstruisent pas à chaque frappe');

// ── CRITÈRE 4 — la bannière de filtre existe et est réutilisable ──────────
ok(/data-role="banniere-filtre"/.test(banniere), 'la bannière est repérable en e2e');
ok(/role="status"/.test(banniere), 'la bannière est annoncée aux lecteurs d’écran');
ok(/affiches\} \/ \{total\}/.test(banniere), 'elle annonce « N / M élèves »');

// ── CRITÈRE 5 — aucun bouton d'écriture sans le droit ─────────────────────
ok(/\{canCollect && \(/.test(ligne),
  'le bouton Encaisser n’est rendu que si l’utilisateur encaisse');

// ── CRITÈRE 6 — trois langues partout ─────────────────────────────────────
// Un `t(...)` à deux arguments est un libellé oublié en chemin : l'espagnol
// manquerait silencieusement à l'écran.
for (const [nom, src] of [['ListeAbonnes', liste], ['LigneAbonne', ligne],
  ['BanniereFiltre', banniere], ['FiltresRegistre', filtres]]) {
  const appels = src.match(/\bt\('(?:[^'\\]|\\.)*'(?:,\s*)?/g) || [];
  const deuxArgs = (src.match(/\bt\((?:'(?:[^'\\]|\\.)*'|`[^`]*`)\s*,\s*(?:'(?:[^'\\]|\\.)*'|`[^`]*`)\s*\)/g) || []);
  ok(appels.length > 0 && deuxArgs.length === 0,
    `${nom} : les ${appels.length} libellés sont tous en trois langues`
    + (deuxArgs.length ? ` — manquants : ${deuxArgs.join(' | ')}` : ''));
}

// ── CRITÈRE 7 — le ton ne repose jamais sur la seule couleur ──────────────
ok(/border-emerald-300/.test(ligne) && /border-rose-300/.test(ligne),
  'chaque état porte fond, texte ET bordure');
ok(/dark:bg-emerald-900\/30/.test(ligne) && /dark:bg-rose-900\/30/.test(ligne),
  'chaque état a sa déclinaison sombre');
ok(/border-dashed|border-dotted/.test(grille),
  'la grille distingue aussi les tons par le TRAIT, pas seulement la couleur');

// ── Cibles tactiles ───────────────────────────────────────────────────────
ok(compte(ligne, 'min-h-[44px]') >= 2,
  'les actions principales de la ligne font au moins 44 px');
ok(/min-h-\[36px\]/.test(liste), 'les actions secondaires font au moins 36 px');
// Les trois champs partagent la constante `CHAMP` : on exige qu'elle porte la
// hauteur, et que les boutons du bloc l'aient aussi. Compter les occurrences
// brutes récompenserait la duplication.
ok(/const CHAMP = [\s\S]*min-h-\[44px\]/.test(filtres),
  'la classe commune des champs de filtre impose 44 px');
ok(compte(filtres, 'className={CHAMP}') + compte(filtres, 'className={`flex-1 ${CHAMP}`}') >= 3,
  'les trois réducteurs et la recherche l’emploient');
ok(compte(filtres, 'min-h-[44px]') >= 3,
  'les boutons « Filtres » et « Effacer » font aussi 44 px');

console.log(failed ? '\n❌ ÉCHEC' : '\n✅ OK');
process.exit(failed ? 1 : 0);
