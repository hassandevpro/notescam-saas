import { useT } from '../../lib/i18n';
import { Card, Empty, Loading, Denied, useChildSection, fmtDate } from './parentUi';

// BULLETINS — §7.
//
// AUCUN RECALCUL. Moyennes, cotes, rangs et décisions sont ceux que
// l'établissement a PUBLIÉS (tables apc_bulletins / prim_bulletins /
// mat_bulletins / prim_resultats_annuels). Créer ici un second calcul, c'était
// prendre le risque qu'un parent lise 12,47 là où le bulletin officiel affiche
// 12,46 — et n'ait aucun moyen de savoir lequel fait foi.
//
// L'impression réutilise la chaîne existante : `window.print()` sur la vue, avec
// les mêmes règles que src/lib/print/.
export default function ParentBulletins() {
  const t = useT();
  const { data, loading, denied, child } = useChildSection('bulletins');

  if (loading) return <Card><Loading /></Card>;
  if (denied || !data) return <Denied />;

  const showRank = data.show_rank;
  const rows = [
    ...(data.apc || []).map((b) => ({
      key: `apc-${b.trimestre_id}`, period: b.trimestre_id, engine: 'APC',
      moyenne: b.moyenne_generale, cote: b.cote, rang: b.rang,
      appreciation: b.appreciation_generale, decision: b.decision_conseil, at: b.updated_at,
    })),
    ...(data.prim || []).map((b) => ({
      key: `prim-${b.trimestre_id}`, period: b.trimestre_id, engine: t('Primaire', 'Primary', 'Primaria'),
      moyenne: b.moyenne_generale, cote: b.cote_generale, rang: b.rang,
      appreciation: b.appreciation_generale, decision: b.decision_conseil, at: b.updated_at,
    })),
    ...(data.maternelle || []).map((b) => ({
      key: `mat-${b.trimestre_id}`, period: b.trimestre_id, engine: t('Maternelle', 'Nursery', 'Preescolar'),
      moyenne: null, cote: null, rang: null,
      appreciation: b.appreciation_generale, decision: b.decision, at: b.updated_at,
    })),
  ];
  const annuels = data.prim_annuel || [];

  return (
    <div className="space-y-4">
      <Card
        title={`${t('Bulletins', 'Report cards', 'Boletines')} — ${child?.student?.name || ''}`}
        action={rows.length > 0 && (
          <button
            onClick={() => window.print()}
            className="text-xs font-semibold rounded-lg border border-gray-200 px-3 py-1.5 text-gray-600 hover:border-brand-300 hover:text-brand-700 transition-colors print:hidden"
          >
            {t('Imprimer / PDF', 'Print / PDF', 'Imprimir / PDF')}
          </button>
        )}
      >
        {rows.length === 0 ? (
          <Empty>
            {t("Aucun bulletin n'est encore publié pour cet enfant.",
               'No report card published for this child yet.',
               'Aún no hay boletín publicado para este hijo.')}
          </Empty>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-gray-100">
                  {[
                    t('Période', 'Term', 'Periodo'),
                    t('Moyenne', 'Average', 'Media'),
                    t('Cote', 'Grade', 'Nota'),
                    ...(showRank ? [t('Rang', 'Rank', 'Puesto')] : []),
                    t('Décision', 'Decision', 'Decisión'),
                    t('Publié le', 'Published', 'Publicado'),
                  ].map((h) => (
                    <th key={h} className="text-left py-2 pr-3 text-xs font-semibold text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-gray-50 last:border-0 align-top">
                    <td className="py-2.5 pr-3">
                      <span className="font-semibold text-gray-800">{r.period}</span>
                      <span className="block text-[11px] text-gray-400">{r.engine}</span>
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums font-bold text-gray-900">
                      {r.moyenne != null ? Number(r.moyenne).toFixed(2) : '—'}
                    </td>
                    <td className="py-2.5 pr-3 text-gray-700">{r.cote || '—'}</td>
                    {showRank && (
                      <td className="py-2.5 pr-3 tabular-nums text-gray-700">{r.rang ?? '—'}</td>
                    )}
                    <td className="py-2.5 pr-3 text-gray-700">
                      {r.decision || '—'}
                      {r.appreciation && (
                        <span className="block text-[11px] text-gray-500 mt-0.5 max-w-[320px]">{r.appreciation}</span>
                      )}
                    </td>
                    <td className="py-2.5 text-[11px] text-gray-400">{fmtDate(r.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {annuels.length > 0 && (
        <Card title={t('Résultats annuels', 'Annual results', 'Resultados anuales')}>
          <ul className="divide-y divide-gray-50">
            {annuels.map((a) => (
              <li key={a.annee} className="py-2.5 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-gray-800">{a.annee}</span>
                <span className="text-sm tabular-nums text-gray-700">
                  {a.moyenne_annuelle != null ? Number(a.moyenne_annuelle).toFixed(2) : '—'}
                  {a.cote_annuelle ? ` · ${a.cote_annuelle}` : ''}
                  {showRank && a.rang_annuel != null ? ` · ${t('Rang', 'Rank', 'Puesto')} ${a.rang_annuel}` : ''}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                  {a.decision || '—'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
