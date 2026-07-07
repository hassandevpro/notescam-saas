// Gestion des comptes du personnel de direction (censeur, surveillant) par
// l'administrateur. Affiché dans Paramètres (section admin uniquement).
// Usage : <StaffManager role="censeur" /> ou <StaffManager role="surveillant" />.
import { useState, useEffect, useCallback } from 'react';
import { useT } from '../lib/i18n';
import Modal from './Modal';
import { createStaffAccount, fetchStaff, setStaffActive, setStaffPassword, setStaffScope } from '../lib/staffAccounts';
import { useSchoolStore } from '../store/schoolStore';
import { SECTIONS, classSectionKey } from '../core/engineResolver';
import { CYCLES } from '../core/surveillantScope';

// Libellés localisés par rôle.
function useRoleLabels(role) {
  const t = useT();
  if (role === 'surveillant') {
    return {
      singular: t('Surveillant', 'Supervisor', 'Jefe de disciplina'),
      newBtn:   t('Nouveau surveillant', 'New supervisor', 'Nuevo'),
      desc:     t(
        'Le surveillant gère la discipline, l’assiduité (absences) et les élèves — sans accès aux notes, frais ni paramètres.',
        'The supervisor handles discipline, attendance and students — without access to grades, fees or settings.',
        'El jefe de disciplina gestiona la disciplina, la asistencia (faltas) y los alumnos — sin acceso a notas, tasas ni ajustes.',
      ),
      namePh:   t('Ex : M. ABAGA Jean', 'E.g. Mr. ABAGA Jean', 'Ej: Sr. ABAGA Juan'),
      emailPh:  'surveillant@ecole.cm',
      createTitle: t('Créer un compte surveillant', 'Create supervisor account', 'Crear cuenta de jefe de disciplina'),
      pwdHint:  t('Vous définissez ce mot de passe pour le surveillant.', 'You are setting this password for the supervisor.', 'Usted define esta contraseña para el jefe de disciplina.'),
      empty:    t('Aucun surveillant pour le moment.', 'No supervisor yet.', 'Ningún jefe de disciplina todavía.'),
    };
  }
  return {
    singular: t('Censeur', 'Dean of studies', 'Jefe de estudios'),
    newBtn:   t('Nouveau censeur', 'New dean', 'Nuevo'),
    desc:     t(
      'Le censeur supervise la scolarité, la surveillance et les frais — sans accès aux paramètres ni à l’année scolaire.',
      'The dean of studies oversees academics, monitoring and fees — without access to settings or the academic year.',
      'El jefe de estudios supervisa la escolaridad, el seguimiento y las tasas — sin acceso a los ajustes ni al año escolar.',
    ),
    namePh:   t('Ex : M. ESONO Pedro', 'E.g. Mr. ESONO Pedro', 'Ej: Sr. ESONO Pedro'),
    emailPh:  'censeur@ecole.cm',
    createTitle: t('Créer un compte censeur', 'Create dean account', 'Crear cuenta de jefe de estudios'),
    pwdHint:  t('Vous définissez ce mot de passe pour le censeur.', 'You are setting this password for the dean.', 'Usted define esta contraseña para el jefe de estudios.'),
    empty:    t('Aucun censeur pour le moment.', 'No dean of studies yet.', 'Ningún jefe de estudios todavía.'),
  };
}

