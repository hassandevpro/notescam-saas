// ─────────────────────────────────────────────────────────────────────────────
// SOCLE D'IMPRESSION — briques de mise en page et ouverture de l'impression.
// ─────────────────────────────────────────────────────────────────────────────
// Les blocs partagés par tous les documents officiels vivent ici : feuille,
// en-tête d'État, signature du chef d'établissement, cachet, bloc de
// vérification QR, pied de document. Un générateur (relevé, PV, certificat…)
// n'écrit plus que ce qui lui est propre.
//
// Chaque brique porte un attribut `data-part` : c'est le contrat vérifié par
// les tests (« ce document contient-il bien un QR, une signature, un logo ? »).

import { bulletinOfficials } from '../../countries';
import { bulletinFontFamily } from '../schoolTheme';
import { createDocumentScale, pageDimsPx } from '../documentScale';
import { printCss, pageMetrics, CLASS, DEFAULT_PROFILE, PAGE_PROFILES } from './printStyles';
import { esc, safe, txt, num, EMPTY } from './printValidation';

export { esc, safe, txt, num, EMPTY, CLASS };

// Dimensionnement proportionnel (logo, cachet, signature) — jamais de taille
// en dur : voir docs/DOCUMENT_SCALE_MANAGER.md.
const scaleFor = (profile) => createDocumentScale({
  category: 'standard',
  orientation: PAGE_PROFILES[profile]?.orientation || 'portrait',
  ...pageDimsPx(PAGE_PROFILES[profile]?.orientation || 'portrait'),
});

const L = (sys, fr, en, es) => (sys === 'EN' ? en : sys === 'ES' ? (es || fr) : fr);

// ── Feuille ──────────────────────────────────────────────────────────────────
// Une feuille = UN document, qui démarre toujours sur une page neuve. Sa
// géométrie vient du CSS (classe `nc-sheet`), jamais d'un style inline : un
// style inline gagnerait contre le socle et rétablirait la marge fantôme des
// pages suivantes.
export function sheetOpen({ school, profile = DEFAULT_PROFILE, fontSize = 10, color = '#111', extraClass = '' } = {}) {
  const cls = [CLASS.sheet, extraClass].filter(Boolean).join(' ');
  return `<div class="${cls}" data-profile="${esc(profile)}" style="font-family:${bulletinFontFamily(school)};font-size:${fontSize}px;color:${color}">`;
}
export const SHEET_CLOSE = '</div>';

/** Enveloppe complète : sheetOpen + contenu + fermeture. */
export function sheet(content, opts = {}) {
  return `${sheetOpen(opts)}${content}${SHEET_CLOSE}`;
}

// ── En-tête officiel (République / Ministère / délégations + établissement) ──
export function officialHeaderHtml(school, sys, { profile = DEFAULT_PROFILE } = {}) {
  const S = scaleFor(profile);
  const officials = bulletinOfficials(school);
  const blocks = officials?.blocks ?? [];
  const bilingual = officials?.bilingual && blocks.length > 1;
  const centerW = bilingual ? '34%' : '50%';
  const sideW = bilingual ? '33%' : '50%';

  const block = (b) => b ? `
    <td style="width:${sideW};text-align:center;font-size:9px;line-height:1.45;padding:2px;vertical-align:top">
      <strong>${safe(b.republic, '')}</strong><br/>
      ${safe(b.motto, '')}<br/>————————<br/>
      ${safe(b.ministry, '')}${b.lines?.length ? '<br/>' : ''}
      ${(b.lines || []).map((ln) => safe(ln, '')).join('<br/>')}
      ${b.establishment ? `<br/><strong>${safe(b.establishment, '')}</strong>` : ''}
    </td>` : '';

  const logo = school?.logo_url
    ? `<img data-part="logo" src="${esc(school.logo_url)}" alt="" style="width:${S.logoSm}px;height:${S.logoSm}px;object-fit:contain;display:block;margin:0 auto 3px"/>`
    : '';

  return `
    <table class="${CLASS.keep}" data-part="header" style="width:100%;border-collapse:collapse;margin-bottom:6px">
      <tbody><tr>
        ${block(blocks[0])}
        <td style="width:${centerW};text-align:center;padding:2px;vertical-align:top">
          ${logo}
          <strong style="font-size:12px;display:block">${safe((school?.name || '').toUpperCase(), '')}</strong>
          ${(school?.address || school?.phone) ? `<span style="font-size:8.5px">${school?.address ? 'B.P. ' + safe(school.address, '') : ''}${school?.address && school?.phone ? ' · ' : ''}${safe(school?.phone, '')}</span><br/>` : ''}
          <span style="font-size:8.5px">${L(sys, 'Année scolaire', 'Academic year', 'Año escolar')} : <strong>${safe(school?.current_year)}</strong></span>
        </td>
        ${bilingual ? block(blocks[1]) : ''}
      </tr></tbody>
    </table>`;
}

