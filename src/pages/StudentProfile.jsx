import { useMemo, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { getAvg, frApp, enGrade, resolveScores } from '../core/bulletinEngine';
import Modal from '../components/Modal';
import Layout from '../components/Layout';
import StudentAvatar from '../components/StudentAvatar';
import { uploadStudentPhoto, deleteStudentPhoto } from '../lib/schoolService';
import { resizeImageToSquare } from '../lib/image';
import { resolveTransferType, TRANSFER_TYPES, CLOTURE_MOTIFS } from '../core/transferEngine';
import { copyText } from '../lib/clipboard';
import { useT, localeForLang } from '../lib/i18n';
import { toast } from '../store/toastStore';
import { usePlan } from '../lib/plan';
import { studentFeeSituation, FEE_STATUS, inscriptionApplies } from '../lib/feeEngine';
import { STATUS_UI, MODE_LABEL } from '../components/fees/feeUi';
import { useMoney } from '../lib/useMoney';
import { parentPortalUrl, whatsappLinkFor } from '../lib/parentLinks';

const TERM_SEQS  = [[1, 2], [3, 4], [5, 6]];

function calcAge(dob) {
  if (!dob) return null;
  const b = new Date(dob), now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) age--;
  return age >= 0 ? age : null;
}
function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString(localeForLang(), { day: 'numeric', month: 'long', year: 'numeric' });
}

const EMPTY_EDIT = {
  name: '', matricule: '', gender: '', date_naissance: '', lieu_naissance: '',
  adresse: '', parent_phone: '', contact_urgence: '',
  nom_pere: '', profession_pere: '', nom_mere: '', profession_mere: '', tuteur: '',
};

