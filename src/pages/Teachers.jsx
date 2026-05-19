import { useState, useMemo, useRef } from 'react';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { exportTeachers, downloadTeacherTemplate, parseTeachersSpreadsheet } from '../lib/exportCsv';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import { useT } from '../lib/i18n';
import { usePlan } from '../lib/plan';
import UpgradeBanner from '../components/UpgradeBanner';

// Client sans persistance de session — crée des comptes sans déconnecter l'admin
const anonClient = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://ltxopwoxvgslsgzixbpx.supabase.co',
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0eG9wd294dmdzbHNneml4YnB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MDk5MDEsImV4cCI6MjA5NDE4NTkwMX0.Ti72TVBLtxET3Wmmg3-pzQ0bmXFtf0HvBf7Phl_Hb20',
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

// ── Helpers avatar ────────────────────────────────────────────────────────────

const AVT_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981',
  '#3b82f6','#ef4444','#14b8a6','#f97316','#84cc16',
];

function avatarColor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVT_COLORS[Math.abs(h) % AVT_COLORS.length];
}

function initials(name = '') {
  return name.split(' ').slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
}

// ── Formulaire ajout / modification ──────────────────────────────────────────

const EMPTY_FORM = { name: '', email: '', phone: '', specialty: '' };

function TeacherForm({ initial, onSave, onCancel }) {
  const t = useT();
  const [form,   setForm]   = useState({ ...EMPTY_FORM, ...initial });
  const [saving, setSaving] = useState(false);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <Modal
      title={initial?.id ? t("Modifier l'enseignant", 'Edit teacher') : t('Nouvel enseignant', 'New teacher')}
      onClose={onCancel}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="form-label">{t('Nom complet *', 'Full name *')}</label>
          <input
            type="text" required className="form-input"
            placeholder="Ex : M. Dupont Jean"
            value={form.name} onChange={set('name')}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">{t('Email', 'Email')}</label>
            <input
              type="email" className="form-input"
              placeholder="enseignant@ecole.cm"
              value={form.email} onChange={set('email')}
            />
          </div>
          <div>
            <label className="form-label">{t('Téléphone', 'Phone')}</label>
            <input
              type="tel" className="form-input"
              placeholder="6xx xxx xxx"
              value={form.phone} onChange={set('phone')}
            />
          </div>
        </div>
        <div>
          <label className="form-label">{t('Spécialité', 'Specialty')}</label>
          <input
            type="text" className="form-input"
            placeholder={t('Ex : Mathématiques, Physique-Chimie…', 'E.g. Mathematics, Physics-Chemistry…')}
            value={form.specialty} onChange={set('specialty')}
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="submit" disabled={saving} className="btn-primary"
            style={{ width: 'auto', paddingLeft: '2rem', paddingRight: '2rem' }}
          >
            {saving ? t('Enregistrement…', 'Saving…') : t('Enregistrer', 'Save')}
          </button>
          <button type="button" onClick={onCancel} className="btn-secondary">{t('Annuler', 'Cancel')}</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Modal création d'accès enseignant ─────────────────────────────────────────

function CreateAccessModal({ teacher, school, onClose }) {
  const t = useT();
  const [email,    setEmail]    = useState(teacher.email || '');
  const [password, setPassword] = useState('');
  const [status,   setStatus]   = useState(null); // null | 'loading' | 'success' | 'error'
  const [msg,      setMsg]      = useState('');
  const [createdCreds, setCreatedCreds] = useState(null);

  const handleCreate = async (e) => {
    e.preventDefault();
    setStatus('loading');
    setMsg('');

    try {
      const { data: signUpData, error: signUpError } = await anonClient.auth.signUp({
        email: email.trim(),
        password,
      });

      let targetUserId;

      if (signUpError) {
        if (signUpError.message?.includes('already registered') || signUpError.message?.includes('User already registered')) {
          const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
          if (signInError) throw new Error(t('Email déjà utilisé mais mot de passe incorrect. Changez le mot de passe.', 'Email already in use but password is incorrect. Change the password.'));
          targetUserId = signInData.user?.id;
        } else {
          throw signUpError;
        }
      } else {
        if (!signUpData.user) throw new Error(t('Création du compte échouée', 'Account creation failed'));
        targetUserId = signUpData.user.id;
      }

      const { error: rpcError } = await supabase.rpc('admin_create_teacher_account', {
        p_target_user_id: targetUserId,
        p_full_name:      teacher.name,
      });
      if (rpcError) throw rpcError;

      setCreatedCreds({ email: email.trim(), password });
      setStatus('success');
    } catch (err) {
      console.error(err);
      setMsg(err.message || t('Erreur lors de la création du compte', 'Error creating account'));
      setStatus('error');
    }
  };

  return (
    <Modal title={t('Créer un accès enseignant', 'Create teacher access')} onClose={onClose} size="sm">
      {status === 'success' ? (
        <div className="text-center py-2">
          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="text-gray-800 font-semibold mb-1">{t('Compte créé avec succès !', 'Account created successfully!')}</p>
          <p className="text-sm text-gray-500 mb-4">{t('Transmettez ces identifiants à', 'Share these credentials with')} <strong>{teacher.name}</strong> :</p>
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 font-mono text-sm text-left space-y-2 mb-4">
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Email</span>
              <span className="font-semibold text-gray-900 truncate">{createdCreds.email}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">{t('Mot de passe', 'Password')}</span>
              <span className="font-semibold text-gray-900">{createdCreds.password}</span>
            </div>
          </div>
          <button onClick={onClose} className="btn-primary" style={{ width: 'auto', paddingInline: '2rem' }}>
            {t('Fermer', 'Close')}
          </button>
        </div>
      ) : (
        <form onSubmit={handleCreate} className="space-y-4">
          <p className="text-sm text-gray-500">
            {t('Pour', 'For')} <span className="font-semibold text-gray-700">{teacher.name}</span>
          </p>
          <div>
            <label className="form-label">{t("Email de l'enseignant *", "Teacher's email *")}</label>
            <input
              type="email" required className="form-input"
              placeholder="enseignant@ecole.cm"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">{t('Mot de passe *', 'Password *')}</label>
            <input
              type="text" required minLength={8} className="form-input font-mono"
              placeholder={t('Min. 8 caractères', 'Min. 8 characters')}
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">{t("Vous définissez ce mot de passe pour l'enseignant.", 'You are setting this password for the teacher.')}</p>
          </div>
          {status === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{msg}</div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={status === 'loading'} className="btn-primary flex-1">
              {status === 'loading' ? t('Création…', 'Creating…') : t('Créer le compte', 'Create account')}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">{t('Annuler', 'Cancel')}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ── Panneau matières d'un enseignant ──────────────────────────────────────────

function TeacherSubjectsPanel({ teacher, teacherSubjects, classes }) {
  const t = useT();

  if (!teacherSubjects.length) {
    return (
      <tr>
        <td colSpan={6} className="px-6 py-4 bg-gray-50 border-b border-gray-100 text-sm text-gray-400 text-center">
          {t('Aucune matière assignée à cet enseignant.', 'No subject assigned to this teacher.')}
        </td>
      </tr>
    );
  }

  const byClass = {};
  teacherSubjects.forEach((s) => {
    const cls = classes.find((c) => c.id === s.class_id);
    const key = cls?.name || t('Classe inconnue', 'Unknown class');
    if (!byClass[key]) byClass[key] = [];
    byClass[key].push(s);
  });

  return (
    <tr>
      <td colSpan={6} className="px-6 py-4 bg-gray-50/80 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{t('Matières enseignées', 'Subjects taught')}</p>
        <div className="flex flex-wrap gap-3">
          {Object.entries(byClass).map(([clsName, subs]) => (
            <div key={clsName} className="bg-white rounded-lg border border-gray-200 px-3 py-2">
              <div className="text-xs font-bold text-gray-500 mb-1">{clsName}</div>
              <div className="flex flex-wrap gap-1">
                {subs.map((s) => (
                  <span key={s.id} className="px-2 py-0.5 bg-brand-50 text-brand-700 rounded-md text-xs font-medium">
                    {s.name}
                    <span className="text-brand-400 ml-1">×{s.coef}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </td>
    </tr>
  );
}

// ── Panneau import enseignants ────────────────────────────────────────────────

function TeacherImportPanel({ onImport, onCancel }) {
  const t = useT();
  const fileRef = useRef();
  const [dragging,   setDragging]   = useState(false);
  const [preview,    setPreview]    = useState(null);
  const [importing,  setImporting]  = useState(false);
  const [done,       setDone]       = useState(null);

  const processFile = async (file) => {
    if (!file) return;
    const result = await parseTeachersSpreadsheet(file);
    setPreview(result);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    processFile(e.dataTransfer.files[0]);
  };

  const handleImport = async () => {
    if (!preview?.rows?.length) return;
    setImporting(true);
    for (const row of preview.rows) await onImport(row);
    setImporting(false);
    setDone(preview.rows.length);
  };

  if (done !== null) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="text-emerald-800 font-semibold text-sm">
            {done} {done > 1 ? t('enseignants importés avec succès', 'teachers imported successfully') : t('enseignant importé avec succès', 'teacher imported successfully')}
          </p>
        </div>
        <button onClick={onCancel} className="btn-secondary">{t('Fermer', 'Close')}</button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-800">{t('Importer des enseignants', 'Import teachers')}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{t('CSV ou Excel — colonnes : nom_complet, email, telephone, specialite', 'CSV or Excel — columns: nom_complet, email, telephone, specialite')}</p>
        </div>
        <button onClick={onCancel} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-6">
        <div className="space-y-5">
          {/* Zone glisser-déposer */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              dragging
                ? 'border-brand-400 bg-brand-50'
                : preview?.rows?.length
                ? 'border-emerald-300 bg-emerald-50'
                : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50'
            }`}
          >
            {preview?.rows?.length ? (
              <div className="flex flex-col items-center gap-2">
                <svg className="w-8 h-8 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <p className="text-sm font-semibold text-emerald-700">
                  {preview.rows.length} {preview.rows.length > 1 ? t('enseignants détectés', 'teachers detected') : t('enseignant détecté', 'teacher detected')}
                </p>
                <p className="text-xs text-slate-400">{t('Cliquer pour changer de fichier', 'Click to change file')}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <svg className="w-8 h-8 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points="17 8 12 3 7 8" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="12" y1="3" x2="12" y2="15" strokeLinecap="round"/>
                </svg>
                <p className="text-sm font-medium text-slate-600">{t('Glissez votre fichier ici', 'Drag your file here')}</p>
                <p className="text-xs text-slate-400">CSV, Excel (.xlsx, .xls)</p>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.ods" className="hidden"
            onChange={(e) => processFile(e.target.files[0])} />

          <div className="flex gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary text-xs">
              {t('Sélectionner un fichier', 'Select a file')}
            </button>
            <button type="button" onClick={downloadTeacherTemplate} className="btn-secondary text-xs">
              {t('Télécharger le modèle', 'Download template')}
            </button>
          </div>

          {/* Erreur */}
          {preview?.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{preview.error}</div>
          )}

          {/* Aperçu */}
          {preview?.rows?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{t('Aperçu', 'Preview')}</p>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                      <th className="text-left px-3 py-2">{t('Nom complet', 'Full name')}</th>
                      <th className="text-left px-3 py-2">Email</th>
                      <th className="text-left px-3 py-2">{t('Téléphone', 'Phone')}</th>
                      <th className="text-left px-3 py-2">{t('Spécialité', 'Specialty')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.rows.slice(0, 6).map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium text-slate-800">{r.name}</td>
                        <td className="px-3 py-2 text-slate-500">{r.email || '—'}</td>
                        <td className="px-3 py-2 text-slate-500">{r.phone || '—'}</td>
                        <td className="px-3 py-2 text-slate-500">{r.specialty || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.rows.length > 6 && (
                  <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-400 text-center">
                    …{t('et', 'and')} {preview.rows.length - 6} {t('autres', 'more')}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 mt-4">
                <button type="button" onClick={handleImport} disabled={importing}
                  className="btn-primary" style={{ width: 'auto', paddingInline: '1.75rem' }}>
                  {importing
                    ? t('Import en cours…', 'Importing…')
                    : `${t('Importer', 'Import')} ${preview.rows.length} ${preview.rows.length > 1 ? t('enseignants', 'teachers') : t('enseignant', 'teacher')}`}
                </button>
                <button type="button" onClick={onCancel} className="btn-secondary">{t('Annuler', 'Cancel')}</button>
              </div>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-sm self-start">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">{t('En-têtes attendus', 'Expected headers')}</p>
          <div className="space-y-1.5">
            {[
              { col: 'nom_complet', req: true,  desc: t('Nom et prénom', 'First and last name') },
              { col: 'email',       req: false, desc: t('Adresse email', 'Email address') },
              { col: 'telephone',   req: false, desc: t('Numéro de tél.', 'Phone number') },
              { col: 'specialite',  req: false, desc: t('Discipline', 'Subject area') },
            ].map(({ col, req, desc }) => (
              <div key={col} className="flex items-start gap-2">
                <code className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                  req ? 'bg-brand-100 text-brand-700' : 'bg-slate-200 text-slate-600'
                }`}>{col}</code>
                <span className="text-xs text-slate-500">{desc}{req ? ' *' : ''}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-3">* {t('Colonne obligatoire', 'Required column')}</p>
        </div>
      </div>
    </div>
  );
}

// ── Titre du signataire selon cycle / système ────────────────────────────────
function directorLabel(school) {
  const lang = (school?.language || '').toLowerCase();
  const n    = (school?.name || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (lang === 'anglophone') return 'The Principal';
  if (/\becole\b|primaire|maternelle|\beps\b|\bepn\b|\bep\b/.test(n))
    return 'Le Directeur / La Directrice';
  if (/lycee/.test(n)) return 'Le Proviseur / La Proviseure';
  if (/college|\bces\b|\bceg\b|cetic/.test(n)) return 'Le Principal / La Principale';
  return 'Le Proviseur / La Proviseure';
}

// ── Impression liste enseignants ──────────────────────────────────────────────
function printTeacherList(teachers, subjectsByTeacher, school, cols = {}) {
  const {
    specialty: showSpecialty = true,
    email:     showEmail     = true,
    phone:     showPhone     = true,
    subjects:  showSubjects  = true,
  } = cols;

  const today     = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const headTitle = directorLabel(school);
  const colCount  = 1 + (showSpecialty ? 1 : 0) + (showEmail ? 1 : 0) + (showPhone ? 1 : 0) + (showSubjects ? 1 : 0);

  const rows = teachers.map((tc, i) => {
    const subs    = subjectsByTeacher[tc.id] || [];
    const subList = subs.map((s) => s.name).join(', ') || '—';
    return `
      <tr class="${i % 2 === 0 ? 'even' : ''}">
        <td><strong>${tc.name}</strong></td>
        ${showSpecialty ? `<td>${tc.specialty || '—'}</td>`                       : ''}
        ${showEmail     ? `<td>${tc.email     || '—'}</td>`                       : ''}
        ${showPhone     ? `<td class="center">${tc.phone || '—'}</td>`            : ''}
        ${showSubjects  ? `<td class="subs">${subList}</td>`                      : ''}
      </tr>
    `;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<title>Enseignants — ${school?.name || 'École'}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #111; }
  .page { padding: 16mm 14mm; }
  .header { text-align: center; margin-bottom: 18px; border-bottom: 2px solid #1e3a5f; padding-bottom: 12px; }
  .header .school { font-size: 15px; font-weight: 700; text-transform: uppercase; color: #1e3a5f; letter-spacing: 0.5px; }
  .header .subtitle { font-size: 11px; color: #555; margin-top: 2px; }
  .header .doc-title { font-size: 17px; font-weight: 800; margin-top: 8px; text-transform: uppercase; letter-spacing: 1px; }
  .header .meta { font-size: 10px; color: #777; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead tr { background: #e8edf4; }
  th { padding: 6px 8px; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 1px solid #bcc8d8; text-align: left; }
  td { padding: 5px 8px; border-bottom: 1px solid #e5e9ef; vertical-align: middle; }
  tr.even td { background: #f7f9fc; }
  tfoot td { background: #f0f3f8 !important; border-top: 1px solid #bcc8d8; }
  .center { text-align: center; }
  .subs { font-size: 10px; color: #444; }
  .footer { margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px; display: flex; justify-content: space-between; font-size: 10px; color: #777; }
  .sign-area { display: flex; gap: 60px; margin-top: 30px; }
  .sign-box { flex: 1; text-align: center; }
  .sign-line { border-bottom: 1px solid #999; margin: 40px 0 4px; }
  .sign-label { font-size: 10px; color: #555; }
  @media print {
    @page { margin: 14mm; size: A4 portrait; }
    body { padding: 0; }
    .page { padding: 0; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="school">${school?.name || 'Établissement scolaire'}</div>
    <div class="subtitle">${[school?.type, school?.region].filter(Boolean).join(' — ') || ''}</div>
    <div class="doc-title">Liste du personnel enseignant</div>
    <div class="meta">Année scolaire : ${school?.current_year || '—'} &nbsp;·&nbsp; Imprimé le ${today}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Nom complet</th>
        ${showSpecialty ? '<th style="width:130px">Spécialité</th>'              : ''}
        ${showEmail     ? '<th style="width:160px">Email</th>'                   : ''}
        ${showPhone     ? '<th class="center" style="width:110px">Téléphone</th>': ''}
        ${showSubjects  ? '<th>Matières / Classes</th>'                          : ''}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="${colCount}" style="text-align:right;padding:6px 8px;font-size:11px;color:#555">
          Total : <strong>${teachers.length}</strong> enseignant${teachers.length !== 1 ? 's' : ''}
        </td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">
    <span>Total : <strong>${teachers.length}</strong> enseignant${teachers.length !== 1 ? 's' : ''}</span>
    <span>${school?.name || ''} — ${today}</span>
  </div>

  <div class="sign-area">
    <div class="sign-box">
      <div class="sign-line"></div>
      <div class="sign-label">${headTitle}</div>
    </div>
  </div>
</div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=960,height=720');
  win.document.open();
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 400);
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function Teachers() {
  const t           = useT();
  const { f }       = usePlan();
  const teachers      = useSchoolStore((s) => s.teachers);
  const subjects      = useSchoolStore((s) => s.subjects);
  const classes       = useSchoolStore((s) => s.classes);
  const addTeacher    = useSchoolStore((s) => s.addTeacher);
  const updateTeacher = useSchoolStore((s) => s.updateTeacher);
  const deleteTeacher = useSchoolStore((s) => s.deleteTeacher);
  const school        = useAuthStore((s) => s.school);
  const role          = useAuthStore((s) => s.role);

  const [search,        setSearch]        = useState('');
  const [showForm,      setShowForm]      = useState(false);
  const [showImport,    setShowImport]    = useState(false);
  const [editing,       setEditing]       = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [accessModal,   setAccessModal]   = useState(null);
  const [expandedRow,   setExpandedRow]   = useState(null);
  const [showPrintOpts, setShowPrintOpts] = useState(false);
  const [cols, setCols] = useState({ specialty: true, email: true, phone: true, subjects: true });
  const toggleCol = (key) => setCols((prev) => ({ ...prev, [key]: !prev[key] }));

  // Matières par enseignant
  const subjectsByTeacher = useMemo(() => {
    const map = {};
    subjects.forEach((s) => {
      if (!s.teacher_id) return;
      if (!map[s.teacher_id]) map[s.teacher_id] = [];
      map[s.teacher_id].push(s);
    });
    return map;
  }, [subjects]);

  const withAccount  = teachers.filter((tc) => tc.auth_user_id).length;
  const withSubjects = teachers.filter((tc) => subjectsByTeacher[tc.id]?.length > 0).length;

  const visible = useMemo(() => {
    if (!search) return teachers;
    const q = search.toLowerCase();
    return teachers.filter(
      (tc) => tc.name.toLowerCase().includes(q) ||
              (tc.specialty || '').toLowerCase().includes(q) ||
              (tc.email || '').toLowerCase().includes(q)
    );
  }, [teachers, search]);

  const handleSave = async (form) => {
    if (editing) {
      await updateTeacher(editing.id, form);
      setEditing(null);
    } else {
      await addTeacher(form);
      setShowForm(false);
    }
  };

  const handleDelete = async (teacher) => {
    await deleteTeacher(teacher.id);
    setConfirmDelete(null);
  };

  const handleImportTeacher = async (row) => {
    await addTeacher(row);
  };

  if (!f.hasTeachers) {
    return <Layout><UpgradeBanner requiredPlan="ecole" featureName={t('Enseignants', 'Teachers')} /></Layout>;
  }

  return (
    <Layout>
      <div className="max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('Enseignants', 'Teachers')}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {teachers.length} {teachers.length !== 1 ? t('enseignants enregistrés', 'teachers registered') : t('enseignant enregistré', 'teacher registered')}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => { setShowImport(true); setShowForm(false); setEditing(null); }}
              className="btn-secondary"
            >
              {t('Importer', 'Import')}
            </button>
            {teachers.length > 0 && (
              <>
                <button onClick={() => exportTeachers(teachers)} className="btn-secondary">
                  {t('Exporter', 'Export')}
                </button>
                <div className="relative">
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setShowPrintOpts(false); printTeacherList(visible, subjectsByTeacher, school, cols); }}
                      className="btn-secondary"
                    >
                      {t('Imprimer / PDF', 'Print / PDF')}
                    </button>
                    <button
                      onClick={() => setShowPrintOpts((v) => !v)}
                      className={`btn-secondary px-2.5 ${showPrintOpts ? '!bg-gray-100' : ''}`}
                      title={t('Options impression', 'Print options')}
                    >
                      ⚙
                    </button>
                  </div>
                  {showPrintOpts && (
                    <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-4 w-52">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
                        {t('Colonnes à imprimer', 'Columns to print')}
                      </p>
                      {[
                        { key: 'specialty', label: t('Spécialité', 'Specialty') },
                        { key: 'email',     label: 'Email' },
                        { key: 'phone',     label: t('Téléphone', 'Phone') },
                        { key: 'subjects',  label: t('Matières', 'Subjects') },
                      ].map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-2 py-1 cursor-pointer hover:text-gray-900">
                          <input type="checkbox" checked={cols[key]} onChange={() => toggleCol(key)}
                            className="rounded border-gray-300 text-brand-600" />
                          <span className="text-sm text-gray-700">{label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
            <button
              onClick={() => { setShowForm(true); setEditing(null); setShowImport(false); }}
              className="btn-primary"
              style={{ width: 'auto', paddingLeft: '1.5rem', paddingRight: '1.5rem' }}
            >
              + {t('Ajouter un enseignant', 'Add teacher')}
            </button>
          </div>
        </div>

        {/* Stats strip */}
        {teachers.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border-l-4 border-brand-400 p-4 shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{teachers.length}</div>
              <div className="text-sm text-gray-600 mt-0.5">{t('Enseignants', 'Teachers')}</div>
            </div>
            <div className="bg-white rounded-xl border-l-4 border-emerald-400 p-4 shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{withAccount}</div>
              <div className="text-sm text-gray-600 mt-0.5">{t('Avec compte app', 'With app access')}</div>
              <div className="text-xs text-gray-400">{teachers.length - withAccount} {t('sans accès', 'without access')}</div>
            </div>
            <div className="bg-white rounded-xl border-l-4 border-amber-400 p-4 shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{withSubjects}</div>
              <div className="text-sm text-gray-600 mt-0.5">{t('Ont des matières', 'Have subjects')}</div>
              <div className="text-xs text-gray-400">{teachers.length - withSubjects} {t('non assignés', 'unassigned')}</div>
            </div>
          </div>
        )}

        {/* Panneau import */}
        {showImport && (
          <TeacherImportPanel
            onImport={handleImportTeacher}
            onCancel={() => setShowImport(false)}
          />
        )}

        {/* Recherche */}
        {teachers.length > 3 && (
          <input
            type="text"
            className="form-input max-w-sm"
            placeholder={t('Rechercher par nom, spécialité…', 'Search by name, specialty…')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}

        {/* Empty state */}
        {teachers.length === 0 && (
          <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
            <div className="w-16 h-16 bg-brand-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-gray-600 font-medium mb-1">{t('Aucun enseignant enregistré', 'No teachers registered')}</p>
            <p className="text-gray-400 text-sm">{t("Commencez par ajouter un enseignant, puis créez-lui un accès à l'application.", 'Start by adding a teacher, then create their app access.')}</p>
          </div>
        )}

        {visible.length === 0 && teachers.length > 0 && (
          <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-gray-100">
            <p className="text-gray-400 text-sm">{t('Aucun enseignant ne correspond à', 'No teacher matches')} "{search}".</p>
          </div>
        )}

        {/* Tableau */}
        {visible.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-3 border-b border-gray-100 bg-gray-50/70">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {visible.length} {visible.length !== 1 ? t('enseignants', 'teachers') : t('enseignant', 'teacher')}
                {search && ` ${t('pour', 'for')} "${search}"`}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-5 py-3 text-left">{t('Enseignant', 'Teacher')}</th>
                    <th className="px-4 py-3 text-left">{t('Spécialité', 'Specialty')}</th>
                    <th className="px-4 py-3 text-left">{t('Contact', 'Contact')}</th>
                    <th className="px-4 py-3 text-center">{t('Matières', 'Subjects')}</th>
                    <th className="px-4 py-3 text-center">{t('Accès app', 'App access')}</th>
                    {role === 'admin' && <th className="px-4 py-3 text-center">{t('Bulletins', 'Bulletins')}</th>}
                    <th className="px-4 py-3 text-right">{t('Actions', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((teacher) => {
                    const color         = avatarColor(teacher.name);
                    const teacherSubs   = subjectsByTeacher[teacher.id] || [];
                    const isExpanded    = expandedRow === teacher.id;
                    const isConfirming  = confirmDelete?.id === teacher.id;

                    return [
                      <tr
                        key={teacher.id}
                        className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${isExpanded ? 'bg-gray-50/40' : ''}`}
                      >
                        {/* Avatar + nom */}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                              style={{ backgroundColor: color }}
                            >
                              {initials(teacher.name)}
                            </div>
                            <div>
                              <div className="font-semibold text-gray-900">{teacher.name}</div>
                            </div>
                          </div>
                        </td>

                        {/* Spécialité */}
                        <td className="px-4 py-3 text-gray-600 text-sm">
                          {teacher.specialty || <span className="text-gray-300">—</span>}
                        </td>

                        {/* Contact */}
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-600">{teacher.email || <span className="text-gray-300">—</span>}</div>
                          {teacher.phone && <div className="text-xs text-gray-400">{teacher.phone}</div>}
                        </td>

                        {/* Matières */}
                        <td className="px-4 py-3 text-center">
                          {teacherSubs.length > 0 ? (
                            <button
                              onClick={() => setExpandedRow(isExpanded ? null : teacher.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-50 text-brand-700 hover:bg-brand-100 rounded-full text-xs font-semibold transition-colors"
                            >
                              {teacherSubs.length} {teacherSubs.length !== 1 ? t('matières', 'subjects') : t('matière', 'subject')}
                              <svg
                                className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                viewBox="0 0 20 20" fill="currentColor"
                              >
                                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </button>
                          ) : (
                            <span className="text-xs text-gray-300">{t('Aucune', 'None')}</span>
                          )}
                        </td>

                        {/* Accès app */}
                        <td className="px-4 py-3 text-center">
                          {teacher.auth_user_id ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              {t('Actif', 'Active')}
                            </span>
                          ) : (
                            <button
                              onClick={() => setAccessModal(teacher)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                            >
                              + {t('Créer accès', 'Create access')}
                            </button>
                          )}
                        </td>

                        {/* Permission bulletins */}
                        {role === 'admin' && (
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => updateTeacher(teacher.id, { can_print_bulletin: !(teacher.can_print_bulletin ?? true) })}
                              title={teacher.can_print_bulletin ?? true ? t('Impression autorisée — cliquer pour révoquer', 'Printing allowed — click to revoke') : t('Impression bloquée — cliquer pour autoriser', 'Printing blocked — click to allow')}
                              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                                (teacher.can_print_bulletin ?? true) ? 'bg-emerald-500' : 'bg-gray-300'
                              }`}
                            >
                              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                (teacher.can_print_bulletin ?? true) ? 'translate-x-4' : 'translate-x-0'
                              }`} />
                            </button>
                          </td>
                        )}

                        {/* Actions */}
                        <td className="px-4 py-3 text-right">
                          {isConfirming ? (
                            <span className="flex items-center justify-end gap-2">
                              <span className="text-red-600 text-xs">{t('Confirmer ?', 'Confirm?')}</span>
                              <button onClick={() => handleDelete(teacher)} className="text-xs text-red-600 hover:underline font-semibold">{t('Oui', 'Yes')}</button>
                              <button onClick={() => setConfirmDelete(null)} className="text-xs text-gray-500 hover:underline">{t('Non', 'No')}</button>
                            </span>
                          ) : (
                            <span className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => { setEditing(teacher); setShowForm(false); }}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                                title={t('Modifier', 'Edit')}
                              >
                                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                              </button>
                              <button
                                onClick={() => setConfirmDelete(teacher)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                title={t('Supprimer', 'Delete')}
                              >
                                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>,

                      isExpanded && (
                        <TeacherSubjectsPanel
                          key={`subs-${teacher.id}`}
                          teacher={teacher}
                          teacherSubjects={teacherSubs}
                          classes={classes}
                        />
                      ),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modals */}
        {(showForm || editing) && (
          <TeacherForm
            initial={editing || undefined}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditing(null); }}
          />
        )}

        {accessModal && (
          <CreateAccessModal
            teacher={accessModal}
            school={school}
            onClose={() => setAccessModal(null)}
          />
        )}

      </div>
    </Layout>
  );
}
