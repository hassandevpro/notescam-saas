#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// EFFACER DES ESSAIS DE SERVICE (cantine, transport…) — lister d'abord
// ════════════════════════════════════════════════════════════════════════════
//
// Demandé par le responsable le 2026-11-01 : « efface les tests que j'ai faits
// pour cantine et transport », sur la base EN LIGNE, et en suppression réelle
// (pas en contre-passation).
//
// ── POURQUOI UN SCRIPT, ET PAS UN DELETE À LA MAIN ─────────────────────────
//
// Parce que l'ordre compte, et qu'un DELETE dans le mauvais ordre laisse de
// l'argent orphelin dans la base — invisible à l'écran, mais toujours compté
// dans la balance. Les clés étrangères, lues dans le schéma :
//
//   fee_payments.reversal_of        → fee_payments      ON DELETE RESTRICT
//   fee_payments.student_fee_item_id → student_fee_items ON DELETE SET NULL
//   fee_payments.fee_schedule_item_id → fee_schedule_items ON DELETE SET NULL
//   fee_schedule_items.student_fee_item_id → student_fee_items ON DELETE CASCADE
//   student_fee_items.fee_catalog_id → fee_catalog       ON DELETE SET NULL
//
// Deux pièges en découlent :
//
//  1. Supprimer le SERVICE en premier ne supprime rien d'autre : les
//     abonnements survivent avec `fee_catalog_id` à NULL. Ils disparaissent de
//     l'écran Cantine (qui filtre sur le service) tout en restant dans la base.
//     L'école croit avoir nettoyé, et traîne des abonnements fantômes.
//
//  2. Supprimer une ÉCHÉANCE ne supprime pas les versements : ils passent à
//     `fee_schedule_item_id` NULL. L'argent reste, rattaché à plus rien.
//
//     D'où l'ordre : VERSEMENTS d'abord, abonnements ensuite (les échéances
//     suivent en cascade), service en dernier.
//
//  3. Une CONTRE-PASSATION bloque son originale (`RESTRICT`). Les lignes
//     négatives partent donc avant celles qu'elles annulent.
//
// ── CE QUE CE SCRIPT NE FAIT PAS ───────────────────────────────────────────
//
// Il ne devine RIEN. Un essai et un vrai encaissement se ressemblent trait pour
// trait dans la base : seul le responsable sait lesquels sont des essais. Le
// script ne supprime donc que les services dont l'identifiant lui est donné
// explicitement, et il refuse de tourner sans. `--liste` montre d'abord, avec
// les montants, pour que ce choix se fasse sur des chiffres.
//
// Il ne touche à aucune file de synchronisation (règle du dépôt).
//
// ── LE TROU DANS LA SÉQUENCE DES REÇUS ─────────────────────────────────────
//
// `receipt_no` est séquentiel par (école, année), et c'est un dispositif
// ANTI-FRAUDE : le schéma dit qu'un numéro manquant signale « une somme
// encaissée puis effacée du système ». Supprimer un versement numéroté laisse
// donc un trou définitif, qui ressemblera à une recette escamotée.
//
// Le script le dit avant d'agir, et énumère les numéros qui vont manquer, pour
// que la trace soit portée au registre des incidents plutôt que découverte au
// contrôle six mois plus tard.
//
// ── USAGE ──────────────────────────────────────────────────────────────────
//
//   node scripts/nettoyer-essais-services.mjs --liste
//   node scripts/nettoyer-essais-services.mjs --liste --annee 2026-2027
//   node scripts/nettoyer-essais-services.mjs --services <id>,<id> --vider \
//        --sauvegarde /chemin/hors/depot/avant.json --confirmer
//
// `--vider` retire abonnements, échéances et versements, et CONSERVE le
// service. `--sauvegarde` est obligatoire dès qu'on confirme.
//
// Sans `--confirmer`, même avec `--services`, le script ne fait que décrire ce
// qu'il supprimerait. Rien ne part sur une faute de frappe.
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const a = (nom, def = null) => {
  const i = args.indexOf(nom);
  return i >= 0 ? (args[i + 1] ?? true) : def;
};
const LISTE = args.includes('--liste');
const CONFIRMER = args.includes('--confirmer');
const ANNEE = a('--annee');
const SERVICES = String(a('--services') || '').split(',').map((s) => s.trim()).filter(Boolean);
// ── VIDER, PLUTÔT QUE SUPPRIMER ──────────────────────────────────────────
//
// Un service d'essai n'est pas toujours un service de trop. THE GENIUS se
// sert vraiment de sa cantine et de son transport : ce qu'il faut retirer,
// ce sont les ABONNEMENTS et les VERSEMENTS d'essai, pas la configuration du
// service — son nom, son tarif, sa périodicité, ses mois. La supprimer
// obligerait à tout resaisir, et changerait son identifiant : les écrans qui
// le visent, et le registre qu'on construit dessus, pointeraient dans le vide.
const VIDER = args.includes('--vider');
// Où écrire la sauvegarde. Obligatoire : voir `sauvegarder()`.
const SAUVEGARDE = a('--sauvegarde');

