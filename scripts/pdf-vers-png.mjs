// Rastérise la page 1 de chaque PDF d'un dossier en PNG (pour LIRE le résultat). node scripts/pdf-vers-png.mjs <dossier>
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { startServer, openRasterizer, rasterize } = await import('./lib/print-harness.mjs');
const dir = process.argv[2];
const { server, port } = await startServer();
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const r = await openRasterizer(browser, port);
for (const f of readdirSync(dir).filter((x) => x.endsWith('.pdf'))) {
  writeFileSync(join(dir, f.replace(/\.pdf$/, '.png')), await rasterize(r, readFileSync(join(dir, f)), 1, 1.4));
}
await browser.close(); server.close();
