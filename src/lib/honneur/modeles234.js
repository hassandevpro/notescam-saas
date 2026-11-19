// MODÈLES 2, 3, 4 — certificats individuels, A4 paysage.
// Références : Modele2_Moderne.pdf, Modele3_Elegant_sobre.pdf, Modele4_Primaire.pdf.
import {
  uid, feuille, nomCalligraphie, enteteLigne, contenuMedaillon, titre, intro, felicitations, mentionSpeciale,
  chiffresCles, libSignataire, sceauDore, tailleAjustee, esc, T, txt, nombre, rang, periode,
} from './commun.js';

const annee = (doc) => `${txt(T.anneeScol, doc.lang === 'bi' ? 'fr' : doc.lang).principal} ${doc.ecole.annee || ''}`;

function signatures(doc, { top, gauche, droite, largeur = 72, couleurFilet, piedG = '', piedD = '' }) {
  const bloc = (s, nom, x, pied) => {
    const l = libSignataire(s, doc.lang);
    return `<div style="position:absolute;left:${x}mm;top:${top}mm;width:${largeur}mm;text-align:center">
      <div style="font:600 3.4mm Poppins;color:#111">${esc(l.principal)}</div>
      ${l.second ? `<div style="font:italic 2.8mm Lora;color:#6b7280">${esc(l.second)}</div>` : ''}
      <div style="height:${l.second ? 9 : 12.6}mm"></div>
      <div style="height:.3mm;background:${couleurFilet};margin:0 3mm"></div>
      <div style="font:500 ${tailleAjustee(nom, largeur - 6, 3, 2.2, 0.55)}mm Poppins;margin-top:1.2mm;height:3.8mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#1f2937">${esc(nom || '')}</div>
      ${pied ? `<div style="font:italic 2.7mm Lora;color:#6b7280;margin-top:1.6mm">${esc(pied)}</div>` : ''}
    </div>`;
  };
  return bloc(doc.signataires?.gauche, doc.signataires?.gauche?.nom, gauche, piedG)
    + bloc(doc.signataires?.droite, doc.signataires?.droite?.nom, droite, piedD);
}

const lignesTexte = (doc, top, { couleur = '#1f2937', police = 'Lora', taille = 4, gauche = 30, droite = 30 } = {}) => {
  const fe = felicitations(doc); const ms = mentionSpeciale(doc);
  return `<div style="position:absolute;left:${gauche}mm;right:${droite}mm;top:${top}mm;text-align:center">
    <div style="font:400 ${taille}mm ${police};color:${couleur};line-height:1.35">${esc(fe.principal)}</div>
    ${fe.second ? `<div style="font:italic 3mm Lora;color:#6b7280;margin-top:.8mm">${esc(fe.second)}</div>` : ''}
    ${ms ? `<div style="font:600 2.9mm Poppins;color:${doc.palette.orFonce};margin-top:1.2mm">★ ${esc(ms.principal)}${ms.second ? ` — <i style="font:italic 400 2.8mm Lora">${esc(ms.second)}</i>` : ''}</div>` : ''}
  </div>`;
};

