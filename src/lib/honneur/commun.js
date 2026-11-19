// Éléments communs aux modèles de tableaux d'honneur (HTML + SVG, unités en mm).
//
// Un « document » (doc) décrit UNE page, indépendamment du modèle visuel :
//   { lang: 'fr'|'en'|'bi', basic, niveau: 'th'|'enc'|'fel', palette,
//     ecole:  { nom, devise, logo (data-URL ou ''), lieu, annee },
//     eleve:  { nom, classe, periodeKey, moyenne20, rang, effectif },
//     textes: { introFr, introEn, felFr, felEn, mentionFr, mentionEn, titreFr, titreEn },
//     signataires: { gauche: { titre: {fr,en}, nom }, droite: { titre: {fr,en}, nom } },
//     primaire: bool, date: Date }
import { T, txt, txtPerso, esc, nombre, rang, periode } from './textes.js';

let compteur = 0;
/** Identifiant SVG unique par page (plusieurs pages dans un même document HTML). */
export const uid = (p) => `${p}${++compteur}`;

/** Taille (mm) d'un texte sur une ligne de `largeur` mm : `k` = largeur moyenne d'un caractère en em. */
export function tailleAjustee(texte, largeur, max, min, k) {
  const n = Math.max(1, String(texte || '').length);
  return Math.max(min, Math.min(max, largeur / (n * k)));
}

export function ministere(doc) { return doc.basic ? T.minedub : T.minesec; }

/** Bloc République + devise + ministère, dans UNE langue. */
export function blocOfficiel(doc, langue, style = '') {
  const m = ministere(doc);
  return `<div style="${style}">
    <div style="font:600 2.7mm Poppins;letter-spacing:.1mm">${esc(T.republique[langue])}</div>
    <div style="font:italic 2.5mm Lora;margin-top:.4mm">${esc(T.devise[langue])}</div>
    <div style="font:500 2.3mm Poppins;margin-top:.8mm;line-height:1.35">${esc(m[langue])}</div>
  </div>`;
}

/** En-tête officiel sur deux colonnes : FR | EN en bilingue ; République | Ministère sinon. */
export function enteteDeuxColonnes(doc, { couleur, filet }) {
  const col = (html) => `<div style="width:62mm;text-align:center;color:${couleur}">${html}<div style="width:16mm;height:.3mm;background:${filet};margin:1.2mm auto 0"></div></div>`;
  if (doc.lang === 'bi') return [col(blocOfficiel(doc, 'fr')), col(blocOfficiel(doc, 'en'))];
  const l = doc.lang === 'en' ? 'en' : 'fr';
  const m = ministere(doc);
  return [
    col(`<div style="font:600 2.7mm Poppins">${esc(T.republique[l])}</div><div style="font:italic 2.5mm Lora;margin-top:.4mm">${esc(T.devise[l])}</div>`),
    col(`<div style="font:500 2.4mm Poppins;line-height:1.35">${esc(m[l])}</div><div style="font:600 2.4mm Poppins;margin-top:.4mm">${esc(m.sigle)}</div>`),
  ];
}

/** En-tête sur une ligne (« RÉPUBLIQUE DU CAMEROUN · REPUBLIC OF CAMEROON »), modèles 2 à 4. */
export function enteteLigne(doc) {
  const m = ministere(doc);
  const l1 = doc.lang === 'bi' ? `${T.republique.fr} · ${T.republique.en}` : T.republique[doc.lang === 'en' ? 'en' : 'fr'];
  const l2 = doc.lang === 'bi' ? `${m.fr} · ${m.sigle}` : `${m[doc.lang === 'en' ? 'en' : 'fr']} · ${m.sigle}`;
  return { l1, l2 };
}

/** Médaillon du logo (cercle) ; sans logo, les initiales de l'école. */
export function contenuMedaillon(doc, diametre, couleur) {
  if (doc.ecole.logo) {
    return `<img src="${esc(doc.ecole.logo)}" alt="" style="width:${diametre * 0.78}mm;height:${diametre * 0.78}mm;object-fit:contain;display:block"/>`;
  }
  const ini = String(doc.ecole.nom || '').split(/\s+/).filter((w) => w.length > 2).slice(0, 3).map((w) => w[0]).join('').toUpperCase();
  return `<div style="font:700 ${diametre * 0.3}mm Cinzel;color:${couleur}">${esc(ini || '★')}</div>`;
}

export function titre(doc) {
  const def = T.titre[doc.niveau] || T.titre.th;
  const t = { fr: doc.textes?.titreFr || def.fr, en: doc.textes?.titreEn || def.en };
  return doc.lang === 'en' ? { principal: t.en, second: '' } : { principal: t.fr, second: doc.lang === 'bi' ? t.en : '' };
}

