import { useState } from 'react';
import Modal from './Modal';
import { useT } from '../lib/i18n';
import { createStaffAccount, generatePassword } from '../lib/staffAccounts';
import { CAP_GROUPS, ACCESS_PRESETS, presetByKey } from '../config/capabilities';

// Crée un compte de connexion pour un membre du personnel, avec un PROFIL
// (préréglage) et un choix GRANULAIRE de ce que la personne peut faire.
const DEFAULT_PRESET = (dept) => (dept === 'surveillance' ? 'surveillant' : 'censeur');

export default function StaffAccessModal({ staff, onClose, onCreated }) {
  const t = useT();
  const [email, setEmail] = useState(staff?.email || '');
  const [presetKey, setPresetKey] = useState(DEFAULT_PRESET(staff?.department));
  const [caps, setCaps] = useState(() => new Set(presetByKey(DEFAULT_PRESET(staff?.department)).caps));
  const [password, setPassword] = useState(generatePassword());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  const applyPreset = (key) => { setPresetKey(key); setCaps(new Set(presetByKey(key).caps)); };
  const toggle = (to) => setCaps((s) => { const n = new Set(s); n.has(to) ? n.delete(to) : n.add(to); return n; });
  const toggleGroup = (group, on) => setCaps((s) => { const n = new Set(s); group.caps.forEach((c) => on ? n.add(c.to) : n.delete(c.to)); return n; });

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const mail = email.trim();
    if (!mail || password.length < 8) { setErr(t('Email requis + mot de passe ≥ 8 caractères.', 'Email + password ≥ 8 chars.', 'Correo + contraseña ≥ 8.')); return; }
    if (caps.size === 0) { setErr(t('Sélectionnez au moins une autorisation.', 'Select at least one permission.', 'Seleccione al menos un permiso.')); return; }
    setBusy(true); setErr('');
    try {
      const role = presetByKey(presetKey).role;
      const permissions = [...caps];
      const { userId } = await createStaffAccount({ email: mail, password, fullName: staff.name, role, permissions });
      setDone({ email: mail, password });
      onCreated?.(userId, role, permissions);
    } catch (e2) {
      setErr(/EMAIL_IN_USE/.test(e2?.message) ? t('Email déjà utilisé avec un autre mot de passe.', 'Email already used.', 'Correo ya usado.') : (e2?.message || t('Erreur', 'Error', 'Error')));
    }
    setBusy(false);
  };

  const fld = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none';

  return (
    <Modal title={`${t('Créer l’accès', 'Create access', 'Crear acceso')} — ${staff?.name || ''}`} onClose={onClose} size="lg">
      {done ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-emerald-700">✅ {t('Compte créé. Communiquez ces identifiants :', 'Account created. Share these credentials:', '¡Cuenta creada!')}</p>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">{t('Email', 'Email', 'Correo')}</span><b>{done.email}</b></div>
            <div className="flex justify-between"><span className="text-gray-500">{t('Mot de passe', 'Password', 'Contraseña')}</span><b className="font-mono">{done.password}</b></div>
          </div>
          <button onClick={() => navigator.clipboard?.writeText(`${done.email} / ${done.password}`)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">{t('Copier', 'Copy', 'Copiar')}</button>
          <div className="flex justify-end pt-2"><button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">{t('Fermer', 'Close', 'Cerrar')}</button></div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">{t('Email de connexion', 'Login email', 'Correo')}</label>
              <input className={fld} type="email" value={email} autoFocus onChange={(e) => setEmail(e.target.value)} placeholder="membre@ecole.cm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">{t('Mot de passe', 'Password', 'Contraseña')}</label>
              <div className="flex gap-2">
                <input className={`${fld} font-mono`} value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" onClick={() => setPassword(generatePassword())} className="px-3 py-2 text-xs font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 whitespace-nowrap">{t('Générer', 'Generate', 'Generar')}</button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">{t('Profil', 'Profile', 'Perfil')}</label>
            <select className={fld} value={presetKey} onChange={(e) => applyPreset(e.target.value)}>
              {ACCESS_PRESETS.map((p) => <option key={p.key} value={p.key}>{t(...p.label)}</option>)}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-500">{t('Ce que la personne peut faire', 'What the person can do', 'Lo que puede hacer')}</label>
              <span className="text-[11px] text-gray-400">{caps.size} {t('autorisation(s)', 'permission(s)', 'permisos')}</span>
            </div>
            <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {CAP_GROUPS.map((group) => {
                const all = group.caps.every((c) => caps.has(c.to));
                return (
                  <div key={group.module[0]} className="p-2">
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-600 mb-1">
                      <input type="checkbox" checked={all} onChange={(e) => toggleGroup(group, e.target.checked)} className="w-3.5 h-3.5" />
                      {t(...group.module)}
                    </label>
                    <div className="grid grid-cols-2 gap-1 pl-5">
                      {group.caps.map((c) => (
                        <label key={c.to} className="flex items-center gap-2 text-sm text-gray-700">
                          <input type="checkbox" checked={caps.has(c.to)} onChange={() => toggle(c.to)} className="w-3.5 h-3.5" />
                          {t(...c.label)}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {err && <p className="text-xs text-rose-600">{err}</p>}
          <div className="flex justify-end gap-2">
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
