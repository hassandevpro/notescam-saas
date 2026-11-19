// REGISTRE DES MODÈLES VISUELS + PALMARÈS COLLECTIF (A4 portrait).
//
// Le palmarès n'a pas de référence dessinée : il reprend l'IDENTITÉ de chaque modèle
// (cadre, couleurs, polices du titre) sur une page portrait, avec une liste classée
// (rang, nom, classe, moyenne, mention, photo facultative), paginée sans couper une ligne.
import { certificatModele1 } from './modele1.js';
import { certificatModele2, certificatModele3, certificatModele4 } from './modeles234.js';
import {
  feuille, contenuMedaillon, titre, libSignataire, tailleAjustee, esc, T, txt, nombre, rang, periode, ministere, uid,
} from './commun.js';
import { libelleNiveau } from '../../core/honorSettings.js';

export const MODELES = [
  { id: 1, fr: 'Classique doré', en: 'Classic gold' },
  { id: 2, fr: 'Moderne', en: 'Modern' },
  { id: 3, fr: 'Élégant sobre', en: 'Elegant' },
  { id: 4, fr: 'Primaire ludique', en: 'Primary fun' },
];
/** Modèle par défaut : 4 pour une école primaire, 1 pour le secondaire. */
export const modeleParDefaut = (primaire) => (primaire ? 4 : 1);
export const modeleValide = (m) => (MODELES.some((x) => x.id === Number(m)) ? Number(m) : null);

const CERTIFICATS = { 1: certificatModele1, 2: certificatModele2, 3: certificatModele3, 4: certificatModele4 };
export function certificatHtml(m, doc) { return (CERTIFICATS[m] || certificatModele1)(doc); }

// ── Palmarès collectif ───────────────────────────────────────────────────────
const PAR_PAGE_1 = 19;     // la 1re page porte l'en-tête complet
const PAR_PAGE_N = 25;

function cadre(m, p) {
  if (m === 1) {
    const g = uid('pg');
    return `<svg viewBox="0 0 210 297" style="position:absolute;inset:0;width:210mm;height:297mm">
      <defs><pattern id="${g}" width="3.6" height="3.6" patternUnits="userSpaceOnUse"><rect width="3.6" height="3.6" fill="${p.fonce}"/>
        <g fill="none" stroke="${p.or}" stroke-width=".17" opacity=".9"><circle cx="1.8" cy="1.8" r="2"/><circle cx="0" cy="0" r="2"/><circle cx="3.6" cy="0" r="2"/><circle cx="0" cy="3.6" r="2"/><circle cx="3.6" cy="3.6" r="2"/></g></pattern></defs>
      <path fill-rule="evenodd" fill="url(#${g})" d="M0 0H210V297H0Z M7 7V290H203V7Z"/>
      <rect x="6.6" y="6.6" width="196.8" height="283.8" fill="none" stroke="${p.or}" stroke-width=".8"/>
      <rect x="9.2" y="9.2" width="191.6" height="278.6" fill="none" stroke="${p.or}" stroke-width=".35"/>
      ${[[7, 7], [203, 7], [7, 290], [203, 290]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5.6" fill="${p.fonce}" stroke="${p.or}" stroke-width=".5"/><circle cx="${x}" cy="${y}" r="2.2" fill="${p.or}"/>`).join('')}
    </svg>`;
  }
  if (m === 2) {
    return `<svg viewBox="0 0 210 297" style="position:absolute;inset:0;width:210mm;height:297mm">
      <rect width="210" height="46" fill="${p.fonce}"/><polygon points="0,46 210,46 210,49 0,52" fill="${p.or}"/>
      <circle cx="190" cy="10" r="26" fill="#fff" opacity=".05"/><circle cx="20" cy="40" r="20" fill="#fff" opacity=".05"/>
      <rect y="291" width="210" height="6" fill="${p.fonce}"/><rect y="290" width="210" height="1" fill="${p.or}"/>
    </svg>`;
  }
  if (m === 3) {
    return `<svg viewBox="0 0 210 297" style="position:absolute;inset:0;width:210mm;height:297mm">
      <rect x="6" y="6" width="198" height="285" fill="none" stroke="${p.fonce}" stroke-width="1"/>
      <rect x="9" y="9" width="192" height="279" fill="none" stroke="${p.or}" stroke-width=".3"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 210 297" style="position:absolute;inset:0;width:210mm;height:297mm">
    <rect x="6" y="6" width="198" height="285" rx="10" fill="#fff" stroke="${p.fonce}" stroke-width="2.2"/>
    <rect x="10" y="10" width="190" height="277" rx="7" fill="none" stroke="${p.or}" stroke-width=".5" stroke-dasharray="2 1.4"/>
  </svg>`;
}

const STYLE_TITRE = {
  1: (p) => `font:700 9mm 'Cinzel Decorative';background:linear-gradient(180deg,${p.orClair},${p.or} 55%,${p.orFonce});-webkit-background-clip:text;background-clip:text;color:transparent`,
  2: (p) => `font:800 10mm Poppins;color:${p.fonce}`,
  3: (p) => `font:400 9mm Cinzel;letter-spacing:1.2mm;color:${p.fonce}`,
  4: (p) => `font:800 8mm Poppins;color:#fff;background:${p.fonce};border-radius:6mm;padding:1.5mm 9mm;display:inline-block;letter-spacing:.5mm`,
};

