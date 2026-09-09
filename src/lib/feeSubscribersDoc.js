// ════════════════════════════════════════════════════════════════════════════
// LISTE DES SOUSCRIPTEURS D'UN FRAIS OPTIONNEL (bus, cantine, internat…)
// ════════════════════════════════════════════════════════════════════════════
// Ce que l'école en fait, concrètement : la remettre au chauffeur du bus ou à la
// cantine. C'est une liste d'appel autant qu'un état de caisse — d'où le N°
// d'ordre, le regroupement par classe, et l'effectif affiché en clair.
//
// Elle porte aussi le PAIEMENT (dû / versé / reste), parce que la question qui
// suit « qui prend le bus ? » est toujours « et qui est à jour ? ». Les deux sur
// la même feuille évitent d'aller les chercher sur deux écrans.
//
// Un élève dont la souscription a été RETIRÉE (`status: 'removed'`) n'y figure
// pas : la liste dit qui est inscrit aujourd'hui, pas qui l'a été un jour.
//
// En-tête et signature officiels partagés (officialDocHeader) : c'est le
// standard de tous les imprimés de la plateforme, hors carte, diplôme et reçu.
import { officialHeaderHtml, officialSignatureHtml } from './officialDocHeader.js';
import { resolveCountryCode } from '../countries/index.js';
import { formatMoney, currencyCode } from './currency.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

/**
 * Construit la liste imprimable des élèves ayant souscrit à un frais.
 * Fonction PURE (aucun DOM) — donc testable.
 *
 * @param {object}   opts
 * @param {object}   opts.school    établissement (logo, nom, année, signature…)
 * @param {string}   opts.feeName   libellé du frais (« Transport scolaire »)
 * @param {string}  [opts.categoryLabel] libellé de la catégorie, affiché en sous-titre
 * @param {Array}    opts.rows      [{ name, matricule, gender, className, amount, paid }]
 * @param {string}  [opts.lang]     langue de l'école (anglophone…)
 * @param {string}  [opts.currency] devise (défaut : celle de l'école)
 */
