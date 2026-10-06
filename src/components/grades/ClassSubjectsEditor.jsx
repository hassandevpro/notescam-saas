// GÉRER LES MATIÈRES D'UNE CLASSE, depuis l'écran de saisie.
//
// L'écran Classes (/app/classes) est une page d'ADMINISTRATION : création et
// suppression de classes, zone de danger, périmètres. On n'y envoie pas une
// enseignante pour qu'elle renomme un domaine. Ce panneau n'expose que les
// matières de LA classe ouverte, rien d'autre.
//
// Qui peut quoi est décidé par teacherScope — miroir exact de la policy RLS.
// Une ligne que la base refuserait n'est pas rendue modifiable : sinon l'écriture
// part en file hors-ligne et y tourne en boucle, sans rien dire.

import { useMemo, useState } from 'react';
import { useSchoolStore } from '../../store/schoolStore';
import { useT } from '../../lib/i18n';
import { toast } from '../../store/toastStore';
import { canManageClassSubjects, canEditSubjectRow } from '../../lib/teacherScope';

// Barème par défaut selon le système de la classe (comme l'auto-config).
const defaultMax = (cls) => ((cls?.system || 'FR') === 'EN' ? 100 : 20);

export default function ClassSubjectsEditor({
  cls, role, school, teacherId, isDelegate = false, teachers = [], onClose,
}) {
  const t = useT();
  const subjects      = useSchoolStore((s) => s.subjects);
  const addSubject    = useSchoolStore((s) => s.addSubject);
  const updateSubject = useSchoolStore((s) => s.updateSubject);
  const deleteSubject = useSchoolStore((s) => s.deleteSubject);

  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  const canManage = canManageClassSubjects({ role, school, cls, teacherId, isDelegate });
  const isMaternelle = (cls?.cycle || '') === 'maternelle';

  const rows = useMemo(
    () => subjects
      .filter((s) => s.class_id === cls?.id)
      .sort((a, b) => (a.position ?? 99) - (b.position ?? 99) || String(a.name).localeCompare(String(b.name))),
    [subjects, cls?.id],
  );

  const mot = isMaternelle
    ? { un: t('domaine', 'domain'), des: t('Domaines', 'Domains') }
    : { un: t('matière', 'subject'), des: t('Matières', 'Subjects') };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    if (rows.some((r) => String(r.name).toLowerCase() === name.toLowerCase())) {
      toast.error(t('Ce nom existe déjà dans cette classe.', 'That name already exists in this class.'));
      return;
    }
    setBusy(true);
    try {
      await addSubject({
        class_id: cls.id, name, coef: 1, max: defaultMax(cls),
        position: rows.length, teacher_id: canManage ? null : teacherId,
      });
      setNewName('');
    } finally { setBusy(false); }
  };

  const patch = (sub, data) => updateSubject(sub.id, data);

  const handleDelete = async (sub) => {
    setBusy(true);
    try { await deleteSubject(sub.id); setConfirmId(null); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-bold text-gray-900">{mot.des} — {cls?.name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {canManage
                ? t(`Ajoutez, renommez ou retirez les ${isMaternelle ? 'domaines' : 'matières'} de cette classe.`,
                    `Add, rename or remove this class's ${isMaternelle ? 'domains' : 'subjects'}.`)
                : t('Vous pouvez modifier les lignes qui vous sont affectées.',
                    'You can edit the rows assigned to you.')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Le préscolaire officiel ne se configure pas ici : ses domaines sont
              nationaux et arrivent du référentiel, pas de cette liste. */}
          {isMaternelle && (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-600">
              {t("Si votre école suit le référentiel officiel MINEDUB, les 8 domaines (D1–D8) viennent du ministère et s'impriment déjà sur le bulletin : cette liste ne sert qu'aux domaines PROPRES à votre école.",
                 'If your school follows the official MINEDUB framework, the 8 domains (D1–D8) come from the ministry and already print on the report card: this list is only for your school’s OWN domains.')}
            </div>
          )}

          {rows.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              {t(`Aucune ${mot.un} dans cette classe.`, `No ${mot.un} in this class.`)}
            </p>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1fr_64px_64px_32px] gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                <div>{t('Nom', 'Name')}</div>
                <div className="text-center">Coef</div>
                <div className="text-center">/ Max</div>
                <div />
              </div>
              {rows.map((sub) => {
                const editable = canEditSubjectRow({ role, school, cls, teacherId, subject: sub, isDelegate });
                const prof = teachers.find((x) => x.id === sub.teacher_id);
                return (
                  <div key={sub.id} className={`grid grid-cols-[1fr_64px_64px_32px] gap-2 items-center px-3 py-2 border-b border-gray-50 last:border-0 ${editable ? '' : 'bg-gray-50/60'}`}>
                    <div className="min-w-0">
                      <input
                        type="text"
                        defaultValue={sub.name}
                        disabled={!editable || busy}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== sub.name) patch(sub, { name: v });
                          else e.target.value = sub.name;
                        }}
                        className="w-full rounded border border-gray-200 px-2 py-1 text-sm disabled:bg-transparent disabled:border-transparent disabled:text-gray-500"
                      />
                      {prof && (
                        <span className="block text-[11px] text-gray-400 px-2">{prof.name}</span>
                      )}
                    </div>
                    <input
                      type="number" min="0" step="1" defaultValue={sub.coef ?? 1}
                      disabled={!editable || busy}
                      onBlur={(e) => {
                        const n = parseFloat(e.target.value);
                        if (Number.isFinite(n) && n >= 0 && n !== sub.coef) patch(sub, { coef: n });
                        else e.target.value = sub.coef ?? 1;
                      }}
                      className="w-full text-center rounded border border-gray-200 px-1 py-1 text-sm disabled:bg-transparent disabled:border-transparent disabled:text-gray-500"
                    />
                    <input
                      type="number" min="1" step="1" defaultValue={sub.max ?? defaultMax(cls)}
                      disabled={!editable || busy}
                      onBlur={(e) => {
                        const n = parseFloat(e.target.value);
                        if (Number.isFinite(n) && n > 0 && n !== sub.max) patch(sub, { max: n });
                        else e.target.value = sub.max ?? defaultMax(cls);
                      }}
                      className="w-full text-center rounded border border-gray-200 px-1 py-1 text-sm disabled:bg-transparent disabled:border-transparent disabled:text-gray-500"
                    />
                    <div className="text-center">
                      {canManage && (
                        confirmId === sub.id ? (
                          <button type="button" disabled={busy} onClick={() => handleDelete(sub)}
                            title={t('Confirmer la suppression', 'Confirm deletion')}
                            className="text-xs font-bold text-red-600 hover:text-red-700">✓</button>
                        ) : (
                          <button type="button" disabled={busy} onClick={() => setConfirmId(sub.id)}
                            title={t('Retirer', 'Remove')}
                            className="text-gray-300 hover:text-red-500 text-sm">×</button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {confirmId && (
            <p className="text-xs text-red-600">
              {t('Cliquez sur ✓ pour confirmer. Les notes déjà saisies sur cette ligne seront perdues.',
                 'Click ✓ to confirm. Any marks already entered on that row will be lost.')}
            </p>
          )}

          {canManage && (
            <div className="flex gap-2">
              <input
                type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                placeholder={t(`Nouvelle ${mot.un}…`, `New ${mot.un}…`)}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <button type="button" onClick={handleAdd} disabled={!newName.trim() || busy} className="btn-primary" style={{ width: 'auto', paddingInline: '1.25rem' }}>
                {t('Ajouter', 'Add')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