// Les catégories que l'écran Cantine gère. Source unique côté moteur ; répétée
// ici parce qu'un script d'opération ne doit pas importer la couche React.
const CATEGORIES = ['cantine', 'transport', 'tenue', 'internat', 'soutien', 'activites'];

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!URL || !KEY) {
  console.error('Il manque VITE_SUPABASE_URL et une clé dans l’environnement.');
  console.error('La clé n’est JAMAIS passée en argument : elle resterait dans l’historique du shell.');
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { persistSession: false } });

const fr = (n) => Math.round(Number(n) || 0).toLocaleString('fr-FR');
const ligne = (c = '─') => console.log(c.repeat(74));

async function tout(table, select, filtre = (q) => q) {
  // Pagination explicite : PostgREST plafonne à 1000 lignes, et un plafond
  // silencieux sur une suppression laisserait la moitié des lignes en place.
  const out = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await filtre(db.from(table).select(select)).range(de, de + 999);
    if (error) throw new Error(`${table} : ${error.message}`);
    out.push(...(data || []));
    if ((data || []).length < 1000) return out;
  }
}

/** Ce qui pend à un ensemble de services : abonnements, échéances, versements. */
async function dependances(serviceIds) {
  if (!serviceIds.length) return { abos: [], eches: [], vers: [] };
  const abos = await tout('student_fee_items', 'id,student_id,name,amount,academic_year',
    (q) => q.in('fee_catalog_id', serviceIds));
  const aboIds = abos.map((x) => x.id);
  const eches = aboIds.length
    ? await tout('fee_schedule_items', 'id,period_key,amount_due,status',
      (q) => q.in('student_fee_item_id', aboIds))
    : [];
  const echeIds = eches.map((x) => x.id);

  // LES DEUX RATTACHEMENTS. Un versement peut viser une période précise
  // (`fee_schedule_item_id`) OU le service sans précision de mois
  // (`student_fee_item_id`) — la migration `supabase_fee_schedule.sql` le dit
  // explicitement. N'en interroger qu'un laisserait de l'argent derrière.
  const parEche = echeIds.length
    ? await tout('fee_payments', '*',
      (q) => q.in('fee_schedule_item_id', echeIds))
    : [];
  const parAbo = aboIds.length
    ? await tout('fee_payments', '*',
      (q) => q.in('student_fee_item_id', aboIds))
    : [];
  const vus = new Set();
  const vers = [...parEche, ...parAbo].filter((p) => (vus.has(p.id) ? false : vus.add(p.id)));
  return { abos, eches, vers };
}

// ── VOIR, OU NE PAS VOIR : LA DISTINCTION QUI MANQUAIT ─────────────────────
//
// Défaut trouvé le 2026-11-01, en situation : lancé avec la clé ANONYME, le
// script affichait « Aucun service dans ces catégories » — rassurant, et faux.
// La RLS de ces tables exige `school_id IN (SELECT ... WHERE user_id =
// auth.uid())` : sans utilisateur authentifié, `auth.uid()` est NULL, aucune
// ligne ne passe, et PostgREST répond une liste vide sans la moindre erreur.
//
// Sur un outil de suppression, confondre « rien à supprimer » avec « je ne vois
// rien » est le pire des bugs : on en conclut que le nettoyage est déjà fait.
// On sonde donc une table qui a forcément des lignes. Si elle est vide aussi,
// ce n’est pas la base qui est vide, c’est nous qui sommes aveugles — et on le
// dit, au lieu de rendre un rapport.
// Le refus de parler sans voir, reconnaissable en haut du fichier.
class Aveugle extends Error {}