// ── Titre de document (bandeau à l'encre) ────────────────────────────────────
export function titleBandHtml(text, { background = '#1e3a5f', color = '#fff', fontSize = 12, margin = '0 0 6px' } = {}) {
  return `<div class="${CLASS.ink}" data-part="title" style="background:${background};color:${color};text-align:center;padding:5px 8px;font-weight:bold;font-size:${fontSize}px;letter-spacing:.5px;margin:${margin}">${text}</div>`;
}

// ── Signature du chef d'établissement (+ cachet) ─────────────────────────────
// Standard de mise en page : un seul signataire en pied de document, le chef
// d'établissement, avec son cachet. Bloc SOLIDAIRE : il ne peut jamais être
// coupé entre deux pages.
export function signatureBlockHtml(school, sys, {
  profile = DEFAULT_PROFILE, place = '', date = '', role = null, marginTop = 12, width = 45,
} = {}) {
  const S = scaleFor(profile);
  const sig = school?.signature_url
    ? `<img data-part="signature" src="${esc(school.signature_url)}" alt="" style="height:${S.signatureHeight}px;display:block;margin:2px auto;object-fit:contain;mix-blend-mode:multiply"/>`
    : `<div style="height:${S.signatureHeight}px"></div>`;
  const stamp = school?.stamp_url
    ? `<img data-part="stamp" src="${esc(school.stamp_url)}" alt="" style="height:${S.stamp}px;display:block;margin:-4px auto 2px;object-fit:contain;opacity:.95;mix-blend-mode:multiply"/>`
    : '';
  const dateLine = date
    ? `<div style="margin-bottom:4px">${place
        ? `${L(sys, 'Fait à', 'Done at', 'Hecho en')} ${safe(place, '')}, ${L(sys, 'le', 'on', 'el')} ${safe(date, '')}`
        : `${L(sys, 'Le', 'On', 'El')} ${safe(date, '')}`}</div>`
    : '';

  return `
    <table class="${CLASS.keep}" data-part="signature-block" style="width:100%;border-collapse:collapse;margin-top:${marginTop}px">
      <tbody><tr>
        <td style="width:${100 - width}%"></td>
        <td style="width:${width}%;text-align:center;vertical-align:top;padding:4px 6px;font-size:9px">
          ${dateLine}
          <div style="font-weight:bold;margin-bottom:2px">${role || L(sys, "Le Chef d'établissement", 'The Principal', 'El Director')}</div>
          ${sig}
          ${stamp}
          <div style="border-top:1px solid #94a3b8;margin-top:2px;padding-top:2px;min-height:12px">${safe(school?.director, '')}</div>
        </td>
      </tr></tbody>
    </table>`;
}

// ── Bloc de vérification : QR + code court + mention légale ──────────────────
// Bloc SOLIDAIRE lui aussi : un QR coupé en deux n'est plus lisible par un
// téléphone, et la mention légale perdrait sa valeur.
export function verificationBlockHtml(verification, qrSrc, sys, { docLabel = null } = {}) {
  const label = docLabel || L(sys, 'ce document', 'this document', 'este documento');
  return `
    <table class="${CLASS.keep}" data-part="verification" style="width:100%;border-collapse:collapse;margin-top:10px;border-top:1px dashed #cbd5e1">
      <tbody><tr>
        <td style="width:64px;vertical-align:middle;padding-top:6px">
          ${qrSrc ? `<img data-part="qr" src="${esc(qrSrc)}" alt="QR" style="width:60px;height:60px;display:block"/>` : ''}
        </td>
        <td style="vertical-align:middle;padding:6px 0 0 8px;font-size:8px;color:#475569;line-height:1.4">
          <div><strong>${L(sys, 'Vérification', 'Verification', 'Verificación')} :</strong> <span style="font-family:monospace;font-size:9px">${safe(verification?.code)}</span></div>
          <div style="margin-top:2px;font-style:italic">
            ${L(sys,
              `Scannez le QR code pour vérifier l'authenticité de ${label}. Document non valable sans la signature et le cachet du chef d'établissement.`,
              `Scan the QR code to verify the authenticity of ${label}. Not valid without the signature and stamp of the head of school.`,
              `Escanee el código QR para verificar la autenticidad de ${label}. No válido sin la firma y el sello del director.`)}
          </div>
        </td>
      </tr></tbody>
    </table>`;
}

