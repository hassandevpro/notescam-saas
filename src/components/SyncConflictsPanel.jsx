// src/components/SyncConflictsPanel.jsx
// Les désaccords de synchronisation, et de quoi les trancher.
//
// POURQUOI CET ÉCRAN. Le moteur de fusion refuse d'écraser une note, une
// période verrouillée ou un encaissement en silence : il garde la valeur de
// l'école et inscrit le désaccord (server/syncMerge.js). Tant que rien ne
// l'affichait, ce refus ne servait à rien — le conflit était inscrit et
// personne ne le voyait : le même oubli, mieux rangé. C'était écrit comme un
// manque assumé au §7 de docs/SYNCHRONISATION.md ; cet écran le ferme.
//
// CE QUE L'ÉCRAN DOIT DIRE, ET QUI N'EST PAS ÉVIDENT. « Local » et « distant »
// ne veulent rien dire pour une secrétaire. On écrit « à l'école » et « en
// ligne », parce que c'est ainsi que la question se pose devant elle : qui a
// raison, celle qui a saisi ici, ou celui qui a saisi sur le site ?
import { useEffect, useState } from 'react';
import { lanFetch } from '../lib/lanFetch';

const dt = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR') : '—');

// Une valeur vide n'est pas rien : un numéro jamais saisi et un numéro EFFACÉ
// ne disent pas la même chose, et la personne qui tranche doit voir la
// différence. On ne les affiche donc pas tous les deux comme une case vide.
function Valeur({ v }) {
  if (v === null || v === undefined) {
    return <span className="italic text-gray-400">(vide)</span>;
  }
  if (String(v) === '') return <span className="italic text-gray-400">(chaîne vide)</span>;
  return <span className="font-semibold break-all">{String(v)}</span>;
}

// Les tables et colonnes portent des noms techniques. Ce qui compte pour la
// personne qui tranche, c'est de quoi on parle.
const NOM_TABLE = {
  grades: 'Note', students: 'Élève', student_fees: 'Frais de l’élève',
  fee_payments: 'Versement', academic_periods: 'Période', cash_sessions: 'Caisse',
  classes: 'Classe', teachers: 'Enseignant', subjects: 'Matière',
  parent_student_links: 'Lien parent / élève',
};
const NOM_COL = {
  value: 'valeur de la note', is_locked: 'verrouillage', status: 'état',
  matricule: 'matricule', name: 'nom', frais_annuels: 'frais annuels',
  frais_payes: 'montant payé', amount: 'montant', receipt_no: 'n° de reçu',
  counted_cash: 'espèces comptées', variance: 'écart de caisse',
  archived_at: 'archivage', teaching_start: 'début des cours',
  teaching_end: 'fin des cours', entry_deadline: 'date limite de saisie',
};