async function voitQuelqueChose() {
  const { count, error } = await db.from('schools').select('*', { count: 'exact', head: true });
  if (error) return { voit: false, pourquoi: `lecture refusée : ${error.message}` };
  if (!count) return { voit: false, pourquoi: 'aucune école visible' };
  return { voit: true, ecoles: count };
}

async function exigeDeVoir() {
  const v = await voitQuelqueChose();
  if (v.voit) return v;
  const { data } = await db.auth.getUser().catch(() => ({ data: null }));
  ligne('═');
  console.error('AVEUGLE — ce script ne voit AUCUNE donnée, et ne dira donc rien.');
  ligne('═');
  console.error(`  ${v.pourquoi}`);
  console.error(`  utilisateur authentifié : ${data?.user ? data.user.id : 'AUCUN (clé anonyme)'}`);
  console.error('');
  console.error('  La RLS de fee_catalog, student_fee_items et fee_payments filtre sur');
  console.error('  `auth.uid()`. Sans session, aucune ligne ne passe, et PostgREST répond');
  console.error('  une liste VIDE sans erreur : « aucun service » voudrait dire « je ne');
  console.error('  vois rien », ce qui n’est pas la même chose.');
  console.error('');
  console.error('  Il faut la clé SERVICE ROLE, seule à passer outre la RLS :');
  console.error('    Supabase → Project Settings → API → service_role (secret)');
  console.error('    export SUPABASE_SERVICE_ROLE_KEY=...   puis relancer');
  console.error('');
  console.error('  Elle n’est JAMAIS passée en argument ni écrite dans un fichier du dépôt.');
  // Pas de `process.exit` ici : il coupe pendant que le client Supabase a
  // encore des handles ouverts, libuv lève une assertion, et le code de
  // sortie devient 127 — un appelant y lirait « commande introuvable ».
  throw new Aveugle();
}
async function lister() {
  const vu = await exigeDeVoir();
  // Le NOM de l'école, pas seulement son identifiant : la base est
  // multi-écoles, et un id de service ne dit pas à qui il appartient.
  // Supprimer le service d'une AUTRE école en croyant nettoyer ses essais
  // était à un copier-coller de distance.
  const ecoles = {};
  for (const e of await tout('schools', 'id,name')) ecoles[e.id] = e.name;
  let f = (q) => q.in('category', CATEGORIES);
  if (ANNEE) { const g = f; f = (q) => g(q).eq('academic_year', ANNEE); }
  const services = await tout('fee_catalog', 'id,name,category,academic_year,amount,school_id', f);

  if (!services.length) {
    // On VOIT la base (`exigeDeVoir` a passé) : ce vide-ci est un vrai vide.
    console.log(`Aucun service dans ces catégories (${vu.ecoles} école(s) visible(s)` +
      `${ANNEE ? `, année ${ANNEE}` : ''}).`);
    return;
  }
  ligne('═');
  console.log('SERVICES EN LIGNE' + (ANNEE ? ` — année ${ANNEE}` : ''));
  ligne('═');
  for (const s of services) {
    const { abos, eches, vers } = await dependances([s.id]);
    const somme = vers.reduce((t, p) => t + (Number(p.amount) || 0), 0);
    const numerotes = vers.filter((p) => p.receipt_no != null);
    console.log(`\n  ${s.name}  [${s.category} · ${s.academic_year}]`);
    console.log(`  école : ${ecoles[s.school_id] || '(inconnue)'}`);
    console.log(`  id = ${s.id}`);
    console.log(`     abonnements ${String(abos.length).padStart(4)}`
      + `   échéances ${String(eches.length).padStart(4)}`
      + `   versements ${String(vers.length).padStart(4)}`
      + `   = ${fr(somme)}`);
    if (numerotes.length) {
      console.log(`     ⚠ ${numerotes.length} versement(s) NUMÉROTÉ(S) — reçus n° `
        + numerotes.map((p) => p.receipt_no).sort((x, y) => x - y).join(', '));
      console.log('       les supprimer laissera un trou définitif dans la séquence.');
    }
  }
  ligne();
  console.log('Pour supprimer, reprenez les id voulus :');
  console.log('  node scripts/nettoyer-essais-services.mjs --services <id>,<id> --confirmer');
  console.log('Le script ne devine pas quels services sont des essais — vous seul le savez.');
}

