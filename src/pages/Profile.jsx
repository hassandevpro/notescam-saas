// Page « Mon profil » — profil professionnel du compte connecté
// (admin / censeur / surveillant / enseignant).
//
// Affiche les informations personnelles et permet à l'utilisateur de modifier
// UNIQUEMENT son propre profil : photo (upload/remplacement/suppression),
// nom complet, téléphone, et mot de passe. Les écritures passent par
// userProfileService (RPC SECURITY DEFINER self-only) + supabase.auth.
//
// Responsive : mise en page en colonne sur mobile, deux colonnes dès `lg`.
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import UserAvatar from '../components/UserAvatar';
import { useAuthStore } from '../store/authStore';
import { useT, localeForLang } from '../lib/i18n';
import { displayRoleLabel } from '../lib/roleLabel';
import { supabase } from '../lib/supabase';
import { getDaysUntilLicenseExpires } from '../lib/auth';
import { updateMyProfile, uploadMyPhoto, removeMyPhoto } from '../lib/userProfileService';
import { ACCEPTED_IMAGE_TYPES } from '../lib/image';

function fmtDate(value, locale) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtDateTime(value, locale) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Ligne d'information lecture seule.
function InfoLine({ label, value, mono }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <span className="w-44 shrink-0 text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
      <span className={`flex-1 text-sm font-medium text-slate-800 break-words ${mono ? 'tabular-nums' : ''}`}>{value || '—'}</span>
    </div>
  );
}

function Card({ title, children, action }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-slate-100">
        <h2 className="text-sm font-bold text-slate-800">{title}</h2>
        {action}
      </div>
      <div className="px-5 sm:px-6 py-4">{children}</div>
    </section>
  );
}

