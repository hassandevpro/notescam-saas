// MODÈLE 1 « CLASSIQUE DORÉ » — certificat individuel, A4 paysage.
//
// Référence visuelle : Modele1_Classique_dore.pdf / Tableau_honneur_variante_autre_ecole.pdf.
// Fond crème, bordure guillochée aux couleurs de l'école, quatre rosaces dorées, double filet,
// en-tête officiel, médaillon doré du logo + filigrane, nom de l'école en capitales, devise,
// bannière ruban au titre doré, nom en calligraphie (Great Vibes), pastilles Classe / Période /
// Moyenne / Rang, texte FR (+ EN), sceau doré, deux signatures, lieu, date, année scolaire.
import {
  uid, feuille, nomCalligraphie, enteteDeuxColonnes, contenuMedaillon, titre, intro, felicitations, mentionSpeciale,
  chiffresCles, libSignataire, sceauDore, tailleAjustee, esc, T, txt,
} from './commun.js';

function bordure(p) {
  const g = uid('g'), r = uid('r');
  const rosace = (cx, cy) => `<g transform="translate(${cx} ${cy})">
      <circle r="9.4" fill="${p.fonce}" stroke="${p.or}" stroke-width=".5"/>
      ${Array.from({ length: 12 }, (_, i) => `<ellipse rx="7.4" ry="2.6" transform="rotate(${i * 15})" fill="none" stroke="${p.or}" stroke-width=".22"/>`).join('')}
      <circle r="7.6" fill="none" stroke="${p.orClair}" stroke-width=".3"/>
      <circle r="3" fill="url(#${r})" stroke="${p.orFonce}" stroke-width=".25"/>
      <circle r="1.4" fill="none" stroke="${p.orFonce}" stroke-width=".25"/>
    </g>`;
  return `<svg viewBox="0 0 297 210" style="position:absolute;inset:0;width:297mm;height:210mm">
    <defs>
      <pattern id="${g}" width="3.6" height="3.6" patternUnits="userSpaceOnUse">
        <rect width="3.6" height="3.6" fill="${p.fonce}"/>
        <g fill="none" stroke="${p.or}" stroke-width=".17" opacity=".9">
          <circle cx="1.8" cy="1.8" r="2"/><circle cx="0" cy="0" r="2"/><circle cx="3.6" cy="0" r="2"/>
          <circle cx="0" cy="3.6" r="2"/><circle cx="3.6" cy="3.6" r="2"/>
        </g>
      </pattern>
      <radialGradient id="${r}"><stop offset="0" stop-color="${p.orClair}"/><stop offset="1" stop-color="${p.or}"/></radialGradient>
    </defs>
    <path fill-rule="evenodd" fill="url(#${g})" d="M0 0H297V210H0Z M10 10V200H287V10Z"/>
    <rect x="1.2" y="1.2" width="294.6" height="207.6" fill="none" stroke="${p.or}" stroke-width=".6"/>
    <rect x="9.4" y="9.4" width="278.2" height="191.2" fill="none" stroke="${p.or}" stroke-width=".9"/>
    <rect x="12.6" y="12.6" width="271.8" height="184.8" fill="none" stroke="${p.or}" stroke-width=".45"/>
    <rect x="14" y="14" width="269" height="182" fill="none" stroke="${p.fonce}" stroke-width=".25"/>
    ${rosace(10, 10)}${rosace(287, 10)}${rosace(10, 200)}${rosace(287, 200)}
  </svg>`;
}

function medaillon(doc, p) {
  const id = uid('m'); const n = 40;
  const pts = Array.from({ length: n * 2 }, (_, i) => {
    const a = (Math.PI * i) / n, rr = i % 2 ? 46 : 50;
    return `${(50 + rr * Math.sin(a)).toFixed(2)},${(50 - rr * Math.cos(a)).toFixed(2)}`;
  }).join(' ');
  return `<div style="position:absolute;left:131.5mm;top:13mm;width:34mm;height:34mm">
    <svg viewBox="0 0 100 100" style="position:absolute;inset:0;width:34mm;height:34mm">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.orClair}"/><stop offset=".55" stop-color="${p.or}"/><stop offset="1" stop-color="${p.orFonce}"/></linearGradient></defs>
      <polygon points="${pts}" fill="url(#${id})"/>
      <circle cx="50" cy="50" r="41" fill="#fff" stroke="${p.orFonce}" stroke-width=".8"/>
    </svg>
    <div style="position:absolute;inset:4.5mm;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#fff">
      ${contenuMedaillon(doc, 25, p.fonce)}
    </div>
  </div>`;
}

