import { useState } from 'react';
import Modal from './Modal';
import { useT } from '../lib/i18n';
import { createStaffAccount, generatePassword } from '../lib/staffAccounts';

// Crée un compte de connexion pour un membre du personnel, directement depuis
// la liste Personnel, et affiche les identifiants à lui remettre.
// Rôle de connexion : censeur (accès direction large) ou surveillant (discipline).
// (Le rôle de gouvernance éventuel — Fondatrice, RAF… — reste additif et distinct.)
const DEFAULT_ROLE = (dept) => (dept === 'surveillance' ? 'surveillant' : 'censeur');

export default function StaffAccessModal({ staff, onClose, onCreated }) {
  const t = useT();
  const [email, setEmail] = useState(staff?.email || '');
  const [role, setRole] = useState(DEFAULT_ROLE(staff?.department));
  const [password, setPassword] = useState(generatePassword());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null); // { email, password }

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const mail = email.trim();
    if (!mail || password.length < 8) { setErr(t('Email requis + mot de passe ≥ 8 caractères.', 'Email required + password ≥ 8 chars.', 'Correo + contraseña ≥ 8.')); return; }
    setBusy(true); setErr('');
    try {
      const { userId } = await createStaffAccount({ email: mail, password, fullName: staff.name, role });
      setDone({ email: mail, password });
      onCreated?.(userId, role);
    } catch (e2) {
      setErr(/EMAIL_IN_USE/.test(e2?.message) ? t('Email déjà utilisé avec un autre mot de passe.', 'Email already used with another password.', 'Correo ya usado.') : (e2?.message || t('Erreur', 'Error', 'Error')));
    }
    setBusy(false);
  };

  const fld = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none';

  return (
    <Modal title={`${t('Créer l’accès', 'Create access', 'Crear acceso')} — ${staff?.name || ''}`} onClose={onClose} size="sm">
      {done ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-emerald-700">✅ {t('Compte créé. Communiquez ces identifiants au membre :', 'Account created. Share these credentials:', '¡Cuenta creada! Comparta estas credenciales:')}</p>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">{t('Email', 'Email', 'Correo')}</span><b className="text-gray-900">{done.email}</b></div>
            <div className="flex justify-between"><span className="text-gray-500">{t('Mot de passe', 'Password', 'Contraseña')}</span><b className="text-gray-900 font-mono">{done.password}</b></div>
          </div>
          <button onClick={() => navigator.clipboard?.writeText(`${done.email} / ${done.password}`)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">
            {t('Copier', 'Copy', 'Copiar')}
          </button>
          <div className="flex justify-end pt-2"><button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">{t('Fermer', 'Close', 'Cerrar')}</button></div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-xs text-gray-500">{t('Vous définissez l’email et le mot de passe ; remettez-les au membre.', 'You set the email and password; hand them to the member.', 'Usted define correo y contraseña.')}</p>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">{t('Email de connexion', 'Login email', 'Correo')}</label>
            <input className={fld} type="email" value={email} autoFocus onChange={(e) => setEmail(e.target.value)} placeholder="membre@ecole.cm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">{t('Rôle de connexion', 'Login role', 'Rol')}</label>
            <select className={fld} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="censeur">{t('Censeur (direction : pédagogie + frais)', 'Dean (academics + fees)', 'Jefe de estudios')}</option>
              <option value="surveillant">{t('Surveillant (discipline + assiduité)', 'Supervisor (discipline)', 'Jefe de disciplina')}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">{t('Mot de passe', 'Password', 'Contraseña')}</label>
            <div className="flex gap-2">
              <input className={`${fld} font-mono`} value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" onClick={() => setPassword(generatePassword())} className="px-3 py-2 text-xs font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 whitespace-nowrap">{t('Générer', 'Generate', 'Generar')}</button>
            </div>
          </div>
          {err && <p className="text-xs text-rose-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t('Annuler', 'Cancel', 'Cancelar')}</button>
            <button type="submit" disabled={busy} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {busy ? t('Création…', 'Creating…', 'Creando…') : t('Créer l’accès', 'Create access', 'Crear acceso')}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
