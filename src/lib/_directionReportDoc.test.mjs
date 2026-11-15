import { buildDirectionReportHtml } from './directionReportDoc.js';

let ok = 0; let ko = 0;
const t = (nom, cond, info = '') => { if (cond) { ok++; console.log('✅', nom); } else { ko++; console.log('❌', nom, info); } };

const school = { name: 'Collège <Test>', current_year: '2026-2027', country: 'CM' };
const kpis = { moyenne: 12.34, reussite: 73, variationMoyenne: 1, variationReussite: null, classes: 2, eleves: 40 };
const h = buildDirectionReportHtml({
  school, kpis,
  barres: [{ id: 'a', nom: '6e <A>', valeur: 8, notes: 20 }, { id: 'b', nom: '5e', valeur: 14, notes: 20 }],
  suivre: [{ type: 'moyenne_basse', gravite: 2, classId: 'a', nom: '6e <A>', valeur: 8 }],
  faire: [], filtreLabel: 'Toute l’école', periodeLabel: 'Séquence 2', now: new Date('2026-11-14'),
});
t('page complète avec chiffres', h.includes('12.34') && h.includes('73') && h.includes('/20'));
t('variation affichée, absence de variation dite', h.includes('+1.0') && h.includes('pas de période précédente comparable'));
t('HTML échappé (aucune injection par un nom de classe)', !h.includes('<A>') && h.includes('6e &lt;A&gt;'));
t('barre rouge sous 10, bleue au-dessus', h.includes('barre bas') && h.includes('barre ok'));
t('liste vide dite honnêtement', h.includes('Aucune action en attente'));
t('sous-titre : période et filtre', h.includes('Séquence 2') && h.includes('Toute l’école'));
const v = buildDirectionReportHtml({ school, kpis: null, barres: [], suivre: [], faire: [] });
t('sans note : message, pas de chiffres inventés', v.includes('Aucune note saisie') && !v.includes('class="kpis"'));
t('aucun script d’impression dans le HTML pur', !h.includes('window.print'));

console.log(`\n✅ Rapport de direction : ${ok} ok, ${ko} ko`);
process.exit(ko ? 1 : 0);
