// Module Personnel — registre unique de tout le personnel de l'établissement,
// organisé en départements. L'onglet « Enseignants » réutilise tel quel le
// panneau enseignants (matières/classes/titulaire, comptes app) ; les autres
// départements (administration, surveillance, santé, comptabilité, support)
// utilisent un CRUD générique sur la table `staff`.
import { useState, useMemo, useRef } from 'react';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import StudentAvatar from '../components/StudentAvatar';
import { useT } from '../lib/i18n';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { STAFF_DEPARTMENTS, uploadStaffPhoto, uploadStaffDocument, parseDocs } from '../lib/staffService';
import { exportStaff, downloadStaffTemplate, parseStaffSpreadsheet, printStaffList } from '../lib/staffExport';
import { resizeImageToSquare } from '../lib/image';
import { TeachersPanel } from './Teachers';
import StaffManager from '../components/StaffManager';
import StaffAccessModal from '../components/StaffAccessModal';

// Libellés + icônes des départements.
function useDepartmentMeta() {
  const t = useT();
  return {
    enseignants:    { label: t('Enseignants', 'Teachers', 'Profesorado'),        icon: '👨‍🏫' },
    administration: { label: t('Administration', 'Administration', 'Administración'), icon: '🏛️' },
    surveillance:   { label: t('Surveillance', 'Supervision', 'Vigilancia'),       icon: '🛡️' },
    sante:          { label: t('Santé', 'Health', 'Salud'),                        icon: '⚕️' },
    comptabilite:   { label: t('Comptabilité', 'Accounting', 'Contabilidad'),      icon: '💰' },
    support:        { label: t('Support', 'Support', 'Soporte'),                   icon: '🧰' },
  };
}

const GENDERS = ['Masculin', 'Feminin'];

function fullName(first, last, fallback = '') {
  return `${last || ''} ${first || ''}`.trim() || fallback;
}

