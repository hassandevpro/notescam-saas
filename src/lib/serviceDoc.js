// ════════════════════════════════════════════════════════════════════════════
// ÉTAT D'UN SERVICE — cantine, transport, internat
// ════════════════════════════════════════════════════════════════════════════
//
// DEUX PORTÉES, et c'est la demande du responsable (2026-10-31) : « en fonction
// du mois et l'année entière ». Ce ne sont pas deux présentations du même
// papier, ce sont deux usages :
//
//  • L'ÉTAT DU MOIS est la feuille qu'on emporte. On la remet à la cantine ou
//    au chauffeur, et elle répond à une seule question : qui est inscrit CE
//    mois-ci, et qui a payé. Une colonne Dû, une colonne Payé, une colonne
//    Reste, un état en mot. Portrait, car huit colonnes y tiennent.
//
//  • L'ÉTAT DE L'ANNÉE est la feuille qu'on classe. Elle montre la GRILLE —
//    un élève par ligne, un mois par colonne — parce que « ATANGANA doit
//    45 000 » ne dit pas si c'est janvier, février et mars, ou trois mois pris
//    au hasard. Paysage, car il y a jusqu'à douze colonnes de mois.
//
// ── POURQUOI UN DOCUMENT DE PLUS, ET PAS `feeSubscribersDoc` ────────────────
//
// `feeSubscribersDoc` existe déjà et reste la bonne pièce pour la liste d'appel
// d'un frais optionnel, avec le dû et le versé de l'ANNÉE en deux colonnes. Ce
// qu'elle ne sait pas faire, c'est le découpage au MOIS — ni la feuille d'un
// mois, ni la grille des douze. Les deux documents ne se remplacent donc pas, et
// rien n'est dupliqué : l'en-tête, la signature et la devise sont les helpers
// partagés de la plateforme.
//
// ── DES SIGNES, PAS DES COULEURS ───────────────────────────────────────────
//
// À l'écran, une case est une pastille de couleur. Sur le papier la couleur ne
// survit pas : les écoles impriment en noir et blanc, et un gris clair pour
// « soldé » et un gris moyen pour « impayé » sont le même gris. Chaque case de
// la grille porte donc un SIGNE lisible sans couleur, et la légende est
// imprimée avec elle.
//
// La règle, elle, n'est pas réécrite ici : c'est `pastilleCellule`, la même
// fonction pure que la grille à l'écran. Un état imprimé qui contredirait
// l'écran serait pire que pas d'état du tout.
//
// ── CE QUI EST IMPRIMÉ PARCE QUE C'EST VÉRIFIABLE ──────────────────────────
//
// Si un filtre est actif, il est ÉCRIT sur le document, avec l'effectif sur
// lequel les totaux portent. Un état partiel qu'on prend pour l'état du service
// entier est un faux chiffre, et il voyage — on le classe, on le recopie.
//
// Aucune donnée en dur : nom, logo, devise, année, directeur viennent de
// `school`. Un montant nul s'imprime « — », jamais 0 : zéro affirme « rien
// n'est dû », le tiret dit « rien à cet endroit », et sur un état de caisse les
// deux ne se confondent pas.
import { officialHeaderHtml, officialSignatureHtml } from './officialDocHeader.js';
import { resolveCountryCode } from '../countries/index.js';
import { formatMoney, currencyCode } from './currency.js';
import { pastilleCellule, motPeriode } from './cantineEngine.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

// Le signe de chaque état, et son nom en légende. L'ordre est celui de la
// légende imprimée : du plus fréquent au plus rare.
export const SIGNES = {
  solde:   { signe: '✔', fr: 'Payé',         en: 'Paid',           es: 'Pagado' },
  partiel: { signe: 'P',      fr: 'Partiel',      en: 'Partial',        es: 'Parcial' },
  impaye:  { signe: '✗', fr: 'Impayé',       en: 'Unpaid',         es: 'Impago' },
  exempte: { signe: 'EX',     fr: 'Exempté',      en: 'Exempt',         es: 'Exento' },
  abandon: { signe: 'AB',     fr: 'Abandon',      en: 'Dropped',        es: 'Abandono' },
  vide:    { signe: '—', fr: 'Non souscrit', en: 'Not subscribed', es: 'No suscrito' },
};

