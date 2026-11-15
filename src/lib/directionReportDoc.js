// ════════════════════════════════════════════════════════════════════════════
// RAPPORT DE DIRECTION — une page A4 : indicateurs, moyenne par classe, à suivre, à faire.
// Fonction PURE (HTML en chaîne, aucun DOM) : testable ; l'impression est déclenchée à part.
// Mêmes chiffres que le tableau de bord (kpis / barres / alertes), jamais recalculés ici.
// ════════════════════════════════════════════════════════════════════════════
import { officialHeaderHtml, officialSignatureHtml } from './officialDocHeader.js';
import { resolveCountryCode } from '../countries/index.js';
import { libelleAlerte } from './dashboardAlertes.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function buildDirectionReportHtml({ school, kpis, barres = [], suivre = [], faire = [], filtreLabel = '', periodeLabel = '', lang, basic = false, now = new Date() }) {
  const isGE = resolveCountryCode(school) === 'guinea_eq';
  const isEn = !isGE && lang === 'anglophone';
  const sys = isGE ? 'ES' : isEn ? 'EN' : 'FR';
  const t = (fr, en, es) => (isGE ? (es ?? fr) : isEn ? en : fr);
  const locale = isGE ? 'es-ES' : isEn ? 'en-GB' : 'fr-FR';
  const tt = (fr, en) => t(fr, en);
  const signe = (v, unite) => (v == null ? t('pas de période précédente comparable', 'no comparable previous period')
    : `${v > 0 ? '+' : ''}${unite === '%' ? `${Math.round(v)} pts` : v.toFixed(1)} ${t('vs période précédente', 'vs previous period')}`);
  const aDesNotes = !!kpis && kpis.classes > 0;

  const barre = (b) => `<tr><td class="nom">${esc(b.nom)}</td>
    <td class="piste"><span class="barre ${b.valeur >= 10 ? 'ok' : 'bas'}" style="width:${Math.min(100, (b.valeur / 20) * 100)}%"></span><span class="dix"></span></td>
    <td class="val">${b.valeur.toFixed(2)}</td></tr>`;
  const liste = (items, vide) => (items.length
    ? `<ul>${items.map((x) => `<li class="g${x.gravite}">${esc(libelleAlerte(x, tt))}</li>`).join('')}</ul>`
    : `<p class="vide">${vide}</p>`);

  return `<!DOCTYPE html><html lang="${isEn ? 'en' : isGE ? 'es' : 'fr'}"><head><meta charset="UTF-8">
<title>${t('Rapport de direction', 'Management report', 'Informe de dirección')}</title>
<style>
  @page { size: A4 portrait; margin: 10mm 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; font-size: 11px; }
  .meta { display: flex; justify-content: space-between; margin: 4px 0 10px; font-size: 10px; color: #4b5563; }
  .kpis { display: flex; gap: 12px; margin-bottom: 8px; }
  .kpi { flex: 1; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px 10px; }
  .kpi .l { font-size: 9px; text-transform: uppercase; letter-spacing: .5px; color: #4b5563; font-weight: 700; }
  .kpi .v { font-size: 22px; font-weight: 800; color: #1e3a5f; }
  .kpi .v small { font-size: 11px; font-weight: 600; color: #6b7280; }
  .kpi .d { font-size: 9.5px; color: #374151; }
  .note { font-size: 9.5px; color: #4b5563; margin-bottom: 10px; }
  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #1e3a5f; margin: 10px 0 5px; border-bottom: 1px solid #1e3a5f; padding-bottom: 2px; }
  table.bars { width: 100%; border-collapse: collapse; }
  table.bars td { padding: 2px 4px; }
  td.nom { width: 90px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 90px; }
  td.piste { position: relative; height: 12px; background: #f3f4f6; }
  .barre { position: absolute; left: 0; top: 1px; bottom: 1px; display: block; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .barre.ok { background: #1e3a5f; } .barre.bas { background: #b91c1c; }
  .dix { position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: #374151; }
  td.val { width: 44px; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
  .deux { display: flex; gap: 14px; } .deux > div { flex: 1; }
  ul { list-style: none; } li { padding: 2px 0 2px 12px; position: relative; }
  li::before { content: ''; position: absolute; left: 0; top: 7px; width: 6px; height: 6px; border-radius: 50%; background: #d97706; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  li.g2::before { background: #b91c1c; }
  .vide { color: #6b7280; font-style: italic; }
  tr, li { page-break-inside: avoid; }
</style></head><body>
${officialHeaderHtml(school, { sys, title: t('Rapport de direction', 'Management report', 'Informe de dirección'), subtitle: [periodeLabel, filtreLabel].filter(Boolean).join(' — '), basic })}
<div class="meta"><div>${esc(school?.current_year || '')}</div><div>${t('Édité le', 'Issued on', 'Emitido el')} ${now.toLocaleDateString(locale)}</div></div>
${aDesNotes ? `
<div class="kpis">
  <div class="kpi"><div class="l">${t('Moyenne générale', 'Overall average')}</div><div class="v">${kpis.moyenne.toFixed(2)}<small> /20</small></div><div class="d">${esc(signe(kpis.variationMoyenne, 'pt'))}</div></div>
  <div class="kpi"><div class="l">${t('Taux de réussite', 'Pass rate')}</div><div class="v">${kpis.reussite}<small> %</small></div><div class="d">${esc(signe(kpis.variationReussite, '%'))}</div></div>
</div>
<p class="note">${t(`Sur ${kpis.eleves} élève(s) notés dans ${kpis.classes} classe(s), tous barèmes ramenés sur 20. Réussite = moyenne au moins égale à la moitié du barème.`,
  `Across ${kpis.eleves} graded student(s) in ${kpis.classes} class(es), all scales converted to /20. Pass = average at least half the scale.`)}</p>
<h2>${t('Moyenne par classe (sur 20) — trait = 10', 'Average per class (/20) — line = 10')}</h2>
<table class="bars">${barres.map(barre).join('')}</table>
` : `<p class="vide" style="margin:14px 0">${t('Aucune note saisie : les indicateurs apparaîtront dès les premières notes.', 'No grades entered yet: indicators will appear with the first grades.')}</p>`}
<div class="deux">
  <div><h2>${t('À suivre', 'To watch')}</h2>${liste(suivre, t('Rien d’inquiétant dans les résultats saisis.', 'Nothing worrying in the grades entered.'))}</div>
  <div><h2>${t('À faire', 'To do')}</h2>${liste(faire, t('Aucune action en attente.', 'No pending action.'))}</div>
</div>
${officialSignatureHtml(school, sys)}
</body></html>`;
}

/** Ouvre le rapport dans une fenêtre dédiée ; l'utilisateur imprime ou enregistre en PDF. */
export function printDirectionReport(opts) {
  const win = window.open('', '_blank');
  if (!win) return false;
  const script = '<script>window.onload=function(){setTimeout(function(){window.focus();window.print();},350);};</script>';
  win.document.write(buildDirectionReportHtml(opts).replace('</body>', `${script}</body>`));
  win.document.close();
  return true;
}