export default function StaffManager({ role }) {
  const t = useT();
  const L = useRoleLabels(role);
  const [list,    setList]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busyId,  setBusyId]  = useState(null);
  const [pwdRow,  setPwdRow]  = useState(null);
  const [scopeRow, setScopeRow] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setList(await fetchStaff(role));
    setLoading(false);
  }, [role]);

  useEffect(() => { refresh(); }, [refresh]);

  const toggleActive = async (row) => {
    setBusyId(row.id);
    const { error } = await setStaffActive(row.id, !row.active);
    setBusyId(null);
    if (!error) refresh();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3">
        <p className="text-xs text-gray-500">{L.desc}</p>
        <button onClick={() => setShowForm(true)} className="btn-secondary shrink-0"
          style={{ width: 'auto', paddingInline: '1rem' }}>
          + {L.newBtn}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 py-4 text-center">{t('Chargement…', 'Loading…', 'Cargando…')}</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">{L.empty}</p>
      ) : (
        <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
          {list.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-xs shrink-0">
                  {row.full_name?.[0]?.toUpperCase() || '?'}
                </div>
                <span className="font-medium text-gray-800 truncate">{row.full_name}</span>
                {!row.active && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">
                    {t('Désactivé', 'Disabled', 'Desactivado')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {role === 'surveillant' && (
                  <button
                    onClick={() => setScopeRow(row)}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-brand-600 hover:bg-brand-50 transition-colors"
                    title={t('Définir le périmètre (sections / cycles / classes)', 'Set scope (sections / cycles / classes)', 'Definir el ámbito')}
                  >
                    🎯 {t('Périmètre', 'Scope', 'Ámbito')}
                  </button>
                )}
                <button
                  onClick={() => setPwdRow(row)}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-brand-600 hover:bg-brand-50 transition-colors"
                  title={t('Changer le mot de passe', 'Change password', 'Cambiar contraseña')}
                >
                  🔑 {t('Mot de passe', 'Password', 'Contraseña')}
                </button>
                <button
                  onClick={() => toggleActive(row)}
                  disabled={busyId === row.id}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                    row.active ? 'text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'
                  }`}
                >
                  {busyId === row.id ? '…' : row.active ? t('Désactiver', 'Disable', 'Desactivar') : t('Réactiver', 'Re-enable', 'Reactivar')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pwdRow && (
        <SetPasswordModal row={pwdRow} onClose={() => setPwdRow(null)} />
      )}

      {scopeRow && (
        <ScopeModal row={scopeRow} onClose={() => setScopeRow(null)} onSaved={() => { setScopeRow(null); refresh(); }} />
      )}

      {showForm && (
        <CreateStaffModal
          role={role}
          labels={L}
          onClose={() => setShowForm(false)}
          onCreated={() => { setShowForm(false); refresh(); }}
        />
      )}
    </div>
  );
}

function CreateStaffModal({ role, labels: L, onClose, onCreated }) {
  const t = useT();
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [status,   setStatus]   = useState(null); // null | 'loading' | 'success' | 'error'
  const [msg,      setMsg]      = useState('');
  const [creds,    setCreds]    = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('loading'); setMsg('');
    try {
      await createStaffAccount({ email, password, fullName: name.trim(), role });
      setCreds({ email: email.trim(), password });
      setStatus('success');
    } catch (err) {
      console.error(err);
      const m = err.message === 'EMAIL_IN_USE'
        ? t('Email déjà utilisé mais mot de passe incorrect. Changez le mot de passe.', 'Email already in use but password is incorrect. Change the password.', 'El correo ya está en uso pero la contraseña es incorrecta. Cambie la contraseña.')
        : (err.message || t('Erreur lors de la création du compte', 'Error creating account', 'Error al crear la cuenta'));
      setMsg(m);
      setStatus('error');
    }
  };

  return (
    <Modal title={L.createTitle} onClose={onClose} size="sm">
      {status === 'success' ? (
        <div className="text-center py-2">
          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="text-gray-800 font-semibold mb-1">{t('Compte créé avec succès !', 'Account created successfully!', '¡Cuenta creada con éxito!')}</p>
          <p className="text-sm text-gray-500 mb-4">{t('Transmettez ces identifiants à', 'Share these credentials with', 'Comparta estas credenciales con')} <strong>{name}</strong> :</p>
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 font-mono text-sm text-left space-y-2 mb-4">
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Email</span>
              <span className="font-semibold text-gray-900 truncate">{creds.email}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">{t('Mot de passe', 'Password', 'Contraseña')}</span>
              <span className="font-semibold text-gray-900">{creds.password}</span>
            </div>
          </div>
          <button onClick={onCreated} className="btn-primary" style={{ width: 'auto', paddingInline: '2rem' }}>
            {t('Terminé', 'Done', 'Listo')}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="form-label">{t('Nom complet *', 'Full name *', 'Nombre completo *')}</label>
            <input type="text" required className="form-input"
              placeholder={L.namePh}
              value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="form-label">{t('Email *', 'Email *', 'Correo *')}</label>
            <input type="email" required className="form-input"
              placeholder={L.emailPh}
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="form-label">{t('Mot de passe *', 'Password *', 'Contraseña *')}</label>
            <input type="text" required minLength={8} className="form-input font-mono"
              placeholder={t('Min. 8 caractères', 'Min. 8 characters', 'Mín. 8 caracteres')}
              value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">{L.pwdHint}</p>
          </div>
          {status === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{msg}</div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={status === 'loading'} className="btn-primary flex-1">
              {status === 'loading' ? t('Création…', 'Creating…', 'Creando…') : t('Créer le compte', 'Create account', 'Crear cuenta')}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">{t('Annuler', 'Cancel', 'Cancelar')}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// Définition du PÉRIMÈTRE vie scolaire d'un surveillant : sections, cycles et/ou
// classes accessibles. Tout laisser décoché = accès à TOUT l'établissement.
function ScopeModal({ row, onClose, onSaved }) {
  const t = useT();
  const classes = useSchoolStore((s) => s.classes);
  const [sections, setSections] = useState(row.scope_sections || []);
  const [cycles,   setCycles]   = useState(row.scope_cycles   || []);
  const [classIds, setClassIds] = useState(row.scope_class_ids || []);
  const [status,   setStatus]   = useState(null);
  const [msg,      setMsg]      = useState('');

  const toggle = (list, setList, value) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  // Ne proposer que les sections/cycles réellement présents dans l'établissement.
  const presentSections = new Set(classes.map(classSectionKey));
  const availSections = SECTIONS.filter((s) => presentSections.has(s.key));
  const sortedClasses = [...classes].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }));
  const isGlobal = sections.length === 0 && cycles.length === 0 && classIds.length === 0;

  const handleSave = async () => {
    setStatus('loading'); setMsg('');
    const { error } = await setStaffScope(row.id, { sections, cycles, classIds });
    if (error) { setMsg(error.message || t('Erreur', 'Error', 'Error')); setStatus('error'); return; }
    onSaved();
  };

  return (
    <Modal title={t('Périmètre du surveillant', 'Supervisor scope', 'Ámbito del vigilante')} onClose={onClose} size="md">
      <div className="space-y-4">
        <p className="text-xs text-gray-500">
          {t(
            'Choisissez les sections, cycles et/ou classes dont ce surveillant est responsable. Tout laisser vide = tout l’établissement.',
            'Pick the sections, cycles and/or classes this supervisor is responsible for. Leave everything empty = whole school.',
            'Elija las secciones, ciclos y/o clases de este vigilante. Dejar todo vacío = toda la escuela.',
          )}
        </p>

        <div>
          <div className="text-xs font-semibold text-gray-600 mb-1.5">{t('Cycles', 'Cycles', 'Ciclos')}</div>
          <div className="flex flex-wrap gap-2">
            {CYCLES.map((c) => (
              <button key={c.key} type="button" onClick={() => toggle(cycles, setCycles, c.key)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${cycles.includes(c.key) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'}`}>
                {t(c.fr, c.en, c.es)}
              </button>
            ))}
          </div>
        </div>

        {availSections.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-gray-600 mb-1.5">{t('Sections', 'Sections', 'Secciones')}</div>
            <div className="flex flex-wrap gap-2">
              {availSections.map((s) => (
                <button key={s.key} type="button" onClick={() => toggle(sections, setSections, s.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${sections.includes(s.key) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'}`}>
                  {t(s.fr, s.en, s.es)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="text-xs font-semibold text-gray-600 mb-1.5">{t('Classes précises (optionnel)', 'Specific classes (optional)', 'Clases concretas (opcional)')}</div>
          <div className="max-h-40 overflow-auto flex flex-wrap gap-2 border border-gray-100 rounded-lg p-2">
            {sortedClasses.map((c) => (
              <button key={c.id} type="button" onClick={() => toggle(classIds, setClassIds, c.id)}
                className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${classIds.includes(c.id) ? 'bg-brand-100 text-brand-700 border-brand-300' : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300'}`}>
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className={`text-xs rounded-lg px-3 py-2 ${isGlobal ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {isGlobal
            ? t('Périmètre : tout l’établissement.', 'Scope: whole establishment.', 'Ámbito: toda la escuela.')
            : t('Périmètre restreint enregistré ci-dessous.', 'Restricted scope will be saved below.', 'Ámbito restringido.')}
        </div>

        {status === 'error' && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{msg}</div>}

        <div className="flex gap-3 pt-1">
          <button onClick={handleSave} disabled={status === 'loading'} className="btn-primary flex-1">
            {status === 'loading' ? t('Enregistrement…', 'Saving…', 'Guardando…') : t('Enregistrer le périmètre', 'Save scope', 'Guardar ámbito')}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">{t('Annuler', 'Cancel', 'Cancelar')}</button>
        </div>
      </div>
    </Modal>
  );
}

// Redéfinition du mot de passe d'un compte de direction par l'admin.
function SetPasswordModal({ row, onClose }) {
  const t = useT();
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState(null); // null | 'loading' | 'success' | 'error'
  const [msg, setMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('loading'); setMsg('');
    const { error } = await setStaffPassword(row.id, password);
    if (error) {
      setMsg(error.message || t('Erreur', 'Error', 'Error'));
      setStatus('error');
    } else {
      setStatus('success');
    }
  };

  return (
    <Modal title={t('Changer le mot de passe', 'Change password', 'Cambiar contraseña')} onClose={onClose} size="sm">
      {status === 'success' ? (
        <div className="text-center py-2">
          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3 text-emerald-600 text-2xl">✓</div>
          <p className="text-gray-800 font-semibold mb-1">{t('Mot de passe mis à jour.', 'Password updated.', 'Contraseña actualizada.')}</p>
          <p className="text-sm text-gray-500 mb-4">
            {t('Transmettez ces identifiants à', 'Share these credentials with', 'Comparta estas credenciales con')} <strong>{row.full_name}</strong> :
          </p>
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 font-mono text-sm text-left space-y-2 mb-4">
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">{t('Mot de passe', 'Password', 'Contraseña')}</span>
              <span className="font-semibold text-gray-900">{password}</span>
            </div>
          </div>
          <button onClick={onClose} className="btn-primary" style={{ width: 'auto', paddingInline: '2rem' }}>{t('Terminé', 'Done', 'Listo')}</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-gray-500">
            {t('Définissez un nouveau mot de passe pour', 'Set a new password for', 'Defina una nueva contraseña para')} <strong className="text-gray-800">{row.full_name}</strong>.
          </p>
          <div>
            <label className="form-label">{t('Nouveau mot de passe *', 'New password *', 'Nueva contraseña *')}</label>
            <input type="text" required minLength={8} className="form-input font-mono"
              placeholder={t('Min. 8 caractères', 'Min. 8 characters', 'Mín. 8 caracteres')}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {status === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{msg}</div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={status === 'loading'} className="btn-primary flex-1">
              {status === 'loading' ? t('Enregistrement…', 'Saving…', 'Guardando…') : t('Enregistrer', 'Save', 'Guardar')}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">{t('Annuler', 'Cancel', 'Cancelar')}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
