// Copie presse-papiers robuste, INDÉPENDANTE du contexte sécurisé.
//
// navigator.clipboard n'existe QUE dans un « secure context » (https ou
// localhost). En édition LAN, les appareils clients ouvrent l'app via
// http://<IP-du-PC>:8080 (non sécurisé) → navigator.clipboard vaut `undefined`
// et les boutons « copier » (lien parent, code école, ID machine) levaient une
// exception. On bascule alors sur l'ancienne méthode execCommand('copy') via un
// <textarea> temporaire, qui fonctionne hors contexte sécurisé.
//
// Renvoie une Promise<boolean> : true si la copie a réussi.
export async function copyText(text) {
  const value = String(text ?? '');

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch { /* repli ci-dessous */ }
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
