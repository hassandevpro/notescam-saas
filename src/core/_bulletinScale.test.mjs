// LE BARÈME D'UN BULLETIN VIENT DE LA CLASSE, PAS DE SA LANGUE.
//
// Mesuré chez THE GENIUS le 2026-10-26 : FORM1 et FORM2 sont anglophones
// (matières saisies en anglais, programme bilingue spécial) mais portaient
// `system = 'FR'` — bulletin en français. Les basculer en 'EN' aurait multiplié
// les notes par 5, parce que les cinq bulletins classiques déduisaient le
// barème de la LANGUE. Ce test verrouille la séparation des deux.
//
// Lancer : node src/core/_bulletinScale.test.mjs
import { bulletinScale, BAREME_DEFAUT_FR, BAREME_DEFAUT_EN, BAREME_DEFAUT_ES } from './bulletinScale.js';

let failed = false;
const ok = (cond, msg, extra) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}${cond || extra === undefined ? '' : ` — ${JSON.stringify(extra)}`}`);
  if (!cond) failed = true;
};

// ── Ce qui ne doit RIEN changer : la classe ne dit rien ───────────────────────
{
  const fr = bulletinScale({}, 'FR');
  ok(fr.maxScale === 20 && fr.passThreshold === 10, 'FR sans grade_max → /20, seuil 10', fr);
  const en = bulletinScale({}, 'EN');
  ok(en.maxScale === 100 && en.passThreshold === 50, 'EN sans grade_max → /100, seuil 50', en);
  ok(bulletinScale(null, 'FR').maxScale === BAREME_DEFAUT_FR, 'classe absente → défaut du système');
  ok(bulletinScale({ grade_max: null }, 'EN').maxScale === BAREME_DEFAUT_EN, 'grade_max nul → défaut du système');
  ok(bulletinScale({}, 'ES').maxScale === BAREME_DEFAUT_ES,
     'ES sans réglage → /10, le défaut du pays (et non /100)', bulletinScale({}, 'ES'));
  ok(bulletinScale({}, undefined).maxScale === 20, 'système absent → /20');
}

// ── … et la classe qui dit son barème est enfin écoutée ───────────────────────
{
  // Le cas FORM1/FORM2 une fois correctement réglées : anglophones ET /20.
  const form = bulletinScale({ grade_max: 20 }, 'EN');
  ok(form.maxScale === 20, 'classe anglophone notée /20 : le bulletin sort /20', form);
  ok(form.passThreshold === 10, '… et le seuil suit le barème, pas la langue', form);

  const dix = bulletinScale({ grade_max: 10 }, 'FR');
  ok(dix.maxScale === 10 && dix.passThreshold === 5, 'classe /10 → seuil 5', dix);

  const cent = bulletinScale({ grade_max: 100 }, 'FR');
  ok(cent.maxScale === 100 && cent.passThreshold === 50, 'classe francophone /100 → seuil 50', cent);
}

// ── Valeurs aberrantes : on retombe sur le défaut plutôt que d'imprimer faux ──
{
  ok(bulletinScale({ grade_max: 0 }, 'FR').maxScale === 20, 'grade_max = 0 → défaut (division impossible)');
  ok(bulletinScale({ grade_max: -20 }, 'FR').maxScale === 20, 'grade_max négatif → défaut');
  ok(bulletinScale({ grade_max: 'abc' }, 'EN').maxScale === 100, 'grade_max illisible → défaut');
  ok(bulletinScale({ grade_max: '20' }, 'EN').maxScale === 20, 'grade_max en texte : lu comme un nombre');
}

// ── GUINÉE ÉQUATORIALE : le barème est un réglage D'ÉCOLE, pas une langue ────
// Les cinq bulletins classiques imprimaient une classe ES sur /100 alors que la
// même page déclarait admis à 5 (`geGradeMax(school) / 2`). Le barème ES suit
// désormais le pays : /10, ou /20 si l'école l'a réglé — et `grade_max` passe
// devant les deux, comme pour tout le monde.
{
  const dix = bulletinScale({}, 'ES', 10);
  ok(dix.maxScale === 10 && dix.passThreshold === 5, 'ES réglée /10 → seuil 5', dix);
  const vingt = bulletinScale({}, 'ES', 20);
  ok(vingt.maxScale === 20 && vingt.passThreshold === 10, 'ES réglée /20 → seuil 10', vingt);
  ok(bulletinScale({ grade_max: 15 }, 'ES', 20).maxScale === 15,
     'la classe passe devant le réglage d\'école, comme devant la langue');
  ok(bulletinScale({}, 'ES', 0).maxScale === BAREME_DEFAUT_ES,
     'réglage absurde (0) → défaut du pays, jamais une division par zéro');
  ok(bulletinScale({}, 'ES', undefined).maxScale === BAREME_DEFAUT_ES,
     'réglage non transmis → défaut du pays');
  // Le troisième argument ne concerne QUE ES : il ne doit pas déborder.
  ok(bulletinScale({}, 'FR', 10).maxScale === 20, 'une classe FR ignore le réglage ES');
  ok(bulletinScale({}, 'EN', 10).maxScale === 100, 'une classe EN ignore le réglage ES');
}

// ── UNE SEULE RÈGLE : `classScale` dit exactement la même chose ──────────────
// `classScale(cls, school)` (src/lib/useCountry.js) existait avant ce module et
// disait déjà la règle ; elle délègue ici désormais. On rejoue sa table de vérité
// d'origine pour prouver qu'aucune école ne voit son barème changer par la
// délégation elle-même. Le module de `classScale` importe React, donc on ne
// l'appelle pas ici : on compare à ce qu'il renvoyait, écrit à la main.
{
  const avant = (cls, geMax) => {
    const explicit = Number(cls?.grade_max);
    if (explicit > 0) return explicit;
    const sys = cls?.system || 'FR';
    if (sys === 'ES') return geMax;
    return sys === 'EN' ? 100 : 20;
  };
  const cas = [
    [{ system: 'FR' }, 10], [{ system: 'EN' }, 10], [{ system: 'ES' }, 10],
    [{ system: 'ES' }, 20], [{ system: 'ES', grade_max: 15 }, 10],
    [{ system: 'EN', grade_max: 20 }, 10], [{ system: 'FR', grade_max: 10 }, 20],
    [{}, 10], [null, 10],
  ];
  for (const [cls, geMax] of cas) {
    const attendu = avant(cls, geMax);
    const obtenu  = bulletinScale(cls, cls?.system, geMax).maxScale;
    ok(obtenu === attendu,
       `classScale(${JSON.stringify(cls)}, ge=${geMax}) inchangé → /${attendu}`,
       { attendu, obtenu });
  }
}

console.log(failed ? '\n❌ échec' : '\n✅ tout passe');
process.exit(failed ? 1 : 0);