export function intro(doc, defaut) { return txtPerso(doc.textes?.introFr, doc.textes?.introEn, defaut, doc.lang); }
export function felicitations(doc) {
  return txtPerso(doc.textes?.felFr, doc.textes?.felEn, doc.primaire ? T.felicitationsPrim : T.felicitations, doc.lang);
}
export function mentionSpeciale(doc) {
  const fr = String(doc.textes?.mentionFr || '').trim(), en = String(doc.textes?.mentionEn || '').trim();
  if (!fr && !en) return null;
  return txt({ fr: fr || en, en: en || fr }, doc.lang);
}

/** Les 4 « chiffres clés » : libellé (dans la langue principale) + valeur. */
export function chiffresCles(doc) {
  const l = doc.lang === 'en' ? 'en' : 'fr';
  const e = doc.eleve;
  return [
    { lib: T.classe[l], val: e.classe },
    // « Période » en français ; en anglais le mot suit la période : Sequence, Term ou Year.
    { lib: l === 'en' ? (String(e.periodeKey).startsWith('seq') ? 'Sequence' : String(e.periodeKey).startsWith('term') ? 'Term' : 'Year') : T.periode.fr,
      val: periode(e.periodeKey, l) },
    { lib: T.moyenne[l], val: `${nombre(e.moyenne20, l)} / 20` },
    { lib: T.rang[l], val: e.rang ? `${rang(e.rang, l)}${e.effectif ? ` / ${e.effectif}` : ''}` : '—' },
  ];
}

/** Libellé de signataire : principal (+ ligne anglaise en bilingue). */
export function libSignataire(s, lang) { return txt(s?.titre, lang); }

/** Sceau doré : étoile de rayons, anneau de texte, moyenne au centre. Renvoie un <svg>. */
export function sceauDore(doc, { taille = 34, rubans = true, texteAnneau = true } = {}) {
  const p = doc.palette; const id = uid('sc');
  const n = 56, R = 50, r = 46;
  const pts = Array.from({ length: n * 2 }, (_, i) => {
    const a = (Math.PI * i) / n, rr = i % 2 ? r : R;
    return `${(60 + rr * Math.sin(a)).toFixed(2)},${(60 - rr * Math.cos(a)).toFixed(2)}`;
  }).join(' ');
  const l = doc.lang === 'en' ? 'en' : 'fr';
  // Anneau : le titre du NIVEAU (Tableau d'honneur, Encouragements, Félicitations) + Excellence.
  const anneau = `${titre(doc).principal} • EXCELLENCE •`;
  const ruban = rubans ? `<path d="M44 92 L36 128 L46 121 L52 130 L56 96 Z" fill="${p.fonce}"/><path d="M76 92 L84 128 L74 121 L68 130 L64 96 Z" fill="${p.fonce}"/>` : '';
  return `<svg viewBox="0 0 120 132" style="width:${taille}mm;height:${taille * 1.1}mm;overflow:visible">
    <defs>
      <linearGradient id="${id}o" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.orClair}"/><stop offset=".5" stop-color="${p.or}"/><stop offset="1" stop-color="${p.orFonce}"/></linearGradient>
      <path id="${id}t" d="M60,60 m-31,0 a31,31 0 1,1 62,0 a31,31 0 1,1 -62,0"/>
    </defs>
    ${ruban}
    <polygon points="${pts}" fill="url(#${id}o)"/>
    <circle cx="60" cy="60" r="40" fill="${p.fonce}" stroke="${p.orClair}" stroke-width="1.2"/>
    ${texteAnneau ? `<text font-family="Poppins" font-weight="600" font-size="6.4" letter-spacing="1.1" fill="${p.orClair}"><textPath href="#${id}t">${esc(anneau)}</textPath></text>` : ''}
    <circle cx="60" cy="60" r="24" fill="none" stroke="${p.or}" stroke-width=".6"/>
    <text x="60" y="63" text-anchor="middle" font-family="Cinzel" font-weight="700" font-size="15" fill="${p.orClair}">${esc(nombre(doc.eleve.moyenne20, l))}</text>
    <text x="60" y="73" text-anchor="middle" font-family="Poppins" font-weight="600" font-size="5.2" fill="#fff">${esc(T.sur20[l])}</text>
  </svg>`;
}

/** Nom pour une écriture CALLIGRAPHIÉE : les mots tout en capitales (« ATANGANA ») deviennent
 *  « Atangana » — des capitales en Great Vibes sont illisibles. Les autres mots sont gardés. */
export function nomCalligraphie(nom) {
  return String(nom || '').split(/(\s+|-)/).map((w) => (w.length > 1 && w === w.toUpperCase() && w !== w.toLowerCase()
    ? w.charAt(0) + w.slice(1).toLowerCase() : w)).join("");
}

/** Feuille A4 (paysage par défaut) prête à être capturée. */
export function feuille(contenu, { paysage = true, fond = '#fff' } = {}) {
  const [w, h] = paysage ? [297, 210] : [210, 297];
  return `<div class="hon-page" data-orientation="${paysage ? 'landscape' : 'portrait'}" style="position:relative;width:${w}mm;height:${h}mm;overflow:hidden;background:${fond};box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact">${contenu}</div>`;
}

export { T, txt, esc, nombre, rang, periode };
