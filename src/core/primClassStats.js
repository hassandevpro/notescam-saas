// STATISTIQUES DE LA CLASSE SUR LE BULLETIN DU PRIMAIRE — fonction PURE.
//
// Le bulletin du primaire doit situer l'élève dans sa classe : la meilleure moyenne, la plus
// faible, la moyenne générale de la classe, et COMBIEN d'élèves ont réussi ou échoué. Il ne
// donnait avant que des moyennes (et seulement en mode « carnet ») et un pourcentage : aucun
// nombre d'élèves.
//
// Une moyenne par élève, sur la période du bulletin. Un élève sans moyenne (aucune note) n'est
// ni réussi ni échoué : il n'est pas compté. Réussi = moyenne >= `seuil` (la moitié du barème).
export function computePrimClassStats(moyennes, seuil) {
  const avgs = (moyennes || []).filter((v) => v !== null && v !== undefined && Number.isFinite(Number(v))).map(Number);
  if (!avgs.length) return null;
  const somme = avgs.reduce((a, b) => a + b, 0);
  const reussis = avgs.filter((a) => a >= seuil).length;
  return {
    min: Math.min(...avgs),
    max: Math.max(...avgs),
    avg: Math.round((somme / avgs.length) * 100) / 100,
    count: avgs.length,
    reussis,
    echoues: avgs.length - reussis,
    rate: Math.round((reussis / avgs.length) * 100),
  };
}
