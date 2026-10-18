// Tests de parcours (E2E) — NotesCam
//
//   npx playwright test                 # tout
//   npx playwright test e2e/00-smoke    # un fichier
//   npx playwright test --headed        # en voyant le navigateur
//
// CIBLE : l'edition LAN, jamais le Cloud. Deux raisons, dans cet ordre :
//
//   1. SURETE. Il n'existe aujourd'hui aucun environnement de recette separe :
//      la recette se fait dans le projet Supabase de PRODUCTION (risque R2 de
//      PROJECT_STATUS.md). Un test E2E qui se connecterait au Cloud ecrirait
//      donc dans les donnees d'ecoles reelles. C'est exclu.
//   2. ISOLATION. Le serveur LAN accepte `NOTESCAM_DATA_DIR` : chaque execution
//      part d'une base SQLite neuve, jetee ensuite. Aucun etat partage entre
//      deux executions, aucune donnee d'ecole en jeu.
//
// Prerequis : `npm run build:lan` (le serveur sert `dist/`).
import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.E2E_PORT || 8099);
const BASE = process.env.E2E_BASE_URL || `http://127.0.0.1:${PORT}`;

// Garde-fou : refuse de demarrer contre autre chose qu'une machine locale. Une
// faute de frappe dans E2E_BASE_URL ne doit pas pouvoir viser la production.
const hote = new URL(BASE).hostname;
const LOCAL = ['127.0.0.1', 'localhost', '::1', '[::1]'];
if (!LOCAL.includes(hote)) {
  throw new Error(
    `E2E refuse : « ${hote} » n'est pas une machine locale. Ces tests ecrivent des ` +
    `donnees et ne doivent jamais viser un serveur partage ni la production. ` +
    `Hotes autorises : ${LOCAL.join(', ')}.`,
  );
}

// Base SQLite neuve par execution : jamais celle du poste de developpement.
const DONNEES = process.env.E2E_DATA_DIR || mkdtempSync(join(tmpdir(), 'notescam-e2e-'));

export default defineConfig({
  testDir: './e2e',
  // Genereux a dessein : le premier demarrage sur une base SQLite NEUVE applique
  // tout le schema (mesure le 2026-10-18 : plus de 70 colonnes ajoutees, several
  // secondes), et le poste de developpement est sous Windows.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,          // un seul serveur, une seule base : pas de parallelisme
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'node server/index.js',
    url: `${BASE}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Sans cela, un serveur qui refuse de demarrer echoue en silence et l'on ne
    // voit que des `page.goto` en depassement de delai.
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      PORT: String(PORT),
      HOST: '127.0.0.1',          // jamais 0.0.0.0 : le test n'expose rien au LAN
      NOTESCAM_DATA_DIR: DONNEES,
    },
  },
});