export default function SyncConflictsPanel() {
  const [conflits, setConflits] = useState([]);
  const [compte, setCompte] = useState({ total: 0, aArbitrer: 0 });
  const [occupe, setOccupe] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [tous, setTous] = useState(false);

  const charger = () => lanFetch(`/api/sync/conflicts${tous ? '?tous=1' : ''}`)
    .then((d) => { setConflits(d?.conflits || []); setCompte(d?.compte || { total: 0, aArbitrer: 0 }); })
    .catch((e) => setErreur(e.message));

  useEffect(() => {
    charger();
    const t = setInterval(charger, 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tous]);

  const trancher = async (id, choix) => {
    setOccupe(id); setErreur(null);
    try {
      await lanFetch('/api/sync/conflicts/resolve', { method: 'POST', body: { id, choix } });
      await charger();
    } catch (e) {
      setErreur(e.message);
    } finally {
      setOccupe(null);
    }
  };

  // Rien à arbitrer et rien à relire : on n'affiche pas un panneau vide, qui
  // ferait croire à un module en panne. On dit que c'est en ordre.
  if (!compte.total && !tous && !conflits.length) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-500 shadow-sm">
        <span className="font-semibold text-green-700">✔ Aucun désaccord</span> — aucune
        donnée n’a été modifiée des deux côtés à la fois depuis le dernier contrôle.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <h2 className="text-sm font-bold text-gray-900">
          Désaccords à trancher
          {compte.aArbitrer > 0 && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
              {compte.aArbitrer} en attente
            </span>
          )}
        </h2>
        <button className="text-xs text-blue-600 hover:underline" onClick={() => setTous(!tous)}>
          {tous ? 'Ne montrer que les ouverts' : 'Voir aussi ceux déjà tranchés'}
        </button>
      </div>

      <p className="px-3 pb-2 text-xs text-gray-500">
        Ces données ont été modifiées <strong>à l’école et en ligne</strong>, sur le même
        champ. Pour une note, une période verrouillée ou un encaissement, la valeur de
        l’école a été conservée et rien n’a été écrasé : c’est à vous de dire laquelle
        garder. Les lignes marquées <em>auto</em> ont été tranchées par le moteur ; vous
        pouvez revenir dessus. Votre choix repart vers le Cloud.
      </p>

      {erreur && (
        <div className="mx-3 mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {erreur}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-2 py-1 text-left">Vu le</th>
              <th className="px-2 py-1 text-left">Donnée</th>
              <th className="px-2 py-1 text-left">À l’école</th>
              <th className="px-2 py-1 text-left">En ligne</th>
              <th className="px-2 py-1 text-left">Valeur d’avant</th>
              <th className="px-2 py-1 text-right">Décision</th>
            </tr>
          </thead>
          <tbody>
            {conflits.map((c) => {
              const tranche = !!c.resolved_at;
              return (
                <tr key={c.id} className={`border-t border-gray-100 ${tranche ? 'opacity-60' : ''}`}>
                  <td className="px-2 py-1.5 whitespace-nowrap text-gray-500">{dt(c.at)}</td>
                  <td className="px-2 py-1.5">
                    <div className="font-semibold text-gray-900">
                      {NOM_TABLE[c.tablename] || c.tablename}
                      <span className="ml-1 font-normal text-gray-500">
                        — {NOM_COL[c.col] || c.col}
                      </span>
                    </div>
                    <div className="font-mono text-[10px] text-gray-400">
                      {c.tablename}/{String(c.row_id).slice(0, 12)}
                    </div>
                  </td>
                  <td className="px-2 py-1.5"><Valeur v={c.val_local} /></td>
                  <td className="px-2 py-1.5"><Valeur v={c.val_distant} /></td>
                  <td className="px-2 py-1.5 text-gray-400"><Valeur v={c.val_base} /></td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    {tranche ? (
                      <span className="text-gray-500">
                        {c.retenu === 'distant' ? 'en ligne' : 'école'} · {dt(c.resolved_at)}
                      </span>
                    ) : (
                      <div className="inline-flex items-center gap-1">
                        {/* Le moteur a tranché seul (champ ordinaire disputé) : ce
                            n'est pas une tâche, c'est une information. Sans cette
                            mention, trois lignes portaient des boutons alors que le
                            compteur n'en annonçait que deux — vu sur la capture du
                            02/11/2026, et incompréhensible pour qui arbitre. */}
                        {c.retenu && (
                          <span className="mr-1 rounded-full bg-gray-100 px-2 py-0.5 font-normal text-gray-500">
                            auto : {c.retenu === 'distant' ? 'en ligne' : 'école'}
                          </span>
                        )}
                        <button
                          disabled={occupe === c.id}
                          onClick={() => trancher(c.id, 'local')}
                          className="rounded-lg bg-gray-900 px-2 py-1 font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
                        >
                          Garder l’école
                        </button>
                        <button
                          disabled={occupe === c.id}
                          onClick={() => trancher(c.id, 'distant')}
                          className="rounded-lg border border-gray-300 px-2 py-1 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Prendre en ligne
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!conflits.length && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                Aucun désaccord {tous ? 'enregistré' : 'ouvert'}.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