// ── MODÈLE 2 « MODERNE » ─────────────────────────────────────────────────────
export function certificatModele2(doc) {
  const p = doc.palette; const g = uid('d'); const o = uid('o');
  const t = titre(doc); const e = enteteLigne(doc);
  const nom = doc.eleve.nom || '';
  const tNom = tailleAjustee(nom, 170, 12, 6.5, 0.6);
  const it = intro(doc, T.decerne);
  const cles = chiffresCles(doc);
  const nomEcole = String(doc.ecole.nom || '').toUpperCase();
  return feuille(`
    <div style="position:absolute;inset:0;background:#f6f8fc"></div>
    <svg viewBox="0 0 297 210" style="position:absolute;inset:0;width:297mm;height:210mm">
      <defs>
        <linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.moyen}"/><stop offset="1" stop-color="${p.fonce}"/></linearGradient>
        <linearGradient id="${o}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.or}"/><stop offset=".45" stop-color="${p.orClair}"/><stop offset="1" stop-color="${p.orFonce}"/></linearGradient>
      </defs>
      <polygon points="0,0 92,0 112,210 0,210" fill="url(#${g})"/>
      <circle cx="58" cy="18" r="34" fill="#fff" opacity=".05"/><circle cx="30" cy="110" r="34" fill="#fff" opacity=".05"/><circle cx="72" cy="190" r="40" fill="#fff" opacity=".05"/>
      <polygon points="92,0 96.5,0 116.5,210 112,210" fill="url(#${o})"/>
    </svg>
    <div style="position:absolute;left:14mm;top:20mm;width:56mm;height:56mm;border-radius:50%;background:#fff;border:1.6mm solid ${p.or};box-sizing:border-box;display:flex;align-items:center;justify-content:center;overflow:hidden">
      ${contenuMedaillon(doc, 44, p.fonce)}
    </div>
    <div style="position:absolute;left:6mm;width:72mm;top:86mm;text-align:center;color:#fff">
      <div style="font:500 ${tailleAjustee(nomEcole, 140, 5, 3, 0.75)}mm Cinzel;letter-spacing:.4mm;line-height:1.3;max-height:20mm;overflow:hidden">${esc(nomEcole)}</div>
      ${doc.ecole.devise ? `<div style="font:italic 2.8mm Lora;color:${p.orClair};margin-top:1.5mm;line-height:1.3;max-height:11mm;overflow:hidden">« ${esc(doc.ecole.devise)} »</div>` : ''}
    </div>
    <div style="position:absolute;left:6mm;width:72mm;top:184mm;text-align:center;color:#fff">
      <div style="font:600 2.6mm Poppins;letter-spacing:.3mm;text-transform:uppercase">${esc(txt(T.anneeScol, doc.lang === 'bi' ? 'fr' : doc.lang).principal)}</div>
      <div style="font:700 4.6mm Poppins;margin-top:.6mm">${esc(doc.ecole.annee || '')}</div>
    </div>
    <div style="position:absolute;left:122mm;right:12mm;top:12mm;text-align:center">
      <div style="font:600 2.3mm Poppins;letter-spacing:.35mm;color:#4b5563">${esc(e.l1)}</div>
      <div style="font:400 2.1mm Poppins;letter-spacing:.3mm;color:#6b7280;margin-top:.5mm">${esc(e.l2)}</div>
      <div style="font:800 ${tailleAjustee(t.principal, 150, 13, 8, 0.7)}mm Poppins;color:${p.fonce};margin-top:6mm;letter-spacing:.2mm;white-space:nowrap">${esc(t.principal)}</div>
      ${t.second ? `<div style="font:500 3mm Poppins;letter-spacing:2.2mm;color:${p.or};margin-top:-.5mm">${esc(t.second)}</div>` : ''}
      <div style="width:26mm;height:.9mm;background:${p.or};margin:2.5mm auto 0"></div>
      <div style="font:400 3.8mm Poppins;color:#6b7280;margin-top:7mm">${esc(it.principal)}${it.second ? ` · ${esc(it.second)}` : ''}</div>
      <div style="font:700 ${tNom}mm Poppins;color:${p.moyen};margin-top:1.5mm;white-space:nowrap;line-height:1.25">${esc(nom)}</div>
      <div style="width:120mm;height:.9mm;margin:1mm auto 0;background:linear-gradient(90deg,${p.orFonce},${p.orClair},${p.orFonce})"></div>
    </div>
    <div style="position:absolute;left:126mm;right:14mm;top:103mm;display:flex">
      ${cles.map((c, i) => `<div style="flex:1;text-align:center;${i ? `border-left:.35mm solid ${p.or};` : ''}padding:0 1.5mm">
        <div style="font:600 2.1mm Poppins;letter-spacing:.2mm;color:${p.moyen};text-transform:uppercase">${esc(c.lib)}</div>
        <div style="font:700 ${tailleAjustee(c.val, 36, 5.4, 3.2, 0.6)}mm Poppins;color:${p.fonce};white-space:nowrap;margin-top:1mm">${esc(c.val)}</div></div>`).join('')}
    </div>
    ${lignesTexte(doc, 123, { gauche: 128, droite: 16, police: 'Poppins', taille: 3.7 })}
    ${signatures(doc, { top: 154, gauche: 128, droite: 205, largeur: 68, couleurFilet: p.or })}
    <div style="position:absolute;left:122mm;right:12mm;top:196mm;text-align:center;font:italic 2.8mm Lora;color:#6b7280">${esc(doc.faitA)}</div>
    <div style="position:absolute;left:91mm;top:148mm">${sceauDore(doc, { taille: 38 })}</div>
  `, { paysage: true, fond: '#f6f8fc' });
}

