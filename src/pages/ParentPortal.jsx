import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

function fmt(n) {
  return new Intl.NumberFormat('fr-FR').format(n ?? 0) + ' FCFA';
}

function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function calcSeqAvg(subjects, gradeMap, seq, sys) {
  let sw = 0, tc = 0;
  (subjects || []).forEach((sub) => {
    const v = gradeMap[sub.id]?.[seq];
    if (!v || v === 'ABS' || v === '') return;
    const num = parseFloat(v);
    if (isNaN(num)) return;
    sw += (num / (sub.max || 20)) * (sys === 'FR' ? 20 : 100) * (sub.coef || 1);
    tc += sub.coef || 1;
  });
  return tc ? Math.round((sw / tc) * 100) / 100 : null;
}

const SEQ_LABELS = ['Séq 1', 'Séq 2', 'Séq 3', 'Séq 4', 'Séq 5', 'Séq 6'];

export default function ParentPortal() {
  const { token } = useParams();
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data: result, error: err } = await supabase.rpc('get_parent_portal_data', { p_token: token });
      if (err) { setError(err.message); setLoading(false); return; }
      if (!result) { setError('Lien invalide ou expiré.'); setLoading(false); return; }
      setData(result);
      setLoading(false);
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 animate-pulse text-sm">Chargement…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-5">
        <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Lien invalide</h2>
          <p className="text-gray-500 text-sm">{error || 'Ce lien parent n\'est pas valide.'}</p>
        </div>
      </div>
    );
  }

  const { student, class: cls, school, fee, subjects, grades } = data;
  const sys      = cls?.system || 'FR';
  const maxScale = sys === 'FR' ? 20 : 100;
  const pass     = sys === 'FR' ? 10 : 50;

  // Build grade map: { [subject_id]: { [sequence]: value } }
  const gradeMap = {};
  (grades || []).forEach(({ subject_id, sequence, value }) => {
    if (!gradeMap[subject_id]) gradeMap[subject_id] = {};
    gradeMap[subject_id][sequence] = value;
  });

  const seqAvgs = [1, 2, 3, 4, 5, 6].map((seq) => calcSeqAvg(subjects, gradeMap, seq, sys));

  const feeStatus = !fee || !fee.frais_annuels ? 'none'
    : fee.frais_payes >= fee.frais_annuels ? 'paid'
    : fee.frais_payes > 0 ? 'partial'
    : 'unpaid';

  const feePct = fee?.frais_annuels
    ? Math.min(100, Math.round(((fee.frais_payes || 0) / fee.frais_annuels) * 100))
    : 0;

  const genderLabel = student.gender === 'Masculin' ? '♂ Masculin'
    : student.gender === 'Feminin' ? '♀ Féminin'
    : student.gender;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          {school?.logo_url ? (
            <img src={school.logo_url} alt="logo" className="w-10 h-10 rounded-xl object-contain border border-gray-100" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600 font-bold text-lg">
              {(school?.name || 'N')[0]}
            </div>
          )}
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest leading-none">Portail Parents</p>
            <h1 className="text-base font-bold text-gray-900 leading-tight">{school?.name}</h1>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {/* Carte élève */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-3">Élève</p>
          <h2 className="text-xl font-bold text-gray-900">{student.name}</h2>
          <div className="flex flex-wrap gap-2 mt-2">
            {student.matricule && (
              <span className="text-xs font-mono bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                {student.matricule}
              </span>
            )}
            {cls && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                {cls.name}
              </span>
            )}
            {student.gender && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                student.gender === 'Masculin' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'
              }`}>
                {genderLabel}
              </span>
            )}
            {student.date_naissance && (
              <span className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded">
                Né(e) le {fmtDate(student.date_naissance)}
              </span>
            )}
          </div>
        </div>

        {/* Carte frais */}
        {fee && fee.frais_annuels > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-4">Frais de scolarité</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Montant annuel</p>
                <p className="font-bold text-gray-900 text-sm">{fmt(fee.frais_annuels)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Montant payé</p>
                <p className={`font-bold text-sm ${
                  feeStatus === 'paid' ? 'text-emerald-600'
                  : feeStatus === 'partial' ? 'text-amber-600'
                  : 'text-red-500'
                }`}>
                  {fmt(fee.frais_payes || 0)}
                </p>
              </div>
              {feeStatus !== 'paid' && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Solde restant</p>
                  <p className="font-bold text-red-500 text-sm">{fmt(fee.frais_annuels - (fee.frais_payes || 0))}</p>
                </div>
              )}
              {fee.date_dernier_paiement && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Dernier paiement</p>
                  <p className="text-sm text-gray-700">{fmtDate(fee.date_dernier_paiement)}</p>
                </div>
              )}
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  feeStatus === 'paid' ? 'bg-emerald-500'
                  : feeStatus === 'partial' ? 'bg-amber-400'
                  : 'bg-red-400'
                }`}
                style={{ width: `${feePct}%` }}
              />
            </div>
            <p className="text-xs text-right mt-1 text-gray-400">{feePct}% payé</p>
          </div>
        )}

        {/* Tableau de notes */}
        {subjects && subjects.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-4">
              Notes — Système {sys} (/{maxScale})
            </p>
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-600 min-w-[120px]">Matière</th>
                    <th className="text-center py-2 px-1 text-xs font-semibold text-gray-400 w-8">Coef</th>
                    {SEQ_LABELS.map((l) => (
                      <th key={l} className="text-center py-2 px-1 text-xs font-semibold text-gray-400 w-12">{l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((sub) => (
                    <tr key={sub.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2.5 pr-3 text-xs font-medium text-gray-800">{sub.name}</td>
                      <td className="py-2.5 px-1 text-center text-xs text-gray-400">{sub.coef}</td>
                      {[1, 2, 3, 4, 5, 6].map((seq) => {
                        const v = gradeMap[sub.id]?.[seq];
                        const isAbs = v === 'ABS';
                        const num = !isAbs && v ? parseFloat(v) : null;
                        return (
                          <td key={seq} className="py-2.5 px-1 text-center">
                            {isAbs ? (
                              <span className="text-xs text-amber-500 font-medium">ABS</span>
                            ) : num !== null ? (
                              <span className={`text-xs font-bold ${num >= pass ? 'text-emerald-600' : 'text-red-500'}`}>
                                {Number.isInteger(num) ? num : num.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-gray-200 text-xs">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td colSpan={2} className="py-3 pr-3 text-xs font-bold text-gray-700">Moyenne générale</td>
                    {seqAvgs.map((avg, i) => (
                      <td key={i} className="py-3 px-1 text-center">
                        {avg !== null ? (
                          <span className={`text-xs font-extrabold ${avg >= pass ? 'text-emerald-700' : 'text-red-600'}`}>
                            {avg.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-gray-200 text-xs">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-gray-300 mt-3">
              Vert = admis ({sys === 'FR' ? '≥ 10/20' : '≥ 50/100'}) · Rouge = insuffisant
            </p>
          </div>
        )}

        <p className="text-center text-xs text-gray-300 pb-6">
          NotesCam · Données réservées à la famille de l'élève
        </p>
      </div>
    </div>
  );
}
