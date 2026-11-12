// LES VISAGES DU BULLETIN DE MATERNELLE — dessinés en SVG, jamais une police d'émojis ni une image téléchargée.
//
// Aucune dépendance à une police système (le serveur n'en a pas) : le même dessin sort net à l'écran, à
// l'impression et dans le PDF. Aucun identifiant interne (pas de dégradé nommé) : plusieurs visages dans la même
// page ne se marchent pas dessus. Viewbox 0 0 100 100.
//
//   A   : grand sourire ouvert, langue rose, anneau VERT, étincelles dorées
//   ECA : sourire doux, anneau ORANGE, petite étoile                          (affiché « IP » en anglais)
//   NA  : visage doux, anneau BLEU, petit cœur rose — `visage` choisit :
//           'encourageant' : sourire en coin, sourcils relevés
//           'triste'       : petite moue, sourcils inquiets (JAMAIS de larme, JAMAIS de colère)
//
// `actif` : le visage du niveau de l'enfant — couleur, halo, anneau épais, pastille ✓ (reste lisible en noir et blanc :
// c'est l'anneau épais, la taille et la pastille qui le désignent, pas la couleur). Sinon : gris très clair, effacé.

import { MAT_NIVEAU_COULEUR } from '../../core/matBulletin';

const ENCRE = '#1f2937';
const encre = (actif) => (actif ? ENCRE : '#c3cacd');

function Etincelle({ x, y, r, fill = '#fbbf24' }) {
  // étoile à quatre branches
  const d = `M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z`;
  return <path d={d} fill={fill} />;
}
function Etoile({ x, y, r, fill = '#fbbf24' }) {
  const pts = [];
  for (let i = 0; i < 10; i += 1) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(x + rr * Math.cos(a)).toFixed(2)},${(y + rr * Math.sin(a)).toFixed(2)}`);
  }
  return <polygon points={pts.join(' ')} fill={fill} />;
}
function Coeur({ x, y, s, fill = '#f472b6' }) {
  const d = `M${x} ${y + s * 0.9} C${x - s * 1.6} ${y - s * 0.2} ${x - s * 0.6} ${y - s * 1.1} ${x} ${y - s * 0.3} C${x + s * 0.6} ${y - s * 1.1} ${x + s * 1.6} ${y - s * 0.2} ${x} ${y + s * 0.9}Z`;
  return <path d={d} fill={fill} />;
}

function Bouche({ niveau, visage, actif }) {
  const c = encre(actif);
  if (niveau === 'A') {
    return (
      <g>
        <path d="M29 55 Q50 84 71 55 Z" fill={actif ? '#7f1d1d' : '#c3cacd'} stroke={c} strokeWidth="2" strokeLinejoin="round" />
        <path d="M39 69 Q50 62 61 69 Q50 79 39 69Z" fill={actif ? '#fb7185' : '#e1e5e7'} />
      </g>
    );
  }
  if (niveau === 'ECA') return <path d="M33 59 Q50 74 67 59" fill="none" stroke={c} strokeWidth="4.5" strokeLinecap="round" />;
  if (visage === 'triste') return <path d="M38 68 Q50 59 62 68" fill="none" stroke={c} strokeWidth="4.5" strokeLinecap="round" />;
  return <path d="M37 62 Q51 70 65 57" fill="none" stroke={c} strokeWidth="4.5" strokeLinecap="round" />;
}

function Sourcils({ niveau, visage, actif }) {
  if (niveau !== 'NA') return null;
  const c = encre(actif);
  if (visage === 'triste') {
    // inquiets : l'extrémité INTÉRIEURE monte — pas de larme, pas de colère
    return (
      <g stroke={c} strokeWidth="3.4" strokeLinecap="round" fill="none">
        <path d="M24 33 L43 26" /><path d="M57 26 L76 33" />
      </g>
    );
  }
  // curieux : arcs relevés
  return (
    <g stroke={c} strokeWidth="3.4" strokeLinecap="round" fill="none">
      <path d="M25 30 Q34 21 44 28" /><path d="M56 28 Q66 21 75 30" />
    </g>
  );
}

/**
 * @param {'A'|'ECA'|'NA'} niveau
 * @param {boolean} actif      le niveau de l'enfant (couleur + anneau + ✓) ; faux = gris effacé
 * @param {'encourageant'|'triste'} visage  visage du niveau NA
 * @param {number} taille      côté en px
 * @param {boolean} decor      étincelles / étoile / cœur (désactivable en très petit)
 * @param {boolean} pastille   la pastille ✓ (seulement si actif)
 */
export default function MatVisage({ niveau, actif = true, visage = 'encourageant', taille = 28, decor = true, pastille = true, title }) {
  const ton = MAT_NIVEAU_COULEUR[niveau] || '#9ca3af';
  const visageFond = actif ? '#fcd34d' : '#eceff0';
  const anneau = actif ? ton : '#d5dadc';
  return (
    <svg viewBox="0 0 100 100" width={taille} height={taille} role="img" aria-label={title || niveau}
      style={{ display: 'inline-block', verticalAlign: 'middle', overflow: 'visible', flexShrink: 0 }}>
      {title ? <title>{title}</title> : null}
      {actif && <circle cx="50" cy="50" r="49" fill={ton} opacity="0.22" />}
      <circle cx="50" cy="50" r="41" fill={visageFond} stroke={anneau} strokeWidth={actif ? 7 : 4} />
      <Sourcils niveau={niveau} visage={visage} actif={actif} />
      {/* yeux : grands, brillants */}
      <ellipse cx="36" cy="45" rx="6.2" ry="8" fill={encre(actif)} />
      <ellipse cx="64" cy="45" rx="6.2" ry="8" fill={encre(actif)} />
      <circle cx="38.4" cy="41.5" r="2.5" fill="#fff" /><circle cx="66.4" cy="41.5" r="2.5" fill="#fff" />
      <circle cx="34.4" cy="48.2" r="1.2" fill="#fff" opacity="0.8" /><circle cx="62.4" cy="48.2" r="1.2" fill="#fff" opacity="0.8" />
      {/* joues rosées */}
      <circle cx="25" cy="60" r="5.5" fill={actif ? '#fb9aa9' : '#e4e8ea'} opacity={actif ? 0.6 : 0.8} />
      <circle cx="75" cy="60" r="5.5" fill={actif ? '#fb9aa9' : '#e4e8ea'} opacity={actif ? 0.6 : 0.8} />
      <Bouche niveau={niveau} visage={visage} actif={actif} />
      {actif && decor && niveau === 'A' && (<><Etincelle x={92} y={12} r={8} /><Etincelle x={6} y={20} r={5} /><Etincelle x={95} y={30} r={3.5} fill="#fcd34d" /></>)}
      {actif && decor && niveau === 'ECA' && <Etoile x={91} y={13} r={8} />}
      {actif && decor && niveau === 'NA' && <Coeur x={90} y={13} s={6.5} />}
      {actif && pastille && (
        <g>
          <circle cx="82" cy="82" r="15" fill={ton} stroke="#fff" strokeWidth="3.5" />
          <path d="M74.5 82 L80.2 87.8 L90 76.5" fill="none" stroke="#fff" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  );
}