// ── Pied de document ─────────────────────────────────────────────────────────
export function footerHtml(text, { align = 'center' } = {}) {
  return `<div class="${CLASS.footer}" data-part="footer" style="margin-top:8px;padding-top:4px;border-top:1px solid #e2e8f0;font-size:7.5px;color:#94a3b8;text-align:${align}">${text}</div>`;
}

// ── Document d'impression complet ────────────────────────────────────────────

// Le script d'amorçage attend les IMAGES (logo, cachet, signature, QR) et les
// polices avant d'ouvrir la boîte d'impression. L'ancienne version attendait
// 300 ms en aveugle : sur une connexion lente, ou avec un logo distant, la
// boîte s'ouvrait sur un document incomplet.
// ── Auto-ajustement d'une feuille à sa page ──────────────────────────────────
// Certains documents sont réglementairement d'UNE page (bulletins officiels).
// Quand leur contenu dépasse de peu, la bonne réponse n'est ni de couper ni de
// laisser filer sur une deuxième page presque vide : c'est de réduire la feuille
// juste ce qu'il faut. La réduction est proportionnelle (`zoom`), donc sans
// surprise de recomposition, et la largeur est compensée pour que la page reste
// remplie.
//
// Deux garde-fous : on ne descend jamais sous MIN_SCALE (lisibilité — en dessous,
// un bulletin n'est plus lisible à l'œil nu), et une feuille qui dépasse plus que
// ça continue normalement sur la page suivante, avec les blocs solidaires du
// socle pour que la coupure reste propre.
//
// POURQUOI UNE HAUTEUR IMPOSÉE. Réduire visuellement ne suffit pas : Chrome
// pagine sur la hauteur de la BOÎTE, pas sur son rendu. Une feuille réduite mais
// laissée en hauteur automatique continue de déborder sur la page suivante
// (vérifié : même nombre de pages avec et sans réduction). On fixe donc aussi la
// hauteur de la boîte à la hauteur réduite.
const fitScript = (m) => `
<script>
(function () {
  var CONTENT_W = ${m.contentW};                 // mm — largeur imprimable
  var CONTENT_H = ${Math.floor(m.contentHpx)};   // px CSS — hauteur imprimable
  var MIN_SCALE = 0.86;                          // plancher de lisibilité
  var sheets = document.querySelectorAll('.${CLASS.sheet}');
  for (var i = 0; i < sheets.length; i++) {
    var el = sheets[i];
    // Mesure à la géométrie d'impression : largeur utile, sans marge.
    var w = el.style.width, p = el.style.padding, mh = el.style.minHeight;
    el.style.setProperty('width', CONTENT_W + 'mm', 'important');
    el.style.setProperty('padding', '0', 'important');
    el.style.setProperty('min-height', '0', 'important');
    var h = el.offsetHeight;
    if (h <= CONTENT_H) {
      el.style.width = w; el.style.padding = p; el.style.minHeight = mh;
      el.setAttribute('data-fit', '1');
      continue;
    }
    var s = Math.floor((CONTENT_H / h) * 1000) / 1000;
    if (s < MIN_SCALE) {
      // Trop grand pour être réduit sans devenir illisible : on laisse couler.
      el.style.width = w; el.style.padding = p; el.style.minHeight = mh;
      el.setAttribute('data-fit', 'flow');
      continue;
    }
    el.style.transformOrigin = 'top left';
    el.style.transform = 'scale(' + s + ')';
    el.style.setProperty('width', (CONTENT_W / s) + 'mm', 'important');
    el.style.setProperty('height', Math.ceil(h * s) + 'px', 'important');
    el.style.setProperty('padding', '0', 'important');
    el.style.setProperty('min-height', '0', 'important');
    el.style.overflow = 'hidden';
    el.setAttribute('data-fit', String(s));
  }
})();
</script>`;

