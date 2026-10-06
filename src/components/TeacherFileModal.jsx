// Dossier d'un ENSEIGNANT — ouvert en cliquant sur sa ligne dans la liste.
//
// Avant, les informations d'un enseignant n'étaient visibles qu'en ouvrant le
// formulaire de MODIFICATION (on consultait donc en risquant d'écrire), et les
// pièces jointes à sa fiche n'étaient ouvrables nulle part : elles étaient
// envoyées puis perdues de vue. Cette fenêtre est en lecture seule et rassemble
// les trois choses qu'on cherche sur un enseignant : qui il est, ce qu'il
// enseigne, et ses papiers.
import Modal from './Modal';
import { useT } from '../lib/i18n';
import { sectorLabel } from '../lib/personnelSectors';
import { parseDocs } from '../lib/staffService';
import { printTeacherFile } from '../lib/teacherDoc';
import { printWorkCertificate } from '../lib/hrDoc';
import { toast } from '../store/toastStore';

// Forcer le téléchargement plutôt que l'affichage. L'attribut `download` du lien
// est IGNORÉ par le navigateur quand le fichier vient d'une autre origine — ce
// qui est le cas du stockage cloud, pas du serveur LAN qui sert l'app et les
// fichiers depuis la même origine. On ajoute donc `?download=` (supporté par le
// stockage Supabase) uniquement dans ce cas.
function downloadHref(url, name) {
  try {
    const u = new URL(url, window.location.href);
    if (u.origin !== window.location.origin) u.searchParams.set('download', name || '');
    return u.toString();
  } catch { return url; }
}

const Field = ({ label, value, warn }) => (
  <div>
    <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">{label}</div>
    <div className={`text-sm mt-0.5 ${value ? 'text-gray-800' : warn ? 'text-amber-600' : 'text-gray-300'}`}>
      {value || (warn || '—')}
    </div>
  </div>
);

