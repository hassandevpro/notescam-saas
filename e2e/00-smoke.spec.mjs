// FUMEE — le serveur LAN sert-il une application utilisable ?
//
// Ces trois tests ne demandent aucun compte ni aucune ecole : ils verifient ce
// qui doit etre vrai sur une installation NEUVE, avant toute saisie. S'ils
// echouent, aucun autre test de parcours n'a de sens.
import { test, expect } from '@playwright/test';

test('le serveur repond et sert la coquille de l application', async ({ page }) => {
  const reponse = await page.goto('/');
  expect(reponse?.status(), 'le serveur LAN doit repondre 200 sur /').toBe(200);
  // L'application est une SPA : la coquille porte le point de montage React.
  await expect(page.locator('#root')).toBeAttached();
});

test('une installation neuve mene a un ecran d entree, pas a une page blanche', async ({ page }) => {
  await page.goto('/');
  // On n'impose pas le libelle exact (il depend de la langue et de l'edition) :
  // on exige qu'il y ait quelque chose d'actionnable a l'ecran.
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 15_000 });
  const actionnable = page.locator('button, input, a[href]');
  await expect(actionnable.first()).toBeVisible({ timeout: 15_000 });
});

test('aucune erreur de console au premier chargement', async ({ page }) => {
  const erreurs = [];
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
  page.on('pageerror', (e) => erreurs.push(String(e)));

  await page.goto('/');
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 15_000 });

  // Le service worker et les polices peuvent bruiter hors ligne : on ne retient
  // que ce qui vient du code applicatif.
  const vraies = erreurs.filter((e) => !/service.?worker|favicon|font|manifest/i.test(e));
  expect(vraies, `erreurs de console :\n${vraies.join('\n')}`).toEqual([]);
});
