import { supabase } from './supabase';

// ── Convertit la 1ère page d'un PDF en PNG via PDF.js ─────────────────────

export async function pdfToImageDataUrl(file) {
  const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
  // Worker via CDN — évite les problèmes de bundling Vite
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);

  const viewport = page.getViewport({ scale: 2.5 });
  const canvas = document.createElement('canvas');
  canvas.width  = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;

  return canvas.toDataURL('image/png');
}

// ── Upload de l'image template dans Supabase Storage ──────────────────────

export async function uploadTemplateImage(schoolId, dataUrl) {
  const blob = dataURLToBlob(dataUrl);
  const path = `${schoolId}/bulletin_template.png`;
  const { error } = await supabase.storage
    .from('bulletin-templates')
    .upload(path, blob, { upsert: true, contentType: 'image/png' });
  if (error) throw error;
  const { data } = supabase.storage.from('bulletin-templates').getPublicUrl(path);
  return data.publicUrl;
}

// Upload direct d'une image (PNG/JPG)
export async function uploadTemplateFile(schoolId, file) {
  const ext = file.type === 'image/jpeg' ? 'jpg' : 'png';
  const path = `${schoolId}/bulletin_template.${ext}`;
  const { error } = await supabase.storage
    .from('bulletin-templates')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from('bulletin-templates').getPublicUrl(path);
  return data.publicUrl;
}

// ── Données disponibles pour le mapping ───────────────────────────────────

export const DATA_KEYS = [
  { value: 'school_name',       label: 'Nom établissement' },
  { value: 'school_region',     label: 'Région' },
  { value: 'school_type',       label: 'Type établissement' },
  { value: 'academic_year',     label: 'Année scolaire' },
  { value: 'student_name',      label: 'Nom complet élève' },
  { value: 'student_first_name',label: 'Prénom élève' },
  { value: 'student_last_name', label: 'Nom de famille' },
  { value: 'student_dob',       label: 'Date de naissance' },
  { value: 'student_gender',    label: 'Genre' },
  { value: 'student_matricule', label: 'Matricule' },
  { value: 'class_name',        label: 'Classe' },
  { value: 'period_label',      label: 'Période' },
  { value: 'student_avg',       label: 'Moyenne générale' },
  { value: 'student_rank',      label: 'Rang' },
  { value: 'class_avg',         label: 'Moyenne classe' },
  { value: 'decision',          label: 'Décision (Admis/Ajourné)' },
  ...Array.from({ length: 15 }, (_, i) => ([
    { value: `subject_${i+1}_name`,  label: `Matière ${i+1} — Nom` },
    { value: `subject_${i+1}_avg`,   label: `Matière ${i+1} — Note` },
    { value: `subject_${i+1}_coeff`, label: `Matière ${i+1} — Coeff` },
  ])).flat(),
];

// ── Construit le dictionnaire de données à partir du contexte bulletin ─────

export function buildDataDict({ school, cls, student, subjects, subjectGrades, studentAvg, rank, stats, period, sys }) {
  const maxScale = sys === 'FR' ? 20 : 100;
  const passThreshold = sys === 'FR' ? 10 : 50;
  const passed = studentAvg !== null && studentAvg >= passThreshold;

  const dict = {
    school_name:        school?.name ?? '',
    school_region:      school?.region ?? '',
    school_type:        school?.school_type ?? '',
    academic_year:      cls?.current_year ?? school?.current_year ?? '',
    class_name:         cls?.name ?? '',
    period_label:       period?.label ?? '',
    student_name:       student?.name ?? '',
    student_first_name: student?.name ?? '',
    student_last_name:  '',
    student_dob:        student?.date_naissance ?? '',
    student_gender:     student?.gender ?? '',
    student_matricule:  student?.matricule ?? '',
    student_avg:        studentAvg !== null ? String(studentAvg) : '',
    student_rank:       rank?.rankD ? `${rank.rankD} / ${stats?.total ?? '—'}` : '',
    class_avg:          stats?.avg !== undefined ? String(stats.avg) : '',
    class_total:        String(stats?.total ?? ''),
    decision:           sys === 'FR' ? (passed ? 'Admis(e)' : 'Ajourné(e)') : (passed ? 'Passed' : 'Failed'),
  };

  (subjects ?? []).forEach((subj, i) => {
    const n = i + 1;
    const avg = subjectGrades?.[subj.id];
    dict[`subject_${n}_name`]  = subj.name ?? '';
    dict[`subject_${n}_avg`]   = avg !== null && avg !== undefined ? String(avg) : '';
    dict[`subject_${n}_coeff`] = String(subj.coef ?? subj.coefficient ?? '');
    dict[`subject_${n}_teacher`] = subj.teacher_name ?? '';
  });

  return dict;
}

// ── Interne ────────────────────────────────────────────────────────────────

function dataURLToBlob(dataUrl) {
  const [header, data] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(data);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
