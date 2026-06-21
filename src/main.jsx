import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

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
    <App />
  </React.StrictMode>
);
