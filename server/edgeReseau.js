// server/edgeReseau.js
// Appels réseau vers le Cloud BORNÉS DANS LE TEMPS.
//
// Avant : aucun `fetch` du serveur LAN ne portait de délai. Une connexion à moitié
// coupée (le cas classique d'une école : le routeur répond, le lien montant ne
// passe plus) laissait l'appel suspendu jusqu'aux délais par défaut de Node, soit
// plusieurs minutes, pendant lesquelles le cycle de synchro restait « en cours ».
//
// Désormais chaque appel est abandonné au bout de DELAI_EDGE_MS. L'erreur porte
// `reseau = true` : c'est le signal qui dit à la file de poussée que le FAUTIF
// n'est pas la ligne mais le lien. Une ligne ne part jamais en quarantaine parce
// qu'Internet a coupé.
//
// Reprise propre : un appel abandonné n'a rien écrit localement (le tirage applique
// ses lignes ET avance ses curseurs dans UNE transaction, après la réponse), et la
// poussée est idempotente (upsert à clé `id`, départage déterministe). Rejouer est
// donc toujours sûr.

export const DELAI_EDGE_MS = Number(process.env.NOTESCAM_EDGE_TIMEOUT_MS || 30_000);
// Téléversement d'un fichier (jusqu'à 10 Mo) : plus long qu'un appel de données.
export const DELAI_FICHIER_MS = Number(process.env.NOTESCAM_FILE_TIMEOUT_MS || 120_000);

function etiqueter(e, nom, ms) {
  const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
  const err = new Error(timeout
    ? `${nom}: timeout après ${Math.round(ms / 1000)} s (réseau)`
    : `${nom}: ${e?.message || e}`);
  err.reseau = true;       // le lien est en cause, pas la donnée
  err.timeout = timeout;
  err.cause = e;
  return err;
}

// fetch borné, réponse brute (téléversement de fichier).
export async function fetchBorne(url, init = {}, nom = 'appel', ms = DELAI_EDGE_MS) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  } catch (e) { throw etiqueter(e, nom, ms); }
}

// fetch borné + corps JSON lu SOUS LE MÊME DÉLAI. Le signal couvre aussi la lecture
// du corps : un serveur qui envoie les en-têtes puis se tait ne suspend plus rien.
// Un corps non-JSON rend `j = null` (l'appelant tranche), comme avant.
export async function fetchJsonBorne(url, init = {}, nom = 'appel', ms = DELAI_EDGE_MS) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
    const j = await res.json().catch((e) => {
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw e;
      return null;
    });
    return { res, j };
  } catch (e) { throw etiqueter(e, nom, ms); }
}