function banniere(doc, p) {
  const t = titre(doc); const id = uid('b');
  const taille = tailleAjustee(t.principal, 140, 9.6, 6, 0.78);
  return `<div style="position:absolute;left:56mm;top:73mm;width:185mm;height:20mm">
    <svg viewBox="0 0 185 20" preserveAspectRatio="none" style="position:absolute;inset:0;width:185mm;height:20mm">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.moyen}"/><stop offset="1" stop-color="${p.fonce}"/></linearGradient></defs>
      <polygon points="0,5 18,5 18,19 0,19 6,12" fill="${p.fonce}"/>
      <polygon points="185,5 167,5 167,19 185,19 179,12" fill="${p.fonce}"/>
      <polygon points="12,16 18,19 18,16" fill="#000" opacity=".35"/>
      <polygon points="173,16 167,19 167,16" fill="#000" opacity=".35"/>
      <rect x="12" y="1" width="161" height="15" fill="url(#${id})"/>
      <rect x="12" y="2.2" width="161" height=".35" fill="${p.or}"/>
      <rect x="12" y="14.4" width="161" height=".35" fill="${p.or}"/>
    </svg>
    <div style="position:absolute;left:12mm;right:12mm;top:1mm;height:15mm;display:flex;align-items:center;justify-content:center">
      <span style="font:700 ${taille}mm 'Cinzel Decorative';letter-spacing:.2mm;white-space:nowrap;
        background:linear-gradient(180deg,${p.orClair} 0%,${p.or} 55%,${p.orFonce} 100%);-webkit-background-clip:text;background-clip:text;color:transparent">${esc(t.principal)}</span>
    </div>
  </div>
  ${t.second ? `<div style="position:absolute;left:0;right:0;top:95.5mm;text-align:center;font:500 3.3mm Lora;letter-spacing:1.6mm;color:${p.or}">${esc(t.second.toUpperCase())}</div>` : ''}`;
}

