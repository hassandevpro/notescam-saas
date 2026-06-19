import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useCountry, geGradeMax } from '../lib/useCountry';
import { COUNTRY_OPTIONS } from '../countries';
import { getDaysUntilLicenseExpires } from '../lib/auth';
import { useT, localeForLang } from '../lib/i18n';
import { uploadSchoolAsset } from '../lib/schoolService';
import { uuid } from '../lib/uuid';
import { copyText } from '../lib/clipboard';
import { BULLETIN_FONTS } from '../lib/schoolTheme';
import { supabase } from '../lib/supabase';
import { DEFAULT_GRADE_SCALE } from '../core/bulletinEngine';
import Layout from '../components/Layout';
import SchoolCalendar from '../components/SchoolCalendar';
import StaffManager from '../components/StaffManager';
import LicensePanel from '../components/LicensePanel';
import SwitchToLocalCard from '../components/SwitchToLocalCard';

// Barème par défaut Guinée Équatoriale (apreciaciones MEC), mis à l'échelle /10 ou /20.
function buildGeScale(maxScale = 10) {
  const f = maxScale / 10;
  const r = (n) => Math.round(n * f * 100) / 100;
  return [
    { id: 'ge1', mention: 'Sobresaliente', min: r(9),    max: r(10),   couleur: '#10B981', ordre: 1 },
    { id: 'ge2', mention: 'Notable',       min: r(7),    max: r(8.99), couleur: '#3B82F6', ordre: 2 },
    { id: 'ge3', mention: 'Bien',          min: r(6),    max: r(6.99), couleur: '#8B5CF6', ordre: 3 },
    { id: 'ge4', mention: 'Suficiente',    min: r(5),    max: r(5.99), couleur: '#F59E0B', ordre: 4 },
    { id: 'ge5', mention: 'Insuficiente',  min: 0,       max: r(4.99), couleur: '#EF4444', ordre: 5 },
  ];
}

// ── Découpage administratif par pays ────────────────────────────────────────
const REGIONS_CM = [
  'Adamaoua', 'Centre', 'Est', 'Extrême-Nord', 'Littoral',
  'Nord', 'Nord-Ouest', 'Ouest', 'Sud', 'Sud-Ouest',
];

const DEPARTMENTS_CM = {
  'Adamaoua':     ['Djérem', 'Faro-et-Déo', 'Mayo-Banyo', 'Mbéré', 'Vina'],
  'Centre':       ['Haute-Sanaga', 'Lekié', 'Mbam-et-Inoubou', 'Mbam-et-Kim', 'Méfou-et-Afamba', 'Méfou-et-Akono', 'Mfoundi', 'Nyong-et-Kellé', 'Nyong-et-Mfoumou', "Nyong-et-So'o"],
  'Est':          ['Boumba-et-Ngoko', 'Haut-Nyong', 'Kadey', 'Lom-et-Djérem'],
  'Extrême-Nord': ['Diamaré', 'Logone-et-Chari', 'Mayo-Danay', 'Mayo-Kani', 'Mayo-Sava', 'Mayo-Tsanaga'],
  'Littoral':     ['Moungo', 'Nkam', 'Sanaga-Maritime', 'Wouri'],
  'Nord':         ['Bénoué', 'Faro', 'Mayo-Louti', 'Mayo-Rey'],
  'Nord-Ouest':   ['Boyo', 'Bui', 'Donga-Mantung', 'Menchum', 'Mezam', 'Momo', 'Ngo-Ketunjia'],
  'Ouest':        ['Bamboutos', 'Haut-Nkam', 'Hauts-Plateaux', 'Koung-Khi', 'Menoua', 'Mifi', 'Ndé', 'Noun'],
  'Sud':          ['Dja-et-Lobo', 'Mvila', 'Océan', 'Vallée-du-Ntem'],
  'Sud-Ouest':    ['Fako', 'Koupé-Manengouba', 'Lebialem', 'Manyu', 'Meme', 'Ndian'],
};

// Guinea Ecuatorial — 8 provincias officielles + leurs distritos.
const PROVINCES_GE = [
  'Bioko Norte', 'Bioko Sur', 'Annobón', 'Litoral',
  'Centro Sur', 'Kié-Ntem', 'Wele-Nzas', 'Djibloho',
];

const DISTRITOS_GE = {
  'Bioko Norte': ['Malabo', 'Baney', 'Rebola'],
  'Bioko Sur':   ['Luba', 'Riaba'],
  'Annobón':     ['San Antonio de Palé'],
  'Litoral':     ['Bata', 'Mbini', 'Cogo', 'Río Campo'],
  'Centro Sur':  ['Evinayong', 'Akurenam', 'Niefang'],
  'Kié-Ntem':    ['Ebebiyín', 'Mikomeseng', 'Nsork', 'Nsoc-Nsomo'],
  'Wele-Nzas':   ['Mongomo', 'Aconibe', 'Añisok', 'Nsork'],
  'Djibloho':    ['Ciudad de la Paz', 'Oyala'],
};