// ── MODÈLE 3 « ÉLÉGANT SOBRE » ───────────────────────────────────────────────
export function certificatModele3(doc) {
  const p = doc.palette; const t = titre(doc); const e = enteteLigne(doc);
  const nom = doc.eleve.nom || '';
  const tNom = tailleAjustee(nom, 200, 15, 7.5, 0.48);
  const it = intro(doc, { fr: 'décerné à', en: 'awarded to' });
  const l = doc.lang === 'en' ? 'en' : 'fr'; const ev = doc.eleve;
  const resume = [ev.classe, periode(ev.periodeKey, l), `${T.moyenne[l]} ${nombre(ev.moyenne20, l)} / 20`, ev.rang ? `${T.rang[l]} ${rang(ev.rang, l)}${ev.effectif ? ` / ${ev.effectif}` : ''}` : ''].filter(Boolean).join('  ·  ');
  const nomEcole = String(doc.ecole.nom || '').toUpperCase();
  const coin = (x, y, sx, sy) => `<g transform="translate(${x} ${y}) scale(${sx} ${sy})"><rect x="-1" y="-1" width="2" height="2" fill="${p.or}"/><path d="M 10 0 A 7 7 0 0 1 3 7" fill="none" stroke="${p.or}" stroke-width=".35" transform="translate(4 3)"/></g>`;
  return feuille(`
    <div style="position:absolute;inset:0;background:#fffdf7"></div>
    ${doc.ecole.logo ? `<img src="${esc(doc.ecole.logo)}" alt="" style="position:absolute;left:108.5mm;top:68mm;width:80mm;height:80mm;object-fit:contain;opacity:.04;filter:grayscale(.6)"/>` : ''}
    <svg viewBox="0 0 297 210" style="position:absolute;inset:0;width:297mm;height:210mm">
      <rect x="7" y="7" width="283" height="196" fill="none" stroke="${p.fonce}" stroke-width="1.1"/>
      <rect x="10.5" y="10.5" width="276" height="189" fill="none" stroke="${p.or}" stroke-width=".35"/>
      <rect x="12" y="12" width="273" height="186" fill="none" stroke="${p.or}" stroke-width=".2"/>
      ${coin(10.5, 10.5, 1, 1)}${coin(286.5, 10.5, -1, 1)}${coin(10.5, 199.5, 1, -1)}${coin(286.5, 199.5, -1, -1)}
    </svg>
    <div style="position:absolute;left:30mm;right:30mm;top:16mm;text-align:center">
      <div style="font:600 2.3mm Poppins;letter-spacing:.4mm;color:#4b5563">${esc(e.l1)}</div>
      <div style="font:400 2.1mm Poppins;letter-spacing:.3mm;color:#6b7280;margin-top:.4mm">${esc(e.l2)}</div>
      <div style="width:17mm;height:17mm;margin:2.5mm auto 0;display:flex;align-items:center;justify-content:center">${contenuMedaillon(doc, 21, p.fonce)}</div>
      <div style="font:400 ${tailleAjustee(nomEcole, 200, 5.4, 3.2, 0.82)}mm Cinzel;letter-spacing:.6mm;color:${p.fonce};margin-top:2mm;white-space:nowrap">${esc(nomEcole)}</div>
      ${doc.ecole.devise ? `<div style="font:italic 2.8mm Lora;color:#6b7280;margin-top:.3mm;max-height:7.5mm;overflow:hidden">${esc(doc.ecole.devise)}</div>` : ''}
      <svg viewBox="0 0 110 4" style="width:110mm;height:4mm;margin-top:2mm"><path d="M0 2 Q25 .9 50 2" stroke="${p.or}" stroke-width=".35" fill="none"/><path d="M60 2 Q85 .9 110 2" stroke="${p.or}" stroke-width=".35" fill="none"/><rect x="53.5" y=".5" width="3" height="3" transform="rotate(45 55 2)" fill="${p.or}"/><circle cx=".8" cy="2" r=".6" fill="${p.or}"/><circle cx="109.2" cy="2" r=".6" fill="${p.or}"/></svg>
      <div style="font:400 ${tailleAjustee(t.principal, 210, 12.5, 7, 0.86)}mm Cinzel;letter-spacing:1.4mm;color:${p.fonce};margin-top:1.5mm;white-space:nowrap">${esc(t.principal)}</div>
      ${t.second ? `<div style="font:500 2.6mm Lora;letter-spacing:1.8mm;color:${p.or}">${esc(t.second.toUpperCase())}</div>` : ''}
      <div style="font:italic 3.8mm Lora;color:#6b7280;margin-top:${t.second ? 5 : 7}mm">${esc(it.principal)}${it.second ? ` / ${esc(it.second)}` : ''}</div>
      <div style="font:italic 400 ${tNom}mm Lora;color:${p.fonce};margin-top:.5mm;white-space:nowrap;line-height:1.2">${esc(nom)}</div>
      <div style="width:120mm;height:.3mm;background:${p.or};margin:.8mm auto 0"></div>
      <div style="font:500 3.1mm Poppins;letter-spacing:.3mm;color:${p.moyen};margin-top:4mm;white-space:nowrap">${esc(resume)}</div>
    </div>
    ${lignesTexte(doc, 124, { taille: 4.1 })}
    <div style="position:absolute;left:131mm;top:162mm;width:35mm;height:35mm">
      <svg viewBox="0 0 100 100" style="width:35mm;height:35mm">
        <circle cx="50" cy="50" r="47" fill="#fffdf7" stroke="${p.or}" stroke-width="1.6"/><circle cx="50" cy="50" r="41" fill="none" stroke="${p.or}" stroke-width=".6"/>
        <path d="M50 14 l2.4 5 5.4.6 -4 3.7 1.1 5.3 -4.9-2.7 -4.9 2.7 1.1-5.3 -4-3.7 5.4-.6z" fill="${p.orClair}" stroke="${p.or}" stroke-width=".4"/>
        <text x="50" y="58" text-anchor="middle" font-family="Lora" font-size="19" fill="#1f2937">${esc(nombre(doc.eleve.moyenne20, l))}</text>
        <text x="50" y="70" text-anchor="middle" font-family="Poppins" font-weight="600" font-size="6" letter-spacing="1" fill="${p.or}">${esc(T.sur20[l])}</text>
      </svg>
    </div>
    ${signatures(doc, { top: 160, gauche: 40, droite: 185, largeur: 72, couleurFilet: p.or, piedG: doc.faitA, piedD: annee(doc) })}
  `, { paysage: true, fond: '#fffdf7' });
}

