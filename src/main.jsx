import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';
import { initAnalytics } from './lib/analytics';
// Le dernier filet : une exception de rendu démontait l'arbre entier et laissait
// une page BLANCHE, sans un mot (incident du 2026-10-27). Voir le fichier.
import AppErrorBoundary from './components/AppErrorBoundary';

// Auto-réparation après déploiement (PWA) : quand un nouveau build remplace les
// chunks (nouveaux hashs) et que le service worker purge l'ancien cache, un
// onglet déjà ouvert peut échouer à charger un chunk lazy -> écran « Chargement »
// figé. Vite émet alors `vite:preloadError`. On recharge la page UNE fois pour
// récupérer l'index.html + les chunks à jour. Le verrou sessionStorage évite
// toute boucle de rechargement si le souci venait d'ailleurs (réseau, 500…).
window.addEventListener('vite:preloadError', () => {
  if (sessionStorage.getItem('nc_chunk_reloaded') === '1') return;
  sessionStorage.setItem('nc_chunk_reloaded', '1');
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);

// Mesure d'usage : APRÈS le rendu, et sans `await`. Inerte en édition LAN et
// sans clé (voir src/lib/analytics.js) ; une erreur de chargement n'y est jamais
// remontée — l'ouverture de l'app ne dépend d'aucun service tiers.
initAnalytics();
