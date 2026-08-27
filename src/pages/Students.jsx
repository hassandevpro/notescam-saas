import { useState, useRef, useMemo, lazy, Suspense } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { hasCapability } from '../config/capabilities';
import { downloadCSV, downloadExcel, parseSpreadsheet, downloadStudentTemplate } from '../lib/exportCsv';
import { officialHeaderHtml, officialSignatureHtml } from '../lib/officialDocHeader';
import { uploadStudentPhoto, deleteStudentPhoto } from '../lib/schoolService';
import { resizeImageToSquare } from '../lib/image';
import { duplicateWarning } from '../lib/studentIdentity';
import { checkDuplicate, DUP } from '../lib/studentDuplicate';
import { cashDeletionWarning } from '../lib/studentRetention';
import { useMoney } from '../lib/useMoney';
import Layout from '../components/Layout';
import StudentAvatar from '../components/StudentAvatar';
import Modal from '../components/Modal';
import CameraCaptureModal from '../components/CameraCaptureModal';
import QrScanModal from '../components/QrScanModal';
import { buildCardId } from '../lib/idCardService';
const IdCardModal = lazy(() => import('../components/IdCardModal'));
import { useT, getLang } from '../lib/i18n';
import { toast } from '../store/toastStore';
import { usePlan } from '../lib/plan';
import { resolveCountryCode } from '../countries';
import { classSectionKey, SECTIONS } from '../core/engineResolver';
import { useUiStore } from '../store/uiStore';

// Locale d'affichage des dates selon la langue UI courante.
const dateLocale = () => (getLang() === 'es' ? 'es-ES' : getLang() === 'en' ? 'en-GB' : 'fr-FR');

// ── Helpers ───────────────────────────────────────────────────────────────────
const PAGE_SIZE  = 20;

function calcAge(dob) {
  if (!dob) return null;
  const b = new Date(dob), now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) age--;
  return age >= 0 ? age : null;
}

// ── Formulaire élève (tous champs) ───────────────────────────────────────────
// Les libellés sont des chaînes FR canoniques qui passent par t() à l'affichage,
// donc auto-traduites EN/ES via i18n_es.js.
// Deux dimensions INDÉPENDANTES du statut de l'élève :
//  • statut_etablissement (nouveau/ancien dans l'école) → pilote les frais
//    d'inscription (cf. inscriptionApplies) ;
//  • statut (dans la classe : nouveau/redoublant/transféré) → purement informatif.
// Un élève peut donc être « nouveau dans l'établissement » ET « redoublant ».
const STATUTS = [
  { value: '',           label: '—',          color: '' },
  { value: 'nouveau',    label: 'Nouveau',     color: 'bg-emerald-100 text-emerald-700' },
  { value: 'redoublant', label: 'Redoublant',  color: 'bg-amber-100 text-amber-700' },
  { value: 'transfere',  label: 'Transféré',   color: 'bg-blue-100 text-blue-700' },
];

const STATUTS_ETAB = [
  { value: '',        label: '—',                            color: '' },
  { value: 'nouveau', label: "Nouveau dans l'établissement", color: 'bg-emerald-100 text-emerald-700' },
  { value: 'ancien',  label: "Ancien dans l'établissement",  color: 'bg-slate-100 text-slate-600' },
];

const EMPTY_FORM = {
  name: '', matricule: '', gender: '', date_naissance: '', lieu_naissance: '',
  adresse: '', parent_phone: '', contact_urgence: '',
  nom_pere: '', profession_pere: '', nom_mere: '', profession_mere: '',
  tuteur: '', class_id: '', statut: '', statut_etablissement: '',
  sport_aptitude: 'apte',
};

// Score de complétude du dossier élève (matricule, classe, sexe, naissance,
// photo, contact parent). Renvoie pct + statut vert/orange/rouge.
function studentCompleteness(s) {
  const fields = [s.matricule, s.class_id, s.gender, s.date_naissance, s.photo_url, s.parent_phone];
  const filled = fields.filter(Boolean).length;
  const pct = Math.round((filled / fields.length) * 100);
  const status = (!s.class_id || pct < 50) ? 'red' : pct < 100 ? 'yellow' : 'green';
  return { pct, status };
}

