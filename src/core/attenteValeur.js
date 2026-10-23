// ATTENDRE UNE VALEUR DU MAGASIN, PLUTÔT QUE D'ABANDONNER LA DEMANDE.
//
// RELEVÉ LE 2026-10-23, par le responsable : « quand on essaie d'entrer les
// notes du primaire, le référentiel se charge sans cesse » — l'écran reste sur
// « Chargement du référentiel primaire APC… », indéfiniment.
//
// LA CAUSE EST DANS L'ORDRE DES EFFETS DE REACT. L'écran de saisie demande son
// référentiel à son montage :
//
//     useEffect(() => { loadPrim(); }, [loadPrim]);
//
// et `schoolId` n'est posé dans le magasin que par l'effet de App, qui appelle
// `init(school.id, …)`. React exécute les effets des ENFANTS AVANT ceux de
// leurs parents : sur une arrivée DIRECTE sur /app/grades (lien, favori, F5,
// Ctrl+Shift+R), la demande partait donc alors que `schoolId` valait encore
// null. Les trois chargeurs par école (apc, prim, mat) repartaient sans rien
// faire, et RIEN ne les rejouait : l'effet ne dépend que de la fonction du
// magasin, qui ne change jamais. L'écran attendait un chargement que personne
// n'avait entrepris.
//
// POURQUOI CELA A SURVÉCU SI LONGTEMPS. En venant du tableau de bord, le
// référentiel est DÉJÀ en mémoire (le tableau de bord, lui, est monté après
// `init`) : l'écran s'ouvre normalement. Le défaut ne se voit que sur un accès
// direct — exactement le geste de celui qui VÉRIFIE une correction.
//
// CE QUE FAIT CE MODULE. Il ne corrige pas l'ordre des effets — on ne le
// maîtrise pas — il rend la demande PATIENTE : tant que la valeur n'est pas
// là, on l'attend ; dès qu'elle arrive, le chargement part. Et au bout du
// délai, on rend `null` : un écran qui n'a pas d'école (session expirée,
// espace parent) ne doit pas attendre pour toujours.
//
// Module PUR : aucune dépendance au magasin ni à React, pour que la règle soit
// vérifiable seule (cf. _attenteValeur.test.mjs). `souscrire` reçoit la
// fonction d'abonnement du magasin (zustand rend la fonction de
// désabonnement), `lire` relit la valeur.

const DELAI_MAX_MS = 15000;

export function attendreValeur({
  lire,
  souscrire,
  delaiMax = DELAI_MAX_MS,
  planifier = setTimeout,
  annuler = clearTimeout,
}) {
  const deja = lire();
  if (deja) return Promise.resolve(deja);

  return new Promise((resolve) => {
    let fini = false;
    let desabonner = null;
    let minuteur = null;

    const terminer = (valeur) => {
      if (fini) return;
      fini = true;
      if (minuteur !== null) annuler(minuteur);
      // Un abonnement qui survivrait garderait le magasin en vie et rappellerait
      // à chaque `set` : on se désabonne, même si c'est le délai qui a tranché.
      if (typeof desabonner === 'function') { try { desabonner(); } catch { /* déjà parti */ } }
      resolve(valeur || null);
    };

    minuteur = planifier(() => terminer(null), delaiMax);
    desabonner = souscrire(() => {
      const v = lire();
      if (v) terminer(v);
    });

    // LA VALEUR A PU ARRIVER ENTRE LA PREMIÈRE LECTURE ET L'ABONNEMENT. Sans
    // cette seconde lecture, on attendrait le PROCHAIN changement du magasin —
    // qui peut ne jamais venir — alors que l'école est déjà connue.
    const entretemps = lire();
    if (entretemps) terminer(entretemps);
  });
}