function EditForm({ student, classes, onSave, onClose }) {
  const t = useT();
  const GENDERS = [
    { value: 'Masculin', label: t('Masculin', 'Male') },
    { value: 'Feminin',  label: t('Féminin',  'Female') },
  ];
  const [form, setForm] = useState({ ...EMPTY_EDIT, ...student });
  const [saving, setSaving] = useState(false);
  const set = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));

  // Photo : `photoFile` = blob JPEG prêt à uploader ; `photoPreview` = aperçu.
  const fileInputRef = useRef(null);
  const [photoFile, setPhotoFile]       = useState(null);
  const [photoPreview, setPhotoPreview] = useState(student?.photo_url || null);
  const [photoErr, setPhotoErr]         = useState('');
  const [photoBusy, setPhotoBusy]       = useState(false);

  const onPickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setPhotoErr(t('Choisissez une image.', 'Please choose an image.')); return; }
    setPhotoErr(''); setPhotoBusy(true);
    try {
      const blob = await resizeImageToSquare(file);
      setPhotoFile(blob);
      setPhotoPreview(URL.createObjectURL(blob));
    } catch {
      setPhotoErr(t('Image illisible.', 'Unreadable image.'));
    } finally {
      setPhotoBusy(false);
    }
  };
  const clearPhoto = () => { setPhotoFile(null); setPhotoPreview(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const photo = photoFile ? { file: photoFile }
                : (!photoPreview && student?.photo_url) ? { remove: true }
                : null;
    await onSave(form, photo);
    setSaving(false);
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Photo de l'élève */}
      <div className="flex items-center gap-4">
        <StudentAvatar student={{ photo_url: photoPreview }} size={72} />
        <div>
          <p className="form-label">{t('Photo', 'Photo')}</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={photoBusy}
              className="btn-secondary" style={{ width: 'auto' }}>
              {photoBusy ? t('Traitement…', 'Processing…') : photoPreview ? t('Changer', 'Change') : t('Choisir une photo', 'Choose a photo')}
            </button>
            {photoPreview && (
              <button type="button" onClick={clearPhoto} className="text-sm text-red-500 hover:text-red-600 px-2">
                {t('Retirer', 'Remove')}
              </button>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickPhoto} />
          {photoErr
            ? <p className="text-xs text-red-500 mt-1">{photoErr}</p>
            : <p className="text-xs text-gray-400 mt-1">{t('JPG/PNG — recadrée et compressée automatiquement.', 'JPG/PNG — auto-cropped and compressed.')}</p>}
        </div>
      </div>

      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{t('Identité', 'Identity')}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="form-label">{t('Nom complet *', 'Full name *')}</label>
          <input type="text" required className="form-input" value={form.name} onChange={set('name')} />
        </div>
        <div>
          <label className="form-label">{t('Classe', 'Class')}</label>
          <select className="form-input" value={form.class_id || ''} onChange={set('class_id')}>
            <option value="">{t('— Non assigné —', '— Unassigned —')}</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">{t('Matricule', 'Student ID')}</label>
          <input type="text" className="form-input" value={form.matricule || ''} onChange={set('matricule')} />
        </div>
        <div>
          <label className="form-label">{t('Sexe', 'Gender')}</label>
          <select className="form-input" value={form.gender || ''} onChange={set('gender')}>
            <option value="">—</option>
            {GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">{t('Date de naissance', 'Date of birth')}</label>
          <input type="date" className="form-input" value={form.date_naissance || ''} onChange={set('date_naissance')} />
        </div>
        <div>
          <label className="form-label">{t('Lieu de naissance', 'Place of birth')}</label>
          <input type="text" className="form-input" value={form.lieu_naissance || ''} onChange={set('lieu_naissance')} />
        </div>
      </div>

      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest pt-1">{t('Contact & famille', 'Contact & family')}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="form-label">{t('Téléphone parent', 'Parent phone')}</label>
          <input type="tel" className="form-input" value={form.parent_phone || ''} onChange={set('parent_phone')} />
        </div>
        <div>
          <label className="form-label">{t("Contact d'urgence", 'Emergency contact')}</label>
          <input type="tel" className="form-input" value={form.contact_urgence || ''} onChange={set('contact_urgence')} />
        </div>
        <div className="col-span-2">
          <label className="form-label">{t('Adresse', 'Address')}</label>
          <input type="text" className="form-input" value={form.adresse || ''} onChange={set('adresse')} />
        </div>
        <div>
          <label className="form-label">{t('Nom du père', "Father's name")}</label>
          <input type="text" className="form-input" value={form.nom_pere || ''} onChange={set('nom_pere')} />
        </div>
        <div>
          <label className="form-label">{t('Profession père', "Father's occupation")}</label>
          <input type="text" className="form-input" value={form.profession_pere || ''} onChange={set('profession_pere')} />
        </div>
        <div>
          <label className="form-label">{t('Nom de la mère', "Mother's name")}</label>
          <input type="text" className="form-input" value={form.nom_mere || ''} onChange={set('nom_mere')} />
        </div>
        <div>
          <label className="form-label">{t('Profession mère', "Mother's occupation")}</label>
          <input type="text" className="form-input" value={form.profession_mere || ''} onChange={set('profession_mere')} />
        </div>
        <div className="col-span-2">
          <label className="form-label">{t('Tuteur légal', 'Legal guardian')}</label>
          <input type="text" className="form-input" placeholder={t('Si différent des parents', 'If different from parents')}
            value={form.tuteur || ''} onChange={set('tuteur')} />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={saving} className="btn-primary"
          style={{ width: 'auto', paddingLeft: '2rem', paddingRight: '2rem' }}>
          {saving ? t('Enregistrement…', 'Saving…') : t('Enregistrer', 'Save')}
        </button>
        <button type="button" onClick={onClose} className="btn-secondary">{t('Annuler', 'Cancel')}</button>
      </div>
    </form>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5 py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 font-medium">{label}</span>
      <span className="text-sm text-gray-800">{value}</span>
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">{title}</h3>
      {children}
    </div>
  );
}

function GradeBadge({ val, max, sys }) {
  if (val === null || val === undefined) return <span className="text-gray-300 text-sm">—</span>;
  const pass = sys === 'FR' ? 10 : 50;
  return (
    <span className={`font-bold text-sm ${val >= pass ? 'text-emerald-600' : 'text-red-500'}`}>
      {val.toFixed(2)}<span className="text-xs font-normal text-gray-400">/{max}</span>
    </span>
  );
}

export default function StudentProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const t = useT();
  const money = useMoney();
  const { f } = usePlan();

  const SEQ_LABELS = [
    t('Séq 1', 'Seq 1'), t('Séq 2', 'Seq 2'), t('Séq 3', 'Seq 3'),
    t('Séq 4', 'Seq 4'), t('Séq 5', 'Seq 5'), t('Séq 6', 'Seq 6'),
  ];

  // Libellés bilingues des types de transfert et motifs de clôture.
  const TYPE_LABELS = {
    [TRANSFER_TYPES.INITIAL]: t('Affectation initiale', 'Initial assignment'),
    [TRANSFER_TYPES.ADMIN]:   t('Changement administratif', 'Administrative change'),
    [TRANSFER_TYPES.NIVEAU]:  t('Changement de niveau', 'Level change'),
    [TRANSFER_TYPES.ETAB]:    t("Changement d'établissement", 'School change'),
    reconstruit:              t('Historique reconstruit', 'Reconstructed history'),
  };
  const MOTIF_OPTIONS = [
    { value: CLOTURE_MOTIFS.administratif,            label: t('Administratif', 'Administrative') },
    { value: CLOTURE_MOTIFS.niveau,                   label: t('Changement de niveau', 'Level change') },
    { value: CLOTURE_MOTIFS.etablissement,            label: t("Changement d'établissement", 'School change') },
    { value: CLOTURE_MOTIFS.redoublement,             label: t('Redoublement', 'Repeat year') },
    { value: CLOTURE_MOTIFS.promotion_exceptionnelle, label: t('Promotion exceptionnelle', 'Exceptional promotion') },
    { value: CLOTURE_MOTIFS.autre,                    label: t('Autre', 'Other') },
  ];

  const students      = useSchoolStore((s) => s.students);
  const classes       = useSchoolStore((s) => s.classes);
  const subjects      = useSchoolStore((s) => s.subjects);
  const gradeMap      = useSchoolStore((s) => s.gradeMap);
  const fees          = useSchoolStore((s) => s.fees);
  const getClassFeeGrid = useSchoolStore((s) => s.getClassFeeGrid);
  const updateStudent = useSchoolStore((s) => s.updateStudent);
  const deleteStudent = useSchoolStore((s) => s.deleteStudent);
  const role          = useAuthStore((s) => s.role);
  const school        = useAuthStore((s) => s.school);
  // Écriture élèves réservée à la direction (admin + censeur), aligné sur la RLS.
  const canEdit       = role === 'admin' || role === 'censeur';

  // Setters de navigation persistante (uiStore) — pour cibler l'élève / sa classe
  const setGradesClassId        = useUiStore((s) => s.setGradesClassId);
  const setBulletinsClassId     = useUiStore((s) => s.setBulletinsClassId);
  const setBulletinsStudentId   = useUiStore((s) => s.setBulletinsStudentId);
  const setAbsencesClassId      = useUiStore((s) => s.setAbsencesClassId);
  const setAbsencesStatsClassId = useUiStore((s) => s.setAbsencesStatsClassId);

  const [showEdit,        setShowEdit]        = useState(false);
  const [showChangeClass, setShowChangeClass] = useState(false);
  const [newClassId,      setNewClassId]      = useState('');
  const [transferMotif,   setTransferMotif]   = useState('');
  const [transferComment, setTransferComment] = useState('');
  const [confirmDel,      setConfirmDel]      = useState(false);
  const [changingSaving,  setChangingSaving]  = useState(false);
  const [linkCopied,      setLinkCopied]      = useState(false);

  // Historique d'affectations : lu depuis le store (réactif, hors-ligne), du
  // plus récent au plus ancien pour l'affichage en timeline.
  const assignments = useSchoolStore((s) => s.assignments);
  const assignHistory = useMemo(
    () => assignments
      .filter((a) => a.student_id === id)
      .sort((a, b) => new Date(b.date_debut || b.assigned_at || 0) - new Date(a.date_debut || a.assigned_at || 0)),
    [assignments, id]
  );

  const student = students.find((s) => s.id === id);
  const cls     = student ? classes.find((c) => c.id === student.class_id) : null;
  const subs    = cls ? subjects.filter((s) => s.class_id === cls.id).sort((a, b) => b.coef - a.coef) : [];
  const sys     = cls?.system || 'FR';
  const maxScale = sys === 'FR' ? 20 : 100;
  const pass     = sys === 'FR' ? 10 : 50;

  const fee = useMemo(() => fees.find((f) => f.student_id === id), [fees, id]);
  // Situation des frais via le moteur tarifaire (grille de classe + mode + échéances).
  const feeSituation = useMemo(
    () => studentFeeSituation(fee, student ? getClassFeeGrid(student.class_id) : null,
      { applyInscription: inscriptionApplies(student) }),
    [fee, student, getClassFeeGrid]
  );

  const matrix = useMemo(() => {
    if (!student || !cls) return [];
    // Matières composites : on affiche les matières principales (note calculée
    // depuis les enfants par séquence) ; les enfants ne sont pas listés ici.
    const hasComp = subs.some((s) => s.parent_id);
    const display = hasComp ? subs.filter((s) => !s.parent_id) : subs;
    return display.map((sub) => {
      const seqGrades = [1, 2, 3, 4, 5, 6].map((seq) => {
        const raw = gradeMap[`${cls.id}_${student.id}_${seq}`] || {};
        const v = hasComp ? resolveScores(raw, subs).g[sub.id] : raw[sub.id];
        return !v || v === 'ABS' || v === '' ? null : parseFloat(v);
      });
      const terms = TERM_SEQS.map((pair) => {
        const vals = pair.map((s) => seqGrades[s - 1]).filter((x) => x !== null);
        return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
      });
      const annualVals = seqGrades.filter((x) => x !== null);
      const annual = annualVals.length
        ? Math.round((annualVals.reduce((a, b) => a + b, 0) / annualVals.length) * 100) / 100 : null;
      return { sub, seqGrades, terms, annual };
    });
  }, [subs, gradeMap, cls, student]);

  const seqAvgs = useMemo(() => {
    return [1, 2, 3, 4, 5, 6].map((seq) => {
      const scores = {};
      subs.forEach((sub) => {
        const v = (gradeMap[`${cls?.id}_${student?.id}_${seq}`] || {})[sub.id];
        if (v && v !== 'ABS' && v !== '') scores[sub.id] = v;
      });
      return getAvg(scores, subs, sys);
    });
  }, [subs, gradeMap, cls, student, sys]);

  const lastAvg = [...seqAvgs].reverse().find((v) => v !== null) ?? null;
  const appr    = sys === 'FR' && lastAvg !== null ? frApp(lastAvg) : null;
  const enG     = sys === 'EN' && lastAvg !== null ? enGrade(lastAvg) : null;
  const mention = appr?.text || (enG ? `${enG.g} — ${enG.txt}` : null);

  if (!student) {
    return (
      <Layout>
        <div className="max-w-3xl">
          <p className="text-gray-500 mb-4">{t('Élève introuvable.', 'Student not found.')}</p>
          <button onClick={() => navigate('/app/students')} className="btn-secondary" style={{ width: 'auto' }}>
            {t('← Retour aux élèves', '← Back to students')}
          </button>
        </div>
      </Layout>
    );
  }

  const age = calcAge(student.date_naissance);

  const handleSaveEdit = async (form, photo) => {
    await updateStudent(student.id, form);
    if (photo?.file) {
      const { url } = await uploadStudentPhoto(student.school_id, student.id, photo.file);
      if (url) await updateStudent(student.id, { photo_url: url });
    } else if (photo?.remove) {
      await updateStudent(student.id, { photo_url: null });
      await deleteStudentPhoto(student.school_id, student.id);
    }
  };

  const handleChangeClass = async () => {
    if (!newClassId || newClassId === student.class_id) return;
    setChangingSaving(true);
    const target = classes.find((c) => c.id === newClassId);
    const type = (target && cls) ? resolveTransferType(cls, target) : undefined;
    await useSchoolStore.getState().assignStudentToClass(student.id, newClassId, {
      type,
      motif:       transferMotif || undefined,
      commentaire: transferComment.trim() || undefined,
    });
    // L'historique se met à jour tout seul (sélecteur sur le store).
    setChangingSaving(false);
    setShowChangeClass(false);
    setNewClassId('');
    setTransferMotif('');
    setTransferComment('');
  };

  const handleDelete = async () => {
    // `deleteStudent` bascule en ARCHIVAGE dès que l'élève porte une écriture de
    // caisse : ses versements sont des pièces comptables, ils ne peuvent pas
    // partir avec lui. On le dit, sinon l'utilisateur croit avoir supprimé.
    const res = await deleteStudent(student.id);
    if (res?.action === 'archive') {
      toast.success(t(
        `${student.name} a été archivé (et non supprimé) : ${res.trail.entries} écriture(s) de caisse lui sont rattachées. Ses données sont conservées.`,
        `${student.name} was archived (not deleted): ${res.trail.entries} cash entries are attached. All data is kept.`,
        `${student.name} fue archivado (no eliminado): tiene ${res.trail.entries} asiento(s) de caja.`,
      ));
    }
    navigate('/app/students');
  };

  const handleCopyParentLink = () => {
    if (!student.parent_token) return;
    const url = `${window.location.origin}/parent/${student.parent_token}`;
    copyText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    });
  };

  const genderLabel = student.gender === 'Masculin' ? t('Masculin', 'Male')
    : student.gender === 'Feminin' ? t('Féminin', 'Female') : student.gender;

  // Toutes les actions ciblent l'élève courant (ou sa classe) avant de naviguer.
  const goGrades = () => { setGradesClassId(student.class_id); navigate('/app/grades'); };
  const actions = [
    { icon: '💳', label: t('Enregistrer un paiement', 'Record a payment'),
      onClick: () => navigate(`/app/fees?student=${student.id}`) },
    { icon: '📋', label: t('Historique des paiements', 'Payment history'),
      onClick: () => navigate(`/app/fees?student=${student.id}`) },
    { icon: '📄', label: t("Rapport de l'élève", 'Student report'),
      onClick: cls ? () => navigate(`/app/reports?class=${cls.id}`) : undefined, disabled: !cls },
    { icon: '📊', label: t('Voir les notes', 'View grades'),
      onClick: cls ? goGrades : undefined, disabled: !cls },
    { icon: '✏️',  label: t('Saisir une note', 'Enter a grade'),
      onClick: cls ? goGrades : undefined, disabled: !cls },
    { icon: '📑', label: t('Générer le bulletin', 'Generate report card'),
      onClick: cls ? () => { setBulletinsClassId(cls.id); setBulletinsStudentId(student.id); navigate('/app/bulletins'); } : undefined, disabled: !cls },
    { icon: '📅', label: t('Voir les absences', 'View absences'),
      onClick: cls ? () => { setAbsencesClassId(cls.id); setAbsencesStatsClassId(cls.id); navigate('/app/absences'); } : undefined, disabled: !cls },
    ...(canEdit ? [{ icon: '🏫', label: t('Transférer l’élève', 'Transfer student'), onClick: () => { setNewClassId(student.class_id || ''); setTransferMotif(''); setTransferComment(''); setShowChangeClass(true); } }] : []),
  ];

  const dateLocale = localeForLang();

  return (
    <Layout>
      <div className="max-w-5xl">

        <button onClick={() => navigate('/app/students')}
          className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1 transition-colors">
          {t('← Retour aux élèves', '← Back to students')}
        </button>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <StudentAvatar student={student} size={64} square />
              <div>
                <h1 className="text-xl font-bold text-gray-900">{student.name}</h1>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  {student.matricule && (
                    <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                      {student.matricule}
                    </span>
                  )}
                  {student.gender && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      student.gender === 'Masculin' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {student.gender === 'Masculin' ? '♂' : '♀'} {genderLabel}
                    </span>
                  )}
                  {cls && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">
                      {cls.name}
                    </span>
                  )}
                  {!cls && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                      {t('Non assigné', 'Unassigned')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              {canEdit && (
                <button onClick={() => setShowEdit(true)}
                  className="btn-secondary flex items-center gap-1.5 text-sm">
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                  {t('Modifier', 'Edit')}
                </button>
              )}
              {f.hasParentPortal ? (
                student.parent_token && (
                  <>
                    <button onClick={handleCopyParentLink}
                      className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg font-medium border transition-colors ${
                        linkCopied
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}>
                      {linkCopied ? (
                        <>
                          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                          {t('Lien copié !', 'Link copied!')}
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"/></svg>
                          {t('Lien parent', 'Parent link')}
                        </>
                      )}
                    </button>
                    {/* Envoi direct par WhatsApp — lien wa.me prérempli, gratuit, aucun
                        fournisseur (cf. WhatsappFirstModal pour les campagnes groupées).
                        Masqué si aucun numéro de parent connu : le lien wa.me ne peut
                        rien préremplir sans destinataire. */}
                    {student.parent_phone && (
                      <a
                        href={whatsappLinkFor(
                          student.parent_phone,
                          `${school?.name || 'École'} — Portail parent de ${student.name}\n${parentPortalUrl(student)}`,
                        )}
                        target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg font-medium border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.472-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path fillRule="evenodd" clipRule="evenodd" d="M12.001 2C6.478 2 2 6.477 2 12c0 1.821.487 3.53 1.338 5.003L2 22l5.133-1.318A9.955 9.955 0 0012.001 22C17.523 22 22 17.523 22 12S17.523 2 12.001 2zm0 18.2a8.174 8.174 0 01-4.353-1.253l-.312-.19-3.234.83.86-3.15-.203-.324A8.173 8.173 0 013.8 12c0-4.522 3.678-8.2 8.2-8.2 4.522 0 8.2 3.678 8.2 8.2 0 4.523-3.678 8.2-8.2 8.2z"/></svg>
                        WhatsApp
                      </a>
                    )}
                  </>
                )
              ) : (
                <a
                  href="https://wa.me/237670894721?text=Je%20veux%20passer%20au%20plan%20Pro%20pour%20le%20portail%20parents"
                  target="_blank" rel="noopener noreferrer"
                  title={t('Portail parents — Plan Pro requis', 'Parent portal — Pro plan required')}
                  className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg font-medium border border-gray-200 text-gray-400 bg-gray-50 cursor-pointer hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
                  </svg>
                  {t('Lien parent', 'Parent link')} — Pro
                </a>
              )}
              {canEdit && (!confirmDel ? (
                <button onClick={() => setConfirmDel(true)}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-red-500 border border-red-200 hover:bg-red-50 transition-colors flex items-center gap-1.5">
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                  {t('Supprimer', 'Delete')}
                </button>
              ) : (
                <div className="flex gap-2 items-center bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <span className="text-xs text-red-700 font-medium">{t('Confirmer ?', 'Confirm?')}</span>
                  <button onClick={handleDelete} className="text-xs text-red-600 font-bold hover:underline">{t('Oui', 'Yes')}</button>
                  <button onClick={() => setConfirmDel(false)} className="text-xs text-gray-500 hover:underline">{t('Non', 'No')}</button>
                </div>
              ))}
            </div>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5 pt-5 border-t border-gray-100">
            {[
              { label: t('Âge', 'Age'), value: age !== null ? `${age} ${t('ans', 'yr')}` : '—' },
              { label: t('Classe', 'Class'), value: cls?.name || '—' },
              {
                label: t('Moyenne', 'Average'),
                value: lastAvg !== null
                  ? <span className={lastAvg >= pass ? 'text-emerald-600' : 'text-red-500'}>{lastAvg.toFixed(2)}/{maxScale}</span>
                  : 'N/A',
              },
              {
                label: t('Mention', 'Grade'),
                value: mention
                  ? <span style={{ color: appr?.col || enG?.col }}>{mention}</span>
                  : 'N/A',
              },
              {
                label: t('Frais de Scolarité', 'Tuition fees'),
                value: (() => {
                  const su = STATUS_UI[feeSituation.status] || STATUS_UI[FEE_STATUS.NONE];
                  if (feeSituation.status === FEE_STATUS.NONE) {
                    return <span className="text-gray-400">{t('Non configuré', 'Not set')}</span>;
                  }
                  const colorByStatus = {
                    [FEE_STATUS.PAID]:       'text-emerald-600',
                    [FEE_STATUS.UP_TO_DATE]: 'text-emerald-600',
                    [FEE_STATUS.DUE_SOON]:   'text-amber-600',
                    [FEE_STATUS.LATE]:       'text-red-500',
                  };
                  return (
                    <span className={`font-semibold ${colorByStatus[feeSituation.status] || 'text-gray-700'}`}>
                      {su.icon} {t(...su.label)}
                      {feeSituation.balance > 0 && <span className="font-normal text-gray-500"> — {t('reste', 'balance')} {money(feeSituation.balance)}</span>}
                      {feeSituation.status === FEE_STATUS.LATE && feeSituation.daysLate > 0 && (
                        <span className="font-normal text-red-400"> · {feeSituation.daysLate} {t('j', 'd')}</span>
                      )}
                    </span>
                  );
                })(),
              },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-gray-400 mb-1">{label}</p>
                <p className="text-sm font-semibold text-gray-900">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5 mb-6">

          <div className="space-y-4">

            <SectionCard title={t('Informations personnelles', 'Personal information')}>
              <InfoRow label={t('Nom complet', 'Full name')}         value={student.name} />
              <InfoRow label={t('Sexe', 'Gender')}                   value={genderLabel} />
              <InfoRow label={t('Date de naissance', 'Date of birth')} value={fmtDate(student.date_naissance)} />
              <InfoRow label={t('Lieu de naissance', 'Place of birth')} value={student.lieu_naissance} />
              <InfoRow label={t("Date d'inscription", 'Enrollment date')} value={fmtDate(student.created_at)} />
              {/* Auteur de l'inscription, figé au moment du geste. Absent sur les
                  élèves inscrits avant la traçabilité (ou importés en masse). */}
              <InfoRow label={t('Inscrit par', 'Enrolled by', 'Inscrito por')} value={student.created_by_name} />
              {!student.date_naissance && !student.lieu_naissance && (
                <p className="text-xs text-gray-400 py-2">{t('Aucune information personnelle renseignée.', 'No personal information provided.')}</p>
              )}
            </SectionCard>

            <SectionCard title={t('Informations familiales', 'Family information')}>
              {student.nom_pere && (
                <div className="py-2 border-b border-gray-50">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-gray-400">{t('Père', 'Father')}</p>
                      <p className="text-sm font-medium text-gray-800">{student.nom_pere}</p>
                    </div>
                    {student.profession_pere && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{student.profession_pere}</span>
                    )}
                  </div>
                </div>
              )}
              {student.nom_mere && (
                <div className="py-2 border-b border-gray-50">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-gray-400">{t('Mère', 'Mother')}</p>
                      <p className="text-sm font-medium text-gray-800">{student.nom_mere}</p>
                    </div>
                    {student.profession_mere && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{student.profession_mere}</span>
                    )}
                  </div>
                </div>
              )}
              <InfoRow label={t('Tuteur légal', 'Legal guardian')} value={student.tuteur} />
              {!student.nom_pere && !student.nom_mere && !student.tuteur && (
                <p className="text-xs text-gray-400 py-2">{t('Aucune information familiale renseignée.', 'No family information provided.')}</p>
              )}
            </SectionCard>

            <SectionCard title={t('Informations de contact', 'Contact information')}>
              <InfoRow label={t('Adresse', 'Address')}               value={student.adresse} />
              <InfoRow label={t('Téléphone', 'Phone')}               value={student.parent_phone} />
              <InfoRow label={t("Contact d'urgence", 'Emergency contact')} value={student.contact_urgence} />
              {!student.adresse && !student.parent_phone && !student.contact_urgence && (
                <p className="text-xs text-gray-400 py-2">{t('Aucune information de contact renseignée.', 'No contact information provided.')}</p>
              )}
            </SectionCard>

            <SectionCard title={t('Parcours scolaire', 'Academic record')}>
              {cls ? (
                <div className="flex items-center justify-between py-2 border-b border-gray-50">
                  <div>
                    <p className="text-xs text-gray-400">{t('Classe actuelle', 'Current class')}</p>
                    <p className="text-sm font-semibold text-gray-900">{cls.name}</p>
                    {cls.current_year && (
                      <p className="text-xs text-gray-400">{cls.current_year}</p>
                    )}
                  </div>
                  <div className="text-right">
                    {cls.cycle && (
                      <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium capitalize">{cls.cycle}</span>
                    )}
                    {subs.length > 0 && (
                      <p className="text-xs text-gray-400 mt-1">
                        {subs.length} {t(subs.length > 1 ? 'matières' : 'matière', subs.length > 1 ? 'subjects' : 'subject')}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400 py-2 border-b border-gray-50">{t('Aucune classe assignée.', 'No class assigned.')}</p>
              )}

              {assignHistory.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">{t('Historique des affectations', 'Assignment history')}</p>
                  <div className="relative pl-4">
                    <div className="absolute left-1.5 top-0 bottom-0 w-px bg-gray-100" />
                    {assignHistory.map((entry, i) => {
                      const current = !entry.date_fin;
                      const start = entry.date_debut || entry.assigned_at;
                      const fmt = (d) => d ? new Date(d).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' }) : null;
                      return (
                        <div key={entry.id} className="relative flex gap-3 mb-3 last:mb-0">
                          <div className={`absolute -left-3 w-3 h-3 rounded-full border-2 mt-0.5 shrink-0 ${
                            current ? 'bg-brand-500 border-brand-500' : 'bg-white border-gray-300'
                          }`} />
                          <div className="pl-3">
                            <p className="text-sm font-semibold text-gray-800">
                              {entry.class_name || '—'}
                              {current && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-brand-600 bg-brand-50 rounded px-1.5 py-0.5">{t('En cours', 'Current')}</span>}
                            </p>
                            <p className="text-xs text-gray-400">
                              {fmt(start)}{entry.date_fin ? ` → ${fmt(entry.date_fin)}` : ''}
                              {entry.assigned_by_name ? ` · ${t('par', 'by')} ${entry.assigned_by_name}` : ''}
                            </p>
                            {entry.type_transfert && TYPE_LABELS[entry.type_transfert] && (
                              <p className="text-xs text-gray-500 mt-0.5">{TYPE_LABELS[entry.type_transfert]}</p>
                            )}
                            {(entry.commentaire || entry.reason) && (
                              <p className="text-xs text-gray-500 mt-0.5 italic">{entry.commentaire || entry.reason}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </SectionCard>

          </div>

          <div>
            <SectionCard title={t('Actions rapides', 'Quick actions')}>
              <div className="space-y-1">
                {actions.map(({ icon, label, href, onClick, disabled }) => {
                  const base = `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
                    disabled
                      ? 'text-gray-300 cursor-not-allowed'
                      : 'text-gray-700 hover:bg-brand-50 hover:text-brand-700'
                  }`;
                  if (onClick) return (
                    <button key={label} type="button" onClick={onClick} disabled={disabled} className={base}>
                      <span className="text-base w-5 text-center">{icon}</span>
                      <span>{label}</span>
                    </button>
                  );
                  if (href && !disabled) return (
                    <Link key={label} to={href} className={base}>
                      <span className="text-base w-5 text-center">{icon}</span>
                      <span>{label}</span>
                    </Link>
                  );
                  return (
                    <div key={label} className={base}>
                      <span className="text-base w-5 text-center">{icon}</span>
                      <span>{label}{disabled ? ` — ${t('Aucune classe', 'No class')}` : ''}</span>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          </div>
        </div>

        {seqAvgs.some((v) => v !== null) && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-5">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">
              {t('Progression — moyennes générales', 'Progression — overall averages')}
            </h2>
            <div className="grid grid-cols-6 gap-3">
              {seqAvgs.map((avg, i) => {
                const a = sys === 'FR' && avg !== null ? frApp(avg) : null;
                const e = sys === 'EN' && avg !== null ? enGrade(avg) : null;
                return (
                  <div key={i} className={`rounded-xl p-3 text-center border ${
                    avg === null ? 'bg-gray-50 border-gray-100'
                      : avg >= pass ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-red-50 border-red-200'
                  }`}>
                    <div className="text-xs text-gray-400 font-medium mb-1">{SEQ_LABELS[i]}</div>
                    {avg !== null ? (
                      <>
                        <div className={`text-xl font-extrabold ${avg >= pass ? 'text-emerald-700' : 'text-red-600'}`}>
                          {avg.toFixed(2)}
                        </div>
                        {a && <div className="text-xs mt-0.5" style={{ color: a.col }}>{a.text}</div>}
                        {e && <div className="text-xs mt-0.5 font-bold" style={{ color: e.col }}>{e.g}</div>}
                      </>
                    ) : (
                      <div className="text-gray-300 text-lg font-bold">—</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {subs.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-5">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/80">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{t('Notes par matière', 'Grades by subject')}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-semibold">
                    <th className="text-left px-5 py-3">{t('Matière', 'Subject')}</th>
                    <th className="px-3 py-3 text-center">{t('Coef', 'Coeff')}</th>
                    {SEQ_LABELS.map((l) => <th key={l} className="px-3 py-3 text-center">{l}</th>)}
                    <th className="px-3 py-3 text-center bg-blue-50">T1</th>
                    <th className="px-3 py-3 text-center bg-blue-50">T2</th>
                    <th className="px-3 py-3 text-center bg-blue-50">T3</th>
                    <th className="px-4 py-3 text-center bg-gray-100 font-bold text-gray-700">{t('Annuel', 'Annual')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {matrix.map(({ sub, seqGrades, terms, annual }) => (
                    <tr key={sub.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-semibold text-gray-900">
                        {sub.name}<span className="text-xs text-gray-400 font-normal ml-1">/{sub.max}</span>
                      </td>
                      <td className="px-3 py-3 text-center text-gray-500 text-xs">{sub.coef}</td>
                      {seqGrades.map((g, i) => (
                        <td key={i} className="px-3 py-3 text-center">
                          {g !== null
                            ? <span className={`font-semibold text-sm ${g >= (pass / maxScale) * sub.max ? 'text-emerald-600' : 'text-red-500'}`}>{g}</span>
                            : <span className="text-gray-200">—</span>}
                        </td>
                      ))}
                      {terms.map((term, i) => (
                        <td key={i} className="px-3 py-3 text-center bg-blue-50/40">
                          <GradeBadge val={term} max={sub.max} sys={sys} />
                        </td>
                      ))}
                      <td className="px-4 py-3 text-center bg-gray-50">
                        <GradeBadge val={annual} max={sub.max} sys={sys} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {subs.length === 0 && cls && (
          <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-gray-100">
            <p className="text-gray-400 text-sm">{t('Aucune matière configurée pour cette classe.', 'No subjects configured for this class.')}</p>
          </div>
        )}

      </div>

      {showEdit && (
        <Modal title={t("Modifier l'élève", 'Edit student')} onClose={() => setShowEdit(false)} size="lg">
          <EditForm student={student} classes={classes} onSave={handleSaveEdit} onClose={() => setShowEdit(false)} />
        </Modal>
      )}

      {showChangeClass && (() => {
        const target    = classes.find((c) => c.id === newClassId) || null;
        const isSame     = newClassId && newClassId === student.class_id;
        const detected   = (target && cls && !isSame) ? resolveTransferType(cls, target) : null;
        return (
        <Modal title={t('Transférer l’élève', 'Transfer student')} onClose={() => setShowChangeClass(false)} size="sm">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              {t('Nouvelle affectation pour', 'New assignment for')} <strong>{student.name}</strong>.
              <span className="block text-xs text-gray-400 mt-1">
                {t("L'affectation actuelle sera clôturée et une nouvelle ouverte — l'historique est conservé.",
                   'The current assignment is closed and a new one opened — history is kept.')}
              </span>
            </p>
            <div>
              <label className="form-label">{t('Nouvelle classe', 'New class')}</label>
              <select className="form-input" value={newClassId} onChange={(e) => setNewClassId(e.target.value)}>
                <option value="">{t('— Choisir —', '— Choose —')}</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} {c.current_year ? `(${c.current_year})` : ''}</option>
                ))}
              </select>
              {isSame && (
                <p className="text-xs text-amber-600 mt-1">{t('Classe identique à l’actuelle — aucun transfert.', 'Same as current class — no transfer.')}</p>
              )}
              {detected && (
                <p className="text-xs text-brand-600 mt-1">{t('Type détecté', 'Detected type')} : <strong>{TYPE_LABELS[detected]}</strong></p>
              )}
            </div>
            <div>
              <label className="form-label">{t('Motif', 'Reason')}</label>
              <select className="form-input" value={transferMotif} onChange={(e) => setTransferMotif(e.target.value)}>
                <option value="">{t('— Automatique selon le type —', '— Automatic from type —')}</option>
                {MOTIF_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">{t('Commentaire', 'Comment')}</label>
              <textarea className="form-input" rows={2} value={transferComment} onChange={(e) => setTransferComment(e.target.value)}
                placeholder={t('Optionnel', 'Optional')} />
            </div>
            <p className="text-xs text-gray-400">
              {t('Les paiements déjà effectués sont conservés ; le plan de frais est recalculé selon la nouvelle classe.',
                 'Payments already made are kept; the fee plan is recalculated for the new class.')}
            </p>
            <div className="flex gap-3">
              <button onClick={handleChangeClass} disabled={!newClassId || isSame || changingSaving}
                className="btn-primary" style={{ width: 'auto', paddingLeft: '2rem', paddingRight: '2rem' }}>
                {changingSaving ? t('Transfert…', 'Transferring…') : t('Confirmer le transfert', 'Confirm transfer')}
              </button>
              <button onClick={() => setShowChangeClass(false)} className="btn-secondary">{t('Annuler', 'Cancel')}</button>
            </div>
          </div>
        </Modal>
        );
      })()}
    </Layout>
  );
}