// ── LE RETOUR ARRIÈRE, ÉCRIT AVANT LE PREMIER DELETE ───────────────────────
//
// Une suppression en production sans retour arrière n'est pas une opération,
// c'est un pari. On écrit donc TOUTES les lignes visées — colonnes complètes,
// `receipt_no` compris — dans un fichier, et on ne supprime qu'ensuite.
//
// Le fichier vit HORS du dépôt, parce qu'il contient des montants et des noms
// de payeurs : il n'a rien à faire dans un commit.
//
// Ce que la sauvegarde permet, et ce qu'elle ne permet pas : réinsérer les
// lignes est possible (les identifiants et les numéros de reçu sont
// conservés), mais la RLS interdit l'INSERT de `fee_payments` à tout autre
// rôle que la caisse — une restauration demandera la même clé service-role.
// ── LA TRACE QUE LE SYSTÈME PRÉVOIT DÉJÀ ───────────────────────────────────
//
// `deleted_fee_payments` existe pour exactement ça : le schéma dit qu'« elle
// est consultable (elle sert à justifier un exercice) ». Elle garde la ligne
// d'origine — montant, date, numéro de reçu, caissier — avec `deleted_at` et
// `deleted_by_name`.
//
// Un fichier JSON sur le disque de l'opérateur ne vaut pas cette trace : il se
// perd, il ne suit pas la base, et personne ne pense à le demander. Six mois
// plus tard, c'est dans cette table qu'un contrôleur cherchera pourquoi une
// recette n'est plus là. On y écrit DONC avant de supprimer, et un échec
// d'écriture annule la suppression : pas de disparition sans justification.
async function tracer(versements, qui) {
  if (!versements.length) return { ecrites: 0 };
  const maintenant = new Date().toISOString();
  const lignes = versements.map((v) => ({
    id: v.id, school_id: v.school_id, student_id: v.student_id,
    academic_year: v.academic_year ?? null, amount: v.amount ?? null,
    date: v.date ?? null, note: v.note ?? null, receipt_no: v.receipt_no ?? null,
    reversal_of: v.reversal_of ?? null,
    recorded_by: v.recorded_by ?? null, recorded_by_name: v.recorded_by_name ?? null,
    created_at: v.created_at ?? null,
    deleted_at: maintenant, deleted_by: null, deleted_by_name: qui,
  }));
  for (let i = 0; i < lignes.length; i += 200) {
    // `upsert` et non `insert` : relancer le script après un échec partiel ne
    // doit pas buter sur une trace déjà écrite.
    const { error } = await db.from('deleted_fee_payments')
      .upsert(lignes.slice(i, i + 200), { onConflict: 'id' });
    if (error) throw new Error(`trace deleted_fee_payments : ${error.message}`);
  }
  return { ecrites: lignes.length };
}
async function sauvegarder(services, dep, chemin) {
  const { writeFileSync: ecrire } = await import('node:fs');
  const paquet = {
    quand: new Date().toISOString(),
    operation: VIDER ? 'vider' : 'supprimer',
    services,
    abonnements: dep.abonnements,
    echeances: dep.echeances,
    versements: dep.versements,
    recus: dep.versements.filter((v) => v.receipt_no != null).map((v) => v.receipt_no).sort((x, y) => x - y),
  };
  ecrire(chemin, JSON.stringify(paquet, null, 1), 'utf8');
  return paquet;
}

