import { useEffect, useState, useCallback } from 'react';
import Modal from '../Modal';
import { useT } from '../../lib/i18n';
import { toast } from '../../store/toastStore';
import { copyText } from '../../lib/clipboard';
import {
  fetchParentLinks, createParentAccount, revokeParentLink, generateParentPassword,
} from '../../lib/parentAccounts';

// COMPTES PARENTS d'un élève — côté école (fiche élève).
//
// Cet écran ne décide d'aucun droit. Les deux règles qui comptent sont en base :
//   • admin_create_parent_account REFUSE un compte déjà présent dans
//     school_users (personnel et parent ne se croisent jamais) ;
//   • admin_link_parent_student passe par user_scope_allows_student — un
//     responsable du Collège ne rattache pas un parent à un élève du Primaire.
// Ici, on se contente d'appeler et d'afficher ce que le serveur répond.
const RELATIONS = [
  ['pere',   ['Père', 'Father', 'Padre']],
  ['mere',   ['Mère', 'Mother', 'Madre']],
  ['tuteur', ['Tuteur', 'Guardian', 'Tutor']],
  ['autre',  ['Autre responsable', 'Other guardian', 'Otro responsable']],
];

export default function ParentAccountsModal({ student, onClose }) {
  const t = useT();
  const [links, setLinks]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);   // { email, password } à remettre à la famille

  const [form, setForm] = useState({
    fullName: student?.nom_pere || student?.tuteur || '',
    email: '',
    phone: student?.parent_phone || student?.tel_pere || '',
    relationship: 'tuteur',
  });

  const reload = useCallback(async () => {
    setLoading(true);
    setLinks(await fetchParentLinks(student.id));
    setLoading(false);
  }, [student.id]);

  useEffect(() => { reload(); }, [reload]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.email.trim()) return;
    setCreating(true);
    const password = generateParentPassword();
    try {
      const res = await createParentAccount({
        email: form.email, password, fullName: form.fullName.trim() || form.email,
        phone: form.phone.trim() || null,
        studentId: student.id, relationship: form.relationship,
        isPrimary: links.filter((l) => l.active).length === 0,
      });
      // Le mot de passe n'est affiché QU'ICI et QU'UNE FOIS : il n'est stocké
      // nulle part côté application. Si la famille le perd, on en régénère un.
      setCreated({ email: res.email, password });
      setForm((f) => ({ ...f, email: '', fullName: '' }));
      await reload();
    } catch (err) {
      toast.error(err.message === 'EMAIL_IN_USE'
        ? t('Cette adresse est déjà utilisée avec un autre mot de passe.',
             'This address is already used with a different password.',
             'Esta dirección ya se usa con otra contraseña.')
        : err.message);
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (linkId) => {
    const { error } = await revokeParentLink(linkId);
    if (error) { toast.error(error.message); return; }
    toast.success(t('Accès retiré', 'Access revoked', 'Acceso retirado'));
    await reload();
  };

  const active  = links.filter((l) => l.active);
  const revoked = links.filter((l) => !l.active);

  return (
    <Modal onClose={onClose} title={`${t('Comptes parents', 'Parent accounts', 'Cuentas de padres')} — ${student.name}`}>
      <div className="space-y-5">
        {/* Comptes rattachés */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
            {t('Accès en cours', 'Current access', 'Accesos vigentes')}
          </h3>
          {loading ? (
            <p className="text-sm text-gray-400 animate-pulse py-3">{t('Chargement…', 'Loading…', 'Cargando…')}</p>
          ) : active.length === 0 ? (
            <p className="text-sm text-gray-400 py-3">
              {t('Aucun parent ne suit encore cet élève.', 'No parent follows this student yet.', 'Ningún padre sigue aún a este alumno.')}
            </p>
          ) : (
            <ul className="divide-y divide-gray-50 border border-gray-100 rounded-xl">
              {active.map((l) => (
                <li key={l.link_id} className="px-3 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{l.full_name || l.email}</p>
                    <p className="text-[11px] text-gray-400">
                      {l.email}{l.phone ? ` · ${l.phone}` : ''}
                      {l.is_primary ? ` · ${t('contact principal', 'primary contact', 'contacto principal')}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => revoke(l.link_id)}
                    className="text-xs font-semibold text-red-500 hover:text-red-600 shrink-0"
                  >
                    {t('Retirer', 'Revoke', 'Retirar')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Identifiants fraîchement créés */}
        {created && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-800 mb-2">
              {t('Compte créé — à remettre à la famille',
                 'Account created — hand these to the family',
                 'Cuenta creada — entréguelas a la familia')}
            </p>
            <dl className="text-sm space-y-1">
              <div className="flex gap-2">
                <dt className="text-emerald-700 w-24 shrink-0">{t('Adresse', 'Email', 'Correo')}</dt>
                <dd className="font-mono text-emerald-900">{created.email}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-emerald-700 w-24 shrink-0">{t('Mot de passe', 'Password', 'Contraseña')}</dt>
                <dd className="font-mono text-emerald-900">{created.password}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-emerald-700 w-24 shrink-0">{t('Adresse web', 'Web address', 'Dirección')}</dt>
                <dd className="font-mono text-emerald-900">{window.location.origin}/parent</dd>
              </div>
            </dl>
            <button
              onClick={() => {
                copyText(`${window.location.origin}/parent\n${created.email}\n${created.password}`);
                toast.success(t('Identifiants copiés', 'Credentials copied', 'Credenciales copiadas'));
              }}
              className="mt-3 text-xs font-semibold text-emerald-700 hover:underline"
            >
              {t('Copier les identifiants', 'Copy credentials', 'Copiar credenciales')}
            </button>
            <p className="text-[11px] text-emerald-700/70 mt-2">
              {t("Ce mot de passe n'est affiché qu'une fois et n'est enregistré nulle part. En cas de perte, créez-en un nouveau.",
                 'This password is shown once and stored nowhere. If lost, create a new one.',
                 'Esta contraseña se muestra una vez y no se guarda. Si se pierde, cree otra.')}
            </p>
          </div>
        )}

        {/* Création */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
            {t('Donner accès à un parent', 'Give a parent access', 'Dar acceso a un padre')}
          </h3>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  {t('Nom du parent', 'Parent name', 'Nombre del padre')}
                </label>
                <input type="text" value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  {t('Lien de parenté', 'Relationship', 'Vínculo')}
                </label>
                <select value={form.relationship}
                  onChange={(e) => setForm({ ...form, relationship: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                  {RELATIONS.map(([v, label]) => (
                    <option key={v} value={v}>{t(...label)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  {t('Adresse e-mail', 'Email address', 'Correo electrónico')} *
                </label>
                <input type="email" required value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  {t('Téléphone', 'Phone', 'Teléfono')}
                </label>
                <input type="tel" value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              </div>
            </div>
            <button type="submit" disabled={creating} className="btn-primary disabled:opacity-50">
              {creating
                ? t('Création…', 'Creating…', 'Creando…')
                : t('Créer le compte et rattacher', 'Create and link', 'Crear y vincular')}
            </button>
          </form>
          <p className="text-[11px] text-gray-400 mt-2">
            {t("Si ce parent a déjà un compte pour un autre de ses enfants, saisissez la même adresse : ses enfants seront regroupés dans un seul espace.",
               'If this parent already has an account for another child, use the same address: all children appear in one space.',
               'Si este padre ya tiene cuenta por otro hijo, use la misma dirección: todos sus hijos aparecerán en un solo espacio.')}
          </p>
        </section>

        {revoked.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
              {t('Accès retirés', 'Revoked access', 'Accesos retirados')}
            </h3>
            <ul className="text-xs text-gray-400 space-y-1">
              {revoked.map((l) => (
                <li key={l.link_id}>
                  {l.full_name || l.email} — {t('retiré le', 'revoked on', 'retirado el')}{' '}
                  {l.revoked_at ? new Date(l.revoked_at).toLocaleDateString() : '—'}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}
