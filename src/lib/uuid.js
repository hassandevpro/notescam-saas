// UUID v4 robuste, INDÉPENDANT du contexte sécurisé.
//
// crypto.randomUUID() n'existe QUE dans un « secure context » (https ou
// localhost). En édition LAN, les appareils clients ouvrent l'app via
// http://<IP-du-PC>:8080 — contexte NON sécurisé — où `crypto.randomUUID` vaut
// `undefined`. L'appeler levait une exception qui bloquait silencieusement les
// enregistrements (bouton « Enregistrement… » figé indéfiniment, alors que le
// même geste marchait sur le PC serveur via localhost).
//
// crypto.getRandomValues, lui, est disponible AUSSI hors contexte sécurisé : on
// l'utilise pour fabriquer un UUID v4 valide. Repli Math.random en dernier
// recours (navigateurs très anciens) — non cryptographique mais syntaxiquement
// correct, suffisant pour un identifiant local.
export function uuid() {
  const c = typeof crypto !== 'undefined' ? crypto : null;

  if (c && typeof c.randomUUID === 'function') {
    try { return c.randomUUID(); } catch { /* contexte non sécurisé : on continue */ }
  }

  if (c && typeof c.getRandomValues === 'function') {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
    const h = [];
    for (let i = 0; i < 16; i++) h.push(b[i].toString(16).padStart(2, '0'));
    return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
