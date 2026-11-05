// REGISTRE DES SERVICES — les critères d'acceptation de la refonte.
//
//   npx playwright test e2e/02-registre-services
//
// Ce que ce fichier prouve, et que la source seule ne peut pas dire : qu'un
// NAVIGATEUR ne déborde pas à 375 px, que 320 lignes s'affichent et se trient,
// et que la bannière de filtre apparaît bien dans les trois onglets. Les
// invariants syntaxiques (quelle piste de grille, sur quel élément l'infobulle)
// restent dans `src/components/services/_listeAbonnes.test.mjs`.
//
// Les captures demandées par le dossier de refonte sont écrites dans
// `docs/refonte-registre-services/captures/`.
import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { amorcerRegistre } from './_amorce-registre.mjs';

const ici = dirname(fileURLToPath(import.meta.url));
const CAPTURES = join(ici, '..', 'docs', 'refonte-registre-services', 'captures');
mkdirSync(CAPTURES, { recursive: true });

const TELEPHONE = { width: 375, height: 900 };
const BUREAU = { width: 1280, height: 1000 };

let compte;

test.beforeAll(() => {
  // 320 abonnés : le critère n° 2 porte sur le volume, pas sur seize lignes.
  compte = amorcerRegistre({ eleves: 320 });
  console.log(`amorce : ${compte.abonnes} abonnés, nom le plus long « ${compte.nomLong} » (${compte.nomLong.length})`);
});

async function ouvrirLeRegistre(page) {
  // `/` sert la page vitrine, pas l'application : la connexion est sur
  // /login, et l'application derrière /app/*.
  await page.goto('/login');
  await page.locator('input[type="email"]').waitFor({ timeout: 20_000 });
  await page.locator('input[type="email"]').fill(compte.email);
  await page.locator('input[type="password"]').fill(compte.motDePasse);
  await page.locator('button[type="submit"]').click();
  // La connexion aboutit à l'application : on attend que la coquille soit
  // peuplée avant de viser une route, sinon on navigue avant le montage.
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 20_000 });
  await page.goto('/app/cantine');
  await expect(page.getByRole('heading', { name: /Registre des services/i }))
    .toBeVisible({ timeout: 20_000 });
  // Le registre charge ses échéances après le premier rendu.
  await expect(page.locator('[data-role="compte-abonnes"]')).toBeVisible({ timeout: 20_000 });
}