export function certificatModele1(doc) {
  const p = doc.palette;
  const [gauche, droite] = enteteDeuxColonnes(doc, { couleur: p.fonce, filet: p.or });
  const nomEcole = String(doc.ecole.nom || '').toUpperCase();
  const tEcole = tailleAjustee(nomEcole, 180, 6.2, 3.6, 0.8);
  const t2 = titre(doc).second;
  const yIntro = t2 ? 102 : 99;
  const it = intro(doc, T.decerne);
  const nom = nomCalligraphie(doc.eleve.nom);
  const tNom = tailleAjustee(nom, 200, 17, 8.5, 0.42);
  const fe = felicitations(doc);
  const ms = mentionSpeciale(doc);
  const cles = chiffresCles(doc);
  const sg = libSignataire(doc.signataires?.gauche, doc.lang);
  const sd = libSignataire(doc.signataires?.droite, doc.lang);
  const lAnnee = txt(T.anneeScol, doc.lang === 'bi' ? 'fr' : doc.lang).principal;

  const signature = (s, nomSign, pied, x) => `<div style="position:absolute;left:${x}mm;top:163mm;width:74mm;text-align:center;color:#1f2937">
      <div style="font:600 3.6mm Poppins;color:#111">${esc(s.principal)}</div>
      ${s.second ? `<div style="font:italic 2.9mm Lora;color:#6b7280">${esc(s.second)}</div>` : ''}
      <div style="height:${s.second ? 11 : 14.6}mm"></div>
      <div style="height:.3mm;background:${p.or};margin:0 4mm"></div>
      <div style="font:500 ${tailleAjustee(nomSign, 66, 3.1, 2.2, 0.55)}mm Poppins;margin-top:1.3mm;height:3.8mm;line-height:3.8mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(nomSign || '')}</div>
      <div style="font:italic 2.8mm Lora;color:#6b7280;margin-top:1.4mm">${esc(pied)}</div>
    </div>`;

  return feuille(`
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,#fffdf6 0%,#fbf3df 70%,#f3e6c4 100%)"></div>
    ${doc.ecole.logo ? `<img src="${esc(doc.ecole.logo)}" alt="" style="position:absolute;left:108.5mm;top:83mm;width:80mm;height:80mm;object-fit:contain;opacity:.045;filter:grayscale(.5)"/>` : ''}
    ${bordure(p)}
    <div style="position:absolute;left:27mm;top:22mm">${gauche}</div>
    <div style="position:absolute;right:27mm;top:22mm">${droite}</div>
    ${medaillon(doc, p)}
    <div style="position:absolute;left:30mm;right:30mm;top:52mm;text-align:center">
      <div style="font:500 ${tEcole}mm Cinzel;letter-spacing:.5mm;color:${p.fonce};white-space:nowrap">${esc(nomEcole)}</div>
      ${doc.ecole.devise ? `<div style="font:italic 3mm Lora;color:#6b7280;margin-top:.6mm;line-height:1.3;max-height:7.8mm;overflow:hidden">« ${esc(doc.ecole.devise)} »</div>` : ''}
    </div>
    ${banniere(doc, p)}
    <div style="position:absolute;left:30mm;right:30mm;top:${yIntro}mm;text-align:center;font:italic 4mm Lora;color:#6b7280">
      ${esc(it.principal)}${it.second ? ` <span style="color:#9ca3af">/ ${esc(it.second)}</span>` : ''}
    </div>
    <div style="position:absolute;left:30mm;right:30mm;top:${yIntro + 4}mm;height:${Math.max(tNom * 1.35, 16)}mm;display:flex;align-items:center;justify-content:center">
      <span style="font:400 ${tNom}mm 'Great Vibes';color:${p.fonce};white-space:nowrap;line-height:1.1">${esc(nom)}</span>
    </div>
    <div style="position:absolute;left:84mm;width:129mm;top:126.5mm;height:3mm">
      <svg viewBox="0 0 129 3" style="width:129mm;height:3mm"><path d="M0 1.6 Q32 .9 60 1.5" stroke="${p.or}" stroke-width=".35" fill="none"/><path d="M69 1.5 Q97 .9 129 1.6" stroke="${p.or}" stroke-width=".35" fill="none"/>
      <rect x="62.7" y=".1" width="2.4" height="2.4" transform="rotate(45 63.9 1.3)" fill="${p.or}"/><circle cx="1" cy="1.6" r=".6" fill="${p.or}"/><circle cx="128" cy="1.6" r=".6" fill="${p.or}"/></svg>
    </div>
    <div style="position:absolute;left:52mm;width:193mm;top:133mm;display:flex;gap:4.5mm">
      ${cles.map((c) => `<div style="flex:1;border:.35mm solid ${p.or};border-radius:2.2mm;background:${p.clair};padding:1.3mm 1mm;text-align:center">
        <div style="font:600 1.9mm Poppins;letter-spacing:.2mm;color:${p.moyen};text-transform:uppercase">${esc(c.lib)}</div>
        <div style="font:700 3.6mm Poppins;color:${p.fonce};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.val)}</div></div>`).join('')}
    </div>
    <div style="position:absolute;left:30mm;right:30mm;top:${ms ? 147 : 149}mm;text-align:center">
      <div style="font:400 4mm Lora;color:#1f2937">${esc(fe.principal)}</div>
      ${fe.second ? `<div style="font:italic 3.1mm Lora;color:#6b7280;margin-top:.6mm">${esc(fe.second)}</div>` : ''}
      ${ms ? `<div style="font:600 3mm Poppins;color:${p.orFonce};margin-top:1mm">★ ${esc(ms.principal)}${ms.second ? ` — <span style="font:italic 400 2.9mm Lora">${esc(ms.second)}</span>` : ''}</div>` : ''}
    </div>
    ${signature(sg, doc.signataires?.gauche?.nom, doc.faitA, 36)}
    ${signature(sd, doc.signataires?.droite?.nom, `${lAnnee} ${doc.ecole.annee || ''}`, 187)}
    <div style="position:absolute;left:131.5mm;top:162mm">${sceauDore(doc, { taille: 34 })}</div>
  `, { paysage: true, fond: '#fbf3df' });
}