function entetePalmares(doc, m) {
  const p = doc.palette; const t = titre(doc); const mi = ministere(doc);
  const l = doc.lang === 'en' ? 'en' : 'fr';
  const l1 = doc.lang === 'bi' ? `${T.republique.fr} · ${T.republique.en}` : T.republique[l];
  const l2 = doc.lang === 'bi' ? `${mi.fr} · ${mi.sigle}` : `${mi[l]} · ${mi.sigle}`;
  const sur2 = m === 2;   // modèle 2 : en-tête blanc sur le bandeau
  const nomEcole = String(doc.ecole.nom || '').toUpperCase();
  const sousTitre = [doc.groupe, periode(doc.periodeKey, l), `${txt(T.anneeScol, l).principal} ${doc.ecole.annee || ''}`].filter(Boolean).join(' · ');
  return `
    <div style="position:absolute;left:16mm;right:16mm;top:${sur2 ? 8 : 15}mm;display:flex;align-items:center;gap:5mm;color:${sur2 ? '#fff' : p.fonce}">
      <div style="width:24mm;height:24mm;flex:none;border-radius:50%;background:#fff;border:.9mm solid ${p.or};box-sizing:border-box;display:flex;align-items:center;justify-content:center;overflow:hidden">${contenuMedaillon(doc, 19, p.fonce)}</div>
      <div style="flex:1;min-width:0;text-align:center">
        <div style="font:600 2.2mm Poppins;letter-spacing:.3mm;opacity:.85">${esc(l1)}</div>
        <div style="font:400 2mm Poppins;letter-spacing:.25mm;opacity:.75">${esc(l2)}</div>
        <div style="font:600 ${tailleAjustee(nomEcole, 230, 5, 3.1, 0.75)}mm Cinzel;letter-spacing:.3mm;margin-top:1.5mm;line-height:1.25;max-height:9mm;overflow:hidden">${esc(nomEcole)}</div>
        ${doc.ecole.devise ? `<div style="font:italic 2.6mm Lora;opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">« ${esc(doc.ecole.devise)} »</div>` : ''}
      </div>
      <div style="width:24mm;flex:none"></div>
    </div>
    <div style="position:absolute;left:14mm;right:14mm;top:${sur2 ? 56 : 46}mm;text-align:center">
      <div style="${STYLE_TITRE[m](p)};white-space:nowrap">${esc(t.principal)}</div>
      ${t.second ? `<div style="font:500 2.8mm Lora;letter-spacing:1.8mm;color:${p.or};margin-top:.8mm">${esc(t.second.toUpperCase())}</div>` : ''}
      <div style="font:500 3.3mm Poppins;color:#374151;margin-top:2mm">${esc(sousTitre)}</div>
    </div>`;
}