function StudentForm({ initial, classes, onSave, onCancel }) {
  const t = useT();
  const uiLang = useUiStore((s) => s.uiLang);
  // Locale du sélecteur de date natif (calendrier) : suit la langue de l'UI.
  const dateLang = uiLang === 'es' ? 'es-ES' : uiLang === 'en' ? 'en-GB' : 'fr-FR';
  const GENDERS = [
    { value: 'Masculin', label: t('Masculin', 'Male', 'Masculino') },
    { value: 'Feminin',  label: t('Féminin',  'Female', 'Femenino') },
  ];
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial });
  const [saving, setSaving] = useState(false);
  const set = (f) => (e) => setForm((prev) => ({ ...prev, [f]: e.target.value }));

  // Filtre en cascade : on choisit d'abord une SECTION (maternelle / primaire /
  // 1er cycle / 2nd cycle), puis seules les classes de cette section sont proposées.
  // La section n'apparaît que si l'établissement en compte au moins deux.
  const availableSections = useMemo(() => {
    const present = new Set((classes || []).map(classSectionKey));
    return SECTIONS.filter((s) => present.has(s.key));
  }, [classes]);
  const [section, setSection] = useState(
    initial?.class_id ? classSectionKey((classes || []).find((c) => c.id === initial.class_id) || null) : ''
  );
  const classOptions = useMemo(
    () => (classes || []).filter((c) => !section || classSectionKey(c) === section),
    [classes, section]
  );
  const onSectionChange = (e) => {
    const val = e.target.value;
    setSection(val);
    // Réinitialise la classe si elle n'appartient plus à la section choisie.
    if (val && form.class_id && classSectionKey((classes || []).find((c) => c.id === form.class_id) || null) !== val) {
      setForm((prev) => ({ ...prev, class_id: '' }));
    }
  };

  // Photo : `photoFile` = blob JPEG redimensionné prêt à uploader ; `photoPreview`
  // = URL d'aperçu (photo existante en édition, ou aperçu local après sélection).
  const fileInputRef = useRef(null);
  const [photoFile, setPhotoFile]       = useState(null);
  const [photoPreview, setPhotoPreview] = useState(initial?.photo_url || null);
  const [photoErr, setPhotoErr]         = useState('');
  const [photoBusy, setPhotoBusy]       = useState(false);
  const [showCamera, setShowCamera]     = useState(false);

  // Pipeline commun (fichier choisi OU photo prise à la caméra) : recadre carré,
  // compresse, et prépare l'aperçu + le blob à uploader.
  const ingestPhoto = async (source) => {
    setPhotoErr(''); setPhotoBusy(true);
    try {
      const blob = await resizeImageToSquare(source);
      setPhotoFile(blob);
      setPhotoPreview(URL.createObjectURL(blob));
    } catch {
      setPhotoErr(t('Image illisible.', 'Unreadable image.'));
    } finally {
      setPhotoBusy(false);
    }
  };

  const onPickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';                  // autorise la re-sélection du même fichier
    if (!file) return;
    if (!file.type.startsWith('image/')) { setPhotoErr(t('Choisissez une image.', 'Please choose an image.')); return; }
    await ingestPhoto(file);
  };
  const clearPhoto = () => { setPhotoFile(null); setPhotoPreview(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    // Intention photo : nouveau fichier, suppression d'une photo existante, ou rien.
    const photo = photoFile ? { file: photoFile }
                : (!photoPreview && initial?.photo_url) ? { remove: true }
                : null;
    // try/finally : si onSave échoue, on relâche le bouton au lieu de le figer
    // indéfiniment sur « Enregistrement… ».
    try {
      await onSave(form, photo);
    } catch (err) {
      console.error('handleSubmit', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="pb-2">
      {/* Photo de l'élève */}
      <div className="flex items-center gap-4 mb-5">
        <StudentAvatar student={{ photo_url: photoPreview }} size={80} />
        <div>
          <p className="form-label">{t('Photo', 'Photo')}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={photoBusy}
              className="btn-secondary" style={{ width: 'auto' }}>
              {photoBusy ? t('Traitement…', 'Processing…') : photoPreview ? t('Changer', 'Change') : t('Choisir une photo', 'Choose a photo')}
            </button>
            <button type="button" onClick={() => setShowCamera(true)} disabled={photoBusy}
              className="btn-secondary inline-flex items-center gap-1.5" style={{ width: 'auto' }}>
              📷 {t('Prendre une photo', 'Take a photo', 'Tomar una foto')}
            </button>
            {photoPreview && (
              <button type="button" onClick={clearPhoto} className="text-sm text-red-500 hover:text-red-600 px-2">
                {t('Retirer', 'Remove')}
              </button>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickPhoto} />
          <CameraCaptureModal
            open={showCamera}
            onClose={() => setShowCamera(false)}
            onCapture={(blob) => ingestPhoto(blob)}
          />
          {photoErr
            ? <p className="text-xs text-red-500 mt-1">{photoErr}</p>
            : <p className="text-xs text-gray-400 mt-1">{t('JPG/PNG — recadrée et compressée automatiquement.', 'JPG/PNG — auto-cropped and compressed.')}</p>}
        </div>
      </div>

      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">{t('Identité', 'Identity')}</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
        <div className="col-span-2 md:col-span-1">
          <label className="form-label">{t('Nom complet *', 'Full name *')}</label>
          <input type="text" required className="form-input" placeholder={t('Ex : ELOUNDOU Brigitte', 'E.g. ELOUNDOU Brigitte', 'Ej. : OBIANG NGUEMA María')}
            value={form.name} onChange={set('name')} />
        </div>
        {availableSections.length > 1 && (
          <div>
            <label className="form-label">{t('Section', 'Section', 'Sección')}</label>
            <select className="form-input" value={section} onChange={onSectionChange}>
              <option value="">{t('Toutes les sections', 'All sections', 'Todas las secciones')}</option>
              {availableSections.map((s) => <option key={s.key} value={s.key}>{t(s.fr, s.en, s.es)}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="form-label">{t('Classe *', 'Class *')}</label>
          <select required className="form-input" value={form.class_id} onChange={set('class_id')}>
            <option value="">{section ? t('Choisir une classe…', 'Choose a class…') : t('Choisir…', 'Choose…')}</option>
            {classOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">{t('Matricule', 'Student ID')}</label>
          <input type="text" className="form-input" placeholder={t('Ex : YDE250086', 'E.g. YDE250086', 'Ej. : ML250086')}
            value={form.matricule} onChange={set('matricule')} />
        </div>
        <div>
          <label className="form-label">{t('Sexe', 'Gender')}</label>
          <select className="form-input" value={form.gender} onChange={set('gender')}>
            <option value="">—</option>
            {GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">{t("Statut établissement", 'School status')}</label>
          <select className="form-input" value={form.statut_etablissement || ''} onChange={set('statut_etablissement')}>
            {STATUTS_ETAB.map((s) => <option key={s.value} value={s.value}>{t(s.label, s.label)}</option>)}
          </select>
          <p className="text-[11px] text-gray-400 mt-1">{t('« Nouveau » ⇒ frais d’inscription dus.', '“New” ⇒ registration fee applies.')}</p>
        </div>
        <div>
          <label className="form-label">{t('Statut classe', 'Class status')}</label>
          <select className="form-input" value={form.statut || ''} onChange={set('statut')}>
            {STATUTS.map((s) => <option key={s.value} value={s.value}>{t(s.label, s.label)}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">{t('Date de naissance', 'Date of birth')}</label>
          <input type="date" lang={dateLang} className="form-input"
            value={form.date_naissance || ''} onChange={set('date_naissance')} />
        </div>
        <div>
          <label className="form-label">{t('Lieu de naissance', 'Place of birth')}</label>
          <input type="text" className="form-input" placeholder={t('Ex : Yaoundé', 'E.g. Yaoundé', 'Ej. : Malabo')}
            value={form.lieu_naissance || ''} onChange={set('lieu_naissance')} />
        </div>
        <div>
          <label className="form-label">{t('Aptitude sportive', 'Sport fitness')}</label>
          <select className="form-input" value={form.sport_aptitude || 'apte'} onChange={set('sport_aptitude')}>
            <option value="apte">{t('Apte', 'Fit')}</option>
            <option value="inapte">{t('Inapte', 'Unfit')}</option>
          </select>
          <p className="text-[11px] text-gray-400 mt-1">{t('Carnet MINEDUB primaire — barème EPS (compétence 6A).', 'Primary MINEDUB record — PE scale (competency 6A).')}</p>
        </div>
      </div>

      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">{t('Contact & famille', 'Contact & family')}</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <label className="form-label">{t('Téléphone parent', 'Parent phone')}</label>
          <input type="tel" className="form-input" placeholder={t('677 00 00 00', '677 00 00 00', '222 00 00 00')}
            value={form.parent_phone || ''} onChange={set('parent_phone')} />
        </div>
        <div>
          <label className="form-label">{t("Contact d'urgence", 'Emergency contact')}</label>
          <input type="tel" className="form-input" placeholder={t('699 00 00 00', '699 00 00 00', '555 00 00 00')}
            value={form.contact_urgence || ''} onChange={set('contact_urgence')} />
        </div>
        <div>
          <label className="form-label">{t('Adresse', 'Address')}</label>
          <input type="text" className="form-input" placeholder={t('Quartier, ville', 'Neighbourhood, city', 'Barrio, ciudad')}
            value={form.adresse || ''} onChange={set('adresse')} />
        </div>
        <div>
          <label className="form-label">{t('Nom du père', "Father's name")}</label>
          <input type="text" className="form-input"
            value={form.nom_pere || ''} onChange={set('nom_pere')} />
        </div>
        <div>
          <label className="form-label">{t('Profession père', "Father's profession")}</label>
          <input type="text" className="form-input"
            value={form.profession_pere || ''} onChange={set('profession_pere')} />
        </div>
        <div>
          <label className="form-label">{t('Nom de la mère', "Mother's name")}</label>
          <input type="text" className="form-input"
            value={form.nom_mere || ''} onChange={set('nom_mere')} />
        </div>
        <div>
          <label className="form-label">{t('Profession mère', "Mother's profession")}</label>
          <input type="text" className="form-input"
            value={form.profession_mere || ''} onChange={set('profession_mere')} />
        </div>
        <div>
          <label className="form-label">{t('Tuteur légal', 'Legal guardian')}</label>
          <input type="text" className="form-input" placeholder={t('Si différent des parents', 'If different from parents', 'Si distinto de los padres')}
            value={form.tuteur || ''} onChange={set('tuteur')} />
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button type="submit" disabled={saving} className="btn-primary"
          style={{ width: 'auto', paddingLeft: '2rem', paddingRight: '2rem' }}>
          {saving ? t('Enregistrement…', 'Saving…') : t('Enregistrer', 'Save')}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">{t('Annuler', 'Cancel')}</button>
      </div>
    </form>
  );
}

// ── Titre du signataire selon cycle / système ────────────────────────────────
function directorLabel(school) {
  const lang = (school?.language || '').toLowerCase();
  const n    = (school?.name || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

  // Guinée Équatoriale : intitulé administratif espagnol.
  if (resolveCountryCode(school) === 'guinea_eq') return 'El Director / La Directora';

  if (lang === 'anglophone') return 'The Principal';

  if (/\becole\b|primaire|maternelle|\beps\b|\bepn\b|\bep\b/.test(n))
    return 'Le Directeur / La Directrice';

  if (/lycee/.test(n))
    return 'Le Proviseur / La Proviseure';

  if (/college|\bces\b|\bceg\b|cetic/.test(n))
    return 'Le Principal / La Principale';

  // Francophone secondaire par défaut
  return 'Le Proviseur / La Proviseure';
}

// ── Impression liste élèves ───────────────────────────────────────────────────
function printStudentList(students, classes, school, classFilter, cols = {}) {
  const {
    matricule: showMatricule = true,
    genre: showGenre = true,
    dateNaissance: showDateNaissance = true,
    lieuNaissance: showLieuNaissance = true,
    contact: showContact = true,
  } = cols;

  // Guinée Équatoriale : document entièrement en espagnol.
  const isGE = resolveCountryCode(school) === 'guinea_eq';
  const Lp = (fr, es) => (isGE ? es : fr);
  const locale = isGE ? 'es-ES' : 'fr-FR';
  const isMale   = (g) => g === 'Masculin' || g === 'Masculino';
  const isFemale = (g) => g === 'Feminin'  || g === 'Femenino';

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString(locale) : '—';
  const className = classFilter ? classes.find((c) => c.id === classFilter)?.name : null;
  const today = new Date().toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  const colCount   = 2 + (showMatricule ? 1 : 0) + (showGenre ? 1 : 0) + (showDateNaissance ? 1 : 0) + (showLieuNaissance ? 1 : 0) + (showContact ? 1 : 0);
  const studentWord = (n) => Lp(`élève${n !== 1 ? 's' : ''}`, `alumno${n !== 1 ? 's' : ''}`);

  // Tri alphabétique systématique des élèves dans la liste imprimée.
  const sortByName = (arr) =>
    [...arr].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

  // Grouper par classe si pas de filtre
  const groups = classFilter
    ? [{ name: className, students: sortByName(students) }]
    : (() => {
        const map = {};
        students.forEach((s) => {
          const cls = classes.find((c) => c.id === s.class_id);
          const key = cls?.name || Lp('Non assigné', 'Sin asignar');
          if (!map[key]) map[key] = [];
          map[key].push(s);
        });
        return Object.entries(map)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, sts]) => ({ name, students: sortByName(sts) }));
      })();

  const tableRows = (sts) => sts.map((s, i) => `
    <tr class="${i % 2 === 0 ? 'even' : ''}">
      <td class="center">${i + 1}</td>
      <td><strong>${s.name}</strong></td>
      ${showMatricule ? `<td class="center mono">${s.matricule || '—'}</td>` : ''}
      ${showGenre ? `<td class="center">${isMale(s.gender) ? 'M' : isFemale(s.gender) ? 'F' : '—'}</td>` : ''}
      ${showDateNaissance ? `<td class="center">${fmtDate(s.date_naissance)}</td>` : ''}
      ${showLieuNaissance ? `<td>${s.lieu_naissance || '—'}</td>` : ''}
      ${showContact ? `<td>${s.parent_phone || '—'}</td>` : ''}
    </tr>
  `).join('');

  const classSection = (g) => `
    <div class="class-section">
      <div class="class-header">
        <span class="class-name">${g.name}</span>
        <span class="class-count">${g.students.length} ${studentWord(g.students.length)}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th class="center" style="width:36px">N°</th>
            <th>${Lp('Nom complet', 'Apellidos y nombre')}</th>
            ${showMatricule ? `<th class="center" style="width:100px">${Lp('Matricule', 'Matrícula')}</th>` : ''}
            ${showGenre ? `<th class="center" style="width:36px">${Lp('Sexe', 'Sexo')}</th>` : ''}
            ${showDateNaissance ? `<th class="center" style="width:100px">${Lp('Né(e) le', 'Fecha nac.')}</th>` : ''}
            ${showLieuNaissance ? `<th style="width:110px">${Lp('Lieu naiss.', 'Lugar nac.')}</th>` : ''}
            ${showContact ? `<th style="width:110px">${Lp('Tél. parent', 'Tel. padres')}</th>` : ''}
          </tr>
        </thead>
        <tbody>${tableRows(g.students)}</tbody>
        <tfoot>
          <tr><td colspan="${colCount}" style="text-align:right;padding:6px 8px;font-size:11px;color:#555">
            ${Lp('Total', 'Total')} : <strong>${g.students.length}</strong> ${studentWord(g.students.length)} —
            ${Lp('Garçons', 'Niños')} : <strong>${g.students.filter(s => isMale(s.gender)).length}</strong> —
            ${Lp('Filles', 'Niñas')} : <strong>${g.students.filter(s => isFemale(s.gender)).length}</strong>
          </td></tr>
        </tfoot>
      </table>
    </div>
  `;

  const html = `<!DOCTYPE html>
<html lang="${isGE ? 'es' : 'fr'}">
<head>
<meta charset="utf-8"/>
<title>${Lp('Liste des élèves', 'Lista de alumnos')} — ${school?.name || 'École'}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #111; }
  .page { padding: 16mm 14mm; }
  .header { text-align: center; margin-bottom: 18px; border-bottom: 2px solid #1e3a5f; padding-bottom: 12px; }
  .header .school { font-size: 15px; font-weight: 700; text-transform: uppercase; color: #1e3a5f; letter-spacing: 0.5px; }
  .header .subtitle { font-size: 11px; color: #555; margin-top: 2px; }
  .header .doc-title { font-size: 17px; font-weight: 800; margin-top: 8px; text-transform: uppercase; letter-spacing: 1px; }
  .header .meta { font-size: 10px; color: #777; margin-top: 4px; }
  .class-section { margin-bottom: 24px; }
  .class-header { display: flex; align-items: center; justify-content: space-between; background: #1e3a5f; color: #fff; padding: 6px 10px; border-radius: 4px 4px 0 0; margin-bottom: 0; }
  .class-name { font-size: 13px; font-weight: 700; }
  .class-count { font-size: 11px; opacity: 0.8; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead tr { background: #e8edf4; }
  th { padding: 6px 8px; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 1px solid #bcc8d8; text-align: left; }
  td { padding: 5px 8px; border-bottom: 1px solid #e5e9ef; vertical-align: middle; }
  tr.even td { background: #f7f9fc; }
  tfoot td { background: #f0f3f8 !important; border-top: 1px solid #bcc8d8; }
  .center { text-align: center; }
  .mono { font-family: monospace; font-size: 10px; }
  .footer { margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px; display: flex; justify-content: space-between; font-size: 10px; color: #777; }
  .sign-area { display: flex; gap: 60px; margin-top: 30px; }
  .sign-box { flex: 1; text-align: center; }
  .sign-line { border-bottom: 1px solid #999; margin: 40px 0 4px; }
  .sign-label { font-size: 10px; color: #555; }
  @media print {
    @page { margin: 14mm; size: A4 portrait; }
    body { padding: 0; }
    .page { padding: 0; }
    .class-section { break-inside: auto; }
    .class-header { break-after: avoid; }
  }
</style>
</head>
<body>
<div class="page">
  ${officialHeaderHtml(school, { sys: isGE ? 'ES' : 'FR', title: Lp('LISTE DES ÉLÈVES', 'LISTA DE ALUMNOS'), subtitle: className || '' })}
  <div style="text-align:center;font-size:9px;color:#777;margin:-2px 0 12px">${Lp('Imprimé le', 'Impreso el')} ${today}</div>

  ${groups.map(classSection).join('')}

  <div class="footer">
    <span>${Lp('Total général', 'Total general')} : <strong>${students.length}</strong> ${studentWord(students.length)}</span>
    <span>${school?.name || ''} — ${today}</span>
  </div>

  ${officialSignatureHtml(school, isGE ? 'ES' : 'FR')}
</div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=960,height=720');
  win.document.open();
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 400);
}

// ── Import panel (inchangé) ───────────────────────────────────────────────────
function ImportPanel({ classes, onImport, onCancel }) {
  const t = useT();
  const [fallbackClassId, setFallbackClassId] = useState('');
  const [preview, setPreview]   = useState(null);
  const [importing, setImporting] = useState(false);
  const [done, setDone]         = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef();

  const processFile = async (file) => { if (file) setPreview(await parseSpreadsheet(file)); };

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    processFile(e.dataTransfer.files[0]);
  };

  const normalizeStr = (s) =>
    String(s).trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ');

  // Résolution intelligente de la classe de chaque élève :
  //  • classe présente dans le fichier ET reconnue → on la relie ;
  //  • classe absente du fichier (ou introuvable) → classe de repli SI l'admin
  //    en a choisi une, sinon l'élève est importé SANS classe (class_id null).
  // Aucun élève n'est jamais ignoré.
  const resolveRows = () =>
    (preview?.rows || []).map((row) => {
      let class_id = null;
      if (row.class_name) {
        const target = normalizeStr(row.class_name);
        const m = classes.find((c) => normalizeStr(c.name) === target);
        if (m) class_id = m.id;
      }
      if (!class_id && fallbackClassId) class_id = fallbackClassId;
      const { class_name, ...rest } = row;
      return { ...rest, class_id: class_id || null };
    });

  const resolvedRows  = resolveRows();
  const withClass     = resolvedRows.filter((r) => r.class_id);
  const withoutClass  = resolvedRows.length - withClass.length;
  const needsFallback = withoutClass > 0;

  const handleImport = async () => {
    if (!resolvedRows.length) return;
    setImporting(true);
    for (const row of resolvedRows) await onImport(row);
    setImporting(false);
    setDone(resolvedRows.length);
  };

  if (done !== null) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <p className="text-emerald-800 font-semibold text-sm">{done} {t('élève', 'student')}{done > 1 ? 's' : ''} {t('importé', 'imported')}{done > 1 ? 's' : ''} {t('avec succès', 'successfully')}</p>
        </div>
        <button onClick={onCancel} className="btn-secondary">{t('Fermer', 'Close')}</button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-800">{t('Importer des Élèves', 'Import Students')}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{t('Importez plusieurs élèves à partir d\'un fichier CSV', 'Import multiple students from a CSV file')}</p>
        </div>
        <button onClick={onCancel} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>
      <div className="p-6 grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
        <div className="space-y-5">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">{t('Étape 1 : Sélectionner le fichier', 'Step 1: Select file')}</p>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                dragging ? 'border-brand-400 bg-brand-50'
                : preview?.rows?.length ? 'border-emerald-300 bg-emerald-50'
                : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50'
              }`}
            >
              {preview?.rows?.length ? (
                <div className="flex flex-col items-center gap-2">
                  <svg className="w-8 h-8 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <p className="text-sm font-semibold text-emerald-700">{preview.rows.length} {t('élève', 'student')}{preview.rows.length > 1 ? 's' : ''} {t('détecté', 'detected')}{preview.rows.length > 1 ? 's' : ''}</p>
                  <p className="text-xs text-slate-400">{t('Cliquer pour changer de fichier', 'Click to change file')}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <svg className="w-8 h-8 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" strokeLinecap="round" strokeLinejoin="round"/><polyline points="17 8 12 3 7 8" strokeLinecap="round" strokeLinejoin="round"/><line x1="12" y1="3" x2="12" y2="15" strokeLinecap="round"/></svg>
                  <p className="text-sm font-medium text-slate-600">{t('Glissez votre fichier CSV ici', 'Drag your CSV file here')}</p>
                  <p className="text-xs text-slate-400">{t('Formats supportés : CSV, Excel (.xlsx)', 'Supported formats: CSV, Excel (.xlsx)')}</p>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.ods" className="hidden"
              onChange={(e) => processFile(e.target.files[0])} />
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary text-xs">{t('Sélectionner un fichier', 'Select a file')}</button>
              <button type="button" onClick={downloadStudentTemplate} className="btn-secondary text-xs">{t('Télécharger le modèle', 'Download template')}</button>
            </div>
          </div>
          {preview?.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{preview.error}</div>
          )}
          {preview?.rows?.length > 0 && needsFallback && (
            <div>
              <label className="form-label">
                {t('Classe pour les élèves sans classe', 'Class for students without a class')}{' '}
                <span className="text-xs font-normal text-slate-400">({t('optionnel', 'optional')})</span>
              </label>
              <select className="form-input" value={fallbackClassId} onChange={(e) => setFallbackClassId(e.target.value)}>
                <option value="">{t('— Importer sans classe —', '— Import without a class —', '— Importar sin clase —')}</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p className="text-xs text-slate-400 mt-1">
                {withoutClass} {t('élève(s) sans classe dans le fichier. Laissez vide pour les importer sans classe.', 'student(s) without a class in the file. Leave empty to import them without a class.')}
              </p>
            </div>
          )}
          {preview?.rows?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{t('Aperçu', 'Preview')}</p>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                      <th className="text-left px-3 py-2">{t('Nom', 'Name')}</th>
                      <th className="text-left px-3 py-2">{t('Matricule', 'ID')}</th>
                      <th className="text-left px-3 py-2">{t('Classe', 'Class')}</th>
                      <th className="text-left px-3 py-2">{t('Genre', 'Gender')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {resolvedRows.slice(0, 8).map((r, i) => {
                      const cls = classes.find((c) => c.id === r.class_id);
                      return (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-slate-800">{r.name}</td>
                          <td className="px-3 py-2 text-slate-400 font-mono">{r.matricule || '—'}</td>
                          <td className="px-3 py-2">
                            {cls ? <span className="px-1.5 py-0.5 bg-brand-50 text-brand-700 rounded font-medium">{cls.name}</span>
                                 : <span className="text-amber-600 font-medium">{t('Non assigné', 'Unassigned')}</span>}
                          </td>
                          <td className="px-3 py-2 text-slate-500">{r.gender || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {preview.rows.length > 8 && (
                  <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-400 text-center">
                    …{t('et', 'and')} {preview.rows.length - 8} {t('autres élèves', 'more students')}
                  </div>
                )}
              </div>
            </div>
          )}
          {preview?.rows?.length > 0 && (
            <div className="flex items-center gap-3 pt-1">
              <button type="button" onClick={handleImport} disabled={importing || resolvedRows.length === 0}
                className="btn-primary" style={{ width: 'auto', paddingInline: '1.75rem' }}>
                {importing ? t('Import en cours…', 'Importing…') : `${t('Importer', 'Import')} ${resolvedRows.length} ${t('élève', 'student')}${resolvedRows.length > 1 ? 's' : ''}`}
              </button>
              <button type="button" onClick={onCancel} className="btn-secondary">{t('Annuler', 'Cancel')}</button>
              {withoutClass > 0 && (
                <span className="text-xs text-amber-600 font-medium">
                  {withClass.length} {t('avec classe', 'with class')} · {withoutClass} {t('sans classe', 'without class')}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="space-y-4 text-sm">
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">{t('Instructions', 'Instructions')}</p>
            <ol className="space-y-2 text-slate-600">
              {[t('Téléchargez le modèle CSV','Download the CSV template'),t('Remplissez vos données','Fill in your data'),t('Assurez-vous que les matricules sont uniques','Ensure student IDs are unique'),t('Importez votre fichier','Import your file')].map((step, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i+1}</span>
                  <span className="text-xs leading-snug">{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{t('Classes Disponibles', 'Available Classes')}</p>
            {classes.length === 0 ? <p className="text-xs text-slate-400">{t('Aucune classe.', 'No classes.')}</p> : (
              <div className="flex flex-wrap gap-1.5">
                {classes.map((c) => (
                  <span key={c.id} className="px-2 py-0.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 font-medium">{c.name}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal d'assignation en masse ─────────────────────────────────────────────
function BulkAssignModal({ count, classes, onConfirm, onClose }) {
  const t = useT();
  const [classId, setClassId] = useState('');
  const [reason,  setReason]  = useState('');
  const [saving,  setSaving]  = useState(false);

  const handleConfirm = async () => {
    if (!classId) return;
    setSaving(true);
    await onConfirm(classId, reason);
    setSaving(false);
    onClose();
  };

  return (
    <Modal title={t('Assigner une classe', 'Assign a class')} onClose={onClose} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          {t('Assigner', 'Assign')} <strong>{count}</strong> {t('élève', 'student')}{count > 1 ? 's' : ''} {t('à une classe.', 'to a class.')}
        </p>
        <div>
          <label className="form-label">{t('Classe de destination *', 'Destination class *')}</label>
          <select className="form-input" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">— {t('Choisir', 'Choose')} —</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.current_year ? ` (${c.current_year})` : ''}
                {c.max_students ? ` — max ${c.max_students}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">{t('Motif', 'Reason')} <span className="font-normal text-gray-400">({t('optionnel', 'optional')})</span></label>
          <input type="text" className="form-input" placeholder={t('Ex : Inscription, Transfert, Redoublement…', 'E.g. Enrolment, Transfer, Repeat year…')}
            value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={handleConfirm} disabled={!classId || saving}
            className="btn-primary" style={{ width: 'auto', paddingLeft: '2rem', paddingRight: '2rem' }}>
            {saving ? t('Enregistrement…', 'Saving…') : `${t('Assigner', 'Assign')} ${count} ${t('élève', 'student')}${count > 1 ? 's' : ''}`}
          </button>
          <button onClick={onClose} className="btn-secondary">{t('Annuler', 'Cancel')}</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function Students() {
  const t = useT();
  const navigate = useNavigate();
  const { f } = usePlan();
  const school              = useAuthStore((s) => s.school);
  const classes             = useSchoolStore((s) => s.classes);
  const schoolUnits         = useSchoolStore((s) => s.schoolUnits);
  const students            = useSchoolStore((s) => s.students);
  const archivedStudents    = useSchoolStore((s) => s.archivedStudents);
  const addStudent          = useSchoolStore((s) => s.addStudent);
  const updateStudent       = useSchoolStore((s) => s.updateStudent);
  const deleteStudent       = useSchoolStore((s) => s.deleteStudent);
  const archiveStudent      = useSchoolStore((s) => s.archiveStudent);
  const bulkAssignToClass   = useSchoolStore((s) => s.bulkAssignToClass);
  const role                = useAuthStore((s) => s.role);
  const permissions         = useAuthStore((s) => s.permissions);
  // Devise de l'établissement : la confirmation d'une suppression qui emporte de
  // l'argent doit annoncer un MONTANT, pas un nombre nu.
  const money               = useMoney();

  // Écriture des élèves : la direction (admin + censeur), plus tout compte délégué
  // à qui l'admin a explicitement confié la page Élèves — inscrire un élève est le
  // travail attendu de cette capacité. Aligné sur la politique RLS Supabase
  // (supabase_delegated_write_access.sql). Sinon : lecture seule.
  const canEdit = role === 'admin' || role === 'censeur' || hasCapability(permissions, '/app/students');

  const [classFilter,    setClassFilter]   = useState('');
  const [sectionFilter,  setSectionFilter] = useState('');
  const [genderFilter,   setGenderFilter]  = useState('');
  const [levelFilter,    setLevelFilter]   = useState('');
  const [dossierFilter,  setDossierFilter] = useState('');
  const [search,         setSearch]        = useState('');
  const [page,           setPage]          = useState(1);
  const [showForm,       setShowForm]      = useState(false);
  const [showImport,     setShowImport]    = useState(false);
  const [editing,        setEditing]       = useState(null);
  const [confirmDel,     setConfirmDel]    = useState(null);
  const [selectedIds,    setSelectedIds]   = useState(new Set());
  const [showBulkAssign, setShowBulkAssign]= useState(false);
  const [showPrintOpts, setShowPrintOpts]  = useState(false);
  const [showCards,     setShowCards]      = useState(false);
  const [photoTarget,   setPhotoTarget]    = useState(null);   // élève dont on capture la photo (depuis la liste)
  const [photoSavingId, setPhotoSavingId]  = useState(null);   // id en cours d'upload (spinner ligne)
  const [showScan,      setShowScan]       = useState(false);  // scanner QR d'une carte
  const [cols, setCols] = useState({ matricule: true, genre: true, dateNaissance: true, lieuNaissance: true, contact: true });
  const toggleCol = (key) => setCols((prev) => ({ ...prev, [key]: !prev[key] }));

  // Capture caméra depuis la liste : recadre/compresse, upload, met à jour la fiche.
  const handleCapturePhoto = async (blob) => {
    const target = photoTarget;
    if (!target) return;
    setPhotoSavingId(target.id);
    try {
      const square = await resizeImageToSquare(blob);
      const { url } = await uploadStudentPhoto(school.id, target.id, square);
      if (url) await updateStudent(target.id, { photo_url: url });
    } catch (err) {
      console.error('handleCapturePhoto', err);
      alert(t('Échec de l’enregistrement de la photo.', 'Failed to save the photo.', 'No se pudo guardar la foto.'));
    } finally {
      setPhotoSavingId(null);
    }
  };

  // Stats
  const total  = students.length;
  const boys   = students.filter((s) => s.gender === 'Masculin').length;
  const girls  = students.filter((s) => s.gender === 'Feminin' || s.gender === 'Féminin').length;

  // Pilotage : complétude des dossiers + alertes intelligentes.
  const incompleteCount = students.filter((s) => studentCompleteness(s).status !== 'green').length;
  const cardsReady      = students.filter((s) => s.photo_url && s.class_id).length;
  const noPhoto   = students.filter((s) => !s.photo_url).length;
  const noContact = students.filter((s) => !s.parent_phone).length;
  const noClass   = students.filter((s) => !s.class_id).length;
  const classCount = new Set(students.map((s) => s.class_id).filter(Boolean)).size;
  const classLevel = (id) => classes.find((c) => c.id === id)?.level || '';
  // Section pédagogique d'une classe (par nom → fiable) pour le filtre par cycle.
  const classSection = (id) => classSectionKey(classes.find((c) => c.id === id) || null);
  const availableSections = useMemo(() => {
    const present = new Set(classes.map(classSectionKey));
    return SECTIONS.filter((s) => present.has(s.key));
  }, [classes]);

  // Filtres en cascade : section → niveaux → classes. Choisir une section restreint
  // les niveaux et les classes proposés à cette seule section ; choisir un niveau
  // restreint encore les classes. On ne montre jamais tout l'établissement quand un
  // filtre amont est actif.
  const classesInSection = useMemo(
    () => classes.filter((c) => !sectionFilter || classSectionKey(c) === sectionFilter),
    [classes, sectionFilter]
  );
  const levelOptions = useMemo(
    () => [...new Set(classesInSection.map((c) => c.level).filter(Boolean))].sort(),
    [classesInSection]
  );
  const classOptions = useMemo(
    () => classesInSection.filter((c) => !levelFilter || c.level === levelFilter),
    [classesInSection, levelFilter]
  );

  // Changer une section réinitialise le niveau et la classe si ceux-ci n'appartiennent
  // plus à la nouvelle section ; changer un niveau réinitialise la classe si besoin.
  const onSectionChange = (val) => {
    setSectionFilter(val);
    if (val) {
      if (levelFilter && !classes.some((c) => classSectionKey(c) === val && c.level === levelFilter)) setLevelFilter('');
      if (classFilter && classSection(classFilter) !== val) setClassFilter('');
    }
    resetPage();
  };
  const onLevelChange = (val) => {
    setLevelFilter(val);
    if (val && classFilter && classLevel(classFilter) !== val) setClassFilter('');
    resetPage();
  };
  const avgAge = useMemo(() => {
    const ages = students.map((s) => calcAge(s.date_naissance)).filter((a) => a !== null);
    return ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : null;
  }, [students]);

  const classNameById = (id) => classes.find((c) => c.id === id)?.name || 'Non assigné';

  // Scan d'un QR de carte : le payload est buildCardId(school.id, student.id).
  // On le recompose pour chaque élève et on compare (insensible à la casse).
  const studentByCardCode = (code) => {
    const norm = String(code || '').trim().toUpperCase();
    return students.find((s) => buildCardId(school?.id, s.id) === norm) || null;
  };

  const visible = useMemo(() => {
    return students
      .filter((s) => !classFilter  || s.class_id === classFilter)
      .filter((s) => !sectionFilter || classSection(s.class_id) === sectionFilter)
      .filter((s) => !levelFilter  || classLevel(s.class_id) === levelFilter)
      .filter((s) => !genderFilter || (s.gender === genderFilter || (genderFilter === 'Feminin' && s.gender === 'Féminin')))
      .filter((s) => !dossierFilter || studentCompleteness(s).status === dossierFilter)
      .filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
                                (s.matricule || '').toLowerCase().includes(search.toLowerCase()))
      // Tri alphabétique par défaut — la liste imprimée (PDF) est toujours en ordre alphabétique.
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, classes, classFilter, sectionFilter, levelFilter, genderFilter, dossierFilter, search]);

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const paginated  = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const resetPage  = () => setPage(1);
  const openAdd    = () => { setEditing(null); setShowImport(false); setShowForm(true); };
  const openImport = () => { setEditing(null); setShowForm(false); setShowImport(true); };
  const closeAll   = () => { setShowForm(false); setShowImport(false); setEditing(null); };

  const handleExport = () => {
    const cls = classFilter ? classNameById(classFilter) : 'tous';
    const rows = [
      [t('Nom', 'Name'), t('Matricule', 'Student ID'), t('Genre', 'Gender'), t('Date de naissance', 'Date of birth'), t('Lieu de naissance', 'Place of birth'), t('Âge', 'Age'), t('Classe', 'Class'), t('Téléphone', 'Phone'), t('Adresse', 'Address')],
      ...visible.map((s) => [
        s.name, s.matricule || '', s.gender || '',
        s.date_naissance || '', s.lieu_naissance || '',
        calcAge(s.date_naissance) ?? '',
        classNameById(s.class_id), s.parent_phone || '', s.adresse || '',
      ]),
    ];
    downloadExcel(`eleves_${cls}_${new Date().toISOString().slice(0, 10)}.xlsx`, rows, t('Élèves', 'Students'));
  };

  const handleSave = async (form, photo) => {
    // 0) DOUBLON : un même enfant inscrit deux fois produit deux dossiers, deux
    //    dûs et deux fois le même versement — l'effectif et la caisse deviennent
    //    faux (cas vécu). On compare aussi aux élèves ARCHIVÉS : réinscrire
    //    quelqu'un qu'on croyait supprimé est précisément la façon dont le
    //    doublon apparaît. Avertissement, jamais blocage : l'homonymie existe.
    // DOUBLON — deux niveaux (cf. lib/studentDuplicate.js) :
    //   BLOCK : même nom ET même date de naissance, ou matricule déjà pris.
    //           C'est la même personne : on REFUSE, il n'y a rien à confirmer.
    //   WARN  : même naissance et même contact, ou nom qui n'est qu'une variante
    //           (« … JUNIOR »). Très probablement le même enfant — mais des
    //           jumeaux partagent naissance et téléphone du parent, donc on
    //           demande confirmation au lieu de rendre leur inscription impossible.
    const registre = [...students, ...archivedStudents];
    const dup = checkDuplicate({ ...form, id: editing?.id ?? null }, registre);
    const etatDe = (s) => (s.archived_at
      ? t('archivé', 'archived', 'archivado')
      : classes.find((c) => c.id === s.class_id)?.name || t('sans classe', 'no class', 'sin clase'));
    const listeDe = (matches) => matches.map((m) => `• ${m.student.name} (${etatDe(m.student)})`).join('\n');

    if (dup.level === DUP.BLOCK) {
      window.alert([
        dup.reason,
        '',
        listeDe(dup.matches),
        '',
        t('Ouvrez la fiche existante au lieu d’en créer une seconde.',
          'Open the existing record instead of creating a second one.',
          'Abra la ficha existente en lugar de crear otra.'),
      ].join('\n'));
      return;
    }

    if (dup.level === DUP.WARN) {
      const msg = [
        dup.reason,
        '',
        listeDe(dup.matches),
        '',
        t('Enregistrer quand même ? (Annulez si c’est le même enfant.)',
          'Save anyway? (Cancel if this is the same child.)',
          '¿Guardar de todos modos? (Cancele si es el mismo niño.)'),
      ].join('\n');
      if (!window.confirm(msg)) return;
    } else {
      // Homonymie simple (même nom, naissance différente ou inconnue) : le
      // rappel historique, qui reste un avertissement — deux enfants peuvent
      // légitimement porter le même nom.
      const avertissement = duplicateWarning(form.name, registre, {
        excludeId: editing?.id ?? null,
        classNameOf: (id) => classes.find((c) => c.id === id)?.name || null,
        t,
      });
      if (avertissement && !window.confirm(avertissement)) return;
    }

    // 1) Crée/met à jour l'élève d'abord (il faut un id pour nommer la photo).
    let studentId;
    if (editing) { await updateStudent(editing.id, form); studentId = editing.id; }
    else         { const rec = await addStudent(form); studentId = rec?.id; }

    // 2) Photo : upload du nouveau fichier, ou retrait de la photo existante.
    if (studentId && photo?.file) {
      const { url } = await uploadStudentPhoto(school.id, studentId, photo.file);
      if (url) await updateStudent(studentId, { photo_url: url });
    } else if (studentId && photo?.remove) {
      await updateStudent(studentId, { photo_url: null });
      await deleteStudentPhoto(school.id, studentId);
    }

    if (editing) setEditing(null); else setShowForm(false);
  };

  // Un élève porteur d'écritures de caisse PEUT être supprimé depuis le
  // 27/08/2026 — les écoles le demandent, et la détection de doublons permet de
  // le réinscrire sans créer un second dossier. Mais ses versements partent avec
  // lui : on montre combien et pour quel montant avant de laisser faire, et on
  // rappelle l'archivage, qui n'efface rien.
  const handleDelete = async (s) => {
    let res = await deleteStudent(s.id);
    if (res?.action === 'confirm') {
      if (window.confirm(cashDeletionWarning(s.name, res.trail, money, t))) {
        res = await deleteStudent(s.id, { force: true });
      } else {
        res = await archiveStudent(s.id, t('Sortie de l’établissement', 'Left the school', 'Salida del centro'));
        res = { action: 'archive', trail: { entries: 0 } };
      }
    }
    setConfirmDel(null);
    if (res?.action === 'archive') {
      toast.success(t(
        `${s.name} a été archivé : ses données et ses versements sont conservés.`,
        `${s.name} was archived: all data and payments are kept.`,
        `${s.name} fue archivado: se conservan sus datos y pagos.`,
      ));
    }
  };

  const toggleSelect = (id) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleSelectAll = () => {
    if (selectedIds.size === paginated.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginated.map((s) => s.id)));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkAssign = async (classId, reason) => {
    await bulkAssignToClass([...selectedIds], classId, reason);
    clearSelection();
  };

  return (
    <Layout>
      <div className="max-w-6xl">

        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('Gestion des Élèves', 'Student Management')}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {visible.length} {t('élève', 'student')}{visible.length !== 1 ? 's' : ''}
              {classFilter ? ` — ${classNameById(classFilter)}` : ` ${t('au total', 'total')}`}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
              {canEdit && <button onClick={openImport} className="btn-secondary">{t('Importer', 'Import')}</button>}
              {visible.length > 0 && (
                <>
                  <button onClick={handleExport} className="btn-secondary">{t('Exporter Excel', 'Export Excel')}</button>
                  {/* Groupe Impression : Print / PDF + son engrenage d'options
                      (colonnes à imprimer) côte à côte. Le panneau s'ancre sous
                      ce groupe. */}
                  <div className="relative flex gap-1">
                    <button
                      onClick={() => { setShowPrintOpts(false); printStudentList(visible, classes, school, classFilter, cols); }}
                      className="btn-secondary"
                    >
                      {t('Imprimer / PDF', 'Print / PDF', 'Imprimir / PDF')}
                    </button>
                    <button
                      onClick={() => setShowPrintOpts((v) => !v)}
                      className={`btn-secondary px-2.5 ${showPrintOpts ? '!bg-gray-100' : ''}`}
                      title={t('Colonnes à imprimer', 'Columns to print')}
                    >
                      ⚙
                    </button>
                    {showPrintOpts && (
                      <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-4 w-52">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
                          {t('Colonnes à imprimer', 'Columns to print')}
                        </p>
                        {[
                          { key: 'matricule',     label: t('Matricule', 'Student ID') },
                          { key: 'genre',         label: t('Sexe', 'Gender') },
                          { key: 'dateNaissance', label: t('Date de naissance', 'Date of birth') },
                          { key: 'lieuNaissance', label: t('Lieu de naissance', 'Place of birth') },
                          { key: 'contact',       label: t('Contact parent', 'Parent contact') },
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
                  <button
                    onClick={() => setShowCards(true)}
                    className="btn-secondary inline-flex items-center gap-1.5 !bg-indigo-50 !text-indigo-700 hover:!bg-indigo-100 border-indigo-200"
                    title={t('Imprimer les cartes scolaires (QR Code)', 'Print ID cards (QR code)', 'Imprimir carnés (QR)')}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="5" width="18" height="14" rx="2"/>
                      <circle cx="9" cy="12" r="2.5"/>
                      <path d="M14 10h4M14 14h4"/>
                    </svg>
                    {t('Cartes scolaires', 'ID cards', 'Carnés')}
                  </button>
                  <button
                    onClick={() => setShowScan(true)}
                    className="btn-secondary inline-flex items-center gap-1.5 !bg-emerald-50 !text-emerald-700 hover:!bg-emerald-100 border-emerald-200"
                    title={t('Scanner le QR d’une carte', 'Scan a card QR code', 'Escanear el QR de una tarjeta')}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
                      <path d="M3 12h18"/>
                    </svg>
                    {t('Scanner', 'Scan', 'Escanear')}
                  </button>
                </>
              )}
              {canEdit && (total >= f.maxStudents ? (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-sm text-amber-800">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-amber-500 shrink-0">
                    <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
                  </svg>
                  <span>{total}/{f.maxStudents} {t('élèves — limite Starter', 'students — Starter limit')} ·{' '}
                    <a href="https://wa.me/237670894721?text=Je%20veux%20passer%20au%20plan%20%C3%89cole" target="_blank" rel="noopener noreferrer" className="font-semibold underline text-amber-900">
                      {t('Upgrader', 'Upgrade')}
                    </a>
                  </span>
                </div>
              ) : (
                <button onClick={openAdd} className="btn-primary"
                  style={{ width: 'auto', paddingLeft: '1.25rem', paddingRight: '1.25rem' }}>
                  + {t('Nouvel Élève', 'New Student')}
                </button>
              ))}
            </div>
        </div>

        {/* ── Barre d'actions sélection ───────────────────────── */}
        {canEdit && selectedIds.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-gray-900 text-white rounded-2xl shadow-2xl px-5 py-3 text-sm">
            <span className="font-semibold">{selectedIds.size} {t('élève', 'student')}{selectedIds.size > 1 ? 's' : ''} {t('sélectionné', 'selected')}{selectedIds.size > 1 ? 's' : ''}</span>
            <button onClick={() => setShowBulkAssign(true)}
              className="bg-brand-500 hover:bg-brand-400 text-white px-4 py-1.5 rounded-xl font-semibold transition-colors text-sm">
              {t('Assigner une classe', 'Assign a class')}
            </button>
            <button onClick={clearSelection}
              className="text-gray-400 hover:text-white transition-colors text-xs underline">
              {t('Annuler', 'Cancel')}
            </button>
          </div>
        )}

        {/* ── Dashboard KPI ───────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
          {[
            { emoji: '👥', tone: 'bg-indigo-50',  value: total,          label: t('Élèves', 'Students', 'Alumnos') },
            { emoji: '🏫', tone: 'bg-sky-50',     value: classCount,     label: t('Classes', 'Classes', 'Clases') },
            { emoji: '👦', tone: 'bg-blue-50',    value: boys,           label: t('Garçons', 'Boys', 'Chicos') },
            { emoji: '👧', tone: 'bg-rose-50',    value: girls,          label: t('Filles', 'Girls', 'Chicas') },
            { emoji: '⚠️', tone: incompleteCount ? 'bg-red-50' : 'bg-slate-50', value: incompleteCount, label: t('Dossiers incomplets', 'Incomplete files', 'Expedientes'), danger: true },
            { emoji: '🪪', tone: 'bg-emerald-50', value: cardsReady,     label: t('Cartes prêtes', 'Cards ready', 'Carnés listos') },
          ].map((c) => (
            <div key={c.label} className="bg-white rounded-2xl border border-slate-200/70 p-4 shadow-sm">
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${c.tone}`}>{c.emoji}</span>
              <div className={`text-2xl font-extrabold mt-2 ${c.danger && incompleteCount ? 'text-red-600' : 'text-slate-900'}`}>{c.value}</div>
              <div className="text-xs text-slate-500 leading-tight">{c.label}</div>
            </div>
          ))}
        </div>

        {/* ── Alertes intelligentes ───────────────────────────── */}
        {(noPhoto || noContact || noClass) > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {noPhoto > 0 && (
              <button onClick={() => { setDossierFilter(''); setSearch(''); }} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                📷 {noPhoto} {t('sans photo', 'without photo', 'sin foto')}
              </button>
            )}
            {noContact > 0 && (
              <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                📞 {noContact} {t('sans contact parent', 'without parent contact', 'sin contacto')}
              </span>
            )}
            {noClass > 0 && (
              <button onClick={() => setClassFilter('')} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                🏫 {noClass} {t('sans classe', 'without class', 'sin clase')}
              </button>
            )}
            {incompleteCount > 0 && (
              <button onClick={() => setDossierFilter('red')} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                ⚠ {incompleteCount} {t('dossier(s) incomplet(s)', 'incomplete file(s)', 'expediente(s)')}
              </button>
            )}
          </div>
        )}

        {(
          <>
            {/* ── Modals formulaires ───────────────────────────── */}
            {(showForm || editing) && (
              <Modal
                title={editing ? t("Modifier l'élève", 'Edit student') : t('Nouvel élève', 'New student')}
                onClose={closeAll}
                size="lg"
              >
                <StudentForm
                  initial={editing || (classFilter ? { class_id: classFilter } : {})}
                  classes={classes}
                  onSave={handleSave}
                  onCancel={closeAll}
                />
              </Modal>
            )}
            {showImport && (
              <Modal title={t('Importer des élèves', 'Import students')} onClose={closeAll} size="lg">
                <ImportPanel classes={classes} onImport={addStudent} onCancel={closeAll} />
              </Modal>
            )}

            {showCards && (
              <Suspense fallback={null}>
                <IdCardModal
                  open
                  onClose={() => setShowCards(false)}
                  students={visible}
                  school={school}
                  units={schoolUnits}
                  classes={classes}
                  classNameById={classNameById}
                  classSystemById={(id) => classes.find((c) => c.id === id)?.system}
                />
              </Suspense>
            )}

            {/* Capture caméra d'une photo directement depuis la liste */}
            <CameraCaptureModal
              open={!!photoTarget}
              onClose={() => setPhotoTarget(null)}
              onCapture={handleCapturePhoto}
            />

            {/* Scanner le QR d'une carte → fiche élève */}
            <QrScanModal
              open={showScan}
              onClose={() => setShowScan(false)}
              lookup={studentByCardCode}
              classNameById={classNameById}
              onView={(s) => navigate(`/app/students/${s.id}`)}
            />

            {/* ── Filters ───────────────────────────────────────── */}
            <div className="flex flex-wrap gap-3 mb-4">
              <input type="text" className="form-input max-w-xs" placeholder={t('Rechercher nom ou matricule…', 'Search name or ID…')}
                value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }} />
              {availableSections.length > 1 && (
                <select className="form-input" style={{ maxWidth: 170 }}
                  value={sectionFilter} onChange={(e) => onSectionChange(e.target.value)}>
                  <option value="">{t('Toutes les sections', 'All sections')}</option>
                  {availableSections.map((s) => <option key={s.key} value={s.key}>{t(s.fr, s.en, s.es)}</option>)}
                </select>
              )}
              <select className="form-input" style={{ maxWidth: 150 }}
                value={levelFilter} onChange={(e) => onLevelChange(e.target.value)}>
                <option value="">{t('Tous niveaux', 'All levels')}</option>
                {levelOptions.map((lv) => <option key={lv} value={lv}>{lv}</option>)}
              </select>
              <select className="form-input" style={{ maxWidth: 180 }}
                value={classFilter} onChange={(e) => { setClassFilter(e.target.value); resetPage(); }}>
                <option value="">{t('Toutes les classes', 'All classes')}</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({students.filter((s) => s.class_id === c.id).length})</option>
                ))}
              </select>
              <select className="form-input" style={{ maxWidth: 160 }}
                value={genderFilter} onChange={(e) => { setGenderFilter(e.target.value); resetPage(); }}>
                <option value="">{t('Tous les genres', 'All genders')}</option>
                <option value="Masculin">{t('Garçons', 'Boys')}</option>
                <option value="Feminin">{t('Filles', 'Girls')}</option>
              </select>
              <select className="form-input" style={{ maxWidth: 170 }}
                value={dossierFilter} onChange={(e) => { setDossierFilter(e.target.value); resetPage(); }}>
                <option value="">{t('Tous les dossiers', 'All files', 'Todos')}</option>
                <option value="green">🟢 {t('Complets', 'Complete', 'Completos')}</option>
                <option value="yellow">🟡 {t('Partiels', 'Partial', 'Parciales')}</option>
                <option value="red">🔴 {t('Incomplets', 'Incomplete', 'Incompletos')}</option>
              </select>
              {(search || classFilter || sectionFilter || genderFilter || levelFilter || dossierFilter) && (
                <button onClick={() => { setSearch(''); setClassFilter(''); setSectionFilter(''); setGenderFilter(''); setLevelFilter(''); setDossierFilter(''); resetPage(); }}
                  className="text-xs text-gray-400 hover:text-gray-600 underline">
                  {t('Effacer les filtres', 'Clear filters')}
                </button>
              )}
            </div>

            {/* ── Table ─────────────────────────────────────────── */}
            {visible.length === 0 ? (
              <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
                <div className="text-4xl mb-3">👥</div>
                <p className="text-gray-500 text-sm">
                  {search || classFilter || genderFilter
                    ? t('Aucun élève ne correspond aux filtres.', 'No student matches the filters.')
                    : t('Aucun élève encore. Commencez par ajouter ou importer des élèves.', 'No students yet. Start by adding or importing students.')}
                </p>
              </div>
            ) : (
              <>
                {/* ── Desktop : tableau ── */}
                <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        {canEdit && (
                          <th className="px-3 py-3 w-10">
                            <input type="checkbox"
                              className="rounded border-gray-300 text-brand-600"
                              checked={paginated.length > 0 && selectedIds.size === paginated.length}
                              onChange={toggleSelectAll} />
                          </th>
                        )}
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">{t('Élève', 'Student')}</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">{t('Matricule', 'ID')}</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">{t('Classe', 'Class')}</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">{t('Âge', 'Age')}</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">{t('Contact', 'Contact')}</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">{t('Dossier', 'File', 'Expediente')}</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-600">{t('Actions', 'Actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {paginated.map((student) => {
                        const age = calcAge(student.date_naissance);
                        const cls = classes.find((c) => c.id === student.class_id);
                        const isSelected = selectedIds.has(student.id);
                        return (
                          <tr key={student.id} className={`hover:bg-gray-50 transition-colors group ${isSelected ? 'bg-brand-50/40' : ''}`}>
                            {/* Checkbox */}
                            {canEdit && (
                              <td className="px-3 py-3">
                                <input type="checkbox"
                                  className="rounded border-gray-300 text-brand-600"
                                  checked={isSelected}
                                  onChange={() => toggleSelect(student.id)} />
                              </td>
                            )}
                            {/* Avatar + nom */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <StudentAvatar student={student} size={32} />
                                <div>
                                  <Link to={`/app/students/${student.id}`}
                                    className="font-semibold text-gray-900 hover:text-brand-600 transition-colors">
                                    {student.name}
                                  </Link>
                                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                    {student.gender && (
                                      <span className="text-xs text-gray-400">
                                        {student.gender === 'Masculin' ? '♂' : '♀'}{' '}
                                        {student.gender === 'Masculin' ? t('Masculin', 'Male') : t('Féminin', 'Female')}
                                      </span>
                                    )}
                                    {student.statut_etablissement && (() => {
                                      const s = STATUTS_ETAB.find((x) => x.value === student.statut_etablissement);
                                      return s?.color ? (
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${s.color}`}>{t(s.label, s.label)}</span>
                                      ) : null;
                                    })()}
                                    {student.statut && (() => {
                                      const s = STATUTS.find((x) => x.value === student.statut);
                                      return s ? (
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${s.color}`}>{t(s.label, s.label)}</span>
                                      ) : null;
                                    })()}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                              {student.matricule || '—'}
                            </td>
                            <td className="px-4 py-3">
                              {cls
                                ? <span className="px-2 py-0.5 bg-brand-50 text-brand-700 rounded-full text-xs font-medium">{cls.name}</span>
                                : <span className="text-gray-400 text-xs">{t('Non assigné', 'Unassigned')}</span>
                              }
                            </td>
                            <td className="px-4 py-3 text-gray-600 text-sm">
                              {age !== null ? (
                                <span>
                                  <span className="font-medium">{age}</span>
                                  <span className="text-gray-400 text-xs"> {t('ans', 'yrs')}</span>
                                </span>
                              ) : '—'}
                              {student.date_naissance && (
                                <span className="block text-xs text-gray-400">
                                  {new Date(student.date_naissance).toLocaleDateString(dateLocale())}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {student.parent_phone
                                ? <span className="text-sm text-gray-600">{student.parent_phone}</span>
                                : <span className="text-gray-300 text-xs">—</span>
                              }
                              {student.adresse && (
                                <span className="block text-xs text-gray-400 truncate max-w-[160px]" title={student.adresse}>
                                  {student.adresse}
                                </span>
                              )}
                            </td>
                            {/* Dossier : score de complétude */}
                            <td className="px-4 py-3">
                              {(() => {
                                const { pct, status } = studentCompleteness(student);
                                const c = status === 'green' ? { dot: 'bg-emerald-500', bar: 'bg-emerald-500', txt: t('Complet', 'Complete', 'Completo') }
                                  : status === 'yellow' ? { dot: 'bg-amber-500', bar: 'bg-amber-400', txt: t('Partiel', 'Partial', 'Parcial') }
                                  : { dot: 'bg-red-500', bar: 'bg-red-500', txt: t('Incomplet', 'Incomplete', 'Incompleto') };
                                return (
                                  <div className="w-24">
                                    <div className="flex items-center gap-1.5 mb-1">
                                      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                                      <span className="text-[11px] font-semibold text-slate-600">{c.txt}</span>
                                      <span className="text-[10px] text-slate-400 ml-auto">{pct}%</span>
                                    </div>
                                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full ${c.bar}`} style={{ width: `${pct}%` }} /></div>
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {confirmDel?.id === student.id ? (
                                <span className="flex items-center justify-end gap-2">
                                  <span className="text-red-600 text-xs">{t('Confirmer ?', 'Confirm?')}</span>
                                  <button onClick={() => handleDelete(student)} className="text-xs text-red-600 hover:underline font-semibold">{t('Oui', 'Yes')}</button>
                                  <button onClick={() => setConfirmDel(null)} className="text-xs text-gray-500 hover:underline">{t('Non', 'No')}</button>
                                </span>
                              ) : (
                                <span className="flex items-center justify-end gap-1">
                                  <Link to={`/app/students/${student.id}`}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                                    title="Voir la fiche">
                                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/></svg>
                                  </Link>
                                  {canEdit && (
                                    <>
                                      <button
                                        onClick={() => setPhotoTarget(student)}
                                        disabled={photoSavingId === student.id}
                                        className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-50"
                                        title={t('Prendre une photo', 'Take a photo', 'Tomar una foto')}>
                                        {photoSavingId === student.id ? (
                                          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-90" d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></svg>
                                        ) : (
                                          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" clipRule="evenodd"/><path fillRule="evenodd" d="M7.06 3a1 1 0 00-.84.46L5.4 4.72H4a2 2 0 00-2 2V15a2 2 0 002 2h12a2 2 0 002-2V6.72a2 2 0 00-2-2h-1.4l-.82-1.26A1 1 0 0012.94 3H7.06zM10 6a4 4 0 100 8 4 4 0 000-8z" clipRule="evenodd"/></svg>
                                        )}
                                      </button>
                                      <button
                                        onClick={() => { setEditing(student); setShowForm(false); setShowImport(false); }}
                                        className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                                        title="Modifier">
                                        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                                      </button>
                                      <button onClick={() => setConfirmDel(student)}
                                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                        title="Supprimer">
                                        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                                      </button>
                                    </>
                                  )}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* ── Mobile : cartes ── */}
                <div className="md:hidden space-y-2">
                  {paginated.map((student) => {
                    const age = calcAge(student.date_naissance);
                    const cls = classes.find((c) => c.id === student.class_id);
                    const isSelected = selectedIds.has(student.id);
                    const { pct, status } = studentCompleteness(student);
                    const dot = status === 'green' ? 'bg-emerald-500' : status === 'yellow' ? 'bg-amber-500' : 'bg-red-500';
                    return (
                      <div key={student.id} className={`bg-white rounded-xl border p-3 transition-colors ${isSelected ? 'border-brand-300 bg-brand-50/40' : 'border-gray-100'}`}>
                        <div className="flex items-start gap-2.5">
                          {canEdit && (
                            <input type="checkbox"
                              className="mt-2.5 rounded border-gray-300 text-brand-600 shrink-0"
                              checked={isSelected}
                              onChange={() => toggleSelect(student.id)} />
                          )}
                          <StudentAvatar student={student} size={40} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <Link to={`/app/students/${student.id}`} className="font-semibold text-gray-900 text-sm truncate">
                                {student.name}
                              </Link>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} title={`${t('Dossier', 'File')} ${pct}%`} />
                            </div>
                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-1">
                              {cls
                                ? <span className="px-1.5 py-0.5 bg-brand-50 text-brand-700 rounded-full text-[11px] font-medium">{cls.name}</span>
                                : <span className="text-gray-400 text-[11px]">{t('Non assigné', 'Unassigned')}</span>}
                              {student.matricule && <span className="text-[11px] text-gray-400 font-mono">{student.matricule}</span>}
                              {age !== null && <span className="text-[11px] text-gray-400">{age} {t('ans', 'yrs')}</span>}
                            </div>
                            {student.parent_phone && (
                              <p className="text-xs text-gray-500 mt-1">{student.parent_phone}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-gray-50">
                          {confirmDel?.id === student.id ? (
                            <span className="flex items-center gap-2.5 text-xs">
                              <span className="text-red-600">{t('Supprimer ?', 'Delete?')}</span>
                              <button onClick={() => handleDelete(student)} className="text-red-600 font-semibold">{t('Oui', 'Yes')}</button>
                              <button onClick={() => setConfirmDel(null)} className="text-gray-500">{t('Non', 'No')}</button>
                            </span>
                          ) : (
                            <>
                              <Link to={`/app/students/${student.id}`}
                                className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                                title="Voir la fiche">
                                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/></svg>
                              </Link>
                              {canEdit && (
                                <>
                                  <button
                                    onClick={() => setPhotoTarget(student)}
                                    disabled={photoSavingId === student.id}
                                    className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-50"
                                    title={t('Prendre une photo', 'Take a photo', 'Tomar una foto')}>
                                    {photoSavingId === student.id ? (
                                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-90" d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></svg>
                                    ) : (
                                      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" clipRule="evenodd"/><path fillRule="evenodd" d="M7.06 3a1 1 0 00-.84.46L5.4 4.72H4a2 2 0 00-2 2V15a2 2 0 002 2h12a2 2 0 002-2V6.72a2 2 0 00-2-2h-1.4l-.82-1.26A1 1 0 0012.94 3H7.06zM10 6a4 4 0 100 8 4 4 0 000-8z" clipRule="evenodd"/></svg>
                                    )}
                                  </button>
                                  <button
                                    onClick={() => { setEditing(student); setShowForm(false); setShowImport(false); }}
                                    className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                                    title="Modifier">
                                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                                  </button>
                                  <button onClick={() => setConfirmDel(student)}
                                    className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                    title="Supprimer">
                                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ── Pagination ─────────────────────────────────── */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
                    <span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, visible.length)} {t('sur', 'of')} {visible.length}</span>
                    <div className="flex gap-1">
                      <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                        ← {t('Préc.', 'Prev.')}
                      </button>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                        return (
                          <button key={p} onClick={() => setPage(p)}
                            className={`w-9 py-1.5 rounded-lg border transition-colors ${
                              p === page
                                ? 'bg-brand-600 text-white border-brand-600'
                                : 'border-gray-200 hover:bg-gray-50'
                            }`}>
                            {p}
                          </button>
                        );
                      })}
                      <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                        {t('Suiv.', 'Next.')} →
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {showBulkAssign && (
        <BulkAssignModal
          count={selectedIds.size}
          classes={classes}
          onConfirm={handleBulkAssign}
          onClose={() => setShowBulkAssign(false)}
        />
      )}
    </Layout>
  );
}
