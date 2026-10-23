// UNE DEMANDE DE RÉFÉRENTIEL NE DOIT PLUS SE PERDRE
//
// ── CE QUE CE TEST EMPÊCHE DE REVENIR ───────────────────────────────────────
//
// Signalement du 2026-10-23 : « quand on essaie d'entrer les notes du primaire,
// le référentiel se charge sans cesse », avec à l'écran « Chargement du
// référentiel primaire APC… » qui ne partait jamais.
//
// L'écran demande son référentiel à son montage ; `schoolId` n'est posé que par
// l'effet de App. React exécute les effets des ENFANTS AVANT ceux des parents :
// sur une arrivée directe sur /app/grades (lien, favori, F5), la demande
// arrivait avec `schoolId` à null, le chargeur repartait sans rien faire, et
// rien ne le rejouait. Ce test fixe les deux moitiés de la parade : on attend
// la valeur, ET on ne l'attend pas indéfiniment.
//
//   node src/core/_attenteValeur.test.mjs
import { attendreValeur } from './attenteValeur.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}${got === undefined ? '' : `  (obtenu: ${JSON.stringify(got)})`}`); }
};
const titre = (t) => console.log(`\n-- ${t} --`);

// Doublure de magasin : `set` prévient les abonnés, comme zustand.
function magasin(valeurInitiale = null) {
  let valeur = valeurInitiale;
  const abonnes = new Set();
  return {
    lire: () => valeur,
    set: (v) => { valeur = v; for (const fn of [...abonnes]) fn(); },
    souscrire: (fn) => { abonnes.add(fn); return () => abonnes.delete(fn); },
    get nbAbonnes() { return abonnes.size; },
  };
}

titre('La valeur est déjà là');
{
  const m = magasin('ecole-1');
  const r = await attendreValeur({ lire: m.lire, souscrire: m.souscrire });
  ok(r === 'ecole-1', 'rend l’école immédiatement', r);
  ok(m.nbAbonnes === 0, 'et ne s’abonne à rien', m.nbAbonnes);
}

titre('La valeur arrive APRÈS la demande — le cas du 2026-10-23');
{
  const m = magasin(null);
  const p = attendreValeur({ lire: m.lire, souscrire: m.souscrire });
  let resolue = false;
  p.then(() => { resolue = true; });
  await Promise.resolve();
  ok(resolue === false, 'tant que l’école est inconnue, on attend');
  ok(m.nbAbonnes === 1, 'un seul abonnement pendant l’attente', m.nbAbonnes);

  m.set('ecole-7');
  const r = await p;
  ok(r === 'ecole-7', 'dès que App a posé l’école, la demande repart', r);
  ok(m.nbAbonnes === 0, 'et l’abonnement est retiré', m.nbAbonnes);
}

titre('Un `set` qui ne porte PAS la valeur ne réveille rien');
{
  const m = magasin(null);
  const p = attendreValeur({ lire: m.lire, souscrire: m.souscrire });
  let resolue = false;
  p.then(() => { resolue = true; });
  m.set(null);                    // le magasin change pour autre chose
  await Promise.resolve();
  ok(resolue === false, 'un changement sans école ne déclenche pas le chargement');
  m.set('ecole-9');
  ok((await p) === 'ecole-9', 'c’est bien l’école qui déclenche');
}

titre('Au bout du délai, on rend null — on n’attend pas pour toujours');
{
  // `planifier` est injecté : le test ne dort pas, il déclenche le délai lui-même.
  let feu = null;
  const m = magasin(null);
  const p = attendreValeur({
    lire: m.lire, souscrire: m.souscrire, delaiMax: 15000,
    planifier: (fn) => { feu = fn; return 1; },
    annuler: () => {},
  });
  ok(typeof feu === 'function', 'un délai est armé');
  feu();
  ok((await p) === null, 'sans école (session expirée, espace parent) : null', await p);
  ok(m.nbAbonnes === 0, 'et plus aucun abonné en vie', m.nbAbonnes);
}

titre('Le délai est désarmé quand l’école arrive');
{
  let annule = 0;
  const m = magasin(null);
  const p = attendreValeur({
    lire: m.lire, souscrire: m.souscrire,
    planifier: () => 42, annuler: (id) => { if (id === 42) annule += 1; },
  });
  m.set('ecole-3');
  await p;
  ok(annule === 1, 'le minuteur est annulé une fois', annule);
}

titre('L’école arrivée ENTRE la lecture et l’abonnement n’est pas perdue');
{
  // Le piège : si on ne relit pas après s’être abonné, on attend le PROCHAIN
  // changement du magasin — qui peut ne jamais venir.
  let valeur = null;
  const p = attendreValeur({
    lire: () => valeur,
    souscrire: () => { valeur = 'ecole-tardive'; return () => {}; },
  });
  ok((await p) === 'ecole-tardive', 'la seconde lecture rattrape la course', await p);
}

titre('Une seule résolution, même si tout arrive en même temps');
{
  let feu = null;
  const m = magasin(null);
  let n = 0;
  const p = attendreValeur({
    lire: m.lire, souscrire: m.souscrire,
    planifier: (fn) => { feu = fn; return 1; }, annuler: () => {},
  });
  p.then(() => { n += 1; });
  m.set('ecole-5');
  feu();              // le délai arrive après coup : il ne doit rien écraser
  m.set('ecole-6');
  ok((await p) === 'ecole-5', 'la première école gagne', await p);
  await Promise.resolve();
  ok(n === 1, 'la promesse ne se résout qu’une fois', n);
}

console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
