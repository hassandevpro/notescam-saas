// Menu utilisateur de l'en-tête (coin supérieur droit).
//
// Affiche [photo] Prénom ▼ ; au clic, déroule un menu :
//   • Mon profil               → /app/profile
//   • Modifier mon profil      → /app/profile?edit=1
//   • Changer ma photo         → /app/profile?photo=1
//   • Modifier mon mot de passe→ /app/profile?password=1
//   • Déconnexion
//
// Entièrement responsive : sur très petit écran, seuls la photo + le chevron
// restent visibles (le nom est masqué) pour ne jamais pousser les autres
// éléments de l'en-tête hors de l'écran.
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useT } from '../lib/i18n';
import { displayRoleLabel } from '../lib/roleLabel';
import { uploadMyPhoto } from '../lib/userProfileService';
import { ACCEPTED_IMAGE_TYPES } from '../lib/image';
import UserAvatar from './UserAvatar';
import ChangePasswordModal from './ChangePasswordModal';

function MenuItem({ icon, label, onClick, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="menuitem"
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
        danger
          ? 'text-red-600 hover:bg-red-50'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <span className="w-4 h-4 shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}

const I = {
  user:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  edit:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  camera: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  lock:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  logout: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
};

export default function UserMenu({ onLogout }) {
  const navigate = useNavigate();
  const user     = useAuthStore((s) => s.user);
  const school   = useAuthStore((s) => s.school);
  const fullName = useAuthStore((s) => s.fullName);
  const photoUrl = useAuthStore((s) => s.photoUrl);
  const role     = useAuthStore((s) => s.role);
  const governanceRoleRows = useAuthStore((s) => s.governanceRoleRows);
  const applyProfile = useAuthStore((s) => s.applyProfile);
  const t = useT();

  const [open, setOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [toast, setToast] = useState(null); // {type, text}
  const ref = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const flash = (type, text) => { setToast({ type, text }); setTimeout(() => setToast(null), 3000); };

  // « Changer ma photo » : ouvre directement le sélecteur de fichier puis
  // téléverse sans passer par la page profil.
  const onPickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    const { url, error } = await uploadMyPhoto(user.id, school?.id, file);
    setPhotoBusy(false);
    if (error) { flash('err', error.message || t('Échec du téléversement.', 'Upload failed.', 'Error al subir.')); return; }
    applyProfile({ photoUrl: url });
    flash('ok', t('Photo mise à jour.', 'Photo updated.', 'Foto actualizada.'));
  };

  // Prénom uniquement dans l'en-tête (compact) ; nom complet dans le menu.
  const firstName = (fullName || '').trim().split(/\s+/)[0] || t('Mon compte', 'My account', 'Mi cuenta');

  const go = (path) => { setOpen(false); navigate(path); };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 max-w-[40vw] sm:max-w-[180px] pl-1 pr-1.5 py-1 rounded-full hover:bg-slate-100 transition-colors"
        title={fullName || ''}
      >
        <UserAvatar name={fullName} photoUrl={photoUrl} size={30} />
        <span className="hidden sm:block text-sm font-semibold text-slate-700 truncate">{firstName}</span>
        <span className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-60 max-w-[calc(100vw-1.5rem)] bg-white rounded-xl shadow-card-lg border border-slate-200 z-[60] overflow-hidden py-1"
        >
          {/* En-tête : identité */}
          <div className="flex items-center gap-3 px-3 py-3 border-b border-slate-100">
            <UserAvatar name={fullName} photoUrl={photoUrl} size={40} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800 truncate">{fullName || '—'}</p>
              <p className="text-xs text-slate-400 truncate">{displayRoleLabel(role, governanceRoleRows, t)}</p>
            </div>
          </div>

          <div className="py-1">
            <MenuItem icon={I.user}   label={t('Mon profil', 'My profile', 'Mi perfil')}                           onClick={() => go('/app/profile')} />
            <MenuItem icon={I.edit}   label={t('Modifier mon profil', 'Edit my profile', 'Editar mi perfil')}      onClick={() => go('/app/profile?edit=1')} />
            <MenuItem icon={I.camera} label={photoBusy ? t('Envoi…', 'Uploading…', 'Subiendo…') : t('Changer ma photo', 'Change my photo', 'Cambiar mi foto')} onClick={() => { setOpen(false); fileRef.current?.click(); }} />
            <MenuItem icon={I.lock}   label={t('Modifier mon mot de passe', 'Change my password', 'Cambiar contraseña')} onClick={() => { setOpen(false); setPwdOpen(true); }} />
          </div>

          <div className="py-1 border-t border-slate-100">
            <MenuItem icon={I.logout} label={t('Déconnexion', 'Logout', 'Cerrar sesión')} onClick={() => { setOpen(false); onLogout?.(); }} danger />
          </div>
        </div>
      )}

      {/* Sélecteur de fichier (ouvert directement par « Changer ma photo ») */}
      <input ref={fileRef} type="file" accept={ACCEPTED_IMAGE_TYPES.join(',')} className="hidden" onChange={onPickPhoto} />

      {/* Mini-notification (photo) */}
      {toast && (
        <div className={`absolute right-0 top-full mt-2 z-[70] px-3 py-2 rounded-lg shadow-card-lg border text-xs font-medium whitespace-nowrap ${
          toast.type === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {toast.type === 'ok' ? '✓ ' : '⚠️ '}{toast.text}
        </div>
      )}

      {/* Modale de mot de passe (ouverte directement par le menu) */}
      {pwdOpen && <ChangePasswordModal onClose={() => setPwdOpen(false)} />}
    </div>
  );
}
