// Génération des cartes scolaires (étudiant) au format imprimable A4.
// Une carte = nom, classe, matricule, photo, QR Code, identifiant unique.
// Le design varie selon l'école (cf. schoolTheme.js).

import QRCode from 'qrcode';
import { getSchoolTheme, shapeToRadius } from './schoolTheme';
import { resolveCountryCode } from '../countries';
import { signedUrl } from './storage';

// Drapeaux SVG inline — rendu fiable cross-OS (Windows ne dessine pas les
// emojis-drapeaux). Dimensions normalisées 30 × 20 (ratio 3:2).
const FLAGS_SVG = {
  // Cameroun : 3 bandes verticales vert / rouge / jaune avec étoile jaune.
  cameroon_fr: `
    <svg width="30" height="20" viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg">
      <rect x="0"  y="0" width="10" height="20" fill="#007a5e"/>
      <rect x="10" y="0" width="10" height="20" fill="#ce1126"/>
      <rect x="20" y="0" width="10" height="20" fill="#fcd116"/>
      <polygon points="15,7 16.18,10.41 19.76,10.41 16.79,12.59 17.97,16 15,13.82 12.03,16 13.21,12.59 10.24,10.41 13.82,10.41"
               fill="#fcd116" stroke="#fcd116" stroke-width="0.2"/>
    </svg>`,
  cameroon_en: `
    <svg width="30" height="20" viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg">
      <rect x="0"  y="0" width="10" height="20" fill="#007a5e"/>
      <rect x="10" y="0" width="10" height="20" fill="#ce1126"/>
      <rect x="20" y="0" width="10" height="20" fill="#fcd116"/>
      <polygon points="15,7 16.18,10.41 19.76,10.41 16.79,12.59 17.97,16 15,13.82 12.03,16 13.21,12.59 10.24,10.41 13.82,10.41"
               fill="#fcd116" stroke="#fcd116" stroke-width="0.2"/>
    </svg>`,
  // Guinea Ecuatorial : 3 bandes horizontales vert / blanc / rouge + triangle bleu côté hampe.
  guinea_eq: `
    <svg width="30" height="20" viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0"  width="30" height="6.67" fill="#3e9a00"/>
      <rect x="0" y="6.67" width="30" height="6.67" fill="#ffffff"/>
      <rect x="0" y="13.33" width="30" height="6.67" fill="#e32118"/>
      <polygon points="0,0 0,20 7,10" fill="#0073ce"/>
    </svg>`,
};

function flagSvgFor(countryCode) {
  return FLAGS_SVG[countryCode] || FLAGS_SVG.cameroon_fr;
}

function countryHeaderText(countryCode) {
  switch (countryCode) {
    case 'cameroon_fr': return 'République du Cameroun';
    case 'cameroon_en': return 'Republic of Cameroon';
    case 'guinea_eq':   return 'República de Guinea Ecuatorial';
    default:            return '';
  }
}

// Identifiant carte = UUID court dérivé de school_id + student_id.
// Sert aussi de payload QR (URL parent portal compatible si configurée).
export function buildCardId(schoolId, studentId) {
  return `NC-${String(schoolId || '').slice(0, 4)}-${String(studentId || '').slice(0, 8)}`.toUpperCase();
}

export async function qrDataUrl(payload) {
  return QRCode.toDataURL(payload, {
    margin: 1,
    width: 240,
    color: { dark: '#111111', light: '#ffffff' },
  });
}

// Convertit une URL d'image (distante ou locale) en data-URL, UNE seule fois,
// EN LA REDIMENSIONNANT à une taille raisonnable.
//
// Pourquoi : html-to-image ré-télécharge et ré-encode chaque <img> à CHAQUE
// capture de carte. Sur des photos/logos Supabase distants → un fetch réseau
// par carte, et si le serveur n'expose pas les en-têtes CORS le canvas devient
// « tainted » → toPng lève une exception et tout l'export échoue.
// SURTOUT : une photo de téléphone (4000×3000, plusieurs Mo) embarquée en
// pleine résolution puis re-rasterisée à chaque carte sature la mémoire — c'est
// la cause des échecs sur un lot (ex. 24 cartes). On la réduit donc à `maxDim`
// (elle ne s'affiche qu'en ~110×130 px sur la carte).
//
// Le redimensionnement passe par un blob same-origin → canvas NON contaminé.
// En cas d'échec on renvoie `null` (l'appelant retombe sur un repli/placeholder)
// plutôt que de réintroduire une URL distante qui ferait planter la capture.
const _imgDataUrlCache = new Map();

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => resolve(null);
    fr.readAsDataURL(blob);
  });
}