// Découpage administratif selon le pays de l'école.
// Une école Guinée Éq. liste ses provinces/distritos espagnols ; sinon Cameroun.
function regionsFor(isGE)     { return isGE ? PROVINCES_GE  : REGIONS_CM; }
function departmentsFor(isGE) { return isGE ? DISTRITOS_GE  : DEPARTMENTS_CM; }

const SCHOOL_TYPES = [
  'Public', 'Privé Laïc', 'Privé Catholique', 'Privé Protestant',
  'Privé Islamique', 'Communautaire', 'Autre',
];

// Options Cameroun — affichées uniquement pour les écoles camerounaises.
// Les libellés sont des chaînes FR canoniques pour passer par t() côté UI.
const LANGUAGES = [
  { value: 'francophone', label: 'Francophone (Séquences — notes /20)' },
  { value: 'anglophone',  label: 'Anglophone (Terms — notes /100)' },
  { value: 'bilingue',    label: 'Bilingue (Francophone + Anglophone)' },
];


function LicenseBadge({ school }) {
  const t = useT();
  const daysLeft = getDaysUntilLicenseExpires(school?.license_expires_at);
  const status   = school?.license_status;
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-emerald-100 text-emerald-800">
        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
        {t('Licence active', 'Active license')}
      </span>
    );
  }
  if (status === 'trial' && daysLeft > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-yellow-100 text-yellow-800">
        <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />
        {t('Essai gratuit', 'Free trial')} — {daysLeft} {t(`jour${daysLeft > 1 ? 's' : ''} restant${daysLeft > 1 ? 's' : ''}`, `day${daysLeft > 1 ? 's' : ''} remaining`)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-800">
      <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
      {t('Licence expirée', 'License expired')}
    </span>
  );
}