// ── MODÈLE 4 « PRIMAIRE LUDIQUE » ────────────────────────────────────────────
function etoile(cx, cy, r, couleur, op = 1) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI * i) / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
    return `${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
  return `<polygon points="${pts}" fill="${couleur}" opacity="${op}"/>`;
}

export function certificatModele4(doc) {
  const p = doc.palette; const t = titre(doc); const e = enteteLigne(doc); const og = uid('og');
  const nom = nomCalligraphie(doc.eleve.nom);
  const tNom = tailleAjustee(nom, 190, 17, 8.5, 0.42);
  const it = intro(doc, T.decernePrim);
  const cles = chiffresCles(doc);
  const nomEcole = String(doc.ecole.nom || '').toUpperCase();
  const l = doc.lang === 'en' ? 'en' : 'fr';
  // Décor déterministe (même rendu à chaque tirage) : étoiles et points sur les bords.
  const decor = [
    [26, 30, 2.4, p.or], [37, 46, 1.6, p.orClair], [22, 68, 2, p.fonce], [44, 72, 2.2, p.or], [30, 92, 1.4, p.clair], [40, 108, 2, p.moyen], [24, 132, 1.6, p.orClair], [48, 140, 1.4, p.fonce],
    [270, 28, 1.6, p.fonce], [262, 50, 2.4, p.orClair], [276, 74, 1.6, p.moyen], [258, 96, 2, p.or], [272, 120, 1.4, p.fonce], [250, 150, 2, p.or], [266, 160, 2.2, p.moyen], [280, 140, 1.4, p.orClair],
  ].map(([x, y, r, c]) => etoile(x, y, r, c, 0.9)).join('')
    + [[33, 38, .9, p.or], [56, 64, .7, p.moyen], [29, 118, .7, p.or], [52, 120, .9, p.clair], [264, 40, .8, p.moyen], [255, 72, .7, p.or], [268, 104, 1, p.moyen], [245, 126, .7, p.fonce]]
      .map(([x, y, r, c]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" opacity=".8"/>`).join('');
  return feuille(`
    <div style="position:absolute;inset:0;background:${p.clair}"></div>
    <svg viewBox="0 0 297 210" style="position:absolute;inset:0;width:297mm;height:210mm">
      <defs><linearGradient id="${og}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.orClair}"/><stop offset=".6" stop-color="${p.or}"/><stop offset="1" stop-color="${p.orFonce}"/></linearGradient></defs>
      <rect x="9" y="9" width="279" height="192" rx="12" fill="#fff" stroke="${p.fonce}" stroke-width="2.6"/>
      <rect x="14" y="14" width="269" height="182" rx="8" fill="none" stroke="${p.or}" stroke-width=".55" stroke-dasharray="2 1.4"/>
      ${decor}
      ${etoile(148.5, 177, 21, `url(#${og})`)}
    </svg>
    <div style="position:absolute;left:40mm;right:40mm;top:18mm;text-align:center">
      <div style="font:600 2.3mm Poppins;letter-spacing:.35mm;color:#4b5563">${esc(e.l1)}</div>
      <div style="font:400 2.1mm Poppins;letter-spacing:.3mm;color:#6b7280;margin-top:.4mm">${esc(e.l2)}</div>
      <div style="width:24mm;height:24mm;margin:2.5mm auto 0;border-radius:50%;border:1.2mm solid ${p.fonce};background:#fff;box-sizing:border-box;display:flex;align-items:center;justify-content:center;overflow:hidden">${contenuMedaillon(doc, 19, p.fonce)}</div>
      <div style="font:700 ${tailleAjustee(nomEcole, 190, 4.4, 2.8, 0.66)}mm Poppins;letter-spacing:.3mm;color:${p.fonce};margin-top:2.5mm;white-space:nowrap">${esc(nomEcole)}</div>
    </div>
    <div style="position:absolute;left:73mm;width:151mm;top:75mm;height:16mm;border-radius:8mm;background:${p.fonce};display:flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 .9mm ${p.fonce},inset 0 0 0 1.25mm ${p.or}">
      <svg viewBox="0 0 10 10" style="position:absolute;left:6mm;width:6mm;height:6mm">${etoile(5, 5.3, 5, p.orClair)}</svg>
      <span style="font:800 ${tailleAjustee(t.principal, 110, 8, 5, 0.72)}mm Poppins;color:#fff;letter-spacing:.6mm;white-space:nowrap">${esc(t.principal)}</span>
      <svg viewBox="0 0 10 10" style="position:absolute;right:6mm;width:6mm;height:6mm">${etoile(5, 5.3, 5, p.orClair)}</svg>
    </div>
    ${t.second ? `<div style="position:absolute;left:0;right:0;top:94mm;text-align:center;font:600 2.7mm Poppins;letter-spacing:2mm;color:${p.or}">${esc(t.second)}</div>` : ''}
    <div style="position:absolute;left:40mm;right:40mm;top:${t.second ? 99 : 97}mm;text-align:center;font:400 3.8mm Poppins;color:#4b5563">${esc(it.principal)}${it.second ? `<br/><span style="font:italic 3mm Lora;color:#9ca3af">${esc(it.second)}</span>` : ''}</div>
    <div style="position:absolute;left:40mm;right:40mm;top:${it.second ? 109 : 103}mm;height:${Math.max(tNom * 1.3, 15)}mm;display:flex;align-items:center;justify-content:center">
      <span style="font:400 ${tNom}mm 'Great Vibes';color:${p.fonce};white-space:nowrap">${esc(nom)}</span>
    </div>
    <div style="position:absolute;left:52mm;right:52mm;top:${it.second ? 129 : 125}mm;display:flex;gap:4mm">
      ${cles.map((c, i) => `<div style="flex:1;border-radius:4.5mm;background:${i === 2 ? p.or : p.fonce};color:#fff;text-align:center;padding:1.4mm 1mm">
        <div style="font:500 1.9mm Poppins;letter-spacing:.2mm;text-transform:uppercase;opacity:.9">${esc(c.lib)}</div>
        <div style="font:700 ${tailleAjustee(c.val, 38, 3.7, 2.6, 0.6)}mm Poppins;white-space:nowrap">${esc(c.val)}</div></div>`).join('')}
    </div>
    ${lignesTexte(doc, it.second ? 143 : 140, { police: 'Poppins', taille: 3.9, couleur: '#1f2937', gauche: 40, droite: 40 })}
    <div style="position:absolute;left:136mm;top:169mm;width:25mm;height:16mm;display:flex;flex-direction:column;align-items:center;justify-content:center">
      <div style="width:14mm;height:14mm;border-radius:50%;background:${p.fonce};border:.5mm solid ${p.orClair};display:flex;flex-direction:column;align-items:center;justify-content:center">
        <div style="font:700 4.2mm Cinzel;color:${p.orClair};line-height:1">${esc(nombre(doc.eleve.moyenne20, l))}</div>
        <div style="font:600 1.5mm Poppins;color:#fff;margin-top:.4mm">${esc(T.sur20[l])}</div>
      </div>
    </div>
    ${signatures(doc, { top: 162, gauche: 42, droite: 183, largeur: 72, couleurFilet: p.or, piedG: doc.faitA, piedD: annee(doc) })}
  `, { paysage: true, fond: p.clair });
}