/**
 * Construit l'état imprimable d'un service. Fonction PURE (aucun DOM).
 *
 * @param {object}  o
 * @param {object}  o.school      établissement (nom, logo, devise, année, directeur…)
 * @param {object}  o.service     le service ({ name, quote_part… })
 * @param {Array}   o.entete      [{ period_key, label }] — les mois, dans l'ordre
 * @param {Array}   o.abonnes     [{ name, matricule, className, cellules[], du, paye, reste }]
 * @param {Array}   o.parMois     [{ inscrits, attendu, encaisse, impaye, quotePart, moisSansService }]
 * @param {object}  o.total       { inscrits, attendu, encaisse, impaye, quotePart }
 * @param {string} [o.moisCible]  clé d'un mois ('2026-10') → état DU MOIS ;
 *                                absent → état de L'ANNÉE (la grille)
 * @param {number} [o.quotePart]  taux de quote-part, ou null
 * @param {number} [o.tarifPlein] tarif mensuel plein
 * @param {string} [o.filtre]     libellé du filtre actif, imprimé tel quel
 */
export function buildServiceEtatHtml({
  school, service, entete = [], abonnes = [], parMois = [], total = {},
  moisCible = null, quotePart = null, tarifPlein = null, filtre = '', lang, currency,
}) {
  const isGE = resolveCountryCode(school) === 'guinea_eq';
  const isEn = !isGE && lang === 'anglophone';
  const sys  = isGE ? 'ES' : isEn ? 'EN' : 'FR';
  const t    = (fr, en, es) => (isGE ? (es ?? fr) : isEn ? en : fr);
  const cur  = currency || currencyCode(school);
  const money = (n) => formatMoney(n, cur);
  const sou = (n) => (Number(n) > 0 ? money(n) : '—');
  const nomService = service?.name || t('Service', 'Service', 'Servicio');
  // Le document parle la langue du service : « Par trimestre » pour un
  // transport trimestriel, « Par mois » pour une cantine mensuelle.
  const mot = motPeriode(service, t);

  // Le mois demandé, s'il existe vraiment dans l'en-tête. Une clé inconnue ne
  // produit pas un état vide trompeur : on retombe sur l'année entière, qui est
  // toujours vraie.
  const j = moisCible ? entete.findIndex((e) => e.period_key === moisCible) : -1;
  const parMoisCible = j >= 0 ? (entete[j]?.label || moisCible) : '';
  const mensuel = j >= 0;

  const titre = mensuel
    ? `${t(`État du ${mot.un}`, `${mot.le} statement`, `Estado del ${mot.un}`)} — ${nomService}`
    : `${t('État de l’année', 'Yearly statement', 'Estado del año')} — ${nomService}`;

  const sousTitre = mensuel
    ? `${parMoisCible}${school?.current_year ? ' · ' + school.current_year : ''}`
    : (school?.current_year || '');

  const bandeauFiltre = filtre
    ? `<p class="filtre">${t('Sélection', 'Selection', 'Selección')} : <b>${esc(filtre)}</b> — ${
      t('les totaux ci-dessous ne portent que sur cette sélection, pas sur tout le service.',
        'the totals below cover this selection only, not the whole service.',
        'los totales solo cubren esta selección, no todo el servicio.')}</p>`
    : '';

  const corps = mensuel
    ? corpsDuMois({ entete, abonnes, parMois, j, t, money, sou, esc, quotePart, tarifPlein, nomService, mot })
    : corpsDeLAnnee({ entete, abonnes, parMois, total, t, money, sou, esc, quotePart, tarifPlein, mot });

  return `<!DOCTYPE html><html lang="${isEn ? 'en' : isGE ? 'es' : 'fr'}"><head>
<meta charset="UTF-8">
<title>${esc(titre)}${mensuel ? ' — ' + esc(parMoisCible) : ''}</title>
<style>
  @page { size: A4 ${mensuel ? 'portrait' : 'landscape'}; margin: 9mm 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 9.5px; color: #111; }
  h2 { font-size: 11.5px; margin: 9px 0 4px; text-transform: uppercase; letter-spacing: .4px; }
  .infos { font-size: 9.5px; margin: 3px 0 6px; }
  .filtre { font-size: 9px; border: 1px solid #b45309; color: #7c2d12; padding: 3px 6px; border-radius: 4px; margin: 0 0 6px; }
  .cartes { display: flex; gap: 6px; margin-bottom: 5px; }
  .carte { flex: 1; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 6px; }
  .carte span { display: block; font-size: 8px; text-transform: uppercase; letter-spacing: .4px; color: #475569; }
  .carte b { font-size: 11.5px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #cbd5e1; padding: 2px 4px; }
  thead th { background: #f1f5f9; font-size: 8.5px; text-transform: uppercase; letter-spacing: .3px; }
  tfoot td { background: #f1f5f9; font-weight: 700; }
  .c { text-align: center; } .r { text-align: right; }
  .num { font-variant-numeric: tabular-nums; }
  .mono { font-family: Consolas, monospace; font-size: 8.5px; }
  .du { color: #9f1239; font-weight: 700; } .ok { color: #166534; }
  .vide { padding: 10px; color: #64748b; font-style: italic; }
  .mois { width: 22px; }
  .sig { font-weight: 700; }
  .sig.vide, .sig.exempte, .sig.abandon { color: #64748b; font-weight: 400; }
  .sig.impaye { color: #9f1239; }
  .legende { margin-top: 5px; font-size: 8.5px; color: #334155; }
  .lg { margin-right: 10px; white-space: nowrap; }
  .lg i { display: inline-block; min-width: 14px; text-align: center; font-style: normal;
          font-weight: 700; border: 1px solid #94a3b8; border-radius: 3px; padding: 0 2px; }
  .emarge { width: 70px; }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
</style></head>
<body>
${officialHeaderHtml(school, { sys, title: titre, subtitle: sousTitre })}
${bandeauFiltre}
${corps}
${officialSignatureHtml(school, sys)}
</body></html>`;
}