function Section({ title, children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl shadow-card border border-slate-100 overflow-hidden ${className}`}>
      <div className="px-6 py-3.5 border-b border-slate-100 bg-slate-50/70">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">{title}</h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1">{label}</div>
      <div className="text-sm text-gray-800 font-medium">{value || <span className="text-gray-300">—</span>}</div>
    </div>
  );
}

// Composant d'upload d'image avec prévisualisation
function AssetUploader({ label, currentUrl, onUpload, onRemove, uploading, hint }) {
  const t = useT();
  return (
    <div>
      <div className="form-label">{label}</div>
      {currentUrl ? (
        <div className="flex items-start gap-3">
          <div className="w-20 h-20 border border-gray-200 rounded-lg bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
            <img src={currentUrl} alt={label} className="max-w-full max-h-full object-contain" />
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
              {uploading ? t('Envoi…', 'Uploading…') : t('Remplacer', 'Replace')}
              <input
                type="file"
                accept="image/jpeg,image/png,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => e.target.files[0] && onUpload(e.target.files[0])}
                disabled={uploading}
              />
            </label>
            <button
              type="button"
              onClick={onRemove}
              className="text-xs text-red-500 hover:underline text-left"
            >
              {t('Supprimer', 'Remove')}
            </button>
          </div>
        </div>
      ) : (
        <label className={`flex flex-col items-center justify-center w-24 h-20 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${uploading ? 'border-gray-200 opacity-50 pointer-events-none' : 'border-gray-300 hover:border-brand-400 hover:bg-brand-50'}`}>
          <span className="text-2xl leading-none mb-1.5">+</span>
          <span className="text-xs text-gray-400 text-center px-1 leading-tight">
            {uploading ? t('Envoi…', 'Uploading…') : t('Choisir', 'Choose')}
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/svg+xml,image/webp"
            className="hidden"
            onChange={(e) => e.target.files[0] && onUpload(e.target.files[0])}
            disabled={uploading}
          />
        </label>
      )}
      {hint && <p className="text-xs text-gray-400 mt-1.5 leading-snug">{hint}</p>}
    </div>
  );
}

export default function Settings() {
  const t = useT();
  const school         = useAuthStore((s) => s.school);
  const role           = useAuthStore((s) => s.role);
  const fullName       = useAuthStore((s) => s.fullName);
  const doUpdateSchool = useAuthStore((s) => s.updateSchool);
  const country        = useCountry();
  const isGE           = country.code === 'guinea_eq';
  // Découpage administratif (régions/départements) selon le pays de l'école.
  const regionList     = regionsFor(isGE);
  const departmentMap  = departmentsFor(isGE);
  // Pays sans liste administrative prédéfinie (Côte d'Ivoire, Gabon, Congo…) :
  // région et département en saisie libre, pour ne pas imposer le découpage
  // camerounais dans l'en-tête officiel du bulletin.
  const freeAdmin      = !['cameroon_fr', 'cameroon_en', 'guinea_eq'].includes(country.code);

  const isAdmin = role === 'admin';

  const [form,           setForm]           = useState(null);
  const [saving,         setSaving]         = useState(false);
  const [saved,          setSaved]          = useState(false);
  const [error,          setError]          = useState(null);
  const [uploadingAsset, setUploadingAsset] = useState(null); // 'logo' | 'stamp' | 'signature'
  const [codeCopied,     setCodeCopied]     = useState(false);

  // ── Options de notation GE (décidées par l'administrateur) ────────────────
  const [geMax,       setGeMax]       = useState(10);
  const [gePrimCoef,  setGePrimCoef]  = useState(false);
  const [geOptSaving, setGeOptSaving] = useState(false);
  const [geOptSaved,  setGeOptSaved]  = useState(false);
  const [geOptError,  setGeOptError]  = useState(null);

  useEffect(() => {
    setGeMax(Number(school?.ge_grade_max) === 20 ? 20 : 10);
    setGePrimCoef(school?.ge_primary_coef === true);
  }, [school?.id, school?.ge_grade_max, school?.ge_primary_coef]);

  const handleGeOptSave = async () => {
    setGeOptSaving(true); setGeOptSaved(false); setGeOptError(null);
    const res = await doUpdateSchool({ ge_grade_max: geMax, ge_primary_coef: gePrimCoef });
    setGeOptSaving(false);
    if (res?.error) setGeOptError(res.error);
    else { setGeOptSaved(true); setTimeout(() => setGeOptSaved(false), 3000); }
  };

  // ── Profil enseignant ────────────────────────────────────────────────────
  const teacherId = useAuthStore((s) => s.teacherId);
  const [tProfile,     setTProfile]     = useState({ name: '', phone: '' });
  const [tSaving,      setTSaving]      = useState(false);
  const [tSaved,       setTSaved]       = useState(false);
  const [tError,       setTError]       = useState(null);

  useEffect(() => {
    if (role !== 'teacher' || !teacherId) return;
    supabase
      .from('teachers')
      .select('name, phone')
      .eq('id', teacherId)
      .single()
      .then(({ data }) => {
        if (data) setTProfile({ name: data.name || '', phone: data.phone || '' });
      });
  }, [teacherId, role]);

  const handleTeacherSave = async (e) => {
    e.preventDefault();
    if (!teacherId) return;
    setTSaving(true); setTError(null); setTSaved(false);
    const { error } = await supabase.rpc('update_teacher_profile', {
      p_teacher_id: teacherId,
      p_name:  tProfile.name.trim(),
      p_phone: tProfile.phone.trim(),
    });
    setTSaving(false);
    if (error) {
      setTError(error.message);
    } else {
      setTSaved(true);
      setTimeout(() => setTSaved(false), 3500);
    }
  };

  // ── Barème de notation (admin) ───────────────────────────────────────────
  const [gradeScale,  setGradeScale]  = useState(DEFAULT_GRADE_SCALE);
  const [scaleSaving, setScaleSaving] = useState(false);
  const [scaleSaved,  setScaleSaved]  = useState(false);
  const [scaleError,  setScaleError]  = useState(null);
  const [newEntry,    setNewEntry]    = useState({ mention: '', min: 0, max: 20, couleur: '#10B981', ordre: 0 });

  useEffect(() => {
    if (school) {
      setForm({
        name:         school.name         || '',
        type:         school.type         || '',
        language:     school.language     || 'francophone',
        region:       school.region       || '',
        division:     school.division     || '',
        subdivision:  school.subdivision  || '',
        director:     school.director     || '',
        address:      school.address      || '',
        phone:        school.phone        || '',
        email:        school.email        || '',
        current_year: school.current_year || '',
        establishment_no: school.establishment_no || '',
        bulletin_font:    school.bulletin_font    || 'arial',
      });
      if (Array.isArray(school.grade_scale) && school.grade_scale.length > 0) {
        setGradeScale(school.grade_scale);
      } else if (isGE) {
        // Guinée Équatoriale sans barème personnalisé → apreciaciones espagnoles.
        setGradeScale(buildGeScale(geGradeMax(school)));
      }
    }
  }, [school, isGE]);

  const handleAddEntry = () => {
    if (!newEntry.mention.trim()) return;
    const entry = {
      id:      uuid(),
      mention: newEntry.mention.trim(),
      min:     Number(newEntry.min),
      max:     Number(newEntry.max),
      couleur: newEntry.couleur,
      ordre:   Number(newEntry.ordre),
    };
    setGradeScale((prev) => [...prev, entry].sort((a, b) => a.ordre - b.ordre));
    setNewEntry({ mention: '', min: 0, max: 20, couleur: '#10B981', ordre: 0 });
  };

  const handleDeleteEntry = (id) =>
    setGradeScale((prev) => prev.filter((e) => e.id !== id));

  const handleScaleSave = async () => {
    setScaleSaving(true); setScaleError(null); setScaleSaved(false);
    const result = await doUpdateSchool({ grade_scale: gradeScale });
    setScaleSaving(false);
    if (result.error) {
      setScaleError(result.error);
    } else {
      setScaleSaved(true);
      setTimeout(() => setScaleSaved(false), 3500);
    }
  };

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleRegionChange = (e) => {
    const newRegion = e.target.value;
    setForm((f) => ({
      ...f,
      region:   newRegion,
      division: departmentMap[newRegion]?.includes(f.division) ? f.division : '',
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const result = await doUpdateSchool(form);
    setSaving(false);
    if (result.error) {
      setError(result.error);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3500);
    }
  };

  const handleAssetUpload = async (file, assetType, columnName) => {
    setUploadingAsset(assetType);
    setError(null);
    const { url, error: uploadError } = await uploadSchoolAsset(school.id, file, assetType);
    if (!url) {
      const msg = uploadError?.message || t('Erreur inconnue', 'Unknown error');
      setError(t(`Téléversement échoué : ${msg}`, `Upload failed: ${msg}`));
      setUploadingAsset(null);
      return;
    }
    const result = await doUpdateSchool({ [columnName]: url });
    setUploadingAsset(null);
    if (result.error) setError(result.error);
  };

  const handleAssetRemove = async (columnName) => {
    await doUpdateSchool({ [columnName]: null });
  };

  if (!form) return null;

  const daysLeft = getDaysUntilLicenseExpires(school?.license_expires_at);

  return (
    <Layout>
      <div className="max-w-5xl">

        {/* ── En-tête ─────────────────────────────────────────────────────── */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{t('Paramètres', 'Settings')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("Configuration de l'établissement, bulletins et calendrier.", 'School configuration, report cards and calendar.')}</p>
        </div>

        {/* Licence (édition LAN, admin) — auto-masqué en cloud / hors admin */}
        <LicensePanel />
        {/* Passer en local (édition CLOUD, admin) — auto-masqué en LAN / hors admin */}
        <SwitchToLocalCard />

        {!isAdmin && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 mb-6">
            {t('Seul l\'administrateur peut modifier ces paramètres.', 'Only the administrator can modify these settings.')}
          </div>
        )}

        {/* ── 1. Mon profil + Licence ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Section title={t('Mon profil', 'My profile')} className="h-full">
            {role === 'teacher' ? (
              <form onSubmit={handleTeacherSave} className="grid grid-cols-1 gap-4">
                <div>
                  <label className="form-label">{t('Nom complet *', 'Full name *')}</label>
                  <input type="text" required className="form-input" value={tProfile.name}
                    onChange={(e) => setTProfile((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">{t('Numéro WhatsApp / téléphone', 'WhatsApp / phone number')}</label>
                  <input type="text" className="form-input" placeholder={t('Ex : 699 00 00 00', 'E.g. 699 00 00 00', 'Ej: 222 00 00 00')} value={tProfile.phone}
                    onChange={(e) => setTProfile((p) => ({ ...p, phone: e.target.value }))} />
                  <p className="text-xs text-gray-400 mt-1">{t("Permet à l'admin de vous contacter via WhatsApp.", 'Allows the admin to contact you via WhatsApp.')}</p>
                </div>
                <Field label="Email" value={useAuthStore.getState().user?.email} />
                <div className="flex items-center gap-3 pt-1">
                  <button type="submit" disabled={tSaving} className="btn-primary" style={{ width: 'auto', paddingInline: '1.5rem' }}>
                    {tSaving ? t('Enregistrement…', 'Saving…') : t('Mettre à jour', 'Update')}
                  </button>
                  {tSaved && <span className="text-sm text-emerald-600 font-medium">✓ {t('Profil mis à jour', 'Profile updated')}</span>}
                  {tError && <span className="text-sm text-red-600">{tError}</span>}
                </div>
              </form>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                <Field label={t('Nom complet', 'Full name')} value={fullName} />
                <Field label={t('Rôle', 'Role')} value={role === 'admin' ? t('Administrateur', 'Administrator') : role === 'censeur' ? t('Censeur', 'Dean of studies', 'Jefe de estudios') : role === 'surveillant' ? t('Surveillant', 'Supervisor', 'Jefe de disciplina') : role} />
                <Field label="Email" value={useAuthStore.getState().user?.email} />
              </div>
            )}
          </Section>

          <Section title={t('Licence & abonnement', 'License & subscription')} className="h-full">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 font-medium">{t('Statut', 'Status')}</span>
                <LicenseBadge school={school} />
              </div>
              {school?.license_expires_at && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 font-medium">{t('Expiration', 'Expiry')}</span>
                  <span className="text-sm text-gray-800">
                    {new Date(school.license_expires_at).toLocaleDateString(localeForLang(), { day: 'numeric', month: 'long', year: 'numeric' })}
                    {daysLeft !== null && daysLeft > 0 && (
                      <span className="text-gray-400 ml-2">({daysLeft} {t(`jour${daysLeft > 1 ? 's' : ''}`, `day${daysLeft > 1 ? 's' : ''}`)})</span>
                    )}
                  </span>
                </div>
              )}
              <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">
                {t('Pour renouveler ou changer de plan, contactez-nous à', 'To renew or change plan, contact us at')}{' '}
                <a href="mailto:hassanousmane0@gmail.com" className="text-brand-600 hover:underline">hassanousmane0@gmail.com</a>
              </p>
            </div>
          </Section>
        </div>

        {/* ── 2. Formulaire établissement + visuels ───────────────────────── */}
        <form onSubmit={handleSave} className="mb-4">
          <div className={`grid grid-cols-1 ${isAdmin ? 'lg:grid-cols-3' : ''} gap-6 mb-4`}>

            {/* Infos + Coordonnées (2/3) */}
            <Section title={t("Informations de l'établissement", 'School information')} className={isAdmin ? 'lg:col-span-2' : ''}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="form-label">{t("Nom de l'établissement *", 'School name *')}</label>
                  <input type="text" required disabled={!isAdmin}
                    className="form-input disabled:bg-gray-50 disabled:text-gray-500"
                    value={form.name} onChange={set('name')} />
                </div>
                <div>
                  <label className="form-label">{t("Type d'enseignement", 'School type')}</label>
                  <select disabled={!isAdmin} className="form-input disabled:bg-gray-50 disabled:text-gray-500" value={form.type} onChange={set('type')}>
                    <option value="">— {t('Choisir', 'Select')} —</option>
                    {SCHOOL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">
                    {t("Système d'enseignement", 'Teaching system', 'Sistema educativo')}
                  </label>
                  {isGE ? (
                    // Guinea Ecuatorial : champ verrouillé sur ES, pas de FR/EN.
                    <input
                      type="text"
                      disabled
                      className="form-input disabled:bg-emerald-50 disabled:text-emerald-800 font-medium"
                      value={`🇬🇶 ${country.name} — Notas /${geMax}, 3 Trimestres`}
                    />
                  ) : (
                    <select
                      disabled={!isAdmin}
                      className="form-input disabled:bg-gray-50 disabled:text-gray-500"
                      value={form.language || 'francophone'}
                      onChange={set('language')}
                    >
                      {LANGUAGES.map((l) => (
                        <option key={l.value} value={l.value}>{t(l.label, l.label)}</option>
                      ))}
                    </select>
                  )}
                </div>
                {/* Guinea Ecuatorial : opciones de calificación decididas por el centro */}
                {isGE && (
                  <div className="md:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                    <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-3">
                      Opciones de calificación
                    </p>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="form-label">Escala de notas</label>
                        <select
                          disabled={!isAdmin}
                          className="form-input disabled:bg-gray-50 disabled:text-gray-500"
                          value={geMax}
                          onChange={(e) => setGeMax(Number(e.target.value))}
                        >
                          <option value={10}>Sobre 10 (modelo español)</option>
                          <option value={20}>Sobre 20</option>
                        </select>
                      </div>
                      <div className="flex items-end">
                        <label className={`flex items-center gap-2 text-sm ${isAdmin ? 'cursor-pointer' : 'opacity-60'}`}>
                          <input
                            type="checkbox"
                            disabled={!isAdmin}
                            className="w-4 h-4 accent-emerald-600"
                            checked={gePrimCoef}
                            onChange={(e) => setGePrimCoef(e.target.checked)}
                          />
                          <span className="font-medium text-gray-700">Usar coeficientes en Primaria</span>
                        </label>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      Por defecto la Primaria pondera todas las asignaturas por igual. La Secundaria y el Bachillerato siempre usan coeficientes.
                    </p>
                    {isAdmin && (
                      <div className="flex items-center gap-3 mt-3">
                        <button
                          onClick={handleGeOptSave}
                          disabled={geOptSaving}
                          className="btn-primary"
                          style={{ width: 'auto', paddingInline: '1.5rem' }}
                        >
                          {geOptSaving ? 'Guardando…' : 'Guardar opciones'}
                        </button>
                        {geOptSaved && <span className="text-sm text-emerald-600 font-medium">✓ Guardado</span>}
                        {geOptError && <span className="text-sm text-red-600">{geOptError}</span>}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="form-label">{t('Année scolaire', 'Academic year')}</label>
                  <input type="text" disabled={!isAdmin} className="form-input disabled:bg-gray-50 disabled:text-gray-500" placeholder={t('Ex : 2025-2026', 'E.g. 2025-2026')} value={form.current_year} onChange={set('current_year')} />
                </div>
                <div>
                  <label className="form-label">{t('Directeur / Proviseur', 'Principal / Headmaster')}</label>
                  <input type="text" disabled={!isAdmin} className="form-input disabled:bg-gray-50 disabled:text-gray-500" placeholder={t('Ex : M. NKOA Paul', 'E.g. Mr. NKOA Paul')} value={form.director} onChange={set('director')} />
                </div>
                <div>
                  <label className="form-label">{t("N° d'établissement", 'School number', 'N.º de centro')}</label>
                  <input type="text" disabled={!isAdmin} className="form-input disabled:bg-gray-50 disabled:text-gray-500" placeholder={t("Ex : 123/MINESEC", 'E.g. 123/MINEDUC')} value={form.establishment_no} onChange={set('establishment_no')} />
                  <p className="text-xs text-gray-400 mt-1">{t("Apparaît sous les officiels de délégation, en en-tête du bulletin.", 'Shown under the delegation officials, in the report card header.')}</p>
                </div>

                {/* Séparateur coordonnées */}
                <div className="md:col-span-2 border-t border-gray-100 pt-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{t('Localisation & contact', 'Location & contact')}</p>
                </div>

                <div>
                  <label className="form-label">{t('Région', 'Region', isGE ? 'Provincia' : 'Región')}</label>
                  {freeAdmin ? (
                    <input type="text" disabled={!isAdmin} className="form-input disabled:bg-gray-50 disabled:text-gray-500" placeholder={t('Ex : Estuaire, Lagunes…', 'E.g. Estuaire, Lagunes…')} value={form.region} onChange={set('region')} />
                  ) : (
                    <select disabled={!isAdmin} className="form-input disabled:bg-gray-50 disabled:text-gray-500" value={form.region} onChange={handleRegionChange}>
                      <option value="">— {t('Choisir', 'Select')} —</option>
                      {regionList.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  )}
                </div>
                <div>
                  <label className="form-label">{t('Département', 'Division', isGE ? 'Distrito' : 'Departamento')}</label>
                  {freeAdmin ? (
                    <input type="text" disabled={!isAdmin} className="form-input disabled:bg-gray-50 disabled:text-gray-500" placeholder={t('Ex : Libreville, Abidjan…', 'E.g. Libreville, Abidjan…')} value={form.division} onChange={set('division')} />
                  ) : form.region && departmentMap[form.region] ? (
                    <select disabled={!isAdmin} className="form-input disabled:bg-gray-50 disabled:text-gray-500" value={form.division} onChange={set('division')}>
                      <option value="">— {t('Choisir', 'Select')} —</option>
                      {departmentMap[form.region].map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  ) : (
                    <input type="text" disabled className="form-input bg-gray-50 text-gray-400 cursor-not-allowed" placeholder={t("Choisir d'abord une région", 'Select a region first')} value="" readOnly />
                  )}
                </div>
                <div>
                  <label className="form-label">{t('Arrondissement / Subdivision', 'Subdivision', isGE ? 'Barrio / Subdivisión' : 'Distrito / Subdivisión')}</label>
                  <input type="text" disabled={!isAdmin} className="form-input disabled:bg-gray-50 disabled:text-gray-500" placeholder={t('Ex : Yaoundé 1er…', 'E.g. Yaoundé 1st…', 'Ej: Malabo 1º…')} value={form.subdivision} onChange={set('subdivision')} />
                </div>
                <div>
                  <label className="form-label">{t('Adresse / B.P.', 'Address / P.O. Box')}</label>
                  <input type="text" disabled={!isAdmin} className="form-input disabled:bg-gray-50 disabled:text-gray-500" placeholder={t('Ex : B.P. 1234 Yaoundé', 'E.g. P.O. Box 1234 Yaoundé', 'Ej: Apdo. 1234 Malabo')} value={form.address} onChange={set('address')} />
                </div>
                <div>
                  <label className="form-label">{t('Téléphone', 'Phone')}</label>
                  <input type="text" disabled={!isAdmin} className="form-input disabled:bg-gray-50 disabled:text-gray-500" placeholder={t('Ex : 222 XX XX XX', 'E.g. 222 XX XX XX', 'Ej: 222 XX XX XX')} value={form.phone} onChange={set('phone')} />
                </div>
                <div>
                  <label className="form-label">Email</label>
                  <input type="email" disabled={!isAdmin} className="form-input disabled:bg-gray-50 disabled:text-gray-500" placeholder={t('contact@ecole.cm', 'contact@school.com', 'contacto@centro.gq')} value={form.email} onChange={set('email')} />
                </div>
              </div>
            </Section>

            {/* Visuels du bulletin (1/3) — admin seulement */}
            {isAdmin && (
              <Section title={t('Visuels du bulletin', 'Report card visuals')}>
                <div className="mb-6">
                  <label className="form-label">{t('Police du bulletin', 'Report card font', 'Fuente del boletín')}</label>
                  <select className="form-input" value={form.bulletin_font} onChange={set('bulletin_font')} style={{ fontFamily: (BULLETIN_FONTS.find((f) => f.value === form.bulletin_font) || BULLETIN_FONTS[0]).stack }}>
                    {BULLETIN_FONTS.map((f) => (
                      <option key={f.value} value={f.value} style={{ fontFamily: f.stack }}>{f.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">{t('Police appliquée à tous les bulletins imprimés.', 'Font applied to all printed report cards.')}</p>
                </div>
                <div className="space-y-6">
                  <AssetUploader
                    label={t("Logo de l'école", 'School logo')}
                    currentUrl={school?.logo_url}
                    onUpload={(file) => handleAssetUpload(file, 'logo', 'logo_url')}
                    onRemove={() => handleAssetRemove('logo_url')}
                    uploading={uploadingAsset === 'logo'}
                    hint={t('PNG / SVG carré, fond transparent.', 'Square PNG / SVG, transparent background.')}
                  />
                  <AssetUploader
                    label={t('Tampon officiel', 'Official stamp')}
                    currentUrl={school?.stamp_url}
                    onUpload={(file) => handleAssetUpload(file, 'stamp', 'stamp_url')}
                    onRemove={() => handleAssetRemove('stamp_url')}
                    uploading={uploadingAsset === 'stamp'}
                    hint={t('PNG rond recommandé.', 'Round PNG recommended.')}
                  />
                  <AssetUploader
                    label={t('Signature du proviseur', "Principal's signature")}
                    currentUrl={school?.signature_url}
                    onUpload={(file) => handleAssetUpload(file, 'signature', 'signature_url')}
                    onRemove={() => handleAssetRemove('signature_url')}
                    uploading={uploadingAsset === 'signature'}
                    hint="JPG, PNG ou SVG."
                  />
                </div>
                {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
              </Section>
            )}

          </div>

          {isAdmin && (
            <div className="flex items-center gap-4 mb-6">
              <button type="submit" disabled={saving} className="btn-primary" style={{ width: 'auto', paddingLeft: '2rem', paddingRight: '2rem' }}>
                {saving ? t('Enregistrement…', 'Saving…') : t('Enregistrer les modifications', 'Save changes')}
              </button>
              {saved && <span className="text-sm text-emerald-600 font-medium">✓ {t('Modifications sauvegardées', 'Changes saved')}</span>}
              {error && <span className="text-sm text-red-600">{error}</span>}
            </div>
          )}
        </form>

        {/* ── 3. Code établissement ───────────────────────────────────────── */}
        {isAdmin && school?.id && (
          <div className="bg-brand-50 border border-brand-100 rounded-xl px-6 py-4 mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-brand-700 uppercase tracking-wider mb-0.5">{t('Code établissement', 'School code')}</div>
              <div className="text-xs text-brand-600">{t('À communiquer aux enseignants pour leur inscription sur', 'Share with teachers for their registration on')} <strong>/teacher-signup</strong></div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-2xl font-bold tracking-widest text-brand-800 bg-white border border-brand-200 rounded-lg px-4 py-2 select-all">
                {school.id.slice(0, 8).toUpperCase()}
              </span>
              <button
                onClick={() => {
                  copyText(school.id.slice(0, 8).toUpperCase());
                  setCodeCopied(true);
                  setTimeout(() => setCodeCopied(false), 2000);
                }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors bg-white border-brand-200 text-brand-700 hover:bg-brand-100"
              >
                {codeCopied ? (
                  <><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>{t('Copié !', 'Copied!')}</>
                ) : (
                  <><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>{t('Copier', 'Copy')}</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── 4. Barème de notation ────────────────────────────────────────── */}
        {isAdmin && (
          <Section title={t('Barème de notation', 'Grade scale')} className="mb-6">
            <p className="text-xs text-slate-500 mb-5">
              {t('Définissez les intervalles de notes et leurs mentions. Utilisé sur tous les bulletins.', 'Define grade intervals and their labels. Used on all report cards.')}
            </p>
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 mb-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">{t('Ajouter une mention', 'Add a grade label')}</p>
              <div className="grid grid-cols-2 sm:grid-cols-[1fr_80px_80px_48px_72px_auto] gap-2 items-end">
                <div className="sm:col-span-1">
                  <label className="form-label text-xs">{t('Mention', 'Label')}</label>
                  <input type="text" className="form-input" placeholder={t('Ex: Très bien', 'E.g. Very good', 'Ej: Sobresaliente')}
                    value={newEntry.mention}
                    onChange={(e) => setNewEntry((p) => ({ ...p, mention: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddEntry())} />
                </div>
                <div>
                  <label className="form-label text-xs">Min</label>
                  <input type="number" min="0" max="20" step="0.01" className="form-input"
                    value={newEntry.min} onChange={(e) => setNewEntry((p) => ({ ...p, min: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label text-xs">Max</label>
                  <input type="number" min="0" max="20" step="0.01" className="form-input"
                    value={newEntry.max} onChange={(e) => setNewEntry((p) => ({ ...p, max: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label text-xs">{t('Couleur', 'Color', 'Color')}</label>
                  <input type="color" className="h-[2.625rem] w-full rounded-xl border border-slate-200 cursor-pointer p-0.5 bg-white"
                    value={newEntry.couleur} onChange={(e) => setNewEntry((p) => ({ ...p, couleur: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label text-xs">{t('Ordre', 'Order', 'Orden')}</label>
                  <input type="number" min="0" className="form-input"
                    value={newEntry.ordre} onChange={(e) => setNewEntry((p) => ({ ...p, ordre: e.target.value }))} />
                </div>
                <div className="flex items-end col-span-2 sm:col-span-1">
                  <button type="button" onClick={handleAddEntry} disabled={!newEntry.mention.trim()}
                    className="w-full h-[2.625rem] px-4 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors">
                    {t('Ajouter', 'Add')}
                  </button>
                </div>
              </div>
            </div>

            {gradeScale.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-semibold uppercase tracking-wider">
                      <th className="text-left px-4 py-2.5">{t('Mention', 'Label')}</th>
                      <th className="text-left px-4 py-2.5">{t('Intervalle', 'Range')}</th>
                      <th className="text-left px-4 py-2.5">{t('Ordre', 'Order', 'Orden')}</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...gradeScale].sort((a, b) => a.ordre - b.ordre).map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-semibold"
                            style={{ backgroundColor: entry.couleur + '22', color: entry.couleur }}>
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.couleur }} />
                            {entry.mention}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 font-mono text-xs">{entry.min} – {entry.max}</td>
                        <td className="px-4 py-3 text-slate-500">{entry.ordre}</td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" onClick={() => handleDeleteEntry(entry.id)}
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title={t('Supprimer', 'Delete')}>
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-6">{t('Aucun barème configuré.', 'No grade scale configured.')}</p>
            )}

            <div className="flex items-center gap-4 pt-4 mt-4 border-t border-slate-100">
              <button type="button" onClick={handleScaleSave} disabled={scaleSaving}
                className="btn-primary" style={{ width: 'auto', paddingInline: '1.5rem' }}>
                {scaleSaving ? t('Enregistrement…', 'Saving…') : t('Enregistrer le barème', 'Save grade scale')}
              </button>
              {scaleSaved && <span className="text-sm text-emerald-600 font-medium">✓ {t('Barème sauvegardé', 'Grade scale saved')}</span>}
              {scaleError && <span className="text-sm text-red-600">{scaleError}</span>}
            </div>
          </Section>
        )}

        {/* ── 5. Personnel de direction (censeur + surveillant) ────────────── */}
        {isAdmin && (
          <Section title={t('Censeur', 'Dean of studies', 'Jefe de estudios')} className="mb-6">
            <StaffManager role="censeur" />
          </Section>
        )}
        {isAdmin && (
          <Section title={t('Surveillant', 'Supervisor', 'Jefe de disciplina')} className="mb-6">
            <StaffManager role="surveillant" />
          </Section>
        )}

        {/* ── 6. Calendrier scolaire ───────────────────────────────────────── */}
        {isAdmin && (
          <Section title={t('Calendrier scolaire', 'School calendar')} className="mb-6">
            <SchoolCalendar />
          </Section>
        )}

      </div>
    </Layout>
  );
}
