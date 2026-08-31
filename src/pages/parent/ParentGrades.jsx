import { useT } from '../../lib/i18n';
import { Card, Empty, Loading, Denied, useChildSection } from './parentUi';

// RÉSULTATS / NOTES — §6. LECTURE SEULE : aucun champ de saisie, aucun bouton
// d'écriture. Ce n'est pas ce qui protège la donnée (les policies d'écriture de
// `grades` exigent une appartenance à school_users que le parent n'a pas) ;
// c'est simplement cohérent avec ce que le serveur accepterait.
//
// Les moyennes sont calculées par le MÊME moteur que le bulletin de l'école —
// la pondération appliquée ici est celle de src/core/bulletinEngine.js, et le
// rang comme la moyenne de classe viennent du serveur, jamais d'un recalcul local.
export default function ParentGrades() {
  const t = useT();
  const { data, loading, denied, child } = useChildSection('grades');

  if (loading) return <Card><Loading /></Card>;
  if (denied || !data) return <Denied />;

  const { subjects = [], grades = [], class_stats = [], ranks = [], max_scale: maxScale = 20, show_rank: showRank } = data;
  const pass = maxScale === 20 ? 10 : maxScale / 2;

  // { [subject_id]: { [sequence]: value } }
  const map = {};
  for (const g of grades) {
    if (!map[g.subject_id]) map[g.subject_id] = {};
    map[g.subject_id][g.sequence] = g.value;
  }

  // Séquences réellement renseignées, plutôt qu'une grille figée de 1 à 6 :
  // une classe au trimestre n'a pas à afficher six colonnes vides.
  const seqs = [...new Set(grades.map((g) => Number(g.sequence)))].sort((a, b) => a - b);
  const tops = subjects.filter((s) => !s.parent_id);

  // Moyenne pondérée de l'élève sur une séquence — même règle que le bulletin.
  const avgFor = (seq) => {
    let w = 0, c = 0;
    for (const s of tops) {
      const raw = map[s.id]?.[seq];
      const n = parseFloat(String(raw ?? '').replace(',', '.'));
      if (!raw || Number.isNaN(n)) continue;
      w += (n / (s.max || 20)) * maxScale * (s.coef || 1);
      c += s.coef || 1;
    }
    return c ? Math.round((w / c) * 100) / 100 : null;
  };

  const statFor = (seq) => class_stats.find((s) => Number(s.sequence) === seq);
  const rankFor = (seq) => ranks.find((r) => Number(r.sequence) === seq);

  const appr = data.appreciations || [];
  const council = data.council || [];

  return (
    <div className="space-y-4">
      <Card title={`${t('Résultats', 'Results', 'Resultados')} — ${child?.student?.name || ''}`}>
        {seqs.length === 0 ? (
          <Empty>{t('Aucune note publiée pour le moment.', 'No grades published yet.', 'Sin notas publicadas.')}</Empty>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-600 min-w-[130px]">
                    {t('Matière', 'Subject', 'Asignatura')}
                  </th>
                  <th className="text-center py-2 px-1 text-xs font-semibold text-gray-400 w-10">
                    {t('Coef', 'Coef', 'Coef')}
                  </th>
                  {seqs.map((s) => (
                    <th key={s} className="text-center py-2 px-1 text-xs font-semibold text-gray-400 w-14">
                      {t('Séq', 'Seq', 'Sec')} {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tops.map((sub) => (
                  <tr key={sub.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2.5 pr-3 text-xs font-medium text-gray-800">{sub.name}</td>
                    <td className="py-2.5 px-1 text-center text-xs text-gray-400">{sub.coef}</td>
                    {seqs.map((s) => {
                      const v = map[sub.id]?.[s];
                      const n = parseFloat(String(v ?? '').replace(',', '.'));
                      return (
                        <td key={s} className="py-2.5 px-1 text-center tabular-nums">
                          {v === 'ABS' ? (
                            <span className="text-xs text-amber-500 font-medium">ABS</span>
                          ) : !Number.isNaN(n) && v ? (
                            <span className={`text-xs font-bold ${n >= pass ? 'text-emerald-600' : 'text-red-500'}`}>
                              {Number.isInteger(n) ? n : n.toFixed(2)}
                            </span>
                          ) : <span className="text-gray-200 text-xs">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={2} className="py-2.5 pr-3 text-xs font-bold text-gray-700">
                    {t('Moyenne générale', 'Overall average', 'Media general')}
                  </td>
                  {seqs.map((s) => {
                    const a = avgFor(s);
                    return (
                      <td key={s} className="py-2.5 px-1 text-center tabular-nums">
                        {a !== null
                          ? <span className={`text-xs font-extrabold ${a >= pass ? 'text-emerald-700' : 'text-red-600'}`}>{a.toFixed(2)}</span>
                          : <span className="text-gray-200 text-xs">—</span>}
                      </td>
                    );
                  })}
                </tr>
                <tr className="bg-gray-50/60">
                  <td colSpan={2} className="py-2 pr-3 text-[11px] text-gray-500">
                    {t('Moyenne de la classe', 'Class average', 'Media de la clase')}
                  </td>
                  {seqs.map((s) => (
                    <td key={s} className="py-2 px-1 text-center text-[11px] text-gray-500 tabular-nums">
                      {statFor(s)?.class_avg?.toFixed?.(2) ?? '—'}
                    </td>
                  ))}
                </tr>
                {showRank && (
                  <tr className="bg-gray-50/60">
                    <td colSpan={2} className="py-2 pr-3 text-[11px] text-gray-500">
                      {t('Rang', 'Rank', 'Puesto')}
                    </td>
                    {seqs.map((s) => {
                      const r = rankFor(s);
                      return (
                        <td key={s} className="py-2 px-1 text-center text-[11px] font-semibold text-gray-700 tabular-nums">
                          {r ? `${r.rank}/${r.size}` : '—'}
                        </td>
                      );
                    })}
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        )}
        <p className="text-[11px] text-gray-300 mt-3">
          {t('Vert = admis', 'Green = pass', 'Verde = aprobado')} (≥ {pass}/{maxScale}) ·{' '}
          {t('Rouge = insuffisant', 'Red = insufficient', 'Rojo = insuficiente')}
          {!showRank && ` · ${t("Le rang n'est pas publié par l'établissement",
                                'Rank is not published by the school',
                                'El puesto no es publicado por el centro')}`}
        </p>
      </Card>

      {(appr.length > 0 || council.some((c) => c.appreciation || c.decision)) && (
        <Card title={t('Appréciations', 'Comments', 'Apreciaciones')}>
          <ul className="space-y-2.5">
            {appr.map((a, i) => (
              <li key={`a${i}`} className="text-sm">
                <span className="text-xs font-semibold text-gray-400 mr-2">
                  {t('Séq', 'Seq', 'Sec')} {a.sequence}
                </span>
                <span className="text-gray-700">{a.text}</span>
              </li>
            ))}
            {council.filter((c) => c.appreciation || c.decision).map((c, i) => (
              <li key={`c${i}`} className="text-sm">
                <span className="text-xs font-semibold text-gray-400 mr-2">
                  {t('Séq', 'Seq', 'Sec')} {c.sequence}
                </span>
                <span className="text-gray-700">{c.appreciation}</span>
                {c.decision && (
                  <span className="ml-2 text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                    {c.decision}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