// ── L'ÉTAT D'UN MOIS : la feuille qu'on emporte ─────────────────────────────
//
// Les élèves NON SOUSCRITS ce mois-là n'y figurent pas. La feuille du mois dit
// qui mange en octobre ; y faire figurer trente lignes « non souscrit » la rend
// illisible pour celui qui fait l'appel. L'effectif est annoncé en clair, de
// sorte que personne ne croie lire toute l'école.
//
// Une colonne ÉMARGEMENT est prévue : c'est une feuille qu'on signe, et sans
// colonne pour cela on signe dans la marge.
function corpsDuMois({ entete, abonnes, parMois, j, t, money, sou, esc, quotePart, tarifPlein, nomService, mot }) {
  const m = parMois[j] || {};
  const libelle = entete[j]?.label || entete[j]?.period_key || '—';

  const inscrits = abonnes
    .map((a) => ({ a, c: a.cellules?.[j], p: pastilleCellule(a.cellules?.[j]) }))
    .filter((x) => x.p.ton !== 'vide');

  const infos = [
    `${mot.le} : <b>${esc(libelle)}</b>`,
    tarifPlein ? `${t('Tarif plein', 'Full rate', 'Tarifa')} : <b>${money(tarifPlein)}</b>` : '',
    `${t(`Inscrits ce ${mot.un}`, `Enrolled this ${mot.un}`, `Inscritos este ${mot.un}`)} : <b>${inscrits.length}</b>`,
  ].filter(Boolean).join(' · ');

  const cartes = [
    [t('Attendu', 'Expected', 'Esperado'), money(m.attendu || 0)],
    [t('Encaissé', 'Collected', 'Cobrado'), money(m.encaisse || 0)],
    [t('Impayé', 'Unpaid', 'Impago'), money(m.impaye || 0)],
    ...(quotePart ? [[t('Quote-part', 'School share', 'Cuota'), money(m.quotePart || 0)]] : []),
  ].map(([lib, val]) => `<div class="carte"><span>${esc(lib)}</span><b>${val}</b></div>`).join('');

  const lignes = inscrits.map(({ a, c, p }, i) => {
    const d = SIGNES[p.ton] || SIGNES.vide;
    const reste = Number(c?.reste) || 0;
    return `<tr>
      <td class="c num">${i + 1}</td>
      <td>${esc(a.name)}</td>
      <td class="c mono">${esc(a.matricule || '—')}</td>
      <td>${esc(a.className || '—')}</td>
      <td class="r num">${sou(c?.montantDu)}</td>
      <td class="r num">${sou(c?.paye)}</td>
      <td class="r num ${reste > 0 ? 'du' : 'ok'}">${reste > 0 ? money(reste) : t('Soldé', 'Paid', 'Saldado')}</td>
      <td class="c">${esc(t(d.fr, d.en, d.es))}</td>
      <td class="emarge"></td>
    </tr>`;
  }).join('');

  const vide = `<tr><td colspan="9" class="c vide">${
    t(`Aucun élève inscrit à « ${nomService} » pour ${libelle}.`,
      `No student enrolled in "${nomService}" for ${libelle}.`,
      `Ningún alumno inscrito para ${libelle}.`)}</td></tr>`;

  return `<p class="infos">${infos}</p>
<div class="cartes">${cartes}</div>
<table>
  <thead><tr>
    <th class="c">N°</th>
    <th>${t('Élève', 'Student', 'Alumno')}</th>
    <th class="c">${t('Matricule', 'ID', 'Matrícula')}</th>
    <th>${t('Classe', 'Class', 'Clase')}</th>
    <th class="r">${t('Dû', 'Due', 'Debido')}</th>
    <th class="r">${t('Payé', 'Paid', 'Pagado')}</th>
    <th class="r">${t('Reste', 'Balance', 'Saldo')}</th>
    <th class="c">${t('État', 'Status', 'Estado')}</th>
    <th class="c">${t('Émargement', 'Signature', 'Firma')}</th>
  </tr></thead>
  <tbody>${lignes || vide}</tbody>
  <tfoot><tr>
    <td colspan="4" class="r">${t(`Total du ${mot.un}`, `${mot.le} total`, `Total del ${mot.un}`)}</td>
    <td class="r num">${money(m.attendu || 0)}</td>
    <td class="r num">${money(m.encaisse || 0)}</td>
    <td class="r num ${(m.impaye || 0) > 0 ? 'du' : 'ok'}">${money(m.impaye || 0)}</td>
    <td colspan="2"></td>
  </tr></tfoot>
</table>`;
}