export function buildSubscribersHtml({ school, feeName, categoryLabel, rows = [], lang, currency }) {
  const isGE = resolveCountryCode(school) === 'guinea_eq';
  const isEn = !isGE && lang === 'anglophone';
  const sys  = isGE ? 'ES' : isEn ? 'EN' : 'FR';
  const t    = (fr, en, es) => (isGE ? (es ?? fr) : isEn ? en : fr);
  const cur  = currency || currencyCode(school);
  const money = (n) => formatMoney(n, cur);
  const locale = isGE ? 'es-ES' : isEn ? 'en-GB' : 'fr-FR';

  // Tri par CLASSE puis par nom, pour que les élèves d'une même classe soient
  // groupés — c'est ce qui compte quand on fait l'appel.
  // Réserve assumée : les classes sont ordonnées ALPHABÉTIQUEMENT (« 2nde C »
  // avant « 6e A »), parce que l'application n'a nulle part d'ordre scolaire des
  // niveaux — `classes` est chargé en `.order('name')`. Le groupement est juste,
  // la succession des classes ne suit pas la progression scolaire.
  const ordered = [...rows].sort((a, b) =>
    (a.className || '').localeCompare(b.className || '', undefined, { sensitivity: 'base' })
    || (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

  const totalDu    = ordered.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const totalPaye  = ordered.reduce((s, r) => s + (Number(r.paid) || 0), 0);
  const totalReste = ordered.reduce((s, r) => s + Math.max(0, (Number(r.amount) || 0) - (Number(r.paid) || 0)), 0);

  // Sexe en une lettre, comme sur la liste imprimée des élèves (Students.jsx) :
  // deux imprimés de la même école ne peuvent pas noter le genre différemment.
  // Les deux orthographes de la base cohabitent (fr / es), d'où les deux tests.
  const sexe = (g) => (g === 'Masculin' || g === 'Masculino' ? 'M'
    : g === 'Feminin' || g === 'Femenino' ? 'F' : '—');

  // Répartition garçons / filles : sur une liste scolaire, c'est la raison même
  // pour laquelle on porte le sexe. Les élèves sans genre renseigné ne sont
  // comptés ni d'un côté ni de l'autre — G + F peut donc être < à l'effectif,
  // et c'est voulu : mieux vaut un écart visible qu'un comptage inventé.
  const nbG = ordered.filter((r) => sexe(r.gender) === 'M').length;
  const nbF = ordered.filter((r) => sexe(r.gender) === 'F').length;

  // Une ligne par élève. Le reste à payer est borné à 0 : un trop-perçu ne doit
  // pas s'afficher en négatif sur une liste que le chauffeur lit en trois secondes.
  const ligne = (r, i) => {
    const du    = Number(r.amount) || 0;
    const paye  = Number(r.paid) || 0;
    const reste = Math.max(0, du - paye);
    return `<tr>
      <td class="c num">${i + 1}</td>
      <td>${esc(r.name)}</td>
      <td class="c mono">${esc(r.matricule || '—')}</td>
      <td class="c">${sexe(r.gender)}</td>
      <td>${esc(r.className || '—')}</td>
      <td class="r num">${money(du)}</td>
      <td class="r num">${money(paye)}</td>
      <td class="r num ${reste > 0 ? 'du' : 'ok'}">${reste > 0 ? money(reste) : t('Soldé', 'Paid', 'Saldado')}</td>
    </tr>`;
  };

  const vide = `<tr><td colspan="8" class="c vide">${
    t('Aucun élève n’a souscrit à ce frais.', 'No student has subscribed to this fee.', 'Ningún alumno se ha inscrito.')
  }</td></tr>`;

  return `<!DOCTYPE html><html lang="${isEn ? 'en' : isGE ? 'es' : 'fr'}"><head>
<meta charset="UTF-8">
<title>${t('Souscripteurs', 'Subscribers', 'Inscritos')} — ${esc(feeName)}</title>
<style>
  @page { size: A4 portrait; margin: 10mm 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; color: #111827; font-size: 11px; }

  .meta { display: flex; justify-content: space-between; align-items: flex-end; margin: 2px 0 7px; font-size: 10px; color: #4b5563; }
  .effectif { font-size: 13px; font-weight: 800; color: #1e3a5f; }
  .effectif span { font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: .6px; }
  .effectif .gf { text-transform: none; letter-spacing: 0; color: #1e3a5f; font-weight: 700; }

  table.liste { width: 100%; border-collapse: collapse; }
  table.liste th { background: #1e3a5f; color: #fff; font-size: 9px; text-transform: uppercase; letter-spacing: .5px;
                   padding: 5px 6px; text-align: left; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  table.liste td { padding: 4px 6px; border-bottom: 1px solid #e5e7eb; }
  /* Une ligne sur deux teintée : sur 200 lignes, c'est ce qui évite de sauter
     d'une ligne à l'autre en lisant l'appel. */
  table.liste tbody tr:nth-child(even) td { background: #f7f8fa; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .c { text-align: center; } .r { text-align: right; }
  .num { font-variant-numeric: tabular-nums; }
  .mono { font-family: 'Consolas', monospace; font-size: 10px; }
  .du { color: #b91c1c; font-weight: 700; }
  .ok { color: #15803d; font-weight: 600; }
  .vide { padding: 14px; color: #9ca3af; font-style: italic; }

  tfoot td { border-top: 2px solid #1e3a5f; font-weight: 800; padding: 6px; background: #eef2f7; white-space: nowrap;
             -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* L'en-tête de colonnes se répète sur chaque page : une liste de 200 élèves
     tient rarement sur une feuille, et une page sans en-tête n'est plus lisible. */
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
</style>
</head><body>
${officialHeaderHtml(school, {
    sys,
    title: t('Liste des souscripteurs', 'List of subscribers', 'Lista de inscritos'),
    subtitle: feeName,
  })}

<div class="meta">
  <div class="effectif">${ordered.length} <span>${
    ordered.length > 1 ? t('élèves inscrits', 'students enrolled', 'alumnos inscritos')
                       : t('élève inscrit', 'student enrolled', 'alumno inscrito')
  }</span>${nbG + nbF > 0 ? `<span class="gf"> — ${nbG} G · ${nbF} F</span>` : ''}</div>
  <div>${categoryLabel ? `${esc(categoryLabel)} &nbsp;·&nbsp; ` : ''}${t('Édité le', 'Issued on', 'Emitido el')} ${new Date().toLocaleDateString(locale)}</div>
</div>

<table class="liste">
  <thead>
    <tr>
      <th class="c" style="width:28px">${t('N°', 'No.', 'N.º')}</th>
      <th>${t('Nom et prénoms', 'Full name', 'Apellidos y nombre')}</th>
      <th class="c" style="width:80px">${t('Matricule', 'Student ID', 'Matrícula')}</th>
      <th class="c" style="width:34px">${t('Sexe', 'Sex', 'Sexo')}</th>
      <th style="width:80px">${t('Classe', 'Class', 'Clase')}</th>
      <th class="r" style="width:88px">${t('Montant', 'Amount', 'Importe')}</th>
      <th class="r" style="width:88px">${t('Versé', 'Paid', 'Pagado')}</th>
      <th class="r" style="width:88px">${t('Reste', 'Balance', 'Saldo')}</th>
    </tr>
  </thead>
  <tbody>${ordered.length ? ordered.map(ligne).join('') : vide}</tbody>
  ${ordered.length ? `<tfoot><tr>
    <td colspan="5">${t('Total', 'Total', 'Total')} — ${ordered.length} ${t('élève(s)', 'student(s)', 'alumno(s)')}</td>
    <td class="r num">${money(totalDu)}</td>
    <td class="r num">${money(totalPaye)}</td>
    <td class="r num">${money(totalReste)}</td>
  </tr></tfoot>` : ''}
</table>

${officialSignatureHtml(school, sys)}
<script>window.onload = function(){ setTimeout(function(){ window.focus(); window.print(); }, 350); };</script>
</body></html>`;
}

// Ouvre la liste dans une fenêtre dédiée et lance l'impression.
export function printSubscribers(opts) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(buildSubscribersHtml(opts));
  win.document.close();
}