export function imageToDataUrl(url, { maxDim = 700, quality = 0.85 } = {}) {
  if (!url) return Promise.resolve(null);
  const cacheKey = `${url}|${maxDim}|${quality}`;
  if (_imgDataUrlCache.has(cacheKey)) return _imgDataUrlCache.get(cacheKey);

  const p = (async () => {
    try {
      // Récupère les octets (blob). Pour un data-URL on le relit tel quel afin
      // de pouvoir le redimensionner lui aussi.
      let blob;
      if (url.startsWith('data:')) {
        blob = await (await fetch(url)).blob();
      } else {
        // Asset `school-assets` → résout une URL SIGNÉE (fonctionne bucket privé) ;
        // sinon (logo distant…) `signedUrl` renvoie l'URL telle quelle.
        const fetchUrl = await signedUrl(url);
        const res = await fetch(fetchUrl, { mode: 'cors', cache: 'force-cache' });
        if (!res.ok) return null;
        blob = await res.blob();
      }

      // Décode puis redimensionne via canvas (blob = same-origin → pas de taint).
      const bmp = await createImageBitmap(blob).catch(() => null);
      if (!bmp) return blobToDataUrl(blob); // pas de resize possible → brut

      const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * scale));
      const h = Math.max(1, Math.round(bmp.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bmp, 0, 0, w, h);
      bmp.close?.();

      // PNG/WebP → on garde le PNG (transparence : logos, cachets, signatures).
      // JPEG → on ré-encode en JPEG (photos) : bien plus léger.
      const keepAlpha = blob.type === 'image/png' || blob.type === 'image/webp';
      return canvas.toDataURL(keepAlpha ? 'image/png' : 'image/jpeg', quality);
    } catch {
      return null; // réseau/CORS/décodage KO → repli silencieux
    }
  })();

  _imgDataUrlCache.set(cacheKey, p);
  return p;
}

// HTML d'une carte unique — utilisé en boucle pour l'impression en lot.
function singleCardHtml({ student, school, className, theme, cardId, qrSrc, countryCode }) {
  const photo = student.photo_url
    ? `<img src="${student.photo_url}" alt="" />`
    : `<svg class="photo-placeholder" viewBox="0 0 24 24" fill="#9ca3af"><path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5z"/></svg>`;
  const radius = shapeToRadius(theme.cardShape);
  const header =
    theme.headerStyle === 'gradient'
      ? `background:linear-gradient(135deg, ${theme.palette.primary}, ${theme.palette.accent})`
      : theme.headerStyle === 'doubleBorder'
      ? `background:${theme.palette.primary};border-bottom:3px double ${theme.palette.accent}`
      : theme.headerStyle === 'sideBand'
      ? `background:${theme.palette.primary};border-left:6px solid ${theme.palette.accent}`
      : `background:${theme.palette.primary}`;
  return `
    <div class="card" style="border-radius:${radius};border:1px solid ${theme.palette.primary}33">
      <div class="card-header" style="${header}">
        <div class="flag">${flagSvgFor(countryCode)}</div>
        ${school?.logo_url ? `<img class="logo" src="${school.logo_url}"/>` : ''}
        <div class="school-block">
          <div class="country-line">${countryHeaderText(countryCode)}</div>
          <div class="school-name">${school?.name || ''}</div>
          <div class="school-sub">${school?.address || ''}</div>
        </div>
      </div>
      <div class="card-body">
        <div class="photo" style="border-color:${theme.palette.accent}">${photo}</div>
        <div class="info">
          <div class="row"><strong>${student.name || ''}</strong></div>
          <div class="row"><span>${className || ''}</span></div>
          <div class="row"><span>${countryCode === 'guinea_eq' ? 'Matr.' : 'Mat.'} ${student.matricule || '—'}</span></div>
          <div class="row"><span class="card-id">${cardId}</span></div>
        </div>
        <div class="qr"><img src="${qrSrc}" alt="QR"/></div>
      </div>
      <div class="card-footer" style="background:${theme.palette.soft};color:${theme.palette.primary}">
        ${school?.current_year || ''} · ${school?.phone || ''}
      </div>
    </div>
  `;
}

