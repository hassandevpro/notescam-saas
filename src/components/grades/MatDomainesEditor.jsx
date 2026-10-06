// LE RÉFÉRENTIEL MATERNELLE DE L'ÉCOLE — ajouter, renommer, retirer.
//
// Trois gestes, et ils ne portent pas sur la même chose selon la ligne :
//
//   • DOMAINE NATIONAL (D1–D8, `school_id` NULL) — partagé par les 44 écoles.
//     On ne le renomme PAS en base : son intitulé se surcharge pour cette école
//     par la ligne `subjects` de la classe (domaineLabelOverrides), et « retirer »
//     le MASQUE chez elle. Les autres établissements ne voient rien passer.
//
//   • DOMAINE MAISON (`school_id` = l'école) — à elle seule. Renommé et supprimé
//     pour de bon.
//
// La RLS dit la même chose (supabase_mat_domaines_par_ecole.sql) : l'écriture
// n'est possible que sur une ligne dont `school_id` est le sien. L'écran ne
// propose donc jamais un geste que la base refuserait.

import { useMemo, useState } from 'react';
import { useSchoolStore } from '../../store/schoolStore';
import { useAuthStore } from '../../store/authStore';
import { useT } from '../../lib/i18n';
import { toast } from '../../store/toastStore';
import { domainesForMaternelle } from '../../core/matEngine';
import { matDomaineLabel } from '../../core/referentielI18n';

export default function MatDomainesEditor({ sys = 'FR', classId, onClose }) {
  const t = useT();
  const schoolId = useAuthStore((s) => s.school?.id);

  const referentiel = useSchoolStore((s) => s.matReferentiel);
  const masques     = useSchoolStore((s) => s.matMasques);
  const subjects    = useSchoolStore((s) => s.subjects);
  const addDomaine     = useSchoolStore((s) => s.addMatDomaineMaison);
  const renameDomaine  = useSchoolStore((s) => s.renameMatDomaineMaison);
  const removeDomaine  = useSchoolStore((s) => s.removeMatDomaine);
  const restoreDomaine = useSchoolStore((s) => s.restoreMatDomaine);
  const updateSubject  = useSchoolStore((s) => s.updateSubject);

  const [nouveau, setNouveau] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  const tous = useMemo(() => domainesForMaternelle(referentiel), [referentiel]);

  // La ligne `subjects` de la classe qui porte ce domaine : c'est elle qui tient
  // le nom affiché pour un domaine national.
  const subjectFor = (domaineId) =>
    subjects.find((s) => s.class_id === classId && s.mat_domaine_id === domaineId) || null;

  const nomAffiche = (d) => {
    if (d.school_id) return d.intitule;                 // maison : son vrai nom
    return subjectFor(d.id)?.name || matDomaineLabel(d, sys);
  };

  const parle = async (p, okMsg) => {
    setBusy(true);
    try {
      const r = await p;
      if (r?.error === 'offline') toast.error(t('Connexion requise pour modifier le référentiel.', 'Connection required to edit the framework.'));
      else if (r?.error === 'existe') toast.error(t('Ce domaine existe déjà.', 'That domain already exists.'));
      else if (r?.error) toast.error(t('Modification refusée.', 'Change refused.'));
      else if (okMsg) toast.success(okMsg);
      return !r?.error;
    } finally { setBusy(false); }
  };

  const handleRename = async (d, nom) => {
    const v = String(nom || '').trim();
    if (!v || v === nomAffiche(d)) return;
    if (d.school_id) { await parle(renameDomaine(d.id, v)); return; }
    // National : on surcharge via la ligne `subjects` de la classe.
    const sub = subjectFor(d.id);
    if (!sub) {
      toast.error(t('Ouvrez d’abord la classe pour que ses domaines soient créés.',
                    'Open the class first so its domains get created.'));
      return;
    }
    setBusy(true);
    try { await updateSubject(sub.id, { name: v }); } finally { setBusy(false); }
  };

  const handleRemove = async (d) => {
    const ok = await parle(removeDomaine(d.id));
    if (ok) setConfirmId(null);
  };

  const handleAdd = async () => {
    const v = nouveau.trim();
    if (!v) return;
    if (await parle(addDomaine(v))) setNouveau('');
  };

  const visibles = tous.filter((d) => !masques.includes(d.id));
  const caches   = tous.filter((d) => masques.includes(d.id));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-bold text-gray-900">{t('Domaines de la maternelle', 'Nursery domains')}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {t('Renommez, retirez, ou ajoutez les vôtres. Rien ne sort de votre établissement.',
                 'Rename, remove, or add your own. Nothing leaves your school.')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            {visibles.map((d) => (
              <div key={d.id} className="flex items-center gap-2 px-3 py-2 border-b border-gray-50 last:border-0">
                <span className="w-9 shrink-0 text-[11px] font-bold text-gray-400">{d.code || '—'}</span>
                <input
                  type="text" defaultValue={nomAffiche(d)} disabled={busy}
                  onBlur={(e) => handleRename(d, e.target.value)}
                  className="flex-1 min-w-0 rounded border border-gray-200 px-2 py-1 text-sm"
                />
                {d.school_id
                  ? <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-50 text-brand-600">{t('maison', 'own')}</span>
                  : <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{t('officiel', 'official')}</span>}
                {confirmId === d.id ? (
                  <button type="button" disabled={busy} onClick={() => handleRemove(d)}
                    className="shrink-0 text-xs font-bold text-red-600">✓</button>
                ) : (
                  <button type="button" disabled={busy} onClick={() => setConfirmId(d.id)}
                    title={d.school_id ? t('Supprimer', 'Delete') : t('Masquer dans cette école', 'Hide in this school')}
                    className="shrink-0 text-gray-300 hover:text-red-500">×</button>
                )}
              </div>
            ))}
          </div>

          {confirmId && (
            <p className="text-xs text-red-600">
              {tous.find((d) => d.id === confirmId)?.school_id
                ? t('Cliquez sur ✓ pour supprimer. Impossible si des observations y sont déjà rattachées.',
                    'Click ✓ to delete. Not possible if observations are already attached to it.')
                : t('Cliquez sur ✓ pour le masquer dans votre école. Le domaine officiel reste intact pour les autres établissements.',
                    'Click ✓ to hide it in your school. The official domain stays intact for other schools.')}
            </p>
          )}

          <div className="flex gap-2">
            <input
              type="text" value={nouveau} onChange={(e) => setNouveau(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              placeholder={t('Nouveau domaine propre à votre école…', 'New domain of your own…')}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <button type="button" onClick={handleAdd} disabled={!nouveau.trim() || busy}
              className="btn-primary" style={{ width: 'auto', paddingInline: '1.25rem' }}>
              {t('Ajouter', 'Add')}
            </button>
          </div>

          {caches.length > 0 && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {t('Masqués dans votre école', 'Hidden in your school')}
              </p>
              <div className="flex flex-wrap gap-2">
                {caches.map((d) => (
                  <button key={d.id} type="button" disabled={busy}
                    onClick={() => parle(restoreDomaine(d.id))}
                    className="text-xs rounded-full border border-gray-200 px-3 py-1 text-gray-500 hover:bg-gray-50">
                    {matDomaineLabel(d, sys)} ↩
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
