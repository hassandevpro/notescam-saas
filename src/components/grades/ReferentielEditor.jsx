// ÉDITER LE RÉFÉRENTIEL DE SON ÉCOLE — écran commun aux trois moteurs officiels.
//
// Maternelle (domaines), premier cycle APC et primaire MINEDUB posent le même
// geste à l'utilisateur, donc ils partagent le même écran. Ce qui change d'un
// moteur à l'autre — le mot employé, le contexte d'une ligne nouvelle — arrive
// en props ; le MÉCANISME est le même, et une correction sert aux trois.
//
// DEUX NATURES DE LIGNE, et c'est tout l'écran :
//
//   • NATIONALE — partagée par les 44 écoles de la plateforme. On ne la renomme
//     ni ne la supprime : on la MASQUE chez soi (réversible), et son intitulé
//     peut être surchargé localement quand le moteur le permet (maternelle).
//
//   • MAISON — à cette école seule. Renommée et supprimée pour de bon, sauf si
//     des notes y sont déjà rattachées : la clé étrangère les protège, et on
//     propose alors de masquer.
//
// La RLS dit exactement la même chose (supabase_*_par_ecole.sql) : l'écriture
// n'est possible que sur une ligne dont `school_id` est le sien. L'écran ne
// propose donc jamais un geste que la base refuserait — sinon l'écriture partirait
// en file hors-ligne pour y tourner en boucle (cf. cd04fd9).

import { useState } from 'react';
import { useT } from '../../lib/i18n';
import { estNational } from '../../lib/referentielEcole';

export default function ReferentielEditor({
  titre,
  sousTitre,
  lignes = [],              // [{ id, code, intitule, school_id }] — déjà localisées
  masques = [],             // ids masqués par l'école
  schoolId,
  motSingulier,             // « domaine » | « compétence »
  placeholderAjout,
  renommable = () => true,  // (ligne) => peut-on renommer CETTE ligne ?
  onRename,                 // (ligne, nom) => Promise
  onAdd,                    // (nom) => Promise
  onMasquer,                // (ligne) => Promise
  onDemasquer,              // (ligne) => Promise
  onSupprimer,              // (ligne) => Promise<{ liee?: boolean }>
  onResetLibelle,           // (ligne) => Promise — rendre son libellé officiel
  onClose,
}) {
  const t = useT();
  const [nouveau, setNouveau] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  const visibles = lignes.filter((l) => !masques.includes(l.id));
  const caches   = lignes.filter((l) => masques.includes(l.id));

  const run = async (fn) => { setBusy(true); try { return await fn(); } finally { setBusy(false); } };

  const handleRetrait = async (ligne) => {
    await run(async () => {
      if (estNational(ligne)) await onMasquer?.(ligne);
      else                    await onSupprimer?.(ligne);
    });
    setConfirmId(null);
  };

  const handleAdd = async () => {
    const v = nouveau.trim();
    if (!v) return;
    await run(() => onAdd?.(v));
    setNouveau('');
  };

  const cible = lignes.find((l) => l.id === confirmId) || null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-bold text-gray-900">{titre}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {sousTitre || t('Renommez, retirez, ou ajoutez les vôtres. Rien ne sort de votre établissement.',
                              'Rename, remove, or add your own. Nothing leaves your school.')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0">×</button>
        </div>

        <div className="p-5 space-y-4">
          {visibles.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              {t('Rien à afficher ici.', 'Nothing to show here.')}
            </p>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              {visibles.map((l) => {
                const peutRenommer = renommable(l);
                return (
                  <div key={l.id} className="flex items-center gap-2 px-3 py-2 border-b border-gray-50 last:border-0">
                    {l.code && <span className="w-10 shrink-0 text-[11px] font-bold text-gray-400">{l.code}</span>}
                    <input
                      type="text"
                      defaultValue={l.intitule}
                      disabled={busy || !peutRenommer}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== l.intitule) run(() => onRename?.(l, v));
                        else e.target.value = l.intitule;
                      }}
                      className="flex-1 min-w-0 rounded border border-gray-200 px-2 py-1 text-sm disabled:bg-transparent disabled:border-transparent disabled:text-gray-500"
                    />
                    <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      estNational(l) ? 'bg-gray-100 text-gray-500' : 'bg-brand-50 text-brand-600'
                    }`}>
                      {estNational(l)
                        ? (l._override ? t('renommé', 'renamed') : t('officiel', 'official'))
                        : t('maison', 'own')}
                    </span>
                    {/* Une ligne officielle renommée garde son identité : on peut
                        donc toujours lui rendre son libellé ministériel. */}
                    {estNational(l) && l._override && onResetLibelle && (
                      <button type="button" disabled={busy} onClick={() => run(() => onResetLibelle(l))}
                        title={t('Rendre le libellé officiel', 'Restore the official wording')}
                        className="shrink-0 text-gray-300 hover:text-brand-600 text-sm">↩</button>
                    )}
                    {confirmId === l.id ? (
                      <button type="button" disabled={busy} onClick={() => handleRetrait(l)}
                        className="shrink-0 text-xs font-bold text-red-600 hover:text-red-700">✓</button>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => setConfirmId(l.id)}
                        title={estNational(l) ? t('Masquer dans cette école', 'Hide in this school') : t('Supprimer', 'Delete')}
                        className="shrink-0 text-gray-300 hover:text-red-500 text-sm">×</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {cible && (
            <p className="text-xs text-red-600">
              {estNational(cible)
                ? t(`Cliquez sur ✓ pour masquer ${cible.intitule} dans votre école. La ligne officielle reste intacte pour les autres établissements, et vous pouvez la rétablir.`,
                    `Click ✓ to hide ${cible.intitule} in your school. The official row stays intact for other schools, and you can restore it.`)
                : t('Cliquez sur ✓ pour supprimer. Impossible si des notes y sont déjà rattachées — masquez-la plutôt.',
                    'Click ✓ to delete. Not possible if marks are already attached — hide it instead.')}
            </p>
          )}

          <p className="text-xs text-gray-400">
            {t('Renommer une ligne « officiel » ne change que son affichage chez vous : son identité ministérielle, vos notes et le bulletin officiel restent intacts.',
               'Renaming an “official” row only changes how it reads in your school: its ministry identity, your marks and the official report card stay intact.')}
          </p>

          {onAdd && (
            <div className="flex gap-2">
              <input
                type="text" value={nouveau} onChange={(e) => setNouveau(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                placeholder={placeholderAjout || t(`Nouvelle ${motSingulier} propre à votre école…`, `New ${motSingulier} of your own…`)}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <button type="button" onClick={handleAdd} disabled={!nouveau.trim() || busy}
                className="btn-primary" style={{ width: 'auto', paddingInline: '1.25rem' }}>
                {t('Ajouter', 'Add')}
              </button>
            </div>
          )}

          {caches.length > 0 && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {t('Masqués dans votre école', 'Hidden in your school')}
              </p>
              <div className="flex flex-wrap gap-2">
                {caches.map((l) => (
                  <button key={l.id} type="button" disabled={busy}
                    onClick={() => run(() => onDemasquer?.(l))}
                    title={t('Rétablir', 'Restore')}
                    className="text-xs rounded-full border border-gray-200 px-3 py-1 text-gray-500 hover:bg-gray-50">
                    {l.code ? `${l.code} · ` : ''}{l.intitule} ↩
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