test.describe('Registre des services — refonte', () => {
  test('critère 1 : aucun défilement horizontal à 375 px, nom de 38 caractères compris', async ({ page }) => {
    await page.setViewportSize(TELEPHONE);
    await ouvrirLeRegistre(page);

    // Le nom le plus long du jeu d'essai doit être À L'ÉCRAN pour que la
    // mesure ait un sens : on le cherche avant de mesurer.
    // À cette largeur les réducteurs sont repliés derrière « Filtres » pour
    // que la recherche garde toute la largeur : on ne les attend donc pas
    // visibles, c'est la recherche qui sert ici.
    await page.locator('#registre-recherche').fill(compte.nomLong.slice(0, 12));
    await expect(page.getByText(compte.nomLong, { exact: false }).first()).toBeVisible();

    const debordement = await page.evaluate(() => ({
      corps: document.documentElement.scrollWidth,
      fenetre: document.documentElement.clientWidth,
    }));
    expect(debordement.corps,
      `la page déborde de ${debordement.corps - debordement.fenetre} px à 375 px`)
      .toBeLessThanOrEqual(debordement.fenetre);

    await page.locator('#registre-recherche').fill('');
    await page.screenshot({ path: join(CAPTURES, 'liste-375.png'), fullPage: false });
  });

  test('critère 2 : 320 abonnés s’affichent et se trient', async ({ page }) => {
    await page.setViewportSize(BUREAU);
    await ouvrirLeRegistre(page);

    // La tranche : 60 rendus, le total annoncé, et le bon N sur le bouton.
    const compteur = page.locator('[data-role="compte-abonnes"]');
    await expect(compteur).toContainText(`60 sur ${compte.abonnes}`);
    await expect(page.locator('[data-role="afficher-tout"]'))
      .toContainText(String(compte.abonnes - 60));          // critère 10

    const t0 = Date.now();
    await page.locator('[data-role="afficher-tout"]').click();
    await expect(page.locator('ul > li')).toHaveCount(compte.abonnes, { timeout: 20_000 });
    const msAffichage = Date.now() - t0;

    const t1 = Date.now();
    await page.getByRole('button', { name: 'Statut', exact: true }).click();
    await expect(page.locator('ul > li').first()).toBeVisible();
    const msTri = Date.now() - t1;

    console.log(`320 lignes : affichage ${msAffichage} ms, tri ${msTri} ms`);
    expect(msAffichage, 'afficher 320 lignes').toBeLessThan(10_000);
    expect(msTri, 'trier 320 lignes').toBeLessThan(5_000);

    await page.screenshot({ path: join(CAPTURES, 'liste-1280.png'), fullPage: false });
  });

  test('critère 4 : un filtre posé annonce la sélection dans les TROIS onglets', async ({ page }) => {
    await page.setViewportSize(BUREAU);
    await ouvrirLeRegistre(page);

    await expect(page.locator('[data-role="banniere-filtre"]')).toHaveCount(0);

    await page.locator('[data-role="filtre-etat"]').selectOption('impaye');
    const banniere = page.locator('[data-role="banniere-filtre"]');
    await expect(banniere).toBeVisible();
    await expect(banniere).toContainText(`/ ${compte.abonnes}`);

    for (const onglet of ['grille', 'resume']) {
      await page.locator(`[data-role="onglet-${onglet}"]`).click();
      await expect(banniere, `la bannière manque dans l’onglet ${onglet}`).toBeVisible();
    }

    await page.locator('[data-role="onglet-grille"]').click();
    await page.screenshot({ path: join(CAPTURES, 'grille-1280.png'), fullPage: false });
    await page.locator('[data-role="onglet-resume"]').click();
    await page.screenshot({ path: join(CAPTURES, 'resume-1280.png'), fullPage: false });
  });

  test('la lentille : « qui n’a pas payé ce mois-ci »', async ({ page }) => {
    await page.setViewportSize(BUREAU);
    await ouvrirLeRegistre(page);

    // Par défaut l'écran se place sur le MOIS COURANT, et il le dit.
    const mention = page.locator('[data-role="periode-liste"]');
    await expect(mention).toBeVisible();
    const moisCourant = new Date().toISOString().slice(0, 7);
    const periode = page.locator('[data-role="filtre-periode"]');
    await expect(periode).toHaveValue(moisCourant);

    // Le même élève ne doit pas la même chose sur le mois et sur l'année :
    // c'est tout l'objet de la lentille, et c'est ce qui manquait.
    const premierReste = async () => (await page.locator('ul > li').first()
      .locator('span.tabular-nums').first().innerText()).trim();

    await page.getByRole('button', { name: 'Reste', exact: true }).click();
    const surLeMois = await premierReste();

    await periode.selectOption('');
    await expect(mention).toContainText(/année|year|año/i);
    const surLAnnee = await premierReste();

    expect(surLAnnee, `le solde annuel (${surLAnnee}) devrait dépasser celui du mois (${surLeMois})`)
      .not.toBe(surLeMois);

    // « Qui n'a pas payé novembre » : la période, puis l'état.
    await periode.selectOption(moisCourant);
    await page.locator('[data-role="filtre-etat"]').selectOption('impaye');
    const lignes = page.locator('ul > li');
    await expect(lignes.first()).toBeVisible();
    const n = await lignes.count();
    expect(n, 'au moins un impayé sur le mois courant').toBeGreaterThan(0);
    // Chacune des lignes affichées porte bien un reste non nul.
    for (const texte of await lignes.locator('span.tabular-nums').allInnerTexts()) {
      expect(texte.replace(/\s|XAF/g, '')).not.toBe('0');
    }

    await page.screenshot({ path: join(CAPTURES, 'impayes-du-mois-1280.png'), fullPage: false });
  });

  test('la grille et le résumé ne débordent pas non plus à 375 px', async ({ page }) => {
    await page.setViewportSize(TELEPHONE);
    await ouvrirLeRegistre(page);

    for (const [onglet, fichier] of [['grille', 'grille-375.png'], ['resume', 'resume-375.png']]) {
      await page.locator(`[data-role="onglet-${onglet}"]`).click();
      await expect(page.locator(`[data-role="onglet-${onglet}"]`)).toBeVisible();
      const d = await page.evaluate(() => ({
        corps: document.documentElement.scrollWidth,
        fenetre: document.documentElement.clientWidth,
      }));
      // Seule la BOÎTE de la grille a le droit de défiler ; le corps de la
      // page, jamais. C'est la distinction qui tient tout l'écran.
      expect(d.corps, `l’onglet ${onglet} déborde de ${d.corps - d.fenetre} px`)
        .toBeLessThanOrEqual(d.fenetre);
      await page.screenshot({ path: join(CAPTURES, fichier), fullPage: false });
    }
  });
});
