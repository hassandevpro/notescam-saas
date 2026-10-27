// Écran d'erreur — le dernier filet de l'application.
//
// POURQUOI CE FICHIER EXISTE. Le 2026-10-27, une école signale : « le logiciel ne
// s'ouvre pas après avoir entré les informations de connexion, la page reste
// blanche, sur n'importe quel poste ». La page de CONNEXION s'affichait : donc
// l'application démarrait, et c'est le premier écran APRÈS la connexion qui
// tombait. En React, une exception pendant le rendu démonte l'arbre ENTIER :
// sans garde-fou, il ne reste rien à l'écran — pas un mot, pas un bouton, pas un
// code. L'école ne pouvait rien nous dire, et nous ne pouvions rien deviner ; il
// a fallu demander une photo de la console du navigateur, que personne sur place
// n'a de raison de savoir ouvrir. une recherche d ErrorBoundary dans src/ ne rendait RIEN :
// l'application n'avait aucun filet, nulle part.
//
// CE COMPOSANT NE CORRIGE AUCUN DÉFAUT. Il fait quatre choses, et elles suffisent
// à ce que la panne suivante ne coûte pas une journée :
//   1. il dit qu'il y a une panne, en français, à la place du blanc ;
//   2. il affiche le message d'erreur ET la version que le serveur ANNONCE —
//      la question qu'on pose à chaque incident (I8 : sous Windows l'installeur
//      ne redémarre pas le service, les fichiers sont neufs et le serveur en
//      mémoire est l'ancien ; « installé » ne veut pas dire « appliqué ») ;
//   3. il rend ce bloc copiable en UN bouton, pour que l'école nous l'envoie par
//      message au lieu de le décrire ;
//   4. il laisse deux sorties, pour que le poste ne soit pas condamné.
//
// CE QU'IL NE FAIT PAS, VOLONTAIREMENT : il ne vide aucun stockage et ne
// déconnecte personne. La file de synchronisation hors ligne vit dans le
// navigateur du poste ; un écran d'erreur qui « nettoie » ferait perdre des
// saisies que l'école n'a pas encore vu partir. « Revenir à la connexion » ne
// fait que changer d'adresse.

import { Component } from 'react';
import { copyText } from '../lib/clipboard';

// Un morceau de l'application n'a pas pu être téléchargé (réseau coupé, serveur
// redémarré pendant la navigation, dist remplacé sous les pieds de l'onglet).
// Ce cas-là se répare par un rechargement, et mérite donc une autre phrase qu'un
// défaut de programmation : on ne demande pas à une école de nous signaler ce
// qu'elle peut résoudre elle-même en dix secondes.
function estMorceauManquant(err) {
  const m = String(err?.message || err || '');
  return /dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError/i.test(m);
}

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, pile: '', versionServeur: '', copie: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // La console reste la source la plus complète pour qui sait l'ouvrir.
    try { console.error('[NotesCam] écran d\'erreur', error, info?.componentStack); } catch { /* console indisponible */ }

    this.setState({ pile: String(info?.componentStack || '').trim() });

    // La version que le SERVEUR annonce, pas celle des fichiers sur le disque :
    // c'est l'écart entre les deux qui a déjà coûté un incident (I8). En édition
    // cloud la route n'existe pas — l'échec est silencieux et sans conséquence.
    fetch('/api/version')
      .then((r) => r.json())
      .then((j) => { const v = j?.data?.version; if (v) this.setState({ versionServeur: String(v) }); })
      .catch(() => { /* cloud, ou serveur muet : on affiche sans */ });
  }

  // Le bloc que l'école nous envoie. Tout y est, et rien d'autre : ni identifiant,
  // ni contenu d'écran — seulement de quoi retrouver la ligne fautive.
  detail() {
    const { error, pile, versionServeur } = this.state;
    return [
      'NotesCam — rapport de panne',
      'Date      : ' + new Date().toISOString(),
      'Adresse   : ' + (typeof location !== 'undefined' ? location.pathname : '?'),
      'Serveur   : ' + (versionServeur || 'inconnu'),
      'Erreur    : ' + String(error?.message || error || 'inconnue'),
      '',
      String(error?.stack || '').trim(),
      '',
      'Composants :',
      pile || '(non fourni)',
    ].join('\n');
  }

  copier = async () => {
    if (await copyText(this.detail())) {
      this.setState({ copie: true });
      setTimeout(() => this.setState({ copie: false }), 2000);
    }
  };

  render() {
    const { error, versionServeur, copie } = this.state;
    if (!error) return this.props.children;

    const morceau = estMorceauManquant(error);

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-5">
        <div className="bg-white rounded-2xl p-8 sm:p-10 max-w-2xl w-full shadow-xl">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">{morceau ? '🔌' : '⚠️'}</div>
            <h1 className="text-xl font-bold text-gray-900">
              {morceau ? 'Chargement interrompu' : "L'application s'est arrêtée"}
            </h1>
            <p className="text-gray-500 text-sm mt-2">
              {morceau ? (
                <>
                  Un morceau de l'application n'a pas pu être téléchargé. Cela arrive quand le
                  serveur vient d'être mis à jour ou redémarré pendant que cette page était
                  ouverte. <strong>Rechargez la page</strong> : dans la quasi-totalité des cas,
                  tout repart normalement.
                </>
              ) : (
                <>
                  Vos données n'ont rien perdu : rien n'a été effacé, et ce qui attendait d'être
                  synchronisé attend toujours. C'est l'affichage qui s'est interrompu.
                  <strong> Envoyez-nous le détail ci-dessous</strong>, il nous dit exactement où.
                </>
              )}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 mb-4">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Détail de la panne
              </p>
              <button
                type="button"
                onClick={this.copier}
                className="px-3 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                {copie ? 'Copié ✓' : 'Copier'}
              </button>
            </div>
            <p className="font-mono text-xs text-red-700 break-words whitespace-pre-wrap select-all">
              {String(error?.message || error || 'Erreur inconnue')}
            </p>
            {versionServeur && (
              <p className="text-gray-400 text-xs mt-2">
                Serveur en marche : <strong className="text-gray-600">{versionServeur}</strong>
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={() => window.location.reload()}
            >
              Recharger la page
            </button>
            <button
              type="button"
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50"
              onClick={() => window.location.assign('/login')}
            >
              Revenir à la connexion
            </button>
          </div>

          <p className="text-gray-400 text-xs text-center mt-5">
            Si l'écran revient après un rechargement, lancez
            {' '}« Appliquer la mise à jour (redémarrer) » dans le menu Démarrer du poste
            serveur, puis réessayez.
          </p>
        </div>
      </div>
    );
  }
}