// ── L'ÉTAT DE L'ANNÉE : la feuille qu'on classe ─────────────────────────────
function corpsDeLAnnee({ entete, abonnes, parMois, total, t, money, sou, esc, quotePart, tarifPlein, mot }) {
  const infos = [
    tarifPlein ? `${t('Tarif plein', 'Full rate', 'Tarifa')} : <b>${money(tarifPlein)}</b>/${t('mois', 'month', 'mes')}` : '',
    quotePart ? `${t('Quote-part école', 'School share', 'Cuota escuela')} : <b>${quotePart}%</b>` : '',
    `${t('Élèves abonnés', 'Subscribed students', 'Alumnos suscritos')} : <b>${abonnes.length}</b>`,
    `${mot.les} ${t('facturés', 'billed', 'facturados')} : <b>${entete.length}</b>`,
  ].filter(Boolean).join(' · ');

  const cartes = [
    [t('Total attendu', 'Total expected', 'Total esperado'), money(total.attendu || 0)],
    [t('Total encaissé', 'Total collected', 'Total cobrado'), money(total.encaisse || 0)],
    [t('Reste à encaisser', 'Still to collect', 'Falta cobrar'), money(total.impaye || 0)],
    ...(quotePart ? [[t('Quote-part', 'School share', 'Cuota'), money(total.quotePart || 0)]] : []),
  ].map(([lib, val]) => `<div class="carte"><span>${esc(lib)}</span><b>${val}</b></div>`).join('');

  const lignesMois = parMois.map((m, i) => `<tr>
    <td>${esc(entete[i]?.label || entete[i]?.period_key || '—')}</td>
    <td class="c num">${m.moisSansService ? '—' : m.inscrits}</td>
    <td class="r num">${sou(m.attendu)}</td>
    <td class="r num">${sou(m.encaisse)}</td>
    <td class="r num ${m.impaye > 0 ? 'du' : ''}">${sou(m.impaye)}</td>
    ${quotePart ? `<td class="r num">${sou(m.quotePart)}</td>` : ''}
  </tr>`).join('');

  const colonnesMois = entete
    .map((e) => `<th class="c mois">${esc(abrege(e.label || e.period_key))}</th>`).join('');

  const lignesGrille = abonnes.map((a, i) => {
    const cases = entete.map((_, k) => {
      const p = pastilleCellule(a.cellules?.[k]);
      const d = SIGNES[p.ton] || SIGNES.vide;
      return `<td class="c sig ${p.ton}">${d.signe}</td>`;
    }).join('');
    return `<tr>
      <td class="c num">${i + 1}</td>
      <td>${esc(a.name)}</td>
      <td class="c mono">${esc(a.matricule || '—')}</td>
      <td>${esc(a.className || '—')}</td>
      ${cases}
      <td class="r num ${a.reste > 0 ? 'du' : 'ok'}">${a.reste > 0 ? money(a.reste) : t('Soldé', 'Paid', 'Saldado')}</td>
    </tr>`;
  }).join('');

  const nbCol = 5 + entete.length;
  const videGrille = `<tr><td colspan="${nbCol}" class="c vide">${
    t('Aucun élève abonné à ce service.', 'No student subscribed to this service.',
      'Ningún alumno suscrito a este servicio.')}</td></tr>`;

  const legende = Object.values(SIGNES)
    .map((d) => `<span class="lg"><i>${d.signe}</i> ${esc(t(d.fr, d.en, d.es))}</span>`).join('');

  return `<p class="infos">${infos}</p>
<div class="cartes">${cartes}</div>

<h2>${mot.parX}</h2>
<table>
  <thead><tr>
    <th>${mot.le}</th>
    <th class="c">${t('Inscrits', 'Enrolled', 'Inscritos')}</th>
    <th class="r">${t('Attendu', 'Expected', 'Esperado')}</th>
    <th class="r">${t('Encaissé', 'Collected', 'Cobrado')}</th>
    <th class="r">${t('Impayé', 'Unpaid', 'Impago')}</th>
    ${quotePart ? `<th class="r">${t('Quote-part', 'School share', 'Cuota')}</th>` : ''}
  </tr></thead>
  <tbody>${lignesMois || `<tr><td colspan="${quotePart ? 6 : 5}" class="c vide">${
    t('Ce service n’a aucun mois facturé.', 'This service has no billed month.',
      'Sin meses facturados.')}</td></tr>`}</tbody>
  <tfoot><tr>
    <td>${t('Total', 'Total', 'Total')}</td>
    <td class="c num">${total.inscrits || 0}</td>
    <td class="r num">${money(total.attendu || 0)}</td>
    <td class="r num">${money(total.encaisse || 0)}</td>
    <td class="r num">${money(total.impaye || 0)}</td>
    ${quotePart ? `<td class="r num">${money(total.quotePart || 0)}</td>` : ''}
  </tr></tfoot>
</table>

<h2>${t(`Par élève et par ${mot.un}`, `By student and ${mot.un}`, `Por alumno y ${mot.un}`)}</h2>
<table>
  <thead><tr>
    <th class="c">N°</th>
    <th>${t('Élève', 'Student', 'Alumno')}</th>
    <th class="c">${t('Matricule', 'ID', 'Matrícula')}</th>
    <th>${t('Classe', 'Class', 'Clase')}</th>
    ${colonnesMois}
    <th class="r">${t('Reste', 'Balance', 'Saldo')}</th>
  </tr></thead>
  <tbody>${lignesGrille || videGrille}</tbody>
  <tfoot><tr>
    <td colspan="${nbCol - 1}" class="r">${t('Reste à encaisser', 'Still to collect', 'Falta cobrar')}</td>
    <td class="r num ${(total.impaye || 0) > 0 ? 'du' : 'ok'}">${money(total.impaye || 0)}</td>
  </tr></tfoot>
</table>
<p class="legende">${legende}</p>`;
}

// Abrège un libellé de mois pour une colonne de 22 px : « Septembre 2026 » →
// « Sep ». Le libellé entier reste dans le tableau par mois, juste au-dessus —
// la colonne n'a donc pas à le porter deux fois.
export function abrege(libelle) {
  const s = String(libelle || '').trim();
  if (!s) return '—';
  const m = s.match(/^([A-Za-zÀ-ÿ]+)/);
  return m ? m[1].slice(0, 3) : s.slice(0, 3);
}

// Ouvre l'état dans une fenêtre dédiée et laisse l'utilisateur imprimer ou
// enregistrer en PDF. Même mécanique que tous les imprimés de la plateforme :
// impression navigateur, aucune dépendance réseau, aucune librairie PDF.
export function printServiceEtat(opts) {
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.write(buildServiceEtatHtml(opts));
  win.document.close();
  return true;
}
