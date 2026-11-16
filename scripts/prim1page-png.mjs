// Rastérise les PDF d'essai en PNG (pdf.js dans Chrome) pour comparaison visuelle.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { startServer, openRasterizer, rasterize } from './lib/print-harness.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const dir = process.argv[2]; const noms = process.argv.slice(3);
const { server, port } = await startServer();
const browser = await chromium.launch({ channel: 'chrome' });
const r = await openRasterizer(browser, port);
for (const n of noms) {
  const png = await rasterize(r, readFileSync(`${dir}/${n}.pdf`), 1, 1.6);
  writeFileSync(`${dir}/${n}.png`, png); console.log(n + '.png');
}
await browser.close(); server.close();