export default function TeacherFileModal({ teacher, school, subjects = [], classNames = [], canManage, onEdit, onClose }) {
  const t = useT();
  const docs = parseDocs(teacher?.documents);

  const popupError = () => toast.error(t('Autorisez les pop-ups pour imprimer.', 'Allow pop-ups to print.', 'Permita las ventanas emergentes para imprimir.'));
  const handlePrintFile = () => {
    const ok = printTeacherFile({
      school, t, teacher, subjects, classNames, docs,
      sectorLabel: (v) => (v ? sectorLabel(v, t) : ''),
    });
    if (!ok) popupError();
  };
  // L'attestation du module RH marche telle quelle : elle ne lit que le nom, la
  // fonction et la date de recrutement — et sait se passer de contrat.
  const handlePrintCertificate = () => {
    const ok = printWorkCertificate({ school, t, staff: teacher, contract: null });
    if (!ok) popupError();
  };

  return (
    <Modal title={t('Dossier de l’enseignant', 'Teacher file', 'Expediente del docente')} onClose={onClose} size="xl">
      <div className="px-6 py-5 space-y-5">

        {/* En-tête : identité + état du compte */}
        <div className="flex items-start gap-4">
          {teacher.photo_url
            ? <img src={teacher.photo_url} alt="" className="w-16 h-16 rounded-full object-cover shrink-0" />
            : <div className="w-16 h-16 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-lg font-bold shrink-0">
                {(teacher.name || '').split(' ').slice(0, 2).map((w) => w[0] || '').join('').toUpperCase()}
              </div>}
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-gray-900 truncate">{teacher.name}</h3>
            <p className="text-sm text-gray-500">
              {teacher.specialty || t('Spécialité non renseignée', 'No specialty on file', 'Sin especialidad')}
              {teacher.matricule ? ` · ${t('Matricule', 'Staff ID', 'Matrícula')} ${teacher.matricule}` : ''}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${teacher.auth_user_id ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {teacher.auth_user_id ? t('Accès actif', 'Access active', 'Acceso activo') : t('Sans accès', 'No access', 'Sin acceso')}
              </span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${teacher.sector ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}>
                {teacher.sector ? sectorLabel(teacher.sector, t) : t('Non affecté', 'Unassigned', 'Sin asignar')}
              </span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${(teacher.can_print_bulletin ?? true) ? 'bg-slate-100 text-slate-600' : 'bg-rose-50 text-rose-700'}`}>
                {(teacher.can_print_bulletin ?? true)
                  ? t('Bulletins autorisés', 'Bulletins allowed', 'Boletines permitidos')
                  : t('Bulletins bloqués', 'Bulletins blocked', 'Boletines bloqueados')}
              </span>
            </div>
          </div>
        </div>

        {/* Identité & contact */}
        <div className="border border-gray-100 rounded-xl p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label={t('Fonction', 'Role', 'Función')} value={teacher.fonction} />
          <Field label={t('Sexe', 'Gender', 'Sexo')} value={teacher.gender} />
          <Field label={t('Recrutement', 'Hire date', 'Contratación')} value={teacher.hire_date} />
          <Field label={t('Téléphone', 'Phone', 'Teléfono')} value={teacher.phone} />
          <Field label={t('Email', 'Email', 'Correo')} value={teacher.email} />
          <Field label={t('Statut', 'Status', 'Estado')} value={teacher.status} />
          <div className="col-span-2 md:col-span-3">
            <Field label={t('Adresse', 'Address', 'Dirección')} value={teacher.address} />
          </div>
        </div>

        {/* Charge pédagogique */}
        <div className="border border-gray-100 rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-2">
            {t('Charge pédagogique', 'Teaching load', 'Carga docente')}
          </div>
          {subjects.length ? (
            <div className="space-y-1">
              {subjects.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-sm border-b border-gray-50 py-1.5 last:border-0">
                  <span className="text-gray-800">{s.name}</span>
                  <span className="text-gray-400 text-xs">{s.className || t('Classe inconnue', 'Unknown class', 'Clase desconocida')}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-amber-600">{t('Aucune matière assignée.', 'No subject assigned.', 'Sin materia asignada.')}</p>
          )}
          {classNames.length > 0 && (
            <p className="text-xs text-gray-500 mt-2">
              {t('Classes couvertes', 'Classes covered', 'Clases cubiertas')} : {classNames.join(', ')}
            </p>
          )}
        </div>

        {/* Pièces jointes */}
        <div className="border border-gray-100 rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-2">
            {t('Pièces du dossier', 'Documents on file', 'Documentos del expediente')}
          </div>
          {docs.length ? (
            <div className="space-y-1.5">
              {docs.map((d, i) => (
                <div key={`${d.url}-${i}`} className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-800 truncate">{d.name}</span>
                  <span className="flex items-center gap-3 shrink-0">
                    <a href={d.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-700 hover:underline">
                      {t('Ouvrir', 'Open', 'Abrir')}
                    </a>
                    <a href={downloadHref(d.url, d.name)} download={d.name} className="text-xs font-semibold text-slate-600 hover:underline">
                      {t('Télécharger', 'Download', 'Descargar')}
                    </a>
                  </span>
                </div>
              ))}
              <p className="text-[11px] text-gray-400 mt-1">
                {t('« Ouvrir » affiche la pièce dans un nouvel onglet, d’où elle s’imprime.',
                   '“Open” shows the file in a new tab, where it can be printed.',
                   '«Abrir» muestra el archivo en otra pestaña, desde donde se imprime.')}
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              {t('Aucune pièce jointe. Les pièces s’ajoutent en modifiant la fiche.',
                 'No document attached. Documents are added by editing the record.',
                 'Sin documentos. Se añaden editando la ficha.')}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          {canManage && (
            <button onClick={onEdit} className="btn-secondary mr-auto">
              {t('Modifier la fiche', 'Edit record', 'Editar ficha')}
            </button>
          )}
          <button onClick={handlePrintCertificate} className="btn-secondary">
            {t('Attestation de travail', 'Certificate of employment', 'Certificado de trabajo')}
          </button>
          <button onClick={handlePrintFile} className="btn-primary">
            {t('Imprimer la fiche', 'Print the file', 'Imprimir la ficha')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
