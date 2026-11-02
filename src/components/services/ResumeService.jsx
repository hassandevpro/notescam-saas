// ONGLET « RÉSUMÉ » — où vivent désormais les chiffres qu'on consultait partout.
//
// Les six lignes de synthèse se répétaient sous la grille et encombraient
// l'écran de travail. Elles ne sont pas supprimées : elles sont ICI, avec la
// quote-part et l'export. C'est la contrepartie du masquage — « toute donnée
// masquée à l'écran reste accessible en un clic ».
//
// LES CARTES SUIVENT LES FILTRES ACTIFS, comme la grille et la liste : elles
// sont calculées sur la même matière (`parMois` / `total` dérivés de la grille
// filtrée). Un total qui ignorerait le filtre pendant que la liste le respecte
// donnerait deux chiffres contradictoires sur le même écran.
export default function ResumeService({
  total = {}, parMois = [], entete = [], quotePart = null,
  nbAbonnes = 0, filtreActif = false, money, t, onExport,
}) {
  const cartes = [
    { cle: 'attendu',  lib: t('Total attendu', 'Total expected', 'Total esperado'),
      valeur: money(total.attendu || 0),  ton: 'text-slate-900 dark:text-slate-100' },
    { cle: 'encaisse', lib: t('Total encaissé', 'Total collected', 'Total cobrado'),
      valeur: money(total.encaisse || 0), ton: 'text-emerald-700 dark:text-emerald-300' },
    { cle: 'impaye',   lib: t('Reste à encaisser', 'Still to collect', 'Falta cobrar'),
      valeur: money(total.impaye || 0),   ton: 'text-rose-700 dark:text-rose-300' },
    { cle: 'abonnes',  lib: t('Élèves abonnés', 'Subscribed students', 'Alumnos suscritos'),
      valeur: String(nbAbonnes),          ton: 'text-slate-900 dark:text-slate-100' },
  ];

  return (
    <div className="space-y-4">
      {filtreActif && (
        // Un total partiel pris pour un total général est un faux chiffre, et
        // c'est celui que l'école recopie dans son cahier.
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {t('Ces chiffres portent sur la sélection filtrée, pas sur tout le service.',
             'These figures cover the filtered selection, not the whole service.',
             'Estas cifras cubren la selección filtrada.')}
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cartes.map((c) => (
          <div key={c.cle} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">{c.lib}</p>
            <p className={`mt-1 text-xl font-bold tabular-nums ${c.ton}`}>{c.valeur}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{t('Mois', 'Month', 'Mes')}</th>
              <th className="px-3 py-2 text-center font-medium">{t('Inscrits', 'Enrolled', 'Inscritos')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('Attendu', 'Expected', 'Esperado')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('Encaissé', 'Collected', 'Cobrado')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('Impayé', 'Unpaid', 'Impago')}</th>
              {quotePart ? (
                <th className="px-3 py-2 text-right font-medium">
                  {t('Quote-part', 'School share', 'Cuota')}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {parMois.map((m, i) => (
              <tr key={entete[i]?.period_key || i} className="border-t border-slate-100 dark:border-slate-700/60">
                <td className="px-3 py-1.5 whitespace-nowrap">{entete[i]?.label || '—'}</td>
                <td className="px-3 py-1.5 text-center tabular-nums">
                  {m.moisSansService ? '—' : m.inscrits}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{money(m.attendu)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-emerald-700 dark:text-emerald-300">
                  {m.encaisse ? money(m.encaisse) : '—'}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                  {m.impaye ? money(m.impaye) : '—'}
                </td>
                {quotePart ? (
                  <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                    {m.quotePart ? money(m.quotePart) : '—'}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 dark:bg-slate-800/60 font-semibold">
            <tr>
              <td className="px-3 py-2">{t('Total', 'Total', 'Total')}</td>
              <td className="px-3 py-2 text-center tabular-nums">{total.inscrits || 0}</td>
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{money(total.attendu || 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{money(total.encaisse || 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{money(total.impaye || 0)}</td>
              {quotePart ? (
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{money(total.quotePart || 0)}</td>
              ) : null}
            </tr>
          </tfoot>
        </table>
      </div>

      {onExport && (
        <button
          type="button" onClick={onExport}
          className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm"
        >
          {t('Exporter ce résumé', 'Export this summary', 'Exportar este resumen')} (CSV)
        </button>
      )}
    </div>
  );
}
