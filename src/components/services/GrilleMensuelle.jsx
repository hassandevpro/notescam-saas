// ONGLET « GRILLE MENSUELLE » — élèves × mois, lue d'un coup d'œil.
//
// ── CE QUE LA GRILLE DISAIT MAL ────────────────────────────────────────────
//
// Constat du responsable (2026-10-31) : « chaque cellule de mois affiche
// seulement un chiffre brut (15000), sans dire s'il est payé, partiel ou
// impayé » ; et sous chaque élève se répétaient « Inscrits », « dont demi-mois »,
// « Attendu », « Encaissé », « Impayé », « Quote-part ».
//
// Dix colonnes de montants bruts ne répondent pas à la question du guichet —
// « cet élève est-il à jour ? ». Il fallait comparer de tête chaque montant à
// ce qui avait été versé, et rien à l'écran ne disait ce qui l'avait été.
//
// ── LA PASTILLE, ET LE SEUL CHIFFRE QUI RESTE ──────────────────────────────
//
// Chaque case porte un TON (`pastilleCellule`, pur et testé) : vide pour un mois
// non souscrit, vert pour un mois soldé, orange pour un partiel, rouge pour un
// impayé. Le seul chiffre conservé dans la case est le RESTE d'un partiel ou
// d'un impayé — celui qu'on réclame. Le montant dû complet est en infobulle, et
// l'interrupteur « Afficher les montants » les rend tous à qui les veut.
//
// ── UNE SEULE LIGNE DE TOTAUX, ET ELLE SE REPLIE ───────────────────────────
//
// Les six lignes de synthèse deviennent une ligne « Impayé par mois » — la seule
// qui serve à décider — et un bloc repliable pour les cinq autres. Rien n'est
// perdu : l'onglet Résumé porte le détail complet, et l'export aussi.
import { useState } from 'react';
import { pastilleCellule } from '../../lib/cantineEngine';

