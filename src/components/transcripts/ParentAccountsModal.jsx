import { useEffect, useState, useCallback } from 'react';
import Modal from '../Modal';
import { useT, localeForLang } from '../../lib/i18n';
import { useUiStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../store/toastStore';
import { copyText } from '../../lib/clipboard';
import {
  fetchParentLinks, createParentAccount, linkParentToStudent, revokeParentLink,
  searchParentAccounts, generateParentPassword,
} from '../../lib/parentAccounts';

// COMPTES PARENTS d'un élève — écran d'ADMINISTRATION (liste des élèves et
// fiche élève). À ne pas confondre avec l'espace parent lui-même (/app/parent).
//
// Cet écran ne décide d'aucun droit. Les trois règles qui comptent sont en base
// et valent pour TOUTE école, sans exception codée :
//   • admin_create_parent_account REFUSE un compte déjà présent dans
//     school_users — personnel et parent ne se croisent jamais ;
//   • admin_link_parent_student passe par user_scope_allows_student — on ne
//     rattache un parent qu'à un élève que l'on a soi-même le droit de voir ;
//   • admin_search_parent_accounts ne rend que les parents DÉJÀ rattachés à
//     cette école — pas d'annuaire inter-établissements.
// Ici, on appelle et on affiche ce que le serveur répond.

const RELATIONS = [
  ['pere',   ['Père', 'Father', 'Padre']],
  ['mere',   ['Mère', 'Mother', 'Madre']],
  ['tuteur', ['Tuteur', 'Guardian', 'Tutor']],
  ['autre',  ['Autre responsable', 'Other guardian', 'Otro responsable']],
];
const relLabel = (code) => (RELATIONS.find(([c]) => c === code) || RELATIONS[3])[1];

export default function ParentAccountsModal({ student, onClose }) {
  const t = useT();
  const uiLang = useUiStore((s) => s.uiLang);
  const locale = localeForLang(uiLang);
  const schoolId = useAuthStore((s) => s.school?.id);

  const [links, setLinks]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [mode, setMode]         = useState(null);   // null | 'create' | 'attach'
  const [busy, setBusy]         = useState(false);
  const [created, setCreated]   = useState(null);   // identifiants à remettre une fois
  const [candidates, setCandidates] = useState([]);
  const [search, setSearch]     = useState('');

  const [form, setForm] = useState({
    fullName: student?.nom_pere || student?.tuteur || student?.nom_mere || '',
    email: '',
    phone: student?.parent_phone || student?.tel_pere || student?.tel_mere || '',
    relationship: 'tuteur',
  });
  const [attachRel, setAttachRel] = useState('tuteur');

  const reload = useCallback(async () => {
    setLoading(true);
    setLinks(await fetchParentLinks(student.id));
    setLoading(false);
  }, [student.id]);

  useEffect(() => { reload(); }, [reload]);

  // Charge les comptes parents déjà connus de l'école quand on ouvre le
  // rattachement. C'est ce qui évite le doublon pour le second enfant.
  useEffect(() => {
    if (mode !== 'attach') return;
    let alive = true;
    searchParentAccounts(schoolId, search).then((r) => { if (alive) setCandidates(r); });
    return () => { alive = false; };
  }, [mode, search, schoolId]);

  const active  = links.filter((l) => l.active);
  const revoked = links.filter((l) => !l.active);
  const dejaLie = (uid) => active.some((l) => l.parent_user_id === uid);

  const submitCreate = async (e) => {
    e.preventDefault();
    if (!form.email.trim()) return;
    setBusy(true);
    const password = generateParentPassword();
    try {
      const res = await createParentAccount({
        email: form.email, password,
        fullName: form.fullName.trim() || form.email,
        phone: form.phone.trim() || null,
        studentId: student.id,
        relationship: form.relationship,
        isPrimary: active.length === 0,
      });
      // Le mot de passe n'est affiché QU'ICI et QU'UNE FOIS : il n'est stocké
      // nulle part côté application.
      setCreated({ email: res.email, password });
      setForm((f) => ({ ...f, email: '', fullName: '' }));
      setMode(null);
      await reload();
    } catch (err) {
      toast.error(err.message === 'EMAIL_IN_USE'
        ? t("Cette adresse a déjà un compte NotesCam. Utilisez « Rattacher un parent existant », ou demandez au parent son mot de passe.",
             'This address already has a NotesCam account. Use “Link an existing parent”, or ask the parent for their password.',
             'Esta dirección ya tiene una cuenta. Use «Vincular un padre existente» o pida su contraseña.')
        : err.message);
    } finally { setBusy(false); }
  };

  const attach = async (parentUserId) => {
    setBusy(true);
    const { error } = await linkParentToStudent(parentUserId, student.id, attachRel, active.length === 0);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t('Enfant rattaché à ce compte', 'Child linked to this account', 'Hijo vinculado a esta cuenta'));
    setMode(null); setSearch('');
    await reload();
  };

  const revoke = async (linkId) => {
    const { error } = await revokeParentLink(linkId);
    if (error) { toast.error(error.message); return; }
    toast.success(t('Accès retiré', 'Access revoked', 'Acceso retirado'));
    await reload();
  };

  const fmt = (d) => (d ? new Date(d).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

  return (
    <Modal onClose={onClose} size="lg"
      title={t('Comptes parents', 'Parent accounts', 'Cuentas de padres')}>
      <div className="space-y-5">

        {/* Identité de l'élève — on doit voir SUR QUI on travaille */}
        <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
          <p className="text-sm font-bold text-gray-900">{student.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {student.matricule && <>{t('Matricule', 'Reg. no.', 'Matrícula')} : <b>{student.matricule}</b></>}
            {student.matricule && student.className && ' · '}
            {student.className && <>{t('Classe', 'Class', 'Clase')} : <b>{student.className}</b></>}
          </p>
        </div>

        {/* Parents rattachés */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
            {t('Responsables rattachés', 'Linked guardians', 'Responsables vinculados')} ({active.length})
          </h3>
          {loading ? (
            <p className="text-sm text-gray-400 animate-pulse py-3">{t('Chargement…', 'Loading…', 'Cargando…')}</p>
          ) : active.length === 0 ? (
            <p className="text-sm text-gray-400 py-3">
              {t('Aucun responsable ne suit encore cet élève.',
                 'No guardian follows this student yet.',
                 'Ningún responsable sigue aún a este alumno.')}
            </p>
          ) : (
            <ul className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
              {active.map((l) => (
                <li key={l.link_id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {l.full_name || l.email}
                      {l.is_primary && (
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-brand-600">
                          {t('contact principal', 'primary', 'principal')}
                        </span>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-gray-500">
                      <span className="font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
                        {t(...relLabel(l.relationship))}
                      </span>
                      {l.phone && <span>📞 {l.phone}</span>}
                      {l.email && <span className="truncate">✉ {l.email}</span>}
                      <span className={l.active ? 'text-emerald-600 font-semibold' : 'text-gray-400'}>
                        {l.active ? t('Compte actif', 'Active', 'Activa') : t('Inactif', 'Inactive', 'Inactiva')}
                      </span>
                      <span>{t('créé le', 'created', 'creada el')} {fmt(l.created_at)}</span>
                    </div>
                  </div>
                  <button onClick={() => revoke(l.link_id)} disabled={busy}
                    className="text-xs font-semibold text-red-500 hover:text-red-600 shrink-0 disabled:opacity-40">
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
              {[[t('Adresse web', 'Web address', 'Dirección'), `${window.location.origin}/parent`],
                [t('Identifiant', 'Login', 'Usuario'), created.email],
                [t('Mot de passe', 'Password', 'Contraseña'), created.password]].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="text-emerald-700 w-28 shrink-0">{k}</dt>
                  <dd className="font-mono text-emerald-900 break-all">{v}</dd>
                </div>
              ))}
            </dl>
            <button
              onClick={() => {
                copyText(`${window.location.origin}/parent\n${created.email}\n${created.password}`);
                toast.success(t('Identifiants copiés', 'Credentials copied', 'Credenciales copiadas'));
              }}
              className="mt-3 text-xs font-semibold text-emerald-700 hover:underline">
              {t('Copier les identifiants', 'Copy credentials', 'Copiar credenciales')}
            </button>
            <p className="text-[11px] text-emerald-700/70 mt-2">
              {t("Ce mot de passe n'est affiché qu'une fois et n'est enregistré nulle part.",
                 'This password is shown once and stored nowhere.',
                 'Esta contraseña se muestra una vez y no se guarda.')}
            </p>
          </div>
        )}

        {/* Deux portes : créer, ou rattacher un compte existant */}
        {mode === null && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setMode('create'); setCreated(null); }} className="btn-primary text-sm">
              + {t('Créer un compte parent', 'Create a parent account', 'Crear una cuenta de padre')}
            </button>
            <button onClick={() => { setMode('attach'); setCreated(null); setSearch(''); }}
              className="text-sm font-semibold rounded-lg border border-gray-200 px-3 py-2 text-gray-600 hover:border-brand-300 hover:text-brand-700 transition-colors">
              {t('Rattacher un parent existant', 'Link an existing parent', 'Vincular un padre existente')}
            </button>
          </div>
        )}

        {/* CRÉATION */}
        {mode === 'create' && (
          <section className="rounded-xl border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                {t('Nouveau compte parent', 'New parent account', 'Nueva cuenta de padre')}
              </h3>
              <button onClick={() => setMode(null)} className="text-xs text-gray-400 hover:text-gray-600">
                {t('Annuler', 'Cancel', 'Cancelar')}
              </button>
            </div>
            <form onSubmit={submitCreate} className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    {t('Nom du responsable', 'Guardian name', 'Nombre del responsable')}
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
                    {RELATIONS.map(([v, label]) => <option key={v} value={v}>{t(...label)}</option>)}
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
              <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">
                {busy ? t('Création…', 'Creating…', 'Creando…')
                      : t('Créer et rattacher', 'Create and link', 'Crear y vincular')}
              </button>
            </form>
            <p className="text-[11px] text-gray-400 mt-2">
              {t("Si ce responsable suit déjà un autre enfant de l'établissement, passez plutôt par « Rattacher un parent existant » : il n'aura qu'un seul compte pour tous ses enfants.",
                 'If this guardian already follows another child here, use “Link an existing parent” instead: one account for all their children.',
                 'Si este responsable ya sigue a otro hijo aquí, use «Vincular un padre existente».')}
            </p>
          </section>
        )}

        {/* RATTACHEMENT D'UN COMPTE EXISTANT */}
        {mode === 'attach' && (
          <section className="rounded-xl border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                {t('Rattacher un parent existant', 'Link an existing parent', 'Vincular un padre existente')}
              </h3>
              <button onClick={() => setMode(null)} className="text-xs text-gray-400 hover:text-gray-600">
                {t('Annuler', 'Cancel', 'Cancelar')}
              </button>
            </div>
            <div className="grid sm:grid-cols-3 gap-3 mb-3">
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Nom, e-mail ou téléphone…', 'Name, email or phone…', 'Nombre, correo o teléfono…')}
                className="sm:col-span-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              <select value={attachRel} onChange={(e) => setAttachRel(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                {RELATIONS.map(([v, label]) => <option key={v} value={v}>{t(...label)}</option>)}
              </select>
            </div>
            {candidates.length === 0 ? (
              <p className="text-sm text-gray-400 py-3">
                {t("Aucun compte parent enregistré dans l'établissement pour cette recherche.",
                   'No parent account found in this school for that search.',
                   'Ninguna cuenta encontrada en el centro para esa búsqueda.')}
              </p>
            ) : (
              <ul className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                {candidates.map((c) => {
                  const lie = dejaLie(c.parent_user_id);
                  return (
                    <li key={c.parent_user_id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{c.full_name || c.email}</p>
                        <p className="text-[11px] text-gray-400 truncate">
                          {c.email}{c.phone ? ` · ${c.phone}` : ''}
                          {c.nb_enfants > 0 && ` · ${c.nb_enfants} ${c.nb_enfants > 1
                            ? t('enfants ici', 'children here', 'hijos aquí')
                            : t('enfant ici', 'child here', 'hijo aquí')}`}
                        </p>
                      </div>
                      <button onClick={() => attach(c.parent_user_id)} disabled={busy || lie}
                        className="text-xs font-semibold shrink-0 rounded-lg border px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-gray-200 text-gray-600 hover:border-brand-300 hover:text-brand-700">
                        {lie ? t('Déjà rattaché', 'Already linked', 'Ya vinculado')
                             : t('Rattacher', 'Link', 'Vincular')}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {revoked.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
              {t('Accès retirés', 'Revoked access', 'Accesos retirados')}
            </h3>
            <ul className="text-xs text-gray-400 space-y-1">
              {revoked.map((l) => (
                <li key={l.link_id}>
                  {l.full_name || l.email} — {t('retiré le', 'revoked on', 'retirado el')} {fmt(l.revoked_at)}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}