// ── Formulaire d'un membre du personnel ──────────────────────────────────────
function StaffForm({ initial, department, onSave, onCancel }) {
  const t = useT();
  const [form, setForm] = useState({
    matricule: '', first_name: '', last_name: '', gender: '', phone: '',
    email: '', address: '', fonction: '', hire_date: '', status: '',
    ...initial,
  });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(initial?.photo_url || null);
  const [docs, setDocs] = useState(parseDocs(initial?.documents));
  const [newDocFiles, setNewDocFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const photoRef = useRef();
  const docRef = useRef();

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handlePhoto = (file) => {
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const name = fullName(form.first_name, form.last_name, form.matricule || t('Sans nom', 'No name'));
    await onSave(
      { ...form, name, department, documents: docs },
      { photoFile, newDocFiles },
    );
    setSaving(false);
  };

  return (
    <Modal
      title={initial?.id ? t('Modifier le membre', 'Edit member', 'Editar miembro')
                         : t('Nouveau membre du personnel', 'New staff member', 'Nuevo miembro')}
      onClose={onCancel}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Photo */}
        <div className="flex items-center gap-4">
          <StudentAvatar student={{ photo_url: photoPreview }} size={64} square />
          <div>
            <button type="button" onClick={() => photoRef.current?.click()} className="btn-secondary text-xs">
              {photoPreview ? t('Changer la photo', 'Change photo', 'Cambiar foto') : t('Ajouter une photo', 'Add photo', 'Añadir foto')}
            </button>
            {photoPreview && (
              <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null); setForm((f) => ({ ...f, photo_url: null })); }}
                className="ml-2 text-xs text-red-500 hover:underline">{t('Retirer', 'Remove', 'Quitar')}</button>
            )}
            <input ref={photoRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => handlePhoto(e.target.files?.[0])} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">{t('Prénom *', 'First name *', 'Nombre *')}</label>
            <input type="text" required className="form-input" value={form.first_name} onChange={set('first_name')} />
          </div>
          <div>
            <label className="form-label">{t('Nom *', 'Last name *', 'Apellidos *')}</label>
            <input type="text" required className="form-input" value={form.last_name} onChange={set('last_name')} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">{t('Matricule *', 'Staff ID *', 'Matrícula *')}</label>
            <input type="text" required className="form-input" value={form.matricule} onChange={set('matricule')} />
          </div>
          <div>
            <label className="form-label">{t('Sexe *', 'Gender *', 'Sexo *')}</label>
            <select required className="form-input" value={form.gender} onChange={set('gender')}>
              <option value="">—</option>
              {GENDERS.map((g) => <option key={g} value={g}>{g === 'Masculin' ? t('Masculin', 'Male', 'Masculino') : t('Féminin', 'Female', 'Femenino')}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">{t('Téléphone *', 'Phone *', 'Teléfono *')}</label>
            <input type="tel" required className="form-input" value={form.phone} onChange={set('phone')} />
          </div>
          <div>
            <label className="form-label">Email</label>
            <input type="email" className="form-input" value={form.email} onChange={set('email')} />
          </div>
        </div>

        <div>
          <label className="form-label">{t('Adresse', 'Address', 'Dirección')}</label>
          <input type="text" className="form-input" value={form.address} onChange={set('address')} />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="form-label">{t('Fonction *', 'Role *', 'Función *')}</label>
            <input type="text" required className="form-input" placeholder={t('Ex : Secrétaire', 'E.g. Secretary', 'Ej: Secretario')}
              value={form.fonction} onChange={set('fonction')} />
          </div>
          <div>
            <label className="form-label">{t('Date de recrutement', 'Hire date', 'Fecha de contratación')}</label>
            <input type="date" className="form-input" value={form.hire_date || ''} onChange={set('hire_date')} />
          </div>
          <div>
            <label className="form-label">{t('Statut', 'Status', 'Estado')}</label>
            <input type="text" className="form-input" placeholder={t('Titulaire, vacataire…', 'Permanent, contract…', 'Titular, contratado…')}
              value={form.status} onChange={set('status')} />
          </div>
        </div>

        {/* Documents */}
        <div>
          <label className="form-label">{t('Documents', 'Documents', 'Documentos')}</label>
          <div className="space-y-1.5">
            {docs.map((d, i) => (
              <div key={`d-${i}`} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
                <a href={d.url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline truncate">{d.name}</a>
                <button type="button" onClick={() => setDocs((arr) => arr.filter((_, j) => j !== i))} className="text-red-500 text-xs hover:underline">{t('Retirer', 'Remove', 'Quitar')}</button>
              </div>
            ))}
            {newDocFiles.map((f, i) => (
              <div key={`n-${i}`} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-sm">
                <span className="truncate text-amber-800">{f.name} <span className="text-amber-500">({t('à envoyer', 'pending', 'pendiente')})</span></span>
                <button type="button" onClick={() => setNewDocFiles((arr) => arr.filter((_, j) => j !== i))} className="text-red-500 text-xs hover:underline">{t('Retirer', 'Remove', 'Quitar')}</button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => docRef.current?.click()} className="btn-secondary text-xs mt-2">
            + {t('Ajouter un document', 'Add document', 'Añadir documento')}
          </button>
          <input ref={docRef} type="file" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setNewDocFiles((arr) => [...arr, f]); e.target.value = ''; }} />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary" style={{ width: 'auto', paddingInline: '2rem' }}>
            {saving ? t('Enregistrement…', 'Saving…', 'Guardando…') : t('Enregistrer', 'Save', 'Guardar')}
          </button>
          <button type="button" onClick={onCancel} className="btn-secondary">{t('Annuler', 'Cancel', 'Cancelar')}</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Panneau d'un département (CRUD staff) ─────────────────────────────────────
function StaffDepartmentPanel({ department, label }) {
  const t = useT();
  const staff       = useSchoolStore((s) => s.staff);
  const addStaff    = useSchoolStore((s) => s.addStaff);
  const updateStaff = useSchoolStore((s) => s.updateStaff);
  const deleteStaff = useSchoolStore((s) => s.deleteStaff);
  const school      = useAuthStore((s) => s.school);
  const schoolId    = school?.id;

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [importMsg, setImportMsg] = useState(null);
  const [accessFor, setAccessFor] = useState(null); // membre pour lequel créer un accès
  const importRef = useRef();

  const members = useMemo(() => {
    const list = staff.filter((m) => m.department === department);
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter((m) =>
      (m.name || '').toLowerCase().includes(q) ||
      (m.matricule || '').toLowerCase().includes(q) ||
      (m.fonction || '').toLowerCase().includes(q));
  }, [staff, department, search]);

  // Crée/édite le membre puis envoie la photo et les nouveaux documents (qui ont
  // besoin de l'id du membre). Tolérant : un échec d'upload ne bloque pas la fiche.
  const handleSave = async (payload, { photoFile, newDocFiles }) => {
    let id = editing?.id;
    if (editing) await updateStaff(editing.id, payload);
    else { const rec = await addStaff(payload); id = rec.id; }

    let patch = {};
    if (photoFile) {
      try {
        const blob = await resizeImageToSquare(photoFile);
        const { url } = await uploadStaffPhoto(schoolId, id, blob);
        if (url) patch.photo_url = url;
      } catch (err) { console.warn('photo upload', err); }
    }
    if (newDocFiles?.length) {
      const uploaded = [];
      for (const file of newDocFiles) {
        try {
          const { doc } = await uploadStaffDocument(schoolId, id, file);
          if (doc) uploaded.push(doc);
        } catch (err) { console.warn('doc upload', err); }
      }
      if (uploaded.length) patch.documents = [...parseDocs(payload.documents), ...uploaded];
    }
    if (Object.keys(patch).length) await updateStaff(id, patch);

    setShowForm(false);
    setEditing(null);
  };

  const handleDelete = async (m) => { await deleteStaff(m.id); setConfirmDelete(null); };

  // Impression / export limités à la catégorie (département) courante.
  const handlePrint  = () => printStaffList(members, label, school);
  const handleExport = () => exportStaff(members, label);

  // Import CSV/Excel : chaque ligne est rattachée AU département courant.
  const handleImport = async (file) => {
    if (!file) return;
    setImportMsg(null);
    const { rows, error } = await parseStaffSpreadsheet(file);
    if (error) { setImportMsg({ type: 'err', text: error }); return; }
    if (!rows.length) { setImportMsg({ type: 'err', text: t('Aucune ligne valide.', 'No valid row.', 'Ninguna fila válida.') }); return; }
    for (const row of rows) await addStaff({ ...row, department });
    setImportMsg({ type: 'ok', text: `${rows.length} ${rows.length > 1 ? t('membres importés', 'members imported', 'miembros importados') : t('membre importé', 'member imported', 'miembro importado')}.` });
  };

  const total = staff.filter((m) => m.department === department).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          {members.length} {members.length !== 1 ? t('membres', 'members', 'miembros') : t('membre', 'member', 'miembro')}
        </p>
        <div className="flex gap-2 flex-wrap">
          {total > 3 && (
            <input type="text" className="form-input !w-auto" placeholder={t('Rechercher…', 'Search…', 'Buscar…')}
              value={search} onChange={(e) => setSearch(e.target.value)} />
          )}
          <button onClick={() => importRef.current?.click()} className="btn-secondary">{t('Importer', 'Import', 'Importar')}</button>
          <input ref={importRef} type="file" accept=".xlsx,.xls,.csv,.ods" className="hidden"
            onChange={(e) => { handleImport(e.target.files?.[0]); e.target.value = ''; }} />
          <button onClick={downloadStaffTemplate} className="btn-secondary" title={t('Télécharger le modèle', 'Download template', 'Descargar plantilla')}>
            {t('Modèle', 'Template', 'Plantilla')}
          </button>
          {total > 0 && (
            <>
              <button onClick={handleExport} className="btn-secondary">{t('Exporter', 'Export', 'Exportar')}</button>
              <button onClick={handlePrint} className="btn-secondary">{t('Imprimer / PDF', 'Print / PDF', 'Imprimir / PDF')}</button>
            </>
          )}
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary"
            style={{ width: 'auto', paddingInline: '1.25rem' }}>
            + {t('Ajouter', 'Add', 'Añadir')}
          </button>
        </div>
      </div>

      {importMsg && (
        <div className={`p-3 rounded-lg text-sm ${importMsg.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {importMsg.text}
        </div>
      )}

      {members.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
          <p className="text-gray-500 text-sm">{t('Aucun membre dans ce département.', 'No member in this department yet.', 'Ningún miembro en este departamento.')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3 text-left">{t('Membre', 'Member', 'Miembro')}</th>
                  <th className="px-4 py-3 text-left">{t('Matricule', 'Staff ID', 'Matrícula')}</th>
                  <th className="px-4 py-3 text-left">{t('Fonction', 'Role', 'Función')}</th>
                  <th className="px-4 py-3 text-left">{t('Contact', 'Contact', 'Contacto')}</th>
                  <th className="px-4 py-3 text-left">{t('Statut', 'Status', 'Estado')}</th>
                  <th className="px-4 py-3 text-right">{t('Actions', 'Actions', 'Acciones')}</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const isConfirming = confirmDelete?.id === m.id;
                  const docs = parseDocs(m.documents);
                  return (
                    <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <StudentAvatar student={m} size={38} />
                          <div>
                            <div className="font-semibold text-gray-900">{m.name}</div>
                            {docs.length > 0 && (
                              <div className="text-xs text-gray-400">{docs.length} {docs.length !== 1 ? t('documents', 'documents', 'documentos') : t('document', 'document', 'documento')}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{m.matricule || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-gray-600">{m.fonction || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-600">{m.phone || <span className="text-gray-300">—</span>}</div>
                        {m.email && <div className="text-xs text-gray-400">{m.email}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{m.status || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-right">
                        {isConfirming ? (
                          <span className="flex items-center justify-end gap-2">
                            <span className="text-red-600 text-xs">{t('Confirmer ?', 'Confirm?', '¿Confirmar?')}</span>
                            <button onClick={() => handleDelete(m)} className="text-xs text-red-600 hover:underline font-semibold">{t('Oui', 'Yes', 'Sí')}</button>
                            <button onClick={() => setConfirmDelete(null)} className="text-xs text-gray-500 hover:underline">{t('Non', 'No', 'No')}</button>
                          </span>
                        ) : (
                          <span className="flex items-center justify-end gap-1">
                            {m.auth_user_id ? (
                              <span className="p-1.5 text-emerald-500" title={t('Accès créé', 'Access created', 'Acceso creado')}>
                                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd"/></svg>
                              </span>
                            ) : (
                              <button onClick={() => setAccessFor(m)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50" title={t('Créer l’accès (compte + mot de passe)', 'Create access (account + password)', 'Crear acceso')}>
                                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path d="M8 7a4 4 0 118 0 4 4 0 01-8 0zm0 6a4 4 0 00-4 4h2a2 2 0 012-2h2l1.5-1.5L14 12l-1-1-1 1-1-1-1 1H8z" opacity=".0"/><path fillRule="evenodd" d="M12.293 2.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-7 7A1 1 0 019 15H7a1 1 0 01-1-1v-2a1 1 0 01.293-.707l7-7zM8 12.414V13h.586l6.293-6.293-.586-.586L8 12.414z" clipRule="evenodd"/><path d="M4 9a5 5 0 018.9-3.1l-1.42 1.42A3 3 0 006 9a3 3 0 003 3 3 3 0 00.68-.08l1.6 1.6A5 5 0 014 9z" opacity=".0"/></svg>
                              </button>
                            )}
                            <button onClick={() => { setEditing(m); setShowForm(true); }}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50" title={t('Modifier', 'Edit', 'Editar')}>
                              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                            </button>
                            <button onClick={() => setConfirmDelete(m)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50" title={t('Supprimer', 'Delete', 'Eliminar')}>
                              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <StaffForm
          initial={editing || undefined}
          department={department}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {accessFor && (
        <StaffAccessModal
          staff={accessFor}
          onCreated={(userId) => updateStaff(accessFor.id, { auth_user_id: userId })}
          onClose={() => setAccessFor(null)}
        />
      )}
    </div>
  );
}

// ── Onglet « Rôles & accès » ─────────────────────────────────────────────────
// Création de comptes applicatifs pour le personnel de direction. Réutilise
// StaffManager (provisioning auth + RPC) — seuls censeur et surveillant sont
// autorisés côté serveur ; les enseignants ont leurs propres comptes.
function RolesPanel() {
  const t = useT();
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        {t(
          "Créez des comptes pour donner accès à l’application au personnel de direction. Vous définissez leurs identifiants et pouvez les désactiver à tout moment.",
          'Create accounts to give school leadership access to the app. You set their credentials and can disable them at any time.',
          'Cree cuentas para dar acceso a la aplicación al personal de dirección. Usted define sus credenciales y puede desactivarlas en cualquier momento.',
        )}
      </p>
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
          <span>🎓</span>{t('Censeurs', 'Deans of studies', 'Jefes de estudios')}
        </h3>
        <StaffManager role="censeur" />
      </section>
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
          <span>🛡️</span>{t('Surveillants', 'Supervisors', 'Jefes de disciplina')}
        </h3>
        <StaffManager role="surveillant" />
      </section>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function Personnel() {
  const t = useT();
  const meta = useDepartmentMeta();
  const staff = useSchoolStore((s) => s.staff);
  const teachers = useSchoolStore((s) => s.teachers);
  const [dep, setDep] = useState('enseignants');

  const ROLES_TAB = 'roles';
  const countFor = (d) => d === 'enseignants' ? teachers.length : staff.filter((m) => m.department === d).length;

  return (
    <Layout>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">{t('Personnel', 'Staff', 'Personal')}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {t('Tout le personnel de l’établissement, par département.',
             'All school staff, organized by department.',
             'Todo el personal del centro, por departamento.')}
        </p>
      </div>

      {/* Onglets départements */}
      <div className="flex gap-1 mb-5 border-b border-gray-200 overflow-x-auto">
        {STAFF_DEPARTMENTS.map((d) => (
          <button key={d} onClick={() => setDep(d)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap flex items-center gap-2 ${
              dep === d ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <span>{meta[d].icon}</span>
            {meta[d].label}
            <span className="text-xs bg-gray-100 text-gray-600 px-1.5 rounded-full">{countFor(d)}</span>
          </button>
        ))}
        <button onClick={() => setDep(ROLES_TAB)}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap flex items-center gap-2 ${
            dep === ROLES_TAB ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <span>🔑</span>
          {t('Rôles & accès', 'Roles & access', 'Roles y acceso')}
        </button>
      </div>

      {dep === ROLES_TAB
        ? <RolesPanel />
        : dep === 'enseignants'
          ? <TeachersPanel />
          : <StaffDepartmentPanel key={dep} department={dep} label={meta[dep].label} />}
    </Layout>
  );
}
