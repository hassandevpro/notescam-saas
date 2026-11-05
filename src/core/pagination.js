// LE PLAFOND DE 1000 LIGNES DE PostgREST, ET CE QU IL COUTE.
//
// Mesure du 2026-11-05 sur l ecole BRIGHT CONTINENT, pendant qu elle repetait « les
// notes ne persistent pas » : 1 873 lignes dans `prim_notes`, 1 000 recues par
// l application. 873 notes INVISIBLES. Aucune erreur, aucun refus — le serveur repond
// 200 et tronque. Une note saisie partait bien (POST 200, la ligne est en base), mais
// au rechargement suivant elle tombait hors des mille premieres lignes et l ecran la
// montrait vide. D ou le motif qui rendait le defaut incomprehensible : certaines
// cellules tenaient, d autres non, sans regle apparente — c est l ordre physique des
// lignes qui decidait, pas la saisie.
//
// Rien n avait jamais ete perdu. Tout etait en base, et invisible.
//
// `fetchAllRows` existait deja ici pour exactement ce piege, mais il etait PRIVE a
// schoolService : les notes du primaire, de l APC et de la maternelle ne l ont jamais
// traverse. Il vit desormais dans son propre module, pour qu une table qui grossit ne
// puisse plus etre oubliee.

// Ce module est PUR : aucune dependance, donc il se tient sous Node comme dans le
// navigateur. La couche qui connait Supabase vit dans lib/pagination.js.

// PostgREST plafonne CHAQUE select à 1000 lignes par défaut. Les tables qui
// dépassent ce seuil (grades, fee_payments, students d'un gros complexe…) étaient
// SILENCIEUSEMENT tronquées : seules les ~1000 premières notes arrivaient au Cloud,
// donc la plupart des classes affichaient 0 note alors que le build LAN (localClient,
// sans plafond) montrait tout. `fetchAllRows` pagine le jeu complet via `.range()`.
// En LAN, localClient n'a NI `.range()` NI plafond → un seul fetch renvoie tout.
// `makeQuery` doit renvoyer un builder NEUF à chaque appel (le `.range()` d'une page
// ne doit pas s'accumuler) et inclure un ordre déterministe (clé unique) pour que la
// pagination ne saute ni ne duplique de ligne aux frontières de page.
const PAGE_SIZE = 1000;

// Pages demandées SIMULTANÉMENT. La pagination était séquentielle : chaque page
// payait un aller-retour complet, et la table `grades` en compte 144 pour un
// établissement de 1 600 élèves — soit ~35 s sur une 4G correcte, rien que pour
// les notes. Les pages étant indépendantes (ordre déterministe sur une clé
// unique), rien n'empêche de les demander de front. Six est un compromis :
// assez pour masquer la latence, assez peu pour ne pas saturer une connexion
// d'école ni déclencher les limites de débit de PostgREST.
const PAGE_CONCURRENCY = 6;

export async function fetchAllRows(makeQuery, label) {
  if (typeof makeQuery().range !== 'function') {
    // LAN (localClient) : aucun plafond, pas de pagination.
    const { data, error } = await makeQuery();
    if (error) { console.error(label, error); return null; }
    return data;
  }

  const rows = [];
  let from = 0;
  for (;;) {
    // Une vague de pages contiguës, demandées ensemble.
    const wave = await Promise.all(
      Array.from({ length: PAGE_CONCURRENCY }, (_, i) => {
        const start = from + i * PAGE_SIZE;
        return makeQuery().range(start, start + PAGE_SIZE - 1);
      }),
    );

    let got = 0;
    for (const { data, error } of wave) {
      if (error) {
        console.error(label, error);
        // Première vague en échec : on ne sait rien, on rend `null` (l'appelant
        // conserve alors ses données locales). Sinon on rend ce qu'on a.
        return from === 0 && !rows.length ? null : rows;
      }
      if (data?.length) { rows.push(...data); got += data.length; }
    }

    // Vague incomplète = fin du jeu de données.
    if (got < PAGE_CONCURRENCY * PAGE_SIZE) break;
    from += PAGE_CONCURRENCY * PAGE_SIZE;
  }
  return rows;
}

// ── LIRE PAR IDENTIFIANTS, SANS SE FAIRE TRONQUER ────────────────────────────
//
// Un `.in('id', ids)` porte DEUX plafonds, pas un :
//   • le meme plafond de 1000 lignes — au-dela, les eleves en trop reviennent
//     manquants, en silence, avec un 200 ;
//   • la LONGUEUR DE L'URL : mille UUID font ~37 Ko de chaine de requete, que les
//     mandataires et serveurs refusent couramment (414), ou tronquent.
//
// On decoupe donc la liste en lots. 500 est un compromis : assez grand pour que les
// cas ordinaires tiennent en un appel, assez petit pour rester loin des deux plafonds.
export const TAILLE_LOT_IN = 500;

export async function fetchParLotsDIds(makeQuery, ids, label, { taille = TAILLE_LOT_IN } = {}) {
  const liste = [...new Set((ids || []).filter(Boolean))];
  if (!liste.length) return [];
  const lots = [];
  for (let i = 0; i < liste.length; i += taille) lots.push(liste.slice(i, i + taille));
  const vagues = await Promise.all(lots.map((lot) => makeQuery(lot)));
  const rows = [];
  for (const { data, error } of vagues) {
    if (error) { console.error(label, error); return null; }
    if (data?.length) rows.push(...data);
  }
  return rows;
}
