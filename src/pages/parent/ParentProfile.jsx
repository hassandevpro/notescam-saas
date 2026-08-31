import { useState } from 'react';
import { useParentStore } from '../../store/parentStore';
import { useAuthStore } from '../../store/authStore';
import { useT } from '../../lib/i18n';
import { toast } from '../../store/toastStore';
import { childSector, SECTOR_LABEL, RELATIONSHIP_LABEL } from '../../lib/parentService';
import { Card } from './parentUi';

// PROFIL — §3.9.
//
// C'est la SEULE page de tout l'espace parent qui écrit quelque chose, et elle
// n'écrit que la fiche de contact du compte lui-même (`parent_update_profile`).
// Aucune donnée scolaire ni financière n'est modifiable, ici comme ailleurs.
export default function ParentProfile() {
  const t = useT();
  const parent      = useParentStore((s) => s.parent);
  const children    = useParentStore((s) => s.children);
  const saveProfile = useParentStore((s) => s.saveProfile);
  const applyProfile = useAuthStore((s) => s.applyProfile);

  const [fullName, setFullName] = useState(parent?.full_name || '');
  const [phone, setPhone]       = useState(parent?.phone || '');
  const [saving, setSaving]     = useState(false);

  const dirty = fullName !== (parent?.full_name || '') || phone !== (parent?.phone || '');

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveProfile(fullName, phone);
      // Garde l'en-tête et le cache hors-ligne cohérents avec le nom saisi.
      applyProfile({ fullName, phone });
      toast.success(t('Profil mis à jour', 'Profile updated', 'Perfil actualizado'));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card title={t('Mon profil', 'My profile', 'Mi perfil')}>
        <form onSubmit={submit} className="space-y-4 max-w-md">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1" htmlFor="p-name">
              {t('Nom complet', 'Full name', 'Nombre completo')}
            </label>
            <input
              id="p-name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1" htmlFor="p-phone">
              {t('Téléphone', 'Phone', 'Teléfono')}
            </label>
            <input
              id="p-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              {t('Adresse e-mail', 'Email address', 'Correo electrónico')}
            </label>
            <p className="text-sm text-gray-500 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
              {parent?.email || '—'}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">
              {t("L'adresse de connexion se change auprès de l'établissement.",
                 'The sign-in address is changed by the school.',
                 'La dirección de acceso la cambia el centro.')}
            </p>
          </div>
          <button
            type="submit" disabled={!dirty || saving}
            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? t('Enregistrement…', 'Saving…', 'Guardando…') : t('Enregistrer', 'Save', 'Guardar')}
          </button>
        </form>
      </Card>

      <Card title={t('Enfants rattachés', 'Linked children', 'Hijos vinculados')}>
        <ul className="divide-y divide-gray-50">
          {children.map((c) => {
            const sector = childSector(c);
            return (
              <li key={c.student.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">{c.student.name}</p>
                  <p className="text-[11px] text-gray-400">
                    {c.class?.name}{sector ? ` · ${t(...SECTOR_LABEL[sector])}` : ''} · {c.school?.name}
                  </p>
                </div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 shrink-0">
                  {t(...(RELATIONSHIP_LABEL[c.relationship] || RELATIONSHIP_LABEL.autre))}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-[11px] text-gray-400 mt-3">
          {t("Le rattachement d'un enfant est fait par l'établissement. Pour ajouter ou retirer un enfant, contactez le secrétariat.",
             'Child links are managed by the school. To add or remove a child, contact the school office.',
             'Los vínculos los gestiona el centro. Para añadir o quitar un hijo, contacte con la secretaría.')}
        </p>
      </Card>
    </div>
  );
}