export default function Profile() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const locale = localeForLang();

  const user        = useAuthStore((s) => s.user);
  const fullName    = useAuthStore((s) => s.fullName);
  const phone       = useAuthStore((s) => s.phone);
  const photoUrl    = useAuthStore((s) => s.photoUrl);
  const role        = useAuthStore((s) => s.role);
  const governanceRoleRows = useAuthStore((s) => s.governanceRoleRows);
  const specialty   = useAuthStore((s) => s.specialty);
  const createdAt   = useAuthStore((s) => s.createdAt);
  const lastLogin   = useAuthStore((s) => s.lastLogin);
  const school      = useAuthStore((s) => s.school);
  const schoolId    = school?.id;
  const applyProfile = useAuthStore((s) => s.applyProfile);

  const isTeacher = role === 'teacher';

  // Jours restants avant expiration de la licence de l'établissement (null si
  // aucune date). Sert à colorer la ligne « Licence » de la section Compte.
  const licDays = getDaysUntilLicenseExpires(school?.license_expires_at);

  // ── Édition nom / téléphone ────────────────────────────────────────────────
  const [editing, setEditing] = useState(params.get('edit') === '1');
  const [form, setForm] = useState({ fullName: fullName || '', phone: phone || '' });
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoMsg, setInfoMsg] = useState(null); // {type,text}

  useEffect(() => { setForm({ fullName: fullName || '', phone: phone || '' }); }, [fullName, phone]);

  const saveInfo = async (e) => {
    e.preventDefault();
    const name = form.fullName.trim();
    if (!name) { setInfoMsg({ type: 'err', text: t('Le nom est obligatoire.', 'Name is required.', 'El nombre es obligatorio.') }); return; }
    setSavingInfo(true); setInfoMsg(null);
    const { error } = await updateMyProfile({ fullName: name, phone: form.phone.trim() });
    setSavingInfo(false);
    if (error) { setInfoMsg({ type: 'err', text: error.message || t('Échec de la mise à jour.', 'Update failed.', 'Error al actualizar.') }); return; }
    applyProfile({ fullName: name, phone: form.phone.trim() || null });
    setEditing(false);
    setInfoMsg({ type: 'ok', text: t('Profil mis à jour.', 'Profile updated.', 'Perfil actualizado.') });
  };

  // ── Photo ──────────────────────────────────────────────────────────────────
  const fileRef = useRef(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMsg, setPhotoMsg] = useState(null);

  // Le menu utilisateur peut demander d'ouvrir directement le sélecteur de photo.
  useEffect(() => {
    if (params.get('photo') === '1' && fileRef.current) {
      fileRef.current.click();
      params.delete('photo'); setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permet de re-choisir le même fichier
    if (!file) return;
    setPhotoBusy(true); setPhotoMsg(null);
    const { url, error } = await uploadMyPhoto(user.id, schoolId, file);
    setPhotoBusy(false);
    if (error) { setPhotoMsg({ type: 'err', text: error.message || t('Échec du téléversement.', 'Upload failed.', 'Error al subir.') }); return; }
    applyProfile({ photoUrl: url });
    setPhotoMsg({ type: 'ok', text: t('Photo mise à jour.', 'Photo updated.', 'Foto actualizada.') });
  };

  const onRemovePhoto = async () => {
    setPhotoBusy(true); setPhotoMsg(null);
    const { error } = await removeMyPhoto(user.id, schoolId);
    setPhotoBusy(false);
    if (error) { setPhotoMsg({ type: 'err', text: error.message || t('Échec de la suppression.', 'Removal failed.', 'Error al eliminar.') }); return; }
    applyProfile({ photoUrl: null });
    setPhotoMsg({ type: 'ok', text: t('Photo supprimée.', 'Photo removed.', 'Foto eliminada.') });
  };

  // ── Mot de passe ─────────────────────────────────────────────────────────
  const [pwdOpen, setPwdOpen] = useState(params.get('password') === '1');
  const [pwd, setPwd] = useState({ old: '', neu: '', confirm: '' });
  const [pwdStatus, setPwdStatus] = useState(null); // null|'loading'|'ok'|'err'
  const [pwdMsg, setPwdMsg] = useState('');

  const submitPwd = async (e) => {
    e.preventDefault();
    if (pwd.neu !== pwd.confirm) {
      setPwdStatus('err'); setPwdMsg(t('Les deux mots de passe ne correspondent pas.', 'The two passwords do not match.', 'Las dos contraseñas no coinciden.'));
      return;
    }
    setPwdStatus('loading'); setPwdMsg('');
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({ email: user?.email, password: pwd.old });
      if (authErr) { setPwdStatus('err'); setPwdMsg(t('Ancien mot de passe incorrect.', 'Current password is incorrect.', 'La contraseña actual es incorrecta.')); return; }
      const { error: updErr } = await supabase.auth.updateUser({ password: pwd.neu });
      if (updErr) { setPwdStatus('err'); setPwdMsg(updErr.message); return; }
      setPwdStatus('ok'); setPwdMsg(t('Mot de passe mis à jour.', 'Password updated.', 'Contraseña actualizada.'));
      setPwd({ old: '', neu: '', confirm: '' });
    } catch (err) {
      setPwdStatus('err'); setPwdMsg(err.message || t('Erreur inattendue.', 'Unexpected error.', 'Error inesperado.'));
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* En-tête : bannière identité */}
        <div className="bg-gradient-to-br from-brand-500 to-purple-600 rounded-2xl p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 text-center sm:text-left">
            <div className="relative shrink-0">
              <UserAvatar name={fullName} photoUrl={photoUrl} size={88} ring />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={photoBusy}
                title={t('Changer ma photo', 'Change my photo', 'Cambiar mi foto')}
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white text-brand-600 shadow-md flex items-center justify-center hover:bg-brand-50 transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              </button>
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-white truncate">{fullName || '—'}</h1>
              <p className="text-sm text-white/80">{displayRoleLabel(role, governanceRoleRows, t)}{isTeacher && specialty ? ` · ${specialty}` : ''}</p>
            </div>
          </div>
          <input ref={fileRef} type="file" accept={ACCEPTED_IMAGE_TYPES.join(',')} className="hidden" onChange={onPickPhoto} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Informations personnelles */}
          <Card
            title={t('Informations personnelles', 'Personal information', 'Información personal')}
            action={!editing && (
              <button type="button" onClick={() => { setEditing(true); setInfoMsg(null); }} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                {t('Modifier', 'Edit', 'Editar')}
              </button>
            )}
          >
            {!editing ? (
              <div>
                <InfoLine label={t('Nom complet', 'Full name', 'Nombre completo')} value={fullName} />
                <InfoLine label={t('Email', 'Email', 'Correo')} value={user?.email} />
                <InfoLine label={t('Téléphone', 'Phone', 'Teléfono')} value={phone} mono />
                <InfoLine label={t('Rôle', 'Role', 'Rol')} value={displayRoleLabel(role, governanceRoleRows, t)} />
                {isTeacher && <InfoLine label={t('Matière enseignée', 'Subject taught', 'Asignatura')} value={specialty} />}
                {infoMsg?.type === 'ok' && <p className="text-sm text-emerald-600 mt-3">✓ {infoMsg.text}</p>}
              </div>
            ) : (
              <form onSubmit={saveInfo} className="space-y-4">
                <div>
                  <label className="form-label">{t('Nom complet *', 'Full name *', 'Nombre completo *')}</label>
                  <input type="text" required className="form-input" value={form.fullName}
                    onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">{t('Téléphone', 'Phone', 'Teléfono')}</label>
                  <input type="tel" className="form-input" placeholder={t('Ex : 699 00 00 00', 'E.g. 699 00 00 00', 'Ej: 222 00 00 00')} value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
                </div>
                <div className="text-xs text-slate-400">
                  {t("L'email se modifie depuis l'authentification — contactez le support si besoin.",
                     'Email is managed by authentication — contact support if needed.',
                     'El correo lo gestiona la autenticación — contacte soporte si es necesario.')}
                </div>
                {infoMsg?.type === 'err' && <p className="text-sm text-red-600">⚠️ {infoMsg.text}</p>}
                <div className="flex items-center gap-3">
                  <button type="submit" disabled={savingInfo} className="btn-primary" style={{ width: 'auto', paddingInline: '1.5rem' }}>
                    {savingInfo ? t('Enregistrement…', 'Saving…', 'Guardando…') : t('Enregistrer', 'Save', 'Guardar')}
                  </button>
                  <button type="button" onClick={() => { setEditing(false); setForm({ fullName: fullName || '', phone: phone || '' }); }} className="btn-secondary">
                    {t('Annuler', 'Cancel', 'Cancelar')}
                  </button>
                </div>
              </form>
            )}
          </Card>

          {/* Photo + compte */}
          <div className="space-y-6">
            <Card title={t('Photo de profil', 'Profile photo', 'Foto de perfil')}>
              <div className="flex items-center gap-4">
                <UserAvatar name={fullName} photoUrl={photoUrl} size={64} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={photoBusy} className="btn-secondary" style={{ width: 'auto', paddingInline: '1rem' }}>
                      {photoBusy ? t('Traitement…', 'Processing…', 'Procesando…') : photoUrl ? t('Remplacer', 'Replace', 'Reemplazar') : t('Téléverser', 'Upload', 'Subir')}
                    </button>
                    {photoUrl && (
                      <button type="button" onClick={onRemovePhoto} disabled={photoBusy} className="text-sm font-medium text-red-500 hover:text-red-600 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors">
                        {t('Supprimer', 'Remove', 'Eliminar')}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">{t('JPG, PNG ou WEBP. Redimensionnée automatiquement.', 'JPG, PNG or WEBP. Auto-resized.', 'JPG, PNG o WEBP. Redimensionada automáticamente.')}</p>
                  {photoMsg?.type === 'ok' && <p className="text-sm text-emerald-600 mt-1">✓ {photoMsg.text}</p>}
                  {photoMsg?.type === 'err' && <p className="text-sm text-red-600 mt-1">⚠️ {photoMsg.text}</p>}
                </div>
              </div>
            </Card>

            <Card title={t('Compte', 'Account', 'Cuenta')}>
              <InfoLine label={t('Établissement', 'School', 'Centro')} value={school?.name} />
              <InfoLine label={t('Compte créé le', 'Account created', 'Cuenta creada')} value={fmtDate(createdAt, locale)} />
              <InfoLine label={t('Dernière connexion', 'Last login', 'Último acceso')} value={fmtDateTime(lastLogin, locale)} />
              <InfoLine
                label={t('Licence — expire le', 'License — expires', 'Licencia — caduca')}
                value={school?.license_expires_at ? (
                  <span className={licDays != null && licDays < 0 ? 'text-red-600 font-semibold' : licDays != null && licDays <= 14 ? 'text-amber-600 font-semibold' : ''}>
                    {fmtDate(school.license_expires_at, locale)}
                    {licDays != null && (
                      <span className="ml-1.5 text-xs font-normal">
                        {licDays < 0
                          ? `· ${t('expirée', 'expired', 'caducada')}`
                          : `· ${licDays} ${t('j restants', 'days left', 'días restantes')}`}
                      </span>
                    )}
                  </span>
                ) : '—'}
              />
            </Card>
          </div>
        </div>

        {/* Sécurité — mot de passe */}
        <Card
          title={t('Sécurité — mot de passe', 'Security — password', 'Seguridad — contraseña')}
          action={!pwdOpen && (
            <button type="button" onClick={() => { setPwdOpen(true); setPwdStatus(null); setPwdMsg(''); }} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
              {t('Modifier', 'Change', 'Cambiar')}
            </button>
          )}
        >
          {!pwdOpen ? (
            <p className="text-sm text-slate-400">{t('Modifiez votre mot de passe régulièrement pour sécuriser votre compte.', 'Change your password regularly to keep your account secure.', 'Cambie su contraseña con regularidad para proteger su cuenta.')}</p>
          ) : (
            <form onSubmit={submitPwd} className="grid grid-cols-1 gap-4 max-w-md">
              <input type="email" value={user?.email || ''} readOnly hidden autoComplete="username" />
              <div>
                <label className="form-label">{t('Ancien mot de passe *', 'Current password *', 'Contraseña actual *')}</label>
                <input type="password" required className="form-input" autoComplete="current-password" value={pwd.old} onChange={(e) => setPwd((p) => ({ ...p, old: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">{t('Nouveau mot de passe *', 'New password *', 'Nueva contraseña *')}</label>
                <input type="password" required minLength={8} className="form-input" autoComplete="new-password" placeholder={t('Min. 8 caractères', 'Min. 8 characters', 'Mín. 8 caracteres')} value={pwd.neu} onChange={(e) => setPwd((p) => ({ ...p, neu: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">{t('Confirmer le nouveau mot de passe *', 'Confirm new password *', 'Confirmar nueva contraseña *')}</label>
                <input type="password" required minLength={8} className="form-input" autoComplete="new-password" value={pwd.confirm} onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))} />
              </div>
              {pwdStatus === 'err' && <p className="text-sm text-red-600">⚠️ {pwdMsg}</p>}
              {pwdStatus === 'ok'  && <p className="text-sm text-emerald-600">✓ {pwdMsg}</p>}
              <div className="flex items-center gap-3">
                <button type="submit" disabled={pwdStatus === 'loading'} className="btn-primary" style={{ width: 'auto', paddingInline: '1.5rem' }}>
                  {pwdStatus === 'loading' ? t('Mise à jour…', 'Updating…', 'Actualizando…') : t('Mettre à jour', 'Update', 'Actualizar')}
                </button>
                <button type="button" onClick={() => { setPwdOpen(false); setPwd({ old: '', neu: '', confirm: '' }); setPwdStatus(null); }} className="btn-secondary">
                  {t('Fermer', 'Close', 'Cerrar')}
                </button>
              </div>
            </form>
          )}
        </Card>
      </div>
    </Layout>
  );
}