export const BOOT_SCRIPT = `
<script>
(function () {
  var FALLBACK_MS = 6000;   // filet : on imprime même si une image ne répond pas
  var fired = false;
  function print() {
    if (fired) return; fired = true;
    setTimeout(function () { try { window.focus(); } catch (e) {} window.print(); }, 80);
  }
  function whenImagesReady() {
    var imgs = Array.prototype.slice.call(document.images).filter(function (i) { return !i.complete; });
    if (!imgs.length) return print();
    var left = imgs.length;
    var done = function () { if (--left <= 0) print(); };
    imgs.forEach(function (i) {
      i.addEventListener('load', done, { once: true });
      i.addEventListener('error', done, { once: true });
    });
    setTimeout(print, FALLBACK_MS);
  }
  function boot() {
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(whenImagesReady, whenImagesReady);
    } else whenImagesReady();
  }
  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
})();
</script>`;

/** Traduit l'ancienne option `orientation` vers un profil de page. */
function resolveProfile({ profile, orientation }) {
  if (profile && PAGE_PROFILES[profile]) return profile;
  if (orientation === 'landscape') return 'large';
  return DEFAULT_PROFILE;
}

/**
 * Document HTML autonome contenant 1..N feuilles, prêt à imprimer.
 * Tout le CSS d'impression vient du socle — aucun générateur n'en ajoute.
 *
 * @param {string[]} sheets
 * @param {string} title
 * @param {object} [opts]
 * @param {'portrait'|'landscape'} [opts.orientation]  compatibilité
 * @param {string} [opts.profile]                      profil de page
 * @param {boolean} [opts.autoPrint=true]              ouvrir la boîte d'impression
 * @param {boolean} [opts.fit=false]                   ajuster les feuilles qui
 *   dépassent de peu (documents d'UNE page par nature : bulletins officiels)
 */
export function buildPrintDocument(sheets, title, opts = {}) {
  const profile = resolveProfile(opts);
  const { autoPrint = true, lang = 'fr', fit = false } = opts;
  return `<!DOCTYPE html><html lang="${esc(lang)}"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<style>${printCss({ profile, screen: true })}</style>
</head>
<body class="nc-print-body">
${(sheets || []).join('\n')}
${fit ? fitScript(pageMetrics(profile)) : ''}
${autoPrint ? BOOT_SCRIPT : ''}
</body></html>`;
}

/** Résultats possibles d'une demande d'impression. */
export const PRINT_RESULT = {
  PRINTED: 'printed',   // la fenêtre est ouverte, la boîte d'impression suit
  BLOCKED: 'blocked',   // pop-up refusé par le navigateur
  EMPTY:   'empty',     // aucune feuille à imprimer
};

/**
 * Ouvre une fenêtre d'impression sur un document HTML complet (l'appelant
 * fournit tout). Point de passage UNIQUE vers `window.open` : c'est ici qu'on
 * détecte le blocage des pop-ups, et nulle part ailleurs.
 * @returns {'printed'|'blocked'}
 */
export function openPrintWindow(html, { width = 980, height = 900 } = {}) {
  const win = window.open('', '_blank', `width=${width},height=${height}`);
  if (!win) return PRINT_RESULT.BLOCKED;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return PRINT_RESULT.PRINTED;
}

/**
 * Ouvre la fenêtre d'impression avec les feuilles fournies.
 * Ne parle PAS à l'utilisateur (pas d'alerte) : c'est à l'atelier appelant de
 * traduire le résultat, dans sa langue, et de le porter au journal.
 *
 * @returns {'printed'|'blocked'|'empty'}
 */
export function printSheets(sheets, title, opts = {}) {
  if (!sheets || !sheets.length) return PRINT_RESULT.EMPTY;
  const profile = resolveProfile(opts);
  const { pageWpx } = pageMetrics(profile);
  return openPrintWindow(buildPrintDocument(sheets, title, opts), { width: Math.round(pageWpx) + 120 });
}

export default {
  sheet, sheetOpen, SHEET_CLOSE, officialHeaderHtml, titleBandHtml,
  signatureBlockHtml, verificationBlockHtml, footerHtml,
  buildPrintDocument, printSheets, PRINT_RESULT,
};