// Imprime les cartes scolaires de plusieurs élèves dans un seul document A4.
// Disposition : 2 colonnes × 5 lignes (10 cartes par page format CR80 ratio).
export async function printIdCards({ students, school, classNameById }) {
  if (!students?.length) return;
  const theme = getSchoolTheme(school);
  const countryCode = resolveCountryCode(school);

  // QR : encode l'identifiant carte (offline-safe). En présence d'un parent
  // portal, on pourrait remplacer par l'URL token, mais on garde l'ID local.
  const cards = [];
  for (const s of students) {
    const cardId = buildCardId(school?.id, s.id);
    const qrSrc  = await qrDataUrl(cardId);
    const className = classNameById?.(s.class_id) || '';
    cards.push(singleCardHtml({ student: s, school, className, theme, cardId, qrSrc, countryCode }));
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <title>${countryCode === 'guinea_eq' ? 'Carnés escolares' : 'Cartes scolaires'} — ${school?.name || 'École'}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color:#111; background:#f5f5f5; padding:12mm; }
    .grid { display:grid; grid-template-columns: 1fr 1fr; gap:8mm; }
    .card { background:#fff; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,0.08); page-break-inside:avoid; height:48mm; display:flex; flex-direction:column; }
    .card-header { color:#fff; padding:4mm 5mm; display:flex; align-items:center; gap:6px; }
    .card-header .logo { width:24px; height:24px; object-fit:contain; background:#fff; border-radius:4px; padding:2px; }
    .card-header .flag { width:30px; height:20px; flex-shrink:0; box-shadow:0 0 0 1px rgba(255,255,255,0.4); border-radius:1px; overflow:hidden; }
    .card-header .flag svg { display:block; }
    .card-header .school-block { flex:1; min-width:0; }
    .card-header .country-line { font-size:8px; opacity:0.85; font-style:italic; line-height:1; margin-bottom:1px; }
    .card-header .school-name { font-size:11px; font-weight:700; line-height:1.1; }
    .card-header .school-sub { font-size:8px; opacity:0.85; }
    .card-body { flex:1; display:flex; padding:3mm 5mm; align-items:center; gap:5mm; }
    .photo { width:22mm; height:22mm; border-radius:50%; border:2px solid; overflow:hidden; flex-shrink:0; background:#f3f4f6; display:flex; align-items:center; justify-content:center; }
    .photo img { width:100%; height:100%; object-fit:cover; }
    .photo .photo-placeholder { width:62%; height:62%; }
    .info { flex:1; line-height:1.4; }
    .info .row strong { font-size:11px; }
    .info .row span { font-size:9px; color:#444; }
    .info .card-id { font-family:monospace; font-size:8px; color:#666; }
    .qr { width:18mm; height:18mm; }
    .qr img { width:100%; height:100%; }
    .card-footer { padding:1.5mm 5mm; font-size:9px; text-align:center; font-weight:600; }
    @media print {
      @page { size:A4; margin:10mm; }
      body { background:#fff; padding:0; }
      .grid { gap:6mm; }
    }
  </style>
  </head><body>
    <div class="grid">${cards.join('')}</div>
    <script>window.onload = () => setTimeout(() => window.print(), 250);</script>
  </body></html>`;

  const win = window.open('', '_blank', 'width=900,height=1200');
  if (!win) {
    alert('Veuillez autoriser les pop-ups pour imprimer les cartes.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