async function supprimer() {
  await exigeDeVoir();
  const services = await tout('fee_catalog', 'id,name,category,academic_year,school_id',
    (q) => q.in('id', SERVICES));
  const absents = SERVICES.filter((id) => !services.some((s) => s.id === id));
  if (absents.length) {
    console.error('Ces identifiants n’existent pas : ' + absents.join(', '));
    console.error('Rien n’a été supprimé — un id de travers viserait un autre service.');
    process.exitCode = 1;
    return;
  }
  const horsCategorie = services.filter((s) => !CATEGORIES.includes(s.category));
  if (horsCategorie.length) {
    // Garde-fou : ce script est écrit pour les SERVICES. Pointé sur des frais de
    // scolarité, il effacerait la scolarité d'une école entière.
    console.error('Ces services ne sont pas dans les catégories gérées par l’écran Cantine :');
    horsCategorie.forEach((s) => console.error(`  ${s.name} [${s.category}]`));
    console.error('Refus. Ce script ne touche pas aux frais de scolarité.');
    process.exitCode = 1;
    return;
  }

  // Le NOM de l'école, pas seulement son identifiant : la base est
  // multi-écoles, et un id de service ne dit pas à qui il appartient.
  // Supprimer le service d'une AUTRE école en croyant nettoyer ses essais
  // était à un copier-coller de distance.
  const ecoles = {};
  for (const e of await tout('schools', 'id,name')) ecoles[e.id] = e.name;
  const ecolesVisees = [...new Set(services.map((x) => x.school_id))];
  if (ecolesVisees.length > 1) {
    // Deux écoles dans un même lot : personne ne nettoie volontairement les
    // essais de deux écoles d'un seul coup. C'est un copier-coller de travers,
    // et le refus coûte moins cher que la restauration.
    console.error('Ces services appartiennent à PLUSIEURS écoles :');
    ecolesVisees.forEach((id) => console.error(`  ${ecoles[id] || id}`));
    console.error('Refus. Reprenez école par école.');
    process.exitCode = 1;
    return;
  }
  console.log(`École visée : ${ecoles[ecolesVisees[0]] || ecolesVisees[0]}`);

  const ids = services.map((s) => s.id);
  const { abos, eches, vers } = await dependances(ids);
  const somme = vers.reduce((t, p) => t + (Number(p.amount) || 0), 0);
  const numerotes = vers.filter((p) => p.receipt_no != null);

  ligne('═');
  console.log((VIDER ? 'CE QUI SERA VIDÉ (le service est conservé)' : 'CE QUI SERA SUPPRIMÉ')
    + (CONFIRMER ? '' : '  (simulation — rien ne partira)'));
  ligne('═');
  services.forEach((s) => console.log(`  service     « ${s.name} » [${s.category} · ${s.academic_year}]`));
  console.log(`  abonnements ${abos.length}`);
  console.log(`  échéances   ${eches.length}   (supprimées en cascade avec les abonnements)`);
  console.log(`  versements  ${vers.length}   = ${fr(somme)}`);
  if (numerotes.length) {
    console.log(`\n  ⚠ TROU DANS LA SÉQUENCE DES REÇUS : n° `
      + numerotes.map((p) => p.receipt_no).sort((x, y) => x - y).join(', '));
    console.log('    `receipt_no` est un dispositif anti-fraude : un numéro manquant');
    console.log('    signale « une somme encaissée puis effacée ». Portez-le au registre.');
  }
  if (!CONFIRMER) {
    ligne();
    console.log('Simulation. Ajoutez --confirmer pour '
      + (VIDER ? 'vider réellement.' : 'supprimer réellement.'));
    console.log('Le service lui-même ' + (VIDER ? 'SERA CONSERVÉ' : 'sera supprimé') + '.');
    return;
  }

  // PAS DE SUPPRESSION SANS RETOUR ARRIÈRE. Le refus est volontaire : sur de
  // l'argent en production, « j'ai oublié la sauvegarde » n'est pas rattrapable.
  if (!SAUVEGARDE) {
    console.error('\nRefus : --sauvegarde <fichier.json> est obligatoire.');
    console.error('Chaque ligne est écrite avant d’être supprimée, numéros de reçu compris.');
    console.error('Choisissez un chemin HORS du dépôt : le fichier porte des montants.');
    process.exitCode = 1;
    return;
  }
  // `dependances()` rend des noms courts (`abos`, `eches`, `vers`) ; la
  // sauvegarde et la trace les nomment en entier, pour qu'un fichier relu dans
  // six mois se comprenne sans ouvrir ce script.
  const dep = { abonnements: abos, echeances: eches, versements: vers };
  const sauve = await sauvegarder(services, dep, SAUVEGARDE);
  const qui = `nettoyage d'essais — ${(VIDER ? 'vidage' : 'suppression')} des services `
    + services.map((x) => x.name).join(', ');
  const tr = await tracer(dep.versements, qui);
  console.log(`\nTrace écrite dans deleted_fee_payments : ${tr.ecrites} ligne(s)`);
  console.log(`Sauvegarde écrite : ${SAUVEGARDE}`);
  console.log(`  ${sauve.abonnements.length} abonnement(s), ${sauve.echeances.length} échéance(s),`
    + ` ${sauve.versements.length} versement(s)`
    + (sauve.recus.length ? `, reçus n° ${sauve.recus.join(', ')}` : ''));

  // ── L'ORDRE, ET SEULEMENT CET ORDRE ──────────────────────────────────────
  //
  // 1. Les contre-passations : elles pointent leur originale en RESTRICT, et
  //    bloqueraient sa suppression.
  const annulations = vers.filter((p) => p.reversal_of);
  const originales = vers.filter((p) => !p.reversal_of);
  const lot = async (table, liste, quoi) => {
    let n = 0;
    for (let i = 0; i < liste.length; i += 200) {
      const paquet = liste.slice(i, i + 200).map((x) => x.id);
      const { error } = await db.from(table).delete().in('id', paquet);
      if (error) throw new Error(`${quoi} : ${error.message}`);
      n += paquet.length;
    }
    console.log(`  ${quoi} supprimé(s) : ${n}`);
    return n;
  };

  console.log('');
  await lot('fee_payments', annulations, 'contre-passations');
  await lot('fee_payments', originales, 'versements');
  // 2. Les abonnements. Les échéances partent en cascade — on le vérifie après.
  await lot('student_fee_items', abos, 'abonnements');
  // 3. Le service en dernier : avant les abonnements, il les aurait seulement
  //    orphelinés (SET NULL), pas supprimés. En mode --vider, on l'épargne :
  //    sa configuration reste, son identifiant reste, les écrans qui le visent
  //    continuent de fonctionner.
  if (VIDER) console.log('  services CONSERVÉS (mode --vider) : '
    + services.map((x) => x.name).join(', '));
  else await lot('fee_catalog', services, 'services');

  // ── LA VÉRIFICATION, parce qu'une suppression annoncée n'est pas une
  //    suppression prouvée ─────────────────────────────────────────────────
  const restantes = await dependances(ids);
  const echesRestantes = eches.length
    ? await tout('fee_schedule_items', 'id', (q) => q.in('id', eches.map((x) => x.id)))
    : [];
  ligne();
  const propre = !restantes.abos.length && !restantes.vers.length && !echesRestantes.length;
  console.log(propre
    ? '✔ Vérifié : plus aucun abonnement, échéance ni versement rattaché à ces services.'
    : `✗ IL RESTE : abonnements ${restantes.abos.length}, échéances ${echesRestantes.length},`
      + ` versements ${restantes.vers.length} — ne pas déclarer le nettoyage terminé.`);
  // Une suppression incomplete doit se VOIR dans le code de sortie : un script
  // appelant ne lira pas le texte, il lira le code.
  if (!propre) process.exitCode = 1;
}

try {
  if (LISTE || (!SERVICES.length)) {
    if (!LISTE) {
      console.log('Rien à faire : ni --liste, ni --services.\n');
      console.log('  node scripts/nettoyer-essais-services.mjs --liste');
      process.exit(1);
    }
    await lister();
  } else {
    await supprimer();
  }
} catch (e) {
  // L'aveuglement s'est déjà expliqué en détail : le recouvrir d'un « ÉCHEC »
  // ferait croire à une panne, alors que c'est un refus de parler sans voir.
  if (e instanceof Aveugle) {
    process.exitCode = 2;
  } else {
    console.error('\nÉCHEC : ' + e.message);
    console.error('Rien n’est déclaré supprimé. Relancez --liste pour voir l’état réel.');
    process.exitCode = 1;
  }
}