// Le ton d'une case. Fond ET texte, pour que la couleur ne soit pas la seule
// information : un écran mal réglé, une impression en noir et blanc, ou un
// daltonien doivent lire la même chose.
const TON = {
  vide:    'text-slate-300',
  solde:   'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  partiel: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  impaye:  'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  exempte: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  abandon: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

export default function GrilleMensuelle({
  grille = [], entete = [], parMois = [], total = {}, quotePart = null,
  moisCourant, canCollect, onCellule, onEncaisser, money, t,
}) {
  const [montants, setMontants] = useState(false);
  const [totauxOuverts, setTotauxOuverts] = useState(false);

  // Ce que porte une case : un signe court, et le reste s'il y en a un.
  const contenu = (c) => {
    const p = pastilleCellule(c);
    if (p.ton === 'vide')    return { p, texte: '—', bulle: t('Mois non souscrit', 'Month not subscribed', 'Mes no suscrito') };
    if (p.ton === 'exempte') return { p, texte: 'EX', bulle: t('Exempté', 'Exempted', 'Exento') };
    if (p.ton === 'abandon') return { p, texte: 'AB', bulle: t('Abandon', 'Dropped', 'Abandono') };
    if (p.ton === 'solde') {
      return {
        p, texte: montants ? money(c.montantDu) : '✔',
        bulle: `${t('Soldé', 'Settled', 'Saldado')} — ${money(c.montantDu)}`,
      };
    }
    // Partiel et impayé portent le RESTE : c'est le chiffre qu'on réclame.
    return {
      p, texte: money(p.valeur),
      bulle: `${p.ton === 'partiel' ? t('Partiel', 'Partial', 'Parcial') : t('Impayé', 'Unpaid', 'Impago')}`
        + ` — ${t('dû', 'due', 'debido')} ${money(c.montantDu)}, ${t('versé', 'paid', 'pagado')} ${money(c.paye)}`,
    };
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-2">
        {/* LA LÉGENDE EST OBLIGATOIRE. Une pastille sans légende demande de
            devenir devin au premier usage. */}
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {[['solde', t('Soldé', 'Settled', 'Saldado')],
            ['partiel', t('Partiel', 'Partial', 'Parcial')],
            ['impaye', t('Impayé', 'Unpaid', 'Impago')],
            ['vide', t('Non souscrit', 'Not subscribed', 'No suscrito')]].map(([ton, lib]) => (
              <span key={ton} className={`px-2 py-0.5 rounded ${TON[ton]}`}>{lib}</span>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox" className="accent-brand-600 w-4 h-4"
            checked={montants} onChange={(e) => setMontants(e.target.checked)}
          />
          {t('Afficher les montants', 'Show amounts', 'Mostrar importes')}
        </label>
      </div>

      {/* Seule la GRILLE défile, et la colonne Élève reste figée. */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="min-w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 bg-slate-50 dark:bg-slate-800 px-2 py-2 text-left font-medium border-b border-slate-200 dark:border-slate-700">
                {t('Élève', 'Student', 'Alumno')}
              </th>
              {entete.map((m) => (
                <th
                  key={m.period_key}
                  className={`sticky top-0 z-10 px-2 py-2 text-center font-medium whitespace-nowrap border-b border-slate-200 dark:border-slate-700 ${
                    m.period_key === moisCourant
                      ? 'bg-brand-100 text-brand-900 dark:bg-brand-900/40 dark:text-brand-100'
                      : 'bg-slate-50 dark:bg-slate-800'}`}
                  title={m.period_key === moisCourant ? t('Mois en cours', 'Current month', 'Mes actual') : ''}
                >
                  {m.label}
                </th>
              ))}
              <th className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 px-2 py-2 text-right font-medium whitespace-nowrap border-b border-slate-200 dark:border-slate-700">
                {t('Reste à payer', 'Balance due', 'Saldo')}
              </th>
              {canCollect && <th className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700" />}
            </tr>
          </thead>

          <tbody>
            {grille.map((r) => (
              <tr key={r.student_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-2 py-1.5 whitespace-nowrap border-b border-slate-100 dark:border-slate-700/60">
                  <span className="block font-medium">{r.name}</span>
                  <span className="block text-[11px] text-slate-400">{r.className || '—'}</span>
                </td>
                {r.cellules.map((c) => {
                  const { p, texte, bulle } = contenu(c);
                  const cellule = (
                    <span className={`inline-block min-w-[2.5rem] rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${TON[p.ton]}`}>
                      {texte}
                    </span>
                  );
                  return (
                    <td
                      key={c.period_key}
                      title={bulle}
                      className={`px-2 py-1.5 text-center whitespace-nowrap border-b border-slate-100 dark:border-slate-700/60 ${
                        c.period_key === moisCourant ? 'bg-brand-50/50 dark:bg-brand-900/10' : ''}`}
                    >
                      {canCollect && c.echeance_id ? (
                        <button
                          type="button" onClick={() => onCellule({ ...c, eleve: r.name })}
                          className="min-h-[32px]"
                          aria-label={`${r.name} — ${c.period_key} — ${bulle}`}
                        >
                          {cellule}
                        </button>
                      ) : cellule}
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold border-b border-slate-100 dark:border-slate-700/60">
                  {r.reste ? money(r.reste) : '—'}
                </td>
                {canCollect && (
                  <td className="px-2 py-1.5 text-right border-b border-slate-100 dark:border-slate-700/60">
                    <button
                      type="button" disabled={!r.reste} onClick={() => onEncaisser(r)}
                      className="min-h-[32px] rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-30 whitespace-nowrap"
                    >
                      {t('Encaisser', 'Collect', 'Cobrar')}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>

          {/* UNE SEULE ligne de totaux visible : l'impayé par mois, celle qui
              sert à décider où relancer. Le reste se déplie. */}
          <tfoot className="bg-slate-50 dark:bg-slate-800/60 text-xs">
            <tr className="font-semibold">
              <td className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 whitespace-nowrap">
                {t('Impayé', 'Unpaid', 'Impago')}
              </td>
              {parMois.map((m, i) => (
                <td key={entete[i]?.period_key || i} className="px-2 py-1.5 text-center tabular-nums whitespace-nowrap">
                  {m.impaye ? money(m.impaye) : '—'}
                </td>
              ))}
              <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{money(total.impaye || 0)}</td>
              {canCollect && <td />}
            </tr>
            {totauxOuverts && (
              <>
                <LigneTotal libelle={t('Inscrits', 'Enrolled', 'Inscritos')} action={canCollect}
                  cols={parMois.map((m) => (m.moisSansService ? '—' : m.inscrits))} fin={total.inscrits} />
                <LigneTotal libelle={t('dont demi-mois', 'of which half-month', 'medio mes')} action={canCollect}
                  cols={parMois.map((m) => m.demiMois || '')} fin={total.demiMois} />
                <LigneTotal libelle={t('Attendu', 'Expected', 'Esperado')} action={canCollect}
                  cols={parMois.map((m) => money(m.attendu))} fin={money(total.attendu || 0)} />
                <LigneTotal libelle={t('Encaissé', 'Collected', 'Cobrado')} action={canCollect}
                  cols={parMois.map((m) => money(m.encaisse))} fin={money(total.encaisse || 0)} />
                {quotePart ? (
                  <LigneTotal libelle={`${t('Quote-part', 'School share', 'Cuota')} (${money(quotePart)})`} action={canCollect}
                    cols={parMois.map((m) => (m.quotePart ? money(m.quotePart) : '—'))}
                    fin={money(total.quotePart || 0)} />
                ) : null}
              </>
            )}
            <tr>
              <td colSpan={entete.length + 2 + (canCollect ? 1 : 0)} className="px-2 py-1">
                <button
                  type="button" onClick={() => setTotauxOuverts((v) => !v)}
                  className="text-[11px] underline text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  {totauxOuverts
                    ? t('Masquer les autres totaux', 'Hide the other totals', 'Ocultar los otros totales')
                    : t('Afficher les autres totaux (inscrits, attendu, encaissé, quote-part)',
                        'Show the other totals (enrolled, expected, collected, school share)',
                        'Mostrar los otros totales')}
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function LigneTotal({ libelle, cols = [], fin, action = false }) {
  return (
    <tr>
      <td className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 whitespace-nowrap">{libelle}</td>
      {cols.map((v, i) => (
        <td key={i} className="px-2 py-1.5 text-center tabular-nums whitespace-nowrap">{v === 0 ? '' : v}</td>
      ))}
      <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fin}</td>
      {action && <td />}
    </tr>
  );
}
