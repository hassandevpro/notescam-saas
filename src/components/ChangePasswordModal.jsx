// Modale de changement de mot de passe — ouverte directement depuis le menu
// utilisateur de l'en-tête. Vérifie l'ancien mot de passe par ré-authentification
// (même compte), puis met à jour. Fonctionne en cloud (Supabase) comme en LAN.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from './Modal';
import { useAuthStore } from '../store/authStore';
import { useT } from '../lib/i18n';
import { supabase } from '../lib/supabase';

export default function ChangePasswordModal({ onClose }) {
  const t = useT();
  const email = useAuthStore((s) => s.user?.email);
  const [oldPwd, setOldPwd]   = useState('');
  const [newPwd, setNewPwd]   = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus]   = useState(null); // null | 'loading' | 'ok' | 'err'
  const [msg, setMsg]         = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (newPwd !== confirm) {
      setStatus('err'); setMsg(t('Les deux mots de passe ne correspondent pas.', 'The two passwords do not match.', 'Las dos contraseñas no coinciden.'));
      return;
    }
    setStatus('loading'); setMsg('');
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({ email, password: oldPwd });
      if (authErr) { setStatus('err'); setMsg(t('Ancien mot de passe incorrect.', 'Current password is incorrect.', 'La contraseña actual es incorrecta.')); return; }
      const { error: updErr } = await supabase.auth.updateUser({ password: newPwd });
      if (updErr) { setStatus('err'); setMsg(updErr.message); return; }
      setStatus('ok'); setMsg(t('Mot de passe mis à jour.', 'Password updated.', 'Contraseña actualizada.'));
      setOldPwd(''); setNewPwd(''); setConfirm('');
      setTimeout(() => onClose?.(), 1200);
    } catch (err) {
      setStatus('err'); setMsg(err.message || t('Erreur inattendue.', 'Unexpected error.', 'Error inesperado.'));
    }
  };

  // Rendu via portal sur <body> : l'en-tête a un `backdrop-filter` qui ferait
  // de lui le bloc conteneur des éléments `position: fixed`, ce qui coincerait
  // la modale dans la barre d'en-tête. Le portal la sort de ce contexte.
  return createPortal(
    <Modal title={t('Modifier mon mot de passe', 'Change my password', 'Cambiar contraseña')} onClose={onClose} size="sm">
      <form onSubmit={submit} className="grid grid-cols-1 gap-4">
        <input type="email" value={email || ''} readOnly hidden autoComplete="username" />
        <div>
          <label className="form-label">{t('Ancien mot de passe *', 'Current password *', 'Contraseña actual *')}</label>
          <input type="password" required className="form-input" autoComplete="current-password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="form-label">{t('Nouveau mot de passe *', 'New password *', 'Nueva contraseña *')}</label>
          <input type="password" required minLength={8} className="form-input" autoComplete="new-password" placeholder={t('Min. 8 caractères', 'Min. 8 characters', 'Mín. 8 caracteres')} value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
        </div>
        <div>
          <label className="form-label">{t('Confirmer le nouveau mot de passe *', 'Confirm new password *', 'Confirmar nueva contraseña *')}</label>
          <input type="password" required minLength={8} className="form-input" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {status === 'err' && <p className="text-sm text-red-600">⚠️ {msg}</p>}
        {status === 'ok'  && <p className="text-sm text-emerald-600">✓ {msg}</p>}
        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={status === 'loading'} className="btn-primary" style={{ width: 'auto', paddingInline: '1.5rem' }}>
            {status === 'loading' ? t('Mise à jour…', 'Updating…', 'Actualizando…') : t('Mettre à jour', 'Update', 'Actualizar')}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">{t('Annuler', 'Cancel', 'Cancelar')}</button>
        </div>
      </form>
    </Modal>,
    document.body
  );
}