function tableau(doc, m, lignes, top) {
  const p = doc.palette; const l = doc.lang === 'en' ? 'en' : 'fr';
  const bi = (e) => (doc.lang === 'bi' ? `${e.fr}<div style="font:400 1.8mm Lora;font-style:italic;opacity:.85">${esc(e.en)}</div>` : esc(e[l]));
  const photo = lignes.some((r) => r.photo);
  const th = `background:${m === 3 ? 'transparent' : p.fonce};color:${m === 3 ? p.fonce : '#fff'};font:600 2.4mm Poppins;padding:1.6mm 2mm;${m === 3 ? `border-bottom:.4mm solid ${p.or};` : ''}text-align:center`;
  const td = `padding:1.2mm 2mm;font:400 2.9mm Poppins;color:#1f2937;border-bottom:.2mm solid ${p.clair}`;
  const medaille = (r) => (r.rang <= 3 ? `<span style="display:inline-block;width:5mm;height:5mm;line-height:5mm;border-radius:50%;background:${[p.or, '#a8a9ad', '#b0703c'][r.rang - 1]};color:#fff;font:700 2.4mm Poppins">${r.rang}</span>` : `<span style="font:600 2.9mm Poppins">${r.rang}</span>`);
  return `<table style="position:absolute;left:16mm;right:16mm;top:${top}mm;width:178mm;border-collapse:collapse;table-layout:fixed">
    <colgroup><col style="width:14mm"/>${photo ? '<col style="width:12mm"/>' : ''}<col/><col style="width:26mm"/><col style="width:24mm"/><col style="width:34mm"/></colgroup>
    <thead><tr><th style="${th}">${bi(T.rang)}</th>${photo ? `<th style="${th}"></th>` : ''}<th style="${th};text-align:left">${bi(T.nom)}</th><th style="${th}">${bi(T.classe)}</th><th style="${th}">${bi(T.moyenne)}</th><th style="${th}">${bi(T.mention)}</th></tr></thead>
    <tbody>${lignes.map((r, i) => `<tr style="background:${i % 2 ? p.clair : '#fff'}">
      <td style="${td};text-align:center">${medaille(r)}</td>
      ${photo ? `<td style="${td};text-align:center">${r.photo ? `<img src="${esc(r.photo)}" alt="" style="width:8mm;height:8mm;border-radius:50%;object-fit:cover;vertical-align:middle"/>` : ''}</td>` : ''}
      <td style="${td};font-weight:${r.rang <= 3 ? 600 : 400};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:${tailleAjustee(r.nom, 95, 2.9, 2.2, 0.55)}mm">${esc(r.nom)}</td>
      <td style="${td};text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.classe || '')}</td>
      <td style="${td};text-align:center;font-weight:600">${esc(nombre(r.moyenne20, l))}</td>
      <td style="${td};text-align:center;color:${p.moyen};font-weight:500">${esc(r.niveau ? (doc.lang === 'en' ? libelleNiveau(r.niveau, 'en') : libelleNiveau(r.niveau, 'fr')) : '')}</td>
    </tr>`).join('')}</tbody></table>`;
}

function piedPalmares(doc, m) {
  const p = doc.palette;
  const bloc = (s, x) => {
    const lb = libSignataire(s, doc.lang);
    return `<div style="position:absolute;left:${x}mm;bottom:22mm;width:70mm;text-align:center">
      <div style="font:600 3mm Poppins;color:#111">${esc(lb.principal)}</div>${lb.second ? `<div style="font:italic 2.5mm Lora;color:#6b7280">${esc(lb.second)}</div>` : ''}
      <div style="height:10mm"></div><div style="height:.3mm;background:${p.or}"></div>
      <div style="font:500 2.8mm Poppins;margin-top:1mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s?.nom || '')}</div></div>`;
  };
  return `${bloc(doc.signataires?.gauche, 18)}${bloc(doc.signataires?.droite, 122)}
    <div style="position:absolute;left:0;right:0;bottom:${m === 2 ? 10 : 14}mm;text-align:center;font:italic 2.7mm Lora;color:#6b7280">${esc(doc.faitA)}</div>`;
}

/**
 * Palmarès d'un groupe (classe, niveau, établissement) : une ou plusieurs pages A4 portrait.
 * doc.lignes : [{ nom, classe, moyenne20, rang, niveau, photo? }] déjà triées.
 */
export function palmaresHtml(m, docBrut) {
  const doc = { ...docBrut, periodeKey: docBrut.periodeKey ?? docBrut.eleve?.periodeKey };
  const p = doc.palette; const lignes = doc.lignes || [];
  const pages = [];
  let i = 0;
  do {
    const premiere = pages.length === 0;
    const n = premiere ? PAR_PAGE_1 : PAR_PAGE_N;
    const tranche = lignes.slice(i, i + n); i += n;
    const derniere = i >= lignes.length;
    const fond = m === 3 ? '#fffdf7' : m === 4 ? p.clair : m === 1 ? '#fbf3df' : '#f6f8fc';
    pages.push(feuille(`
      ${m === 1 ? '<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 40%,#fffdf6,#f6ead0)"></div>' : ''}
      ${cadre(m, p)}
      ${premiere ? entetePalmares(doc, m) : `<div style="position:absolute;left:16mm;right:16mm;top:${m === 2 ? 14 : 15}mm;text-align:center;font:600 3.2mm Poppins;color:${m === 2 ? '#fff' : p.fonce}">${esc(String(doc.ecole.nom || '').toUpperCase())} — ${esc(titre(doc).principal)} (${pages.length + 1})</div>`}
      ${tableau(doc, m, tranche, premiere ? (m === 2 ? 82 : 72) : (m === 2 ? 58 : 26))}
      ${derniere ? piedPalmares(doc, m) : ''}
    `, { paysage: false, fond }));
  } while (i < lignes.length);
  return pages.join('');
}
