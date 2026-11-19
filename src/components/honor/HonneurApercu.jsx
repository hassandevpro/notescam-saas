// Aperçu des tableaux d'honneur : les MÊMES pages HTML que le PDF (modeles.js), réduites
// à la largeur voulue. Ce qui s'affiche ici est ce qui sera capturé — aucun rendu à part.
import { useEffect, useState } from 'react';
import { chargerPolices } from '../../lib/honneur/rendu';

const MM = 96 / 25.4;   // px par mm (CSS)

export default function HonneurApercu({ pages = [], largeur = 560, max = 3, gap = 12 }) {
  const [pret, setPret] = useState(false);
  useEffect(() => { let vivant = true; chargerPolices().then(() => { if (vivant) setPret(true); }); return () => { vivant = false; }; }, []);
  if (!pages.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap, alignItems: 'center', opacity: pret ? 1 : 0.4, transition: 'opacity .2s' }}>
      {pages.slice(0, max).map((html, i) => {
        const paysage = !html.includes('data-orientation="portrait"');
        const [w, h] = paysage ? [297 * MM, 210 * MM] : [210 * MM, 297 * MM];
        const k = largeur / w;
        return (
          <div key={i} style={{ width: largeur, height: h * k, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,.15)', borderRadius: 4, flex: 'none', background: '#fff' }}>
            <div style={{ width: w, height: h, transform: `scale(${k})`, transformOrigin: 'top left' }} dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        );
      })}
      {pages.length > max && <p className="text-xs text-slate-500">+ {pages.length - max} page(s)</p>}
    </div>
  );
}
