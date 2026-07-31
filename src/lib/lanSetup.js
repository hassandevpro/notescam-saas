// État de provisionnement du serveur LAN — connu AVANT toute authentification.
//
// En LAN, un serveur héberge exactement UNE école. Une fois cette école créée
// (ou migrée), la page « Créer un établissement » (register) n'a plus de sens :
// les postes se contentent de se connecter. On expose donc un petit hook qui
// interroge /api/license (route publique renvoyant `school`) pour savoir si le
// serveur local est déjà provisionné.
//
// En cloud, la notion ne s'applique pas → retourne toujours false (jamais null),
// pour ne rien changer au flux d'inscription existant.

import { useState, useEffect } from 'react';
import { IS_LAN } from './edition';

// @returns {null|boolean}
//   null  : inconnu (chargement, LAN uniquement)
//   true  : le serveur LAN héberge déjà une école
//   false : aucune école (install neuve) OU édition cloud
export function useLanHasSchool() {
  const [hasSchool, setHasSchool] = useState(IS_LAN ? null : false);
  useEffect(() => {
    if (!IS_LAN) return;
    let alive = true;
    fetch('/api/license')
      .then((r) => r.json())
      .then(({ data }) => { if (alive) setHasSchool(!!data?.school); })
      .catch(() => { if (alive) setHasSchool(false); }); // serveur muet → ne bloque pas l'inscription
    return () => { alive = false; };
  }, []);
  return hasSchool;
}
