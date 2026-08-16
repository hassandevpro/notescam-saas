// ─────────────────────────────────────────────────────────────────────────────
// Banc d'essai d'impression — outillage partagé par les scripts de test.
// ─────────────────────────────────────────────────────────────────────────────
// Chaîne complète, celle qui compte : HTML → Chrome → PDF → rastérisation →
// analyse de pixels. On ne juge JAMAIS un document sur son apparence à l'écran.
//
// La rastérisation se fait avec pdf.js DANS Chrome (le PDF est rendu sur un
// canvas, puis capturé) : pas de dépendance système type poppler, et c'est le
// même moteur que celui qui affichera le PDF chez l'utilisateur.

import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, join, resolve as resolvePath } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const ROOT = resolvePath(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
export const OUT_DIR = join(ROOT, '.print-tests');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.map': 'application/json', '.pdf': 'application/pdf',
};

/** Sert le dépôt en HTTP (pdf.js doit être chargé en module, pas en file://). */
export function startServer() {
  return new Promise((res) => {
    const server = createServer((req, rep) => {
      const path = decodeURIComponent(req.url.split('?')[0]);
      const file = join(ROOT, path);
      if (!file.startsWith(ROOT) || !existsSync(file)) { rep.writeHead(404); rep.end('404'); return; }
      rep.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      rep.end(readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => res({ server, port: server.address().port }));
  });
}

export function ensureOutDir() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  return OUT_DIR;
}

/** Écrit un document HTML de test et renvoie son URL servie. */
export function writeDoc(name, html, port) {
  ensureOutDir();
  writeFileSync(join(OUT_DIR, `${name}.html`), html, 'utf8');
  return `http://127.0.0.1:${port}/.print-tests/${name}.html`;
}

// ── Rastérisation ────────────────────────────────────────────────────────────
const RASTER_PAGE = `<!doctype html><meta charset="utf-8"/><body style="margin:0">
<script type="module">
import * as pdfjs from '/node_modules/pdfjs-dist/build/pdf.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs';
window.__raster = async (b64, pageNo, scale) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const page = await doc.getPage(pageNo);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp, background: 'transparent' }).promise;
  return canvas.toDataURL('image/png');
};
window.__rasterReady = true;
</script></body>`;

/** Ouvre l'onglet de rastérisation (à garder ouvert pour toute la campagne). */
export async function openRasterizer(browser, port) {
  ensureOutDir();
  writeFileSync(join(OUT_DIR, '__raster.html'), RASTER_PAGE, 'utf8');
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/.print-tests/__raster.html`);
  await page.waitForFunction(() => window.__rasterReady === true, null, { timeout: 20000 });
  return page;
}

/** Rastérise une page d'un PDF. `scale` 1 = 72 ppp ; 2 ≈ 144 ppp. */
export async function rasterize(rasterPage, pdfBuffer, pageNo = 1, scale = 1.5) {
  const b64 = Buffer.from(pdfBuffer).toString('base64');
  const dataUrl = await rasterPage.evaluate(
    ([b, n, s]) => window.__raster(b, n, s),
    [b64, pageNo, scale],
  );
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

// ── Analyse de pixels ────────────────────────────────────────────────────────
const sharp = require('sharp');

const NEAR_WHITE = 246;

/**
 * Analyse d'une page rastérisée.
 * @param {Buffer} png
 * @param {object} o
 * @param {number} o.marginMm   marge @page du document
 * @param {number} o.pageWmm    largeur de page
 * @param {number} o.safeMm     bande extérieure qui doit rester vierge (zone non
 *                              imprimable des imprimantes courantes)
 */
export async function analyzePage(png, { marginMm, pageWmm, safeMm = 4 } = {}) {
  const img = sharp(png);
  const meta = await img.metadata();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const pxPerMm = width / pageWmm;

  const at = (x, y) => {
    const i = (y * width + x) * channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const isInk = (x, y) => {
    const [r, g, b] = at(x, y);
    return r < NEAR_WHITE || g < NEAR_WHITE || b < NEAR_WHITE;
  };

  let inkPixels = 0;
  let minY = height, maxY = -1, minX = width, maxX = -1;
  const colors = new Map();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isInk(x, y)) continue;
      inkPixels++;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      const [r, g, b] = at(x, y);
      const key = `${r >> 4}_${g >> 4}_${b >> 4}`;
      colors.set(key, (colors.get(key) || 0) + 1);
    }
  }

  const safePx = Math.round(safeMm * pxPerMm);
  const edgeInk = { top: 0, bottom: 0, left: 0, right: 0 };
  for (let y = 0; y < safePx; y++) for (let x = 0; x < width; x++) if (isInk(x, y)) edgeInk.top++;
  for (let y = height - safePx; y < height; y++) for (let x = 0; x < width; x++) if (isInk(x, y)) edgeInk.bottom++;
  for (let x = 0; x < safePx; x++) for (let y = 0; y < height; y++) if (isInk(x, y)) edgeInk.left++;
  for (let x = width - safePx; x < width; x++) for (let y = 0; y < height; y++) if (isInk(x, y)) edgeInk.right++;

  return {
    width, height, format: meta.format,
    inkPixels,
    inkRatio: inkPixels / (width * height),
    blank: inkPixels < width * height * 0.0004,     // page pratiquement vierge
    bbox: maxY < 0 ? null : { minX, minY, maxX, maxY },
    // Blanc en bas de page (en mm) : une bande énorme sur une page qui n'est pas
    // la dernière trahit une coupure prématurée.
    bottomWhiteMm: maxY < 0 ? pageWmm : (height - maxY) / pxPerMm,
    topWhiteMm: minY >= height ? 0 : minY / pxPerMm,
    edgeInk,
    /** Un aplat de cette couleur est-il présent (tolérance 1/16e par canal) ? */
    hasColor(hex, min = 200) {
      const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      const key = `${r >> 4}_${g >> 4}_${b >> 4}`;
      return (colors.get(key) || 0) >= min;
    },
    colorCount(hex) {
      const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      return colors.get(`${r >> 4}_${g >> 4}_${b >> 4}`) || 0;
    },
  };
}

// ── Petit lanceur de tests ───────────────────────────────────────────────────
export function createRunner() {
  const results = [];
  let group = '';
  return {
    group(name) { group = name; console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 60 - name.length))}`); },
    check(name, ok, detail = '') {
      results.push({ group, name, ok: !!ok, detail });
      console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
      return !!ok;
    },
    get results() { return results; },
    summary() {
      const failed = results.filter((r) => !r.ok);
      console.log(`\n${'═'.repeat(70)}`);
      console.log(`  ${results.length - failed.length}/${results.length} contrôles PASS`);
      if (failed.length) {
        console.log('\n  Échecs :');
        for (const f of failed) console.log(`   · [${f.group}] ${f.name} ${f.detail}`);
      }
      console.log(`${'═'.repeat(70)}\n`);
      return failed.length === 0;
    },
  };
}
